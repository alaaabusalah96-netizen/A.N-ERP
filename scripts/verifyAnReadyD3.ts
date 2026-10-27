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
const readyPath = path.join(root, 'src/lib/anMigrationReadiness.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src/lib/anBridge.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/components/settings/AnCoreStatusPanel.tsx'), 'utf8');
const invPage = fs.readFileSync(path.join(root, 'src/pages/Inventory.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');

check('S1 anMigrationReadiness exists', fs.existsSync(readyPath));
const body = fs.readFileSync(readyPath, 'utf8');
check('S2 buildMigrationReadiness exported', body.includes('buildMigrationReadiness'));
check('S3 migrateAuthorized false in source', body.includes('migrateAuthorized: false'));
check('S4 cutoverApproved false in source', body.includes('cutoverApproved: false'));
check('S5 server route migration/readiness', server.includes('/api/an/migration/readiness'));
check('S6 catalog D3', api.includes('/api/an/migration/readiness'));
check('S7 fetchMigrationReadiness in bridge', bridge.includes('fetchMigrationReadiness'));
check('S8 panel uses fetchMigrationReadiness', panel.includes('fetchMigrationReadiness'));
check('S9 MERGE_STATUS D3', statusDoc.includes('D3'));
check('S10 no migrateAuthorized: true anywhere in ready file', !body.includes('migrateAuthorized: true'));
check('S11 map/entities still present', server.includes('/api/an/map/entities'));
check('S12 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S13 Inventory.tsx CustodyDB', invPage.includes('CustodyDB'));
check('S14 verify D2 exists', fs.existsSync(path.join(root, 'scripts/verifyAnMapD2.ts')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
