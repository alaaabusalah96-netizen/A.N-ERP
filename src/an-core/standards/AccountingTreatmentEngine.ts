/**
 * @file AccountingTreatmentEngine.ts
 * @description Turns an APPLY evaluation into a structured treatment (spec §9). It never posts anything: the output is
 * posting INSTRUCTIONS for PostingEngine. Account CODES come only from the configured role map (never invented); a
 * missing role, an unknown account, an invalid/negative amount or an unbalanced result is REVIEW_REQUIRED, not a guess.
 */
import { evalExpr, getFact } from './conditions';
import type { AccountingTreatment, BusinessEvent, EvaluationResult, TaxEvaluation, TreatmentLine } from './decisionTypes';

export interface TreatmentContext {
  /** role -> account code, built from configured chart-of-accounts mappings (e.g. StockAccountingConfig). */
  accountRoles: Record<string, string>;
  /** when provided, every resolved code must exist in the tenant's chart of accounts. */
  knownAccountCodes?: ReadonlySet<string>;
}

const uniq = (a: string[]) => [...new Set(a)].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

export function roleMapFromStockConfig(cfg: { grirAccountCode: string; inTransitAccountCode: string; defaultInventoryAccountCode: string; defaultCogsAccountCode: string }): Record<string, string> {
  return { GRIR: cfg.grirAccountCode, IN_TRANSIT: cfg.inTransitAccountCode, INVENTORY: cfg.defaultInventoryAccountCode, COGS: cfg.defaultCogsAccountCode };
}

export function explain(ev: BusinessEvent, ev2: EvaluationResult, tax: TaxEvaluation | null, status: string, reason: string, missing: string[], warnings: string[]): { ar: string; en: string } {
  const head = { ar: `الحدث ${ev.eventType} (${ev.eventId}) بتاريخ ${ev.date}`, en: `Event ${ev.eventType} (${ev.eventId}) dated ${ev.date}` };
  const r = ev2.rule;
  if (status === 'APPLY' && r) {
    const pol = ev2.policy ? { ar: ` وفق سياسة المنشأة ${ev2.policy.key}=${ev2.policy.value} (إصدار ${ev2.policy.version})`, en: ` under company policy ${ev2.policy.key}=${ev2.policy.value} (v${ev2.policy.version})` } : { ar: '', en: '' };
    const tx = tax && tax.decisionStatus === 'APPLY' ? { ar: `، والمعالجة الضريبية ${tax.taxType} بالقاعدة ${tax.taxRuleId} v${tax.version}`, en: `; tax treatment ${tax.taxType} by rule ${tax.taxRuleId} v${tax.version}` } : { ar: '', en: '' };
    return {
      ar: `${head.ar}: طُبّقت القاعدة ${r.ruleId} إصدار ${r.version} (${r.standardId}، إطار ${r.framework}، اختصاص ${r.jurisdictionId}، المصدر: ${r.sourceReference})${pol.ar}${tx.ar}.`,
      en: `${head.en}: rule ${r.ruleId} v${r.version} applied (${r.standardId}, framework ${r.framework}, jurisdiction ${r.jurisdictionId}, source: ${r.sourceReference})${pol.en}${tx.en}.`,
    };
  }
  const why: Record<string, { ar: string; en: string }> = {
    NO_COVERED_RULE: { ar: 'لا توجد قاعدة مغطّاة لهذا الحدث؛ تبقى الوحدة على مسارها الحالي', en: 'no covered rule exists for this event; the module keeps its existing path' },
    MISSING_FACTS: { ar: `بيانات ناقصة: ${missing.join('، ')}`, en: `missing facts: ${missing.join(', ')}` },
    CONFLICT: { ar: `تعارض بين قواعد إلزامية: ${ev2.conflicting.map(c => c.ruleId).join('، ')} — يلزم قرار معتمد`, en: `conflicting mandatory rules: ${ev2.conflicting.map(c => c.ruleId).join(', ')} — an authorized decision is required` },
    NOT_AUTOMATABLE: { ar: `قاعدة غير مؤهلة للترحيل التلقائي (مصدر غير موثّق/مرجعية فقط): ${ev2.notAutomatable.map(c => c.ruleId).join('، ')}`, en: `rule is not automatable (source unverified / reference only): ${ev2.notAutomatable.map(c => c.ruleId).join(', ')}` },
    TAX_REVIEW: { ar: 'المعالجة الضريبية تحتاج مراجعة قبل الترحيل', en: 'the tax treatment needs review before posting' },
  };
  const w = why[reason] || { ar: `${reason}${warnings.length ? ': ' + warnings.join('، ') : ''}`, en: `${reason}${warnings.length ? ': ' + warnings.join(', ') : ''}` };
  return { ar: `${head.ar}: القرار ${status} — ${w.ar}.`, en: `${head.en}: decision ${status} — ${w.en}.` };
}

