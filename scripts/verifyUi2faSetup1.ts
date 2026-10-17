/**
 * @file verifyUi2faSetup1.ts
 * UI-2FA-SETUP-1 — static: profile wires 2FA setup/verify and self sessions.
 * Run: npx tsx scripts/verifyUi2faSetup1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const ui = fs.readFileSync('src/components/UserProfileView.tsx', 'utf8');
const srv = fs.readFileSync('server.ts', 'utf8');
const doc = fs.readFileSync('docs/UI_2FA_SETUP_1.md', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 start setup calls /api/auth/2fa/setup', /\/api\/auth\/2fa\/setup/.test(ui));
check('S2 verify-setup', /\/api\/auth\/2fa\/verify-setup/.test(ui));
check('S3 QR display', /qrCodeDataUrl/.test(ui) && /img/.test(ui));
check('S4 not always showing enabled', /التحقق الثنائي غير مفعّل/.test(ui));
check('S5 self sessions path', /\/api\/auth\/sessions/.test(ui));
check('S6 revoke-others', /revoke-others/.test(ui));
check('S7 server setup route', /app\.post\('\/api\/auth\/2fa\/setup'/.test(srv));
check('S8 server verify-setup', /app\.post\('\/api\/auth\/2fa\/verify-setup'/.test(srv));
check('S9 doc', /UI-2FA-SETUP-1/.test(doc));
check('P package DONE', byId['UI-2FA-SETUP-1']?.status === 'DONE');
check('P lastChange', String(reg.lastChange || '').includes('UI-AUDIT-PRINT-1'));
check('R UI-P2P-1 DONE', byId['UI-P2P-1']?.status === 'DONE');
check('R UI-OPS-1 DONE', byId['UI-OPS-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
