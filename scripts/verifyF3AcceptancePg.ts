/**
 * @file verifyF3AcceptancePg.ts
 * @description Standards Intelligence F3b — REAL PostgreSQL gate for Foundation §23. Needs DATABASE_URL, otherwise prints PG_NOT_RUN and exits 3.
 * Runs the shared acceptance suite on PostgresPrimaryAdapter (decision -> PostingEngine -> POSTED journal -> link -> explanation, all in the DB),
 * then proves what InMemory cannot: durability across a brand-new adapter instance, one journal per decision under a concurrent race,
 * and that the stored link/lines in the database match the explanation.
 * Fixtures use ZZ-F3B- / zzf3 prefixes (global reference tables are append-only by design, so they stay; test tenants stay like in F2).
 * Run:  npx tsx scripts/verifyF3AcceptancePg.ts | tee evidence/standards-intelligence/battery-output-f3b-pg.txt
 */
import dotenv from 'dotenv';
dotenv.config();
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { runF3Suite } from './lib/f3AcceptanceSuite';
import { AccountingService } from '../src/core/accounting/AccountingService';
import { AccountingRuleRegistry, JurisdictionRegistry, StandardsRegistry } from '../src/core/standards/registries';
import { StandardsDecisionService } from '../src/core/standards/StandardsDecisionService';
import { DecisionPostingBridge } from '../src/core/standards/DecisionPostingBridge';
import { RuleExplanationService } from '../src/core/standards/RuleExplanationService';
import type { Tally } from './lib/f1StandardsSuite';

const tally: Tally = { pass: 0, fail: 0 };
const check = (label: string, cond: boolean, extra = '') => { if (cond) { tally.pass++; console.log(`[PASS] ${label}`); } else { tally.fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); } };

