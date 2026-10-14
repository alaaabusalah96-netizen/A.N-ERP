/**
 * @file verifyPh8Return.ts
 * PH8-RETURN — purchase return against approved GR (InMemory + static UI/API).
 * Run: npx tsx scripts/verifyPh8Return.ts
 */
import fs from 'fs';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { PurchasingService } from '../src/core/purchasing/PurchasingService';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { ApprovalEngine } from '../src/core/engines/ApprovalEngine';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function setup() {
  const st = new InMemoryAdapter();
  const pe = new PostingEngine(st);
  const ne = new NumberingEngine(st);
  const inv = new InventoryService(st, pe, ne);
  const appr = new ApprovalEngine(st);
  const svc = new PurchasingService(st, appr, ne, inv);
  const T = `tpr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  for (const c of [
    { code: '1105', type: 'ASSET' }, { code: '2106', type: 'LIABILITY' }, { code: '5101', type: 'EXPENSE' },
  ] as const) {
    await st.saveAccount(T, { code: c.code, tenantId: T, nameAr: c.code, type: c.type as any, isActive: true, debitBalance: 0, creditBalance: 0, balance: 0 }, `a-${c.code}-${T}`);
  }
  await inv.saveStockAccountingConfig(T, { autoPostEnabled: false }, 'u', `cfg-${T}`);
  const vendor = await st.saveMasterPartner(T, {
    id: `V-${T}`.slice(0, 60), tenantId: T, type: 'VENDOR', nameAr: 'مورد', code: `VN-${T}`.slice(0, 20), isActive: true, createdAt: new Date().toISOString(),
  } as any, `vend-${T}`);
  const wh = await st.saveWarehouse(T, {
    id: `W-${T}`.slice(0, 60), tenantId: T, companyId: T, code: 'W1', nameAr: 'رئيسي', isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString(),
  } as any, `wh-${T}`);
  const item = await inv.saveStockItem(T, {
    id: `IT-${T}`.slice(0, 60), itemCode: `SKU-${T}`.slice(0, 20), nameAr: 'صنف', category: 'X', valuationMethod: 'WEIGHTED_AVERAGE',
    inventoryAccountCode: '1105', cogsAccountCode: '5101',
  } as any, `it-${T}`);
  return { st, inv, svc, T, vendor: vendor.data!, wh: wh.data!, item: item.data! };
}

async function openPoAndReceive(svc: PurchasingService, T: string, vendorId: string, whId: string, itemId: string, qty: number, key: string) {
  const po = await svc.createPurchaseOrder(T, {
    vendorId, createdBy: 'u', idempotencyKey: `po-${key}`,
    lines: [{ itemId, orderedQty: qty, unitCost: 10 }],
  });
  if (!po.success) return { ok: false as const, err: po.error };
  await svc.openPurchaseOrder(T, po.data!.po.id, 'u');
  const gr = await svc.createGoodsReceipt(T, {
    poId: po.data!.po.id, warehouseId: whId, createdBy: 'k', idempotencyKey: `gr-${key}`,
    lines: [{ poLineId: po.data!.lines[0].id, receivedQty: qty }],
  });
  if (!gr.success) return { ok: false as const, err: gr.error };
  return { ok: true as const, po: po.data!, gr: gr.data! };
}

async function main() {
  // Static
  const ui = fs.readFileSync('src/components/PurchasingWorkspaceView.tsx', 'utf8');
  const server = fs.readFileSync('server.ts', 'utf8');
  const svcSrc = fs.readFileSync('src/core/purchasing/PurchasingService.ts', 'utf8');
  check('S1 createPurchaseReturn in service', /createPurchaseReturn/.test(svcSrc));
  check('S2 listPurchaseReturns in service', /listPurchaseReturns/.test(svcSrc));
  check('S3 RETURN_RECEIPT used for vendor return', /returnType:\s*'RETURN_RECEIPT'/.test(svcSrc));
  check('S4 GET /api/purchasing/returns route', /app\.get\('\/api\/purchasing\/returns'/.test(server));
  check('S5 POST /api/purchasing/returns route', /app\.post\('\/api\/purchasing\/returns'/.test(server));
  check('S6 UI tab returns', /id:\s*'returns'/.test(ui) && /مرتجعات المشتريات/.test(ui));
  check('S7 UI fetches returns API', /fetch\('\/api\/purchasing\/returns'/.test(ui));
  check('S8 UI panel activeTab returns', /activeTab === 'returns'/.test(ui));

  // Runtime
  {
    const { svc, T, vendor, wh, item } = await setup();
    const bad = await svc.createPurchaseReturn(T, {
      receiptId: 'missing', lines: [{ itemId: item.id, quantity: 1 }], createdBy: 'u', idempotencyKey: `bad-${T}`,
    });
    check('R1 missing receipt 404', !bad.success && bad.error?.status === 404);
  }
  {
    const { svc, T, vendor, wh, item } = await setup();
    const flow = await openPoAndReceive(svc, T, vendor.id, wh.id, item.id, 10, T);
    check('R2 GR created', flow.ok, flow.ok ? '' : JSON.stringify((flow as any).err));
    if (flow.ok) {
      check('R3 GR APPROVED with stock doc', flow.gr.receipt.status === 'APPROVED' && !!flow.gr.receipt.stockDocumentId, flow.gr.receipt.status);
      const over = await svc.createPurchaseReturn(T, {
        receiptId: flow.gr.receipt.id,
        lines: [{ itemId: item.id, quantity: 99 }],
        createdBy: 'u',
        idempotencyKey: `over-${T}`,
      });
      check('R4 over-qty rejected', !over.success && (over.error?.status === 400 || over.error?.status === 409), String(over.error?.status));
      const ok = await svc.createPurchaseReturn(T, {
        receiptId: flow.gr.receipt.id,
        lines: [{ itemId: item.id, quantity: 4 }],
        createdBy: 'u',
        reason: 'تالف',
        idempotencyKey: `ret-${T}`,
      });
      check('R5 return 4 succeeds', ok.success === true, JSON.stringify(ok.error || {}));
      check('R6 stock doc RETURN_RECEIPT', ok.success && ok.data?.stockDocument?.documentType === 'RETURN_RECEIPT');
      const listed = await svc.listPurchaseReturns(T);
      check('R7 list includes purchase return', listed.success === true && (listed.data || []).length >= 1);
      const po2 = await svc.getPurchaseOrder(T, flow.po.po.id);
      const recv = Number(po2.data?.lines?.[0]?.receivedQty);
      check('R8 PO receivedQty reduced by 4', recv === 6, `recv=${recv}`);
    }
  }
  {
    const { svc, T, vendor, wh, item } = await setup();
    const flow = await openPoAndReceive(svc, T, vendor.id, wh.id, item.id, 5, `${T}-b`);
    if (flow.ok) {
      const r1 = await svc.createPurchaseReturn(T, {
        receiptId: flow.gr.receipt.id, lines: [{ itemId: item.id, quantity: 3 }], createdBy: 'u', idempotencyKey: `r1-${T}`,
      });
      const r2 = await svc.createPurchaseReturn(T, {
        receiptId: flow.gr.receipt.id, lines: [{ itemId: item.id, quantity: 3 }], createdBy: 'u', idempotencyKey: `r2-${T}`,
      });
      check('R9 second return exceeding remaining original stock rejected or partial-safe', r1.success === true && r2.success === false, `r1=${r1.success} r2=${r2.success} ${JSON.stringify(r2.error||{})}`);
    }
  }

  const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
  const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));
  check('R10 package PH8-RETURN DONE', byId['PH8-RETURN']?.status === 'DONE');

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
