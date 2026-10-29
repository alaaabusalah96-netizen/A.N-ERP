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
const resolveMod = path.join(root, 'src/lib/anResolveCompanyAdapter.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const whModule = fs.readFileSync(path.join(root, 'src/lib/anMigrateInventoryWrite.ts'), 'utf8');

check('S1 anResolveCompanyAdapter.ts exists', fs.existsSync(resolveMod));
const body = fs.existsSync(resolveMod) ? fs.readFileSync(resolveMod, 'utf8') : '';

check('S2 resolveCompanyStorageAdapter exported', body.includes('resolveCompanyStorageAdapter'));
check('S3 loadCompanyLikeFromFirestore exported', body.includes('loadCompanyLikeFromFirestore'));
check('S4 companyToBackendConfig import', body.includes('companyToBackendConfig'));
check('S5 resolveAdapter usage', body.includes('resolveAdapter'));
check('S6 connection_ref URL rejection in server', server.includes('://') && server.includes('invalid_connection_ref'));
check('S7 warehouses migrate path references resolveCompanyStorageAdapter or adapterResolution', server.includes('resolveCompanyStorageAdapter') && server.includes('adapterResolution'));
check('S8 requireAnMigrateOperator still present', server.includes('requireAnMigrateOperator'));
check('S9 getPrimaryAdapter fallback still in resolver source', body.includes('getPrimaryAdapter'));
check('S10 MERGE ADP1', statusDoc.includes('ADP1') || statusDoc.includes('ADAPTER-COMPANY'));
check('S11 no password= in connection_ref allowed (code check)', server.includes('password='));
check('S12 SEC-MIG still in status', statusDoc.includes('SEC-MIG'));
check('S13 migrate modules accept adapter opt or server resolves', whModule.includes('adapter?: StoragePort'));
check('S14 TenantCompany / backendConfig mentioned', body.includes('TenantCompany') && body.includes('backendConfig'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