async function main() {
  const pg: any = new PostgresPrimaryAdapter();
  const health = await pg.checkHealth();
  if (!health.connected) { console.log('PG_NOT_RUN: no PostgreSQL connection (DATABASE_URL missing/invalid). F3b is NOT closed.'); process.exit(3); }
  const init = await pg.initializeSchema();
  check('PG0 initializeSchema succeeds (idempotent re-run)', init.success === true && (await pg.initializeSchema()).success === true, JSON.stringify(init.error || ''));

  const run = Date.now().toString(36);
  const tA = `zzf3a${run}`.slice(0, 40), tB = `zzf3b${run}`.slice(0, 40);
  for (const id of [tA, tB]) {
    const r = await pg.saveTenant({ id, code: id, nameAr: 'اختبار F3b', baseCurrency: 'EGP', country: 'EG', backendConfig: { adapterType: 'postgresql', connectionRef: 'DATABASE_URL', isolationLevel: 'Shared' }, status: 'ACTIVE' }, `f3-tenant-${id}`);
    check(`PG1 test tenant ${id} created`, r.success === true, JSON.stringify(r.error || ''));
  }

  console.log('--- shared F3b acceptance suite on PostgresPrimaryAdapter ---');
  await runF3Suite(pg, tA, tB, tally);

  console.log('--- DB-level proofs ---');
  const inTenant = async <T>(tenant: string, fn: (c: any) => Promise<T>): Promise<T> => {
    const c = await pg.pool.connect();
    try { await c.query('BEGIN'); await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenant]); const r = await fn(c); await c.query('ROLLBACK'); return r; }
    finally { c.release(); }
  };
  const A = 'f3b-pg';
  const U = (s: string) => `ZZ-F3B-PG-${run}-${s}`;
  await new JurisdictionRegistry(pg).register({ id: U('J'), kind: 'COUNTRY', countryCode: 'ZZ', framework: 'IFRS', parentId: null, relationToIfrs: 'UNVERIFIED', nameAr: 'اختبار', nameEn: 'f3b pg', status: 'ACTIVE' }, A, `pgj-${run}`);
  await new StandardsRegistry(pg).register({ standardId: U('STD'), framework: 'IFRS', titleEn: 'F3b pg fixture (not a real standard)', version: 1, effectiveFrom: '2020-01-01', coverageStatus: 'PARTIAL', coverageEvidenceRef: 'f3b-pg', sourceVerified: true, sourceReference: 'F3B-FIXTURE-ONLY' }, A, `pgs-${run}`);
  const rr = await new AccountingRuleRegistry(pg).register({ ruleId: U('R'), standardId: U('STD'), framework: 'IFRS', jurisdictionId: U('J'), eventType: 'INVENTORY_WRITE_DOWN', priority: 10, tier: 2, conditions: {}, treatment: { lines: [{ side: 'DEBIT', role: 'EXP', amount: { fact: 'amount' } }, { side: 'CREDIT', role: 'INVENTORY', amount: { fact: 'amount' } }] }, requiredData: ['amount'], exceptions: [], version: 1, effectiveFrom: '2020-01-01', effectiveTo: null, sourceReference: 'F3B-FIXTURE-ONLY', sourceVerified: true, status: 'ACTIVE' }, A, `pgr-${run}`);
  check('PGF fixture rule registered on PostgreSQL', rr.success === true, JSON.stringify(rr.error || ''));
  const roles = { EXP: '5201', INVENTORY: '1105' };
  const dec = await new StandardsDecisionService(pg).decide({ tenantId: tA, eventType: 'INVENTORY_WRITE_DOWN', eventId: U('E1'), sourceModule: 'f3b-pg', date: '2025-06-15', currency: 'EGP', reportingJurisdictionId: U('J'), facts: { amount: 77 } }, { actorId: A, accountRoles: roles });
  check('PGF decision stored', dec.stored && dec.decision.decisionStatus === 'APPLY', JSON.stringify(dec.error || ''));

  // PGJ1: race — 6 parallel postDecision calls for the SAME decision => exactly one journal, posted once, link stable.
  const bridge = new DecisionPostingBridge(pg);
  const before = await pg.getAccount(tA, '5201');
  const res = await Promise.all([1, 2, 3, 4, 5, 6].map(() => bridge.postDecision(tA, dec.decision.id, A)));
  const okIds = new Set(res.filter((r: any) => r.success).map((r: any) => r.data.journal.id));
  const after = await pg.getAccount(tA, '5201');
  const jeId = `JE-STD-${dec.decision.id}`.slice(0, 64);
  const jeCount = await inTenant(tA, async (c) => Number((await c.query('SELECT count(*)::int AS n FROM an_journal_entries WHERE tenant_id = $1 AND id = $2', [tA, jeId])).rows[0].n));
  const linked = (await pg.getAccountingDecision(tA, dec.decision.id)).data;
  const delta = Number(after.data?.debitBalance || 0) - Number(before.data?.debitBalance || 0);
  check('PGJ1 race: 6 parallel postDecision calls on one decision leave exactly ONE journal row, the account moved once (77), the link points to it and every other caller got a clean 409/ok (no 5xx)',
    jeCount === 1 && okIds.size <= 1 && linked?.journalEntryId === jeId && Math.abs(delta - 77) < 0.005 && res.every((r: any) => r.success || [409, 422].includes(r.error?.status)),
    `journals=${jeCount} okIds=${okIds.size} link=${linked?.journalEntryId} delta=${delta} statuses=${res.map((r: any) => r.success ? 200 : r.error?.status).join(',')}`);

  // PGD1: durability — a brand-new adapter instance (as after a server restart) explains the same journal from the database alone.
  const pg2: any = new PostgresPrimaryAdapter();
  const x = await new RuleExplanationService(pg2).explainJournal(tA, jeId);
  check('PGD1 durability: a fresh adapter instance explains the journal from PostgreSQL alone (rule id+version, standard, matching lines)', x.found && x.sections.rule?.ruleId === U('R') && x.sections.rule?.version === 1 && x.sections.standard === U('STD') && x.sections.journal?.matchesTreatment === true && x.sections.journal?.status === 'POSTED', JSON.stringify(x.sections.journal));
  await pg2.close();

  // PGD2: the database row set matches the explanation (lines + link), read with raw SQL.
  const rows = await inTenant(tA, async (c) => ({
    lines: (await c.query('SELECT account_code, debit, credit FROM an_journal_lines WHERE tenant_id = $1 AND entry_id = $2 ORDER BY account_code', [tA, jeId])).rows,
    link: (await c.query('SELECT journal_entry_id FROM an_accounting_decisions WHERE tenant_id = $1 AND id = $2', [tA, dec.decision.id])).rows[0]?.journal_entry_id,
  }));
  check('PGD2 raw SQL: two journal lines (D5201 77 / C1105 77) and the decision row holds the same journal id', rows.lines.length === 2 && rows.lines.some((l: any) => l.account_code === '5201' && Number(l.debit) === 77) && rows.lines.some((l: any) => l.account_code === '1105' && Number(l.credit) === 77) && rows.link === jeId, JSON.stringify(rows));

  // PGI1: isolation — tenant B can neither explain nor post tenant A's decision.
  const crossX = await new RuleExplanationService(pg).explainJournal(tB, jeId), crossP = await bridge.postDecision(tB, dec.decision.id, A);
  check('PGI1 isolation: tenant B cannot explain tenant A\'s journal and cannot post tenant A\'s decision', crossX.found === false && crossP.success === false && crossP.error?.status === 404);

  console.log(`\nPassed: ${tally.pass} | Failed: ${tally.fail}`);
  process.exit(tally.fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
