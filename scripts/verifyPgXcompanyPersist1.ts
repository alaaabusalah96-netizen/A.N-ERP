/**
 * @file verifyPgXcompanyPersist1.ts
 * PG-XCOMPANY-PERSIST-1 — cross-company transfers persist on PostgreSQL.
 * Run: npx tsx scripts/verifyPgXcompanyPersist1.ts
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

check('S1 CREATE TABLE an_cross_company_transfers', /CREATE TABLE IF NOT EXISTS an_cross_company_transfers/.test(pg));
check('S2 quantity and unit_cost columns', /quantity NUMERIC/.test(pg) && /unit_cost NUMERIC/.test(pg));
check('S3 list supports optional filter', /listCrossCompanyTransfers[\s\S]{0,200}filter\?/.test(pg));
check('S4 list queries table', /FROM an_cross_company_transfers/.test(pg));
check('S5 get by id', /getCrossCompanyTransfer[\s\S]{0,300}WHERE id = \$1/.test(pg));
check('S6 save INSERT ON CONFLICT', /INSERT INTO an_cross_company_transfers/.test(pg) && /ON CONFLICT \(id\) DO UPDATE/.test(pg));
check('S7 mapCrossCompanyTransferRow', /mapCrossCompanyTransferRow/.test(pg));
check('S8 no empty-list stub', !/listCrossCompanyTransfers\([^\)]*\)[\s\S]{0,60}return \{ success: true, data: \[\] \}/.test(pg));
check('S9 no save echo-only stub', !/saveCrossCompanyTransfer\([^\)]*\)[\s\S]{0,80}return \{ success: true, data: tr \}/.test(pg));
check('S10 package DONE', byId['PG-XCOMPANY-PERSIST-1']?.status === 'DONE');
check('S11 lastChange mentions package', String(reg.lastChange || '').includes('PG-XCOMPANY-PERSIST-1'));
check('S12 prior group-item persist DONE', byId['PG-GROUP-ITEM-PERSIST-1']?.status === 'DONE');
check('S13 xcompany-not-found retained', /xcompany-not-found/.test(pg));
check('S14 indexes on group and status', /idx_an_xcompany_group/.test(pg) && /idx_an_xcompany_status/.test(pg));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
