/**
 * @file RuleExplanationService.ts
 * @description F3a (SI-7) — "Why was this entry/treatment produced?". Read-only: assembles the stored decision, the exact rule
 * version it used, and the journal it was linked to into one structured + bilingual explanation. It never recomputes or
 * guesses: anything not stored is reported as absent, and a journal that no decision explains says so explicitly.
 */
import type { StoragePort, JournalEntry } from '../storage/StoragePort';
import type { AccountingDecisionRecord } from './decisionTypes';

export interface ExplanationJournalCheck {
  journalEntryId: string; found: boolean; status?: string; totalAmount?: number;
  /** treatment lines vs. posted journal lines, compared per account code and side. */
  matchesTreatment: boolean | null; differences: string[];
}
export interface Explanation {
  found: boolean;
  decisionId: string | null;
  sections: {
    businessEvent: { eventType: string; eventId: string; sourceModule: string; date: string } | null;
    factsUsed: Record<string, unknown> | null;
    framework: string | null; jurisdiction: string | null; standard: string | null;
    rule: { ruleId: string; version: number; tier: number | null; status: string | null; sourceReference: string | null; effectiveFrom: string | null; effectiveTo: string | null } | null;
    policy: { key: string; value: string; version: number | null } | null;
    decision: { status: string; reasonCode: string; confidence: string } | null;
    journalMapping: Array<{ side: string; role: string; accountCode: string | null; amount: number }> | null;
    journal: ExplanationJournalCheck | null;
    taxTreatment: unknown | null;
    inventoryEffect: Record<string, unknown> | null;
    warnings: string[]; missingFacts: string[]; conflictingRules: Array<{ ruleId: string; version: number }>;
  };
  explanation: { ar: string; en: string };
}

