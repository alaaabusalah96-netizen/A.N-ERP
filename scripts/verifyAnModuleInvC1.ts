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
const readPath = path.join(root, 'src/lib/anInventoryRead.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const invPage = fs.readFileSync(path.join(root, 'src/pages/Inventory.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');

check('S1 anInventoryRead.ts exists', fs.existsSync(readPath));
const body = fs.readFileSync(readPath, 'utf8');
check('S2 readInventorySummary exported', body.includes('readInventorySummary'));
check('S3 uses listWarehouses', body.includes('listWarehouses'));
check('S4 kemit page unchanged flag', body.includes('unchanged-custodydb'));
check('S5 server route inventory/summary', server.includes('/api/an/inventory/summary'));
check('S6 catalog entry', api.includes('/api/an/inventory/summary'));
check('S7 MERGE_STATUS C1', statusDoc.includes('C1'));
check('S8 Inventory.tsx still CustodyDB', invPage.includes('CustodyDB'));
check('S9 Inventory.tsx does not import anInventoryRead', !invPage.includes('anInventoryRead'));
check('S10 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S11 no stock post in anInventoryRead', !body.includes('postStock') && !body.includes('PostStock'));
check('S12 B3 status panel still exists', fs.existsSync(path.join(root, 'src/components/settings/AnCoreStatusPanel.tsx')));
check('S13 redaction or safe errors', body.includes('[redacted]') || body.includes('pg_read_failed'));
check('S14 session-plane still present', server.includes('/api/an/session-plane'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
