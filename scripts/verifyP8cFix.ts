/** Phase 8c-FIX — corrected supplier-invoice journal, cumulative invoicing, duplicate refs, SoD, recovery (InMemory = logic only). */
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { PurchasingService } from '../src/core/purchasing/PurchasingService';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { ApprovalEngine } from '../src/core/engines/ApprovalEngine';
import { AccountingPolicyRegistry } from '../src/core/standards/registries';
import { ROLE_PERMISSION_MATRIX } from '../src/core/auth/PermissionMatrix';
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function setup() {
  const st = new InMemoryAdapter();
  const pe = new PostingEngine(st);
  const ne = new NumberingEngine(st);
  const inv = new InventoryService(st, pe, ne);
  const appr = new ApprovalEngine(st);
  const svc = new PurchasingService(st, appr, ne, inv);
  const T = `t8c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  for (const c of [
    { code: '1105', type: 'ASSET' }, { code: '2106', type: 'LIABILITY' }, { code: '5101', type: 'EXPENSE' },
    { code: '2101', type: 'LIABILITY' }, { code: '1108', type: 'ASSET' }, { code: '5999', type: 'EXPENSE' }, { code: '2150', type: 'LIABILITY' },
  ] as const) {
    await st.saveAccount(T, { code: c.code, tenantId: T, nameAr: c.code, type: c.type as any, isActive: true, debitBalance: 0, creditBalance: 0, balance: 0 }, `a-${c.code}-${T}`);
  }
  await inv.saveStockAccountingConfig(T, { autoPostEnabled: true }, 'u', `cfg-${T}`);
  await st.saveInventorySettings(T, { overReceiptTolerancePct: 5, allowNegativeStock: false, defaultValuationMethod: 'WEIGHTED_AVERAGE' }, 'u', `set-${T}`);
  const vendor = await st.saveMasterPartner(T, {
    id: `V-${T}`.slice(0, 60), tenantId: T, type: 'VENDOR', nameAr: 'مورد', code: `VN-${T}`.slice(0, 20),
    status: 'APPROVED', createdBy: 'u', approvedBy: 'mgr', createdAt: new Date().toISOString(),
  } as any, `vend-${T}`);
  const wh = await st.saveWarehouse(T, {
    id: `W-${T}`.slice(0, 60), tenantId: T, companyId: T, code: 'W1', nameAr: 'رئيسي', isActive: true,
    valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString(),
  } as any, `wh-${T}`);
  const item = await inv.saveStockItem(T, {
    id: `IT-${T}`.slice(0, 60), itemCode: `SKU-${T}`.slice(0, 20), nameAr: 'صنف', category: 'X',
    valuationMethod: 'WEIGHTED_AVERAGE', inventoryAccountCode: '1105', cogsAccountCode: '5101',
  } as any, `it-${T}`);
  return { st, inv, svc, T, vendor: vendor.data!, wh: wh.data!, item: item.data! };
}

async function openPoWithReceipt(ctx: Awaited<ReturnType<typeof setup>>, qty = 10, unitCost = 8) {
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
  const bal = async (ctx: any, c: string) => { const a = (await ctx.st.getAccount(ctx.T, c)).data as any; return { d: Number(a?.debitBalance || 0), c: Number(a?.creditBalance || 0) }; };
  const prof = async (ctx: any, id: string) => { const je = (await ctx.st.getJournalEntry(ctx.T, id)).data as any; return je ? je.lines.map((l: any) => `${l.debit ? 'D' : 'C'}${l.accountCode}:${l.debit || l.credit}`).sort().join('|') : null; };
  const mk = (ctx: any, po: any, ref: string, key: string, qty: number, price: number, extra: any = {}, by = 'acc') =>
    ctx.svc.createSupplierInvoice(ctx.T, { poId: po.po.id, vendorInvoiceRef: ref, createdBy: by, idempotencyKey: `${key}-${ctx.T}`, lines: [{ poLineId: po.lines[0].id, itemId: po.lines[0].itemId, invoicedQty: qty, unitPrice: price }], ...extra });

  // F1: the invoice journal clears GR/IR and books the payable (not inventory again)
  {
    const ctx = await setup(); const { po } = await openPoWithReceipt(ctx, 10, 8);
    const i = await mk(ctx, po, 'VIN-1', 'f1', 10, 8);
    const a = await ctx.svc.approveSupplierInvoice(ctx.T, i.data!.invoice.id, 'cfo', `ap-f1-${ctx.T}`);
    const inv = await bal(ctx, '1105'), grir = await bal(ctx, '2106'), ap = await bal(ctx, '2101');
    check('F1a approved invoice journal = D 2106 (GR/IR) 80 / C 2101 (payable) 80 — no second debit to inventory', a.success && (await prof(ctx, a.data!.journalEntryId!)) === 'C2101:80|D2106:80', a.error?.detail);
    check('F1b balances: inventory stays 80 (receipt only), GR/IR nets to 0 (D80 C80), payable credited 80', inv.d === 80 && grir.d === 80 && grir.c === 80 && ap.c === 80 && ap.d === 0, JSON.stringify({ inv, grir, ap }));
  }
  // F2: tax goes to the VAT-input account, payable carries the total
  {
    const ctx = await setup(); const { po } = await openPoWithReceipt(ctx, 10, 8);
    const i = await mk(ctx, po, 'VIN-2', 'f2', 10, 8, { taxAmount: 11.2 });
    const a = await ctx.svc.approveSupplierInvoice(ctx.T, i.data!.invoice.id, 'cfo', `ap-f2-${ctx.T}`);
    check('F2 with 11.2 tax: D 2106 80 + D 1108 11.2 / C 2101 91.2', a.success && (await prof(ctx, a.data!.journalEntryId!)) === 'C2101:91.2|D1108:11.2|D2106:80', a.error?.detail);
  }
  // F3: price variance needs an explicitly configured account (no default), then posts D/C variance correctly
  {
    const ctx = await setup(); const { po } = await openPoWithReceipt(ctx, 10, 100);
    const i = await mk(ctx, po, 'VIN-3', 'f3', 10, 104);
    const blocked = await ctx.svc.approveSupplierInvoice(ctx.T, i.data!.invoice.id, 'cfo', `ap-f3a-${ctx.T}`);
    const still = (await ctx.svc.getSupplierInvoice(ctx.T, i.data!.invoice.id)).data!.invoice.status;
    check('F3a price variance 40 with no variance account configured: approval blocked (422), invoice NOT posted', blocked.success === false && blocked.error?.status === 422 && /variance-account-missing/.test(blocked.error?.type || '') && still !== 'POSTED', blocked.error?.type);
    await new AccountingPolicyRegistry(ctx.st).setPolicy(ctx.T, 'purchase_price_variance_account_code', '5999', '2020-01-01', 'f3', 'u', `pv-${ctx.T}`);
    const ok = await ctx.svc.approveSupplierInvoice(ctx.T, i.data!.invoice.id, 'cfo', `ap-f3b-${ctx.T}`);
    check('F3b with the variance account configured: D 2106 1000 + D 5999 40 / C 2101 1040', ok.success && (await prof(ctx, ok.data!.journalEntryId!)) === 'C2101:1040|D2106:1000|D5999:40', ok.error?.detail);
    const ctx2 = await setup(); const p2 = await openPoWithReceipt(ctx2, 10, 100);
    await new AccountingPolicyRegistry(ctx2.st).setPolicy(ctx2.T, 'purchase_price_variance_account_code', '5999', '2020-01-01', 'f3', 'u', `pv-${ctx2.T}`);
    const j = await mk(ctx2, p2.po, 'VIN-3N', 'f3n', 10, 97);
    const ok2 = await ctx2.svc.approveSupplierInvoice(ctx2.T, j.data!.invoice.id, 'cfo', `ap-f3n-${ctx2.T}`);
    check('F3c favourable variance (invoice 970 vs PO 1000): D 2106 1000 / C 2101 970 + C 5999 30', ok2.success && (await prof(ctx2, ok2.data!.journalEntryId!)) === 'C2101:970|C5999:30|D2106:1000', ok2.error?.detail);
  }
  // F4: cumulative invoicing — no double invoicing, partial invoices allowed up to the received quantity (+tolerance)
  {
    const ctx = await setup(); const { po } = await openPoWithReceipt(ctx, 10, 8);
    const a = await mk(ctx, po, 'VIN-A', 'f4a', 10, 8);
    await ctx.svc.approveSupplierInvoice(ctx.T, a.data!.invoice.id, 'cfo', `ap-f4a-${ctx.T}`);
    const b = await mk(ctx, po, 'VIN-B', 'f4b', 10, 8);
    const blocked = await ctx.svc.approveSupplierInvoice(ctx.T, b.data!.invoice.id, 'cfo', `ap-f4b-${ctx.T}`);
    check('F4a second invoice for the already-invoiced quantity: match FAILS (cumulative 20 > 10), approval blocked, THREE_WAY details in Arabic', b.data?.match?.passed === false && blocked.success === false && /تراكميًا/.test(b.data?.match?.lines[0]?.detailAr || ''), b.data?.match?.summaryAr);
    check('F4b nothing was posted for the blocked invoice: payable still 80 (one invoice)', (await bal(ctx, '2101')).c === 80);
    const c2 = await setup(); const p2 = await openPoWithReceipt(c2, 10, 8);
    const x = await mk(c2, p2.po, 'P-1', 'f4x', 6, 8), y = await mk(c2, p2.po, 'P-2', 'f4y', 4, 8), z = await mk(c2, p2.po, 'P-3', 'f4z', 1, 8);
    check('F4c partial invoices 6 + 4 both match; a third for 1 more (cumulative 11 > 10.5) fails', x.data?.match?.passed === true && y.data?.match?.passed === true && z.data?.match?.passed === false, `${x.data?.match?.passed},${y.data?.match?.passed},${z.data?.match?.passed}`);
  }
  // F5: duplicate vendor invoice reference
  {
    const ctx = await setup(); const { po } = await openPoWithReceipt(ctx, 10, 8);
    const a = await mk(ctx, po, 'DUP-1', 'f5a', 5, 8);
    const dup = await mk(ctx, po, ' dup-1 ', 'f5b', 5, 8);
    check('F5a same vendor invoice ref (case/space-insensitive) is refused with 409', a.success && dup.success === false && dup.error?.status === 409 && /duplicate-vendor-invoice/.test(dup.error?.type || ''));
    await ctx.svc.rejectSupplierInvoice(ctx.T, a.data!.invoice.id, 'mgr', 'خطأ');
    const again = await mk(ctx, po, 'DUP-1', 'f5c', 5, 8);
    check('F5b after the first is rejected the same reference can be entered again', again.success === true);
    const idem = await mk(ctx, po, 'DUP-1', 'f5c', 5, 8);
    check('F5c replaying the same request (same idempotency key) is not mistaken for a duplicate', idem.success && idem.data!.invoice.id === again.data!.invoice.id);
  }
  // F6: segregation of duties + dedicated permission
  {
    const ctx = await setup(); const { po } = await openPoWithReceipt(ctx, 4, 5);
    const i = await mk(ctx, po, 'SOD', 'f6', 4, 5, {}, 'acc');
    const self = await ctx.svc.approveSupplierInvoice(ctx.T, i.data!.invoice.id, 'acc', `ap-f6a-${ctx.T}`);
    const other = await ctx.svc.approveSupplierInvoice(ctx.T, i.data!.invoice.id, 'cfo', `ap-f6b-${ctx.T}`);
    check('F6a the creator cannot approve their own invoice (403 sod-violation); another user can', self.success === false && self.error?.status === 403 && other.success === true);
    const replay = await ctx.svc.approveSupplierInvoice(ctx.T, i.data!.invoice.id, 'acc', `ap-f6c-${ctx.T}`);
    check('F6b re-approving an already posted invoice is an idempotent success (no second journal)', replay.success && replay.data!.journalEntryId === other.data!.journalEntryId);
    const has = (r: string) => ROLE_PERMISSION_MATRIX[r]?.has('SUPPLIER_INVOICE_APPROVE' as any);
    const srv = fs.readFileSync('server.ts', 'utf8');
    check('F6c SUPPLIER_INVOICE_APPROVE: admin and financial_approver have it; accountant and warehouse_manager (who keep PURCHASE_MANAGE) do not; approve/reject routes require it, create/match still PURCHASE_MANAGE',
      !!has('admin') && !!has('financial_approver') && !has('accountant') && !has('warehouse_manager')
      && /invoices\/:id\/approve', requireAuth, requirePermission\('SUPPLIER_INVOICE_APPROVE'\)/.test(srv) && /invoices\/:id\/reject', requireAuth, requirePermission\('SUPPLIER_INVOICE_APPROVE'\)/.test(srv)
      && /invoices', requireAuth, requirePermission\('PURCHASE_MANAGE'\)/.test(srv) && /invoices\/:id\/match', requireAuth, requirePermission\('PURCHASE_MANAGE'\)/.test(srv));
  }
  // F7: configured payable account + account validation fails closed
  {
    const ctx = await setup(); const { po } = await openPoWithReceipt(ctx, 10, 8);
    await new AccountingPolicyRegistry(ctx.st).setPolicy(ctx.T, 'ap_account_code', '2150', '2020-01-01', 'f7', 'u', `ap-${ctx.T}`);
    const i = await mk(ctx, po, 'CFG', 'f7', 10, 8);
    const a = await ctx.svc.approveSupplierInvoice(ctx.T, i.data!.invoice.id, 'cfo', `ap-f7-${ctx.T}`);
    check('F7a the payable account comes from the company policy (2150), not from code', a.success && (await prof(ctx, a.data!.journalEntryId!)) === 'C2150:80|D2106:80');
    const c2 = await setup(); const p2 = await openPoWithReceipt(c2, 10, 8);
    await new AccountingPolicyRegistry(c2.st).setPolicy(c2.T, 'ap_account_code', '9999', '2020-01-01', 'f7', 'u', `ap2-${c2.T}`);
    const j = await mk(c2, p2.po, 'BAD', 'f7b', 10, 8);
    const r = await c2.svc.approveSupplierInvoice(c2.T, j.data!.invoice.id, 'cfo', `ap-f7b-${c2.T}`);
    check('F7b a configured account that does not exist in the chart blocks approval (422 account-not-usable); nothing posted', r.success === false && r.error?.status === 422 && /account-not-usable/.test(r.error?.type || '') && (await bal(c2, '2101')).c === 0);
  }
  // F8: recovery — journal posted but the invoice update failed: retry completes without a second journal
  {
    const ctx = await setup(); const { po } = await openPoWithReceipt(ctx, 10, 8);
    const i = await mk(ctx, po, 'RECOV', 'f8', 10, 8);
    const orig = ctx.st.updateSupplierInvoice.bind(ctx.st); let failNext = false;
    (ctx.st as any).updateSupplierInvoice = async (t: string, inv: any) => (failNext && inv.status === 'POSTED') ? ({ success: false, error: { type: 'x', title: 'x', status: 500, detail: 'injected' } }) : orig(t, inv);
    failNext = true;
    const first = await ctx.svc.approveSupplierInvoice(ctx.T, i.data!.invoice.id, 'cfo', `ap-f8a-${ctx.T}`);
    failNext = false;
    const second = await ctx.svc.approveSupplierInvoice(ctx.T, i.data!.invoice.id, 'cfo', `ap-f8b-${ctx.T}`);
    check('F8 invoice update fails after posting (injected): first call reports it, a retry with a NEW idempotency key finishes the invoice and the payable is credited exactly once (80)', first.success === false && /invoice-update-failed/.test(first.error?.type || '') && second.success === true && second.data!.invoice.status === 'POSTED' && (await bal(ctx, '2101')).c === 80, `${first.error?.type} ${second.error?.detail}`);
  }
  // F9: posting goes through PostingEngine only
  {
    const src = fs.readFileSync('src/core/purchasing/PurchasingService.ts', 'utf8');
    const m = src.slice(src.indexOf('public async approveSupplierInvoice('), src.indexOf('public async rejectSupplierInvoice('));
    check('F9 approveSupplierInvoice posts only through PostingEngine (no direct storage createJournalEntry/postJournalEntry, no hard-coded 1105/2106/2101 in the method)', /posting\.draftEntry/.test(m) && /posting\.postEntry/.test(m) && !/storage\.(createJournalEntry|postJournalEntry)/.test(m) && !/'(1105|2106|2101)'\s*,\s*debit|accountCode:\s*'(1105|2106)'/.test(m.replace("'ap_account_code', invoice.invoiceDate, '2101'", '')));
  }
  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
    const rej = await ctx.svc.rejectSupplierInvoice(ctx.T, inv.data!.invoice.id, 'mgr', 'خطأ في المرجع');
    check('5. reject invoice', rej.success && rej.data?.status === 'REJECTED');
  }

  // 6) empty invoice rejected
  {
    const ctx = await setup();
    const { po } = await openPoWithReceipt(ctx, 2, 1);
    const inv = await ctx.svc.createSupplierInvoice(ctx.T, {
      poId: po.po.id, vendorInvoiceRef: 'X', createdBy: 'a', lines: [], idempotencyKey: `inv6-${ctx.T}`,
    });
    check('6. empty invoice 400', inv.success === false && inv.error?.status === 400);
  }

  // 7) tenant isolation
  {
    const a = await setup();
    const b = await setup();
    const { po } = await openPoWithReceipt(a, 3, 2);
    const inv = await a.svc.createSupplierInvoice(a.T, {
      poId: po.po.id, vendorInvoiceRef: 'ISO', createdBy: 'a', idempotencyKey: `inv7-${a.T}`,
      lines: [{ poLineId: po.lines[0].id, itemId: po.lines[0].itemId, invoicedQty: 3, unitPrice: 2 }],
    });
    const cross = await b.svc.getSupplierInvoice(b.T, inv.data!.invoice.id);
    check('7. cross-tenant null', cross.success && cross.data === null);
  }

  // 8) idempotency
  {
    const ctx = await setup();
    const { po } = await openPoWithReceipt(ctx, 4, 2);
    const key = `inv-idemp-${ctx.T}`;
    const body = {
      poId: po.po.id, vendorInvoiceRef: 'IDP', createdBy: 'a', idempotencyKey: key,
      lines: [{ poLineId: po.lines[0].id, itemId: po.lines[0].itemId, invoicedQty: 4, unitPrice: 2 }],
    };
    const x = await ctx.svc.createSupplierInvoice(ctx.T, body);
    const y = await ctx.svc.createSupplierInvoice(ctx.T, body);
    check('8. invoice idempotency', x.success && y.success && x.data!.invoice.id === y.data!.invoice.id);
  }

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });

===== END FILE: .phase_tmp/p8cfix_new1_03.part =====
# (No content was provided for this part by the user in the prompt - this is just a placeholder to avoid breaking the join script.)
