/**
 * @file RuleEvaluationEngine.ts
 * @description Decides WHICH rule applies to a business event (SI-2 / SI-5 / SI-6). Deterministic, read-only, fail-closed.
 * Never guesses: missing facts, conflicting mandatory rules, or a higher-precedence rule that cannot be evaluated or is
 * not automatable (SOURCE_REQUIRED / REFERENCE_ONLY / DRAFT) all end in REVIEW_REQUIRED. No covered rule => NOT_APPLICABLE
 * (the calling module keeps its existing path). Precedence is explicit: tier asc, priority desc, id asc — never insertion order.
 */
import type { StoragePort } from '../storage/StoragePort';
import { AccountingPolicyRegistry } from './registries';
import { AccountingRuleRecord, TaxRuleRecord, UNASSERTED_DATE, isIsoDate, isKnownAccountingEvent } from './standardsTypes';
import { ResolveOptions, resolveVersion } from './EffectiveDateResolver';
import { canonical, evalConditions, getFact } from './conditions';
import type { BusinessEvent, EvaluationResult, PolicyRef, RuleRef, TaxEvaluation } from './decisionTypes';

interface Cand<T> {
  rec: T; id: string; version: number; tier: number; priority: number; automatable: boolean;
  conds: unknown; required: string[]; sig: string; extraMissing: string[]; policy: PolicyRef | null;
}
const lt = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const prec = <T>(a: Cand<T>, b: Cand<T>) => a.tier - b.tier || b.priority - a.priority || lt(a.id, b.id);
const uniq = (a: string[]) => [...new Set(a)].sort(lt);
const AUTO_STATUS = new Set(['ACTIVE', 'SUPERSEDED']);
const BLOCKING_STATUS = new Set(['SOURCE_REQUIRED', 'REFERENCE_ONLY', 'DRAFT']);
export const isAutomatable = (r: { status: string; sourceVerified: boolean; sourceReference?: string | null; effectiveFrom: string }) =>
  AUTO_STATUS.has(r.status) && r.sourceVerified === true && (r.sourceReference || '').trim().length > 0 && r.effectiveFrom !== UNASSERTED_DATE;

export function ruleRef(r: AccountingRuleRecord): RuleRef {
  return { ruleId: r.ruleId, version: r.version, standardId: r.standardId, framework: r.framework, jurisdictionId: r.jurisdictionId, tier: r.tier, priority: r.priority, sourceReference: r.sourceReference ?? null, status: r.status };
}

interface Pick<T> { kind: 'NONE' | 'REVIEW' | 'BEST'; reason: string; best: Cand<T> | null; matched: Cand<T>[]; conflicting: Cand<T>[]; blocked: Cand<T>[]; missing: string[]; warnings: string[] }

/** Generic, deterministic selection shared by accounting and tax rules. */
function pick<T>(cands: Cand<T>[], facts: Record<string, unknown>): Pick<T> {
  const out: Pick<T> = { kind: 'NONE', reason: 'NO_COVERED_RULE', best: null, matched: [], conflicting: [], blocked: [], missing: [], warnings: [] };
  const matched: Cand<T>[] = [], unresolved: Array<{ c: Cand<T>; missing: string[] }> = [], blocked: Cand<T>[] = [];
  const invalid: string[] = [];
  for (const c of cands) {
    const r = evalConditions(c.conds, facts);
    if (r.invalid.length) { invalid.push(...r.invalid.map(x => `${c.id}:${x}`)); if (c.automatable) unresolved.push({ c, missing: [] }); continue; }
    const miss = uniq([...r.missing, ...c.extraMissing]);
    if (!c.automatable) { if (r.matched || miss.length) blocked.push(c); continue; }
    if (miss.length) unresolved.push({ c, missing: miss }); else if (r.matched) matched.push(c);
  }
  matched.sort(prec);
  out.matched = matched;
  const best = matched[0] || null;
  if (invalid.length) { out.kind = 'REVIEW'; out.reason = 'INVALID_RULE'; out.warnings.push(...invalid); return out; }
  const above = unresolved.filter(u => !best || prec(u.c, best) < 0);
  if (above.length) { out.kind = 'REVIEW'; out.reason = 'MISSING_FACTS'; out.missing = uniq(above.flatMap(u => u.missing)); out.warnings.push(`قاعدة أعلى أسبقية لا يمكن تقييمها: ${above.map(u => u.c.id).join(', ')}`); return out; }
  const blockedAbove = blocked.filter(b => !best || prec(b, best) < 0);
  if (blockedAbove.length) { out.kind = 'REVIEW'; out.reason = 'NOT_AUTOMATABLE'; out.blocked = blockedAbove; return out; }
  if (!best) return out;
  out.blocked = blocked;
  const tied = matched.filter(m => m !== best && m.tier === best.tier && m.priority === best.priority);
  const clash = tied.filter(m => m.sig !== best.sig);
  if (clash.length) { out.kind = 'REVIEW'; out.reason = 'CONFLICT'; out.conflicting = [best, ...clash]; return out; }
  if (tied.length) out.warnings.push(`DUPLICATE_RULES_SAME_TREATMENT:${tied.map(t => t.id).join(',')}`);
  const need = uniq(best.required.filter(n => !getFact(facts, n).found).map(n => `fact:${n}`));
  if (need.length) { out.kind = 'REVIEW'; out.reason = 'MISSING_FACTS'; out.missing = need; out.best = best; return out; }
  out.kind = 'BEST'; out.reason = 'RULE_APPLIED'; out.best = best;
  return out;
}

