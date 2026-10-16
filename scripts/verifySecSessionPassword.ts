/**
 * @file verifySecSessionPassword.ts
 * SEC-SESSION-PASSWORD — static route + gate checks.
 * Run: npx tsx scripts/verifySecSessionPassword.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const srv = fs.readFileSync('server.ts', 'utf8');
const doc = fs.readFileSync('docs/SEC_SESSION_PASSWORD.md', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 change-password route exists', /app\.post\('\/api\/auth\/change-password',\s*requireAuth/.test(srv));
check('S2 sessions list route', /app\.get\('\/api\/auth\/sessions',\s*requireAuth/.test(srv));
check('S3 revoke-others route', /app\.post\('\/api\/auth\/sessions\/revoke-others',\s*requireAuth/.test(srv));
check('S4 gate PASSWORD_CHANGE_REQUIRED', /PASSWORD_CHANGE_REQUIRED/.test(srv) && /requiresPasswordChange/.test(srv));
check('S5 gate allows change-password path', /pathOnly === '\/api\/auth\/change-password'/.test(srv));
check('S6 login exposes requiresPasswordChange', /requiresPasswordChange:\s*!!user\.requiresPasswordChange/.test(srv));
check('S7 me exposes requiresPasswordChange', /requiresPasswordChange:\s*!!userRecord\?\.requiresPasswordChange/.test(srv));
check('S8 change-password uses argon2.verify and hash', /argon2\.verify/.test(srv) && /argon2\.hash\(newPassword/.test(srv));
check('S9 min password length 12', /newPassword\.length < 12/.test(srv));
check('S10 clears requiresPasswordChange on success', /requiresPasswordChange:\s*false/.test(srv));
check('S11 AuthContext field', /requiresPasswordChange\?:\s*boolean/.test(srv));
check('S12 doc present', /SEC-SESSION-PASSWORD/.test(doc));
check('P package DONE', byId['SEC-SESSION-PASSWORD']?.status === 'DONE');
check('P lastChange', String(reg.lastChange || '').includes('SEC-PERM-OVERRIDE-1'));
check('R SEC-AUTH-MATRIX still DONE', byId['SEC-AUTH-MATRIX']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
