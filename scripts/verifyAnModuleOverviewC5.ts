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
const readPath = path.join(root, 'src/lib/anModulesOverview.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src/lib/anBridge.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/components/settings/AnCoreStatusPanel.tsx'), 'utf8');
const invPage = fs.readFileSync(path.join(root, 'src/pages/Inventory.tsx'), 'utf8');
const accPage = fs.readFileSync(path.join(root, 'src/pages/Accounting.tsx'), 'utf8');
const purPage = fs.readFileSync(path.join(root, 'src/pages/Purchasing.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');

check('S1 anModulesOverview exists', fs.existsSync(readPath));
const body = fs.readFileSync(readPath, 'utf8');
check('S2 readModulesOverview exported', body.includes('readModulesOverview'));
check('S3 calls readInventorySummary/readAccountingSummary/readPurchasingSummary', body.includes('readInventorySummary') && body.includes('readAccountingSummary') && body.includes('readPurchasingSummary'));
check('S4 server route modules/overview', server.includes('/api/an/modules/overview'));
check('S5 catalog C5', api.includes('/api/an/modules/overview'));
check('S6 fetchModulesOverview bridge', bridge.includes('fetchModulesOverview'));
check('S7 panel uses modules overview or fetchModulesOverview', panel.includes('fetchModulesOverview') || panel.includes('modules/overview'));
check('S8 MERGE_STATUS C5', statusDoc.includes('C5'));
check('S9 Inventory.tsx CustodyDB', invPage.includes('CustodyDB'));
check('S10 Accounting.tsx CustodyDB', accPage.includes('CustodyDB'));
check('S11 Purchasing.tsx CustodyDB', purPage.includes('CustodyDB'));
check('S12 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S13 C1-C4 summary routes kept', server.includes('/api/an/inventory/summary') && server.includes('/api/an/accounting/summary') && server.includes('/api/an/purchasing/summary'));
check('S14 verify C4 exists', fs.existsSync(path.join(root, 'scripts/verifyAnModulePurC4.ts')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
