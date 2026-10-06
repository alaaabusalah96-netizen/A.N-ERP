/**
 * @file verifyP13Costing.ts
 * @description Phase 13 (COST-001) — selectable inventory costing: WEIGHTED_AVERAGE | FIFO | SPECIFIC_LOT.
 * Default mode: service + InMemoryAdapter. NO database needed.   Run:  npx tsx scripts/verifyP13Costing.ts
 * Optional mode: real PostgreSQL (DATABASE_URL, temporary tenant, cleaned up).   Run:  npx tsx scripts/verifyP13Costing.ts --pg
 * The default mode proves the service flow, the InMemory contract and the shared layer-planning math only; it does NOT prove the PostgreSQL SQL / row locks.
 */
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { PostingEngine } from '../src/core/engines/PostingEngine';

const PG = process.argv.includes('--pg');
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' | ' + detail : ''}`); };
const now = () => new Date().toISOString();
const near = (a: number, b: number, eps = 0.011) => Math.abs(a - b) <= eps;

interface Harness { T: string; st: any; svc: any; layerSum(item: string, wh: string): Promise<number>; cleanup?: () => Promise<void>; }

async function makeHarness(): Promise<Harness> {
  if (PG) {
    const { createTempTenant } = await import('./lib/testTenant');
    const t: any = await createTempTenant();
    return {
      T: t.tenantId, st: t.storage, svc: t.services.inventory, cleanup: () => t.cleanup(),
      layerSum: async (item, wh) => Number((await t.sql(`SELECT COALESCE(SUM(remaining_qty),0) AS s FROM an_stock_cost_layers WHERE item_id = $1 AND warehouse_id = $2 AND is_closed = FALSE`, [item, wh])).rows[0].s),
    };
  }
  const T = 'tenant-p13';
  const st: any = new InMemoryAdapter();
  const svc = new InventoryService(st, new (PostingEngine as any)(st, new NumberingEngine(st)), new NumberingEngine(st));
  return {
    T, st, svc,
    layerSum: async (item, wh) => (((st as any).costLayers?.get(`${T}:${wh}:${item}`)) || []).reduce((s: number, l: any) => s + l.remainingQty, 0),
  };
}

async function setup(items: Array<[string, string]>) {
  const h = await makeHarness();
  for (const id of ['W1', 'W2']) {
    const r = await h.st.saveWarehouse(h.T, { id: `${id}-${h.T}`.slice(0, 60), tenantId: h.T, companyId: h.T, code: id, nameAr: `مستودع ${id}`, valuationMethod: 'WEIGHTED_AVERAGE', isActive: true, createdAt: now() }, `wh-${id}`);
    if (!r.success) throw new Error('warehouse: ' + JSON.stringify(r.error));
  }
  const wh = (n: string) => `${n}-${h.T}`.slice(0, 60);
  for (const [id, method] of items) {
    const r = await h.st.saveStockItem(h.T, { id: `${id}-${h.T}`.slice(0, 60), tenantId: h.T, companyId: h.T, itemCode: `${id}-${h.T}`.slice(0, 60), nameAr: `صنف ${id}`, category: 'X', uom: 'قطعة',
      inventoryAccountCode: '110301', cogsAccountCode: '510101', adjustmentExpenseAccountCode: '510102', adjustmentGainAccountCode: '410102',
      valuationMethod: method, standardCost: 0, averageCost: 0, sellingPrice: 0, reorderPoint: 0, minStockLevel: 0, maxStockLevel: 0,
      trackBatch: false, trackSerial: false, isActive: true, createdAt: now() }, `it-${id}`);
    if (!r.success) throw new Error('item: ' + JSON.stringify(r.error));
  }
  const iid = (n: string) => `${n}-${h.T}`.slice(0, 60);
  const recv = (key: string, item: string, qty: number, cost: number, po: string, w = 'W1') =>
    h.svc.receiveStock(h.T, { warehouseId: wh(w), idempotencyKey: key, sourceDocumentType: 'PURCHASE_ORDER', sourceDocumentNumber: po, lines: [{ itemId: iid(item), quantity: qty, unitCost: cost }] });
  const issue = (key: string, item: string, qty: number, po?: string, w = 'W1') =>
    h.svc.issueStock(h.T, { warehouseId: wh(w), idempotencyKey: key, lines: [{ itemId: iid(item), quantity: qty, ...(po ? { sourcePoNumber: po } : {}) }] });
  const bal = async (item: string, w = 'W1') => (await h.st.getWarehouseStock(h.T, wh(w), iid(item))).data;
  return { h, recv, issue, bal, wh, iid };
}


// ---------------------------------------------------------------------------------------------------------------
// PostgreSQL JavaScript logic with a scripted fake client (no database). Proves the layer math / ordering / fail-closed logic of the
// REAL applyMovementInTx; it does NOT prove SQL syntax, row locks or deadlock-freedom (that needs --pg on a real database).
// ---------------------------------------------------------------------------------------------------------------
async function pgFakeClientChecks() {
  const mod: any = await import('../src/core/storage/adapters/PostgresPrimaryAdapter');
  const adapter: any = new mod.PostgresPrimaryAdapter();
  const mkClient = (method: string, stock: { current_qty: number; average_cost: number; total_value: number } | null) => {
    const st: any = { row: stock ? { id: 'stk-W-A', reserved_qty: 0, ...stock } : null, layers: [] as any[], writes: 0, layerQueries: 0, lastStockParams: null as any };
    st.query = async (sql: string, params: any[] = []) => {
      const q = sql.replace(/\s+/g, ' ');
      if (/FROM an_warehouse_stock/i.test(q) && /FOR UPDATE/i.test(q)) return { rows: st.row ? [st.row] : [] };
      if (/SELECT valuation_method FROM an_stock_items/i.test(q)) return { rows: [{ valuation_method: method }] };
      if (/INSERT INTO an_stock_cost_layers/i.test(q)) { st.layerQueries++; st.writes++; st.layers.push({ id: params[0], po_number: params[7], remaining_qty: params[8], unit_cost: params[9], is_closed: false }); return { rows: [], rowCount: 1 }; }
      if (/FROM an_stock_cost_layers/i.test(q) && /FOR UPDATE/i.test(q)) { st.layerQueries++; return { rows: st.layers.filter((l: any) => l.remaining_qty > 0 && !l.is_closed) }; }
      if (/UPDATE an_stock_cost_layers SET remaining_qty/i.test(q)) { st.layerQueries++; st.writes++; const l = st.layers.find((x: any) => x.id === params[3]); l.remaining_qty = params[0]; l.is_closed = params[1]; return { rows: [], rowCount: 1 }; }
      if (/INSERT INTO an_warehouse_stock/i.test(q)) { st.writes++; st.lastStockParams = params; st.row = { id: 'stk-W-A', reserved_qty: 0, current_qty: params[5], average_cost: params[6], total_value: params[7] }; return { rows: [], rowCount: 1 }; }
      if (/^\s*(INSERT|UPDATE)/i.test(q)) st.writes++;
      return { rows: [], rowCount: 1 };
    };
    return st;
  };
  const mv = (type: string, qty: number, cost: number, extra: any = {}): any => ({ id: `m-${Math.random().toString(36).slice(2, 8)}`, tenantId: 't', companyId: 't', movementNumber: 'M', movementType: type, warehouseId: 'W', itemId: 'A', itemCode: 'A',
    itemNameAr: 'صنف أ', quantity: qty, unitCost: cost, totalCost: qty * cost, balanceAfterQty: 0, performedBy: 'u', performedByName: 'u', timestamp: now(), ...extra });
  const OUT = { rejectNegative: true, lockedOutgoingCost: true };

  // FIFO: 100@10 (PO-1) + 100@20 (PO-2); issue 50 => 500; then 100 => 1500; balance 50 / value 1000; layers = qty
  {
    const c = mkClient('FIFO', null);
    await adapter.applyMovementInTx(c, 't', mv('RECEIPT', 100, 10, { sourceDocumentType: 'PURCHASE_ORDER', sourceDocumentNumber: 'PO-1' }), 'k1');
    await adapter.applyMovementInTx(c, 't', mv('RECEIPT', 100, 20, { sourceDocumentType: 'PURCHASE_ORDER', sourceDocumentNumber: 'PO-2' }), 'k2');
    check('[pg-fake] FIFO receipts create two layers tagged with their PO numbers', c.layers.length === 2 && c.layers[0].po_number === 'PO-1' && c.layers[1].po_number === 'PO-2' && c.layers[1].unit_cost === 20);
    const r1 = await adapter.applyMovementInTx(c, 't', mv('ISSUE', 50, 15), 'k3', OUT);
    check('[pg-fake] FIFO issue 50 (service said 15) => unit 10, total 500, stock value 2500', r1.ok && r1.unitCostUsed === 10 && r1.totalCostUsed === 500 && c.row.total_value === 2500, `unit=${r1.unitCostUsed} total=${r1.totalCostUsed} value=${c.row.total_value}`);
    const r2 = await adapter.applyMovementInTx(c, 't', mv('ISSUE', 100, 15), 'k4', OUT);
    const open = c.layers.filter((l: any) => l.remaining_qty > 0).reduce((a: number, l: any) => a + l.remaining_qty, 0);
    check('[pg-fake] FIFO issue 100 => total 1500, balance 50, value 1000, open layers 50 = qty', r2.ok && r2.totalCostUsed === 1500 && c.row.current_qty === 50 && c.row.total_value === 1000 && open === 50, `total=${r2.totalCostUsed} qty=${c.row.current_qty} value=${c.row.total_value} layers=${open}`);
    const closed = c.layers[0].is_closed === true && c.layers[0].remaining_qty === 0;
    check('[pg-fake] the exhausted layer is closed (remaining 0, is_closed true)', closed);
    const w0 = c.writes;
    const r3 = await adapter.applyMovementInTx(c, 't', mv('ISSUE', 80, 15), 'k5', { rejectNegative: false, lockedOutgoingCost: true });
    check('[pg-fake] FIFO issue above the layers => ok:false 422 insufficient-stock BEFORE any write', r3.ok === false && r3.error?.status === 422 && c.writes === w0, `ok=${r3.ok} status=${r3.error?.status} writes+=${c.writes - w0}`);
  }
  // SPECIFIC_LOT
  {
    const c = mkClient('SPECIFIC_LOT', null);
    await adapter.applyMovementInTx(c, 't', mv('RECEIPT', 100, 10, { sourcePoNumber: 'PO-1' }), 'k1');
    await adapter.applyMovementInTx(c, 't', mv('RECEIPT', 100, 20, { sourcePoNumber: 'PO-2' }), 'k2');
    const r1 = await adapter.applyMovementInTx(c, 't', mv('ISSUE', 50, 15, { sourcePoNumber: 'PO-2' }), 'k3', OUT);
    check('[pg-fake] SPECIFIC_LOT issue 50 from PO-2 => 1000 (not the older PO-1 layer)', r1.ok && r1.totalCostUsed === 1000 && c.layers[0].remaining_qty === 100 && c.layers[1].remaining_qty === 50, `total=${r1.totalCostUsed}`);
    const w0 = c.writes;
    const r2 = await adapter.applyMovementInTx(c, 't', mv('ISSUE', 150, 15, { sourcePoNumber: 'PO-2' }), 'k4', OUT);
    check('[pg-fake] SPECIFIC_LOT 150 from PO-2 (50 left) => 422 insufficient-lot-stock, no writes', r2.ok === false && r2.error?.status === 422 && String(r2.error?.type).includes('insufficient-lot-stock') && c.writes === w0 && String(r2.error?.detail).includes('PO-2'), `status=${r2.error?.status}`);
    const r3 = await adapter.applyMovementInTx(c, 't', mv('ISSUE', 120, 15), 'k5', OUT);
    check('[pg-fake] SPECIFIC_LOT without a PO behaves as FIFO (100@10 + 20@20 = 1400)', r3.ok && r3.totalCostUsed === 1400, `total=${r3.totalCostUsed}`);
  }
  // returns path (provided cost) and transfers
  {
    const c = mkClient('FIFO', null);
    await adapter.applyMovementInTx(c, 't', mv('RECEIPT', 100, 10), 'k1');
    await adapter.applyMovementInTx(c, 't', mv('RECEIPT', 100, 20), 'k2');
    const r = await adapter.applyMovementInTx(c, 't', mv('ISSUE', 50, 12), 'k3', { rejectNegative: true, lockedOutgoingCost: false });
    check('[pg-fake] provided-cost exit keeps the provided unit cost (12) but the stock VALUE falls by the layer cost (500)', r.ok && r.unitCostUsed === 12 && c.row.total_value === 2500, `unit=${r.unitCostUsed} value=${c.row.total_value}`);
    const t = mkClient('FIFO', { current_qty: 0, average_cost: 0, total_value: 0 });
    await adapter.applyMovementInTx(t, 't', mv('TRANSFER_IN', 150, 13.3333, { totalCost: 2000 }), 'k4');
    check('[pg-fake] TRANSFER_IN keeps the exact transferred value (2000) and adds one layer', t.row.total_value === 2000 && t.layers.length === 1 && t.layers[0].remaining_qty === 150, `value=${t.row.total_value}`);
  }
  // WEIGHTED_AVERAGE: not touched at all (no layer query, no layer write)
  {
    const c = mkClient('WEIGHTED_AVERAGE', { current_qty: 100, average_cost: 15, total_value: 1500 });
    const r1 = await adapter.applyMovementInTx(c, 't', mv('RECEIPT', 10, 20), 'k1', OUT);
    const r2 = await adapter.applyMovementInTx(c, 't', mv('ISSUE', 50, 10), 'k2', OUT);
    check('[pg-fake] WEIGHTED_AVERAGE: no layer query or write; issue cost = locked average (1700/110)', r1.ok && r2.ok && c.layerQueries === 0 && c.layers.length === 0 && Math.abs(r2.unitCostUsed - 1700 / 110) < 1e-9, `layerQueries=${c.layerQueries} unit=${r2.unitCostUsed}`);
    const c2 = mkClient('STANDARD_COST', { current_qty: 100, average_cost: 15, total_value: 1500 });
    const r3 = await adapter.applyMovementInTx(c2, 't', mv('ISSUE', 50, 10), 'k3', OUT);
    check('[pg-fake] legacy STANDARD_COST item is treated as WEIGHTED_AVERAGE (cost 750, no layers)', r3.ok && r3.totalCostUsed === 750 && c2.layerQueries === 0, `total=${r3.totalCostUsed}`);
  }
}

async function scenario(fn: () => Promise<void>) {
  try { await fn(); } catch (e: any) { fail++; console.log(`[FAIL] scenario crashed | ${e?.message || e}`); }
}

async function main() {
  console.log(PG ? 'MODE: real PostgreSQL' : 'MODE: InMemory (no database)');
  if (!PG) await scenario(pgFakeClientChecks);

  // (a) WEIGHTED_AVERAGE — unchanged: 100@10 (PO-1) + 100@20 (PO-2), issue 50 => 750, balance 150, value 2250, NO layers
  await scenario(async () => {
    const { h, recv, issue, bal, wh, iid } = await setup([['AVG', 'WEIGHTED_AVERAGE']]);
    await recv('a1', 'AVG', 100, 10, 'PO-1'); await recv('a2', 'AVG', 100, 20, 'PO-2');
    const r = await issue('a3', 'AVG', 50); const b = await bal('AVG');
    check('(a) WEIGHTED_AVERAGE issue 50 => cost 750', r.success && near(r.data.totalCost, 750), `cost=${r.data?.totalCost} err=${r.error?.detail || ''}`);
    check('(a) WEIGHTED_AVERAGE balance 150, value 2250', b.currentQty === 150 && near(b.totalValue, 2250), `qty=${b.currentQty} value=${b.totalValue}`);
    check('(a) WEIGHTED_AVERAGE creates NO cost layers', (await h.layerSum(iid('AVG'), wh('W1'))) === 0);
    await h.cleanup?.();
  });
  // (b) FIFO — issue 50 => 500; then 100 more => 50@10 + 50@20 = 1500; balance 50, value 1000
  // (d) invariant: sum(open layers remaining) = current_qty after every step
  await scenario(async () => {
    const { h, recv, issue, bal, wh, iid } = await setup([['FIF', 'FIFO']]);
    const inv = async (label: string) => { const b = await bal('FIF'); const s = await h.layerSum(iid('FIF'), wh('W1')); check(`(d) invariant after ${label}: layers ${s} = qty ${b.currentQty}`, near(s, b.currentQty, 0.0001)); };
    await recv('b1', 'FIF', 100, 10, 'PO-1'); await inv('receipt 1');
    await recv('b2', 'FIF', 100, 20, 'PO-2'); await inv('receipt 2');
    const r1 = await issue('b3', 'FIF', 50); await inv('issue 50');
    check('(b) FIFO issue 50 => cost 500', r1.success && near(r1.data.totalCost, 500), `cost=${r1.data?.totalCost} err=${r1.error?.detail || ''}`);
    const r2 = await issue('b4', 'FIF', 100); const b = await bal('FIF'); await inv('issue 100');
    check('(b) FIFO issue 100 more => cost 1500 (50@10 + 50@20)', r2.success && near(r2.data.totalCost, 1500), `cost=${r2.data?.totalCost}`);
    check('(b) FIFO balance 50, value 1000', b.currentQty === 50 && near(b.totalValue, 1000), `qty=${b.currentQty} value=${b.totalValue}`);
    const r3 = await issue('b5', 'FIF', 80);
    check('(b) FIFO issue above the balance is rejected and nothing changes', !r3.success && (await bal('FIF')).currentQty === 50, `status=${r3.error?.status}`);
    await h.cleanup?.();
  });
  // (c) SPECIFIC_LOT — issue 50 from PO-2 => 1000; then 150 from PO-2 (only 50 left) => 422 insufficient-lot-stock, no movements
  await scenario(async () => {
    const { h, recv, issue, bal, iid, wh } = await setup([['LOT', 'SPECIFIC_LOT']]);
    await recv('c1', 'LOT', 100, 10, 'PO-1'); await recv('c2', 'LOT', 100, 20, 'PO-2');
    const r1 = await issue('c3', 'LOT', 50, 'PO-2');
    check('(c) SPECIFIC_LOT issue 50 from PO-2 => cost 1000', r1.success && near(r1.data.totalCost, 1000), `cost=${r1.data?.totalCost} err=${r1.error?.detail || ''}`);
    const movesBefore = (await h.st.listStockMovements(h.T)).data.length;
    const r2 = await issue('c4', 'LOT', 150, 'PO-2');
    check('(c) 150 from PO-2 (50 left) => 422 insufficient-lot-stock', !r2.success && r2.error?.status === 422 && String(r2.error?.type).includes('insufficient-lot-stock'), `status=${r2.error?.status} type=${r2.error?.type}`);
    check('(c) the message names the PO and the available quantity', String(r2.error?.detail).includes('PO-2') && String(r2.error?.detail).includes('50'), String(r2.error?.detail));
    const b = await bal('LOT');
    check('(c) no movements written, balance still 150', (await h.st.listStockMovements(h.T)).data.length === movesBefore && b.currentQty === 150 && near(await h.layerSum(iid('LOT'), wh('W1')), 150, 0.0001), `qty=${b.currentQty}`);
    const r3 = await issue('c5', 'LOT', 20);
    check('(c) SPECIFIC_LOT without a PO behaves as FIFO (20 from PO-1 => 200)', r3.success && near(r3.data.totalCost, 200), `cost=${r3.data?.totalCost}`);
    await h.cleanup?.();
  });
  // (e) concurrency on FIFO: 5@10 + 5@20, two concurrent issues 7 and 6 => exactly one succeeds, layers never negative, cost = from the layers
  await scenario(async () => {
    const { h, recv, issue, bal, iid, wh } = await setup([['CON', 'FIFO']]);
    await recv('e1', 'CON', 5, 10, 'PO-A'); await recv('e2', 'CON', 5, 20, 'PO-B');
    const [x, y] = await Promise.all([issue('e3', 'CON', 7), issue('e4', 'CON', 6)]);
    const wins = [x, y].filter((r: any) => r.success);
    const b = await bal('CON'); const s = await h.layerSum(iid('CON'), wh('W1'));
    check('(e) concurrent FIFO issues 7 + 6 from 10: exactly one succeeds', wins.length === 1, `wins=${wins.length}`);
    const won = wins[0]; const qty = won ? won.data.totalQuantity ?? (won === x ? 7 : 6) : 0;
    const expected = qty === 7 ? 90 : 5 * 10 + 1 * 20;
    check('(e) layers never negative and equal the balance', s >= 0 && near(s, b.currentQty, 0.0001) && b.currentQty >= 0, `layers=${s} qty=${b.currentQty}`);
    check('(e) the winning cost comes from the layers', !!won && near(won.data.totalCost, expected), `cost=${won?.data?.totalCost} expected=${expected}`);
    await h.cleanup?.();
  });
  // (f) changing the method of an existing item
  await scenario(async () => {
    const { h, recv, issue, bal, iid, wh } = await setup([['CHG', 'WEIGHTED_AVERAGE']]);
    await recv('f1', 'CHG', 100, 10, 'PO-1'); await recv('f2', 'CHG', 100, 20, 'PO-2'); await issue('f3', 'CHG', 50);
    const b0 = await bal('CHG');
    check('(f) before: WAC balance 150, value 2250, average 15', b0.currentQty === 150 && near(b0.totalValue, 2250) && near(b0.averageCost, 15), `qty=${b0.currentQty} value=${b0.totalValue} avg=${b0.averageCost}`);
    const itemRow = (await h.st.getStockItem(h.T, iid('CHG'))).data;
    const toFifo = await h.svc.saveStockItem(h.T, { ...itemRow, valuationMethod: 'FIFO' }, 'f-chg-1');
    check('(f) saving the item as FIFO succeeds', toFifo.success, toFifo.error?.detail || '');
    check('(f) OPENING layer created: layers = 150', near(await h.layerSum(iid('CHG'), wh('W1')), 150, 0.0001));
    const r = await issue('f4', 'CHG', 10);
    check('(f) FIFO issue 10 after the change => cost 150 (10 @ 15)', r.success && near(r.data.totalCost, 150), `cost=${r.data?.totalCost} err=${r.error?.detail || ''}`);
    const toWac = await h.svc.saveStockItem(h.T, { ...(await h.st.getStockItem(h.T, iid('CHG'))).data, valuationMethod: 'WEIGHTED_AVERAGE' }, 'f-chg-2');
    const b1 = await bal('CHG');
    check('(f) back to WEIGHTED_AVERAGE: layers closed, average 15', toWac.success && (await h.layerSum(iid('CHG'), wh('W1'))) === 0 && near(b1.averageCost, 15), `avg=${b1.averageCost} qty=${b1.currentQty}`);
    await h.cleanup?.();
  });
  // (g) transfer of a FIFO item between warehouses: the entry cost in the target = the exit cost of the source, total value preserved
  await scenario(async () => {
    const { h, recv, bal, wh, iid } = await setup([['TRF', 'FIFO']]);
    await recv('g1', 'TRF', 100, 10, 'PO-1'); await recv('g2', 'TRF', 100, 20, 'PO-2');
    const tr = await h.svc.createTransfer(h.T, { sourceWarehouseId: wh('W1'), targetWarehouseId: wh('W2'), requestedBy: 'u1', requestedByName: 'U', idempotencyKey: 'g-t1', lines: [{ itemId: iid('TRF'), quantity: 150 }] });
    check('(g) transfer dispatched', tr.success, tr.error?.detail || '');
    const rc = await h.svc.receiveTransfer(h.T, tr.data.id, 'u2', 'U2', 'g-r1');
    const src = await bal('TRF', 'W1'); const dst = await bal('TRF', 'W2');
    check('(g) dispatch cost = 100@10 + 50@20 = 2000', near(tr.data.totalCost, 2000), `cost=${tr.data?.totalCost}`);
    check('(g) target value = source exit cost (2000); total value preserved (3000)', rc.success && near(dst.totalValue, 2000) && near(src.totalValue + dst.totalValue, 3000), `src=${src.totalValue} dst=${dst.totalValue}`);
    check('(g) layers: source 50, target 150', near(await h.layerSum(iid('TRF'), wh('W1')), 50, 0.0001) && near(await h.layerSum(iid('TRF'), wh('W2')), 150, 0.0001));
    await h.cleanup?.();
  });
  // (h) settings + STANDARD_COST rejection
  await scenario(async () => {
    const { h } = await setup([]);
    const base = { itemCode: `NEW-${h.T}`.slice(0, 60), nameAr: 'صنف جديد', category: 'X' };
    const s0 = await h.svc.getInventorySettings(h.T);
    check('(h) default settings: WEIGHTED_AVERAGE, negative stock off, tolerance 0', s0.success && s0.data.defaultValuationMethod === 'WEIGHTED_AVERAGE' && s0.data.allowNegativeStock === false && s0.data.overReceiptTolerancePct === 0);
    const bad = await h.svc.saveInventorySettings(h.T, { defaultValuationMethod: 'STANDARD_COST' }, 'u1', 'h-s0');
    check('(h) settings with STANDARD_COST => 400', !bad.success && bad.error?.status === 400);
    const sv = await h.svc.saveInventorySettings(h.T, { defaultValuationMethod: 'FIFO' }, 'u1', 'h-s1');
    check('(h) settings saved (FIFO default)', sv.success && sv.data.defaultValuationMethod === 'FIFO', sv.error?.detail || '');
    const n1 = await h.svc.saveStockItem(h.T, { ...base, id: `NEW1-${h.T}`.slice(0, 60) }, 'h-i1');
    check('(h) new item without a method takes the tenant default (FIFO)', n1.success && n1.data.valuationMethod === 'FIFO', `method=${n1.data?.valuationMethod}`);
    const n2 = await h.svc.saveStockItem(h.T, { ...base, itemCode: `NEW2-${h.T}`.slice(0, 60), id: `NEW2-${h.T}`.slice(0, 60), valuationMethod: 'STANDARD_COST' }, 'h-i2');
    check('(h) saving an item as STANDARD_COST => 400 valuation-method-unsupported', !n2.success && n2.error?.status === 400 && String(n2.error?.type).includes('valuation-method-unsupported'), `status=${n2.error?.status}`);
    const n3 = await h.svc.saveStockItem(h.T, { ...base, id: `NEW1-${h.T}`.slice(0, 60) }, 'h-i3');
    check('(h) re-saving an existing item without a method keeps its method', n3.success && n3.data.valuationMethod === 'FIFO');
    await h.cleanup?.();
  });
  // (j) a multi-line document fails closed as a whole (FIFO ok line + LOT line with insufficient PO stock)
  await scenario(async () => {
    const { h, recv, bal, wh, iid } = await setup([['F2', 'FIFO'], ['L2', 'SPECIFIC_LOT']]);
    await recv('j1', 'F2', 10, 10, 'PO-1'); await recv('j2', 'L2', 10, 10, 'PO-9');
    const r = await h.svc.issueStock(h.T, { warehouseId: wh('W1'), idempotencyKey: 'j3', lines: [{ itemId: iid('F2'), quantity: 5 }, { itemId: iid('L2'), quantity: 5, sourcePoNumber: 'PO-NONE' }] });
    check('(j) document with a failing LOT line => whole document rejected (422)', !r.success && r.error?.status === 422, `status=${r.error?.status}`);
    check('(j) the FIFO line was rolled back: balance 10, layers 10', (await bal('F2')).currentQty === 10 && near(await h.layerSum(iid('F2'), wh('W1')), 10, 0.0001));
    await h.cleanup?.();
  });
  // (k) allow_negative_stock stays a WEIGHTED_AVERAGE-only relief: default false rejects; true lets the WAC issue pass
  await scenario(async () => {
    const { h, recv, issue, bal } = await setup([['NEG', 'WEIGHTED_AVERAGE']]);
    await recv('k1', 'NEG', 100, 10, 'PO-1');
    const r1 = await issue('k2', 'NEG', 150);
    check('(k) negative stock off (default): issue above the balance rejected', !r1.success);
    await h.svc.saveInventorySettings(h.T, { allowNegativeStock: true }, 'u1', 'k-s1');
    const r2 = await issue('k3', 'NEG', 150);
    check('(k) negative stock on: WAC issue above the balance is allowed (balance -50)', r2.success && (await bal('NEG')).currentQty === -50, `qty=${(await bal('NEG'))?.currentQty} err=${r2.error?.detail || ''}`);
    await h.cleanup?.();
  });

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
