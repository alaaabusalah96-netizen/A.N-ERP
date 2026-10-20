/**
 * @file verifyUiOrgGroups1.ts
 * UI-ORG-GROUPS-1 — platform groups / members / group items UI.
 * Run: npx tsx scripts/verifyUiOrgGroups1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const view = fs.readFileSync('src/components/OrgGroupsView.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const side = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));
const server = fs.readFileSync('server.ts', 'utf8');

check('S1 OrgGroupsView exists', fs.existsSync('src/components/OrgGroupsView.tsx'));
check('S2 lists groups', /fetch\('\/api\/groups'/.test(view));
check('S3 creates group POST', /method:\s*'POST'/.test(view) && /\/api\/groups'/.test(view));
check('S4 adds members', /\/members'/.test(view) && /tenantId/.test(view));
check('S5 group items + publish', /\/items'/.test(view) && /\/publish'/.test(view));
check('S6 credentials + Idempotency-Key', /credentials:\s*'include'/.test(view) && /Idempotency-Key/.test(view));
check('S7 Sidebar/hub exposes groups', (/org_groups/.test(side) || /platform_hub/.test(side)) && /مجموعات الشركات/.test(side + (fs.existsSync('src/components/PlatformHubView.tsx') ? fs.readFileSync('src/components/PlatformHubView.tsx','utf8') : '')));
check('S8 App wires OrgGroupsView or PlatformHubView', /OrgGroupsView/.test(app) || /PlatformHubView/.test(app));
check('S9 App renders org_groups or platform_hub', /activeSection === 'org_groups'/.test(app) || /activeSection === 'platform_hub'/.test(app));
check('S10 server groups still platform-admin', /\/api\/groups',\s*requirePlatformAdmin/.test(server));
check('S11 package UI-ORG-GROUPS-1 DONE', byId['UI-ORG-GROUPS-1']?.status === 'DONE');
check('S12 UI-INV-CONFIG-1 remains DONE', byId['UI-INV-CONFIG-1']?.status === 'DONE');
check('S13 UI-GOVERNANCE-1 remains DONE', byId['UI-GOVERNANCE-1']?.status === 'DONE');
check('S14 package UI-ORG-GROUPS-1 remains DONE', byId['UI-ORG-GROUPS-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
