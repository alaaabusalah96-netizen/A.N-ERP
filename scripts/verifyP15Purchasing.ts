/** Phase 15 PO-001 — InMemory suite */
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { PurchasingService } from '../src/core/purchasing/PurchasingService';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { ApprovalEngine } from '../src/core/engines/ApprovalEngine';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};
const near = (a: number, b: number, e = 0.05) => Math.abs(Number(a) - Number(b)) <= e;

async function setup() {
  const st = new InMemoryAdapter();
  const pe = new PostingEngine(st);
  const ne = new NumberingEngine(st);
  const inv = new InventoryService(st, pe, ne);
  const appr = new ApprovalEngine(st);
  const svc = new PurchasingService(st, appr, ne, inv);
  const T = `t15-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  // accounts for phase 14 journals
  for (const c of [
    { code: '1105', type: 'ASSET' }, { code: '2106', type: 'LIABILITY' }, { code: '5101', type: 'EXPENSE' }, { code: '1109', type: 'ASSET' },
  ] as const) {
    await st.saveAccount(T, { code: c.code, tenantId: T, nameAr: c.code, type: c.type as any, isActive: true, debitBalance: 0, creditBalance: 0, balance: 0 }, `a-${c.code}-${T}`);
  }
  await inv.saveStockAccountingConfig(T, { autoPostEnabled: true }, 'u', `cfg-${T}`);
  const vendor = await st.saveMasterPartner(T, {
    id: `V-${T}`.slice(0, 60), tenantId: T, type: 'VENDOR', nameAr: 'مورد تجريبي', code: `VN-${T}`.slice(0, 20), isActive: true, createdAt: new Date().toISOString(),
  } as any, `vend-${T}`);
  const wh = await st.saveWarehouse(T, {
    id: `W-${T}`.slice(0, 60), tenantId: T, companyId: T, code: 'W1', nameAr: 'رئيسي', isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString(),
  } as any, `wh-${T}`);
  const item = await inv.saveStockItem(T, {
    id: `IT-${T}`.slice(0, 60), itemCode: `SKU-${T}`.slice(0, 20), nameAr: 'صنف', category: 'X', valuationMethod: 'WEIGHTED_AVERAGE',
    inventoryAccountCode: '1105', cogsAccountCode: '5101',
  } as any, `it-${T}`);
  return { st, pe, inv, appr, svc, T, vendor: vendor.data!, wh: wh.data!, item: item.data! };
}

async function main() {
  // (أ) DIRECT receipt
  {
    const { st, svc, inv, T, vendor, wh, item } = await setup();
    const po = await svc.createPurchaseOrder(T, {
      vendorId: vendor.id, createdBy: 'buyer', idempotencyKey: `po-a-${T}`,
      lines: [{ itemId: item.id, orderedQty: 100, unitCost: 10 }],
    });
    check('(أ) create PO', po.success, po.error?.detail || '');
    const opened = await svc.openPurchaseOrder(T, po.data!.po.id, 'buyer');
    check('(أ) open PO', opened.success && opened.data?.status === 'OPEN');
    const gr = await svc.createGoodsReceipt(T, {
      poId: po.data!.po.id, warehouseId: wh.id, createdBy: 'keeper', idempotencyKey: `gr-a-${T}`,
      lines: [{ poLineId: po.data!.lines[0].id, receivedQty: 100 }],
    });
    check('(أ) DIRECT receipt APPROVED', gr.success && gr.data?.mode === 'DIRECT' && gr.data.receipt.status === 'APPROVED', gr.error?.detail || '');
    const bal = await st.getWarehouseStock(T, wh.id, item.id);
    check('(أ) stock qty 100', bal.success && near(bal.data?.currentQty || 0, 100), `qty=${bal.data?.currentQty}`);
    const po2 = await svc.getPurchaseOrder(T, po.data!.po.id);
    check('(أ) PO RECEIVED + received_qty 100', po2.data?.po.status === 'RECEIVED' && near(po2.data!.lines[0].receivedQty, 100));
    const jes = ((await st.listJournalEntries(T)).data || []).filter((e) => e.status === 'POSTED');
    check('(أ) journal posted', jes.length >= 1);
  }

  // (ح) validation errors
  {
    const { svc, T, wh, item } = await setup();
    const badV = await svc.createPurchaseOrder(T, {
      vendorId: 'NO-VENDOR', createdBy: 'u', idempotencyKey: `bad-v-${T}`,
      lines: [{ itemId: item.id, orderedQty: 10, unitCost: 1 }],
    });
    check('(ح) unknown vendor 404', !badV.success && badV.error?.status === 404);
    const badI = await svc.createPurchaseOrder(T, {
      vendorId: (await setup()).vendor.id, createdBy: 'u', idempotencyKey: `bad-i-${T}`,
      lines: [{ itemId: 'NO-ITEM', orderedQty: 10, unitCost: 1 }],
    });
    // vendor from other tenant-ish - recreate with same T
    const { svc: svc2, T: T2, vendor: v2, item: it2, wh: w2 } = await setup();
    const zero = await svc2.createPurchaseOrder(T2, {
      vendorId: v2.id, createdBy: 'u', idempotencyKey: `z-${T2}`,
      lines: [{ itemId: it2.id, orderedQty: 0, unitCost: 1 }],
    });
    check('(ح) zero qty rejected', !zero.success);
    const draftPo = await svc2.createPurchaseOrder(T2, {
      vendorId: v2.id, createdBy: 'u', idempotencyKey: `d-${T2}`,
      lines: [{ itemId: it2.id, orderedQty: 5, unitCost: 2 }],
    });
    const grDraft = await svc2.createGoodsReceipt(T2, {
      poId: draftPo.data!.po.id, warehouseId: w2.id, createdBy: 'k', idempotencyKey: `grd-${T2}`,
      lines: [{ poLineId: draftPo.data!.lines[0].id, receivedQty: 5 }],
    });
    check('(ح) receipt on DRAFT rejected', !grDraft.success && grDraft.error?.status === 422);
  }

  // (د) partial then full
  {
    const { st, svc, T, vendor, wh, item } = await setup();
    const po = await svc.createPurchaseOrder(T, {
      vendorId: vendor.id, createdBy: 'u', idempotencyKey: `po-d-${T}`,
      lines: [{ itemId: item.id, orderedQty: 100, unitCost: 10 }],
    });
    await svc.openPurchaseOrder(T, po.data!.po.id, 'u');
    const g1 = await svc.createGoodsReceipt(T, {
      poId: po.data!.po.id, warehouseId: wh.id, createdBy: 'k', idempotencyKey: `g1-${T}`,
      lines: [{ poLineId: po.data!.lines[0].id, receivedQty: 60 }],
    });
    check('(د) first 60 ok', g1.success);
    const mid = await svc.getPurchaseOrder(T, po.data!.po.id);
    check('(د) PARTIALLY_RECEIVED', mid.data?.po.status === 'PARTIALLY_RECEIVED');
    const g2 = await svc.createGoodsReceipt(T, {
      poId: po.data!.po.id, warehouseId: wh.id, createdBy: 'k', idempotencyKey: `g2-${T}`,
      lines: [{ poLineId: po.data!.lines[0].id, receivedQty: 40 }],
    });
    check('(د) rest 40 ok', g2.success);
    const done = await svc.getPurchaseOrder(T, po.data!.po.id);
    check('(د) RECEIVED', done.data?.po.status === 'RECEIVED');
    const over = await svc.createGoodsReceipt(T, {
      poId: po.data!.po.id, warehouseId: wh.id, createdBy: 'k', idempotencyKey: `g3-${T}`,
      lines: [{ poLineId: po.data!.lines[0].id, receivedQty: 1 }],
    });
    check('(د) over-receipt 422', !over.success && over.error?.status === 422);
  }

  // (هـ) tolerance 5%
  {
    const { st, svc, inv, T, vendor, wh, item } = await setup();
    await inv.saveInventorySettings(T, { overReceiptTolerancePct: 5 }, 'u', `tol-${T}`);
    const po = await svc.createPurchaseOrder(T, {
      vendorId: vendor.id, createdBy: 'u', idempotencyKey: `po-e-${T}`,
      lines: [{ itemId: item.id, orderedQty: 100, unitCost: 10 }],
    });
    await svc.openPurchaseOrder(T, po.data!.po.id, 'u');
    const ok = await svc.createGoodsReceipt(T, {
      poId: po.data!.po.id, warehouseId: wh.id, createdBy: 'k', idempotencyKey: `ge-ok-${T}`,
      lines: [{ poLineId: po.data!.lines[0].id, receivedQty: 105 }],
    });
    check('(هـ) +5% allowed', ok.success, ok.error?.detail || '');
    const { svc: svc2, T: T2, vendor: v2, wh: w2, item: it2, inv: inv2 } = await setup();
    await inv2.saveInventorySettings(T2, { overReceiptTolerancePct: 5 }, 'u', `tol2-${T2}`);
    const po2 = await svc2.createPurchaseOrder(T2, {
      vendorId: v2.id, createdBy: 'u', idempotencyKey: `po-e2-${T2}`,
      lines: [{ itemId: it2.id, orderedQty: 100, unitCost: 10 }],
    });
    await svc2.openPurchaseOrder(T2, po2.data!.po.id, 'u');
    const bad = await svc2.createGoodsReceipt(T2, {
      poId: po2.data!.po.id, warehouseId: w2.id, createdBy: 'k', idempotencyKey: `ge-bad-${T2}`,
      lines: [{ poLineId: po2.data!.lines[0].id, receivedQty: 106 }],
    });
    check('(هـ) +6% rejected', !bad.success && bad.error?.status === 422);
  }

  // (ب) STEPS policy — no stock until final approve
  {
    const { st, svc, appr, T, vendor, wh, item } = await setup();
    await st.saveApprovalPolicy(T, {
      id: `pol-${T}`, tenantId: T, documentType: 'GOODS_RECEIPT_SUPPLIER', mode: 'STEPS', isActive: true,
      enforceDistinctApprovers: true, version: 1, updatedBy: 'u', updatedAt: new Date().toISOString(),
      steps: [
        { label: 'وصول', approverType: 'ROLE', approverRef: 'warehouse_keeper', stepKind: 'ARRIVAL_CONFIRM' },
        { label: 'فحص', approverType: 'ROLE', approverRef: 'warehouse_manager', stepKind: 'TECHNICAL_INSPECTION' },
      ],
    } as any, `pol-${T}`);
    const po = await svc.createPurchaseOrder(T, {
      vendorId: vendor.id, createdBy: 'u', idempotencyKey: `po-b-${T}`,
      lines: [{ itemId: item.id, orderedQty: 50, unitCost: 8 }],
    });
    await svc.openPurchaseOrder(T, po.data!.po.id, 'u');
    const gr = await svc.createGoodsReceipt(T, {
      poId: po.data!.po.id, warehouseId: wh.id, createdBy: 'keeper1', idempotencyKey: `gr-b-${T}`,
      lines: [{ poLineId: po.data!.lines[0].id, receivedQty: 50 }],
    });
    check('(ب) STEPS → IN_APPROVAL', gr.success && gr.data?.mode === 'STEPS' && gr.data.receipt.status === 'IN_APPROVAL', gr.error?.detail || '');
    const bal0 = await st.getWarehouseStock(T, wh.id, item.id);
    check('(ب) stock still 0', !bal0.data || near(bal0.data.currentQty || 0, 0));
    const a1 = await svc.approveReceipt(T, gr.data!.receipt.id, 'keeper2', 'warehouse_keeper', `a1-${T}`);
    check('(ب) step1 approve', a1.success, a1.error?.detail || '');
    const a2 = await svc.approveReceipt(T, gr.data!.receipt.id, 'mgr1', 'warehouse_manager', `a2-${T}`);
    check('(ب) final approve posts stock', a2.success && a2.data?.receipt.status === 'APPROVED', a2.error?.detail || '');
    const bal1 = await st.getWarehouseStock(T, wh.id, item.id);
    check('(ب) stock 50 after final', near(bal1.data?.currentQty || 0, 50), `qty=${bal1.data?.currentQty}`);
  }

  // (ج) technical rejection → RETURNED_TO_SUPPLIER
  {
    const { st, svc, appr, T, vendor, wh, item } = await setup();
    await st.saveApprovalPolicy(T, {
      id: `pol-c-${T}`, tenantId: T, documentType: 'GOODS_RECEIPT_SUPPLIER', mode: 'STEPS', isActive: true,
      enforceDistinctApprovers: false, version: 1, updatedBy: 'u', updatedAt: new Date().toISOString(),
      steps: [
        { label: 'فحص فني', approverType: 'ROLE', approverRef: 'warehouse_manager', stepKind: 'TECHNICAL_INSPECTION' },
      ],
    } as any, `pol-c-${T}`);
    const po = await svc.createPurchaseOrder(T, {
      vendorId: vendor.id, createdBy: 'u', idempotencyKey: `po-c-${T}`,
      lines: [{ itemId: item.id, orderedQty: 20, unitCost: 5 }],
    });
    await svc.openPurchaseOrder(T, po.data!.po.id, 'u');
    const gr = await svc.createGoodsReceipt(T, {
      poId: po.data!.po.id, warehouseId: wh.id, createdBy: 'k', idempotencyKey: `gr-c-${T}`,
      lines: [{ poLineId: po.data!.lines[0].id, receivedQty: 20 }],
    });
    const rej = await svc.rejectReceipt(T, gr.data!.receipt.id, 'mgr', 'warehouse_manager', 'تالف', `rej-${T}`);
    check('(ج) RETURNED_TO_SUPPLIER', rej.success && rej.data?.receipt.status === 'RETURNED_TO_SUPPLIER', rej.error?.detail || '');
    const po2 = await svc.getPurchaseOrder(T, po.data!.po.id);
    check('(ج) rejected_qty increased', near(po2.data!.lines[0].rejectedQty, 20));
    const bal = await st.getWarehouseStock(T, wh.id, item.id);
    check('(ج) no stock impact', !bal.data || near(bal.data.currentQty || 0, 0));
  }

  // (ي) tenant isolation
  {
    const a = await setup();
    const b = await setup();
    const po = await a.svc.createPurchaseOrder(a.T, {
      vendorId: a.vendor.id, createdBy: 'u', idempotencyKey: `po-y-${a.T}`,
      lines: [{ itemId: a.item.id, orderedQty: 10, unitCost: 1 }],
    });
    const cross = await b.svc.getPurchaseOrder(b.T, po.data!.po.id);
    check('(ي) cross-tenant get → null', cross.success && cross.data === null);
  }

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
