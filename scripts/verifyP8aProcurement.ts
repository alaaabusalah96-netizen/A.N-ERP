/** Phase 8a (P2P-001) — Purchase Request + RFQ + Supplier Quote → PO (InMemory) */
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { PurchasingService } from '../src/core/purchasing/PurchasingService';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { ApprovalEngine } from '../src/core/engines/ApprovalEngine';
import { DomainEventBus } from '../src/core/events/DomainEventBus';

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
  const T = `t8a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  for (const c of [
    { code: '1105', type: 'ASSET' }, { code: '2106', type: 'LIABILITY' }, { code: '5101', type: 'EXPENSE' },
  ] as const) {
    await st.saveAccount(T, { code: c.code, tenantId: T, nameAr: c.code, type: c.type as any, isActive: true, debitBalance: 0, creditBalance: 0, balance: 0 }, `a-${c.code}-${T}`);
  }
  const vendorPending = await st.saveMasterPartner(T, {
    id: `VP-${T}`.slice(0, 60), tenantId: T, type: 'VENDOR', nameAr: 'مورد معلق', code: `VNP-${T}`.slice(0, 20),
    status: 'PENDING_APPROVAL', createdBy: 'u', createdAt: new Date().toISOString(),
  } as any, `vend-p-${T}`);
  const vendor = await st.saveMasterPartner(T, {
    id: `V-${T}`.slice(0, 60), tenantId: T, type: 'VENDOR', nameAr: 'مورد معتمد', code: `VN-${T}`.slice(0, 20),
    status: 'APPROVED', createdBy: 'u', approvedBy: 'mgr', approvedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  } as any, `vend-${T}`);
  const item = await inv.saveStockItem(T, {
    id: `IT-${T}`.slice(0, 60), itemCode: `SKU-${T}`.slice(0, 20), nameAr: 'صنف', category: 'X', valuationMethod: 'WEIGHTED_AVERAGE',
    inventoryAccountCode: '1105', cogsAccountCode: '5101',
  } as any, `it-${T}`);
  const item2 = await inv.saveStockItem(T, {
    id: `IT2-${T}`.slice(0, 60), itemCode: `SKU2-${T}`.slice(0, 20), nameAr: 'صنف2', category: 'X', valuationMethod: 'WEIGHTED_AVERAGE',
    inventoryAccountCode: '1105', cogsAccountCode: '5101',
  } as any, `it2-${T}`);
  return { st, svc, T, vendor: vendor.data!, vendorPending: vendorPending.data!, item: item.data!, item2: item2.data! };
}

async function main() {
  // 1) create PR multi-line
  {
    const { svc, T, item, item2 } = await setup();
    const pr = await svc.createPurchaseRequest(T, {
      requestedBy: 'req1', idempotencyKey: `pr1-${T}`,
      lines: [
        { itemId: item.id, quantity: 10, uom: 'PCS' },
        { itemId: item2.id, quantity: 5, uom: 'PCS' },
        { itemId: item.id, quantity: 2, uom: 'PCS' },
      ],
    });
    check('1. create PR 3 lines', pr.success === true && pr.data!.lines.length === 3, pr.error?.detail);
    check('1b. PR DRAFT', pr.data?.pr.status === 'DRAFT');
    check('1c. PR number assigned', !!pr.data?.pr.prNumber);
  }

  // 2) empty PR rejected
  {
    const { svc, T } = await setup();
    const pr = await svc.createPurchaseRequest(T, { requestedBy: 'r', lines: [], idempotencyKey: `pr-empty-${T}` });
    check('2. empty PR rejected', pr.success === false && pr.error?.status === 400);
  }

  // 3) submit + SoD on approve
  {
    const { svc, T, item } = await setup();
    const pr = await svc.createPurchaseRequest(T, {
      requestedBy: 'req1', idempotencyKey: `pr-sod-${T}`,
      lines: [{ itemId: item.id, quantity: 3 }],
    });
    const sub = await svc.submitPurchaseRequest(T, pr.data!.pr.id, 'req1');
    check('3a. submit → PENDING_APPROVAL', sub.success && sub.data?.status === 'PENDING_APPROVAL');
    const sod = await svc.approvePurchaseRequest(T, pr.data!.pr.id, 'req1');
    check('3b. SoD blocks self-approve', sod.success === false && sod.error?.status === 403);
    const ok = await svc.approvePurchaseRequest(T, pr.data!.pr.id, 'mgr1');
    check('3c. manager approves', ok.success && ok.data?.status === 'APPROVED');
  }

  // 4) convert PR → PO requires approved vendor
  {
    const { svc, T, item, vendor, vendorPending } = await setup();
    const pr = await svc.createPurchaseRequest(T, {
      requestedBy: 'req1', idempotencyKey: `pr-conv-${T}`,
      lines: [{ itemId: item.id, quantity: 4 }],
    });
    await svc.approvePurchaseRequest(T, pr.data!.pr.id, 'mgr1');
    const bad = await svc.convertPurchaseRequestToPO(T, {
      prId: pr.data!.pr.id, vendorId: vendorPending.id, actorId: 'buyer',
      unitCosts: { [item.id]: 12.5 }, idempotencyKey: `po-bad-${T}`,
    });
    check('4a. unapproved vendor blocked', bad.success === false && bad.error?.status === 409, bad.error?.detail);
    const good = await svc.convertPurchaseRequestToPO(T, {
      prId: pr.data!.pr.id, vendorId: vendor.id, actorId: 'buyer',
      unitCosts: { [item.id]: 12.5 }, idempotencyKey: `po-ok-${T}`,
    });
    check('4b. PR→PO success', good.success === true && !!good.data?.po.id, good.error?.detail);
    check('4c. PR status CONVERTED', good.data?.pr.status === 'CONVERTED');
    check('4d. PO line cost from unitCosts', good.data?.lines[0].unitCost === 12.5);
    const again = await svc.convertPurchaseRequestToPO(T, {
      prId: pr.data!.pr.id, vendorId: vendor.id, actorId: 'buyer',
      unitCosts: { [item.id]: 1 }, idempotencyKey: `po-again-${T}`,
    });
    check('4e. double convert rejected', again.success === false);
  }

  // 5) RFQ from PR + send + quote + select + convert
  {
    const { svc, T, item, item2, vendor } = await setup();
    const pr = await svc.createPurchaseRequest(T, {
      requestedBy: 'req1', idempotencyKey: `pr-rfq-${T}`,
      lines: [
        { itemId: item.id, quantity: 10 },
        { itemId: item2.id, quantity: 7 },
      ],
    });
    await svc.approvePurchaseRequest(T, pr.data!.pr.id, 'mgr1');
    const rfq = await svc.createRfq(T, { prId: pr.data!.pr.id, createdBy: 'buyer', idempotencyKey: `rfq1-${T}` });
    check('5a. RFQ from PR has 2 lines', rfq.success && rfq.data!.lines.length === 2, rfq.error?.detail);
    const sent = await svc.sendRfq(T, rfq.data!.rfq.id, 'buyer');
    check('5b. RFQ SENT', sent.success && sent.data?.status === 'SENT');
    const quote = await svc.recordSupplierQuote(T, {
      rfqId: rfq.data!.rfq.id, vendorId: vendor.id, createdBy: 'buyer', idempotencyKey: `sq1-${T}`,
      lines: rfq.data!.lines.map((l) => ({
        rfqLineId: l.id, itemId: l.itemId, quantity: l.quantity, unitPrice: l.itemId === item.id ? 9 : 4.5,
      })),
    });
    check('5c. supplier quote recorded', quote.success && quote.data!.lines.length === 2, quote.error?.detail);
    const sel = await svc.selectSupplierQuote(T, quote.data!.quote.id, 'buyer');
    check('5d. quote SELECTED', sel.success && sel.data?.status === 'SELECTED');
    const po = await svc.convertQuoteToPO(T, { quoteId: quote.data!.quote.id, actorId: 'buyer', idempotencyKey: `po-q-${T}` });
    check('5e. quote→PO success', po.success && po.data!.lines.length === 2, po.error?.detail);
    check('5f. PO unit costs from quote', po.data!.lines[0].unitCost === 9 || po.data!.lines[1].unitCost === 9);
    const rfqAfter = await svc.getRfq(T, rfq.data!.rfq.id);
    check('5g. RFQ closed after convert', rfqAfter.data?.rfq.status === 'CLOSED');
  }

  // 6) idempotency on create PR
  {
    const { svc, T, item } = await setup();
    const key = `pr-idemp-${T}`;
    const a = await svc.createPurchaseRequest(T, {
      requestedBy: 'r', idempotencyKey: key, lines: [{ itemId: item.id, quantity: 1 }],
    });
    const b = await svc.createPurchaseRequest(T, {
      requestedBy: 'r', idempotencyKey: key, lines: [{ itemId: item.id, quantity: 1 }],
    });
    check('6. PR idempotency same id', a.success && b.success && a.data!.pr.id === b.data!.pr.id);
  }

  // 7) tenant isolation
  {
    const a = await setup();
    const b = await setup();
    const pr = await a.svc.createPurchaseRequest(a.T, {
      requestedBy: 'r', idempotencyKey: `pr-iso-${a.T}`,
      lines: [{ itemId: a.item.id, quantity: 1 }],
    });
    const cross = await b.svc.getPurchaseRequest(b.T, pr.data!.pr.id);
    check('7. cross-tenant PR → null', cross.success && cross.data === null);
  }

  // 8) reject PR
  {
    const { svc, T, item } = await setup();
    const pr = await svc.createPurchaseRequest(T, {
      requestedBy: 'r', idempotencyKey: `pr-rej-${T}`, lines: [{ itemId: item.id, quantity: 1 }],
    });
    const rej = await svc.rejectPurchaseRequest(T, pr.data!.pr.id, 'mgr', 'غير ضروري');
    check('8. reject PR', rej.success && rej.data?.status === 'REJECTED');
  }

  // 9) domain events published (at least one PURCHASE_REQUESTED in history)
  {
    const hist = DomainEventBus.getRecentEvents(undefined, 200);
    const types = new Set(hist.map((e: any) => e.eventType));
    check('9a. PURCHASE_REQUESTED emitted', types.has('PURCHASE_REQUESTED') || hist.some((e: any) => e.eventType === 'PURCHASE_REQUESTED'));
    check('9b. RFQ_SENT or PO_ISSUED emitted', types.has('RFQ_SENT') || types.has('PO_ISSUED') || hist.some((e: any) => e.eventType === 'RFQ_SENT' || e.eventType === 'PO_ISSUED'));
  }

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
