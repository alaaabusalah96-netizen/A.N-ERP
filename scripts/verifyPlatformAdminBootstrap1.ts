/**
 * @file verifyPlatformAdminBootstrap1.ts
 * PLATFORM-ADMIN-BOOTSTRAP-1 — strict platform admin bootstrap (static + module contract).
 * Run: npx tsx scripts/verifyPlatformAdminBootstrap1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean) => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}`); }
};

const srv = fs.readFileSync('server.ts', 'utf8');
const modPath = 'src/core/auth/platformAdminBootstrap.ts';
const boot = fs.readFileSync(modPath, 'utf8');
const envEx = fs.existsSync('.env.example') ? fs.readFileSync('.env.example', 'utf8') : '';
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));
const seedFn = (() => {
  const i = srv.indexOf('async function initSeedUsers');
  const j = srv.indexOf('async function startServer', i);
  return srv.slice(i, j);
})();
const guardSlice = (() => {
  const i = srv.indexOf('Startup Fail-Fast Guard');
  return srv.slice(i, i + 1800);
})();

check('S1 module exports bootstrapPlatformAdmin', /export async function bootstrapPlatformAdmin/.test(boot));
check('S2 role super_admin (baseline privileged)', /role:\s*'super_admin'/.test(boot));
check('S3 Argon2id hash', /argon2id/.test(boot));
check('S4 fail-closed nonprivileged same username', /platform-admin-username-conflict-nonprivileged/.test(boot));
check('S5 fail-closed other privileged account', /platform-admin-legacy-privileged-exists/.test(boot));
check('S6 never resets password on exists', /already_exists/.test(boot) && !/SEED_FORCE_RESET/.test(boot));
check('S7 no defaultStandardUsers in server', !/defaultStandardUsers/.test(srv));
check('S8 no hard-coded seed username admin create path', !/username:\s*'admin'/.test(seedFn));
check('S9 requireEnv PLATFORM_ADMIN_USERNAME+PASSWORD', /requireEnv\('PLATFORM_ADMIN_USERNAME'\)/.test(srv) && /requireEnv\('PLATFORM_ADMIN_PASSWORD'\)/.test(srv));
check('S10 SEED_ADMIN and INITIAL_USER not required at boot', !/requireEnv\('SEED_ADMIN_PASSWORD'\)/.test(srv) && !/requireEnv\('INITIAL_USER_PASSWORD'\)/.test(srv));
check('S11 fail-fast no longer requires accountant/warehouse', !/needed = \['admin', 'accountant'/.test(guardSlice) && !/accountant', 'approver', 'warehouse'/.test(guardSlice));
check('S12 fail-fast validates PLATFORM_ADMIN_USERNAME', /PLATFORM_ADMIN_USERNAME/.test(guardSlice));
check('S13 package DONE', byId['PLATFORM-ADMIN-BOOTSTRAP-1']?.status === 'DONE');
check('S14 .env.example has PLATFORM_ADMIN_* placeholders only', /PLATFORM_ADMIN_USERNAME=""/.test(envEx) && /PLATFORM_ADMIN_PASSWORD=""/.test(envEx));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
