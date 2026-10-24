/**
 * @file StockStandardsShadow.ts
 * @description F4 — SHADOW observation of stock RECEIPT documents by the Standards layer.
 * The legacy journal path is the only thing that posts. After it has finished, and only for tenants that opted in with the
 * policy `standards_decision_mode = SHADOW`, this class asks the decision service what it WOULD have done for the same event and:
 *   - exact match with the posted legacy journal  -> the decision is linked to that journal (it now carries a durable rule reference);
 *   - difference                                 -> nothing is linked, a SHADOW_MISMATCH entry is written to the system change log;
 *   - REVIEW_REQUIRED / NOT_APPLICABLE            -> recorded by the decision service as usual, no journal effect.
 * It NEVER throws, never changes the legacy outcome, never posts and never touches the document.
 */
import type { StoragePort, StockDocument, JournalEntry } from '../storage/StoragePort';
import { StandardsDecisionService } from './StandardsDecisionService';
import { AccountingPolicyRegistry } from './registries';
import type { BusinessEvent } from './decisionTypes';
import { roleMapFromStockConfig } from './AccountingTreatmentEngine';

export type ShadowOutcome =
  | { observed: false; reason: 'OFF' | 'NO_JOURNAL' | 'UNSUPPORTED' | 'ERROR'; detail?: string }
  | { observed: true; decisionId: string; decisionStatus: string; result: 'MATCH_LINKED' | 'MISMATCH' | 'NOT_COMPARABLE'; differences: string[] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const key = (side: string, code: string) => `${side}|${code}`;

/** Aggregates journal lines per account and side (same shape the explanation service compares). */
export function journalProfile(je: Pick<JournalEntry, 'lines'>): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of je.lines) {
    if (l.debit) m.set(key('DEBIT', l.accountCode), r2((m.get(key('DEBIT', l.accountCode)) || 0) + l.debit));
    if (l.credit) m.set(key('CREDIT', l.accountCode), r2((m.get(key('CREDIT', l.accountCode)) || 0) + l.credit));
  }
  return m;
}

export class StockStandardsShadow {
  constructor(private st: StoragePort) {}

  async observeReceipt(tenantId: string, doc: StockDocument, legacyJournalId: string | undefined, cfg: { grirAccountCode: string; inTransitAccountCode: string; defaultInventoryAccountCode: string; defaultCogsAccountCode: string }): Promise<ShadowOutcome> {
    try {
      if (doc.documentType !== 'RECEIPT') return { observed: false, reason: 'UNSUPPORTED' };
      const date = (doc.postedAt || doc.createdAt || new Date().toISOString()).slice(0, 10);
      const pol = new AccountingPolicyRegistry(this.st);
      const mode = await pol.getEffective(tenantId, 'standards_decision_mode', date);
      if (mode.status !== 'RESOLVED' || mode.item.value !== 'SHADOW') return { observed: false, reason: 'OFF' };
      if (!legacyJournalId) return { observed: false, reason: 'NO_JOURNAL' };
      const jur = await pol.getEffective(tenantId, 'reporting_jurisdiction', date);
      const amount = r2((doc.lines || []).reduce((s, l: any) => s + (r2(Number(l.totalCost) || Number(l.quantity) * Number(l.unitCost) || 0)), 0));
      const ev: BusinessEvent = {
        tenantId, eventType: 'GOODS_RECEIPT', eventId: doc.id, sourceModule: 'stock-receipt', date, currency: (doc as any).currency || 'BASE',
        reportingJurisdictionId: jur.status === 'RESOLVED' ? jur.item.value : null,
        facts: { amount, lineCount: (doc.lines || []).length, documentNumber: doc.documentNumber, referenceType: doc.referenceType || null },
      };
      const res = await new StandardsDecisionService(this.st).decide(ev, { actorId: 'shadow:stock', accountRoles: roleMapFromStockConfig(cfg) });
      const d = res.decision;
      if (d.decisionStatus !== 'APPLY') return { observed: true, decisionId: d.id, decisionStatus: d.decisionStatus, result: 'NOT_COMPARABLE', differences: [] };
      const jr = await this.st.getJournalEntry(tenantId, legacyJournalId);
      if (!jr.success || !jr.data) return { observed: true, decisionId: d.id, decisionStatus: d.decisionStatus, result: 'NOT_COMPARABLE', differences: ['legacy journal unreadable'] };
      const got = journalProfile(jr.data), want = new Map<string, number>();
      for (const l of d.treatment.lines) if (l.accountCode) want.set(key(l.side, l.accountCode), r2((want.get(key(l.side, l.accountCode)) || 0) + l.amount));
      const diffs: string[] = [];
      for (const k of Array.from(new Set([...want.keys(), ...got.keys()])).sort()) if ((want.get(k) || 0) !== (got.get(k) || 0)) diffs.push(`${k}: standards=${want.get(k) || 0} legacy=${got.get(k) || 0}`);
      if (diffs.length === 0) {
        const l = await this.st.linkDecisionToJournal(tenantId, d.id, legacyJournalId);
        return { observed: true, decisionId: d.id, decisionStatus: d.decisionStatus, result: l.success ? 'MATCH_LINKED' : 'NOT_COMPARABLE', differences: l.success ? [] : [`link failed: ${l.error?.detail || 'unknown'}`] };
      }
      await this.logMismatch(tenantId, doc, legacyJournalId, d.id, d.ruleId, diffs);
      return { observed: true, decisionId: d.id, decisionStatus: d.decisionStatus, result: 'MISMATCH', differences: diffs };
    } catch (e: any) {
      return { observed: false, reason: 'ERROR', detail: String(e?.message || e).slice(0, 200) };
    }
  }

  private async logMismatch(tenantId: string, doc: StockDocument, journalId: string, decisionId: string, ruleId: string | null, diffs: string[]) {
    try {
      await this.st.appendSystemChangeLog({
        id: `scl-shadow-${decisionId}`.slice(0, 64), timestamp: new Date().toISOString(), actor: 'shadow:stock', changeType: 'PLATFORM_MANAGEMENT', module: 'standards',
        entitiesAffected: [doc.id, journalId, decisionId], summaryAr: `SHADOW_MISMATCH: قيد الاستلام ${doc.documentNumber} يختلف عن قرار طبقة المعايير (${ruleId || 'بدون قاعدة'})`,
        afterState: { tenantId, decisionId, ruleId, differences: diffs }, version: '8.2',
      } as any);
    } catch { /* never break the legacy flow */ }
  }
}
