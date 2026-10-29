import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`[PASS] ${name}`);
    passed++;
  } else {
    console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

const root = process.cwd();
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');

check('S1 requireAnMigrateOperator defined', server.includes('requireAnMigrateOperator'));
check('S2 uses authenticateSessionOrBearer', server.includes('authenticateSessionOrBearer'));
check('S3 platform or admin check', server.includes('migrate_forbidden') || server.includes('isPlatformAdminUser'));
check('S4 warehouses guarded', /migrate\/inventory\/warehouses[\s\S]{0,800}requireAnMigrateOperator/.test(server));
check('S5 items guarded', /migrate\/inventory\/items[\s\S]{0,800}requireAnMigrateOperator/.test(server));
check('S6 balances guarded', /migrate\/inventory\/balances[\s\S]{0,800}requireAnMigrateOperator/.test(server));
check('S7 accounts guarded', /migrate\/accounting\/accounts[\s\S]{0,800}requireAnMigrateOperator/.test(server));
check('S8 dry-run guarded', /migrate\/inventory\/dry-run[\s\S]{0,800}requireAnMigrateOperator/.test(server));
check('S9 AN_MIGRATE_WRITES still referenced', server.includes('AN_MIGRATE_WRITES'));
check('S10 MERGE SEC-MIG', statusDoc.includes('SEC-MIG') || statusDoc.includes('SEC-MIGRATE'));
check('S11 401 path migrate_unauthorized', server.includes('migrate_unauthorized'));
check('S12 no removal of writes flag', server.includes('writesEnabled') || server.includes('AN_MIGRATE_WRITES'));
check('S13 Login not required to change', fs.existsSync(path.join(root, 'src/pages/Login.tsx')));
check('S14 authenticateSessionOrBearer still defined', server.includes('async function authenticateSessionOrBearer'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