const EMPTY: Explanation['sections'] = {
  businessEvent: null, factsUsed: null, framework: null, jurisdiction: null, standard: null, rule: null, policy: null, decision: null,
  journalMapping: null, journal: null, taxTreatment: null, inventoryEffect: null, warnings: [], missingFacts: [], conflictingRules: [],
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export class RuleExplanationService {
  constructor(private st: StoragePort) {}

  async explainDecision(tenantId: string, decisionId: string): Promise<Explanation> {
    const d = await this.st.getAccountingDecision(tenantId, decisionId);
    if (!d.success || !d.data) return this.notFound(null, 'القرار غير موجود', 'Decision not found');
    return this.build(tenantId, d.data);
  }

  async explainJournal(tenantId: string, journalEntryId: string): Promise<Explanation> {
    const l = await this.st.listAccountingDecisions(tenantId, { journalEntryId, limit: 5 });
    const rows = l.success && l.data ? l.data : [];
    if (rows.length === 0) return this.notFound(null,
      'لا يوجد قرار معياري مسجَّل لهذا القيد؛ أي أنه لم يُنشأ عبر طبقة المعايير (مسار ترحيل تقليدي).',
      'No standards decision is linked to this journal entry; it was not produced through the Standards layer (legacy posting path).');
    return this.build(tenantId, rows[0]);
  }

  private notFound(id: string | null, ar: string, en: string): Explanation {
    return { found: false, decisionId: id, sections: { ...EMPTY, warnings: [], missingFacts: [], conflictingRules: [] }, explanation: { ar, en } };
  }

  private async build(tenantId: string, d: AccountingDecisionRecord): Promise<Explanation> {
    let rule: Explanation['sections']['rule'] = null;
    if (d.ruleId && d.ruleVersion != null) {
      const rr = await this.st.listAccountingRules({ ruleId: d.ruleId });
      const hit = rr.success && rr.data ? rr.data.find((x: any) => x.version === d.ruleVersion) : undefined;
      rule = { ruleId: d.ruleId, version: d.ruleVersion, tier: d.tier, status: hit ? String((hit as any).status) : null,
        sourceReference: hit ? ((hit as any).sourceReference ?? null) : null, effectiveFrom: hit ? ((hit as any).effectiveFrom ?? null) : null, effectiveTo: hit ? ((hit as any).effectiveTo ?? null) : null };
    }
    const t = d.treatment;
    const journal = d.journalEntryId ? await this.checkJournal(tenantId, d) : null;
    const s: Explanation['sections'] = {
      businessEvent: { eventType: d.eventType, eventId: d.eventId, sourceModule: d.sourceModule, date: d.eventDate },
      factsUsed: d.facts, framework: d.framework, jurisdiction: d.jurisdictionId, standard: d.standardId, rule,
      policy: d.policyKey ? { key: d.policyKey, value: d.policyValue || '', version: d.policyVersion } : null,
      decision: { status: d.decisionStatus, reasonCode: d.reasonCode, confidence: t.confidence },
      journalMapping: t.lines.map(l => ({ side: l.side, role: l.role, accountCode: l.accountCode, amount: l.amount })),
      journal, taxTreatment: d.taxTreatment, inventoryEffect: t.inventoryEffect,
      warnings: d.warnings, missingFacts: d.missingFacts, conflictingRules: (d.conflicting || []).map(c => ({ ruleId: c.ruleId, version: c.version })),
    };
    return { found: true, decisionId: d.id, sections: s, explanation: this.text(d, s) };
  }

  private async checkJournal(tenantId: string, d: AccountingDecisionRecord): Promise<ExplanationJournalCheck> {
    const id = d.journalEntryId as string;
    const jr = await this.st.getJournalEntry(tenantId, id);
    if (!jr.success || !jr.data) return { journalEntryId: id, found: false, matchesTreatment: null, differences: ['linked journal entry could not be read'] };
    const je: JournalEntry = jr.data;
    const key = (side: string, code: string) => `${side}|${code}`;
    const want = new Map<string, number>(); const got = new Map<string, number>();
    for (const l of d.treatment.lines) if (l.accountCode) want.set(key(l.side, l.accountCode), r2((want.get(key(l.side, l.accountCode)) || 0) + l.amount));
    for (const l of je.lines) {
      if (l.debit) got.set(key('DEBIT', l.accountCode), r2((got.get(key('DEBIT', l.accountCode)) || 0) + l.debit));
      if (l.credit) got.set(key('CREDIT', l.accountCode), r2((got.get(key('CREDIT', l.accountCode)) || 0) + l.credit));
    }
    const diffs: string[] = [];
    for (const k of Array.from(new Set([...want.keys(), ...got.keys()])).sort()) if ((want.get(k) || 0) !== (got.get(k) || 0)) diffs.push(`${k}: treatment=${want.get(k) || 0} journal=${got.get(k) || 0}`);
    return { journalEntryId: id, found: true, status: je.status, totalAmount: je.totalAmount, matchesTreatment: diffs.length === 0, differences: diffs };
  }

  private text(d: AccountingDecisionRecord, s: Explanation['sections']): { ar: string; en: string } {
    const ruleTxt = s.rule ? `${s.rule.ruleId} v${s.rule.version}` : '—';
    const jTxt = s.journal ? (s.journal.found ? s.journal.journalEntryId : '(unreadable)') : '—';
    const jMatch = s.journal && s.journal.matchesTreatment === false ? ' ⚠ journal differs from treatment' : '';
    const en = [
      `Event ${d.eventType} #${d.eventId} (${d.sourceModule}) dated ${d.eventDate}.`,
      `Framework ${d.framework || 'n/a'} / jurisdiction ${d.jurisdictionId || 'n/a'} / standard ${d.standardId || 'n/a'} / rule ${ruleTxt}${s.rule?.sourceReference ? ` (source: ${s.rule.sourceReference})` : ''}.`,
      s.policy ? `Policy ${s.policy.key}=${s.policy.value} (v${s.policy.version ?? '?'}).` : 'No company policy choice was involved.',
      `Decision ${d.decisionStatus} (${d.reasonCode}), confidence ${s.decision?.confidence}. Journal: ${jTxt}${jMatch}.`,
      d.missingFacts.length ? `Missing facts: ${d.missingFacts.join(', ')}.` : '',
      d.warnings.length ? `Warnings: ${d.warnings.join(' | ')}` : '',
      `Treatment: ${d.explanationEn}`,
    ].filter(Boolean).join(' ');
    const ar = [
      `الحدث ${d.eventType} رقم ${d.eventId} (${d.sourceModule}) بتاريخ ${d.eventDate}.`,
      `الإطار ${d.framework || 'غير محدد'} / الاختصاص ${d.jurisdictionId || 'غير محدد'} / المعيار ${d.standardId || 'غير محدد'} / القاعدة ${ruleTxt}${s.rule?.sourceReference ? ` (المصدر: ${s.rule.sourceReference})` : ''}.`,
      s.policy ? `السياسة ${s.policy.key}=${s.policy.value} (إصدار ${s.policy.version ?? '؟'}).` : 'لم يدخل خيار سياسة للشركة في هذا القرار.',
      `القرار ${d.decisionStatus} (${d.reasonCode}) بدرجة ثقة ${s.decision?.confidence}. القيد: ${jTxt}${s.journal && s.journal.matchesTreatment === false ? ' ⚠ القيد يختلف عن المعالجة' : ''}.`,
      d.missingFacts.length ? `حقائق ناقصة: ${d.missingFacts.join('، ')}.` : '',
      d.warnings.length ? `تحذيرات: ${d.warnings.join(' | ')}` : '',
      `المعالجة: ${d.explanationAr}`,
    ].filter(Boolean).join(' ');
    return { ar, en };
  }
}
