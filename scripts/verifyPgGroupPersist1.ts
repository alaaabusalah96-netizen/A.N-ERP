/**
 * @file verifyPgGroupPersist1.ts
 * PG-GROUP-PERSIST-1 — company groups persist on PostgreSQL (not success-without-write stubs).
 * Run: npx tsx scripts/verifyPgGroupPersist1.ts
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

check('S1 CREATE TABLE an_company_groups', /CREATE TABLE IF NOT EXISTS an_company_groups/.test(pg));
check('S2 member_tenant_ids JSONB column', /member_tenant_ids JSONB/.test(pg));
check('S3 listCompanyGroups queries table', /FROM an_company_groups/.test(pg) && /listCompanyGroups[\s\S]{0,400}SELECT \* FROM an_company_groups/.test(pg));
check('S4 getCompanyGroup queries by id', /getCompanyGroup[\s\S]{0,350}WHERE id = \$1/.test(pg));
check('S5 saveCompanyGroup INSERT ON CONFLICT', /INSERT INTO an_company_groups/.test(pg) && /ON CONFLICT \(id\) DO UPDATE/.test(pg));
check('S6 mapCompanyGroupRow helper', /mapCompanyGroupRow/.test(pg));
check('S7 stubs removed (no empty list success-only)', !/listCompanyGroups\(\)[\s\S]{0,80}return \{ success: true, data: \[\] \}/.test(pg));
check('S8 stubs removed (no save echo-only)', !/saveCompanyGroup\([^)]*\)[\s\S]{0,80}return \{ success: true, data: group \}/.test(pg));
check('S9 package PG-GROUP-PERSIST-1 DONE', byId['PG-GROUP-PERSIST-1']?.status === 'DONE');
check('S10 lastChange mentions PG-GROUP-PERSIST-1', String(reg.lastChange || '').includes('PG-GROUP-PERSIST-1'));
check('S11 group-not-found error retained', /group-not-found/.test(pg));
check('S12 status maps ACTIVE|SUSPENDED', /SUSPENDED/.test(pg));
check('S13 InMemory still has real Map persistence', /companyGroups = new Map/.test(fs.readFileSync('src/core/storage/adapters/InMemoryAdapter.ts', 'utf8')));
check('S14 FIX-TENANT-SUSPEND-1 still DONE if present', !byId['FIX-TENANT-SUSPEND-1'] || byId['FIX-TENANT-SUSPEND-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
