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
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const inventoryPage = fs.readFileSync(path.join(root, 'src/pages/Inventory.tsx'), 'utf8');
const adp1Mod = path.join(root, 'src/lib/anResolveCompanyAdapter.ts');

check('S1 assertUserCanAccessCompany in server', server.includes('assertUserCanAccessCompany'));
check('S2 userMayAccessCompany in server', server.includes('userMayAccessCompany'));
check('S3 company_scope_denied', server.includes('company_scope_denied'));
check('S4 warehouses handler calls assertUserCanAccessCompany', /inventory\/warehouses[\s\S]{0,600}assertUserCanAccessCompany/.test(server));
check('S5 items handler calls assertUserCanAccessCompany', /inventory\/items[\s\S]{0,600}assertUserCanAccessCompany/.test(server));
check('S6 stock handler calls assertUserCanAccessCompany', /inventory\/stock[\s\S]{0,600}assertUserCanAccessCompany/.test(server));
check('S7 isPlatformAdminUser still used', server.includes('isPlatformAdminUser'));
check('S8 authenticateSessionOrBearer still on reads', /inventory\/warehouses[\s\S]{0,300}authenticateSessionOrBearer/.test(server));
check('S9 MERGE SEC-SCOPE', statusDoc.includes('SEC-SCOPE') || statusDoc.includes('SEC-COMPANY-SCOPE'));
check('S10 requireAnMigrateOperator still present', server.includes('requireAnMigrateOperator'));
check('S11 companyId required present', server.includes('company_id_required') || server.includes('companyId required'));
check('S12 Inventory page still exists', inventoryPage.length > 0);
check('S13 elevated roles SystemAdmin check', server.includes('SystemAdmin'));
check('S14 ADP1 resolve still present', fs.existsSync(adp1Mod));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
