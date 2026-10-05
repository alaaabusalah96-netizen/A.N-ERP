/**
 * @file verifyP10StockAtomicMem.ts
 * @description Phase 10 (STK-ATOMIC-001) — service + InMemoryAdapter logic checks. NO database needed.
 * Run:  npx tsx scripts/verifyP10StockAtomicMem.ts
 * This proves the SERVICE flow and the InMemory contract. It does NOT prove the PostgreSQL SQL, locking or deadlock behaviour.
 */
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { PostingEngine } from '../src/core/engines/PostingEngine';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' | ' + detail : ''}`); };
const T = 'tenant-p10';
const now = () => new Date().toISOString();

async function setup() {
  const st: any = new InMemoryAdapter();
  const svc = new InventoryService(st, new (PostingEngine as any)(st, new NumberingEngine(st)), new NumberingEngine(st));
  const wh = async (id: string) => st.saveWarehouse(T, { id, tenantId: T, companyId: T, code: id, nameAr: `مستودع ${id}`, valuationMethod: 'WEIGHTED_AVERAGE', isActive: true, createdAt: now() }, `wh-${id}`);
  const item = async (id: string, extra: any = {}) => st.saveStockItem(T, { id, tenantId: T, companyId: T, itemCode: id, nameAr: `صنف ${id}`, category: 'X', uom: 'قطعة',
    inventoryAccountCode: '110301', cogsAccountCode: '510101', adjustmentExpenseAccountCode: '510102', adjustmentGainAccountCode: '410102',
    valuationMethod: 'WEIGHTED_AVERAGE', standardCost: 0, averageCost: 0, sellingPrice: 0, reorderPoint: 0, minStockLevel: 0, maxStockLevel: 0,
    trackBatch: false, trackSerial: false, isActive: true, createdAt: now(), ...extra }, `it-${id}`);
  return { st, svc, wh, item };
}
const bal = async (st: any, w: string, i: string) => (await st.getWarehouseStock(T, w, i)).data;
const countMovs = async (st: any) => (await st.listStockMovements(T)).data.length;
const countDocs = async (st: any) => (await st.listStockDocuments(T)).data.length;

async function main() {
  // (a) normal receipt, two lines
  {
    const { st, svc, wh, item } = await setup(); await wh('W1'); await item('A'); await item('B');
    const r = await svc.receiveStock(T, { warehouseId: 'W1', idempotencyKey: 'a1', lines: [{ itemId: 'A', quantity: 10, unitCost: 5 }, { itemId: 'B', quantity: 4, unitCost: 25 }] });
    check('(a) receipt ok, one document, two movements', r.success && (await countDocs(st)) === 1 && (await countMovs(st)) === 2, r.error?.detail || '');
    const a = await bal(st, 'W1', 'A'), b = await bal(st, 'W1', 'B');
    check('(a) balances: A 10 @5 = 50, B 4 @25 = 100', a?.currentQty === 10 && a?.totalValue === 50 && b?.currentQty === 4 && b?.totalValue === 100);
    check('(a) document total cost = 150', r.data?.totalCost === 150, String(r.data?.totalCost));
  }
  // (b) atomicity: second line is corrupted inside the atomic call -> nothing changes
  {
    const { st, wh, item } = await setup(); await wh('W1'); await item('A'); await item('B');
    const mk = (id: string, itemId: string, qty: number, i: number) => ({ id, tenantId: T, companyId: T, movementNumber: `M-${i}`, movementType: 'RECEIPT', warehouseId: 'W1', itemId, itemCode: itemId, itemNameAr: itemId, quantity: qty, unitCost: 5, totalCost: qty * 5, balanceAfterQty: 0, performedBy: 'u', performedByName: 'u', timestamp: now() });
    const movements = [mk('m1', 'A', 3, 1), mk('m2', 'B', 2, 2)];
    const doc: any = { id: 'd1', tenantId: T, companyId: T, documentNumber: 'REC-1', documentType: 'RECEIPT', warehouseId: 'W1', status: 'POSTED', totalQuantity: 5, totalCost: 25,
      lines: [{ id: 'l1', tenantId: T, companyId: T, documentId: 'd1', lineNumber: 1, itemId: 'A', itemCode: 'A', itemNameAr: 'A', uom: 'x', quantity: 3, unitCost: 5, totalCost: 15 },
              { id: 'l2', tenantId: T, companyId: T, documentId: 'd1', lineNumber: 2, itemId: 'WRONG', itemCode: 'B', itemNameAr: 'B', uom: 'x', quantity: 2, unitCost: 5, totalCost: 10 }],
      movements, performedBy: 'u', performedByName: 'u', createdAt: now(), postedAt: now() };
    const r = await st.postStockDocumentAtomic(T, { doc, movements }, 'b1');
    check('(b) mismatching line/movement -> 400 invalid-document and NOTHING written', !r.success && r.error?.status === 400 && (await countMovs(st)) === 0 && (await countDocs(st)) === 0 && !(await bal(st, 'W1', 'A')));
    // failure in the middle: first line fine, second line makes balance negative -> first line must be rolled back
    const issueMov = (id: string, itemId: string, qty: number, i: number) => ({ ...mk(id, itemId, qty, i), movementType: 'ISSUE' });
    await st.postStockDocumentAtomic(T, { doc: { ...doc, id: 'd0', documentNumber: 'REC-0', lines: [doc.lines[0]].map((l: any) => ({ ...l, itemId: 'A', quantity: 5, totalCost: 25 })), movements: [mk('s1', 'A', 5, 9)], totalQuantity: 5 }, movements: [mk('s1', 'A', 5, 9)] }, 'seed');
    const mv2 = [issueMov('x1', 'A', 3, 11), issueMov('x2', 'B', 1, 12)];            // B has no stock -> must fail, A must stay 5
    const doc2: any = { ...doc, id: 'd2', documentNumber: 'ISS-1', documentType: 'ISSUE', lines: [
      { ...doc.lines[0], id: 'l3', quantity: 3, itemId: 'A' }, { ...doc.lines[1], id: 'l4', itemId: 'B', quantity: 1 }], movements: mv2 };
    const before = { m: await countMovs(st), d: await countDocs(st), a: (await bal(st, 'W1', 'A')).currentQty };
    const r2 = await st.postStockDocumentAtomic(T, { doc: doc2, movements: mv2 }, 'b2');
    check('(b) late-line failure -> 422, earlier line rolled back (no movement, no doc, balance unchanged)',
      !r2.success && r2.error?.status === 422 && (await countMovs(st)) === before.m && (await countDocs(st)) === before.d && (await bal(st, 'W1', 'A')).currentQty === before.a,
      `status=${r2.error?.status}`);
  }
  // (c) concurrent issues: balance 10, issue 7 and 6 at the same time -> exactly one succeeds (20 rounds)
  {
    let ok = true; let detail = '';
    for (let round = 0; round < 20; round++) {
      const { st, svc, wh, item } = await setup(); await wh('W1'); await item('A');
      await svc.receiveStock(T, { warehouseId: 'W1', idempotencyKey: `r${round}`, lines: [{ itemId: 'A', quantity: 10, unitCost: 10 }] });
      const [x, y] = await Promise.all([
        svc.issueStock(T, { warehouseId: 'W1', idempotencyKey: `i7-${round}`, lines: [{ itemId: 'A', quantity: 7 }] }),
        svc.issueStock(T, { warehouseId: 'W1', idempotencyKey: `i6-${round}`, lines: [{ itemId: 'A', quantity: 6 }] }),
      ]);
      const wins = [x, y].filter(r => r.success).length;
      const left = (await bal(st, 'W1', 'A')).currentQty;
      if (wins !== 1 || !(left === 3 || left === 4)) { ok = false; detail = `round ${round}: wins=${wins} left=${left}`; break; }
    }
    check('(c) two concurrent issues (7 and 6 of 10), 20 rounds: exactly one succeeds, balance 3 or 4, never negative', ok, detail);
  }
  // (d) same idempotency key in parallel -> one document
  {
    const { st, svc, wh, item } = await setup(); await wh('W1'); await item('A');
    const input = { warehouseId: 'W1', idempotencyKey: 'same-key', lines: [{ itemId: 'A', quantity: 5, unitCost: 4 }] };
    const [x, y] = await Promise.all([svc.receiveStock(T, input), svc.receiveStock(T, input)]);
    check('(d) same key in parallel: one document, one movement, balance 5', x.success && y.success && (await countDocs(st)) === 1 && (await countMovs(st)) === 1 && (await bal(st, 'W1', 'A')).currentQty === 5,
      `docs=${await countDocs(st)} movs=${await countMovs(st)}`);
    check('(d) both callers got the same document', x.data?.id === y.data?.id || x.data?.documentNumber === y.data?.documentNumber);
  }
  // (e) no fake success: duplicate document number makes the post fail -> service reports failure and writes no movements
  {
    const { st, svc, wh, item } = await setup(); await wh('W1'); await item('A');
    const orig = st.postStockDocumentAtomic.bind(st);
    const r1 = await svc.receiveStock(T, { warehouseId: 'W1', idempotencyKey: 'e1', lines: [{ itemId: 'A', quantity: 5, unitCost: 4 }] });
    const existingNumber = r1.data!.documentNumber;
    // force the numbering engine to hand out the already-used number
    (svc as any).numberingEngine.generateNumber = async () => ({ success: true, data: { formattedCode: existingNumber } });
    const before = await countMovs(st);
    const r2 = await svc.receiveStock(T, { warehouseId: 'W1', idempotencyKey: 'e2', lines: [{ itemId: 'A', quantity: 5, unitCost: 4 }] });
    check('(e) duplicate document number -> success:false, NO movement written, balance still 5',
      r2.success === false && (await countMovs(st)) === before && (await bal(st, 'W1', 'A')).currentQty === 5, r2.error?.detail || '');
    void orig;
  }
  // (f) issue cost comes from the locked average: 100@10 then 100@20 (avg 15), issue 50 -> unit 15, total 750
  {
    const { st, svc, wh, item } = await setup(); await wh('W1'); await item('A');
    await svc.receiveStock(T, { warehouseId: 'W1', idempotencyKey: 'f1', lines: [{ itemId: 'A', quantity: 100, unitCost: 10 }] });
    await svc.receiveStock(T, { warehouseId: 'W1', idempotencyKey: 'f2', lines: [{ itemId: 'A', quantity: 100, unitCost: 20 }] });
    const r = await svc.issueStock(T, { warehouseId: 'W1', idempotencyKey: 'f3', lines: [{ itemId: 'A', quantity: 50 }] });
    const mv = (await st.listStockMovements(T, { movementType: 'ISSUE' })).data[0];
    check('(f) issue movement cost 15 / total 750 and the document says the same', r.success && mv?.unitCost === 15 && mv?.totalCost === 750 && r.data?.lines[0].unitCost === 15 && r.data?.totalCost === 750,
      `unit=${mv?.unitCost} total=${mv?.totalCost} doc=${r.data?.totalCost}`);
  }
  // (g) batches / serials saved with the document
  {
    const { st, svc, wh, item } = await setup(); await wh('W1'); await item('A', { trackBatch: true });
    const r = await svc.receiveStock(T, { warehouseId: 'W1', idempotencyKey: 'h1', lines: [{ itemId: 'A', quantity: 6, unitCost: 3, batchNumber: 'B-1' }] });
    const batches = (await st.listItemBatches(T, 'A')).data;
    check('(g) trackBatch receipt creates the batch row', r.success && batches.length === 1 && batches[0].batchNumber === 'B-1');
  }
  // (h) issue beyond balance: service gives the early 400, the atomic call itself gives 422; no movements either way
  {
    const { st, svc, wh, item } = await setup(); await wh('W1'); await item('A');
    await svc.receiveStock(T, { warehouseId: 'W1', idempotencyKey: 'g1', lines: [{ itemId: 'A', quantity: 5, unitCost: 2 }] });
    const before = await countMovs(st);
    const r = await svc.issueStock(T, { warehouseId: 'W1', idempotencyKey: 'g2', lines: [{ itemId: 'A', quantity: 9 }] });
    check('(h) issue above balance rejected by the service (400 early check), no movements', !r.success && r.error?.status === 400 && (await countMovs(st)) === before);
  }
  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
