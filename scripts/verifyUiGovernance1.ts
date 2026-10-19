/**
 * @file verifyUiGovernance1.ts
 * UI-GOVERNANCE-1 — approval policies + warehouse access UI.
 * Run: npx tsx scripts/verifyUiGovernance1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const view = fs.readFileSync('src/components/GovernanceView.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const side = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 GovernanceView exists', fs.existsSync('src/components/GovernanceView.tsx'));
check('S2 loads approval policies', /\/api\/approvals\/policies/.test(view));
check('S3 saves policy with PUT and Idempotency-Key', /method:\s*'PUT'/.test(view) && /Idempotency-Key/.test(view) && /approvals\/policies\//.test(view));
check('S4 warehouse access GET', /\/api\/inventory\/warehouse-access\//.test(view));
check('S5 warehouse access PUT warehouseIds', /warehouseIds/.test(view));
check('S6 credentials include', /credentials:\s*'include'/.test(view));
check('S7 Sidebar governance section', /governance/.test(side) && /سياسات الاعتماد/.test(side));
check('S8 App wires GovernanceView', /GovernanceView/.test(app));
check('S9 App renders governance section', /activeSection === 'governance'/.test(app));
check('S10 DOC types include GOODS_RECEIPT_SUPPLIER', /GOODS_RECEIPT_SUPPLIER/.test(view));
check('S11 package UI-GOVERNANCE-1 DONE', byId['UI-GOVERNANCE-1']?.status === 'DONE');
check('S12 UI-COMPANY-WIZARD-1 remains DONE', byId['UI-COMPANY-WIZARD-1']?.status === 'DONE');
check('S13 UI-COMPANY-SETTINGS-FIX remains DONE', byId['UI-COMPANY-SETTINGS-FIX']?.status === 'DONE');
check('S14 lastChange mentions UI-GOVERNANCE-1', String(reg.lastChange || '').includes('UI-GOVERNANCE-1'));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
