/**
 * @file verifyF1StandardsPg.ts
 * @description Standards Intelligence F1 — REAL PostgreSQL gate. Needs DATABASE_URL; otherwise prints PG_NOT_RUN and exits 3.
 * Runs the shared suite on PostgresPrimaryAdapter, then proves what InMemory/fake clients cannot:
 * DB CHECK constraints, immutable (id, version) keys, advisory-lock serialization and RLS isolation.
 * Test rows use the ZZ-TEST- prefix (global reference tables are append-only by design, so fixtures stay).
 * Run:  npx tsx scripts/verifyF1StandardsPg.ts | tee evidence/standards-intelligence/battery-output-f1-pg.txt
 */
import dotenv from 'dotenv';
dotenv.config();
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { runF1Suite, Tally } from './lib/f1StandardsSuite';

const tally: Tally = { pass: 0, fail: 0 };
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { tally.pass++; console.log(`[PASS] ${label}`); } else { tally.fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};
const rejects = async (p: Promise<any>) => { try { await p; return false; } catch { return true; } };

async function main() {
  const pg: any = new PostgresPrimaryAdapter();
  const health = await pg.checkHealth();
  if (!health.connected) { console.log('PG_NOT_RUN: no PostgreSQL connection (DATABASE_URL missing/invalid). F1 is NOT closed.'); process.exit(3); }
  const init = await pg.initializeSchema();
  check('PG0 initializeSchema succeeds with the F1 tables (idempotent re-run)', init.success === true && (await pg.initializeSchema()).success === true, JSON.stringify(init.error || ''));

  const run = Date.now().toString(36);
  const tA = `zzf1a${run}`.slice(0, 40), tB = `zzf1b${run}`.slice(0, 40);
  for (const id of [tA, tB]) {
    const r = await pg.saveTenant({ id, code: id, nameAr: 'اختبار F1', baseCurrency: 'EGP', country: 'EG', backendConfig: { adapterType: 'postgresql', connectionRef: 'DATABASE_URL', isolationLevel: 'Shared' }, status: 'ACTIVE' }, `f1-tenant-${id}`);
    check(`PG1 test tenant ${id} created`, r.success === true, JSON.stringify(r.error || ''));
  }

  console.log('--- shared suite on PostgresPrimaryAdapter ---');
  await runF1Suite(pg, tA, tB, tally);

  console.log('--- DB-level proofs ---');
  const q = (sql: string, p: any[] = []) => pg.pool.query(sql, p);
  check('PGC1 DB CHECK: ACTIVE rule without a verified source is rejected by the database itself', await rejects(q(`INSERT INTO an_accounting_rules (rule_id, version, standard_id, framework, jurisdiction_id, event_type, priority, tier, effective_from, source_verified, status) VALUES ($1,1,'X','IFRS','J','GOODS_RECEIPT',1,2,'2024-01-01',FALSE,'ACTIVE')`, [`ZZ-TEST-${run}-DB1`])));
  check('PGC2 DB CHECK: ACTIVE rule with the unasserted-date sentinel is rejected', await rejects(q(`INSERT INTO an_accounting_rules (rule_id, version, standard_id, framework, jurisdiction_id, event_type, priority, tier, effective_from, source_reference, source_verified, status) VALUES ($1,1,'X','IFRS','J','GOODS_RECEIPT',1,2,'0001-01-01','src',TRUE,'ACTIVE')`, [`ZZ-TEST-${run}-DB2`])));
  check('PGC3 DB CHECK: IMPLEMENTED standard without evidence is rejected', await rejects(q(`INSERT INTO an_standards (standard_id, framework, version, title_en, coverage_status, effective_from, source_verified) VALUES ($1,'IFRS',1,'t','IMPLEMENTED','2024-01-01',TRUE)`, [`ZZ-TEST-${run}-DB3`])));
  check('PGC4 DB CHECK: tax rate without a verified source is rejected', await rejects(q(`INSERT INTO an_std_tax_rules (tax_rule_id, version, jurisdiction_id, tax_type, priority, rate, effective_from, source_verified, status) VALUES ($1,1,'J','VAT',1,0.14,'2024-01-01',FALSE,'DRAFT')`, [`ZZ-TEST-${run}-DB4`])));
  check('PGC5 DB primary key: a second row with the same (rule_id, version) cannot exist', await rejects(q(`INSERT INTO an_accounting_rules (rule_id, version, standard_id, framework, jurisdiction_id, event_type, priority, tier, effective_from, status) SELECT rule_id, version, standard_id, framework, jurisdiction_id, event_type, priority, tier, effective_from, 'DRAFT' FROM an_accounting_rules WHERE rule_id LIKE 'ZZ-TEST-%' LIMIT 1`)));

  const role = await q(`SELECT rolbypassrls OR rolsuper AS bypass FROM pg_roles WHERE rolname = current_user`);
  const bypass = !!role.rows[0]?.bypass;
  console.log(`INFO: DB role bypasses RLS = ${bypass}`);
  const probe = 'an_rls_probe_f1';
  let useProbe = false;
  if (bypass) {
    try {
      await q(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${probe}') THEN CREATE ROLE ${probe} NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$`);
      await q(`GRANT USAGE ON SCHEMA public TO ${probe}`);
      await q(`GRANT SELECT, INSERT ON an_accounting_policies TO ${probe}`);
      // PG16+: a CREATEROLE creator is not allowed to SET ROLE to the new role unless granted explicitly.
      try { await q(`GRANT ${probe} TO CURRENT_USER WITH SET TRUE`); } catch { try { await q(`GRANT ${probe} TO CURRENT_USER`); } catch { /* may already be a member */ } }
      useProbe = true;
    } catch (e: any) { console.log(`SKIP PGR1: app role bypasses RLS and a probe role could not be created (${e.message}). Isolation NOT proven (not counted as pass).`); }
  }
  if (!bypass || useProbe) {
    const c = await pg.pool.connect();
    try {
      await c.query('BEGIN');
      let ok = true;
      if (useProbe) { try { await c.query(`SET LOCAL ROLE ${probe}`); } catch (e: any) { ok = false; console.log(`SKIP PGR1: cannot switch to the probe role (${e.message}). Isolation NOT proven (not counted as pass).`); } }
      if (ok) {
        await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tA]);
        const own = await c.query('SELECT count(*)::int AS n FROM an_accounting_policies WHERE tenant_id = $1', [tA]);
        await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tB]);
        const seen = await c.query('SELECT count(*)::int AS n FROM an_accounting_policies WHERE tenant_id = $1', [tA]);
        const wr = await c.query(`INSERT INTO an_accounting_policies (id, tenant_id, policy_key, value, version, effective_from, created_by) VALUES ('zz-x-${run}', $1, 'fx_policy', 'x', 1, '2026-01-01', 'u')`, [tA]).then(() => false, () => true);
        check(`PGR1 RLS (${useProbe ? 'non-bypass probe role' : 'app role'}): own tenant sees its rows (control), other tenant sees 0 and cannot write into it`, own.rows[0].n > 0 && seen.rows[0].n === 0 && wr === true, `own=${own.rows[0].n} otherSees=${seen.rows[0].n} writeBlocked=${wr}`);
      }
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }
  if (useProbe) {
    try { await q(`REVOKE ALL ON an_accounting_policies FROM ${probe}`); await q(`REVOKE USAGE ON SCHEMA public FROM ${probe}`); await q(`DROP ROLE IF EXISTS ${probe}`); }
    catch (e: any) { console.log(`INFO: probe role cleanup skipped (${e.message})`); }
  }

  console.log(`\nPassed: ${tally.pass} | Failed: ${tally.fail}`);
  process.exit(tally.fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
