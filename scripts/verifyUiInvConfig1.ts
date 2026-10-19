/**
 * @file verifyUiInvConfig1.ts
 * UI-INV-CONFIG-1 — inventory settings + accounting config + barcode UI.
 * Run: npx tsx scripts/verifyUiInvConfig1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const view = fs.readFileSync('src/components/InvConfigView.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const side = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 InvConfigView exists', fs.existsSync('src/components/InvConfigView.tsx'));
check('S2 GET/PUT inventory settings', /\/api\/inventory\/settings/.test(view));
check('S3 GET/PUT accounting-config', /\/api\/inventory\/accounting-config/.test(view));
check('S4 barcode search endpoint', /\/api\/inventory\/items\/search\/barcode/.test(view));
check('S5 Idempotency-Key on saves', /Idempotency-Key/.test(view));
check('S6 credentials include', /credentials:\s*'include'/.test(view));
check('S7 Sidebar inv_config', /inv_config/.test(side) && /إعدادات المخزون/.test(side));
check('S8 App wires InvConfigView', /InvConfigView/.test(app));
check('S9 App renders inv_config', /activeSection === 'inv_config'/.test(app));
check('S10 valuation method control', /defaultValuationMethod|FIFO/.test(view));
check('S11 package UI-INV-CONFIG-1 DONE', byId['UI-INV-CONFIG-1']?.status === 'DONE');
check('S12 UI-GOVERNANCE-1 remains DONE', byId['UI-GOVERNANCE-1']?.status === 'DONE');
check('S13 UI-COMPANY-WIZARD-1 remains DONE', byId['UI-COMPANY-WIZARD-1']?.status === 'DONE');
check('S14 lastChange mentions UI-INV-CONFIG-1', String(reg.lastChange || '').includes('UI-INV-CONFIG-1'));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
