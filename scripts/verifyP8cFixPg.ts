/**
 * @file verifyP8cFixPg.ts
 * @description Phase 8c-FIX — REAL PostgreSQL gate. Needs DATABASE_URL, otherwise prints PG_NOT_RUN and exits 3.
 * Proves on PostgreSQL: corrected supplier-invoice journal and balances, cumulative-invoicing block, the DB unique index for vendor
 * invoice refs under 6 parallel creates, segregation of duties, retry after a failed invoice update, and one journal under 6 parallel approvals.
 * Run:  npx tsx scripts/verifyP8cFixPg.ts | tee evidence/phase-8c/battery-output-fix-pg.txt
 */
import dotenv from 'dotenv';
dotenv.config();
import { createTempTenant } from './lib/testTenant';
import { PurchasingService } from '../src/core/purchasing/PurchasingService';
import { ApprovalEngine } from '../src/core/engines/ApprovalEngine';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => { if (cond) { pass++; console.log(`[PASS] ${label}`); } else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); } };

async function mkCtx() {
  const tt = await createTempTenant({ seedChart: true });
  const st: any = tt.storage, T = tt.tenantId, inv = tt.services.inventory;
  const svc = new PurchasingService(st, new ApprovalEngine(st), tt.services.numbering, inv);
  await inv.saveStockAccountingConfig(T, { autoPostEnabled: true }, 'u', `cfg-${T}`);
  await st.saveInventorySettings(T, { overReceiptTolerancePct: 5, allowNegativeStock: false, defaultValuationMethod: 'WEIGHTED_AVERAGE' }, 'u', `set-${T}`);
  const vendor = await st.saveMasterPartner(T, { id: `V-${T}`.slice(0, 60), tenantId: T, type: 'VENDOR', nameAr: 'مورد', code: `VN-${T}`.slice(0, 20), status: 'APPROVED', createdBy: 'u', approvedBy: 'mgr', createdAt: new Date().toISOString() } as any, `vend-${T}`);
  const wh = await st.saveWarehouse(T, { id: `W-${T}`.slice(0, 60), tenantId: T, companyId: T, code: 'W1', nameAr: 'رئيسي', isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString() } as any, `wh-${T}`);
  const item = await inv.saveStockItem(T, { id: `IT-${T}`.slice(0, 60), itemCode: `SKU-${T}`.slice(0, 20), nameAr: 'صنف', category: 'X', valuationMethod: 'WEIGHTED_AVERAGE', inventoryAccountCode: '1105', cogsAccountCode: '5101' } as any, `it-${T}`);
  return { tt, st, inv, svc, T, vendor: vendor.data!, wh: wh.data!, item: item.data! };
}
async function openPoWithReceipt(ctx: any, qty = 10, unitCost = 8) {
  const { svc, T, vendor, wh, item } = ctx;
  const po = await svc.createPurchaseOrder(T, {
    vendorId: vendor.id, createdBy: 'buyer', idempotencyKey: `po-${T}-${qty}`,
    lines: [{ itemId: item.id, orderedQty: qty, unitCost }],
  });
  await svc.openPurchaseOrder(T, po.data!.po.id, 'buyer');
  const gr = await svc.createGoodsReceipt(T, {
    poId: po.data!.po.id, warehouseId: wh.id, createdBy: 'wh', idempotencyKey: `gr-${T}-${qty}`,
    lines: [{ poLineId: po.data!.lines[0].id, receivedQty: qty }],
  });
  // approve if needed
  if (gr.data?.receipt.status === 'IN_APPROVAL') {
    await svc.approveReceipt(T, gr.data!.receipt.id, 'mgr', 'warehouse_manager', `apr-${T}-${qty}`);
  } else if (gr.data?.mode === 'DIRECT' || gr.data?.receipt.status === 'APPROVED') {
    // already posted path
  } else {
    await svc.approveReceipt(T, gr.data!.receipt.id, 'mgr', 'warehouse_manager', `apr-${T}-${qty}`).catch(() => null);
  }
  // ensure received qty on PO
  const po2 = await svc.getPurchaseOrder(T, po.data!.po.id);
  return { po: po2.data || po.data!, gr: gr.data! };
}


