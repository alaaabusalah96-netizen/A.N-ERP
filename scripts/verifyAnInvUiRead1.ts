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
const stripPath = path.join(root, 'src/components/inventory/AnInventoryReadStrip.tsx');
const invPage = fs.readFileSync(path.join(root, 'src/pages/Inventory.tsx'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src/lib/anBridge.ts'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const dec = fs.readFileSync(path.join(root, 'docs/MERGE_DECISIONS.md'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');

check('S1 AnInventoryReadStrip.tsx exists', fs.existsSync(stripPath));
const stripBody = fs.existsSync(stripPath) ? fs.readFileSync(stripPath, 'utf8') : '';

check('S2 fetchInventorySummary import in strip', stripBody.includes('fetchInventorySummary'));
check('S3 Inventory.tsx imports AnInventoryReadStrip', invPage.includes('AnInventoryReadStrip'));
check('S4 Inventory.tsx still imports InventoryModule', invPage.includes('InventoryModule'));
check('S5 CustodyDB still referenced in Inventory.tsx', invPage.includes('CustodyDB'));
check('S6 strip does not call save/post stock', !stripBody.includes('saveStock') && !stripBody.includes('postStock'));
check('S7 MERGE INV-R1 or INV-UI-READ', statusDoc.includes('INV-R1') || statusDoc.includes('INV-UI-READ-1'));
check('S8 anBridge fetchInventorySummary exists', bridge.includes('fetchInventorySummary'));
check('S9 server inventory/summary route still present', server.includes('/api/an/inventory/summary'));
check('S10 Login still has an or firebase paths', login.includes('/api/an/auth/login') && login.includes('/api/auth/verify-credentials'));
check('S11 D-INV still in MERGE_DECISIONS', dec.includes('D-INV'));
check('S12 no cutoverApproved true in strip', !stripBody.includes('cutoverApproved: true'));
check('S13 documents tab components still imported', invPage.includes('InventoryDocumentsTab') && invPage.includes('InventoryDocumentForm'));
check('S14 language prop used', stripBody.includes('language'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
