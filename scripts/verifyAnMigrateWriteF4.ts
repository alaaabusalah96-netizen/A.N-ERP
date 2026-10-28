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
const writePath = path.join(root, 'src/lib/anMigrateInventoryBalances.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const invPage = fs.readFileSync(path.join(root, 'src/pages/Inventory.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');

check('S1 anMigrateInventoryBalances exists', fs.existsSync(writePath));
const body = fs.readFileSync(writePath, 'utf8');
check('S2 migrateOpeningBalancesToAn exported', body.includes('migrateOpeningBalancesToAn'));
check('S3 AN_MIGRATE_WRITES gate in source', body.includes('AN_MIGRATE_WRITES === \'1\'') || body.includes('AN_MIGRATE_WRITES === "1"'));
check('S4 server route migrate/inventory/balances', server.includes('/api/an/migrate/inventory/balances'));
check('S5 catalog F4', api.includes('/api/an/migrate/inventory/balances'));
check('S6 F3 items route still present', server.includes('/api/an/migrate/inventory/items'));
check('S7 Inventory.tsx CustodyDB', invPage.includes('CustodyDB'));
check('S8 cutoverApproved false in source', body.includes('cutoverApproved: false'));
check('S9 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S10 MERGE_STATUS F4', statusDoc.includes('F4'));
check('S11 postStockDocumentAtomic called', body.includes('postStockDocumentAtomic'));
check('S12 documentType RECEIPT used', body.includes("'RECEIPT'") || body.includes('"RECEIPT"'));
check('S13 referenceType MIGRATE_OPENING used', body.includes("'MIGRATE_OPENING'") || body.includes('"MIGRATE_OPENING"'));
check('S14 skippedExisting logic present', body.includes('skippedExisting++') && body.includes('getWarehouseStock'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
