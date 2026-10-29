/**
 * Read-only probe: reports current_user rolsuper/rolbypassrls when AN_PG_ROLE_PROBE=1.
 */
import pg from 'pg';

async function main() {
  if (process.env.AN_PG_ROLE_PROBE !== '1' && process.env.AN_PG_ROLE_PROBE !== 'true') {
    console.log('SKIP probe (set AN_PG_ROLE_PROBE=1 to run)');
    process.exit(0);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const r = await client.query(
    `SELECT current_user AS user,
            rolsuper,
            rolbypassrls
     FROM pg_roles WHERE rolname = current_user`
  );
  console.log(JSON.stringify(r.rows[0] || {}, null, 2));
  const row = r.rows[0];
  if (row?.rolbypassrls === true) {
    console.error('FAIL: rolbypassrls=true — not safe for Shared RLS multi-tenant');
    await client.end();
    process.exit(2);
  }
  if (row?.rolsuper === true) {
    console.error('FAIL: rolsuper=true');
    await client.end();
    process.exit(2);
  }
  console.log('PASS: role is non-superuser and NOBYPASSRLS');
  await client.end();
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
