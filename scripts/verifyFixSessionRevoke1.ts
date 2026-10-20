/**
 * @file verifyFixSessionRevoke1.ts
 * FIX-SESSION-REVOKE-1 — session revoke invalidates token families; auth requires live session.
 * Run: npx tsx scripts/verifyFixSessionRevoke1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const ts = fs.readFileSync('src/core/auth/TokenService.ts', 'utf8');
const srv = fs.readFileSync('server.ts', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 fail-closed when family lookup fails', /!familyRes\.success/.test(ts) && /تعذر التحقق من حالة الجلسة/.test(ts));
check('S2 reject missing family data', /!familyRes\.data/.test(ts) && /غير معروفة/.test(ts));
check('S3 still reject invalidated family', /isInvalidated/.test(ts));
check('S4 revokeSessionAndFamily helper', /revokeSessionAndFamily/.test(ts));
check('S5 revokeSessionsForUser helper', /revokeSessionsForUser/.test(ts));
check('S6 revoke-others uses revokeSessionsForUser', /revoke-others[\s\S]{0,500}revokeSessionsForUser/.test(srv));
check('S7 requireAuth checks getActiveSession', /getActiveSession\(ver\.payload\.sessionId\)/.test(srv));
check('S8 requireAuth rejects missing session', /تم إنهاء هذه الجلسة/.test(srv));
check('S9 password reset revokes families', /PASSWORD_RESET/.test(srv) && /revokeSessionsForUser/.test(srv));
check('S10 TokenService.revokeFamily still present', /async revokeFamily/.test(ts));
check('S11 package FIX-SESSION-REVOKE-1 DONE', byId['FIX-SESSION-REVOKE-1']?.status === 'DONE');
check('S12 lastChange mentions FIX-SESSION-REVOKE-1', String(reg.lastChange || '').includes('FIX-SESSION-REVOKE-1'));
check('S13 revoke-others reason USER_REVOKE_OTHERS', /USER_REVOKE_OTHERS/.test(srv));
check('S14 no success-only path without family check in verifyAccessToken', /getTokenFamily\(payload\.familyId\)/.test(ts) && !/if \(familyRes\.success && familyRes\.data\?\.isInvalidated\)/.test(ts));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
