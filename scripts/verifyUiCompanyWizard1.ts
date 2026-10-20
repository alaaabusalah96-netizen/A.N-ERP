/**
 * @file verifyUiCompanyWizard1.ts
 * UI-COMPANY-WIZARD-1 — platform create-company wizard UI.
 * Run: npx tsx scripts/verifyUiCompanyWizard1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const view = fs.readFileSync('src/components/CompanyWizardView.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const side = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));
const server = fs.readFileSync('server.ts', 'utf8');

check('S1 CompanyWizardView exists', fs.existsSync('src/components/CompanyWizardView.tsx'));
check('S2 posts to /api/wizard/create-company', /\/api\/wizard\/create-company/.test(view));
check('S3 credentials include on create', /credentials:\s*'include'/.test(view));
check('S4 Idempotency-Key sent', /Idempotency-Key/.test(view));
check('S5 loads activity templates', /\/api\/wizard\/activity-templates/.test(view));
check('S6 payload includes firstAdmin and backendConfig', /firstAdmin/.test(view) && /backendConfig/.test(view));
check('S7 idempotencyKey in body', /idempotencyKey/.test(view));
check('S8 Sidebar/hub exposes company create', (/company_wizard/.test(side) || /platform_hub/.test(side)) && /إنشاء منشأة/.test(side + (fs.existsSync('src/components/PlatformHubView.tsx') ? fs.readFileSync('src/components/PlatformHubView.tsx','utf8') : '')));
check('S9 App imports CompanyWizardView or PlatformHubView', /CompanyWizardView/.test(app) || /PlatformHubView/.test(app));
check('S10 App renders company_wizard or platform_hub', /activeSection === 'company_wizard'/.test(app) || /activeSection === 'platform_hub'/.test(app));
check('S11 server route still platform-guarded', /create-company['"],\s*requirePlatformAdmin/.test(server) || /create-company',\s*requirePlatformAdmin/.test(server));
check('S12 package UI-COMPANY-WIZARD-1 DONE', byId['UI-COMPANY-WIZARD-1']?.status === 'DONE');
check('S13 previous UI-COMPANY-SETTINGS-FIX remains DONE', byId['UI-COMPANY-SETTINGS-FIX']?.status === 'DONE');
check('S14 package UI-COMPANY-WIZARD-1 remains DONE', byId['UI-COMPANY-WIZARD-1']?.status === 'DONE');

console.log(`
Passed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
