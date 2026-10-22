/**
 * @file verifyDemoLoginUiRemove1.ts
 * DEMO-LOGIN-UI-REMOVE-1 — no quick-login role presets on LoginScreen.
 * Run: npx tsx scripts/verifyDemoLoginUiRemove1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean) => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}`); }
};

const login = fs.readFileSync('src/components/LoginScreen.tsx', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 no DEMO_ROLE_PRESETS', !/DEMO_ROLE_PRESETS/.test(login));
check('S2 no handleRolePreset', !/handleRolePreset/.test(login));
check('S3 no accountant default username', !/useState\('accountant'\)/.test(login));
check('S4 username default empty', /useState\(''\)/.test(login));
check('S5 no INITIAL_USER_PASSWORD hint on login UI', !/INITIAL_USER_PASSWORD/.test(login));
check('S6 no quick-login operational label', !/الحساب التشغيلي للدخول السريع/.test(login));
check('S7 placeholder not demo list', !/accountant \/ approver/.test(login));
check('S8 login form still present', /onLoginSuccess/.test(login) || /password/.test(login));
check('S9 package DONE', byId['DEMO-LOGIN-UI-REMOVE-1']?.status === 'DONE');
check('S10 lastChange mentions package', String(reg.lastChange || '').includes('DEMO-LOGIN-UI-REMOVE-1'));
check('S11 prior PLATFORM-ADMIN-BOOTSTRAP-1 DONE', byId['PLATFORM-ADMIN-BOOTSTRAP-1']?.status === 'DONE');
check('S12 Role Presets section removed', !/\{\/\* Role Presets \*\/\}/.test(login));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
