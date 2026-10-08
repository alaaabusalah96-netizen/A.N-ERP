/** F2 decision-layer suite. Adapter-agnostic: InMemory (logic) and real PostgreSQL (persistence). All fixtures are ZZ-TEST- rows. */
import type { StoragePort } from '../../src/core/storage/StoragePort';
import { AccountingPolicyRegistry, AccountingRuleRegistry, JurisdictionRegistry, StandardsRegistry, TaxRuleRegistry } from '../../src/core/standards/registries';
import { seedStandardsCatalogue } from '../../src/core/standards/seedCatalogue';
import { StandardsDecisionService } from '../../src/core/standards/StandardsDecisionService';
import { RuleEvaluationEngine } from '../../src/core/standards/RuleEvaluationEngine';
import { AccountingTreatmentEngine, roleMapFromStockConfig } from '../../src/core/standards/AccountingTreatmentEngine';
import { evalConditions, evalExpr } from '../../src/core/standards/conditions';
import type { AccountingRuleRecord, StandardRecord, TaxRuleRecord } from '../../src/core/standards/standardsTypes';
import type { BusinessEvent } from '../../src/core/standards/decisionTypes';
import type { Tally } from './f1StandardsSuite';

export async function runF2Suite(st: StoragePort, tA: string, tB: string, tally: Tally): Promise<void> {
  const check = (label: string, cond: boolean, extra = '') => {
    if (cond) { tally.pass++; console.log(`[PASS] ${label}`); } else { tally.fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
  };
  const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const U = (s: string) => `ZZ-TEST-${run}-${s}`;
  let n = 0; const k = (s = 'k') => `f2-${run}-${s}-${++n}`;
  const A = 'tester';
  await seedStandardsCatalogue(st, A);
  const sreg = new StandardsRegistry(st), jreg = new JurisdictionRegistry(st), rreg = new AccountingRuleRegistry(st), treg = new TaxRuleRegistry(st), preg = new AccountingPolicyRegistry(st);
  const svc = new StandardsDecisionService(st), eng = new RuleEvaluationEngine(st);
  const fix = (framework: 'IFRS' | 'EAS'): StandardRecord => ({ standardId: U(framework + '-STD'), framework, titleEn: 'F2 test fixture (not a real standard)', version: 1, effectiveFrom: '2020-01-01', coverageStatus: 'PARTIAL', coverageEvidenceRef: 'f2-test-fixture', sourceVerified: true, sourceReference: 'TEST-FIXTURE-ONLY' });
  const sI = fix('IFRS'), sE = fix('EAS');
  await sreg.register(sI, A, k()); await sreg.register(sE, A, k());
  let jn = 0;
  const mkJ = async (framework: 'IFRS' | 'EAS' | 'TAX' = 'IFRS') => { const id = U(`J${++jn}`); const r = await jreg.register({ id, kind: 'COUNTRY', countryCode: 'ZZ', framework, parentId: null, relationToIfrs: 'UNVERIFIED', nameAr: 'اختبار', nameEn: 'test', status: 'ACTIVE' }, A, k()); if (!r.success) check(`fixture jurisdiction ${id}`, false, r.error?.detail); return id; };
  const L = (side: 'DEBIT' | 'CREDIT', role: string, amount: unknown, extra: any = {}) => ({ side, role, amount, ...extra });
  const fx = (n: string) => ({ fact: n });
  const std2 = (a: any, b: any) => ({ lines: [L('DEBIT', a, fx('amount')), L('CREDIT', b, fx('amount'))] });
  let rn = 0;
  const reg = async (j: string, eventType: string, o: Partial<AccountingRuleRecord> = {}) => {
    const rule: AccountingRuleRecord = { ruleId: U(`R${++rn}`), standardId: sI.standardId, framework: 'IFRS', jurisdictionId: j, eventType, priority: 10, tier: 2, conditions: {}, treatment: std2('DR_ROLE', 'CR_ROLE'), requiredData: ['amount'], exceptions: [], version: 1, effectiveFrom: '2020-01-01', effectiveTo: null, sourceReference: 'TEST-FIXTURE-ONLY', sourceVerified: true, status: 'ACTIVE', ...o };
    const r = await rreg.register(rule, A, k('rule'));
    if (!r.success) check(`fixture rule ${rule.ruleId}`, false, r.error?.detail);
    return rule;
  };
  const roles: Record<string, string> = { DR_ROLE: '5201', CR_ROLE: '1105', ...roleMapFromStockConfig({ grirAccountCode: '2106', inTransitAccountCode: '1109', defaultInventoryAccountCode: '1105', defaultCogsAccountCode: '5101' }), X_DR: '6001', X_CR: '6002', Y_CR: '6003', RECEIVABLE: '1201', REVENUE: '4101', VAT_OUT: '2301', GRIR_FIFO: '2106', GRIR_WA: '2107', LOSS_EXP: '5301', LOSS_A: '1105', LOSS_B: '1106', GRIR_EAS: '2108', EXP: '5201' };
  let en = 0;
  const ev = (j: string, eventType: string, facts: Record<string, unknown> = { amount: 100 }, o: Partial<BusinessEvent> = {}): BusinessEvent =>
    ({ tenantId: tA, eventType, eventId: U(`E${++en}`), sourceModule: 'f2-test', date: '2025-06-15', currency: 'EGP', reportingJurisdictionId: j, facts, ...o });
  const decide = (e: BusinessEvent, o: any = {}) => svc.decide(e, { actorId: A, accountRoles: roles, ...o });
  const lineStr = (d: any) => (d.treatment.lines || []).map((l: any) => `${l.side[0]}${l.accountCode}:${l.amount}`).join('|');

  // ---------- U. condition + expression language ----------
  check('U1 conditions: literal eq, in, gt/lte, notIn and ne', evalConditions({ a: 'x', b: { in: [1, 2] }, c: { gt: 5, lte: 10 }, d: { notIn: ['p'] }, e: { ne: 3 } }, { a: 'x', b: 2, c: 10, d: 'q', e: 4 }).matched === true && evalConditions({ c: { gt: 5 } }, { c: 5 }).matched === false);
  const m1 = evalConditions({ a: 1, b: { exists: false } }, { b: 7 });
  check('U2 conditions: missing fact is reported (not guessed); exists:false tolerates absence; bad operator is invalid', evalConditions({ a: 1 }, {}).missing[0] === 'fact:a' && evalConditions({ b: { exists: false } }, {}).matched === true && m1.matched === false && evalConditions({ a: { regex: 'x' } }, { a: 'x' }).invalid.length === 1);
  check('U3 nested fact paths work; empty string counts as missing', evalConditions({ 'item.class': 'STOCK' }, { item: { class: 'STOCK' } }).matched === true && evalConditions({ a: 'x' }, { a: '' }).missing.length === 1);
  check('U4 expressions: add/sub/mul/div, taxOn needs a rate, division by zero and bad shapes are errors', evalExpr({ add: [fx('a'), { mul: [fx('b'), { const: 2 }] }] }, { a: 1, b: 3 }, null).value === 7 && evalExpr({ taxOn: fx('a') }, { a: 100 }, null).missing[0] === 'taxRate' && evalExpr({ taxOn: fx('a') }, { a: 100 }, 0.1).value === 10 && evalExpr({ div: [fx('a'), { const: 0 }] }, { a: 1 }, null).error === 'division-by-zero' && !!evalExpr({ add: [1] }, {}, null).error && evalExpr(fx('zz'), {}, null).missing[0] === 'fact:zz');

  // ---------- 1. pilot rule: happy / boundary / invalid / account mapping ----------
  const j1 = await mkJ();
  const wd = await reg(j1, 'INVENTORY_WRITE_DOWN', { conditions: { itemClass: 'STOCK' }, requiredData: ['amount', 'itemClass'], treatment: { lines: [L('DEBIT', 'DR_ROLE', fx('amount'), { dimensions: ['costCenter'] }), L('CREDIT', 'CR_ROLE', fx('amount'))], measurementBasis: 'NRV', recognitionTiming: 'IMMEDIATE', reversal: { required: false }, inventoryEffect: { type: 'DECREASE_CARRYING_AMOUNT' } } });
  const happy = await decide(ev(j1, 'INVENTORY_WRITE_DOWN', { itemClass: 'STOCK', amount: 150.5, costCenter: 'CC1' }));
  const hd = happy.decision;
  check('1.1 happy path: APPLY, DETERMINISTIC, journal lines from configured role map only (balanced)', hd.decisionStatus === 'APPLY' && hd.treatment.confidence === 'DETERMINISTIC' && lineStr(hd) === 'D5201:150.5|C1105:150.5');
  check('1.2 treatment carries rule id/version/standard, measurement basis, timing, reversal and inventory effect', hd.ruleId === wd.ruleId && hd.ruleVersion === 1 && hd.standardId === sI.standardId && hd.treatment.measurementBasis === 'NRV' && hd.treatment.recognitionTiming === 'IMMEDIATE' && hd.treatment.reversal?.required === false && (hd.treatment.inventoryEffect as any)?.type === 'DECREASE_CARRYING_AMOUNT');
  check('1.3 dimensions are copied from facts (cost center)', (hd.treatment.lines[0].dimensions as any).costCenter === 'CC1' && Object.keys(hd.treatment.lines[1].dimensions).length === 0);
  const zero = await decide(ev(j1, 'INVENTORY_WRITE_DOWN', { itemClass: 'STOCK', amount: 0 }));
  const tiny = await decide(ev(j1, 'INVENTORY_WRITE_DOWN', { itemClass: 'STOCK', amount: 0.005 }));
  const whole = await decide(ev(j1, 'INVENTORY_WRITE_DOWN', { itemClass: 'STOCK', amount: 150.5 }, { decimals: 0 }));
  check('1.4 boundary: zero amount -> NOT_APPLICABLE/ZERO_AMOUNT (not stored); 0.005 rounds to 0.01; decimals=0 rounds to whole units', zero.decision.decisionStatus === 'NOT_APPLICABLE' && zero.decision.reasonCode === 'ZERO_AMOUNT' && zero.stored === false && lineStr(tiny.decision) === 'D5201:0.01|C1105:0.01' && lineStr(whole.decision) === 'D5201:151|C1105:151');
  const noAmt = await decide(ev(j1, 'INVENTORY_WRITE_DOWN', { itemClass: 'STOCK' }));
  check('1.5 missing amount -> REVIEW_REQUIRED listing the missing fact, no lines, confidence NONE, stored', noAmt.decision.decisionStatus === 'REVIEW_REQUIRED' && noAmt.decision.missingFacts.includes('fact:amount') && noAmt.decision.treatment.lines.length === 0 && noAmt.decision.treatment.confidence === 'NONE' && noAmt.stored);
  const neg = await decide(ev(j1, 'INVENTORY_WRITE_DOWN', { itemClass: 'STOCK', amount: -5 })), nan = await decide(ev(j1, 'INVENTORY_WRITE_DOWN', { itemClass: 'STOCK', amount: 'abc' }));
  check('1.6 negative or non-numeric amount is REVIEW_REQUIRED (never posted)', neg.decision.reasonCode === 'INVALID_AMOUNT' && neg.decision.decisionStatus === 'REVIEW_REQUIRED' && nan.decision.decisionStatus === 'REVIEW_REQUIRED' && nan.decision.treatment.lines.length === 0);
  const svcCls = await decide(ev(j1, 'INVENTORY_WRITE_DOWN', { itemClass: 'SERVICE', amount: 10 })), noCls = await decide(ev(j1, 'INVENTORY_WRITE_DOWN', { amount: 10 }));
  check('1.7 classification: non-stock item -> NOT_APPLICABLE; unknown class (fact missing) -> REVIEW_REQUIRED', svcCls.decision.decisionStatus === 'NOT_APPLICABLE' && svcCls.decision.reasonCode === 'NO_COVERED_RULE' && noCls.decision.decisionStatus === 'REVIEW_REQUIRED' && noCls.decision.missingFacts.includes('fact:itemClass'));
  const noRole = await decide(ev(j1, 'INVENTORY_WRITE_DOWN', { itemClass: 'STOCK', amount: 5 }), { accountRoles: { DR_ROLE: '5201' } });
  const unk = await decide(ev(j1, 'INVENTORY_WRITE_DOWN', { itemClass: 'STOCK', amount: 5 }), { knownAccountCodes: new Set(['5201']) });
  const known = await decide(ev(j1, 'INVENTORY_WRITE_DOWN', { itemClass: 'STOCK', amount: 5 }), { knownAccountCodes: new Set(['5201', '1105']) });
  check('1.8 account mapping: unmapped role -> REVIEW (accountRole:...), account missing from the chart -> REVIEW, valid chart -> APPLY', noRole.decision.missingFacts.includes('accountRole:CR_ROLE') && noRole.decision.decisionStatus === 'REVIEW_REQUIRED' && unk.decision.reasonCode === 'UNKNOWN_ACCOUNT' && known.decision.decisionStatus === 'APPLY');

  // ---------- 2. effective dates / versions ----------
  const jV = await mkJ();
  await reg(jV, 'INVENTORY_LOSS', { ruleId: U('LOSS'), treatment: std2('LOSS_EXP', 'LOSS_A'), effectiveTo: '2024-12-31' });
  await reg(jV, 'INVENTORY_LOSS', { ruleId: U('LOSS'), version: 2, treatment: std2('LOSS_EXP', 'LOSS_B'), effectiveFrom: '2025-01-01' });
  const dv = async (d: string) => (await decide(ev(jV, 'INVENTORY_LOSS', { amount: 10 }, { date: d }))).decision;
  const d24 = await dv('2024-12-31'), d25 = await dv('2025-01-01'), d19 = await dv('2019-12-31');
  check('2.1 version boundary: last day of v1 uses v1, first day of v2 uses v2, before any version is not covered', d24.ruleVersion === 1 && lineStr(d24).includes('C1105') && d25.ruleVersion === 2 && lineStr(d25).includes('C1106') && d19.decisionStatus === 'NOT_APPLICABLE');
  const again = (await svc.getDecision(tA, d24.id)).data;
  check('2.2 a stored historical decision keeps its rule version even though a newer version now exists', !!again && again.ruleVersion === 1 && again.eventDate === '2024-12-31');

  // ---------- 3. jurisdiction / framework ----------
  const jE = await mkJ('EAS'), jT0 = await mkJ('TAX');
  const gi = await reg(j1, 'GOODS_RECEIPT', { treatment: std2('X_DR', 'GRIR') });
  const ge = await reg(jE, 'GOODS_RECEIPT', { standardId: sE.standardId, framework: 'EAS', treatment: std2('X_DR', 'GRIR_EAS') });
  const a = (await decide(ev(j1, 'GOODS_RECEIPT'))).decision, b = (await decide(ev(jE, 'GOODS_RECEIPT'))).decision;
  check('3.1 jurisdiction difference: same event/facts give a different rule, framework and accounts per jurisdiction', a.ruleId === gi.ruleId && b.ruleId === ge.ruleId && a.framework === 'IFRS' && b.framework === 'EAS' && lineStr(a) !== lineStr(b) && lineStr(b).includes('C2108'));
  const noJ = await decide(ev(j1, 'GOODS_RECEIPT', { amount: 1 }, { reportingJurisdictionId: null })), taxJ = await decide(ev(j1, 'GOODS_RECEIPT', { amount: 1 }, { reportingJurisdictionId: jT0 })), unJ = await decide(ev(j1, 'GOODS_RECEIPT', { amount: 1 }, { reportingJurisdictionId: 'NOPE' }));
  check('3.2 reporting jurisdiction missing / a TAX jurisdiction / unknown -> REVIEW_REQUIRED', noJ.decision.missingFacts.includes('reportingJurisdiction') && taxJ.decision.reasonCode === 'BAD_JURISDICTION' && unJ.decision.reasonCode === 'BAD_JURISDICTION' && [noJ, taxJ, unJ].every(x => x.decision.decisionStatus === 'REVIEW_REQUIRED'));

  // ---------- 4. policy choice (versioned, effective-dated, per tenant) ----------
  const jP = await mkJ();
  await reg(jP, 'GOODS_RECEIPT', { tier: 4, policyOption: 'inventory_valuation_method=FIFO', treatment: std2('X_DR', 'GRIR_FIFO') });
  await reg(jP, 'GOODS_RECEIPT', { tier: 4, policyOption: 'inventory_valuation_method=WEIGHTED_AVERAGE', treatment: std2('X_DR', 'GRIR_WA') });
  const pe = (d: string, tenant = tA) => decide(ev(jP, 'GOODS_RECEIPT', { amount: 50 }, { date: d, tenantId: tenant }));
  const p0 = await pe('2026-03-01');
  check('4.1 no policy set -> REVIEW_REQUIRED naming the missing policy (never a default)', p0.decision.decisionStatus === 'REVIEW_REQUIRED' && p0.decision.missingFacts.includes('policy:inventory_valuation_method'));
  await preg.setPolicy(tA, 'inventory_valuation_method', 'FIFO', '2026-01-01', 'f2', A, k());
  await preg.setPolicy(tA, 'inventory_valuation_method', 'WEIGHTED_AVERAGE', '2026-07-01', 'f2', A, k());
  const pf = (await pe('2026-03-01')).decision, pw = (await pe('2026-08-01')).decision, pb = (await pe('2025-12-31')).decision;
  check('4.2 alternative policy case: FIFO rule before the change, weighted-average rule after, effective-dated', lineStr(pf).includes('C2106') && pf.policyValue === 'FIFO' && pf.policyVersion === 1 && lineStr(pw).includes('C2107') && pw.policyValue === 'WEIGHTED_AVERAGE' && pw.policyVersion === 2);
  check('4.3 before the first policy version -> REVIEW_REQUIRED; another tenant has no policy -> REVIEW_REQUIRED', pb.decisionStatus === 'REVIEW_REQUIRED' && (await pe('2026-03-01', tB)).decision.decisionStatus === 'REVIEW_REQUIRED');

  // ---------- 5. precedence, status, exceptions ----------
  const jA = await mkJ();
  const law = await reg(jA, 'INVENTORY_GAIN', { tier: 1, priority: 1, treatment: std2('X_DR', 'X_CR') });
  const pol = await reg(jA, 'INVENTORY_GAIN', { tier: 4, priority: 99, treatment: std2('X_DR', 'Y_CR') });
  const ov = (await decide(ev(jA, 'INVENTORY_GAIN'))).decision;
  const evR = await eng.evaluate(ev(jA, 'INVENTORY_GAIN'));
  check('5.1 a lower-tier rule never overrides a mandatory one (even with a higher priority); the loser is recorded', ov.ruleId === law.ruleId && ov.tier === 1 && evR.overridden.some(o => o.ruleId === pol.ruleId));
  const jB = await mkJ();
  const c1 = await reg(jB, 'INVENTORY_GAIN', { tier: 2, priority: 10, treatment: std2('X_DR', 'X_CR') }), c2 = await reg(jB, 'INVENTORY_GAIN', { tier: 2, priority: 10, treatment: std2('X_DR', 'Y_CR') });
  const cf = await decide(ev(jB, 'INVENTORY_GAIN'));
  check('5.2 conflicting rules of equal precedence -> REVIEW_REQUIRED listing both, no lines, explanation mentions the conflict', cf.decision.decisionStatus === 'REVIEW_REQUIRED' && cf.decision.reasonCode === 'CONFLICT' && cf.decision.conflicting.map(x => x.ruleId).sort().join() === [c1.ruleId, c2.ruleId].sort().join() && cf.decision.treatment.lines.length === 0 && cf.decision.explanationEn.includes('conflicting'));
  const jC = await mkJ();
  await reg(jC, 'INVENTORY_GAIN', { priority: 10, treatment: std2('X_DR', 'X_CR') }); const hi = await reg(jC, 'INVENTORY_GAIN', { priority: 20, treatment: std2('X_DR', 'Y_CR') });
  const jD = await mkJ();
  await reg(jD, 'INVENTORY_GAIN', { treatment: std2('X_DR', 'X_CR') }); await reg(jD, 'INVENTORY_GAIN', { treatment: std2('X_DR', 'X_CR') });
  const hp = (await decide(ev(jC, 'INVENTORY_GAIN'))).decision, dup = (await decide(ev(jD, 'INVENTORY_GAIN'))).decision;
  check('5.3 same tier, different priority: higher priority wins without conflict; identical duplicates apply with a warning', hp.ruleId === hi.ruleId && hp.decisionStatus === 'APPLY' && dup.decisionStatus === 'APPLY' && dup.warnings.some(w => w.startsWith('DUPLICATE_RULES_SAME_TREATMENT')));
  const jE1 = await mkJ();
  const srcT1 = await reg(jE1, 'INVENTORY_GAIN', { tier: 1, status: 'SOURCE_REQUIRED', sourceVerified: false, sourceReference: null }); await reg(jE1, 'INVENTORY_GAIN', { tier: 2 });
  const blk = await decide(ev(jE1, 'INVENTORY_GAIN'));
  check('5.4 SI-6: a higher-precedence SOURCE_REQUIRED rule blocks automation (REVIEW_REQUIRED, rule listed), nothing is posted', blk.decision.decisionStatus === 'REVIEW_REQUIRED' && blk.decision.reasonCode === 'NOT_AUTOMATABLE' && blk.decision.treatment.lines.length === 0 && (await eng.evaluate(ev(jE1, 'INVENTORY_GAIN'))).notAutomatable.some(x => x.ruleId === srcT1.ruleId));
  const jF = await mkJ();
  await reg(jF, 'INVENTORY_GAIN', { tier: 3, status: 'REFERENCE_ONLY', sourceVerified: false, sourceReference: null }); await reg(jF, 'INVENTORY_GAIN', { tier: 2 });
  const jG = await mkJ();
  await reg(jG, 'INVENTORY_GAIN', { status: 'REFERENCE_ONLY', sourceVerified: false, sourceReference: null }); await reg(jG, 'INVENTORY_GAIN', { ruleId: U('DRAFTR'), status: 'DRAFT', sourceVerified: false, sourceReference: null });
  const lowB = (await decide(ev(jF, 'INVENTORY_GAIN'))).decision, onlyRef = (await decide(ev(jG, 'INVENTORY_GAIN'))).decision;
  check('5.5 a lower-precedence non-automatable rule does not block; REFERENCE_ONLY/DRAFT alone never auto-posts (REVIEW)', lowB.decisionStatus === 'APPLY' && onlyRef.decisionStatus === 'REVIEW_REQUIRED' && onlyRef.reasonCode === 'NOT_AUTOMATABLE' && onlyRef.treatment.lines.length === 0);
  const jH = await mkJ();
  const tier1 = await reg(jH, 'INVENTORY_GAIN', { tier: 1, conditions: { country: 'EG' }, treatment: std2('X_DR', 'Y_CR') }); const tier2 = await reg(jH, 'INVENTORY_GAIN', { tier: 2 });
  const miss = (await decide(ev(jH, 'INVENTORY_GAIN'))).decision, other = (await decide(ev(jH, 'INVENTORY_GAIN', { amount: 1, country: 'SA' }))).decision, eg = (await decide(ev(jH, 'INVENTORY_GAIN', { amount: 1, country: 'EG' }))).decision;
  check('5.6 a higher-precedence rule that cannot be evaluated (fact missing) blocks the lower one; once the fact is known the right rule applies', miss.decisionStatus === 'REVIEW_REQUIRED' && miss.missingFacts.includes('fact:country') && other.ruleId === tier2.ruleId && eg.ruleId === tier1.ruleId);
  const jI = await mkJ();
  await reg(jI, 'INVENTORY_GAIN', { ruleId: U('SUP'), status: 'SUPERSEDED', effectiveTo: '2024-12-31', treatment: std2('X_DR', 'X_CR') });
  await reg(jI, 'INVENTORY_GAIN', { ruleId: U('SUP'), version: 2, effectiveFrom: '2025-01-01', treatment: std2('X_DR', 'Y_CR') });
  await reg(jI, 'INVENTORY_LOSS', { ruleId: U('RET'), status: 'RETIRED' });
  const histS = (await decide(ev(jI, 'INVENTORY_GAIN', { amount: 5 }, { date: '2024-06-01' }))).decision, curS = (await decide(ev(jI, 'INVENTORY_GAIN', { amount: 5 }, { date: '2025-06-01' }))).decision, ret = (await decide(ev(jI, 'INVENTORY_LOSS'))).decision;
  check('5.7 a verified SUPERSEDED rule still decides transactions inside its own window; RETIRED never applies', histS.ruleVersion === 1 && lineStr(histS).includes('C6002') && curS.ruleVersion === 2 && ret.decisionStatus === 'NOT_APPLICABLE');
  const jJ = await mkJ();
  await reg(jJ, 'INVENTORY_GAIN', { conditions: { a: { regex: 'x' } } });
  const badRule = (await decide(ev(jJ, 'INVENTORY_GAIN', { a: 'x', amount: 1 }))).decision;
  check('5.8 a malformed rule condition is REVIEW_REQUIRED (INVALID_RULE), never ignored', badRule.decisionStatus === 'REVIEW_REQUIRED' && badRule.reasonCode === 'INVALID_RULE');
  const jK = await mkJ();
  await reg(jK, 'INVENTORY_GAIN', { exceptions: [{ when: { isScrap: true }, action: 'NOT_APPLICABLE', reasonAr: 'خردة' }, { when: { amount: { gt: 1000000 } }, action: 'REVIEW_REQUIRED', reasonAr: 'مبلغ كبير' }] });
  const xe = (f: any) => decide(ev(jK, 'INVENTORY_GAIN', f)).then(r => r.decision);
  const e1 = await xe({ amount: 10, isScrap: true }), e2 = await xe({ amount: 10 }), e3 = await xe({ amount: 2000000, isScrap: false }), e4 = await xe({ amount: 10, isScrap: false });
  check('5.9 exceptions run in array order: NOT_APPLICABLE / unknown fact -> REVIEW / large amount -> REVIEW / normal -> APPLY', e1.decisionStatus === 'NOT_APPLICABLE' && e1.reasonCode === 'EXCEPTION_NOT_APPLICABLE' && e2.decisionStatus === 'REVIEW_REQUIRED' && e2.missingFacts.includes('fact:isScrap') && e3.reasonCode === 'EXCEPTION_REVIEW_REQUIRED' && e4.decisionStatus === 'APPLY');
  const jL = await mkJ();
  await reg(jL, 'INVENTORY_GAIN', { ruleId: U('ONE'), treatment: { lines: [L('DEBIT', 'X_DR', fx('amount'))] } });
  await reg(jL, 'INVENTORY_LOSS', { ruleId: U('UNB'), treatment: { lines: [L('DEBIT', 'X_DR', { const: 100 }), L('CREDIT', 'X_CR', { const: 90 })] } });
  await reg(jL, 'INVENTORY_COUNT', { ruleId: U('ZL'), treatment: { lines: [L('DEBIT', 'X_DR', fx('amount')), L('CREDIT', 'X_CR', fx('amount')), L('DEBIT', 'EXP', { const: 0 })] } });
  const one = (await decide(ev(jL, 'INVENTORY_GAIN'))).decision, unb = (await decide(ev(jL, 'INVENTORY_LOSS'))).decision, zl = (await decide(ev(jL, 'INVENTORY_COUNT'))).decision;
  check('5.10 malformed (single line) and unbalanced treatments are REVIEW_REQUIRED; a zero line is dropped with a warning', one.reasonCode === 'MALFORMED_TREATMENT' && unb.reasonCode === 'UNBALANCED' && unb.treatment.lines.length === 0 && zl.decisionStatus === 'APPLY' && zl.treatment.lines.length === 2 && zl.warnings.includes('ZERO_LINE_DROPPED'));

  // ---------- 6. tax separation ----------
  const jS = await mkJ(), jTx = await mkJ('TAX'), jTs = await mkJ('TAX'), jTc = await mkJ('TAX'), jTv = await mkJ('TAX');
  const taxRule = async (j: string, o: Partial<TaxRuleRecord> = {}) => { const r = await treg.register({ taxRuleId: U(`T${++rn}`), jurisdictionId: j, taxType: 'VAT', priority: 1, conditions: {}, treatment: { output: { role: 'VAT_OUT' } }, requiredData: [], version: 1, effectiveFrom: '2020-01-01', effectiveTo: null, sourceReference: 'TEST-FIXTURE-ONLY', sourceVerified: true, status: 'ACTIVE', rate: 0.1, ...o }, A, k('tax')); if (!r.success) check('fixture tax rule', false, r.error?.detail); };
  await reg(jS, 'SALES_INVOICE', { requiredData: ['net'], treatment: { lines: [L('DEBIT', 'RECEIVABLE', { add: [fx('net'), { taxOn: fx('net') }] }), L('CREDIT', 'REVENUE', fx('net')), L('CREDIT', 'VAT_OUT', { taxOn: fx('net') })] } });
  await taxRule(jTx, { conditions: { supplyType: 'TAXABLE' }, rate: 0.1 }); await taxRule(jTx, { conditions: { supplyType: 'ZERO' }, rate: 0, priority: 5 });
  const sv = (f: any, o: Partial<BusinessEvent> = {}) => decide(ev(jS, 'SALES_INVOICE', f, { taxJurisdictionId: jTx, ...o })).then(r => r.decision);
  const t1 = await sv({ net: 1000, supplyType: 'TAXABLE' });
  check('6.1 tax assertion: accounting rule + separate tax rule => receivable 1100 / revenue 1000 / VAT 100, explanation cites the tax rule', t1.decisionStatus === 'APPLY' && lineStr(t1) === 'D1201:1100|C4101:1000|C2301:100' && !!t1.taxTreatment?.taxRuleId && t1.explanationEn.includes('tax treatment VAT'));
  const t2 = await sv({ net: 1000, supplyType: 'ZERO' });
  check('6.2 zero-rated supply: VAT line dropped (rate 0), balanced 1000/1000', t2.decisionStatus === 'APPLY' && lineStr(t2) === 'D1201:1000|C4101:1000' && t2.warnings.includes('ZERO_LINE_DROPPED'));
  const t3 = await decide(ev(jS, 'SALES_INVOICE', { net: 1000 })), t4 = await sv({ net: 1000 });
  check('6.3 tax not requested but the treatment needs a rate -> REVIEW (taxRate); tax fact (supplyType) missing -> REVIEW (TAX_REVIEW)', t3.decision.missingFacts.includes('taxRate') && t3.decision.decisionStatus === 'REVIEW_REQUIRED' && t4.reasonCode === 'TAX_REVIEW' && t4.missingFacts.includes('fact:supplyType'));
  await taxRule(jTs, { status: 'SOURCE_REQUIRED', sourceVerified: false, sourceReference: null, rate: null });
  await taxRule(jTc, { rate: 0.1 }); await taxRule(jTc, { rate: 0.2 });
  const t5 = await sv({ net: 100, supplyType: 'X' }, { taxJurisdictionId: jTs }), t6 = await sv({ net: 100 }, { taxJurisdictionId: jTc }), t7 = await sv({ net: 100 }, { taxJurisdictionId: jS });
  check('6.4 tax rules obey SI-6/SI-8: SOURCE_REQUIRED tax rule, conflicting tax rules and a non-TAX jurisdiction all end in REVIEW_REQUIRED', t5.reasonCode === 'TAX_REVIEW' && t5.taxTreatment?.reasonCode === 'TAX_NOT_AUTOMATABLE' && t6.decisionStatus === 'REVIEW_REQUIRED' && t6.taxTreatment?.reasonCode === 'CONFLICT' && t7.taxTreatment?.reasonCode === 'BAD_TAX_JURISDICTION' && t7.decisionStatus === 'REVIEW_REQUIRED');
  await taxRule(jTv, { effectiveTo: '2024-12-31', rate: 0.1 }); await taxRule(jTv, { version: 2, effectiveFrom: '2025-01-01', rate: 0.14 });
  const tv1 = await sv({ net: 1000 }, { taxJurisdictionId: jTv, date: '2024-06-01' }), tv2 = await sv({ net: 1000 }, { taxJurisdictionId: jTv, date: '2025-06-01' });
  check('6.5 tax rate follows the transaction date (v1 10% before 2025, v2 14% after)', lineStr(tv1) === 'D1201:1100|C4101:1000|C2301:100' && lineStr(tv2) === 'D1201:1140|C4101:1000|C2301:140');

  // ---------- 7. event validation, determinism ----------
  const bad1 = await eng.evaluate(ev(j1, 'MADE_UP_EVENT')), bad2 = await eng.evaluate(ev(j1, 'GOODS_RECEIPT', { amount: 1 }, { date: '2025-13-40' })), bad3 = await eng.evaluate(ev(j1, 'GOODS_RECEIPT', { amount: 1 }, { eventId: '' }));
  check('7.1 invalid events (unknown type / bad date / no id) are REJECT and are never stored', [bad1, bad2, bad3].every(x => x.decisionStatus === 'REJECT' && x.reasonCode === 'INVALID_EVENT') && (await decide(ev(j1, 'MADE_UP_EVENT'))).stored === false);
  const e0 = ev(j1, 'INVENTORY_WRITE_DOWN', { itemClass: 'STOCK', amount: 77.25, costCenter: 'C9' });
  const r1 = await eng.evaluate(e0), r2 = await eng.evaluate({ ...e0, facts: { costCenter: 'C9', amount: 77.25, itemClass: 'STOCK' } }), r3 = await eng.evaluate(e0);
  const tt = new AccountingTreatmentEngine(), t_a = tt.build(e0, r1, null, { accountRoles: roles }), t_b = tt.build({ ...e0, facts: { costCenter: 'C9', amount: 77.25, itemClass: 'STOCK' } }, r2, null, { accountRoles: roles });
  check('7.2 determinism: same facts (any key order, repeated runs) give identical evaluation and treatment', JSON.stringify(r1) === JSON.stringify(r3) && JSON.stringify(r1) === JSON.stringify(r2) && JSON.stringify(t_a.lines) === JSON.stringify(t_b.lines) && t_a.explanation.en === t_b.explanation.en);
  check('7.3 DETERMINISTIC confidence only when APPLY: every non-APPLY decision has confidence NONE and no lines', [neg, noAmt, cf, blk, { decision: miss }].every((x: any) => x.decision.treatment.confidence === 'NONE' && x.decision.treatment.lines.length === 0));

  // ---------- 8. durable decision record, audit, idempotency, link, isolation ----------
  const e8 = ev(j1, 'INVENTORY_WRITE_DOWN', { itemClass: 'STOCK', amount: 40 });
  const s1 = await decide(e8), s2 = await decide({ ...e8, facts: { itemClass: 'STOCK', amount: 999 } });
  const sameKey = ((await svc.findDecisions(tA, { eventId: e8.eventId })).data || []);
  check('8.1 stored decision is replay-safe: same event twice stores once and returns the ORIGINAL decision (immutable)', s1.stored && s2.stored && s1.decision.id === s2.decision.id && sameKey.length === 1 && (s2.decision.facts as any).amount === 40 && lineStr(s2.decision) === 'D5201:40|C1105:40');
  const d8 = s1.decision;
  check('8.2 audit explanation: Arabic and English text name the rule, version, standard, framework, jurisdiction and source', [d8.explanationAr, d8.explanationEn].every(t => t.includes(wd.ruleId) && t.includes(sI.standardId) && t.includes('IFRS') && t.includes(j1) && t.includes('TEST-FIXTURE-ONLY')) && d8.explanationAr.includes('القاعدة') && d8.explanationEn.includes('rule'));
  check('8.3 durable record has source event, facts, framework, jurisdiction, standard, rule+version, tier and created-by', d8.eventId === e8.eventId && d8.eventType === 'INVENTORY_WRITE_DOWN' && d8.sourceModule === 'f2-test' && d8.framework === 'IFRS' && d8.jurisdictionId === j1 && d8.tier === 2 && d8.createdBy === A && (d8.facts as any).itemClass === 'STOCK' && d8.journalEntryId === null);
  const na = await decide(ev(j1, 'PERIOD_CLOSE', { amount: 1 }), { persistNotApplicable: true });
  check('8.4 NOT_APPLICABLE is not stored by default but can be (persistNotApplicable)', zero.stored === false && na.stored === true && na.decision.decisionStatus === 'NOT_APPLICABLE');
  const l1 = await svc.linkJournal(tA, d8.id, 'JE-1'), l2 = await svc.linkJournal(tA, d8.id, 'JE-1'), l3 = await svc.linkJournal(tA, d8.id, 'JE-2');
  const byJ = (await svc.findDecisions(tA, { journalEntryId: 'JE-1' })).data || [];
  check('8.5 journal link is one-way: same journal is a no-op, a different journal is 409; decisions are findable by journal', l1.success && l1.data?.journalEntryId === 'JE-1' && l2.success && l3.success === false && l3.error?.status === 409 && byJ.length === 1 && byJ[0].id === d8.id);
  const lr = await svc.linkJournal(tA, noAmt.decision.id, 'JE-9'), lu = await svc.linkJournal(tA, 'dec-unknown', 'JE-9');
  check('8.6 only APPLY decisions can be linked to a journal (409); unknown decision is 404', lr.success === false && lr.error?.status === 409 && lu.success === false && lu.error?.status === 404);
  const iso = await svc.getDecision(tB, d8.id), isoList = await svc.findDecisions(tB, { eventId: e8.eventId });
  check('8.7 tenant isolation: another tenant cannot read or list the decision', iso.success && iso.data === null && (isoList.data || []).length === 0 && (await svc.linkJournal(tB, d8.id, 'JE-X')).error?.status === 404);
  const all = (await svc.findDecisions(tA, { status: 'APPLY', limit: 500 })).data || [];
  check('8.8 SI-9: every stored APPLY decision carries a durable rule reference (rule id, version, standard)', all.length > 5 && all.every(x => !!x.ruleId && x.ruleVersion != null && !!x.standardId));
}
