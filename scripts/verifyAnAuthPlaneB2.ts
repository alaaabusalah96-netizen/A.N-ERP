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
const bridge = fs.readFileSync(path.join(root, 'src/lib/anBridge.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/components/settings/CompanyBackendPanel.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');

check('S1 fetchSessionPlane in anBridge', bridge.includes('fetchSessionPlane'));
check('S2 fetch calls session-plane', bridge.includes('/api/an/session-plane'));
check('S3 panel imports fetchSessionPlane', panel.includes('fetchSessionPlane'));
check('S4 panel calls fetchSessionPlane', panel.includes('fetchSessionPlane('));
check('S5 panel shows planeInfo', panel.includes('planeInfo'));
check('S6 panel still uses resolveCompanyBackend', panel.includes('resolveCompanyBackend'));
check('S7 MERGE_STATUS B2', statusDoc.includes('B2'));
check('S8 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S9 session-plane route still on server', server.includes('/api/an/session-plane'));
check('S10 B1 module still exists', fs.existsSync(path.join(root, 'src/lib/anSessionPlane.ts')));
check('S11 A4 persist still on server', server.includes('an_backend_version'));
check('S12 no second login API in panel', !panel.includes('verify-credentials'));
check('S13 CustodyDB.updateCompany still used', panel.includes('updateCompany'));
check('S14 verify B1 exists', fs.existsSync(path.join(root, 'scripts/verifyAnAuthPlaneB1.ts')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
