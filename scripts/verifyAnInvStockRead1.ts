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
const listMod = path.join(root, 'src/lib/anInventoryLists.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const catalogFile = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const adp1Mod = path.join(root, 'src/lib/anResolveCompanyAdapter.ts');
const inventoryPage = fs.readFileSync(path.join(root, 'src/pages/Inventory.tsx'), 'utf8');

const body = fs.existsSync(listMod) ? fs.readFileSync(listMod, 'utf8') : '';

check('S1 listAnStockBalances exported', body.includes('listAnStockBalances'));
check('S2 route /api/an/inventory/stock defined', server.includes('/api/an/inventory/stock'));
check('S3 auth check near stock route', /inventory\/stock[\s\S]{0,200}authenticateSessionOrBearer/.test(server));
check('S4 resolveCompany used near stock route', /inventory\/stock[\s\S]{0,1200}resolveCompanyStorageAdapter/.test(server));
check('S5 listWarehouseStock called', body.includes('listWarehouseStock'));
check('S6 MERGE INV-S1 in status doc', statusDoc.includes('INV-S1') || statusDoc.includes('INV-STOCK-READ'));
check('S7 no postStockDocument in list module', !body.includes('postStockDocument') && !body.includes('postStockTransfer'));
check('S8 warehouses route still present', server.includes('/api/an/inventory/warehouses'));
check('S9 SEC migrate still present', server.includes('requireAnMigrateOperator'));
check('S10 ADP1 still present', fs.existsSync(adp1Mod));
check('S11 credentials session required', server.includes('401') && server.includes('authenticateSessionOrBearer'));
check('S12 companyId required on stock route', /inventory\/stock[\s\S]{0,600}companyId required/.test(server));
check('S13 itemId optional query supported', server.includes('req.query.itemId'));
check('S14 InventoryModule retained in Inventory.tsx', inventoryPage.includes('InventoryModule') || inventoryPage.includes('Custody'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
