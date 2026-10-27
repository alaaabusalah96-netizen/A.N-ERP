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
const panel = fs.readFileSync(path.join(root, 'src/components/settings/AnCoreStatusPanel.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src/lib/anBridge.ts'), 'utf8');

check('S1 panel imports fetchSessionPlane', panel.includes('fetchSessionPlane'));
check('S2 panel calls fetchSessionPlane', panel.includes('fetchSessionPlane('));
check('S3 live true option', panel.includes('live: true') || panel.includes('live:true'));
check('S4 sessionPlane state', panel.includes('sessionPlane'));
check('S5 displays auth path or live', panel.includes('authPath') || panel.includes('liveDetail'));
check('S6 still loads storage status', panel.includes('getAnStorageStatus'));
check('S7 still loads routes', panel.includes('/routes'));
check('S8 MERGE_STATUS B3', statusDoc.includes('B3'));
check('S9 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S10 fetchSessionPlane still in bridge', bridge.includes('fetchSessionPlane'));
check('S11 B2 panel still has planeInfo', fs.readFileSync(path.join(root, 'src/components/settings/CompanyBackendPanel.tsx'), 'utf8').includes('planeInfo'));
check('S12 no verify-credentials in status panel', !panel.includes('verify-credentials'));
check('S13 verify B2 exists', fs.existsSync(path.join(root, 'scripts/verifyAnAuthPlaneB2.ts')));
check('S14 AnCoreStatusPanel file exists', fs.existsSync(path.join(root, 'src/components/settings/AnCoreStatusPanel.tsx')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
