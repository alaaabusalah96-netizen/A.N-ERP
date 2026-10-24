/**
 * verifyMergeM2.ts — MERGE phase 2: company backend binding
 */
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
const bridgePath = path.join(root, 'src/lib/anBridge.ts');
const panelPath = path.join(root, 'src/components/settings/CompanyBackendPanel.tsx');
const typesPath = path.join(root, 'src/types.ts');
const generalPath = path.join(root, 'src/components/settings/SettingsGeneralTab.tsx');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const bridge = fs.readFileSync(bridgePath, 'utf8');
const types = fs.readFileSync(typesPath, 'utf8');
const general = fs.readFileSync(generalPath, 'utf8');

check('S1 anBridge exists', fs.existsSync(bridgePath));
check('S2 validateCompanyBackendSettings exported', bridge.includes('validateCompanyBackendSettings'));
check('S3 companyToBackendConfig exported', bridge.includes('companyToBackendConfig'));
check('S4 resolveCompanyBackend exported', bridge.includes('resolveCompanyBackend'));
check('S5 isolation_level in getCompanyBackendSettings', bridge.includes('isolation_level'));
check('S6 CompanyBackendPanel exists', fs.existsSync(panelPath));
check('S7 types has isolation_level', types.includes('isolation_level'));
check('S8 types has connection_ref', types.includes('connection_ref'));
check('S9 SettingsGeneralTab imports panel', general.includes('CompanyBackendPanel'));
check('S10 SettingsGeneralTab renders panel', general.includes('<CompanyBackendPanel'));
check('S11 server has /api/an/company-backend', server.includes('/api/an/company-backend'));
check('S12 server still has storage-status', server.includes('/api/an/storage-status'));
check('S13 an-core StorageRouter still present', fs.existsSync(path.join(root, 'src/an-core/storage/StorageRouter.ts')));
check('S14 Login.tsx still present', fs.existsSync(path.join(root, 'src/pages/Login.tsx')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
