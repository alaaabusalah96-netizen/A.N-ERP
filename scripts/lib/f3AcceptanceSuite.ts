/**
 * F3b acceptance suite (Foundation §23). Adapter-agnostic: InMemory (logic) and real PostgreSQL (persistence / atomic link).
 * Every scenario runs the FULL chain: BusinessEvent -> StandardsDecisionService -> DecisionPostingBridge (existing PostingEngine)
 * -> StoragePort journal -> RuleExplanationService. ALL RULES HERE ARE ZZ-F3B-* TEST FIXTURES (rule text is invented by the test
 * and is NOT official accounting content). They prove the MECHANISM only; the rows that need real official content stay open.
 */
import type { StoragePort } from '../../src/core/storage/StoragePort';
import { AccountingPolicyRegistry, AccountingRuleRegistry, JurisdictionRegistry, StandardsRegistry, TaxRuleRegistry } from '../../src/core/standards/registries';
import { seedStandardsCatalogue } from '../../src/core/standards/seedCatalogue';
import { StandardsDecisionService } from '../../src/core/standards/StandardsDecisionService';
import { DecisionPostingBridge } from '../../src/core/standards/DecisionPostingBridge';
import { RuleExplanationService } from '../../src/core/standards/RuleExplanationService';
import { AccountingService } from '../../src/core/accounting/AccountingService';
import type { AccountingRuleRecord, StandardRecord, TaxRuleRecord } from '../../src/core/standards/standardsTypes';
import type { BusinessEvent } from '../../src/core/standards/decisionTypes';
import type { Tally } from './f1StandardsSuite';

