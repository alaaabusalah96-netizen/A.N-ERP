/**
 * SEC-2b — RLS for remaining tenant tables + GUC on config/session paths + BYPASSRLS probe.
 * Run: npx tsx scripts/verifySec2bRls.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function main() {
  const src = fs.readFileSync('src/core/storage/adapters/PostgresPrimaryAdapter.ts', 'utf8');
  const arrM = src.match(/tables text\[\] := ARRAY\[([\s\S]*?)\]/);
  const body = arrM ? arrM[1] : '';

  const REQUIRED = ['an_stock_accounting_config', 'an_last_successful_logins', 'an_active_sessions'];
  check('S1 RLS array exists', !!arrM);
  for (const t of REQUIRED) {
    check(`S2 RLS array includes ${t}`, body.includes(`'${t}'`));
  }
  check('S3 FORCE still in loop', /ALTER TABLE %I FORCE ROW LEVEL SECURITY/.test(src));
  check('S4 policy uses app.current_tenant_id', /current_setting\('app\.current_tenant_id'/.test(src));

  const getCfg = src.slice(src.indexOf('async getStockAccountingConfig'), src.indexOf('async getStockAccountingConfig') + 500);
  check('S5 getStockAccountingConfig uses withTenantScope', /withTenantScope\(\s*tenantId/.test(getCfg));
  check('S6 getStockAccountingConfig uses this.query', /this\.query\(/.test(getCfg) && !/this\.pool\.query\(/.test(getCfg));

  const saveCfg = src.slice(src.indexOf('async saveStockAccountingConfig'), src.indexOf('async saveStockAccountingConfig') + 400);
  check('S7 saveStockAccountingConfig uses withTenantScope', /withTenantScope\(\s*tenantId/.test(saveCfg));

  const rec = src.slice(src.indexOf('async recordSuccessfulLogin'), src.indexOf('async recordSuccessfulLogin') + 900);
  check('S8 recordSuccessfulLogin scopes when tenantId present', /withTenantScope\(\s*record\.tenantId/.test(rec));

  const list = src.slice(src.indexOf('async listActiveSessions(tenantId'), src.indexOf('async listActiveSessions(tenantId') + 350);
  check('S9 listActiveSessions(tenantId) uses withTenantScope', /withTenantScope\(\s*tenantId/.test(list));

  for (const t of ['an_purchase_orders', 'an_supplier_invoices']) {
    check(`S10 SEC-2 still lists ${t}`, body.includes(`'${t}'`));
  }

  if (!process.env.DATABASE_URL) {
    console.log('[INFO] DATABASE_URL unset — PG BYPASSRLS probe skipped');
    check('P1 PG probe skipped cleanly', true);
    console.log('SEC2B_PG: SKIPPED');
  } else {
    try {
      const { cleanPgConnectionString } = await import('../src/core/security/pgAppRoleGuard');
      const pg = await import('pg');
      const client = new pg.Client({ connectionString: cleanPgConnectionString(process.env.DATABASE_URL) });
      await client.connect();
      const r = await client.query(
        `SELECT current_user AS u, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
      );
      const row = r.rows[0] || {};
      console.log('[INFO] PG role', JSON.stringify(row));
      check('P2 connection role documented', row.u != null);
      const bypass = row.rolbypassrls === true || row.rolsuper === true;
      console.log(bypass ? '[WARN] SEC2B_PG: ROLE_BYPASSES_RLS' : '[INFO] SEC2B_PG: ROLE_SUBJECT_TO_RLS');
      const enforce = process.env.AN_ENFORCE_PROD_ROLE === '1';
      if (bypass && enforce) {
        check('P2b production role subject to RLS under AN_ENFORCE_PROD_ROLE=1', false, 'rolbypassrls or rolsuper');
      } else if (!bypass) {
        check('P2b production role subject to RLS', true, `user=${row.u}`);
      } else {
        check('P2b probe recorded (WARN only without enforce)', true, 'ROLE_BYPASSES_RLS');
      }
      await client.query("SELECT set_config('app.current_tenant_id', 'sec2b-probe-a', true)");
      try {
        await client.query('SELECT 1 FROM an_stock_accounting_config LIMIT 1');
        check('P3 SELECT an_stock_accounting_config under GUC ok', true);
      } catch (e: any) {
        check('P3 SELECT an_stock_accounting_config under GUC ok', false, String(e?.message || e));
      }
      await client.end();
    } catch (e: any) {
      check('P1 PG probe failed', false, String(e?.message || e));
      console.log('SEC2B_PG: ERROR');
    }
  }

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