export class RuleEvaluationEngine {
  private policies: AccountingPolicyRegistry;
  constructor(private st: StoragePort, private opts: ResolveOptions = {}) { this.policies = new AccountingPolicyRegistry(st); }

  private empty(): EvaluationResult {
    return { decisionStatus: 'NOT_APPLICABLE', reasonCode: 'NO_COVERED_RULE', rule: null, considered: [], overridden: [], conflicting: [], notAutomatable: [], policy: null, missingFacts: [], warnings: [] };
  }
  private validate(ev: BusinessEvent): string[] {
    const e: string[] = [];
    if (!ev || typeof ev !== 'object') return ['event missing'];
    if (!ev.tenantId) e.push('tenantId required');
    if (!ev.eventId) e.push('eventId required');
    if (!isKnownAccountingEvent(ev.eventType)) e.push(`unknown eventType ${ev.eventType}`);
    if (!isIsoDate(ev.date)) e.push('date must be YYYY-MM-DD');
    if (!ev.facts || typeof ev.facts !== 'object' || Array.isArray(ev.facts)) e.push('facts must be an object');
    else if (JSON.stringify(ev.facts).length > 60000) e.push('facts too large');
    return e;
  }

  async evaluate(ev: BusinessEvent): Promise<EvaluationResult> {
    const res = this.empty();
    const bad = this.validate(ev);
    if (bad.length) return { ...res, decisionStatus: 'REJECT', reasonCode: 'INVALID_EVENT', warnings: bad };
    const review = (reasonCode: string, extra: Partial<EvaluationResult> = {}): EvaluationResult => ({ ...res, decisionStatus: 'REVIEW_REQUIRED', reasonCode, ...extra });
    if (!ev.reportingJurisdictionId) return review('MISSING_FACTS', { missingFacts: ['reportingJurisdiction'] });
    const jr = await this.st.listJurisdictions();
    const j = jr.success ? (jr.data || []).find(x => x.id === ev.reportingJurisdictionId) : undefined;
    if (!jr.success) return review('STORAGE_ERROR', { warnings: ['jurisdiction lookup failed'] });
    if (!j || j.framework === 'TAX') return review('BAD_JURISDICTION', { warnings: [`jurisdiction ${ev.reportingJurisdictionId} is unknown or not an accounting jurisdiction`] });
    const lr = await this.st.listAccountingRules({ eventType: ev.eventType, jurisdictionId: ev.reportingJurisdictionId });
    if (!lr.success) return review('STORAGE_ERROR', { warnings: ['rule lookup failed'] });

    const rows = lr.data || [];
    const cands: Cand<AccountingRuleRecord>[] = [];
    const policyCache = new Map<string, Awaited<ReturnType<AccountingPolicyRegistry['getEffective']>>>();
    for (const id of uniq(rows.map(r => r.ruleId))) {
      const rv = resolveVersion(id, rows.filter(r => r.ruleId === id), ev.date, this.opts);
      if (rv.status === 'CONFLICT') return review('VERSION_CONFLICT', { warnings: [`ambiguous versions for ${id}`] });
      if (rv.status !== 'RESOLVED') continue;
      const r = rv.item;
      const auto = isAutomatable(r);
      if (!auto && !BLOCKING_STATUS.has(r.status)) continue;      // RETIRED / unverified SUPERSEDED never apply
      let extraMissing: string[] = [], policy: PolicyRef | null = null;
      if (r.policyOption) {
        const m = /^([a-z_]+)=(.+)$/.exec(r.policyOption);
        if (!m) { cands.push({ rec: r, id: r.ruleId, version: r.version, tier: r.tier, priority: r.priority, automatable: auto, conds: { __invalid__: { bad: 1 } }, required: [], sig: '', extraMissing: [], policy: null }); continue; }
        let pr = policyCache.get(m[1]);
        if (!pr) { pr = await this.policies.getEffective(ev.tenantId, m[1], ev.date); policyCache.set(m[1], pr); }
        if (pr.status !== 'RESOLVED') extraMissing = [`policy:${m[1]}`];
        else if (pr.item.value !== m[2]) continue;                 // a different permitted option: this rule is simply not selected
        else policy = { key: m[1], value: pr.item.value, version: pr.item.version, effectiveFrom: pr.item.effectiveFrom };
      }
      cands.push({ rec: r, id: r.ruleId, version: r.version, tier: r.tier, priority: r.priority, automatable: auto, conds: r.conditions, required: r.requiredData || [], sig: canonical(r.treatment), extraMissing, policy });
    }
    const p = pick(cands, ev.facts);
    const refs = (a: Cand<AccountingRuleRecord>[]) => a.map(c => ruleRef(c.rec));
    const base: Partial<EvaluationResult> = { considered: refs(p.matched), notAutomatable: refs(p.blocked), warnings: p.warnings };
    if (p.kind === 'NONE') return { ...res, ...base, decisionStatus: 'NOT_APPLICABLE', reasonCode: 'NO_COVERED_RULE' };
    if (p.kind === 'REVIEW') return review(p.reason, { ...base, missingFacts: p.missing, conflicting: refs(p.conflicting), rule: null });
    const best = p.best as Cand<AccountingRuleRecord>;
    // exceptions are evaluated in array order (explicit); an exception that cannot be evaluated blocks the decision
    for (const ex of best.rec.exceptions || []) {
      const er = evalConditions((ex as any).when, ev.facts);
      if (er.invalid.length) return review('INVALID_RULE', { ...base, warnings: [...p.warnings, ...er.invalid] });
      if (er.missing.length) return review('MISSING_FACTS', { ...base, missingFacts: uniq(er.missing) });
      if (er.matched) {
        const action = String((ex as any).action || 'REVIEW_REQUIRED');
        const note = String((ex as any).reasonAr || (ex as any).reasonEn || 'exception');
        const status = action === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : action === 'REJECT' ? 'REJECT' : 'REVIEW_REQUIRED';
        return { ...res, ...base, decisionStatus: status, reasonCode: `EXCEPTION_${status}`, rule: best.rec, warnings: [...p.warnings, note], policy: best.policy };
      }
    }
    const overridden = refs(p.matched.filter(m => m !== best && m.sig !== best.sig));
    return { ...res, ...base, decisionStatus: 'APPLY', reasonCode: 'RULE_APPLIED', rule: best.rec, overridden, policy: best.policy };
  }

