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
const writePath = path.join(root, 'src/lib/anMigrateAccounts.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');

check('S1 anMigrateAccounts exists', fs.existsSync(writePath));
const body = fs.readFileSync(writePath, 'utf8');
check('S2 migrateAccountsToAn exported', body.includes('migrateAccountsToAn'));
check('S3 AN_MIGRATE_WRITES gate in source', body.includes('AN_MIGRATE_WRITES === \'1\'') || body.includes('AN_MIGRATE_WRITES === "1"'));
check('S4 saveAccount called', body.includes('saveAccount'));
check('S5 server route migrate/accounting/accounts', server.includes('/api/an/migrate/accounting/accounts'));
check('S6 catalog F5', api.includes('/api/an/migrate/accounting/accounts'));
check('S7 F4 balances route still present', server.includes('/api/an/migrate/inventory/balances'));
check('S8 Accounting.tsx still refers to CustodyDB heuristically', fs.readFileSync(path.join(root, 'src/pages/Accounting.tsx'), 'utf8').includes('CustodyDB'));
check('S9 cutoverApproved false in source', body.includes('cutoverApproved: false'));
check('S10 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S11 MERGE_STATUS F5', statusDoc.includes('F5'));
check('S12 mapKemitAccountToAn exported', body.includes('mapKemitAccountToAn'));
check('S13 no journal post in this module', !body.includes('saveJournalEntry') && !body.includes('postJournal'));
check('S14 listAccounts usage for idempotency', body.includes('listAccounts'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
