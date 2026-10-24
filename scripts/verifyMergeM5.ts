/**
 * verifyMergeM5.ts — A.N core status UI in Settings
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
const panelPath = path.join(root, 'src/components/settings/AnCoreStatusPanel.tsx');
const general = fs.readFileSync(path.join(root, 'src/components/settings/SettingsGeneralTab.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');

check('S1 AnCoreStatusPanel exists', fs.existsSync(panelPath));
const panel = fs.readFileSync(panelPath, 'utf8');
check('S2 panel uses getAnStorageStatus', panel.includes('getAnStorageStatus'));
check('S3 panel fetches /routes via AN_API_PREFIX', panel.includes('AN_API_PREFIX') && panel.includes('/routes'));
check('S4 SettingsGeneralTab imports panel', general.includes('AnCoreStatusPanel'));
check('S5 SettingsGeneralTab renders panel', general.includes('<AnCoreStatusPanel'));
check('S6 CompanyBackendPanel still present', general.includes('CompanyBackendPanel'));
check('S7 AuthPolicyNote still present', general.includes('AuthPolicyNote'));
check('S8 no second Login page for A.N', !fs.existsSync(path.join(root, 'src/pages/AnLogin.tsx')));
check('S9 App still has Settings page', app.includes("import('./pages/Settings')") || app.includes('pages/Settings'));
check('S10 Login path unchanged', login.includes('/api/auth/verify-credentials'));
check('S11 anApi still present', fs.existsSync(path.join(root, 'src/lib/anApi.ts')));
check('S12 anBridge still present', fs.existsSync(path.join(root, 'src/lib/anBridge.ts')));
check('S13 verifyMergeM4 present', fs.existsSync(path.join(root, 'scripts/verifyMergeM4.ts')));
check('S14 panel is settings-scoped (MERGE-M5 comment)', panel.includes('MERGE-M5'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
