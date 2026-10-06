/**
 * @file verifyPgMovementLogic.ts
 * @description Exercises the REAL applyMovementInTx code of PostgresPrimaryAdapter against a scripted fake DB client.
 * No database needed. Proves: fail-closed 422 on negative stock (nothing written), locked weighted-average cost on outgoing
 * movements, legacy behaviour when no options are passed, receipts untouched.
 * Run:  npx tsx scripts/verifyPgMovementLogic.ts
 * It does NOT prove locking / deadlock-freedom / SQL syntax (those need a real PostgreSQL).
 */
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';

const adapter: any = new PostgresPrimaryAdapter();
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' | ' + d : ''}`); };

function fakeClient(row: { current_qty: number; average_cost: number; total_value: number } | null) {
  const writes: string[] = [];
  return {
    writes,
    async query(sql: string, _params: any[] = []) {
      const s = sql.replace(/\s+/g, ' ');
      if (/FROM an_warehouse_stock/i.test(s) && /FOR UPDATE/i.test(s)) return { rows: row ? [{ id: 'stk-W-A', reserved_qty: 0, ...row }] : [] };
      if (/^\s*(INSERT|UPDATE)/i.test(s)) writes.push(s.slice(0, 60));
      return { rows: [], rowCount: 1 };
    },
  };
}
const mv = (type: string, qty: number, cost = 10): any => ({ id: 'm1', tenantId: 't', companyId: 't', movementNumber: 'M1', movementType: type, warehouseId: 'W', itemId: 'A', itemCode: 'A',
  itemNameAr: 'صنف أ', quantity: qty, unitCost: cost, totalCost: qty * cost, balanceAfterQty: 0, performedBy: 'u', performedByName: 'u', timestamp: new Date().toISOString() });

async function main() {
  {
    const c = fakeClient({ current_qty: 5, average_cost: 15, total_value: 75 });
    const r = await adapter.applyMovementInTx(c, 't', mv('ISSUE', 9), 'k1', { rejectNegative: true, lockedOutgoingCost: true });
    check('issue 9 of 5 with rejectNegative -> ok:false, status 422, nothing written', r.ok === false && r.error?.status === 422 && c.writes.length === 0, `ok=${r.ok} status=${r.error?.status} writes=${c.writes.length}`);
  }
  {
    const c = fakeClient({ current_qty: 100, average_cost: 15, total_value: 1500 });
    const r = await adapter.applyMovementInTx(c, 't', mv('ISSUE', 50, 10), 'k2', { rejectNegative: true, lockedOutgoingCost: true });
    check('issue 50 @ locked average 15 (caller said 10) -> unitCostUsed 15, total 750', r.ok && r.unitCostUsed === 15 && r.totalCostUsed === 750 && r.saved.unitCost === 15, `unit=${r.unitCostUsed} total=${r.totalCostUsed}`);
  }
  {
    const c = fakeClient({ current_qty: 5, average_cost: 15, total_value: 75 });
    const r = await adapter.applyMovementInTx(c, 't', mv('ISSUE', 9, 10), 'k3');
    check('no options: keeps the provided cost (10) and does not reject (legacy recordStockMovement path)', r.ok && r.unitCostUsed === 10 && r.newQty === -4, `ok=${r.ok} unit=${r.unitCostUsed} newQty=${r.newQty}`);
  }
  {
    const c = fakeClient({ current_qty: 5, average_cost: 15, total_value: 75 });
    const r = await adapter.applyMovementInTx(c, 't', mv('RECEIPT', 10, 20), 'k4', { rejectNegative: true, lockedOutgoingCost: true });
    check('receipt 10 @ 20 on balance 5 @ 15 -> ok, newQty 15, cost 20 kept', r.ok && r.newQty === 15 && r.unitCostUsed === 20, `ok=${r.ok} newQty=${r.newQty}`);
  }
  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
