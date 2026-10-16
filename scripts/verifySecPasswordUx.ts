/**
 * @file verifySecPasswordUx.ts
 * SEC-PASSWORD-UX-1 — static checks for forced password UX + admin temp password + self-change permission.
 * Run: npx tsx scripts/verifySecPasswordUx.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const srv = fs.readFileSync('server.ts', 'utf8');
const pm = fs.readFileSync('src/core/auth/PermissionMatrix.ts', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const force = fs.readFileSync('src/components/ForcePasswordChangeScreen.tsx', 'utf8');
const users = fs.readFileSync('src/components/UsersAndSodView.tsx', 'utf8');
const doc = fs.readFileSync('docs/SEC_PASSWORD_UX.md', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 PASSWORD_CHANGE_SELF in PermissionGroup', /'PASSWORD_CHANGE_SELF'/.test(pm));
check('S2 forced path allows change-password without self perm', /forced = !!auth\.requiresPasswordChange/.test(srv));
check('S3 self-change requires PASSWORD_CHANGE_SELF', /PASSWORD_CHANGE_SELF_REQUIRED/.test(srv));
check('S4 create accepts admin temporaryPassword', /adminTempPassword/.test(srv) && /temporaryPassword: adminTempPassword/.test(srv));
check('S5 reset accepts admin temporaryPassword', /reset-password[\s\S]{0,1200}adminTemp/.test(srv));
check('S6 ForcePasswordChangeScreen exists', /ForcePasswordChangeScreen/.test(force) && /change-password/.test(force));
check('S7 App gates on requiresPasswordChange', /currentUser\?\.requiresPasswordChange/.test(app) && /ForcePasswordChangeScreen/.test(app));
check('S8 App me bootstrap respects flag', /data\.requiresPasswordChange/.test(app));
check('S9 users form optional temporaryPassword', /temporaryPassword/.test(users) && /[ل]?لتوليد التلقائي/.test(users));
check('S10 min 12 on admin temp', /لا تقل عن 12/.test(srv));
check('S11 doc present', /SEC-PASSWORD-UX-1/.test(doc));
check('P package DONE', byId['SEC-PASSWORD-UX-1']?.status === 'DONE');
check('P lastChange', String(reg.lastChange || '').includes('SEC-PERM-OVERRIDE-1'));
check('R ORG-COMPANY-1 DONE', byId['ORG-COMPANY-1']?.status === 'DONE');
check('R SEC-SESSION-PASSWORD DONE', byId['SEC-SESSION-PASSWORD']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
