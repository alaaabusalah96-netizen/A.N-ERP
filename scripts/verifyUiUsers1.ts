/**
 * @file verifyUiUsers1.ts
 * UI-USERS-1 — static: UsersAndSodView wires disable/reset/revoke to admin APIs.
 * Run: npx tsx scripts/verifyUiUsers1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const ui = fs.readFileSync('src/components/UsersAndSodView.tsx', 'utf8');
const srv = fs.readFileSync('server.ts', 'utf8');
const doc = fs.readFileSync('docs/UI_USERS_1.md', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 handleToggleStatus PATCH users', /handleToggleStatus/.test(ui) && /method:\s*'PATCH'/.test(ui));
check('S2 handleResetPassword route', /reset-password/.test(ui) && /handleResetPassword/.test(ui));
check('S3 handleRevokeSessions route', /revoke-sessions/.test(ui) && /handleRevokeSessions/.test(ui));
check('S4 status column UI', /نشط/.test(ui) && /معطّل/.test(ui));
check('S5 actions column', /إجراءات/.test(ui));
check('S6 requiresPasswordChange hint', /يلزم تغيير كلمة المرور/.test(ui));
check('S7 server PATCH still present', /app\.patch\('\/api\/users\/:id'/.test(srv));
check('S8 server reset-password present', /reset-password/.test(srv));
check('S9 server revoke-sessions present', /revoke-sessions/.test(srv));
check('S10 temporaryPassword in form state', /temporaryPassword:\s*''/.test(ui) || /temporaryPassword: ""/.test(ui));
check('S11 credentials include on list', /fetch\('\/api\/users',\s*\{\s*credentials:\s*'include'/.test(ui));
check('S12 doc UI-USERS-1', /UI-USERS-1/.test(doc));
check('P package DONE', byId['UI-USERS-1']?.status === 'DONE');
check('P lastChange', String(reg.lastChange || '').includes('UI-USERS-1'));
check('R SEC-PERM-OVERRIDE-1 DONE', byId['SEC-PERM-OVERRIDE-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
