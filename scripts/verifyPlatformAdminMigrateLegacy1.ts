/**
 * @file verifyPlatformAdminMigrateLegacy1.ts
 * PLATFORM-ADMIN-MIGRATE-LEGACY-1 — opt-in legacy platform-admin migration.
 * Run: npx tsx scripts/verifyPlatformAdminMigrateLegacy1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean) => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}`); }
};

const boot = fs.readFileSync('src/core/auth/platformAdminBootstrap.ts', 'utf8');
const srv = fs.readFileSync('server.ts', 'utf8');
const envEx = fs.existsSync('.env.example') ? fs.readFileSync('.env.example', 'utf8') : '';
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 migratePlatformAdminLegacy exported', /export async function migratePlatformAdminLegacy/.test(boot));
check('S2 deactivates other privileged to INACTIVE', /status: 'INACTIVE'/.test(boot) && /deactivated/.test(boot));
check('S3 syncs password hash on existing username', /migrated_synced/.test(boot));
check('S4 creates when missing', /migrated_created/.test(boot));
check('S5 server gates on PLATFORM_ADMIN_MIGRATE_LEGACY', /PLATFORM_ADMIN_MIGRATE_LEGACY/.test(srv));
check('S6 migrate only when flag 1/true', /MIGRATE_LEGACY === '1'/.test(srv) || /MIGRATE_LEGACY === "1"/.test(srv));
check('S7 default path still bootstrapPlatformAdmin', /bootstrapPlatformAdmin\(/.test(srv));
check('S8 reminds to disable flag after login', /set it back to 0/.test(srv));
check('S9 package DONE', byId['PLATFORM-ADMIN-MIGRATE-LEGACY-1']?.status === 'DONE');
check('S10 lastChange mentions package', String(reg.lastChange || '').includes('PLATFORM-ADMIN-MIGRATE-LEGACY-1'));
check('S11 .env.example documents flag', /PLATFORM_ADMIN_MIGRATE_LEGACY/.test(envEx));
check('S12 bootstrap still fail-closed without flag', /platform-admin-legacy-privileged-exists/.test(boot));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
