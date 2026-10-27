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
const gate = path.join(root, 'scripts/verifyAnPlaneAll.ts');
check('S1 verifyAnPlaneAll exists', fs.existsSync(gate));
const body = fs.readFileSync(gate, 'utf8');
check('S2 includes migration readiness route', body.includes('/api/an/migration/readiness'));
check('S3 includes modules overview', body.includes('/api/an/modules/overview'));
check('S4 includes shadow status', body.includes('/api/an/shadow/status'));
check('S5 checks migrateAuthorized false', body.includes('migrateAuthorized: false'));
check('S6 checks cutover false', body.includes('cutoverApproved: false'));
check('S7 spawns sub verifiers', body.includes('spawnSync'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
check('S8 verify:an-plane script', !!(pkg.scripts && pkg.scripts['verify:an-plane']));
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
check('S9 MERGE_STATUS E1', statusDoc.includes('E1'));
check('S10 Login file still CF path', fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8').includes('/api/auth/verify-credentials'));
check('S11 readiness module exists', fs.existsSync(path.join(root, 'src/lib/anMigrationReadiness.ts')));
check('S12 map module exists', fs.existsSync(path.join(root, 'src/lib/anEntityMap.ts')));
check('S13 D1 verify exists', fs.existsSync(path.join(root, 'scripts/verifyAnShadowD1.ts')));
check('S14 no cutover flip in gate', !body.includes('cutoverApproved: true'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
