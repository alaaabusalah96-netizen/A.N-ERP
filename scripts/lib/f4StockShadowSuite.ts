/**
 * F4 suite: stock RECEIPT -> legacy journal (unchanged) + optional SHADOW observation by the Standards layer.
 * Adapter-agnostic (InMemory logic / PostgreSQL). Rules are ZZ-F4-* TEST FIXTURES, not accounting content.
 * The receipt is created through the real InventoryService.receiveStock path.
 */
import type { StoragePort } from '../../src/core/storage/StoragePort';
import { InventoryService } from '../../src/core/inventory/InventoryService';
import { PostingEngine } from '../../src/core/engines/PostingEngine';
import { NumberingEngine } from '../../src/core/engines/NumberingEngine';
import { AccountingService } from '../../src/core/accounting/AccountingService';
import { AccountingPolicyRegistry, AccountingRuleRegistry, JurisdictionRegistry, StandardsRegistry } from '../../src/core/standards/registries';
import { StandardsDecisionService } from '../../src/core/standards/StandardsDecisionService';
import { RuleExplanationService } from '../../src/core/standards/RuleExplanationService';
import { StockStandardsShadow } from '../../src/core/standards/StockStandardsShadow';
import type { Tally } from './f1StandardsSuite';

export async function runF4Suite(st: StoragePort, tA: string, tB: string, tally: Tally, optStB?: StoragePort): Promise<void> {
  const stB = optStB || st;
  const check = (label: string, cond: boolean, extra = '') => {
    if (cond) {
      tally.pass++;
      console.log(`[PASS] ${label}`);
    } else {
      tally.fail++;
      console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`);
    }
  };
  const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
  const U = (s: string) => `ZZ-F4-${run}-${s}`;
  let n = 0; const k = (s = 'k') => `f4-${run}-${s}-${++n}`;
  const A = 'f4-tester';
  const svcA = new InventoryService(st, new PostingEngine(st), new NumberingEngine(st));
  const svcB = stB === st ? svcA : new InventoryService(stB, new PostingEngine(stB), new NumberingEngine(stB));
  const pregA = new AccountingPolicyRegistry(st), pregB = stB === st ? pregA : new AccountingPolicyRegistry(stB);
  const explA = new RuleExplanationService(st), explB = stB === st ? explA : new RuleExplanationService(stB);
  const dsvcA = new StandardsDecisionService(st), dsvcB = stB === st ? dsvcA : new StandardsDecisionService(stB);

  // tenants: chart + stock accounting config with auto-post ON + warehouse + item
  const prep = async (T: string) => {
    const s = T === tB ? stB : st;
    const sSvc = T === tB ? svcB : svcA;
    await new AccountingService(s).seedDefaultChartOfAccounts(T);
    await s.saveStockAccountingConfig(T, { autoPostEnabled: true }, A, k('cfg'));
    const w = (await s.saveWarehouse(T, { id: `W-${T}`.slice(0, 60), tenantId: T, companyId: T, code: 'W1', nameAr: 'رئيسي', isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString() } as any, k('w'))).data!;
    const it = await sSvc.saveStockItem(T, { id: `IT-${T}`.slice(0, 60), itemCode: 'F4A', nameAr: 'صنف F4', category: 'X', valuationMethod: 'WEIGHTED_AVERAGE', inventoryAccountCode: '1105', cogsAccountCode: '5101' } as any, k('item'));
    return { w: w.id, item: it.data!.id };
  };
  const a = await prep(tA), b = await prep(tB);
  const receive = (T: string, wh: string, item: string, qty: number, cost: number) => (T === tB ? svcB : svcA).receiveStock(T, { warehouseId: wh, idempotencyKey: k('rcv'), lines: [{ itemId: item, quantity: qty, unitCost: cost }] } as any);
  const profile = async (T: string, id: string) => { const s = T === tB ? stB : st; const je = (await s.getJournalEntry(T, id)).data; return je ? je.lines.map(l => `${l.debit ? 'D' : 'C'}${l.accountCode}:${l.debit || l.credit}`).sort().join('|') : null; };
  const decisionsFor = async (T: string, docId: string) => ((await (T === tB ? dsvcB : dsvcA).findDecisions(T, { eventId: docId })).data || []);

  // fixture rule set (IFRS-style fixture jurisdiction): D INVENTORY / C GRIR = amount  => equals what the legacy builder posts
  await new JurisdictionRegistry(st).register({ id: U('J'), kind: 'COUNTRY', countryCode: 'ZZ', framework: 'IFRS', parentId: null, relationToIfrs: 'UNVERIFIED', nameAr: 'اختبار', nameEn: 'f4', status: 'ACTIVE' }, A, k());
  await new StandardsRegistry(st).register({ standardId: U('STD'), framework: 'IFRS', titleEn: 'F4 fixture (not a real standard)', version: 1, effectiveFrom: '2020-01-01', coverageStatus: 'PARTIAL', coverageEvidenceRef: 'f4-fixture', sourceVerified: true, sourceReference: 'F4-FIXTURE-ONLY' }, A, k());
  const reg = async (id: string, treatment: any) => (await new AccountingRuleRegistry(st).register({ ruleId: U(id), standardId: U('STD'), framework: 'IFRS', jurisdictionId: U('J'), eventType: 'GOODS_RECEIPT', priority: 10, tier: 2, conditions: {}, treatment, requiredData: ['amount'], exceptions: [], version: 1, effectiveFrom: '2020-01-01', effectiveTo: null, sourceReference: 'F4-FIXTURE-ONLY', sourceVerified: true, status: 'ACTIVE' }, A, k('rule')));
  const L = (side: string, role: string) => ({ side, role, amount: { fact: 'amount' } });

  // ---- 1. OFF (default): no policy => legacy only, zero standards footprint
  const r0 = await receive(tA, a.w, a.item, 10, 5);
  const j0 = (r0.data as any)?.journalEntryId as string;
  check('F4-1 default (no policy): receipt posts the legacy journal D1105 / C2106 = 50 and the Standards layer stores NOTHING', r0.success && (r0.data as any).journalStatus === 'POSTED' && (await profile(tA, j0)) === 'C2106:50|D1105:50' && (await decisionsFor(tA, (r0.data as any).id)).length === 0);

  // ---- 2. SHADOW but no rule / no jurisdiction
  await pregA.setPolicy(tA, 'standards_decision_mode', 'SHADOW', '2020-01-01', 'f4', A, k());
  const r1 = await receive(tA, a.w, a.item, 4, 5);
  const d1 = await decisionsFor(tA, (r1.data as any).id);
  check('F4-2 SHADOW without a reporting jurisdiction: legacy journal unchanged (D1105 / C2106 = 20); the standards decision is REVIEW_REQUIRED (missing jurisdiction), recorded, NOT linked, no journal effect', (r1.data as any).journalStatus === 'POSTED' && (await profile(tA, (r1.data as any).journalEntryId)) === 'C2106:20|D1105:20' && d1.length === 1 && d1[0].decisionStatus === 'REVIEW_REQUIRED' && d1[0].journalEntryId === null);

  // ---- 3. SHADOW + jurisdiction but no covered rule => NOT_APPLICABLE is not stored, nothing happens
  await pregA.setPolicy(tA, 'reporting_jurisdiction', U('J'), '2020-01-01', 'f4', A, k());
  const r2 = await receive(tA, a.w, a.item, 2, 5);
  check('F4-3 SHADOW with a jurisdiction but no rule: legacy posts normally and no decision row is stored (NOT_APPLICABLE is not persisted)', (r2.data as any).journalStatus === 'POSTED' && (await decisionsFor(tA, (r2.data as any).id)).length === 0);

  // ---- 4. matching rule => decision linked to the LEGACY journal; explanation works on the legacy journal
  await reg('MATCH', { lines: [L('DEBIT', 'INVENTORY'), L('CREDIT', 'GRIR')], inventoryEffect: { type: 'INCREASE_QUANTITY_AND_COST' } });
  const r3 = await receive(tA, a.w, a.item, 6, 5);
  const j3 = (r3.data as any).journalEntryId as string, d3 = await decisionsFor(tA, (r3.data as any).id);
  const x3 = await explA.explainJournal(tA, j3);
  check('F4-4 matching rule: legacy journal is untouched (D1105 / C2106 = 30) AND the decision is linked to it; "why was this posted?" now explains the LEGACY journal with rule id, version and an exact line match', (await profile(tA, j3)) === 'C2106:30|D1105:30' && d3.length === 1 && d3[0].decisionStatus === 'APPLY' && d3[0].journalEntryId === j3 && x3.found && x3.sections.rule?.ruleId === U('MATCH') && x3.sections.journal?.matchesTreatment === true);

  // ---- 5. replay safety: re-observing the same document creates no second decision
  const doc3 = (await st.getStockDocument(tA, (r3.data as any).id)).data!;
  const cfgA = (await st.getStockAccountingConfig(tA)).data as any;
  const again = await new StockStandardsShadow(st).observeReceipt(tA, doc3, j3, cfgA);
  check('F4-5 replay (retry of the same document): still exactly one decision for the document, link unchanged', (await decisionsFor(tA, doc3.id)).length === 1 && again.observed === true);

  // ---- 6. mismatch: a higher-precedence rule that books to a different account role => MISMATCH, not linked, change-log entry
  await pregB.setPolicy(tB, 'standards_decision_mode', 'SHADOW', '2020-01-01', 'f4', A, k());
  await pregB.setPolicy(tB, 'reporting_jurisdiction', U('J'), '2020-01-01', 'f4', A, k());
  const mism = await new AccountingRuleRegistry(stB).register({ ruleId: U('DIFF'), standardId: U('STD'), framework: 'IFRS', jurisdictionId: U('J'), eventType: 'GOODS_RECEIPT', priority: 99, tier: 2, conditions: {}, treatment: { lines: [L('DEBIT', 'INVENTORY'), L('CREDIT', 'COGS')] }, requiredData: ['amount'], exceptions: [], version: 1, effectiveFrom: '2020-01-01', effectiveTo: null, sourceReference: 'F4-FIXTURE-ONLY', sourceVerified: true, status: 'ACTIVE' }, A, k('rule'));
  const r4 = await receive(tB, b.w, b.item, 3, 5);
  const j4 = (r4.data as any).journalEntryId as string, d4 = await decisionsFor(tB, (r4.data as any).id);
  check('F4-6 a rule that disagrees with the legacy journal: legacy journal unchanged (D1105 / C2106 = 15), decision recorded but NOT linked, and the mismatch is visible to the shadow caller', mism.success === true && (await profile(tB, j4)) === 'C2106:15|D1105:15' && d4.length === 1 && d4[0].decisionStatus === 'APPLY' && d4[0].journalEntryId === null);
  const doc4 = (await stB.getStockDocument(tB, (r4.data as any).id)).data!;
  const out4 = await new StockStandardsShadow(stB).observeReceipt(tB, doc4, j4, (await stB.getStockAccountingConfig(tB)).data as any);
  const chg = ((await stB.getSystemChangeLogs()).data || []).filter(e => e.module === 'standards' && /SHADOW_MISMATCH/.test(e.summaryAr || '') && (e.entitiesAffected || []).includes(doc4.id));
  check('F4-7 the shadow outcome reports MISMATCH with the per-account differences (standards=15 on COGS vs legacy GRIR) and writes a SHADOW_MISMATCH entry to the system change log naming the document, journal and decision', out4.observed === true && out4.result === 'MISMATCH' && out4.differences.some(d => d.includes('CREDIT|5101')) && out4.differences.some(d => d.includes('CREDIT|2106')) && chg.length >= 1 && (chg[0].entitiesAffected || []).includes(j4), JSON.stringify(out4));

  // ---- 8. isolation: tenant B's policy/decisions never leak into tenant A and vice versa
  check('F4-8 tenant isolation: tenant A has no decision for tenant B\'s document and B\'s SHADOW switch does not enable A for other dates/docs', (await decisionsFor(tA, (r4.data as any).id)).length === 0 && (await decisionsFor(tB, (r3.data as any).id)).length === 0);

  // ---- 9. failure injection: a throwing decision service must not change the legacy result
  const origDecide = StandardsDecisionService.prototype.decide;
  (StandardsDecisionService.prototype as any).decide = async () => { throw new Error('boom (injected)'); };
  const r5 = await receive(tA, a.w, a.item, 1, 5);
  (StandardsDecisionService.prototype as any).decide = origDecide;
  check('F4-9 failure injection: decision service throws -> receipt still succeeds, journal POSTED (D1105 / C2106 = 5), no exception reaches the caller', r5.success && (r5.data as any).journalStatus === 'POSTED' && (await profile(tA, (r5.data as any).journalEntryId)) === 'C2106:5|D1105:5');

  // ---- 10. switching back to OFF stops observation
  await pregA.setPolicy(tA, 'standards_decision_mode', 'OFF', '2099-01-01', 'f4', A, k());
  const doc6 = (await receive(tA, a.w, a.item, 1, 7)).data as any;
  check('F4-10 mode is effective-dated: a later OFF version does not affect today (SHADOW still active) — observation continues until that date', (await decisionsFor(tA, doc6.id)).length === 1);

  // ---- 11. issue documents are out of scope in F4
  const iss = await svcA.issueStock(tA, { warehouseId: a.w, idempotencyKey: k('iss'), lines: [{ itemId: a.item, quantity: 1 }] } as any);
  check('F4-11 ISSUE documents are untouched by F4 (legacy COGS journal posts, zero decisions for the issue document)', iss.success && (iss.data as any).journalStatus === 'POSTED' && (await decisionsFor(tA, (iss.data as any).id)).length === 0);
}
