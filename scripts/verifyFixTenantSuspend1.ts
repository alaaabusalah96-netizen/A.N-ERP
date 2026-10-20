/**
 * @file verifyFixTenantSuspend1.ts
 * FIX-TENANT-SUSPEND-1 — suspended tenants cannot use sessions or login/refresh.
 * Run: npx tsx scripts/verifyFixTenantSuspend1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean) => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}`); }
};

const srv = fs.readFileSync('server.ts', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 requireAuth rejects non-ACTIVE tenant', /tenant\.status !== 'ACTIVE'/.test(srv) && /tenant-suspended/.test(srv));
check('S2 requireAuth message منشأة موقوفة', /تم إيقاف هذه المنشأة/.test(srv));
check('S3 login rejects suspended tenant', /auth\/login[\s\S]{0,1200}targetTenant\.status !== 'ACTIVE'/.test(srv) || /FIX-TENANT-SUSPEND-1: reject login[\s\S]{0,400}status !== 'ACTIVE'/.test(srv));
check('S4 refresh rejects suspended tenant', /\/api\/auth\/refresh[\s\S]{0,900}status !== 'ACTIVE'/.test(srv) || /do not rotate tokens for suspended/.test(srv));
check('S5 refresh clears cookies on suspend', /tenant-suspended[\s\S]{0,200}clearCookie\('an_access_token'/.test(srv) || /clearCookie\('an_access_token'[\s\S]{0,120}tenant-suspended/.test(srv) || /suspended[\s\S]{0,300}clearCookie\('an_refresh_token'/.test(srv));
check('S6 suspend path uses TENANT_SUSPENDED reason', /TENANT_SUSPENDED/.test(srv));
check('S7 suspend revokes session families', /revokeSessionAndFamily[\s\S]{0,40}TENANT_SUSPENDED|TENANT_SUSPENDED[\s\S]{0,40}revokeSessionAndFamily/.test(srv) || /revokeSessionAndFamily\(sess, 'TENANT_SUSPENDED'\)/.test(srv));
check('S8 tenants status route still present', /\/api\/tenants\/:id\/status/.test(srv));
check('S9 sessionsRevoked reported on suspend response', /sessionsRevoked/.test(srv));
check('S10 package FIX-TENANT-SUSPEND-1 DONE', byId['FIX-TENANT-SUSPEND-1']?.status === 'DONE');
check('S11 lastChange mentions FIX-TENANT-SUSPEND-1', String(reg.lastChange || '').includes('FIX-TENANT-SUSPEND-1'));
check('S12 prior FIX-SESSION-REVOKE-1 remains DONE', !byId['FIX-SESSION-REVOKE-1'] || byId['FIX-SESSION-REVOKE-1']?.status === 'DONE');
check('S13 problem type tenant-suspended', /errors\/tenant-suspended/.test(srv));
check('S14 login detail mentions موقوفة', /لا يمكن تسجيل الدخول إلى منشأة موقوفة/.test(srv));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
