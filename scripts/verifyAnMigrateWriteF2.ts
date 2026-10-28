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
const writePath = path.join(root, 'src/lib/anMigrateInventoryWrite.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const invPage = fs.readFileSync(path.join(root, 'src/pages/Inventory.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const envEx = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

check('S1 anMigrateInventoryWrite exists', fs.existsSync(writePath));
const body = fs.readFileSync(writePath, 'utf8');
check('S2 mapKemitWarehouseToAn exported', body.includes('mapKemitWarehouseToAn'));
check('S3 migrateWarehousesToAn exported', body.includes('migrateWarehousesToAn'));
check('S4 AN_MIGRATE_WRITES gate in source', body.includes('AN_MIGRATE_WRITES === \'1\'') || body.includes('AN_MIGRATE_WRITES === "1"'));
check('S5 server route migrate/inventory/warehouses', server.includes('/api/an/migrate/inventory/warehouses'));
check('S6 catalog F2', api.includes('/api/an/migrate/inventory/warehouses'));
check('S7 dry-run F1 still present', server.includes('/api/an/migrate/inventory/dry-run'));
check('S8 Inventory.tsx CustodyDB', invPage.includes('CustodyDB'));
check('S9 cutoverApproved false in source', body.includes('cutoverApproved: false'));
check('S10 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S11 .env.example mentions AN_MIGRATE_WRITES', envEx.includes('AN_MIGRATE_WRITES'));
check('S12 no balance migrate in this module', !body.includes('WarehouseStock') && !body.includes('saveStock'));
check('S13 valuationMethod present', body.includes('valuationMethod:'));
check('S14 MERGE_STATUS F2', statusDoc.includes('F2'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
