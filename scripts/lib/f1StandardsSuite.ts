/** F1 Standards Intelligence suite. Adapter-agnostic: runs on InMemory (logic) and on real PostgreSQL (persistence). */
import type { StoragePort } from '../../src/core/storage/StoragePort';
import { AccountingPolicyRegistry, AccountingRuleRegistry, JurisdictionRegistry, StandardsRegistry, TaxRuleRegistry, findAccountNumberKey } from '../../src/core/standards/registries';
import { SEED_JURISDICTIONS, SEED_STANDARDS, seedStandardsCatalogue } from '../../src/core/standards/seedCatalogue';
import { isEarlyAdoptedOn, isEffectiveOn, resolveVersion, validateNewVersion, validateWindow } from '../../src/core/standards/EffectiveDateResolver';
import { ACCOUNTING_EVENTS, AccountingRuleRecord, StandardRecord, TaxRuleRecord, UNASSERTED_DATE, isKnownAccountingEvent, registerAccountingEvent } from '../../src/core/standards/standardsTypes';

export interface Tally { pass: number; fail: number }
export async function runF1Suite(st: StoragePort, tenantA: string, tenantB: string, tally: Tally): Promise<void> {
  const check = (label: string, cond: boolean, extra = '') => {
    if (cond) { tally.pass++; console.log(`[PASS] ${label}`); } else { tally.fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
  };
  const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const U = (s: string) => `ZZ-TEST-${run}-${s}`;
  let n = 0; const k = (s = 'k') => `f1-${run}-${s}-${++n}`;
  const A = 'tester';

  // ---------- A. EffectiveDateResolver (pure) ----------
  const v = (version: number, from: string, to: string | null = null, extra: any = {}) => ({ version, effectiveFrom: from, effectiveTo: to, ...extra });
  check('A1 boundary: effectiveFrom is inclusive', isEffectiveOn(v(1, '2024-01-01', '2024-12-31'), '2024-01-01'));
  check('A2 boundary: effectiveTo is inclusive', isEffectiveOn(v(1, '2024-01-01', '2024-12-31'), '2024-12-31'));
  check('A3 day before / after window is not effective', !isEffectiveOn(v(1, '2024-01-01', '2024-12-31'), '2023-12-31') && !isEffectiveOn(v(1, '2024-01-01', '2024-12-31'), '2025-01-01'));
  check('A4 open-ended window and malformed date', isEffectiveOn(v(1, '2024-01-01'), '2099-01-01') && !isEffectiveOn(v(1, '2024-01-01'), '2024-13-45'));
  const vs = [v(1, '2020-01-01', '2022-12-31'), v(2, '2023-01-01', null)];
  const r1 = resolveVersion('X', vs, '2021-06-01'), r2 = resolveVersion('X', [...vs].reverse(), '2021-06-01');
  check('A5 historical date resolves v1 regardless of input order', r1.status === 'RESOLVED' && (r1 as any).item.version === 1 && r2.status === 'RESOLVED' && (r2 as any).item.version === 1);
  const r3 = resolveVersion('X', vs, '2023-05-05');
  check('A6 current date resolves v2', r3.status === 'RESOLVED' && (r3 as any).item.version === 2);
  check('A7 date before any version -> NONE', resolveVersion('X', vs, '2019-12-31').status === 'NONE');
  check('A8 two effective versions with the same number -> CONFLICT (no guessing)', resolveVersion('X', [v(1, '2020-01-01'), v(1, '2020-01-01')], '2021-01-01').status === 'CONFLICT');
  const ea = v(3, '2026-01-01', null, { earlyAdoptionAllowed: true, earlyAdoptionFrom: '2025-07-01' });
  check('A9 early adoption needs explicit opt-in', resolveVersion('X', [ea], '2025-09-01').status === 'NONE' && resolveVersion('X', [ea], '2025-09-01', { earlyAdoptionOptIn: new Set(['X@3']) }).status === 'RESOLVED');
  check('A10 early adoption not before earlyAdoptionFrom, not if not allowed', !isEarlyAdoptedOn(ea, 'X', '2025-06-30', { earlyAdoptionOptIn: new Set(['X@3']) }) && !isEarlyAdoptedOn(v(3, '2026-01-01'), 'X', '2025-09-01', { earlyAdoptionOptIn: new Set(['X@3']) }));
  check('A11 validateWindow rejects reversed / malformed windows', !!validateWindow(v(1, '2024-05-01', '2024-04-01')) && !!validateWindow(v(0, '2024-01-01')) && !!validateWindow(v(1, '2024/01/01')) && validateWindow(v(1, '2024-01-01')) === null);
  check('A12 validateNewVersion rejects overlap and reused version, accepts adjacent', !!validateNewVersion(vs as any, v(3, '2022-06-01') as any) && !!validateNewVersion(vs as any, v(2, '2030-01-01') as any) && validateNewVersion([v(1, '2020-01-01', '2022-12-31')] as any, v(2, '2023-01-01') as any) === null);

  // ---------- B. Taxonomy + seed ----------
  check('B1 taxonomy has the 42 spec events', ACCOUNTING_EVENTS.length === 42 && isKnownAccountingEvent('INVENTORY_WRITE_DOWN_REVERSAL'));
  check('B2 taxonomy is extensible but rejects malformed names', registerAccountingEvent('ZZ_CUSTOM_EVENT') && isKnownAccountingEvent('ZZ_CUSTOM_EVENT') && !registerAccountingEvent('bad name'));
  const s1 = await seedStandardsCatalogue(st, A);
  const js = (await st.listJurisdictions()).data || [];
  const ss = (await st.listStandards()).data || [];
  check('B3 seed: no errors, every seed jurisdiction and standard present', s1.errors.length === 0 && SEED_JURISDICTIONS.every(j => js.some(x => x.id === j.id)) && SEED_STANDARDS.every(x => ss.some(y => y.standardId === x.standardId && y.framework === x.framework)), JSON.stringify(s1.errors.slice(0, 2)));
  const s2 = await seedStandardsCatalogue(st, A);
  check('B4 re-seed is idempotent (adds nothing, no errors)', s2.standards === 0 && s2.jurisdictions === 0 && s2.errors.length === 0);
  const seeded = ss.filter(x => SEED_STANDARDS.some(y => y.standardId === x.standardId && y.framework === x.framework));
  check('B5 SI-10: every seeded standard is NOT_IMPLEMENTED, unverified, no asserted date', seeded.every(x => x.coverageStatus === 'NOT_IMPLEMENTED' && x.sourceVerified === false && x.effectiveFrom === UNASSERTED_DATE && !x.sourceReference));
  const eas13 = seeded.find(x => x.standardId === 'EAS 13');
  check('B6 SI-3: Egypt is EAS (not IFRS), EAS->IFRS mapping is UNVERIFIED, tax is its own jurisdiction', js.find(j => j.id === 'EG-EAS')?.framework === 'EAS' && eas13?.mapping?.relation === 'UNVERIFIED' && js.find(j => j.id === 'EG-TAX')?.framework === 'TAX' && js.find(j => j.id === 'GULF-PACK')?.status === 'PLACEHOLDER');
  check('B7 no invented EAS numbers for revenue/leases (placeholder ids only)', seeded.some(x => x.standardId === 'EAS-REVENUE-PLACEHOLDER') && seeded.some(x => x.standardId === 'EAS-LEASES-PLACEHOLDER'));
  const sreg = new StandardsRegistry(st);
  const rep = await sreg.coverageReport();
  check('B8 coverage report lists IAS 2 as NOT_IMPLEMENTED', rep.find(x => x.standardId === 'IAS 2')?.coverage === 'NOT_IMPLEMENTED');

  // ---------- C. Standards guards + immutability ----------
  const fixIfrs: StandardRecord = { standardId: U('IFRS-STD'), framework: 'IFRS', titleEn: 'Test fixture (not a real standard)', version: 1, effectiveFrom: '2020-01-01', coverageStatus: 'PARTIAL', coverageEvidenceRef: 'f1-test-fixture', sourceVerified: true, sourceReference: 'TEST-FIXTURE-ONLY' };
  const fixEas: StandardRecord = { ...fixIfrs, standardId: U('EAS-STD'), framework: 'EAS' };
  check('C1 IMPLEMENTED without evidence is rejected', (await sreg.setCoverage('IAS 2', 1, 'IMPLEMENTED', null, A, k())).success === false);
  check('C2 cannot mark an unverified-source standard as implemented', (await sreg.setCoverage('IAS 2', 1, 'PARTIAL', 'some-evidence', A, k())).error?.title === 'unverified-source');
  check('C3 registering PARTIAL without evidence is rejected', (await sreg.register({ ...fixIfrs, standardId: U('NOEV'), coverageEvidenceRef: null }, A, k())).error?.title === 'coverage-without-evidence');
  check('C4 verified fixtures (IFRS + EAS) register', (await sreg.register(fixIfrs, A, k('s1'))).success && (await sreg.register(fixEas, A, k('s2'))).success);
  check('C5 duplicate (standard, version) is rejected, history immutable', (await sreg.register({ ...fixIfrs, titleEn: 'changed' }, A, k())).error?.status === 409);
  const kk = k('replay');
  const first = await st.saveStandard({ ...fixIfrs, standardId: U('REPLAY') }, A, kk);
  const replay = await st.saveStandard({ ...fixIfrs, standardId: U('REPLAY') }, A, kk);
  const other = await st.saveStandard({ ...fixIfrs, standardId: U('REPLAY') }, A, k('other'));
  check('C6 storage: same idempotencyKey replays OK, a different key conflicts (409)', first.success && replay.success && other.error?.status === 409);
  check('C7 EQUIVALENT_VERIFIED mapping without source is rejected (mapping is not equivalence)', (await sreg.register({ ...fixIfrs, standardId: U('MAP'), mapping: { standardId: 'IAS 21', relation: 'EQUIVALENT_VERIFIED' } }, A, k())).error?.title === 'mapping-without-source');
  const cov = await sreg.setCoverage(fixIfrs.standardId, 1, 'IMPLEMENTED', 'f1-evidence-2', A, k());
  check('C8 coverage upgrade with evidence on a verified standard is accepted', cov.success && cov.data?.coverageStatus === 'IMPLEMENTED');

  // ---------- D. Jurisdictions + accounting rules ----------
  const jreg = new JurisdictionRegistry(st), rreg = new AccountingRuleRegistry(st), treg = new TaxRuleRegistry(st);
  const jI = U('J-IFRS'), jE = U('J-EAS'), jT = U('J-TAX');
  const mkJ = (id: string, framework: any) => ({ id, kind: 'COUNTRY' as const, countryCode: 'ZZ', framework, parentId: null, relationToIfrs: 'UNVERIFIED' as const, nameAr: 'اختبار', nameEn: 'test', status: 'ACTIVE' as const });
  check('D1 test jurisdictions register; unknown parent rejected', (await jreg.register(mkJ(jI, 'IFRS'), A, k())).success && (await jreg.register(mkJ(jE, 'EAS'), A, k())).success && (await jreg.register(mkJ(jT, 'TAX'), A, k())).success && (await jreg.register({ ...mkJ(U('J-BAD'), 'IFRS'), parentId: 'NOPE' }, A, k())).error?.title === 'bad-parent');
  const rule = (o: Partial<AccountingRuleRecord> = {}): AccountingRuleRecord => ({
    ruleId: U('R1'), standardId: fixIfrs.standardId, framework: 'IFRS', jurisdictionId: jI, eventType: 'GOODS_RECEIPT', priority: 10, tier: 2,
    conditions: { itemClass: 'STOCK' }, treatment: { debit: { role: 'INVENTORY' }, credit: { role: 'GRIR' } }, requiredData: ['itemClass'], exceptions: [],
    version: 1, effectiveFrom: '2024-01-01', effectiveTo: '2024-12-31', sourceReference: 'TEST-FIXTURE-ONLY', sourceVerified: true, status: 'ACTIVE', ...o });
  check('D2 ACTIVE without a verified source is rejected (SI-6/SI-10)', (await rreg.register(rule({ sourceVerified: false }), A, k())).error?.title === 'unverified-source' && (await rreg.register(rule({ sourceReference: '' }), A, k())).error?.title === 'unverified-source');
  check('D3 ACTIVE with the unasserted-date sentinel is rejected', (await rreg.register(rule({ effectiveFrom: UNASSERTED_DATE, effectiveTo: null }), A, k())).success === false);
  check('D4 account numbers inside a treatment are rejected (roles only), even nested', (await rreg.register(rule({ treatment: { debit: { accountCode: '1105' } } }), A, k())).error?.title === 'account-number-forbidden' && findAccountNumberKey({ a: { b: [{ accountNumber: 1 }] } }) === 'accountNumber' /* arrays are scanned too */ && findAccountNumberKey({ a: { glAccount: 1 } }) === 'glAccount');
  check('D5 unknown event / bad tier rejected', (await rreg.register(rule({ eventType: 'MADE_UP' }), A, k())).error?.title === 'unknown-event' && (await rreg.register(rule({ tier: 9 as any }), A, k())).error?.title === 'bad-priority');
  check('D6 SI-8: accounting rule in a TAX jurisdiction rejected; framework mismatch rejected; unknown standard rejected', (await rreg.register(rule({ jurisdictionId: jT }), A, k())).error?.title === 'tax-separation' && (await rreg.register(rule({ jurisdictionId: jE }), A, k())).error?.title === 'framework-mismatch' && (await rreg.register(rule({ standardId: 'NO-SUCH' }), A, k())).error?.title === 'unknown-standard');
  check('D7 ACTIVE rule needs a covered standard (IAS 2 is NOT_IMPLEMENTED)', (await rreg.register(rule({ standardId: 'IAS 2' }), A, k())).error?.title === 'standard-not-covered');
  const reg1 = await rreg.register(rule(), A, k('r1'));
  check('D8 valid ACTIVE rule (verified fixture) registers', reg1.success, reg1.error?.detail);
  check('D9 overlapping window and reused version number are rejected', (await rreg.register(rule({ version: 2, effectiveFrom: '2024-06-01', effectiveTo: null }), A, k())).error?.status === 409 && (await rreg.register(rule({ version: 1, effectiveFrom: '2030-01-01', effectiveTo: null }), A, k())).error?.status === 409);
  check('D10 v2 (adjacent window) registers; v1 untouched', (await rreg.register(rule({ version: 2, effectiveFrom: '2025-01-01', effectiveTo: null, treatment: { debit: { role: 'INVENTORY' }, credit: { role: 'SUPPLIERS' } } }), A, k('r2'))).success && ((await st.listAccountingRules({ ruleId: U('R1') })).data || []).find(x => x.version === 1)?.effectiveTo === '2024-12-31');
  const hist = async (d: string, j = jI) => (await rreg.candidates('GOODS_RECEIPT', j, d)).map(x => `${x.ruleId.slice(-2)}@v${x.version}`);
  check('D11 historical transaction resolves to the rule effective on its date', JSON.stringify(await hist('2024-06-15')) === '["R1@v1"]' && JSON.stringify(await hist('2025-03-01')) === '["R1@v2"]' && (await hist('2023-12-31')).length === 0);
  const sr = await rreg.register(rule({ ruleId: U('R-SRC'), status: 'SOURCE_REQUIRED', sourceVerified: false, sourceReference: null, effectiveFrom: '2024-01-01', effectiveTo: null }), A, k());
  check('D12 SOURCE_REQUIRED rule registers but is never a posting candidate (SI-6)', sr.success && !(await rreg.candidates('GOODS_RECEIPT', jI, '2024-06-15')).some(x => x.ruleId === U('R-SRC')));
  const rE = await rreg.register(rule({ ruleId: U('R-EAS'), standardId: fixEas.standardId, framework: 'EAS', jurisdictionId: jE, treatment: { debit: { role: 'INVENTORY' }, credit: { role: 'GRIR_EAS' } } }), A, k());
  const cI = await rreg.candidates('GOODS_RECEIPT', jI, '2024-06-15'), cE = await rreg.candidates('GOODS_RECEIPT', jE, '2024-06-15');
  check('D13 jurisdiction change yields a different applicable rule', rE.success && cI.length === 1 && cE.length === 1 && cI[0].ruleId !== cE[0].ruleId && cE[0].framework === 'EAS');
  const rr = await rreg.resolveRule(U('R1'), '2024-06-15');
  check('D14 "which rule applied on this date?" answers rule id + version + source', rr.status === 'RESOLVED' && (rr as any).item.version === 1 && (rr as any).item.sourceReference === 'TEST-FIXTURE-ONLY');
  const ord = [rule({ ruleId: U('P-LOW'), priority: 1, tier: 2, effectiveTo: null }), rule({ ruleId: U('P-HIGH'), priority: 99, tier: 2, effectiveTo: null }), rule({ ruleId: U('P-LAW'), priority: 1, tier: 1, effectiveTo: null })];
  for (const o of ord) await rreg.register(o, A, k());
  const order = (await rreg.candidates('GOODS_RECEIPT', jI, '2026-01-01')).map(x => x.ruleId.replace(U(''), ''));
  check('D15 candidates ordered explicitly (tier, then priority), not by insertion', order.indexOf('P-LAW') === 0 && order.indexOf('P-HIGH') < order.indexOf('R1') && order.indexOf('R1') < order.indexOf('P-LOW'), order.join(','));

  // ---------- E. Tax registry ----------
  const tx = (o: Partial<TaxRuleRecord> = {}): TaxRuleRecord => ({ taxRuleId: U('T1'), jurisdictionId: jT, taxType: 'VAT', priority: 1, conditions: {}, treatment: { output: { role: 'VAT_OUT' } }, requiredData: [], version: 1, effectiveFrom: '2024-01-01', effectiveTo: null, sourceReference: 'TEST-FIXTURE-ONLY', sourceVerified: true, status: 'ACTIVE', rate: 0.1, ...o });
  check('E1 tax rule in a non-TAX jurisdiction rejected (SI-8)', (await treg.register(tx({ jurisdictionId: jI }), A, k())).error?.title === 'tax-separation');
  check('E2 invented rate (unverified source) and out-of-range rate rejected', (await treg.register(tx({ sourceVerified: false, status: 'SOURCE_REQUIRED' }), A, k())).error?.title === 'unverified-rate' && (await treg.register(tx({ rate: 1.5 }), A, k())).error?.title === 'bad-rate');
  check('E3 SOURCE_REQUIRED tax rule without a rate registers (no invented numbers)', (await treg.register(tx({ taxRuleId: U('T-NORATE'), rate: null, sourceVerified: false, sourceReference: null, status: 'SOURCE_REQUIRED' }), A, k())).success);
  check('E4 verified tax rule registers; v2 adjacent ok; overlap rejected', (await treg.register(tx({ effectiveTo: '2024-12-31' }), A, k())).success && (await treg.register(tx({ version: 2, effectiveFrom: '2025-01-01', rate: 0.2 }), A, k())).success && (await treg.register(tx({ version: 3, effectiveFrom: '2024-05-01' }), A, k())).error?.status === 409);
  const t1 = await treg.resolve(U('T1'), '2024-06-01'), t2 = await treg.resolve(U('T1'), '2025-06-01');
  check('E5 tax rule resolves by transaction date', t1.status === 'RESOLVED' && (t1 as any).item.rate === 0.1 && t2.status === 'RESOLVED' && (t2 as any).item.rate === 0.2);
  check('E6 tax rules never appear in the accounting-rule registry', ((await st.listAccountingRules({ ruleId: U('T1') })).data || []).length === 0);

  // ---------- F. Accounting policies ----------
  const preg = new AccountingPolicyRegistry(st);
  const P = 'inventory_valuation_method';
  check('F1 unknown policy, invalid enum value, non-numeric threshold, bad date rejected', (await preg.setPolicy(tenantA, 'nope', 'x', '2026-01-01', null, A, k())).error?.title === 'unknown-policy' && (await preg.setPolicy(tenantA, P, 'LIFO', '2026-01-01', null, A, k())).error?.title === 'value-not-allowed' && (await preg.setPolicy(tenantA, 'capitalization_threshold', 'abc', '2026-01-01', null, A, k())).error?.title === 'bad-number' && (await preg.setPolicy(tenantA, P, 'FIFO', '01/01/2026', null, A, k())).error?.title === 'bad-date');
  const p1 = await preg.setPolicy(tenantA, P, 'WEIGHTED_AVERAGE', '2026-01-01', 'initial', A, k('p1'));
  check('F2 first policy version created (v1, open-ended)', p1.success && p1.data?.version === 1 && !p1.data?.effectiveTo, p1.error?.detail);
  const kp2 = k('p2');
  const p2 = await preg.setPolicy(tenantA, P, 'FIFO', '2026-07-01', 'change', A, kp2);
  const h = (await preg.history(tenantA, P)).data || [];
  check('F3 new version closes the previous window the day before', p2.success && p2.data?.version === 2 && h[0]?.effectiveTo === '2026-06-30' && !h[1]?.effectiveTo);
  const e = async (d: string) => { const r = await preg.getEffective(tenantA, P, d); return r.status === 'RESOLVED' ? r.item.value : r.status; };
  check('F4 getEffective is date-aware (before / inside v1 / v2 start)', (await e('2025-12-31')) === 'NONE' && (await e('2026-03-01')) === 'WEIGHTED_AVERAGE' && (await e('2026-06-30')) === 'WEIGHTED_AVERAGE' && (await e('2026-07-01')) === 'FIFO');
  const bd = await preg.setPolicy(tenantA, P, 'WEIGHTED_AVERAGE', '2026-05-01', 'backdate', A, k());
  const same = await preg.setPolicy(tenantA, P, 'WEIGHTED_AVERAGE', '2026-07-01', 'same-day', A, k());
  check('F5 backdating / same-day change rejected (409) and history unchanged', bd.error?.status === 409 && same.error?.status === 409 && ((await preg.history(tenantA, P)).data || []).length === 2);
  const rp = await preg.setPolicy(tenantA, P, 'FIFO', '2026-07-01', 'change', A, kp2);
  check('F6 idempotent replay returns the same version, creates no extra row', rp.success && rp.data?.id === p2.data?.id && ((await preg.history(tenantA, P)).data || []).length === 2);
  check('F7 tenant isolation: another tenant sees no history and no effective value', ((await preg.history(tenantB, P)).data || []).length === 0 && (await preg.getEffective(tenantB, P, '2026-08-01')).status === 'NONE');
  const dates = ['2027-03-01', '2027-01-01', '2027-05-01', '2027-02-01', '2027-04-01', '2027-06-01'];
  const results = await Promise.all(dates.map((d, i) => preg.setPolicy(tenantA, 'depreciation_method', i % 2 ? 'STRAIGHT_LINE' : 'DECLINING_BALANCE', d, 'race', A, k('race'))));
  const rh = (await preg.history(tenantA, 'depreciation_method')).data || [];
  const contiguous = rh.every((x, i) => x.version === i + 1 && (i === 0 || (x.effectiveFrom > rh[i - 1].effectiveFrom && rh[i - 1].effectiveTo != null && new Date(rh[i - 1].effectiveTo + 'T00:00:00Z').getTime() + 86400000 === new Date(x.effectiveFrom + 'T00:00:00Z').getTime())));
  check('F8 concurrent appends serialize: contiguous versions, increasing dates, exactly one open window', rh.length >= 1 && contiguous && rh.filter(x => !x.effectiveTo).length === 1 && results.filter(r => r.success).length === rh.length, `ok=${results.filter(r => r.success).length} rows=${rh.length}`);

  // ---------- G. Admin audit trail ----------
  const logs = (await st.getSystemChangeLogs()).data || [];
  check('G1 registry writes were logged to SystemChangeLog (module=standards)', logs.filter(l => l.module === 'standards').length >= 10);
}