export async function runF3Suite(st: StoragePort, tA: string, tB: string, tally: Tally): Promise<void> {
  const check = (label: string, cond: boolean, extra = '') => {
    if (cond) { tally.pass++; console.log(`[PASS] ${label}`); } else { tally.fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
  };
  const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const U = (s: string) => `ZZ-F3B-${run}-${s}`;
  let n = 0; const k = (s = 'k') => `f3b-${run}-${s}-${++n}`;
  const A = 'f3b-tester';
  await seedStandardsCatalogue(st, A);
  for (const t of [tA, tB]) await new AccountingService(st).seedDefaultChartOfAccounts(t);
  const sreg = new StandardsRegistry(st), jreg = new JurisdictionRegistry(st), rreg = new AccountingRuleRegistry(st), treg = new TaxRuleRegistry(st), preg = new AccountingPolicyRegistry(st);
  const svc = new StandardsDecisionService(st), bridge = new DecisionPostingBridge(st), expl = new RuleExplanationService(st);
  const fix = (framework: 'IFRS' | 'EAS'): StandardRecord => ({ standardId: U(framework + '-STD'), framework, titleEn: 'F3b test fixture (not a real standard)', version: 1, effectiveFrom: '2020-01-01', coverageStatus: 'PARTIAL', coverageEvidenceRef: 'f3b-test-fixture', sourceVerified: true, sourceReference: 'F3B-FIXTURE-ONLY' });
  const sI = fix('IFRS'), sE = fix('EAS');
  await sreg.register(sI, A, k()); await sreg.register(sE, A, k());
  let jn = 0;
  const mkJ = async (framework: 'IFRS' | 'EAS' | 'TAX' = 'IFRS') => { const id = U(`J${++jn}`); const r = await jreg.register({ id, kind: 'COUNTRY', countryCode: 'ZZ', framework, parentId: null, relationToIfrs: 'UNVERIFIED', nameAr: 'اختبار', nameEn: 'f3b', status: 'ACTIVE' }, A, k()); if (!r.success) check(`fixture jurisdiction ${id}`, false, r.error?.detail); return id; };
  const L = (side: 'DEBIT' | 'CREDIT', role: string, amount: unknown, extra: any = {}) => ({ side, role, amount, ...extra });
  const fx = (f: string) => ({ fact: f });
  let rn = 0;
  const reg = async (j: string, eventType: string, o: Partial<AccountingRuleRecord> & { treatment: any }) => {
    const rule: AccountingRuleRecord = { ruleId: U(`R${++rn}`), standardId: sI.standardId, framework: 'IFRS', jurisdictionId: j, eventType, priority: 10, tier: 2, conditions: {}, requiredData: ['amount'], exceptions: [], version: 1, effectiveFrom: '2020-01-01', effectiveTo: null, sourceReference: 'F3B-FIXTURE-ONLY', sourceVerified: true, status: 'ACTIVE', ...o };
    const r = await rreg.register(rule, A, k('rule')); if (!r.success) check(`fixture rule ${rule.ruleId}`, false, r.error?.detail);
    return rule;
  };
  const taxRule = async (j: string, o: Partial<TaxRuleRecord> = {}) => { const r = await treg.register({ taxRuleId: U(`T${++rn}`), jurisdictionId: j, taxType: 'VAT', priority: 1, conditions: {}, treatment: { output: { role: 'VAT_OUT' } }, requiredData: [], version: 1, effectiveFrom: '2020-01-01', effectiveTo: null, sourceReference: 'F3B-FIXTURE-ONLY', sourceVerified: true, status: 'ACTIVE', rate: 0.1, ...o }, A, k('tax')); if (!r.success) check('fixture tax rule', false, r.error?.detail); };
  // role -> real chart codes of the default chart (seeded above): the only place account numbers come from.
  const roles: Record<string, string> = { INVENTORY: '1105', GRIR: '2106', COGS: '5101', RECEIVABLE: '1104', REVENUE: '4101', VAT_OUT: '2102', VAT_IN: '1108', CASH: '1101', PAYABLE: '2101', FIXED_ASSET: '1201', DEPR_EXP: '5205', ACC_DEPR: '1204', FX_LOSS: '5207', FX_GAIN: '4202', EXP: '5201', GRIR_EAS: '2101' };
  let en = 0;
  const ev = (j: string, eventType: string, facts: Record<string, unknown>, o: Partial<BusinessEvent> = {}): BusinessEvent => ({ tenantId: tA, eventType, eventId: U(`E${++en}`), sourceModule: 'f3b-test', date: '2025-06-15', currency: 'EGP', reportingJurisdictionId: j, facts, ...o });
  const decide = (e: BusinessEvent, o: any = {}) => svc.decide(e, { actorId: A, accountRoles: roles, ...o }).then(r => r.decision);
  const lineStr = (d: any) => (d.treatment.lines || []).map((l: any) => `${l.side[0]}${l.accountCode}:${l.amount}`).join('|');
  const jeStr = (je: any) => je.lines.map((l: any) => (l.debit ? `D${l.accountCode}:${l.debit}` : `C${l.accountCode}:${l.credit}`)).join('|');
  /** decide -> post through the existing PostingEngine -> explain by journal id. */
  const chain = async (e: BusinessEvent, o: any = {}) => {
    const d = await decide(e, o);
    const p = await bridge.postDecision(e.tenantId, d.id, A);
    const x = p.success && p.data ? await expl.explainJournal(e.tenantId, p.data.journal.id) : null;
    return { d, p, x, je: p.data?.journal };
  };
  const full = (x: any) => !!x && x.found && !!x.sections.businessEvent && !!x.sections.factsUsed && !!x.sections.framework && !!x.sections.jurisdiction && !!x.sections.standard && !!x.sections.rule && !!x.sections.decision && !!x.sections.journalMapping && x.sections.journal?.matchesTreatment === true && x.explanation.ar.length > 20 && x.explanation.en.length > 20;

  // ---- F3-1 inventory purchase: inventory rule + separate tax rule + inventory effect, posted and explained
  const jInv = await mkJ(), jTax = await mkJ('TAX');
  const rGR = await reg(jInv, 'GOODS_RECEIPT', { requiredData: ['net'], treatment: { lines: [L('DEBIT', 'INVENTORY', fx('net')), L('DEBIT', 'VAT_IN', { taxOn: fx('net') }), L('CREDIT', 'GRIR', { add: [fx('net'), { taxOn: fx('net') }] })], measurementBasis: 'COST', recognitionTiming: 'ON_RECEIPT', inventoryEffect: { type: 'INCREASE_QUANTITY_AND_COST' } } });
  await taxRule(jTax, { conditions: { supplyType: 'TAXABLE' } });
  const c1 = await chain(ev(jInv, 'GOODS_RECEIPT', { net: 1000, supplyType: 'TAXABLE' }, { taxJurisdictionId: jTax }));
  check('F3-1 inventory purchase: accounting rule + separate tax rule + inventory effect select the path; journal D inventory 1000 / D VAT 100 / C GR-IR 1100 posted through PostingEngine', c1.d.ruleId === rGR.ruleId && !!c1.d.taxTreatment?.taxRuleId && (c1.d.treatment.inventoryEffect as any)?.type === 'INCREASE_QUANTITY_AND_COST' && c1.je?.status === 'POSTED' && jeStr(c1.je) === 'D1105:1000|D1108:100|C2106:1100' && full(c1.x));

  // ---- F3-2 sales: revenue + COGS (inventory) + tax in one event, two rules, one journal each
  const jSal = await mkJ();
  const rSI = await reg(jSal, 'SALES_INVOICE', { requiredData: ['net'], treatment: { lines: [L('DEBIT', 'RECEIVABLE', { add: [fx('net'), { taxOn: fx('net') }] }), L('CREDIT', 'REVENUE', fx('net')), L('CREDIT', 'VAT_OUT', { taxOn: fx('net') })], recognitionTiming: 'ON_DELIVERY' } });
  const rDL = await reg(jSal, 'DELIVERY', { requiredData: ['cost'], treatment: { lines: [L('DEBIT', 'COGS', fx('cost')), L('CREDIT', 'INVENTORY', fx('cost'))], measurementBasis: 'COST', inventoryEffect: { type: 'DECREASE_QUANTITY_AND_COST' } } });
  const s1 = await chain(ev(jSal, 'SALES_INVOICE', { net: 2000, supplyType: 'TAXABLE' }, { taxJurisdictionId: jTax }));
  const s2 = await chain(ev(jSal, 'DELIVERY', { cost: 1200 }));
  check('F3-2 sales: invoice path (revenue + VAT, tax rule cited) and delivery path (COGS/inventory) pick different rules; both journals posted, linked and explained', s1.d.ruleId === rSI.ruleId && s2.d.ruleId === rDL.ruleId && jeStr(s1.je) === 'D1104:2200|C4101:2000|C2102:200' && jeStr(s2.je) === 'D5101:1200|C1105:1200' && !!s1.d.taxTreatment?.taxRuleId && full(s1.x) && full(s2.x));

  // ---- F3-3 foreign currency: the FX rule version follows the transaction date; the rate is a FACT supplied by the caller (never invented)
  const jFx = await mkJ();
  await reg(jFx, 'FOREIGN_CURRENCY_SETTLEMENT', { ruleId: U('FX'), requiredData: ['amount'], treatment: { lines: [L('DEBIT', 'CASH', fx('amount')), L('CREDIT', 'FX_GAIN', fx('amount'))] }, effectiveTo: '2024-12-31' });
  await reg(jFx, 'FOREIGN_CURRENCY_SETTLEMENT', { ruleId: U('FX'), version: 2, requiredData: ['amount'], treatment: { lines: [L('DEBIT', 'CASH', fx('amount')), L('CREDIT', 'FX_LOSS', fx('amount'))] }, effectiveFrom: '2025-01-01' });
  const f1 = await chain(ev(jFx, 'FOREIGN_CURRENCY_SETTLEMENT', { amount: 50 }, { date: '2024-06-01', currency: 'USD' })), f2 = await chain(ev(jFx, 'FOREIGN_CURRENCY_SETTLEMENT', { amount: 50 }, { date: '2025-06-01', currency: 'USD' }));
  const f0 = await decide(ev(jFx, 'FOREIGN_CURRENCY_SETTLEMENT', {}, { currency: 'USD' }));
  check('F3-3 foreign currency: v1 before 2025 and v2 after use different effective-date rules; a missing amount/rate fact -> REVIEW_REQUIRED (no invented rate)', f1.d.ruleVersion === 1 && f2.d.ruleVersion === 2 && jeStr(f1.je) === 'D1101:50|C4202:50' && jeStr(f2.je) === 'D1101:50|C5207:50' && f1.d.treatment.currency === 'USD' && f0.decisionStatus === 'REVIEW_REQUIRED' && f0.missingFacts.includes('fact:amount'));

  // ---- F3-4 fixed asset acquisition: capitalization decided by a policy threshold (a policy fact), depreciation event separate
  const jFa = await mkJ();
  const rCap = await reg(jFa, 'ASSET_ACQUISITION', { requiredData: ['amount'], conditions: { capitalize: true }, treatment: { lines: [L('DEBIT', 'FIXED_ASSET', fx('amount')), L('CREDIT', 'PAYABLE', fx('amount'))], recognitionTiming: 'ON_ACQUISITION' } });
  await reg(jFa, 'ASSET_ACQUISITION', { requiredData: ['amount'], conditions: { capitalize: false }, treatment: { lines: [L('DEBIT', 'EXP', fx('amount')), L('CREDIT', 'PAYABLE', fx('amount'))] } });
  await reg(jFa, 'DEPRECIATION_RUN', { requiredData: ['amount'], treatment: { lines: [L('DEBIT', 'DEPR_EXP', fx('amount')), L('CREDIT', 'ACC_DEPR', fx('amount'))], reversal: { required: false } } });
  const a1 = await chain(ev(jFa, 'ASSET_ACQUISITION', { amount: 9000, capitalize: true })), a2 = await chain(ev(jFa, 'ASSET_ACQUISITION', { amount: 90, capitalize: false })), a3 = await chain(ev(jFa, 'DEPRECIATION_RUN', { amount: 150 })), a4 = await decide(ev(jFa, 'ASSET_ACQUISITION', { amount: 500 }));
  check('F3-4 fixed asset: capitalize -> asset account, below-threshold -> expense, depreciation event is its own rule; undecided capitalization (fact missing) -> REVIEW_REQUIRED', a1.d.ruleId === rCap.ruleId && jeStr(a1.je) === 'D1201:9000|C2101:9000' && jeStr(a2.je) === 'D5201:90|C2101:90' && jeStr(a3.je) === 'D5205:150|C1204:150' && a4.decisionStatus === 'REVIEW_REQUIRED' && a4.missingFacts.includes('fact:capitalize'));

  // ---- F3-5 missing facts: REVIEW_REQUIRED, nothing posted, bridge refuses, explanation lists the missing facts
  const m = await decide(ev(jInv, 'GOODS_RECEIPT', { supplyType: 'TAXABLE' }, { taxJurisdictionId: jTax }));
  const mp = await bridge.postDecision(tA, m.id, A), mx = await expl.explainDecision(tA, m.id);
  check('F3-5 missing fact: REVIEW_REQUIRED with the missing list, no lines, DETERMINISTIC never claimed, bridge refuses to post, explanation shows what is missing', m.decisionStatus === 'REVIEW_REQUIRED' && m.missingFacts.includes('fact:net') && m.treatment.lines.length === 0 && m.treatment.confidence === 'NONE' && mp.success === false && mx.sections.missingFacts.includes('fact:net') && mx.sections.journal === null);

  // ---- F3-6 jurisdiction change: same event + facts, different framework/rule/accounts
  const jE = await mkJ('EAS');
  const rE = await reg(jE, 'GOODS_RECEIPT', { standardId: sE.standardId, framework: 'EAS', requiredData: ['net'], treatment: { lines: [L('DEBIT', 'INVENTORY', fx('net')), L('CREDIT', 'GRIR_EAS', fx('net'))] } });
  const g1 = await chain(ev(jInv, 'GOODS_RECEIPT', { net: 400, supplyType: 'TAXABLE' }, { taxJurisdictionId: jTax })), g2 = await chain(ev(jE, 'GOODS_RECEIPT', { net: 400 }));
  check('F3-6 jurisdiction change: IFRS-pack vs EAS-pack give a different rule, framework and journal for identical facts; each explained with its own framework', g1.d.ruleId === rGR.ruleId && g2.d.ruleId === rE.ruleId && g1.x?.sections.framework === 'IFRS' && g2.x?.sections.framework === 'EAS' && jeStr(g1.je) !== jeStr(g2.je) && g2.d.standardId === sE.standardId);

  // ---- F3-7 historical transaction: an old event keeps resolving with the OLD rule version after a newer one exists
  const jH = await mkJ();
  await reg(jH, 'INVENTORY_LOSS', { ruleId: U('LOSS'), requiredData: ['amount'], treatment: { lines: [L('DEBIT', 'EXP', fx('amount')), L('CREDIT', 'INVENTORY', fx('amount'))] }, effectiveTo: '2024-12-31' });
  await reg(jH, 'INVENTORY_LOSS', { ruleId: U('LOSS'), version: 2, requiredData: ['amount'], treatment: { lines: [L('DEBIT', 'COGS', fx('amount')), L('CREDIT', 'INVENTORY', fx('amount'))] }, effectiveFrom: '2025-01-01' });
  const h1 = await chain(ev(jH, 'INVENTORY_LOSS', { amount: 30 }, { date: '2024-11-30' })), h2 = await chain(ev(jH, 'INVENTORY_LOSS', { amount: 30 }, { date: '2025-02-01' }));
  const hOld = await expl.explainDecision(tA, h1.d.id);
  check('F3-7 historical transaction: a 2024 event uses v1 (expense 5201) and a 2025 event uses v2 (5101); the stored 2024 explanation still names v1', h1.d.ruleVersion === 1 && h2.d.ruleVersion === 2 && jeStr(h1.je) === 'D5201:30|C1105:30' && jeStr(h2.je) === 'D5101:30|C1105:30' && hOld.sections.rule?.version === 1 && hOld.sections.rule?.effectiveTo === '2024-12-31');

  // ---- F3-8 durable rule reference: every posted journal is findable from its decision with ruleId + version + standard
  const posted = [c1, s1, s2, f1, f2, a1, a2, a3, g1, g2, h1, h2];
  const refs = await Promise.all(posted.map(async (c) => { const l = await svc.findDecisions(tA, { journalEntryId: c.je?.id }); const d = (l.data || [])[0]; return !!d && d.journalEntryId === c.je?.id && !!d.ruleId && d.ruleVersion != null && !!d.standardId && !!d.framework && !!d.jurisdictionId; }));
  check(`F3-8 each of the ${posted.length} posted journals carries a durable decision reference (ruleId, version, standard, framework, jurisdiction) retrievable by journal id`, refs.every(Boolean), refs.join());

  // ---- F3-9 "why was this entry posted?" complete (all sections), bilingual, and honest about a non-standards journal
  const why = c1.x;
  check('F3-9 "why was this entry posted?": every section present (event, facts, framework, jurisdiction, standard, rule+source, decision, mapping, journal check, tax, inventory effect), AR+EN text', full(why) && !!why?.sections.taxTreatment && !!why?.sections.inventoryEffect && why?.sections.rule?.sourceReference === 'F3B-FIXTURE-ONLY' && /rule/i.test(why?.explanation.en || '') && /القاعدة/.test(why?.explanation.ar || ''));
  const none = await expl.explainJournal(tA, 'JE-NOT-A-STANDARDS-JOURNAL');
  check('F3-9b a journal that no decision produced is reported as such (no invented explanation); another tenant sees nothing', none.found === false && (await expl.explainJournal(tB, c1.je!.id)).found === false && (await expl.explainDecision(tB, c1.d.id)).found === false);

  // ---- F3-10 PostingEngine / StoragePort stay the real paths: balanced, POSTED, account balances moved by the posting itself
  const acc = await st.getAccount(tA, '1204');
  check('F3-10 journals reached the ledger through PostingEngine/StoragePort: status POSTED, balanced, the account balance reflects the posting; re-posting a decision is refused and creates no second journal', c1.je?.status === 'POSTED' && c1.je.lines.reduce((s: number, l: any) => s + l.debit - l.credit, 0) === 0 && !!acc.data && Number(acc.data.creditBalance || 0) >= 150 && (await bridge.postDecision(tA, c1.d.id, A)).error?.status === 409);

  // ---- F3-11 company policy as a real fact: policy choice selects the rule and is shown in the explanation (alternative-policy case)
  const jPo = await mkJ();
  await reg(jPo, 'GOODS_RECEIPT', { tier: 4, policyOption: 'inventory_valuation_method=FIFO', requiredData: ['net'], treatment: { lines: [L('DEBIT', 'INVENTORY', fx('net')), L('CREDIT', 'GRIR', fx('net'))] } });
  await reg(jPo, 'GOODS_RECEIPT', { tier: 4, policyOption: 'inventory_valuation_method=WEIGHTED_AVERAGE', requiredData: ['net'], treatment: { lines: [L('DEBIT', 'INVENTORY', fx('net')), L('CREDIT', 'PAYABLE', fx('net'))] } });
  const p0 = await decide(ev(jPo, 'GOODS_RECEIPT', { net: 60 }));
  await preg.setPolicy(tA, 'inventory_valuation_method', 'FIFO', '2026-01-01', 'f3b', A, k());
  await preg.setPolicy(tA, 'inventory_valuation_method', 'WEIGHTED_AVERAGE', '2026-07-01', 'f3b', A, k());
  const q1 = await chain(ev(jPo, 'GOODS_RECEIPT', { net: 60 }, { date: '2026-03-01' })), q2 = await chain(ev(jPo, 'GOODS_RECEIPT', { net: 60 }, { date: '2026-09-01' }));
  check('F3-11 company policy: no policy -> REVIEW_REQUIRED; FIFO period and weighted-average period post different journals and the explanation shows the policy and its version', p0.decisionStatus === 'REVIEW_REQUIRED' && jeStr(q1.je) === 'D1105:60|C2106:60' && jeStr(q2.je) === 'D1105:60|C2101:60' && q1.x?.sections.policy?.value === 'FIFO' && q2.x?.sections.policy?.value === 'WEIGHTED_AVERAGE' && q2.x?.sections.policy?.version === 2);

  // ---- F3-12 SI-6 end to end: a SOURCE_REQUIRED rule never reaches the ledger
  const jSr = await mkJ();
  await reg(jSr, 'INVENTORY_GAIN', { status: 'SOURCE_REQUIRED', sourceVerified: false, sourceReference: null, treatment: { lines: [L('DEBIT', 'INVENTORY', fx('amount')), L('CREDIT', 'EXP', fx('amount'))] } });
  const sr = await chain(ev(jSr, 'INVENTORY_GAIN', { amount: 5 }));
  check('F3-12 a SOURCE_REQUIRED rule blocks automation end to end: REVIEW_REQUIRED, bridge refuses, no journal exists for the event', sr.d.decisionStatus === 'REVIEW_REQUIRED' && sr.d.reasonCode === 'NOT_AUTOMATABLE' && sr.p.success === false && ((await svc.findDecisions(tA, { eventId: sr.d.eventId })).data || [])[0]?.journalEntryId === null);

  // ---- F3-13 link failure honesty: a decision linked to a journal that cannot be read is reported, not hidden
  const orphan = await decide(ev(jE, 'GOODS_RECEIPT', { net: 10 }));
  await st.linkDecisionToJournal(tA, orphan.id, 'JE-DOES-NOT-EXIST');
  const ox = await expl.explainDecision(tA, orphan.id);
  check('F3-13 a decision linked to a journal that is missing is explained honestly (journal.found=false, matchesTreatment=null)', ox.found && ox.sections.journal?.found === false && ox.sections.journal?.matchesTreatment === null);
}
