/**
 * @file verifyUiPlatformHub1.ts
 * UI-PLATFORM-HUB-1 — unified platform companies + groups UI.
 * Run: npx tsx scripts/verifyUiPlatformHub1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const hub = fs.readFileSync('src/components/PlatformHubView.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const side = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 PlatformHubView exists', fs.existsSync('src/components/PlatformHubView.tsx'));
check('S2 embeds CompanyWizardView', /CompanyWizardView/.test(hub));
check('S3 embeds OrgGroupsView', /OrgGroupsView/.test(hub));
check('S4 tab companies|groups', /companies/.test(hub) && /groups/.test(hub));
check('S5 labels إنشاء منشأة + مجموعات', /إنشاء منشأة/.test(hub) && /مجموعات الشركات/.test(hub));
check('S6 Sidebar platform_hub', /platform_hub/.test(side) && /المنصة: شركات ومجموعات/.test(side));
check('S7 App imports PlatformHubView', /PlatformHubView/.test(app));
check('S8 App renders platform_hub', /activeSection === 'platform_hub'/.test(app));
check('S9 company_wizard routes to hub', /activeSection === 'company_wizard'/.test(app) && /PlatformHubView/.test(app));
check('S10 org_groups routes to hub', /activeSection === 'org_groups'/.test(app));
check('S11 package UI-PLATFORM-HUB-1 DONE', byId['UI-PLATFORM-HUB-1']?.status === 'DONE');
check('S12 UI-TRANSFERS-HUB-1 remains DONE', byId['UI-TRANSFERS-HUB-1']?.status === 'DONE');
check('S13 UI-COMPANY-WIZARD-1 remains DONE', byId['UI-COMPANY-WIZARD-1']?.status === 'DONE');
check('S14 lastChange mentions UI-PLATFORM-HUB-1', String(reg.lastChange || '').includes('UI-PLATFORM-HUB-1'));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
