/**
 * @file f2DecisionSmoke.ts
 * @description Tiny end-to-end example of the decision layer on InMemory (also the F2a smoke test).
 * Registers ONE fixture rule (clearly a test fixture, not a real standard), decides an event and prints a single line:
 *   F2SMOKE <decisionStatus> <number of lines> <lines>
 */
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { AccountingRuleRegistry, JurisdictionRegistry, StandardsRegistry } from '../src/core/standards/registries';
import { StandardsDecisionService } from '../src/core/standards/StandardsDecisionService';

async function main() {
  const st = new InMemoryAdapter();
  const A = 'smoke';
  await new JurisdictionRegistry(st).register({ id: 'ZZ-SMOKE', kind: 'COUNTRY', countryCode: 'ZZ', framework: 'IFRS', parentId: null, relationToIfrs: 'UNVERIFIED', nameAr: 'اختبار', nameEn: 'smoke', status: 'ACTIVE' }, A, 'j');
  await new StandardsRegistry(st).register({ standardId: 'ZZ-SMOKE-STD', framework: 'IFRS', titleEn: 'smoke fixture (not a real standard)', version: 1, effectiveFrom: '2020-01-01', coverageStatus: 'PARTIAL', coverageEvidenceRef: 'f2-smoke', sourceVerified: true, sourceReference: 'SMOKE-FIXTURE-ONLY' }, A, 's');
  const rr = await new AccountingRuleRegistry(st).register({
    ruleId: 'ZZ-SMOKE-RULE', standardId: 'ZZ-SMOKE-STD', framework: 'IFRS', jurisdictionId: 'ZZ-SMOKE', eventType: 'INVENTORY_WRITE_DOWN', priority: 10, tier: 2, conditions: {},
    treatment: { lines: [{ side: 'DEBIT', role: 'EXPENSE', amount: { fact: 'amount' } }, { side: 'CREDIT', role: 'INVENTORY', amount: { fact: 'amount' } }] },
    requiredData: ['amount'], exceptions: [], version: 1, effectiveFrom: '2020-01-01', effectiveTo: null, sourceReference: 'SMOKE-FIXTURE-ONLY', sourceVerified: true, status: 'ACTIVE',
  }, A, 'r');
  if (!rr.success) { console.log('F2SMOKE FIXTURE_FAILED', rr.error?.detail); process.exit(1); }
  const r = await new StandardsDecisionService(st).decide(
    { tenantId: 'smoke-tenant', eventType: 'INVENTORY_WRITE_DOWN', eventId: 'DOC-1', sourceModule: 'smoke', date: '2025-06-15', currency: 'EGP', reportingJurisdictionId: 'ZZ-SMOKE', facts: { amount: 10 } },
    { actorId: A, accountRoles: { EXPENSE: '5201', INVENTORY: '1105' } });
  const d = r.decision;
  console.log(`F2SMOKE ${d.decisionStatus} ${d.treatment.lines.length} ${d.treatment.lines.map(l => `${l.side[0]}${l.accountCode}:${l.amount}`).join('|')}`);
  process.exit(d.decisionStatus === 'APPLY' && r.stored ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
