/**
 * @file verifyStkXcompany1.ts
 * STK-XCOMPANY-1 — cross-company transfers within a group.
 * Run: npx tsx scripts/verifyStkXcompany1.ts
 */
import fs from 'fs';
import {
  validateCrossCompanyCreate,
  buildCrossCompanyTransfer,
  assertCanDispatch,
  assertCanReceive,
} from '../src/core/org/CrossCompanyTransferService';

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

const group = { id: 'G1', code: 'G', nameAr: 'مجموعة', status: 'ACTIVE' as const, memberTenantIds: ['T1', 'T2'], createdAt: '' };

check('S1 CrossCompanyTransfer interface', /interface CrossCompanyTransfer/.test(port));
check('S2 storage methods', /listCrossCompanyTransfers/.test(port) && /saveCrossCompanyTransfer/.test(port));
check('S3 InMemory map', /crossCompanyTransfers/.test(mem));
check('S4 reject same tenant', !validateCrossCompanyCreate({
  group, sourceTenantId: 'T1', targetTenantId: 'T1',
  sourceWarehouseId: 'W1', targetWarehouseId: 'W2', itemCode: 'A', quantity: 1,
}).ok);
check('S5 reject non-member', !validateCrossCompanyCreate({
  group, sourceTenantId: 'T1', targetTenantId: 'T9',
  sourceWarehouseId: 'W1', targetWarehouseId: 'W2', itemCode: 'A', quantity: 1,
}).ok);
check('S6 accept valid pair', validateCrossCompanyCreate({
  group, sourceTenantId: 'T1', targetTenantId: 'T2',
  sourceWarehouseId: 'W1', targetWarehouseId: 'W2', itemCode: 'A', quantity: 5,
}).ok);
check('S7 build starts REQUESTED', buildCrossCompanyTransfer({
  groupId: 'G1', sourceTenantId: 'T1', targetTenantId: 'T2',
  sourceWarehouseId: 'W1', targetWarehouseId: 'W2', itemCode: 'a', quantity: 2,
}).status === 'REQUESTED');
check('S8 dispatch only from REQUESTED', assertCanDispatch({ status: 'REQUESTED' } as any).ok && !assertCanDispatch({ status: 'IN_TRANSIT' } as any).ok);
check('S9 receive only from IN_TRANSIT', assertCanReceive({ status: 'IN_TRANSIT' } as any).ok && !assertCanReceive({ status: 'REQUESTED' } as any).ok);
check('S10 list route platform', /app\.get\('\/api\/xcompany\/transfers',\s*requirePlatformAdmin/.test(server));
check('S11 create route platform', /app\.post\('\/api\/xcompany\/transfers',\s*requirePlatformAdmin/.test(server));
check('S12 dispatch+receive routes', /transfers\/:id\/dispatch/.test(server) && /transfers\/:id\/receive/.test(server) && /xcompany/.test(server));
check('R1 STK-XCOMPANY-1 DONE', byId['STK-XCOMPANY-1']?.status === 'DONE');
check('R2 MASTER-ITEM-GROUP-1 remains DONE', byId['MASTER-ITEM-GROUP-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
