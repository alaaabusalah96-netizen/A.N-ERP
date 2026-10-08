/** Phase 8c — Supplier Invoice + Three-Way Matching (InMemory) */
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
  // 1) match success + post
  {
    const ctx = await setup();
    const { po } = await openPoWithReceipt(ctx, 10, 8);
    const inv = await ctx.svc.createSupplierInvoice(ctx.T, {
      poId: po.po.id, vendorInvoiceRef: 'VIN-100', createdBy: 'acc', idempotencyKey: `inv1-${ctx.T}`,
      lines: [{ poLineId: po.lines[0].id, itemId: po.lines[0].itemId, invoicedQty: 10, unitPrice: 8 }],
    });
    check('1a. invoice created', inv.success === true, inv.error?.detail);
    check('1b. match passed', inv.data?.match?.passed === true, inv.data?.match?.summaryAr);
    check('1c. status MATCHED', inv.data?.invoice.status === 'MATCHED');
    const apr = await ctx.svc.approveSupplierInvoice(ctx.T, inv.data!.invoice.id, 'cfo', `apr-inv-${ctx.T}`);
    check('1d. approve+post', apr.success === true && apr.data?.invoice.status === 'POSTED', apr.error?.detail);
    check('1e. journal id set', !!apr.data?.journalEntryId);
  }

  // 2) qty over receipt → match fail
  {
    const ctx = await setup();
    const { po } = await openPoWithReceipt(ctx, 10, 5);
    const inv = await ctx.svc.createSupplierInvoice(ctx.T, {
      poId: po.po.id, vendorInvoiceRef: 'VIN-OVER', createdBy: 'acc', idempotencyKey: `inv2-${ctx.T}`,
      lines: [{ poLineId: po.lines[0].id, itemId: po.lines[0].itemId, invoicedQty: 20, unitPrice: 5 }],
    });
    check('2a. match failed on qty', inv.success && inv.data?.match?.passed === false);
    check('2b. status MATCH_FAILED', inv.data?.invoice.status === 'MATCH_FAILED');
    const apr = await ctx.svc.approveSupplierInvoice(ctx.T, inv.data!.invoice.id, 'cfo', `apr2-${ctx.T}`);
    check('2c. approve blocked', apr.success === false && (apr.error?.status === 422 || apr.error?.status === 409));
  }

  // 3) price variance beyond 5%
  {
    const ctx = await setup();
    const { po } = await openPoWithReceipt(ctx, 10, 100);
    const inv = await ctx.svc.createSupplierInvoice(ctx.T, {
      poId: po.po.id, vendorInvoiceRef: 'VIN-PRICE', createdBy: 'acc', idempotencyKey: `inv3-${ctx.T}`,
      lines: [{ poLineId: po.lines[0].id, itemId: po.lines[0].itemId, invoicedQty: 10, unitPrice: 120 }],
    });
    check('3. price mismatch fails', inv.success && inv.data?.match?.passed === false);
  }

  // 4) price within 5% ok
  {
    const ctx = await setup();
    const { po } = await openPoWithReceipt(ctx, 10, 100);
    const inv = await ctx.svc.createSupplierInvoice(ctx.T, {
      poId: po.po.id, vendorInvoiceRef: 'VIN-OKP', createdBy: 'acc', idempotencyKey: `inv4-${ctx.T}`,
      lines: [{ poLineId: po.lines[0].id, itemId: po.lines[0].itemId, invoicedQty: 10, unitPrice: 104 }],
    });
    check('4. price within tol passes', inv.success && inv.data?.match?.passed === true, inv.data?.match?.summaryAr);
  }

  // 5) reject invoice
  {
    const ctx = await setup();
    const { po } = await openPoWithReceipt(ctx, 5, 3);
    const inv = await ctx.svc.createSupplierInvoice(ctx.T, {
      poId: po.po.id, vendorInvoiceRef: 'VIN-REJ', createdBy: 'acc', idempotencyKey: `inv5-${ctx.T}`,
      lines: [{ poLineId: po.lines[0].id, itemId: po.lines[0].itemId, invoicedQty: 5, unitPrice: 3 }],
    });
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