  /** Tax is a separate domain (SI-8): same deterministic selection over TaxRuleRegistry data; never inferred from accounting rules. */
  async evaluateTax(ev: BusinessEvent): Promise<TaxEvaluation> {
    const none = (decisionStatus: TaxEvaluation['decisionStatus'], reasonCode: string, extra: Partial<TaxEvaluation> = {}): TaxEvaluation =>
      ({ decisionStatus, reasonCode, taxRuleId: null, version: null, taxType: null, rate: null, treatment: null, missingFacts: [], warnings: [], ...extra });
    if (!ev.taxJurisdictionId) return none('NOT_APPLICABLE', 'TAX_NOT_REQUESTED');
    if (this.validate(ev).length) return none('REJECT', 'INVALID_EVENT', { warnings: this.validate(ev) });
    const jr = await this.st.listJurisdictions();
    const j = jr.success ? (jr.data || []).find(x => x.id === ev.taxJurisdictionId) : undefined;
    if (!j || j.framework !== 'TAX') return none('REVIEW_REQUIRED', 'BAD_TAX_JURISDICTION', { warnings: [`${ev.taxJurisdictionId} is not a TAX jurisdiction`] });
    const lr = await this.st.listStdTaxRules({ jurisdictionId: ev.taxJurisdictionId });
    if (!lr.success) return none('REVIEW_REQUIRED', 'STORAGE_ERROR');
    const wantType = getFact(ev.facts, 'taxType');
    const rows = (lr.data || []).filter(r => !wantType.found || r.taxType === wantType.value);
    const cands: Cand<TaxRuleRecord>[] = [];
    for (const id of uniq(rows.map(r => r.taxRuleId))) {
      const rv = resolveVersion(id, rows.filter(r => r.taxRuleId === id), ev.date, this.opts);
      if (rv.status === 'CONFLICT') return none('REVIEW_REQUIRED', 'VERSION_CONFLICT', { warnings: [`ambiguous versions for ${id}`] });
      if (rv.status !== 'RESOLVED') continue;
      const r = rv.item, auto = isAutomatable(r);
      if (!auto && !BLOCKING_STATUS.has(r.status)) continue;
      cands.push({ rec: r, id: r.taxRuleId, version: r.version, tier: 0, priority: r.priority, automatable: auto, conds: r.conditions, required: r.requiredData || [], sig: canonical({ t: r.treatment, rate: r.rate ?? null }), extraMissing: [], policy: null });
    }
    const p = pick(cands, ev.facts);
    if (p.kind === 'NONE') return none('NOT_APPLICABLE', 'NO_TAX_RULE');
    if (p.kind === 'REVIEW') return none('REVIEW_REQUIRED', p.reason === 'NOT_AUTOMATABLE' ? 'TAX_NOT_AUTOMATABLE' : p.reason, { missingFacts: p.missing, warnings: [...p.warnings, ...p.blocked.map(b => `tax rule ${b.id} is ${b.rec.status}`), ...p.conflicting.map(c => `conflicting tax rule ${c.id}`)] });
    const r = (p.best as Cand<TaxRuleRecord>).rec;
    return { decisionStatus: 'APPLY', reasonCode: 'TAX_RULE_APPLIED', taxRuleId: r.taxRuleId, version: r.version, taxType: r.taxType, rate: r.rate ?? null, treatment: r.treatment, missingFacts: [], warnings: p.warnings };
  }
}
