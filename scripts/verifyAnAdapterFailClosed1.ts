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

check('S1 anResolveCompanyAdapter.ts exists', fs.existsSync(resolveMod));
const body = fs.existsSync(resolveMod) ? fs.readFileSync(resolveMod, 'utf8') : '';

check('S2 CompanyLoadResult defined', body.includes('CompanyLoadResult'));
check('S3 loadCompanyLikeFromFirestore returns status', body.includes('status: \'loaded\'') && body.includes('status: \'error\''));
check('S4 isAdapterFailClosedEnv defined', body.includes('isAdapterFailClosedEnv'));
check('S5 failClosed handled in resolveCompanyStorageAdapter', body.includes('failClosed'));
check('S6 ADAPTER_COMPANY_LOAD_FAILED error string', body.includes('ADAPTER_COMPANY_LOAD_FAILED'));
check('S7 server checks loadResult status error', server.includes('loadResult.status === "error"') || server.includes('loadResult.status === \'error\''));
check('S8 adapter_company_load_failed code in server', server.includes('adapter_company_load_failed'));
check('S9 MERGE ADP-FC1 in status doc', statusDoc.includes('ADP-FC1') || statusDoc.includes('ADAPTER-FAIL-CLOSED'));
check('S10 process_primary fallback exists for missing', body.includes('process_primary'));
check('S11 inventory stock route still present', server.includes('/api/an/inventory/stock'));
check('S12 migrate warehouses route still present', server.includes('/api/an/migrate/inventory/warehouses'));
check('S13 SEC scope still present', server.includes('assertUserCanAccessCompany'));
check('S14 failClosed options passed in server', server.includes('loadStatus') || server.includes('failClosed'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
