/**
 * @file verifyF4StockShadowPg.ts
 * @description F4 — REAL PostgreSQL gate for the stock-receipt SHADOW integration. Needs DATABASE_URL, otherwise prints PG_NOT_RUN and exits 3.
 * Runs the shared F4 suite on PostgresPrimaryAdapter with two temporary tenants (created and cleaned up by scripts/lib/testTenant),
 * then proves what InMemory cannot: 6 parallel observations of one document leave exactly one decision row and one stable link,
 * and a fresh adapter instance explains the LEGACY journal from the database alone.
 * Reference rows (ZZ-F4-*) are global and append-only by design, so they stay.
 * Run:  npx tsx scripts/verifyF4StockShadowPg.ts | tee evidence/standards-intelligence/battery-output-f4-pg.txt
 */
import dotenv from 'dotenv';
dotenv.config();
import { createTempTenant } from './lib/testTenant';
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { runF4Suite } from './lib/f4StockShadowSuite';
import { RuleExplanationService } from '../src/core/standards/RuleExplanationService';
import { StockStandardsShadow } from '../src/core/standards/StockStandardsShadow';
import { StandardsDecisionService } from '../src/core/standards/StandardsDecisionService';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { AccountingPolicyRegistry, AccountingRuleRegistry, JurisdictionRegistry, StandardsRegistry } from '../src/core/standards/registries';
import type { Tally } from './lib/f1StandardsSuite';

const tally: Tally = { pass: 0, fail: 0 };
const check = (label: string, cond: boolean, extra = '') => { if (cond) { tally.pass++; console.log(`[PASS] ${label}`); } else { tally.fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); } };

