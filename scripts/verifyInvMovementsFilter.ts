/**
 * @file verifyInvMovementsFilter.ts
 * INV-MOVEMENTS-FILTER — date/warehouse/item/type filters on stock movements.
 * Run: npx tsx scripts/verifyInvMovementsFilter.ts
 */
import fs from 'fs';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function main() {
  const ui = fs.readFileSync('src/components/InventoryWorkspaceView.tsx', 'utf8');
  const server = fs.readFileSync('server.ts', 'utf8');
  const sp = fs.readFileSync('src/core/storage/StoragePort.ts', 'utf8');
  const im = fs.readFileSync('src/core/storage/adapters/InMemoryAdapter.ts', 'utf8');
  const pg = fs.readFileSync('src/core/storage/adapters/PostgresPrimaryAdapter.ts', 'utf8');

  check('S1 UI filter bar title', /تصفية سجل الحركات/.test(ui));
  check('S2 UI filter state fields', /movFilterWh/.test(ui) && /movFromDate/.test(ui) && /movToDate/.test(ui));
  check('S3 loadMovementsFiltered builds query', /loadMovementsFiltered/.test(ui) && /fromDate/.test(ui) && /warehouseId/.test(ui));
  check('S4 clearMovFilters', /clearMovFilters/.test(ui));
  check('S5 server accepts fromDate/toDate', /fromDate:\s*req\.query\.fromDate/.test(server));
  check('S6 StoragePort filter type has fromDate', /listStockMovements\([\s\S]*fromDate\?/.test(sp));
  check('S7 InMemory filters by date', /filter\?\.fromDate/.test(im) && /filter\?\.toDate/.test(im));
  check('S8 Postgres filters by timestamp range', /filter\?\.fromDate/.test(pg) && /timestamp >=/.test(pg));

  const st = new InMemoryAdapter();
  const T = `tmf-${Date.now()}`;
  const base = {
    tenantId: T, companyId: T, warehouseId: 'W1', warehouseNameAr: 'رئيسي',
    itemId: 'IT1', itemCode: 'C1', itemNameAr: 'صنف', unitCost: 1, totalCost: 1,
    balanceAfterQty: 1, performedBy: 'u', performedByName: 'u',
  };
  // seed via internal maps if no public create - use receive through inventory service instead
  const { InventoryService } = await import('../src/core/inventory/InventoryService');
  const { PostingEngine } = await import('../src/core/engines/PostingEngine');
  const { NumberingEngine } = await import('../src/core/engines/NumberingEngine');
  const inv = new InventoryService(st, new PostingEngine(st), new NumberingEngine(st));
  await st.saveWarehouse(T, {
    id: 'W1', tenantId: T, companyId: T, code: 'W1', nameAr: 'رئيسي', isActive: true,
    valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString(),
  } as any, 'wh');
  await inv.saveStockItem(T, {
    id: 'IT1', itemCode: 'C1', nameAr: 'صنف', category: 'X', valuationMethod: 'WEIGHTED_AVERAGE',
    inventoryAccountCode: '1105', cogsAccountCode: '5101',
  } as any, 'it');
  await inv.receiveStock(T, {
    warehouseId: 'W1', lines: [{ itemId: 'IT1', quantity: 5, unitCost: 2 }],
    performedBy: 'u', performedByName: 'u', idempotencyKey: `r-${T}`,
  } as any);
  await inv.issueStock(T, {
    warehouseId: 'W1', lines: [{ itemId: 'IT1', quantity: 2 }],
    performedBy: 'u', performedByName: 'u', idempotencyKey: `i-${T}`,
  } as any);

  const all = await inv.listStockMovements(T, { limit: 50 });
  check('R1 list has movements', all.success === true && (all.data?.length || 0) >= 2, String(all.data?.length));

  const onlyIssue = await inv.listStockMovements(T, { movementType: 'ISSUE', limit: 50 });
  check('R2 filter by ISSUE', onlyIssue.success === true && (onlyIssue.data || []).every((m) => m.movementType === 'ISSUE'));

  const onlyItem = await inv.listStockMovements(T, { itemId: 'IT1', limit: 50 });
  check('R3 filter by itemId', onlyItem.success === true && (onlyItem.data?.length || 0) >= 2);

  const farFuture = await inv.listStockMovements(T, { fromDate: '2099-01-01', limit: 50 } as any);
  check('R4 fromDate future empty', farFuture.success === true && (farFuture.data?.length || 0) === 0);

  const past = await inv.listStockMovements(T, { toDate: '2000-01-01', limit: 50 } as any);
  check('R5 toDate past empty', past.success === true && (past.data?.length || 0) === 0);

  const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
  const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));
  check('R6 package INV-MOVEMENTS-FILTER DONE', byId['INV-MOVEMENTS-FILTER']?.status === 'DONE');

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
