/**
 * @file DecisionPostingBridge.ts
 * @description F3a — turns an APPLY decision into a journal through the EXISTING PostingEngine (unchanged), then links
 * decision -> journal. Fail-closed: nothing is posted unless the decision is APPLY + DETERMINISTIC, every line has a
 * configured account code, and the lines balance. Account codes are never invented here.
 */
import type { StoragePort, StorageResult, JournalEntry, JournalLine } from '../storage/StoragePort';
import { PostingEngine } from '../engines/PostingEngine';
import type { AccountingDecisionRecord } from './decisionTypes';

const r2 = (n: number) => Math.round(n * 100) / 100;
const fail = (code: string, detail: string, status = 422): StorageResult<any> => ({ success: false, error: { type: `https://api.an-erp.local/errors/standards-${code}`, title: 'Decision posting', status, detail } });

export class DecisionPostingBridge {
  constructor(private st: StoragePort, private posting: PostingEngine = new PostingEngine(st)) {}

  async postDecision(tenantId: string, decisionId: string, actorId: string): Promise<StorageResult<{ journal: JournalEntry; decision: AccountingDecisionRecord }>> {
    const dr = await this.st.getAccountingDecision(tenantId, decisionId);
    if (!dr.success || !dr.data) return fail('decision-not-found', `decision ${decisionId} not found`, 404);
    const d = dr.data;
    if (d.journalEntryId) return fail('already-linked', `decision already linked to journal ${d.journalEntryId}`, 409);
    const t = d.treatment;
    if (d.decisionStatus !== 'APPLY' || t.confidence !== 'DETERMINISTIC') return fail('not-postable', `decision status ${d.decisionStatus}/${t.confidence} cannot be posted`);
    if (!t.lines.length || t.lines.some(l => !l.accountCode)) return fail('unmapped-account', 'treatment has lines without a configured account code');
    const lines: JournalLine[] = t.lines.map((l, i) => ({
      id: `${d.id}-L${i + 1}`.slice(0, 64), accountCode: l.accountCode as string,
      debit: l.side === 'DEBIT' ? r2(l.amount) : 0, credit: l.side === 'CREDIT' ? r2(l.amount) : 0, description: l.description || l.role,
    }));
    const total = r2(lines.reduce((s, l) => s + l.debit, 0));
    const entry: JournalEntry = {
      id: `JE-STD-${d.id}`.slice(0, 64), code: `STD-${d.id.slice(4, 16)}`.slice(0, 32), tenantId, date: d.eventDate, type: 'قيد آلي بقرار معياري',
      description: `قيد آلي — ${d.eventType} ${d.eventId} — قاعدة ${d.ruleId}@v${d.ruleVersion}`, lines, totalAmount: total, status: 'APPROVED', createdBy: actorId,
    };
    const draft = await this.posting.draftEntry(tenantId, entry, `${d.id}-je-draft`);
    if (!draft.success || !draft.data) return { success: false, error: draft.error };
    const posted = await this.posting.postEntry(tenantId, draft.data.id, `${d.id}-je-post`);
    if (!posted.success || !posted.data) return { success: false, error: posted.error };
    const linked = await this.st.linkDecisionToJournal(tenantId, d.id, posted.data.id);
    if (!linked.success || !linked.data) return { success: false, error: linked.error || { type: 'standards', title: 'link failed', status: 500, detail: `journal ${posted.data.id} posted but decision link failed — re-run link for this pair` } };
    return { success: true, data: { journal: posted.data, decision: linked.data } };
  }
}
