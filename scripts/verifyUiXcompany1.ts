/**
 * @file verifyUiXcompany1.ts
 * UI-XCOMPANY-1 — cross-company transfer UI.
 * Run: npx tsx scripts/verifyUiXcompany1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const view = fs.readFileSync('src/components/XcompanyView.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const side = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));
const server = fs.readFileSync('server.ts', 'utf8');

check('S1 XcompanyView exists', fs.existsSync('src/components/XcompanyView.tsx'));
check('S2 lists transfers', /\/api\/xcompany\/transfers/.test(view));
check('S3 creates transfer POST', /method:\s*'POST'/.test(view) && /groupId/.test(view));
check('S4 dispatch action', /\/dispatch'/.test(view));
check('S5 receive action', /\/receive'/.test(view));
check('S6 credentials + Idempotency-Key', /credentials:\s*'include'/.test(view) && /Idempotency-Key/.test(view));
check('S7 Sidebar xcompany', /xcompany/.test(side) && /تحويل بين شركات/.test(side));
check('S8 App wires XcompanyView', /XcompanyView/.test(app));
check('S9 App renders xcompany', /activeSection === 'xcompany'/.test(app));
check('S10 server xcompany platform-admin', /xcompany\/transfers['"],\s*requirePlatformAdmin/.test(server) || /xcompany\/transfers',\s*requirePlatformAdmin/.test(server));
check('S11 package UI-XCOMPANY-1 DONE', byId['UI-XCOMPANY-1']?.status === 'DONE');
check('S12 UI-ORG-GROUPS-1 remains DONE', byId['UI-ORG-GROUPS-1']?.status === 'DONE');
check('S13 UI-INV-CONFIG-1 remains DONE', byId['UI-INV-CONFIG-1']?.status === 'DONE');
check('S14 lastChange mentions UI-XCOMPANY-1', String(reg.lastChange || '').includes('UI-XCOMPANY-1'));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
