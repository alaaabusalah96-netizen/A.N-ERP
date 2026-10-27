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
const statusPath = path.join(root, 'src/lib/anShadowStatus.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src/lib/anBridge.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/components/settings/AnCoreStatusPanel.tsx'), 'utf8');
const invPage = fs.readFileSync(path.join(root, 'src/pages/Inventory.tsx'), 'utf8');
const accPage = fs.readFileSync(path.join(root, 'src/pages/Accounting.tsx'), 'utf8');
const purPage = fs.readFileSync(path.join(root, 'src/pages/Purchasing.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');

check('S1 anShadowStatus exists', fs.existsSync(statusPath));
const body = fs.readFileSync(statusPath, 'utf8');
check('S2 buildShadowStatus exported', body.includes('buildShadowStatus'));
check('S3 cutoverApproved false', body.includes('cutoverApproved: false'));
check('S4 dualPath true', body.includes('dualPath: true'));
check('S5 server route shadow/status', server.includes('/api/an/shadow/status'));
check('S6 catalog D1', api.includes('/api/an/shadow/status'));
check('S7 fetchShadowStatus in bridge', bridge.includes('fetchShadowStatus'));
check('S8 panel uses fetchShadowStatus', panel.includes('fetchShadowStatus'));
check('S9 MERGE_STATUS D1', statusDoc.includes('D1'));
check('S10 Inventory/Accounting/Purchasing pages CustodyDB', invPage.includes('CustodyDB') && accPage.includes('CustodyDB') && purPage.includes('CustodyDB'));
check('S11 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S12 modules/overview still present', server.includes('/api/an/modules/overview'));
check('S13 anModulesOverview used in shadowStatus', body.includes('readModulesOverview'));
check('S14 verify C5 exists', fs.existsSync(path.join(root, 'scripts/verifyAnModuleOverviewC5.ts')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
