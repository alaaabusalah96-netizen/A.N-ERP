/**
 * @file verifyAccEntityClose1.ts
 * ACC-ENTITY-CLOSE-1 — entity books close/reopen + xcompany gate.
 * Run: npx tsx scripts/verifyAccEntityClose1.ts
 */
import fs from 'fs';
import {
  assertCanCloseEntity,
  assertCanReopenEntity,
  assertEntityOpenForStockMove,
  buildClosedState,
  buildReopenedState,
} from '../src/core/accounting/EntityCloseService';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const port = fs.readFileSync('src/core/storage/StoragePort.ts', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');
const mem = fs.readFileSync('src/core/storage/adapters/InMemoryAdapter.ts', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 EntityBooksState interface', /interface EntityBooksState/.test(port));
check('S2 storage get/save', /getEntityBooksState/.test(port) && /saveEntityBooksState/.test(port));
check('S3 InMemory map', /entityBooksStates/.test(mem));
check('S4 cannot close without closed period', !assertCanCloseEntity({
  current: { tenantId: 'T1', status: 'OPEN', updatedAt: '' },
  period: { id: 'P1', code: '2026-01', isClosed: false },
}).ok);
check('S5 can close when period closed', assertCanCloseEntity({
  current: { tenantId: 'T1', status: 'OPEN', updatedAt: '' },
  period: { id: 'P1', code: '2026-01', isClosed: true },
}).ok);
check('S6 reopen requires reason', !assertCanReopenEntity({
  current: { tenantId: 'T1', status: 'CLOSED', updatedAt: '' },
  reason: 'x',
}).ok);
check('S7 reopen ok with reason', assertCanReopenEntity({
  current: { tenantId: 'T1', status: 'CLOSED', updatedAt: '' },
  reason: 'تصحيح قيد',
}).ok);
check('S8 build closed status', buildClosedState('T1', { id: 'P1', code: '2026-01', isClosed: true }, 'u1').status === 'CLOSED');
check('S9 build reopen OPEN', buildReopenedState('T1', 'تصحيح قيد').status === 'OPEN');
check('S10 stock move blocked when CLOSED', !assertEntityOpenForStockMove({ tenantId: 'T1', status: 'CLOSED', updatedAt: '' }, 'source').ok);
check('S11 entity-close routes', /app\.post\('\/api\/accounting\/entity-close'/.test(server) && /entity-reopen/.test(server) && /entity-close-status/.test(server));
check('S12 xcompany dispatch checks entity books', /assertEntityOpenForStockMove/.test(server) && /getEntityBooksState\(tr\.sourceTenantId\)/.test(server));
check('R1 ACC-ENTITY-CLOSE-1 DONE', byId['ACC-ENTITY-CLOSE-1']?.status === 'DONE');
check('R2 STK-XCOMPANY-1 remains DONE', byId['STK-XCOMPANY-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
