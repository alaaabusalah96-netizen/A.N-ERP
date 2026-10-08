/**
 * @file StandardsDecisionService.ts
 * @description Single entry point of the decision layer (SI-1/SI-2): event -> evaluation -> treatment -> durable decision.
 * It never posts: PostingEngine stays the only posting path. The caller posts `decision.treatment.lines` and then calls
 * linkJournal() so every journal can answer "why was this created?". NOT_APPLICABLE results are returned but not stored
 * (modules without a covered rule keep their existing path and must not flood the audit table).
 */
import crypto from 'crypto';
import type { StoragePort, StorageResult } from '../storage/StoragePort';
import { RuleEvaluationEngine } from './RuleEvaluationEngine';
import { AccountingTreatmentEngine, TreatmentContext } from './AccountingTreatmentEngine';
import { ResolveOptions } from './EffectiveDateResolver';
import { isIsoDate } from './standardsTypes';
import type { AccountingDecisionRecord, BusinessEvent } from './decisionTypes';

export interface DecideOptions extends TreatmentContext {
  actorId: string;
  /** Replay-safe key. Default: dec:<eventType>:<eventId>. The FIRST stored decision for a key is returned on replay. */
  idempotencyKey?: string;
  persistNotApplicable?: boolean;
}
export interface DecideResult { decision: AccountingDecisionRecord; stored: boolean; error?: string }

export class StandardsDecisionService {
  private engine: RuleEvaluationEngine;
  private treat = new AccountingTreatmentEngine();
  constructor(private st: StoragePort, opts: { now?: () => string; resolve?: ResolveOptions } = {}) {
    this.engine = new RuleEvaluationEngine(st, opts.resolve);
    this.now = opts.now || (() => new Date().toISOString());
  }
  private now: () => string;

  async decide(ev: BusinessEvent, o: DecideOptions): Promise<DecideResult> {
    if (!ev || typeof ev !== 'object') throw new Error('decide(): event is required');
    const evaluation = await this.engine.evaluate(ev);
    const tax = ev && ev.taxJurisdictionId ? await this.engine.evaluateTax(ev) : null;
    const treatment = this.treat.build(ev, evaluation, tax, o);
    const decisionKey = o.idempotencyKey || `dec:${ev.eventType}:${ev.eventId}`;
    const r = evaluation.rule;
    const rec: AccountingDecisionRecord = {
      id: `dec-${crypto.createHash('sha256').update(`${ev.tenantId}|${decisionKey}`).digest('hex').slice(0, 24)}`,
      tenantId: ev.tenantId, decisionKey, eventType: ev.eventType, eventId: ev.eventId, sourceModule: ev.sourceModule, eventDate: ev.date,
      decisionStatus: treatment.decisionStatus, reasonCode: treatment.reasonCode,
      framework: r?.framework ?? null, jurisdictionId: r?.jurisdictionId ?? (ev.reportingJurisdictionId || null), standardId: r?.standardId ?? null,
      ruleId: r?.ruleId ?? null, ruleVersion: r?.version ?? null, tier: r?.tier ?? null,
      policyKey: evaluation.policy?.key ?? null, policyValue: evaluation.policy?.value ?? null, policyVersion: evaluation.policy?.version ?? null,
      facts: ev.facts, treatment, taxTreatment: tax, missingFacts: treatment.missingFacts, warnings: treatment.warnings, conflicting: evaluation.conflicting,
      explanationAr: treatment.explanation.ar, explanationEn: treatment.explanation.en, journalEntryId: null,
      createdBy: o.actorId, createdAt: this.now(),
    };
    if (treatment.decisionStatus === 'NOT_APPLICABLE' && !o.persistNotApplicable) return { decision: rec, stored: false };
    const shapeOk = !!ev && [ev.tenantId, ev.eventId, ev.eventType, ev.sourceModule].every(x => typeof x === 'string' && x.length > 0) && isIsoDate(ev.date);
    if (treatment.reasonCode === 'INVALID_EVENT') return { decision: rec, stored: false };
    if (!shapeOk) return { decision: rec, stored: false, error: 'event is malformed; decision returned but not stored' };
    const s = await this.st.saveAccountingDecision(ev.tenantId, rec);
    if (!s.success || !s.data) return { decision: rec, stored: false, error: s.error?.detail || 'decision not stored' };
    return { decision: s.data, stored: true };
  }

  getDecision(tenantId: string, id: string) { return this.st.getAccountingDecision(tenantId, id); }
  findDecisions(tenantId: string, f?: { eventType?: string; eventId?: string; journalEntryId?: string; status?: string; limit?: number }) { return this.st.listAccountingDecisions(tenantId, f); }
  /** One-way link decision -> journal. Re-linking to the same journal is a no-op; a different journal is rejected (409). */
  linkJournal(tenantId: string, decisionId: string, journalEntryId: string): Promise<StorageResult<AccountingDecisionRecord>> { return this.st.linkDecisionToJournal(tenantId, decisionId, journalEntryId); }
}
