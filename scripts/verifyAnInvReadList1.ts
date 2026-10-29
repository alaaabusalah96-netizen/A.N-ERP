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

check('S1 anInventoryLists exists', fs.existsSync(listMod));
const body = fs.existsSync(listMod) ? fs.readFileSync(listMod, 'utf8') : '';

check('S2 listAnWarehouses exported', body.includes('listAnWarehouses'));
check('S3 listAnStockItems exported', body.includes('listAnStockItems'));
check('S4 server routes defined', server.includes('/api/an/inventory/warehouses') && server.includes('/api/an/inventory/items'));
check('S5 authenticateSessionOrBearer near routes', /inventory\/warehouses[\s\S]{0,200}authenticateSessionOrBearer/.test(server));
check('S6 resolveCompanyStorageAdapter used', /inventory\/warehouses[\s\S]{0,600}resolveCompanyStorageAdapter/.test(server));
check('S7 catalog has list endpoints', catalogFile.includes('/api/an/inventory/warehouses') && catalogFile.includes('/api/an/inventory/items'));
check('S8 MERGE INV-L1', statusDoc.includes('INV-L1') || statusDoc.includes('INV-READ-LIST'));
check('S9 ADP1 file still present', fs.existsSync(adp1Mod));
check('S10 SEC requireAnMigrateOperator still present', server.includes('requireAnMigrateOperator'));
check('S11 no postStock in anInventoryLists', !body.includes('postStockDocument') && !body.includes('postStockTransfer'));
check('S12 InventoryModule still in Inventory.tsx', inventoryPage.includes('InventoryModule') || inventoryPage.includes('Custody'));
check('S13 session auth returned', server.includes('401') && server.includes('authenticateSessionOrBearer'));
check('S14 companyId required', server.includes('companyId required'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