async function main() {
  if (!process.env.DATABASE_URL) { console.log('PG_NOT_RUN: DATABASE_URL missing. F4 is NOT closed.'); process.exit(3); }
  let tA: any, tB: any;
  try { tA = await createTempTenant({ seedChart: true }); tB = await createTempTenant({ seedChart: true }); }
  catch (e: any) { console.log(`PG_NOT_RUN: ${e.message}. F4 is NOT closed.`); process.exit(3); }
  const pg: any = tA.storage;
  try {
    check('PG0 two temporary tenants created on PostgreSQL', !!tA.tenantId && !!tB.tenantId);
    console.log('--- shared F4 suite on PostgresPrimaryAdapter ---');
    await runF4Suite(pg, tA.tenantId, tB.tenantId, tally, tB.storage);

    console.log('--- DB-level proofs ---');
    const run = Date.now().toString(36), A = 'f4-pg', T = tA.tenantId;
    const J = `ZZ-F4PG-${run}-J`, S = `ZZ-F4PG-${run}-S`, R = `ZZ-F4PG-${run}-R`;
    await new JurisdictionRegistry(pg).register({ id: J, kind: 'COUNTRY', countryCode: 'ZZ', framework: 'IFRS', parentId: null, relationToIfrs: 'UNVERIFIED', nameAr: 'اختبار', nameEn: 'f4 pg', status: 'ACTIVE' }, A, `pj-${run}`);
    await new StandardsRegistry(pg).register({ standardId: S, framework: 'IFRS', titleEn: 'F4 pg fixture (not a real standard)', version: 1, effectiveFrom: '2020-01-01', coverageStatus: 'PARTIAL', coverageEvidenceRef: 'f4-pg', sourceVerified: true, sourceReference: 'F4-FIXTURE-ONLY' }, A, `ps-${run}`);
    const lines = [{ side: 'DEBIT', role: 'INVENTORY', amount: { fact: 'amount' } }, { side: 'CREDIT', role: 'GRIR', amount: { fact: 'amount' } }];
    const rr = await new AccountingRuleRegistry(pg).register({ ruleId: R, standardId: S, framework: 'IFRS', jurisdictionId: J, eventType: 'GOODS_RECEIPT', priority: 200, tier: 2, conditions: {}, treatment: { lines }, requiredData: ['amount'], exceptions: [], version: 1, effectiveFrom: '2020-01-01', effectiveTo: null, sourceReference: 'F4-FIXTURE-ONLY', sourceVerified: true, status: 'ACTIVE' }, A, `pr-${run}`);
    check('PGF fixture rule (priority 200) registered on PostgreSQL', rr.success === true, JSON.stringify(rr.error || ''));
    const preg = new AccountingPolicyRegistry(pg);
    // tenant C: SHADOW with the new jurisdiction; its receipt is created while the shadow hook is ON, then 6 parallel re-observations race
    const tC = await createTempTenant({ seedChart: true });
    try {
      await preg.setPolicy(tC.tenantId, 'standards_decision_mode', 'SHADOW', '2020-01-01', 'f4pg', A, `pm-${run}`);
      await preg.setPolicy(tC.tenantId, 'reporting_jurisdiction', J, '2020-01-01', 'f4pg', A, `pjur-${run}`);
      const inv = new InventoryService(tC.storage, new PostingEngine(tC.storage), new NumberingEngine(tC.storage));
      await tC.storage.saveStockAccountingConfig(tC.tenantId, { autoPostEnabled: true }, A, `pc-${run}`);
      const cfg = (await tC.storage.getStockAccountingConfig(tC.tenantId)).data as any;
      const w = (await tC.storage.saveWarehouse(tC.tenantId, { id: `W-${tC.tenantId}`.slice(0, 60), tenantId: tC.tenantId, companyId: tC.tenantId, code: 'W1', nameAr: 'رئيسي', isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString() } as any, `pw-${run}`)).data!;
      const it = (await inv.saveStockItem(tC.tenantId, { id: `IT-${tC.tenantId}`.slice(0, 60), itemCode: 'F4PG', nameAr: 'صنف', category: 'X', valuationMethod: 'WEIGHTED_AVERAGE', inventoryAccountCode: '1105', cogsAccountCode: '5101' } as any, `pit-${run}`)).data!;
      const rc: any = await inv.receiveStock(tC.tenantId, { warehouseId: w.id, idempotencyKey: `pg-rcv-${run}`, lines: [{ itemId: it.id, quantity: 8, unitCost: 5 }] } as any);
      if (!rc.success || rc.data.journalStatus !== 'POSTED') {
        console.log('PGS1 FAILED EARLY:', JSON.stringify(rc, null, 2));
      }
      const doc = (await tC.storage.getStockDocument(tC.tenantId, rc.data.id)).data!;
      const jid = rc.data.journalEntryId as string;
      const outs = await Promise.all([1, 2, 3, 4, 5, 6].map(() => new StockStandardsShadow(tC.storage).observeReceipt(tC.tenantId, doc, jid, cfg)));
      const decs = (await new StandardsDecisionService(tC.storage).findDecisions(tC.tenantId, { eventId: doc.id })).data || [];
      check('PGS1 race: the receipt posted while SHADOW was on and 6 parallel re-observations leave exactly ONE decision row linked to the legacy journal (no 5xx, no duplicates)',
        rc.success && rc.data.journalStatus === 'POSTED' && decs.length === 1 && decs[0].journalEntryId === jid && outs.every((o: any) => o.observed === true), `decisions=${decs.length} link=${decs[0]?.journalEntryId} jid=${jid} outs=${outs.map((o: any) => o.observed ? o.result : o.reason).join(',')}`);
      const pg2: any = new PostgresPrimaryAdapter();
      const x = await new RuleExplanationService(pg2).explainJournal(tC.tenantId, jid);
      check('PGS2 durability: a fresh adapter instance explains the LEGACY stock journal from PostgreSQL alone (rule id, exact line match, POSTED)', x.found && x.sections.rule?.ruleId === R && x.sections.journal?.matchesTreatment === true && x.sections.journal?.status === 'POSTED', JSON.stringify(x.sections.journal));
      await pg2.close();
      const raw = await tC.sql('SELECT count(*)::int AS n FROM an_journal_entries WHERE tenant_id = $1 AND id = $2', [tC.tenantId, jid]);
      check('PGS3 raw SQL: exactly one journal row for the receipt (the shadow created none) and the document still points to it', raw.rows[0].n === 1 && doc.journalEntryId === jid);
    } finally { await tC.cleanup(); }
  } finally { await tA.cleanup(); await tB.cleanup(); }
  console.log(`\nPassed: ${tally.pass} | Failed: ${tally.fail}`);
  process.exit(tally.fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
