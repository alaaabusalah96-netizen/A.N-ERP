/**
 * @file verifySecProdRole.ts
 * SEC-PROD-ROLE: docs + boot refuse + role probe + optional enforce.
 * Run: npx tsx scripts/verifySecProdRole.ts
 * Strict: AN_ENFORCE_PROD_ROLE=1 DATABASE_URL=... npx tsx scripts/verifySecProdRole.ts
 */
import fs from 'fs';
import {
  interpretPgAppRoleRow,
  assertPgAppRoleSafe,
  PG_APP_ROLE_SQL,
  cleanPgConnectionString,
} from '../src/core/security/pgAppRoleGuard';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}${extra ? ' | ' + extra : ''}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function main() {
  check('S1 ops guide exists', fs.existsSync('docs/ops/PROD-PG-ROLE.md'));
  const g = fs.existsSync('docs/ops/PROD-PG-ROLE.md') ? fs.readFileSync('docs/ops/PROD-PG-ROLE.md', 'utf8') : '';
  check('S2 guide NOBYPASSRLS / CREATE ROLE', /NOBYPASSRLS/i.test(g) && /CREATE ROLE/i.test(g));
  check('S3 guide documents boot refuse', /Refusing to start|AN_ENFORCE_PROD_ROLE/i.test(g));
  check('S4 guard module exists', fs.existsSync('src/core/security/pgAppRoleGuard.ts'));

  const server = fs.readFileSync('server.ts', 'utf8');
  check('S5 server refuses start under AN_ENFORCE_PROD_ROLE', /AN_ENFORCE_PROD_ROLE/.test(server) && /Refusing to start/.test(server));
  check('S6 server checks rolbypassrls or rolsuper', /rolbypassrls/.test(server) && /rolsuper/.test(server));

  const soft = interpretPgAppRoleRow({ u: 'postgres', rolsuper: true, rolbypassrls: true });
  check('S7 interpret flags superuser unsafe', !soft.subjectToRls);
  check('S8 soft mode does not fail assert', assertPgAppRoleSafe(soft, { enforce: false }).ok);
  check('S9 enforce mode fails unsafe role', !assertPgAppRoleSafe(soft, { enforce: true }).ok);
  const safe = interpretPgAppRoleRow({ u: 'an_erp_app', rolsuper: false, rolbypassrls: false });
  check('S10 safe role subject to RLS', safe.subjectToRls && assertPgAppRoleSafe(safe, { enforce: true }).ok);

  const enforce = process.env.AN_ENFORCE_PROD_ROLE === '1';
  console.log(`[INFO] AN_ENFORCE_PROD_ROLE=${enforce ? '1' : '0'}`);

  if (!process.env.DATABASE_URL) {
    check('P0 DATABASE_URL unset — live probe skipped', true);
    console.log('SEC_PROD_ROLE_PG: SKIPPED');
  } else {
    try {
      const pg = await import('pg');
      const client = new pg.Client({ connectionString: cleanPgConnectionString(process.env.DATABASE_URL) });
      await client.connect();
      const r = await client.query(PG_APP_ROLE_SQL);
      const probe = interpretPgAppRoleRow(r.rows[0] || {});
      console.log('[INFO] PG role', JSON.stringify(probe));
      check('P1 role readable', !!probe.user, `user=${probe.user}`);
      const verdict = assertPgAppRoleSafe(probe, { enforce });
      if (!probe.subjectToRls) {
        console.log('[WARN] SEC_PROD_ROLE_PG: ROLE_BYPASSES_RLS');
      } else {
        console.log('[INFO] SEC_PROD_ROLE_PG: ROLE_SUBJECT_TO_RLS');
      }
      check('P2 role policy', verdict.ok, verdict.ok ? `user=${probe.user}` : (verdict as any).detail);
      // Isolation smoke: set tenant GUC then simple select (must not throw)
      await client.query("SELECT set_config('app.current_tenant_id', 'sec-prod-probe-a', true)");
      try {
        await client.query('SELECT 1 FROM an_tenants LIMIT 1');
        check('P3 SELECT under tenant GUC', true);
      } catch (e: any) {
        check('P3 SELECT under tenant GUC', false, String(e?.message || e).slice(0, 160));
      }
      await client.end();
    } catch (e: any) {
      check('P1 PG probe', false, String(e?.message || e).slice(0, 200));
      console.log('SEC_PROD_ROLE_PG: ERROR');
    }
  }

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
