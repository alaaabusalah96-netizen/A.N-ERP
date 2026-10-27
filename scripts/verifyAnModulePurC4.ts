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
const readPath = path.join(root, 'src/lib/anPurchasingRead.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src/lib/anBridge.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/components/settings/AnCoreStatusPanel.tsx'), 'utf8');
const purPage = fs.readFileSync(path.join(root, 'src/pages/Purchasing.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');

check('S1 anPurchasingRead exists', fs.existsSync(readPath));
const body = fs.readFileSync(readPath, 'utf8');
check('S2 readPurchasingSummary exported', body.includes('readPurchasingSummary'));
check('S3 listPurchaseOrders or listGoodsReceipts', body.includes('listPurchaseOrders') || body.includes('listGoodsReceipts'));
check('S4 server route', server.includes('/api/an/purchasing/summary'));
check('S5 catalog', api.includes('/api/an/purchasing/summary'));
check('S6 fetchPurchasingSummary bridge', bridge.includes('fetchPurchasingSummary'));
check('S7 panel uses fetchPurchasingSummary', panel.includes('fetchPurchasingSummary'));
check('S8 MERGE_STATUS C4', statusDoc.includes('C4'));
check('S9 Purchasing.tsx CustodyDB', purPage.includes('CustodyDB'));
check('S10 Purchasing.tsx no anPurchasingRead', !purPage.includes('anPurchasingRead'));
check('S11 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S12 accounting summary still present', server.includes('/api/an/accounting/summary'));
check('S13 kemitPurchasingPage flag', body.includes('unchanged-custodydb'));
check('S14 no PO/GR post in read module', !body.includes('postPurchaseOrder') && !body.includes('postGoodsReceipt'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
