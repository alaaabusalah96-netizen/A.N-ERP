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
  check('PGC5 DB primary key: a second row with the same (rule_id, version) cannot exist', await rejects(q(`INSERT INTO an_accounting_rules (rule_id, version, standard_id, framework, jurisdiction_id, event_type, priority, tier, effective_from, status) SELECT rule_id, version, standard_id, framework, jurisdiction_id, event_type, priority, tier, effective_from, 'DRAFT' FROM an_accounting_rules WHERE rule_id LIKE $1 LIMIT 1`, [`ZZ-TEST-${run}%`])));

  const role = await q(`SELECT rolbypassrls OR rolsuper AS bypass FROM pg_roles WHERE rolname = current_user`);
  const bypass = !!role.rows[0]?.bypass;
  console.log(`INFO: DB role bypasses RLS = ${bypass}`);
  if (bypass) { console.log('SKIP PGR1: current DB role bypasses RLS, cross-tenant isolation cannot be proven with this role (not counted as pass).'); }
  else {
    const c = await pg.pool.connect();
    try {
      await c.query('BEGIN'); await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tB]);
      const seen = await c.query('SELECT count(*)::int AS n FROM an_accounting_policies WHERE tenant_id = $1', [tA]);
      const wr = await c.query('SAVEPOINT s').then(() => c.query(`INSERT INTO an_accounting_policies (id, tenant_id, policy_key, value, version, effective_from, created_by) VALUES ('zz-x-${run}', $1, 'fx_policy', 'x', 1, '2026-01-01', 'u')`, [tA])).then(() => false, () => true);
      await c.query('ROLLBACK');
      check('PGR1 RLS: tenant B cannot read tenant A policies and cannot write rows for tenant A', seen.rows[0].n === 0 && wr === true, `visible=${seen.rows[0].n} writeBlocked=${wr}`);
    } finally { c.release(); }
  }

  console.log(`\nPassed: ${tally.pass} | Failed: ${tally.fail}`);
  process.exit(tally.fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
