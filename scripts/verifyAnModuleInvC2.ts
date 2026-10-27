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
const panel = fs.readFileSync(path.join(root, 'src/components/settings/AnCoreStatusPanel.tsx'), 'utf8');
const invPage = fs.readFileSync(path.join(root, 'src/pages/Inventory.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');

check('S1 fetchInventorySummary in bridge', bridge.includes('fetchInventorySummary'));
check('S2 fetch path inventory/summary', bridge.includes('/api/an/inventory/summary'));
check('S3 panel imports fetchInventorySummary', panel.includes('fetchInventorySummary'));
check('S4 panel calls fetchInventorySummary', panel.includes('fetchInventorySummary('));
check('S5 invSummary state', panel.includes('invSummary'));
check('S6 C1 route still on server', server.includes('/api/an/inventory/summary'));
check('S7 MERGE_STATUS C2', statusDoc.includes('C2'));
check('S8 Inventory.tsx still CustodyDB', invPage.includes('CustodyDB'));
check('S9 Inventory.tsx no anInventoryRead', !invPage.includes('anInventoryRead'));
check('S10 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S11 still session plane in panel', panel.includes('fetchSessionPlane'));
check('S12 kemit note in panel', panel.includes('CustodyDB') || panel.includes('Firestore'));
check('S13 verify C1 exists', fs.existsSync(path.join(root, 'scripts/verifyAnModuleInvC1.ts')));
check('S14 anInventoryRead still exists', fs.existsSync(path.join(root, 'src/lib/anInventoryRead.ts')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
