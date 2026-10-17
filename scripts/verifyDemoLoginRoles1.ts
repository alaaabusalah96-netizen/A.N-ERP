/**
 * @file verifyDemoLoginRoles1.ts
 * DEMO-LOGIN-ROLES-1 — static: expanded seed users + login presets.
 * Run: npx tsx scripts/verifyDemoLoginRoles1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const srv = fs.readFileSync('server.ts', 'utf8');
const ls = fs.readFileSync('src/components/LoginScreen.tsx', 'utf8');
const doc = fs.readFileSync('docs/DEMO_LOGIN_ROLES_1.md', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

const users = ['accountant', 'approver', 'warehouse', 'whmanager', 'auditor', 'branch', 'sales', 'sysadmin'];
for (const u of users) {
  check(`S seed has ${u}`, new RegExp(`username:\\s*'${u}'`).test(srv));
}
check('S INITIAL_USER_PASSWORD still used', /INITIAL_USER_PASSWORD/.test(srv));
check('S DEMO_ROLE_PRESETS in LoginScreen', /DEMO_ROLE_PRESETS/.test(ls));
check('S presets include sysadmin', /sysadmin/.test(ls) && /auditor/.test(ls));
check('S grid maps presets', /DEMO_ROLE_PRESETS\.map/.test(ls));
check('S no fixed password in LoginScreen', !/password:\s*'[^']+'/.test(ls));
check('S doc', /DEMO-LOGIN-ROLES-1/.test(doc));
check('P package DONE', byId['DEMO-LOGIN-ROLES-1']?.status === 'DONE');
check('P lastChange', String(reg.lastChange || '').includes('DEMO-LOGIN-ROLES-1'));
check('R UI-AUDIT-PRINT-1 DONE', byId['UI-AUDIT-PRINT-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
