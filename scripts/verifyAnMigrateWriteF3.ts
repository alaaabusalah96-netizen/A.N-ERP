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
const writePath = path.join(root, 'src/lib/anMigrateInventoryItems.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const invPage = fs.readFileSync(path.join(root, 'src/pages/Inventory.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');

check('S1 anMigrateInventoryItems exists', fs.existsSync(writePath));
const body = fs.readFileSync(writePath, 'utf8');
check('S2 migrateStockItemsToAn exported', body.includes('migrateStockItemsToAn'));
check('S3 mapKemitProductToAn exported', body.includes('mapKemitProductToAn'));
check('S4 AN_MIGRATE_WRITES gate in source', body.includes('AN_MIGRATE_WRITES === \'1\'') || body.includes('AN_MIGRATE_WRITES === "1"'));
check('S5 server route migrate/inventory/items', server.includes('/api/an/migrate/inventory/items'));
check('S6 catalog F3', api.includes('/api/an/migrate/inventory/items'));
check('S7 F2 warehouses route still present', server.includes('/api/an/migrate/inventory/warehouses'));
check('S8 Inventory.tsx CustodyDB', invPage.includes('CustodyDB'));
check('S9 cutoverApproved false in source', body.includes('cutoverApproved: false'));
check('S10 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S11 no WarehouseStock write in this module', !body.includes('WarehouseStock') && !body.includes('saveStockDocument'));
check('S12 MERGE_STATUS F3', statusDoc.includes('F3'));
check('S13 saveStockItem called', body.includes('saveStockItem'));
check('S14 default account codes present', body.includes('1105') && body.includes('5101'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
