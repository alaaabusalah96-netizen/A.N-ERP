/**
 * @file f3ExplainSmoke.ts
 * @description F3a smoke test (InMemory, logic only): decision -> DecisionPostingBridge (existing PostingEngine) -> RuleExplanationService.
 * All fixtures are clearly test fixtures (ZZ-F3-*), not real standards. Prints a single line:
 *   F3SMOKE <checks passed>/<checks total> <journal lines>
 * It does NOT prove PostgreSQL behaviour, RLS or HTTP permissions (that is F3b / the PG gate).
 */
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { AccountingRuleRegistry, JurisdictionRegistry, StandardsRegistry } from '../src/core/standards/registries';
import { StandardsDecisionService } from '../src/core/standards/StandardsDecisionService';
import { RuleExplanationService } from '../src/core/standards/RuleExplanationService';
import { DecisionPostingBridge } from '../src/core/standards/DecisionPostingBridge';

let ok = 0, total = 0;
const check = (label: string, cond: boolean, extra = '') => { total++; if (cond) ok++; console.log(`[${cond ? 'PASS' : 'FAIL'}] ${label}${!cond && extra ? ' | ' + extra : ''}`); };

async function main() {
  const st = new InMemoryAdapter();
  const A = 'f3-smoke', T = 'f3-tenant', T2 = 'f3-other-tenant';
  await new JurisdictionRegistry(st).register({ id: 'ZZ-F3', kind: 'COUNTRY', countryCode: 'ZZ', framework: 'IFRS', parentId: null, relationToIfrs: 'UNVERIFIED', nameAr: 'اختبار', nameEn: 'f3 fixture', status: 'ACTIVE' }, A, 'j');
  await new StandardsRegistry(st).register({ standardId: 'ZZ-F3-STD', framework: 'IFRS', titleEn: 'F3 fixture (not a real standard)', version: 1, effectiveFrom: '2020-01-01', coverageStatus: 'PARTIAL', coverageEvidenceRef: 'f3-smoke', sourceVerified: true, sourceReference: 'F3-FIXTURE-ONLY' }, A, 's');
  const rr = await new AccountingRuleRegistry(st).register({
    ruleId: 'ZZ-F3-RULE', standardId: 'ZZ-F3-STD', framework: 'IFRS', jurisdictionId: 'ZZ-F3', eventType: 'INVENTORY_WRITE_DOWN', priority: 10, tier: 2, conditions: {},
    treatment: { lines: [{ side: 'DEBIT', role: 'EXPENSE', amount: { fact: 'amount' } }, { side: 'CREDIT', role: 'INVENTORY', amount: { fact: 'amount' } }], inventoryEffect: { type: 'DECREASE_CARRYING_AMOUNT' } },
    requiredData: ['amount'], exceptions: [], version: 1, effectiveFrom: '2020-01-01', effectiveTo: null, sourceReference: 'F3-FIXTURE-ONLY', sourceVerified: true, status: 'ACTIVE',
  }, A, 'r');
  if (!rr.success) { console.log('F3SMOKE FIXTURE_FAILED', rr.error?.detail); process.exit(1); }
  for (const code of ['5201', '1105']) await st.saveAccount(T, { code, tenantId: T, nameAr: code, type: code === '5201' ? 'EXPENSE' : 'ASSET', nature: code === '5201' ? 'DEBIT' : 'CREDIT', isActive: true, status: 'ACTIVE' } as any, `acc-${code}`);

  const svc = new StandardsDecisionService(st), bridge = new DecisionPostingBridge(st), expl = new RuleExplanationService(st);
  const roles = { EXPENSE: '5201', INVENTORY: '1105' };
  const ev = (id: string, facts: Record<string, unknown>, tenantId = T) => ({ tenantId, eventType: 'INVENTORY_WRITE_DOWN', eventId: id, sourceModule: 'f3-smoke', date: '2025-06-15', currency: 'EGP', reportingJurisdictionId: 'ZZ-F3', facts });

  // 1. decision -> journal through the existing PostingEngine -> explanation
  const d1 = (await svc.decide(ev('DOC-1', { amount: 10 }), { actorId: A, accountRoles: roles })).decision;
  check('1 decision is APPLY/DETERMINISTIC and stored', d1.decisionStatus === 'APPLY' && d1.treatment.confidence === 'DETERMINISTIC');
  const posted = await bridge.postDecision(T, d1.id, A);
  check('2 bridge posts through PostingEngine: POSTED, balanced, 2 lines', posted.success === true && posted.data?.journal.status === 'POSTED' && posted.data.journal.lines.length === 2 && posted.data.journal.lines.reduce((s, l) => s + l.debit - l.credit, 0) === 0, posted.error?.detail);
  const jid = posted.data?.journal.id as string;
  check('3 decision is linked to the journal (one-way link stored)', posted.data?.decision.journalEntryId === jid);
  const again = await bridge.postDecision(T, d1.id, A);
  check('4 posting the same decision twice is refused (409), no second journal', again.success === false && again.error?.status === 409);

  const byJ = await expl.explainJournal(T, jid);
  const s = byJ.sections;
  check('5 "why was this journal posted?" returns all 12 sections filled', byJ.found && !!s.businessEvent && !!s.factsUsed && s.framework === 'IFRS' && s.jurisdiction === 'ZZ-F3' && s.standard === 'ZZ-F3-STD' && !!s.rule && !!s.decision && !!s.journalMapping && !!s.journal && s.inventoryEffect !== null && Array.isArray(s.warnings) && Array.isArray(s.missingFacts));
  check('6 explanation names the rule id + version + source reference (durable rule reference)', s.rule?.ruleId === 'ZZ-F3-RULE' && s.rule?.version === 1 && s.rule?.sourceReference === 'F3-FIXTURE-ONLY' && s.rule?.status === 'ACTIVE');
  check('7 posted journal matches the treatment lines per account/side (no differences)', s.journal?.found === true && s.journal?.matchesTreatment === true && s.journal?.differences.length === 0);
  check('8 explanation text exists in Arabic and English and mentions the rule', byJ.explanation.ar.length > 20 && byJ.explanation.en.includes('ZZ-F3-RULE') && byJ.explanation.ar.includes('ZZ-F3-RULE'));
  const byD = await expl.explainDecision(T, d1.id);
  check('9 explainDecision and explainJournal agree on the same decision', byD.found && byD.decisionId === byJ.decisionId);

  // 2. refusals (fail-closed)
  const missing = (await svc.decide(ev('DOC-2', {}), { actorId: A, accountRoles: roles })).decision;
  const pm = await bridge.postDecision(T, missing.id, A);
  check('10 REVIEW_REQUIRED decision (missing fact) is never posted', missing.decisionStatus === 'REVIEW_REQUIRED' && pm.success === false && pm.error?.status === 422);
  const unmapped = (await svc.decide(ev('DOC-3', { amount: 5 }), { actorId: A, accountRoles: { EXPENSE: '5201' } })).decision;
  const pu = await bridge.postDecision(T, unmapped.id, A);
  check('11 decision with an unmapped account role is never posted (no invented account)', unmapped.decisionStatus === 'REVIEW_REQUIRED' && pu.success === false);
  const e404 = await expl.explainDecision(T, 'dec-does-not-exist');
  check('12 unknown decision id -> found=false, no throw', e404.found === false && e404.explanation.en.length > 0);

  // 3. a journal nobody explains is reported honestly; tenant isolation
  const legacy = await expl.explainJournal(T, 'JE-LEGACY-1');
  check('13 journal without a decision says so explicitly (legacy posting path), not an invented explanation', legacy.found === false && /legacy|not produced/i.test(legacy.explanation.en));
  const cross = await expl.explainDecision(T2, d1.id), crossJ = await expl.explainJournal(T2, jid);
  check('14 another tenant cannot explain this decision or journal', cross.found === false && crossJ.found === false);

  console.log(`F3SMOKE ${ok}/${total} ${posted.data?.journal.lines.map(l => `${l.debit ? 'D' : 'C'}${l.accountCode}:${l.debit || l.credit}`).join('|')}`);
  process.exit(ok === total ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
