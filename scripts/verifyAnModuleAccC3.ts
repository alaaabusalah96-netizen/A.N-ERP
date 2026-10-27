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
const readPath = path.join(root, 'src/lib/anAccountingRead.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src/lib/anBridge.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/components/settings/AnCoreStatusPanel.tsx'), 'utf8');
const accPage = fs.readFileSync(path.join(root, 'src/pages/Accounting.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');

check('S1 anAccountingRead exists', fs.existsSync(readPath));
const body = fs.readFileSync(readPath, 'utf8');
check('S2 readAccountingSummary', body.includes('readAccountingSummary'));
check('S3 listJournalEntries or listAccounts', body.includes('listJournalEntries') || body.includes('listAccounts'));
check('S4 server route', server.includes('/api/an/accounting/summary'));
check('S5 catalog', api.includes('/api/an/accounting/summary'));
check('S6 fetchAccountingSummary bridge', bridge.includes('fetchAccountingSummary'));
check('S7 panel uses fetchAccountingSummary', panel.includes('fetchAccountingSummary'));
check('S8 MERGE_STATUS C3', statusDoc.includes('C3'));
check('S9 Accounting.tsx CustodyDB', accPage.includes('CustodyDB'));
check('S10 Accounting.tsx no anAccountingRead', !accPage.includes('anAccountingRead'));
check('S11 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S12 inventory summary still present', server.includes('/api/an/inventory/summary'));
check('S13 kemitAccountingPage flag', body.includes('unchanged-custodydb'));
check('S14 no journal post in read module', !body.includes('postJournal') && !body.includes('PostJournal'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
