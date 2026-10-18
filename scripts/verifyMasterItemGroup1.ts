/**
 * @file verifyMasterItemGroup1.ts
 * MASTER-ITEM-GROUP-1 — group master items + publish shells.
 * Run: npx tsx scripts/verifyMasterItemGroup1.ts
 */
import fs from 'fs';
import {
  validateGroupMasterItemInput,
  assertUniqueItemCodeInGroup,
  buildGroupMasterItem,
  stockItemShellFromGroupMaster,
} from '../src/core/org/GroupMasterItemService';

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

check('S1 GroupMasterItem interface', /interface GroupMasterItem/.test(port));
check('S2 storage methods', /listGroupMasterItems/.test(port) && /saveGroupMasterItem/.test(port));
check('S3 InMemory map', /groupMasterItems/.test(mem));
check('S4 validate rejects empty code', !validateGroupMasterItemInput({ itemCode: '', nameAr: 'صنف', category: 'عامة' }).ok);
check('S5 validate accepts', validateGroupMasterItemInput({ itemCode: 'SKU1', nameAr: 'صنف', category: 'عامة' }).ok);
check('S6 unique code conflict', !assertUniqueItemCodeInGroup('SKU1', [buildGroupMasterItem({ groupId: 'G', itemCode: 'SKU1', nameAr: 'أ', category: 'ع', uom: 'قطعة' })]).ok);
check('S7 build sets ACTIVE', buildGroupMasterItem({ groupId: 'G1', itemCode: 'A', nameAr: 'أ', category: 'ع', uom: 'قطعة' }).status === 'ACTIVE');
check('S8 shell zero cost and same code', (() => {
  const g = buildGroupMasterItem({ groupId: 'G1', itemCode: 'A', nameAr: 'أ', category: 'ع', uom: 'قطعة' });
  const s = stockItemShellFromGroupMaster('T1', g, {
    inventoryAccountCode: '1105', cogsAccountCode: '5101',
    adjustmentExpenseAccountCode: '5209', adjustmentGainAccountCode: '4203',
  });
  return s.itemCode === 'A' && s.tenantId === 'T1' && s.standardCost === 0 && s.averageCost === 0;
})());
check('S9 GET group items platform', /app\.get\('\/api\/groups\/:id\/items',\s*requirePlatformAdmin/.test(server));
check('S10 POST group items platform', /app\.post\('\/api\/groups\/:id\/items',\s*requirePlatformAdmin/.test(server));
check('S11 publish route', /app\.post\('\/api\/groups\/:id\/items\/:itemId\/publish',\s*requirePlatformAdmin/.test(server));
check('S12 publish uses saveStockItem', /publish[\s\S]{0,1200}saveStockItem/.test(server));
check('R1 MASTER-ITEM-GROUP-1 DONE', byId['MASTER-ITEM-GROUP-1']?.status === 'DONE');
check('R2 ORG-GROUP-1 remains DONE', byId['ORG-GROUP-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