async function main() {
  if (!process.env.DATABASE_URL) { console.log('PG_NOT_RUN: DATABASE_URL missing. 8c-FIX is NOT closed.'); process.exit(3); }
  let ctx: any;
  try { ctx = await mkCtx(); } catch (e: any) { console.log(`PG_NOT_RUN: ${e.message}. 8c-FIX is NOT closed.`); process.exit(3); }
  const { st, svc, T } = ctx;
  const q = async (sql: string, p: any[]) => (await st.pool.query(sql, p)).rows;
  const bal = async (c: string) => { const a = (await st.getAccount(T, c)).data as any; return { d: Number(a?.debitBalance || 0), c: Number(a?.creditBalance || 0) }; };
  const mk = (po: any, ref: string, key: string, qty: number, price: number, by = 'acc') => svc.createSupplierInvoice(T, { poId: po.po.id, vendorInvoiceRef: ref, createdBy: by, idempotencyKey: `${key}-${T}`, lines: [{ poLineId: po.lines[0].id, itemId: po.lines[0].itemId, invoicedQty: qty, unitPrice: price }] });
  try {
    check('PG0 initializeSchema ran and the vendor-ref unique index exists (if this fails, pre-existing duplicate vendor invoice refs blocked its creation)', (await q(`SELECT 1 FROM pg_indexes WHERE indexname = 'uq_an_supplier_invoice_vendor_ref'`, [])).length === 1);
    const { po } = await openPoWithReceipt(ctx, 10, 8);
    const before = { inv: await bal('1105'), grir: await bal('2106'), ap: await bal('2101') };
    const i1 = await mk(po, 'PG-VIN-1', 'pg1', 10, 8);
    const a1 = await svc.approveSupplierInvoice(T, i1.data!.invoice.id, 'cfo', `pg-ap1-${T}`);
    const after = { inv: await bal('1105'), grir: await bal('2106'), ap: await bal('2101') };
    const lines = await q(`SELECT account_code, debit, credit FROM an_journal_lines WHERE tenant_id=$1 AND entry_id=$2 ORDER BY account_code`, [T, a1.data?.journalEntryId]);
    check('PG1 corrected journal on PostgreSQL: D 2106 80 / C 2101 80 (two rows), payable +80, inventory unchanged by the invoice, GR/IR debited by 80',
      a1.success === true && lines.length === 2 && lines.some((l: any) => l.account_code === '2106' && Number(l.debit) === 80) && lines.some((l: any) => l.account_code === '2101' && Number(l.credit) === 80)
      && after.ap.c - before.ap.c === 80 && after.inv.d === before.inv.d && after.grir.d - before.grir.d === 80, JSON.stringify({ before, after, lines }));
    const i2 = await mk(po, 'PG-VIN-2', 'pg2', 10, 8);
    const blocked = await svc.approveSupplierInvoice(T, i2.data!.invoice.id, 'cfo', `pg-ap2-${T}`);
    check('PG2 double invoicing on PostgreSQL: a second invoice for the same quantity fails the match and is not posted (payable still +80 only)', i2.data?.match?.passed === false && blocked.success === false && (await bal('2101')).c - before.ap.c === 80);
    const sodPo = await openPoWithReceipt(ctx, 2, 8);
    const sodInv = await mk(sodPo.po, 'PG-SOD', 'pg3', 2, 8);
    const self = await svc.approveSupplierInvoice(T, sodInv.data!.invoice.id, 'acc', `pg-ap3-${T}`);
    check('PG3 segregation of duties on PostgreSQL: the creator cannot approve their own invoice (403 sod-violation) and nothing is posted', sodInv.success === true && self.success === false && self.error?.status === 403 && /sod-violation/.test(self.error?.type || ''), self.error?.type);
    // race: 6 parallel creates with the same vendor ref but different idempotency keys
    const c2 = await mkCtx();
    try {
      const { po: po2 } = await openPoWithReceipt(c2, 12, 5);
      const rs = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => c2.svc.createSupplierInvoice(c2.T, { poId: po2.po.id, vendorInvoiceRef: 'RACE-REF', createdBy: 'acc', idempotencyKey: `race-${n}-${c2.T}`, lines: [{ poLineId: po2.lines[0].id, itemId: po2.lines[0].itemId, invoicedQty: 1, unitPrice: 5 }] })));
      const rows = (await c2.st.pool.query(`SELECT count(*)::int AS n FROM an_supplier_invoices WHERE tenant_id=$1 AND lower(btrim(vendor_invoice_ref))='race-ref'`, [c2.T])).rows[0].n;
      check('PG4 race: 6 parallel creates of the same vendor invoice ref leave exactly ONE invoice row; the others get a clean 409 (no 5xx)', rows === 1 && rs.filter((r: any) => r.success).length === 1 && rs.every((r: any) => r.success || r.error?.status === 409), `rows=${rows} statuses=${rs.map((r: any) => r.success ? 200 : r.error?.status).join(',')}`);
      // race: 6 parallel approvals of one invoice => one journal, payable credited once
      const ok = await c2.svc.createSupplierInvoice(c2.T, { poId: po2.po.id, vendorInvoiceRef: 'APPROVE-RACE', createdBy: 'acc', idempotencyKey: `okinv-${c2.T}`, lines: [{ poLineId: po2.lines[0].id, itemId: po2.lines[0].itemId, invoicedQty: 4, unitPrice: 5 }] });
      const bal2 = async (c: string) => { const a = (await c2.st.getAccount(c2.T, c)).data as any; return Number(a?.creditBalance || 0); };
      const apBefore = await bal2('2101');
      const ar = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => c2.svc.approveSupplierInvoice(c2.T, ok.data!.invoice.id, 'cfo', `par-${n}-${c2.T}`)));
      const jeN = (await c2.st.pool.query(`SELECT count(*)::int AS n FROM an_journal_entries WHERE tenant_id=$1 AND id=$2`, [c2.T, `je-sinv-${ok.data!.invoice.id}`.slice(0, 60)])).rows[0].n;
      const finalInv = (await c2.svc.getSupplierInvoice(c2.T, ok.data!.invoice.id)).data!.invoice;
      check('PG5 race: 6 parallel approvals of one invoice leave ONE journal, invoice POSTED, payable credited once (+20); every caller succeeded or got a clean 4xx (no 5xx)',
        jeN === 1 && finalInv.status === 'POSTED' && (await bal2('2101')) - apBefore === 20 && ar.every((r: any) => r.success || (r.error?.status >= 400 && r.error?.status < 500)), `je=${jeN} status=${finalInv.status} statuses=${ar.map((r: any) => r.success ? 200 : r.error?.status).join(',')}`);
      // recovery after a failed invoice update
      const rec = await c2.svc.createSupplierInvoice(c2.T, { poId: po2.po.id, vendorInvoiceRef: 'RECOVER', createdBy: 'acc', idempotencyKey: `rec-${c2.T}`, lines: [{ poLineId: po2.lines[0].id, itemId: po2.lines[0].itemId, invoicedQty: 3, unitPrice: 5 }] });
      const orig = c2.st.updateSupplierInvoice.bind(c2.st); let failNext = true;
      c2.st.updateSupplierInvoice = async (t: string, inv: any) => (failNext && inv.status === 'POSTED') ? ({ success: false, error: { type: 'x', title: 'x', status: 500, detail: 'injected' } }) : orig(t, inv);
      const apB = await bal2('2101');
      const f1 = await c2.svc.approveSupplierInvoice(c2.T, rec.data!.invoice.id, 'cfo', `rec-a-${c2.T}`); failNext = false;
      const f2 = await c2.svc.approveSupplierInvoice(c2.T, rec.data!.invoice.id, 'cfo', `rec-b-${c2.T}`);
      check('PG6 recovery on PostgreSQL: update failure after posting is reported; a retry with a new key finishes the invoice and the payable moves once (+15)', f1.success === false && f2.success === true && f2.data!.invoice.status === 'POSTED' && (await bal2('2101')) - apB === 15, `${f1.error?.type} ${f2.error?.detail}`);
    } finally { await c2.tt.cleanup(); }
  } finally { await ctx.tt.cleanup(); }
  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
