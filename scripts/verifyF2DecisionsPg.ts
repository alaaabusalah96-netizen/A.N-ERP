/**
 * @file verifyF2DecisionsPg.ts
 * @description Standards Intelligence F2 — REAL PostgreSQL gate. Needs DATABASE_URL, otherwise prints PG_NOT_RUN and exits 3.
 * Runs the shared F2 suite on PostgresPrimaryAdapter, then proves what InMemory cannot: DB CHECK constraints on the decision
 * record, one-row-per-key under concurrency, the one-way journal link under a race, and RLS isolation (via a non-bypass probe role).
 * Fixtures use the ZZ-TEST- prefix (global reference tables are append-only by design, so they stay).
 * Run:  npx tsx scripts/verifyF2DecisionsPg.ts | tee evidence/standards-intelligence/battery-output-f2-pg.txt
 */
import dotenv from 'dotenv';
dotenv.config();
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { runF2Suite } from './lib/f2DecisionSuite';
import type { Tally } from './lib/f1StandardsSuite';

const tally: Tally = { pass: 0, fail: 0 };
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { tally.pass++; console.log(`[PASS] ${label}`); } else { tally.fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function main() {
  const pg: any = new PostgresPrimaryAdapter();
  const health = await pg.checkHealth();
  if (!health.connected) { console.log('PG_NOT_RUN: no PostgreSQL connection (DATABASE_URL missing/invalid). F2 is NOT closed.'); process.exit(3); }
  const init = await pg.initializeSchema();
  check('PG0 initializeSchema succeeds with the F2 table (idempotent re-run)', init.success === true && (await pg.initializeSchema()).success === true, JSON.stringify(init.error || ''));

  const run = Date.now().toString(36);
  const tA = `zzf2a${run}`.slice(0, 40), tB = `zzf2b${run}`.slice(0, 40);
  for (const id of [tA, tB]) {
    const r = await pg.saveTenant({ id, code: id, nameAr: 'اختبار F2', baseCurrency: 'EGP', country: 'EG', backendConfig: { adapterType: 'postgresql', connectionRef: 'DATABASE_URL', isolationLevel: 'Shared' }, status: 'ACTIVE' }, `f2-tenant-${id}`);
    check(`PG1 test tenant ${id} created`, r.success === true, JSON.stringify(r.error || ''));
  }

  console.log('--- shared F2 suite on PostgresPrimaryAdapter ---');
  await runF2Suite(pg, tA, tB, tally);

  console.log('--- DB-level proofs ---');
  // Raw statements run inside a tenant-scoped transaction that is always rolled back, so they are valid even for a non-bypass role.
  const inTenant = async (tenant: string, sql: string, params: any[]): Promise<string | null> => {
    const c = await pg.pool.connect();
    try {
      await c.query('BEGIN'); await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenant]);
      try { await c.query(sql, params); return null; } catch (e: any) { return String(e.message || e); }
    } finally { try { await c.query('ROLLBACK'); } catch { /* ignore */ } c.release(); }
  };
  const base = `INSERT INTO an_accounting_decisions (id, tenant_id, decision_key, event_type, event_id, source_module, event_date, decision_status, reason_code, explanation_ar, explanation_en, created_by, journal_entry_id, rule_id) VALUES ($1,$2,$3,'GOODS_RECEIPT','e','m','2025-01-01',$4,'X','a','e','u',$5,$6)`;
  const e1 = await inTenant(tA, base, [`zz-d1-${run}`, tA, `k1-${run}`, 'APPLY', null, null]);
  check('PGD1 DB CHECK: an APPLY decision without a rule reference is rejected by the database', !!e1 && /check constraint/i.test(e1), String(e1));
  const e2 = await inTenant(tA, base, [`zz-d2-${run}`, tA, `k2-${run}`, 'REVIEW_REQUIRED', 'JE-1', null]);
  check('PGD2 DB CHECK: a journal link on a non-APPLY decision is rejected', !!e2 && /check constraint/i.test(e2), String(e2));
  const e3 = await inTenant(tA, base, [`zz-d3-${run}`, tA, `k3-${run}`, 'MAYBE', null, null]);
  check('PGD3 DB CHECK: an unknown decision status is rejected', !!e3 && /check constraint/i.test(e3), String(e3));

  const mk = (key: string, amount: number): any => ({ id: `zz-race-${key}-${amount}`, tenantId: tA, decisionKey: key, eventType: 'GOODS_RECEIPT', eventId: `race-${run}`, sourceModule: 'f2-pg', eventDate: '2025-01-01', decisionStatus: 'APPLY', reasonCode: 'RULE_APPLIED', framework: 'IFRS', jurisdictionId: 'J', standardId: 'S', ruleId: 'R', ruleVersion: 1, tier: 2, policyKey: null, policyValue: null, policyVersion: null, facts: { amount }, treatment: { lines: [] }, taxTreatment: null, missingFacts: [], warnings: [], conflicting: [], explanationAr: 'a', explanationEn: 'e', journalEntryId: null, createdBy: 'u', createdAt: new Date().toISOString() });
  const key = `race-key-${run}`;
  const saves = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(i => pg.saveAccountingDecision(tA, mk(key, i))));
  const ids = new Set(saves.map((s: any) => s.data?.id));
  const rows = await pg.listAccountingDecisions(tA, { eventId: `race-${run}` });
  check('PGD4 concurrency: 8 parallel saves with the same decision key store exactly one row and all callers get the same decision', saves.every((s: any) => s.success) && ids.size === 1 && (rows.data || []).length === 1, `ids=${ids.size} rows=${(rows.data || []).length}`);
  const winner = saves[0].data;
  const links = await Promise.all([1, 2, 3, 4, 5, 6].map(i => pg.linkDecisionToJournal(tA, winner.id, `JE-RACE-${i}`)));
  const okLinks = links.filter((l: any) => l.success), conflicts = links.filter((l: any) => !l.success && l.error?.status === 409);
  const final = (await pg.getAccountingDecision(tA, winner.id)).data;
  check('PGD5 race: 6 parallel links to different journals => exactly one wins, the rest 409, the stored link never changes', okLinks.length === 1 && conflicts.length === 5 && final.journalEntryId === okLinks[0].data.journalEntryId, `ok=${okLinks.length} conflict=${conflicts.length}`);

  // RLS: the app role bypasses RLS, so prove isolation with a temporary NOBYPASSRLS probe role
  const role = await pg.pool.query(`SELECT rolbypassrls OR rolsuper AS bypass FROM pg_roles WHERE rolname = current_user`);
  const bypass = !!role.rows[0]?.bypass;
  console.log(`INFO: DB role bypasses RLS = ${bypass}`);
  const probe = 'an_rls_probe_f2';
  let useProbe = false;
  if (bypass) {
    try {
      await pg.pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${probe}') THEN CREATE ROLE ${probe} NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$`);
      await pg.pool.query(`GRANT USAGE ON SCHEMA public TO ${probe}`);
      await pg.pool.query(`GRANT SELECT, INSERT ON an_accounting_decisions TO ${probe}`);
      try { await pg.pool.query(`GRANT ${probe} TO CURRENT_USER WITH SET TRUE`); } catch { try { await pg.pool.query(`GRANT ${probe} TO CURRENT_USER`); } catch { /* may already be a member */ } }
      useProbe = true;
    } catch (e: any) { console.log(`SKIP PGR2: app role bypasses RLS and a probe role could not be created (${e.message}). Isolation NOT proven (not counted as pass).`); }
  }
  if (!bypass || useProbe) {
    const c = await pg.pool.connect();
    try {
      await c.query('BEGIN');
      let ok = true;
      if (useProbe) { try { await c.query(`SET LOCAL ROLE ${probe}`); } catch (e: any) { ok = false; console.log(`SKIP PGR2: cannot switch to the probe role (${e.message}). Isolation NOT proven (not counted as pass).`); } }
      if (ok) {
        await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tA]);
        const own = await c.query('SELECT count(*)::int AS n FROM an_accounting_decisions WHERE tenant_id = $1', [tA]);
        await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tB]);
        const seen = await c.query('SELECT count(*)::int AS n FROM an_accounting_decisions WHERE tenant_id = $1', [tA]);
        const wr = await c.query(base, [`zz-x-${run}`, tA, `kx-${run}`, 'REVIEW_REQUIRED', null, null]).then(() => false, () => true);
        check(`PGR2 RLS (${useProbe ? 'non-bypass probe role' : 'app role'}): own tenant sees its decisions (control), other tenant sees 0 and cannot write into it`, own.rows[0].n > 0 && seen.rows[0].n === 0 && wr === true, `own=${own.rows[0].n} otherSees=${seen.rows[0].n} writeBlocked=${wr}`);
      }
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }
  if (useProbe) {
    try { await pg.pool.query(`REVOKE ALL ON an_accounting_decisions FROM ${probe}`); await pg.pool.query(`REVOKE USAGE ON SCHEMA public FROM ${probe}`); await pg.pool.query(`DROP ROLE IF EXISTS ${probe}`); }
    catch (e: any) { console.log(`INFO: probe role cleanup skipped (${e.message})`); }
  }

  console.log(`\nPassed: ${tally.pass} | Failed: ${tally.fail}`);
  process.exit(tally.fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