export class AccountingTreatmentEngine {
  build(ev: BusinessEvent, evaluation: EvaluationResult, tax: TaxEvaluation | null, ctx: TreatmentContext): AccountingTreatment {
    const decimals = Number.isInteger(ev.decimals) && (ev.decimals as number) >= 0 && (ev.decimals as number) <= 4 ? (ev.decimals as number) : 2;
    const f = Math.pow(10, decimals);
    const mk = (decisionStatus: AccountingTreatment['decisionStatus'], reasonCode: string, o: Partial<AccountingTreatment> = {}): AccountingTreatment => {
      const missingFacts = o.missingFacts || [], warnings = o.warnings || [];
      return {
        decisionStatus, reasonCode, lines: [], currency: ev.currency, measurementBasis: null, recognitionTiming: null, reversal: null, inventoryEffect: null,
        taxTreatment: tax, sourceEvent: { eventType: ev.eventType, eventId: ev.eventId, sourceModule: ev.sourceModule, date: ev.date },
        ruleId: evaluation.rule?.ruleId ?? null, ruleVersion: evaluation.rule?.version ?? null, standardRef: evaluation.rule?.standardId ?? null,
        explanation: explain(ev, evaluation, tax, decisionStatus, reasonCode, missingFacts, warnings), warnings, missingFacts, confidence: 'NONE', ...o,
      };
    };
    if (evaluation.decisionStatus !== 'APPLY' || !evaluation.rule) {
      return mk(evaluation.decisionStatus, evaluation.reasonCode, { warnings: evaluation.warnings, missingFacts: evaluation.missingFacts });
    }
    // tax and accounting outputs are reconciled before posting
    if (tax && tax.decisionStatus === 'REVIEW_REQUIRED') return mk('REVIEW_REQUIRED', 'TAX_REVIEW', { missingFacts: tax.missingFacts, warnings: [...evaluation.warnings, ...tax.warnings] });
    if (tax && tax.decisionStatus === 'REJECT') return mk('REJECT', 'TAX_REJECT', { warnings: tax.warnings });
    const t = evaluation.rule.treatment as Record<string, any>;
    if (!Array.isArray(t.lines) || t.lines.length < 2) return mk('REVIEW_REQUIRED', 'MALFORMED_TREATMENT', { warnings: [...evaluation.warnings, 'treatment.lines must contain at least two lines'] });
    const taxRate = tax && tax.decisionStatus === 'APPLY' ? tax.rate : null;
    const missing: string[] = [], warnings = [...evaluation.warnings], lines: TreatmentLine[] = [];
    let review = '';
    for (const [i, raw] of (t.lines as any[]).entries()) {
      const side = raw?.side, role = typeof raw?.role === 'string' ? raw.role.trim() : '';
      if ((side !== 'DEBIT' && side !== 'CREDIT') || !role) { review = review || 'MALFORMED_TREATMENT'; warnings.push(`line ${i + 1}: side/role invalid`); continue; }
      const amt = evalExpr(raw.amount, ev.facts, taxRate);
      if (amt.error) { review = review || 'MALFORMED_TREATMENT'; warnings.push(`line ${i + 1}: ${amt.error}`); continue; }
      if (amt.value == null) { missing.push(...amt.missing); continue; }
      if (!Number.isFinite(amt.value) || amt.value < 0) { review = review || 'INVALID_AMOUNT'; warnings.push(`line ${i + 1}: amount ${amt.value} is not allowed`); continue; }
      const code = ctx.accountRoles[role];
      if (!code) { missing.push(`accountRole:${role}`); continue; }
      if (ctx.knownAccountCodes && !ctx.knownAccountCodes.has(code)) { review = review || 'UNKNOWN_ACCOUNT'; warnings.push(`role ${role} maps to account ${code} which is not in the chart of accounts`); continue; }
      const dims: Record<string, unknown> = {};
      for (const d of Array.isArray(raw.dimensions) ? raw.dimensions : []) { const g = getFact(ev.facts, String(d)); if (g.found) dims[String(d)] = g.value; }
      lines.push({ side, role, accountCode: code, amount: Math.round((amt.value + Number.EPSILON) * f) / f, dimensions: dims, description: String(raw.descriptionAr || `${evaluation.rule.standardId} — ${ev.eventType}`) });
    }
    if (missing.length) return mk('REVIEW_REQUIRED', 'MISSING_FACTS', { missingFacts: uniq(missing), warnings });
    if (review) return mk('REVIEW_REQUIRED', review, { warnings });
    const nonZero = lines.filter(l => l.amount > 0);
    if (!nonZero.length) return mk('NOT_APPLICABLE', 'ZERO_AMOUNT', { warnings: [...warnings, 'all amounts are zero; nothing to post'] });
    if (nonZero.length < lines.length) warnings.push('ZERO_LINE_DROPPED');
    const minor = (s: 'DEBIT' | 'CREDIT') => nonZero.filter(l => l.side === s).reduce((a, l) => a + Math.round(l.amount * f), 0);
    if (minor('DEBIT') !== minor('CREDIT')) return mk('REVIEW_REQUIRED', 'UNBALANCED', { warnings: [...warnings, `debit ${minor('DEBIT') / f} != credit ${minor('CREDIT') / f}`] });
    const rev = t.reversal && typeof t.reversal === 'object' ? { required: !!t.reversal.required, ...(t.reversal.trigger ? { trigger: String(t.reversal.trigger) } : {}) } : null;
    return mk('APPLY', 'RULE_APPLIED', {
      lines: nonZero, warnings, confidence: 'DETERMINISTIC',
      measurementBasis: typeof t.measurementBasis === 'string' ? t.measurementBasis : null,
      recognitionTiming: typeof t.recognitionTiming === 'string' ? t.recognitionTiming : null,
      reversal: rev, inventoryEffect: t.inventoryEffect && typeof t.inventoryEffect === 'object' ? t.inventoryEffect : null,
    });
  }
}
