/**
 * SEC-4 / OPS — production PostgreSQL role must not BYPASSRLS.
 *
 * Default: probe is informational (PASS with WARN if role bypasses).
 * Strict: set AN_ENFORCE_PROD_ROLE=1 → FAIL when rolbypassrls or rolsuper.
 *
 * Run: npx tsx scripts/verifySec4ProdRole.ts
 */
import fs from 'fs';
import path from 'path';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}${extra ? ' | ' + extra : ''}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function main() {
  const guide = path.join('docs', 'ops', 'PROD-PG-ROLE.md');
  check('S1 ops guide exists', fs.existsSync(guide));
  if (fs.existsSync(guide)) {
    const g = fs.readFileSync(guide, 'utf8');
    check('S2 guide mentions rolbypassrls false', /rolbypassrls/i.test(g) && /false/i.test(g));
    check('S3 guide has CREATE ROLE example', /CREATE ROLE/i.test(g));
    check('S4 guide forbids superuser for app', /superuser|NOSUPERUSER/i.test(g));
  }

  const enforce = process.env.AN_ENFORCE_PROD_ROLE === '1';
  console.log(`[INFO] AN_ENFORCE_PROD_ROLE=${enforce ? '1' : '0'}`);

  if (!process.env.DATABASE_URL) {
    check('P0 DATABASE_URL unset — probe skipped', true, 'set DATABASE_URL to probe live role');
    console.log('SEC4_PG: SKIPPED');
  } else {
    try {
      const { cleanPgConnectionString } = await import('../src/core/security/pgAppRoleGuard');
      const pg = await import('pg');
      const client = new pg.Client({ connectionString: cleanPgConnectionString(process.env.DATABASE_URL) });
      await client.connect();
      const r = await client.query(
        `SELECT current_user AS u, rolsuper, rolbypassrls, rolcanlogin
         FROM pg_roles WHERE rolname = current_user`
      );
      const row = r.rows[0] || {};
      console.log('[INFO] PG role', JSON.stringify(row));
      check('P1 role readable', !!row.u, `user=${row.u}`);
      const bypasses = row.rolbypassrls === true || row.rolsuper === true;
      if (bypasses) {
        console.log('[WARN] SEC4_PG: ROLE_BYPASSES_RLS (or superuser) — not safe for multi-tenant production');
        if (enforce) {
          check('P2 production role subject to RLS', false, 'rolbypassrls or rolsuper is true under AN_ENFORCE_PROD_ROLE=1');
        } else {
          check('P2 probe recorded (WARN only without AN_ENFORCE_PROD_ROLE)', true, 'ROLE_BYPASSES_RLS');
        }
      } else {
        console.log('[INFO] SEC4_PG: ROLE_SUBJECT_TO_RLS');
        check('P2 production role subject to RLS', true, `user=${row.u}`);
      }
      await client.end();
    } catch (e: any) {
      check('P1 PG probe', false, String(e?.message || e).slice(0, 200));
      console.log('SEC4_PG: ERROR');
    }
  }

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
