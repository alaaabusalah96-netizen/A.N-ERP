import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}`); }
}
const read = (p: string): string => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

async function main(): Promise<void> {
  const root = process.cwd();
  
  const sqlPath = 'scripts/ops/create_an_erp_app_role.sql';
  check('01 SQL file exists', fs.existsSync(path.join(root, sqlPath)));
  const sql = read(sqlPath);
  check('02 SQL has NOBYPASSRLS', sql.includes('NOBYPASSRLS'));
  check('03 SQL has NOSUPERUSER', sql.includes('NOSUPERUSER'));
  check('04 SQL has an_erp_app', sql.includes('an_erp_app'));
  check('05 SQL has no hardcoded passwords', !sql.includes("PASSWORD '"));

  const docPath = 'docs/ops/PG-ROLE-NO-BYPASSRLS.md';
  check('06 Doc exists', fs.existsSync(path.join(root, docPath)));
  const doc = read(docPath);
  check('07 Doc mentions rolbypassrls', doc.includes('rolbypassrls'));

  const probePath = 'scripts/ops/probePgRole.ts';
  check('08 Probe exists', fs.existsSync(path.join(root, probePath)));

  const status = read('docs/MERGE_STATUS.md');
  check('09 FIX-PGROLE1 exists in MERGE_STATUS', status.includes('FIX-PGROLE1'));
  check('10 AUTH-ROLEMAP1 still in MERGE_STATUS', status.includes('AUTH-ROLEMAP1'));
  check('11 AUTH-REFRESH1 still in MERGE_STATUS', status.includes('AUTH-REFRESH1'));
  check('12 FIX-STORE1 still in MERGE_STATUS', status.includes('FIX-STORE1'));

  const envEx = read('.env.example');
  check('13 .env.example mentions an_erp_app or PG role doc', envEx.includes('an_erp_app') || envEx.includes('PG-ROLE-NO-BYPASSRLS.md'));

  const server = read('server.ts');
  check('14 DATABASE_URL still referenced', server.includes('DATABASE_URL'));

  console.log(`\nPassed: ${passed} | Failed: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('verifyAnFixPgRole1 crashed:', e?.message || e); process.exit(1); });
