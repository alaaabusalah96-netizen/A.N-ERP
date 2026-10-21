/**
 * @file verifyPgEntityClosePersist1.ts
 * PG-ENTITY-CLOSE-PERSIST-1 — entity books OPEN/CLOSED persist on PostgreSQL.
 * Run: npx tsx scripts/verifyPgEntityClosePersist1.ts
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

check('S1 CREATE TABLE an_entity_books_state', /CREATE TABLE IF NOT EXISTS an_entity_books_state/.test(pg));
check('S2 tenant_id PRIMARY KEY', /an_entity_books_state[\s\S]{0,200}tenant_id VARCHAR\(64\) PRIMARY KEY/.test(pg));
check('S3 get selects by tenant', /getEntityBooksState[\s\S]{0,350}WHERE tenant_id = \$1/.test(pg));
check('S4 get defaults OPEN when no row', /status: 'OPEN'/.test(pg) && /no row/.test(pg));
check('S5 save INSERT ON CONFLICT tenant_id', /INSERT INTO an_entity_books_state/.test(pg) && /ON CONFLICT \(tenant_id\) DO UPDATE/.test(pg));
check('S6 mapEntityBooksStateRow', /mapEntityBooksStateRow/.test(pg));
check('S7 no always-OPEN stub without query', !/getEntityBooksState\([^)]*\)[\s\S]{0,80}return \{ success: true, data: \{ tenantId, status: 'OPEN'/.test(pg));
check('S8 no save echo-only stub', !/saveEntityBooksState\([^)]*\)[\s\S]{0,80}return \{ success: true, data: state \}/.test(pg));
check('S9 package DONE', byId['PG-ENTITY-CLOSE-PERSIST-1']?.status === 'DONE');
check('S10 lastChange mentions package', String(reg.lastChange || '').includes('PG-ENTITY-CLOSE-PERSIST-1'));
check('S11 prior xcompany persist DONE', byId['PG-XCOMPANY-PERSIST-1']?.status === 'DONE');
check('S12 closed_by / reopen_reason columns', /closed_by/.test(pg) && /reopen_reason/.test(pg));
check('S13 CLOSED status mapping', /CLOSED/.test(pg));
check('S14 InMemory Map still present', /entityBooksStates/.test(fs.readFileSync('src/core/storage/adapters/InMemoryAdapter.ts', 'utf8')));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
