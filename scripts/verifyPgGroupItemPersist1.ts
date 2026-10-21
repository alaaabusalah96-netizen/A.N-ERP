/**
 * @file verifyPgGroupItemPersist1.ts
 * PG-GROUP-ITEM-PERSIST-1 — group master items persist on PostgreSQL.
 * Run: npx tsx scripts/verifyPgGroupItemPersist1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean) => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}`); }
};

const pg = fs.readFileSync('src/core/storage/adapters/PostgresPrimaryAdapter.ts', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 CREATE TABLE an_group_master_items', /CREATE TABLE IF NOT EXISTS an_group_master_items/.test(pg));
check('S2 UNIQUE group_id + item_code', /UNIQUE \(group_id, item_code\)/.test(pg));
check('S3 list filters by group_id', /listGroupMasterItems[\s\S]{0,400}WHERE group_id = \$1/.test(pg));
check('S4 get by group_id and id', /getGroupMasterItem[\s\S]{0,400}WHERE group_id = \$1 AND id = \$2/.test(pg));
check('S5 save INSERT ON CONFLICT', /INSERT INTO an_group_master_items/.test(pg) && /ON CONFLICT \(id\) DO UPDATE/.test(pg));
check('S6 mapGroupMasterItemRow helper', /mapGroupMasterItemRow/.test(pg));
check('S7 no empty-list stub', !/listGroupMasterItems\([^)]*\)[\s\S]{0,80}return \{ success: true, data: \[\] \}/.test(pg));
check('S8 no save echo-only stub', !/saveGroupMasterItem\([^)]*\)[\s\S]{0,80}return \{ success: true, data: item \}/.test(pg));
check('S9 package DONE', byId['PG-GROUP-ITEM-PERSIST-1']?.status === 'DONE');
check('S10 lastChange mentions package', String(reg.lastChange || '').includes('PG-GROUP-ITEM-PERSIST-1'));
check('S11 prior PG-GROUP-PERSIST-1 DONE', byId['PG-GROUP-PERSIST-1']?.status === 'DONE');
check('S12 group-item-not-found retained', /group-item-not-found/.test(pg));
check('S13 index on group_id', /idx_an_group_master_items_group/.test(pg));
check('S14 InMemory Map still present', /groupMasterItems = new Map/.test(fs.readFileSync('src/core/storage/adapters/InMemoryAdapter.ts', 'utf8')));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
