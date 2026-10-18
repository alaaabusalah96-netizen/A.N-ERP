/**
 * @file verifyRptGroup1.ts
 * RPT-GROUP-1 — group KPI aggregation.
 * Run: npx tsx scripts/verifyRptGroup1.ts
 */
import fs from 'fs';
import { aggregateGroupKpis, sumStockValue } from '../src/core/org/GroupReportService';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const server = fs.readFileSync('server.ts', 'utf8');
const svc = fs.readFileSync('src/core/org/GroupReportService.ts', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

const summary = aggregateGroupKpis({
  groupId: 'G1',
  groupCode: 'HOLD',
  groupNameAr: 'قابضة',
  members: [
    { tenantId: 'T1', itemCount: 2, warehouseCount: 1, stockValue: 100, openXcompanyOut: 1, openXcompanyIn: 0, entityBooksStatus: 'OPEN' },
    { tenantId: 'T2', itemCount: 3, warehouseCount: 2, stockValue: 50.555, openXcompanyOut: 0, openXcompanyIn: 1, entityBooksStatus: 'CLOSED' },
  ],
});

check('S1 aggregateGroupKpis exported', /export function aggregateGroupKpis/.test(svc));
check('S2 sumStockValue exported', /export function sumStockValue/.test(svc));
check('S3 memberCount', summary.memberCount === 2);
check('S4 totals items', summary.totals.itemCount === 5);
check('S5 totals warehouses', summary.totals.warehouseCount === 3);
check('S6 stock value rounded', summary.totals.stockValue === 150.56 || summary.totals.stockValue === 150.55);
check('S7 open xcompany sum', summary.totals.openXcompany === 2);
check('S8 entities closed/open', summary.totals.entitiesClosed === 1 && summary.totals.entitiesOpen === 1);
check('S9 sumStockValue', sumStockValue([{ totalValue: 10 }, { totalValue: 2.5 }]) === 12.5);
check('S10 route platform admin', /app\.get\('\/api\/groups\/:id\/report\/summary',\s*requirePlatformAdmin/.test(server));
check('S11 route uses aggregateGroupKpis', /report\/summary[\s\S]{0,2000}aggregateGroupKpis/.test(server));
check('S12 route reads entity books + xcompany', /getEntityBooksState/.test(server) && /listCrossCompanyTransfers/.test(server));
check('R1 RPT-GROUP-1 DONE', byId['RPT-GROUP-1']?.status === 'DONE');
check('R2 ACC-ENTITY-CLOSE-1 remains DONE', byId['ACC-ENTITY-CLOSE-1']?.status === 'DONE');

console.log(`
Passed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
