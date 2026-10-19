/**
 * @file verifyUiGroupReports1.ts
 * UI-GROUP-REPORTS-1 — group summary + consol TB UI.
 * Run: npx tsx scripts/verifyUiGroupReports1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const view = fs.readFileSync('src/components/GroupReportsView.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const side = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 GroupReportsView exists', fs.existsSync('src/components/GroupReportsView.tsx'));
check('S2 summary endpoint', /\/report\/summary/.test(view));
check('S3 consol trial-balance endpoint', /\/consol\/trial-balance/.test(view));
check('S4 credentials include', /credentials:\s*'include'/.test(view));
check('S5 Sidebar group_reports', /group_reports/.test(side) && /تقارير المجموعة/.test(side));
check('S6 App wires GroupReportsView', /GroupReportsView/.test(app));
check('S7 App renders group_reports', /activeSection === 'group_reports'/.test(app));
check('S8 asOfDate control', /asOfDate/.test(view));
check('S9 package UI-GROUP-REPORTS-1 DONE', byId['UI-GROUP-REPORTS-1']?.status === 'DONE');
check('S10 UI-XCOMPANY-1 remains DONE', byId['UI-XCOMPANY-1']?.status === 'DONE');
check('S11 UI-ORG-GROUPS-1 remains DONE', byId['UI-ORG-GROUPS-1']?.status === 'DONE');
check('S12 lastChange mentions UI-GROUP-REPORTS-1', String(reg.lastChange || '').includes('UI-GROUP-REPORTS-1'));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
