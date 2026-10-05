/**
 * @file verifyP11TransfersMem.ts
 * @description Phase 11 (STK-ATOMIC-002) — service + InMemoryAdapter logic checks. NO database needed.
 * Run:  npx tsx scripts/verifyP11TransfersMem.ts
 * Proves the SERVICE flow and the InMemory contract only; it does NOT prove the PostgreSQL SQL / row locks.
 */
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { PostingEngine } from '../src/core/engines/PostingEngine';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' | ' + detail : ''}`); };
const T = 'tenant-p11';
const now = () => new Date().toISOString();

async function setup() {
  const st: any = new InMemoryAdapter();
  const svc = new InventoryService(st, new (PostingEngine as any)(st, new NumberingEngine(st)), new NumberingEngine(st));
  for (const id of ['SRC', 'DST']) await st.saveWarehouse(T, { id, tenantId: T, companyId: T, code: id, nameAr: `مستودع ${id}`, valuationMethod: 'WEIGHTED_AVERAGE', isActive: true, createdAt: now() }, `wh-${id}`);
  for (const id of ['A', 'B']) await st.saveStockItem(T, { id, tenantId: T, companyId: T, itemCode: id, nameAr: `صنف ${id}`, category: 'X', uom: 'قطعة',
    inventoryAccountCode: '110301', cogsAccountCode: '510101', adjustmentExpenseAccountCode: '510102', adjustmentGainAccountCode: '410102',
    valuationMethod: 'WEIGHTED_AVERAGE', standardCost: 0, averageCost: 0, sellingPrice: 0, reorderPoint: 0, minStockLevel: 0, maxStockLevel: 0,
    trackBatch: false, trackSerial: false, isActive: true, createdAt: now() }, `it-${id}`);
  return { st, svc };
}
const recv = (svc: any, key: string, itemId: string, qty: number, cost: number) => svc.receiveStock(T, { warehouseId: 'SRC', idempotencyKey: key, lines: [{ itemId, quantity: qty, unitCost: cost }] });
const bal = async (st: any, w: string, i: string) => (await st.getWarehouseStock(T, w, i)).data;
const movs = async (st: any) => (await st.listStockMovements(T)).data;
const mkTransfer = (svc: any, key: string, lines: any[]) => svc.createTransfer(T, { sourceWarehouseId: 'SRC', targetWarehouseId: 'DST', requestedBy: 'u1', requestedByName: 'U', idempotencyKey: key, lines });

async function main() {
  // (a) 30 of 100@15: source 70 / target 30, value kept, IN_TRANSIT then RECEIVED
  {
    const { st, svc } = await setup(); await recv(svc, 'r1', 'A', 100, 15);
    const t = await mkTransfer(svc, 't1', [{ itemId: 'A', quantity: 30 }]);
    check('(a) transfer created IN_TRANSIT', t.success && t.data?.status === 'IN_TRANSIT', t.error?.detail || '');
    check('(a) source 70 (value 1050)', (await bal(st, 'SRC', 'A')).currentQty === 70 && (await bal(st, 'SRC', 'A')).totalValue === 1050);
    const r = await svc.receiveTransfer(T, t.data!.id, 'u2', 'U2', 'rv1');
    const dst = await bal(st, 'DST', 'A');
    check('(a) received: target 30 (value 450), status RECEIVED, total value unchanged 1500', r.success && r.data?.status === 'RECEIVED' && dst.currentQty === 30 && dst.totalValue === 450 && (await bal(st, 'SRC', 'A')).totalValue + dst.totalValue === 1500, r.error?.detail || '');
    check('(a) transfer total cost stays 450', r.data?.totalCost === 450, String(r.data?.totalCost));
  }
  // (b) failure while saving the transfer document (duplicate number) -> NO deduction from the source
  {
    const { st, svc } = await setup(); await recv(svc, 'r1', 'A', 100, 15);
    const t1 = await mkTransfer(svc, 't1', [{ itemId: 'A', quantity: 10 }]);
    const used = t1.data!.transferNumber;
    (svc as any).numberingEngine.generateNumber = async () => ({ success: true, data: { formattedCode: used } });
    const before = { qty: (await bal(st, 'SRC', 'A')).currentQty, m: (await movs(st)).length };
    const t2 = await mkTransfer(svc, 't2', [{ itemId: 'A', quantity: 20 }]);
    check('(b) duplicate transfer number -> failure and the source is NOT deducted',
      t2.success === false && (await bal(st, 'SRC', 'A')).currentQty === before.qty && (await movs(st)).length === before.m, `qty=${(await bal(st, 'SRC', 'A')).currentQty}`);
  }
  // (c) two concurrent receives of the same transfer with DIFFERENT keys -> one receive only
  {
    const { st, svc } = await setup(); await recv(svc, 'r1', 'A', 100, 15);
    const t = await mkTransfer(svc, 't1', [{ itemId: 'A', quantity: 30 }]);
    const [x, y] = await Promise.all([svc.receiveTransfer(T, t.data!.id, 'u2', 'U2', 'k1'), svc.receiveTransfer(T, t.data!.id, 'u3', 'U3', 'k2')]);
    const wins = [x, y].filter(r => r.success).length;
    const loser = [x, y].find(r => !r.success);
    check('(c) concurrent receives: exactly one wins, the other gets 409, target +30 once', wins === 1 && loser?.error?.status === 409 && (await bal(st, 'DST', 'A')).currentQty === 30,
      `wins=${wins} loser=${loser?.error?.status} target=${(await bal(st, 'DST', 'A'))?.currentQty}`);
  }
  // (d) two concurrent transfers 60 + 60 from 100 -> one succeeds, one 422, source >= 0
  {
    const { st, svc } = await setup(); await recv(svc, 'r1', 'A', 100, 15);
    // the service has an early 400 check; run both at once so both pass it, then the atomic check decides
    const [x, y] = await Promise.all([mkTransfer(svc, 'd1', [{ itemId: 'A', quantity: 60 }]), mkTransfer(svc, 'd2', [{ itemId: 'A', quantity: 60 }])]);
    const wins = [x, y].filter(r => r.success).length;
    const loser = [x, y].find(r => !r.success);
    check('(d) concurrent 60+60 of 100: one succeeds, one is rejected (422 from the atomic check), source = 40 >= 0',
      wins === 1 && loser?.error?.status === 422 && (await bal(st, 'SRC', 'A')).currentQty === 40, `wins=${wins} loser=${loser?.error?.status} src=${(await bal(st, 'SRC', 'A')).currentQty}`);
  }
  // (e) more than the balance -> rejected, no movements
  {
    const { st, svc } = await setup(); await recv(svc, 'r1', 'A', 10, 15);
    const before = (await movs(st)).length;
    const t = await mkTransfer(svc, 'e1', [{ itemId: 'A', quantity: 50 }]);
    check('(e) transfer above the balance rejected, no movements', !t.success && (await movs(st)).length === before, `status=${t.error?.status}`);
  }
  // (f) replay of the same receive key -> same result, no extra effect
  {
    const { st, svc } = await setup(); await recv(svc, 'r1', 'A', 100, 15);
    const t = await mkTransfer(svc, 't1', [{ itemId: 'A', quantity: 30 }]);
    const r1 = await svc.receiveTransfer(T, t.data!.id, 'u2', 'U2', 'same');
    const m1 = (await movs(st)).length;
    const r2 = await svc.receiveTransfer(T, t.data!.id, 'u2', 'U2', 'same');
    check('(f) replay with the same key: same transfer returned, no new movements, target still 30',
      r1.success && r2.success && r2.data?.status === 'RECEIVED' && (await movs(st)).length === m1 && (await bal(st, 'DST', 'A')).currentQty === 30, r2.error?.detail || '');
  }
  // (g) variable average cost: 100@10 + 100@20 (avg 15) -> transfer cost 15 per unit and the target is carried at 15
  {
    const { st, svc } = await setup(); await recv(svc, 'r1', 'A', 100, 10); await recv(svc, 'r2', 'A', 100, 20);
    const t = await mkTransfer(svc, 'g1', [{ itemId: 'A', quantity: 40 }]);
    await svc.receiveTransfer(T, t.data!.id, 'u2', 'U2', 'gr');
    const dst = await bal(st, 'DST', 'A');
    const lines = (await st.getStockTransfer(T, t.data!.id)).data.lines;
    check('(g) transfer line cost = 15/unit (total 600) and the target average = 15', lines[0].unitCost === 15 && lines[0].totalCost === 600 && dst.averageCost === 15 && dst.totalValue === 600,
      `lineUnit=${lines[0].unitCost} dstAvg=${dst.averageCost} dstValue=${dst.totalValue}`);
  }
  // (h) multi-line transfer: every line is deducted (movement numbers must not collide)
  {
    const { st, svc } = await setup(); await recv(svc, 'r1', 'A', 50, 2); await recv(svc, 'r2', 'B', 50, 4);
    const t = await mkTransfer(svc, 'h1', [{ itemId: 'A', quantity: 10 }, { itemId: 'B', quantity: 5 }]);
    const nums = (await movs(st)).filter((m: any) => m.movementType === 'TRANSFER_OUT').map((m: any) => m.movementNumber);
    check('(h) two lines -> two TRANSFER_OUT movements with different numbers, both deducted',
      t.success && nums.length === 2 && new Set(nums).size === 2 && (await bal(st, 'SRC', 'A')).currentQty === 40 && (await bal(st, 'SRC', 'B')).currentQty === 45, nums.join(','));
  }
  // (i) receiving a transfer that does not exist -> 404
  {
    const { svc } = await setup();
    const r = await svc.receiveTransfer(T, 'nope', 'u2', 'U2', 'x1');
    check('(i) unknown transfer -> 404', !r.success && r.error?.status === 404);
  }
  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
