/**
 * @file verifySecUserAdmin.ts
 * SEC-USER-ADMIN — static checks for admin user management routes.
 * Run: npx tsx scripts/verifySecUserAdmin.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const srv = fs.readFileSync('server.ts', 'utf8');
const doc = fs.readFileSync('docs/SEC_USER_ADMIN.md', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 PATCH /api/users/:id + USER_MANAGE', /app\.patch\('\/api\/users\/:id',\s*requireAuth,\s*requirePermission\('USER_MANAGE'\)/.test(srv));
check('S2 reset-password route', /app\.post\('\/api\/users\/:id\/reset-password',\s*requireAuth,\s*requirePermission\('USER_MANAGE'\)/.test(srv));
check('S3 revoke-sessions route', /app\.post\('\/api\/users\/:id\/revoke-sessions',\s*requireAuth,\s*requirePermission\('USER_MANAGE'\)/.test(srv));
check('S4 cannot deactivate self', /لا يمكنك تعطيل حسابك الحالي/.test(srv));
check('S5 reset sets requiresPasswordChange true', /reset-password[\s\S]{0,2000}requiresPasswordChange:\s*true/.test(srv));
check('S6 reset returns temporaryPassword once', /temporaryPassword[\s\S]{0,200}requiresPasswordChange:\s*true/.test(srv));
check('S7 list users exposes status', /status:\s*u\.status/.test(srv));
check('S8 list users exposes requiresPasswordChange', /requiresPasswordChange:\s*!!u\.requiresPasswordChange/.test(srv));
check('S9 create user still requiresPasswordChange', /requiresPasswordChange:\s*true/.test(srv) && /temporaryPassword/.test(srv));
check('S10 tenant isolation on patch', /existing\.data\.tenantId !== tenantId/.test(srv));
check('S11 doc SEC-USER-ADMIN', /SEC-USER-ADMIN/.test(doc));
check('P package DONE', byId['SEC-USER-ADMIN']?.status === 'DONE');
check('P lastChange', String(reg.lastChange || '').includes('UI-OPS-1'));
check('R SEC-SESSION-PASSWORD DONE', byId['SEC-SESSION-PASSWORD']?.status === 'DONE');
check('R SEC-AUTH-MATRIX DONE', byId['SEC-AUTH-MATRIX']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
