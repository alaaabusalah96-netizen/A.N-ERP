/**
 * @file registries.ts
 * @description StandardsRegistry, JurisdictionRegistry, AccountingRuleRegistry, TaxRuleRegistry,
 * AccountingPolicyRegistry (F1). All persistence goes through StoragePort; nothing here posts journals.
 * Hard guards (SI-6 / SI-10): a rule can be ACTIVE only with a verified source reference; account NUMBERS
 * are never allowed inside a treatment (roles only); history is immutable (new version, never overwrite).
 */
import crypto from 'crypto';
import type { StoragePort, StorageResult } from '../storage/StoragePort';
import {
  AccountingPolicyRecord, AccountingRuleRecord, CoverageStatus, JurisdictionRecord, POLICY_DEFINITIONS,
  StandardRecord, TaxRuleRecord, UNASSERTED_DATE, isIsoDate, isKnownAccountingEvent,
} from './standardsTypes';
import { ResolveOptions, ResolveResult, resolveVersion, validateNewVersion, validateWindow } from './EffectiveDateResolver';

type R<T> = StorageResult<T>;
const fail = <T>(status: number, title: string, detail: string): R<T> =>
  ({ success: false, error: { type: 'standards', title, status, detail } });
const ID_RE = /^[A-Za-z0-9_.:\- ]{2,80}$/;
const MAX_JSON = 20000;
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 24);

export function activeGuard(x: { status: string; sourceVerified: boolean; sourceReference?: string | null; effectiveFrom?: string }): string | null {
  if (x.status === 'ACTIVE' && x.effectiveFrom === UNASSERTED_DATE) return 'ACTIVE requires a real, asserted effectiveFrom date';
  if (x.status === 'ACTIVE' && !(x.sourceVerified === true && (x.sourceReference || '').trim().length > 0))
    return 'ACTIVE requires sourceVerified=true and a non-empty sourceReference (SI-6/SI-10); use SOURCE_REQUIRED or REFERENCE_ONLY';
  return null;
}
/** Deep scan: treatments must reference account ROLES; account numbers/codes are rejected. */
export function findAccountNumberKey(o: unknown): string | null {
  if (!o || typeof o !== 'object') return null;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (/^(account(Code|Number|No|Id)|glAccount|accountCode)$/i.test(k)) return k;
    const inner = findAccountNumberKey(v);
    if (inner) return inner;
  }
  return null;
}
function jsonProblem(label: string, o: unknown): string | null {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return `${label} must be an object`;
  if (JSON.stringify(o).length > MAX_JSON) return `${label} is too large`;
  return null;
}
async function logAdmin(st: StoragePort, actor: string, what: string, ids: string[], after?: unknown) {
  try {
    await st.appendSystemChangeLog({
      id: `scl-std-${sha(what + ids.join('|') + Date.now() + Math.random())}`, timestamp: new Date().toISOString(),
      actor, changeType: 'PLATFORM_MANAGEMENT', module: 'standards', entitiesAffected: ids,
      summaryAr: what, afterState: after, version: '8.2',
    });
  } catch { /* logging must never break the registry write */ }
}

export class JurisdictionRegistry {
  constructor(private st: StoragePort) {}
  list() { return this.st.listJurisdictions(); }
  async get(id: string): Promise<JurisdictionRecord | null> {
    const r = await this.st.listJurisdictions();
    return r.success ? (r.data || []).find(j => j.id === id) || null : null;
  }
  async register(j: JurisdictionRecord, actor: string, key: string): Promise<R<JurisdictionRecord>> {
    if (!ID_RE.test(j.id)) return fail(400, 'bad-id', 'jurisdiction id invalid');
    if (!j.nameAr || !j.nameEn) return fail(400, 'bad-name', 'nameAr and nameEn are required');
    if (j.parentId && !(await this.get(j.parentId))) return fail(400, 'bad-parent', `unknown parent ${j.parentId}`);
    const r = await this.st.saveJurisdiction(j, actor, key);
    if (r.success) await logAdmin(this.st, actor, `تسجيل اختصاص قضائي ${j.id}`, [j.id]);
    return r;
  }
}

export class StandardsRegistry {
  constructor(private st: StoragePort) {}
  list(filter?: { standardId?: string; framework?: string }) { return this.st.listStandards(filter); }
  async register(s: StandardRecord, actor: string, key: string): Promise<R<StandardRecord>> {
    if (!ID_RE.test(s.standardId)) return fail(400, 'bad-id', 'standardId invalid');
    if (!s.titleEn) return fail(400, 'bad-title', 'titleEn required');
    const cov = s.coverageStatus;
    if ((cov === 'IMPLEMENTED' || cov === 'PARTIAL') && !(s.coverageEvidenceRef || '').trim())
      return fail(400, 'coverage-without-evidence', `${cov} requires coverageEvidenceRef`);
    const g = activeGuard({ status: 'ACTIVE', sourceVerified: s.sourceVerified, sourceReference: s.sourceReference, effectiveFrom: s.effectiveFrom });
    if ((cov === 'IMPLEMENTED' || cov === 'PARTIAL') && g) return fail(400, 'unverified-source', g);
    if (s.mapping && s.mapping.relation === 'EQUIVALENT_VERIFIED' && !(s.mapping.sourceReference || '').trim())
      return fail(400, 'mapping-without-source', 'EQUIVALENT_VERIFIED mapping needs a sourceReference (mapping is not equivalence)');
    const existing = await this.st.listStandards({ standardId: s.standardId });
    if (!existing.success) return existing as R<any>;
    const bad = validateNewVersion((existing.data || []).filter(e => e.framework === s.framework), s);
    if (bad) return fail(409, 'version-conflict', bad);
    const r = await this.st.saveStandard(s, actor, key);
    if (r.success) await logAdmin(this.st, actor, `تسجيل معيار ${s.standardId} v${s.version}`, [s.standardId], { coverage: cov });
    return r;
  }
  async setCoverage(standardId: string, version: number, cov: CoverageStatus, evidenceRef: string | null, actor: string, key: string): Promise<R<StandardRecord>> {
    if ((cov === 'IMPLEMENTED' || cov === 'PARTIAL') && !(evidenceRef || '').trim())
      return fail(400, 'coverage-without-evidence', `${cov} requires an evidence reference`);
    const cur = await this.st.listStandards({ standardId });
    const row = cur.success ? (cur.data || []).find(x => x.version === version) : undefined;
    if (!row) return fail(404, 'not-found', `${standardId} v${version}`);
    if ((cov === 'IMPLEMENTED' || cov === 'PARTIAL') && !row.sourceVerified)
      return fail(400, 'unverified-source', 'cannot mark a standard with an unverified source as implemented');
    const r = await this.st.updateStandardCoverage(standardId, version, cov, evidenceRef, actor, key);
    if (r.success) await logAdmin(this.st, actor, `تغيير تغطية ${standardId} إلى ${cov}`, [standardId], { cov, evidenceRef });
    return r;
  }
  async coverageReport(): Promise<Array<{ standardId: string; framework: string; coverage: CoverageStatus; version: number }>> {
    const r = await this.st.listStandards();
    const rows = r.success ? r.data || [] : [];
    const latest = new Map<string, StandardRecord>();
    for (const s of rows) { const k = `${s.framework}|${s.standardId}`; const c = latest.get(k); if (!c || s.version > c.version) latest.set(k, s); }
    return [...latest.values()].sort((a, b) => (a.framework + a.standardId).localeCompare(b.framework + b.standardId))
      .map(s => ({ standardId: s.standardId, framework: s.framework, coverage: s.coverageStatus, version: s.version }));
  }
}

export class AccountingRuleRegistry {
  constructor(private st: StoragePort) {}
  list(filter?: { ruleId?: string; eventType?: string; jurisdictionId?: string }) { return this.st.listAccountingRules(filter); }
  async register(rule: AccountingRuleRecord, actor: string, key: string): Promise<R<AccountingRuleRecord>> {
    if (!ID_RE.test(rule.ruleId)) return fail(400, 'bad-id', 'ruleId invalid');
    if (!isKnownAccountingEvent(rule.eventType)) return fail(400, 'unknown-event', `unknown event ${rule.eventType}`);
    if (!Number.isInteger(rule.priority) || ![1, 2, 3, 4, 5].includes(rule.tier)) return fail(400, 'bad-priority', 'priority/tier invalid');
    const p = jsonProblem('conditions', rule.conditions) || jsonProblem('treatment', rule.treatment);
    if (p) return fail(400, 'bad-json', p);
    const bad = findAccountNumberKey(rule.treatment);
    if (bad) return fail(400, 'account-number-forbidden', `treatment must use account roles, found key "${bad}"`);
    if (!Array.isArray(rule.requiredData) || !Array.isArray(rule.exceptions)) return fail(400, 'bad-shape', 'requiredData/exceptions must be arrays');
    const g = activeGuard(rule); if (g) return fail(400, 'unverified-source', g);
    const jr = await this.st.listJurisdictions();
    const j = jr.success ? (jr.data || []).find(x => x.id === rule.jurisdictionId) : undefined;
    if (!j) return fail(400, 'unknown-jurisdiction', rule.jurisdictionId);
    if (j.framework === 'TAX') return fail(400, 'tax-separation', 'tax rules live in TaxRuleRegistry (SI-8)');
    if (j.framework !== rule.framework) return fail(400, 'framework-mismatch', `rule ${rule.framework} vs jurisdiction ${j.framework}`);
    const sr = await this.st.listStandards({ standardId: rule.standardId });
    const std = sr.success ? (sr.data || []).filter(s => s.framework === rule.framework) : [];
    if (!std.length) return fail(400, 'unknown-standard', rule.standardId);
    if (rule.status === 'ACTIVE' && !std.some(s => s.coverageStatus === 'IMPLEMENTED' || s.coverageStatus === 'PARTIAL'))
      return fail(400, 'standard-not-covered', `${rule.standardId} coverage must be IMPLEMENTED/PARTIAL (with evidence) before an ACTIVE rule`);
    const ex = await this.st.listAccountingRules({ ruleId: rule.ruleId });
    if (!ex.success) return ex as R<any>;
    const nv = validateNewVersion(ex.data || [], rule); if (nv) return fail(409, 'version-conflict', nv);
    const r = await this.st.saveAccountingRule(rule, actor, key);
    if (r.success) await logAdmin(this.st, actor, `تسجيل قاعدة ${rule.ruleId} v${rule.version} (${rule.status})`, [rule.ruleId]);
    return r;
  }
  /** Candidate rules for an event on a date; only ACTIVE rules are automatable (SI-6). */
  async candidates(eventType: string, jurisdictionId: string, date: string, opts?: ResolveOptions): Promise<AccountingRuleRecord[]> {
    const r = await this.st.listAccountingRules({ eventType, jurisdictionId });
    const rows = r.success ? r.data || [] : [];
    const out: AccountingRuleRecord[] = [];
    for (const id of [...new Set(rows.map(x => x.ruleId))].sort()) {
      const res = resolveVersion(id, rows.filter(x => x.ruleId === id), date, opts);
      if (res.status === 'RESOLVED' && res.item.status === 'ACTIVE') out.push(res.item);
    }
    return out.sort((a, b) => a.tier - b.tier || b.priority - a.priority || a.ruleId.localeCompare(b.ruleId));
  }
  async resolveRule(ruleId: string, date: string, opts?: ResolveOptions): Promise<ResolveResult<AccountingRuleRecord>> {
    const r = await this.st.listAccountingRules({ ruleId });
    return resolveVersion(ruleId, r.success ? r.data || [] : [], date, opts);
  }
}

export class TaxRuleRegistry {
  constructor(private st: StoragePort) {}
  list(filter?: { taxRuleId?: string; jurisdictionId?: string; taxType?: string }) { return this.st.listStdTaxRules(filter); }
  async register(rule: TaxRuleRecord, actor: string, key: string): Promise<R<TaxRuleRecord>> {
    if (!ID_RE.test(rule.taxRuleId)) return fail(400, 'bad-id', 'taxRuleId invalid');
    if (!rule.taxType) return fail(400, 'bad-type', 'taxType required');
    const p = jsonProblem('conditions', rule.conditions) || jsonProblem('treatment', rule.treatment);
    if (p) return fail(400, 'bad-json', p);
    const bad = findAccountNumberKey(rule.treatment);
    if (bad) return fail(400, 'account-number-forbidden', `treatment must use account roles, found key "${bad}"`);
    const g = activeGuard(rule); if (g) return fail(400, 'unverified-source', g);
    if (rule.rate != null) {
      if (!Number.isFinite(rule.rate) || rule.rate < 0 || rule.rate > 1) return fail(400, 'bad-rate', 'rate must be a fraction between 0 and 1');
      if (!rule.sourceVerified) return fail(400, 'unverified-rate', 'a tax rate needs a verified source (no invented rates)');
    }
    const jr = await this.st.listJurisdictions();
    const j = jr.success ? (jr.data || []).find(x => x.id === rule.jurisdictionId) : undefined;
    if (!j) return fail(400, 'unknown-jurisdiction', rule.jurisdictionId);
    if (j.framework !== 'TAX') return fail(400, 'tax-separation', 'tax rules must belong to a TAX jurisdiction (SI-8)');
    const ex = await this.st.listStdTaxRules({ taxRuleId: rule.taxRuleId });
    if (!ex.success) return ex as R<any>;
    const nv = validateNewVersion(ex.data || [], rule); if (nv) return fail(409, 'version-conflict', nv);
    const r = await this.st.saveStdTaxRule(rule, actor, key);
    if (r.success) await logAdmin(this.st, actor, `تسجيل قاعدة ضريبية ${rule.taxRuleId} v${rule.version}`, [rule.taxRuleId]);
    return r;
  }
  async resolve(taxRuleId: string, date: string, opts?: ResolveOptions): Promise<ResolveResult<TaxRuleRecord>> {
    const r = await this.st.listStdTaxRules({ taxRuleId });
    return resolveVersion(taxRuleId, r.success ? r.data || [] : [], date, opts);
  }
}

export class AccountingPolicyRegistry {
  constructor(private st: StoragePort) {}
  history(tenantId: string, policyKey?: string) { return this.st.listAccountingPolicies(tenantId, policyKey); }
  /** Appends a NEW effective-dated version; never edits a past one. Backdating is rejected by storage atomically. */
  async setPolicy(tenantId: string, policyKey: string, value: string, effectiveFrom: string, reason: string | null, actor: string, key: string): Promise<R<AccountingPolicyRecord>> {
    const def = POLICY_DEFINITIONS.find(d => d.key === policyKey);
    if (!def) return fail(400, 'unknown-policy', policyKey);
    if (!isIsoDate(effectiveFrom)) return fail(400, 'bad-date', 'effectiveFrom must be YYYY-MM-DD');
    const v = String(value ?? '').trim();
    if (!v || v.length > 200) return fail(400, 'bad-value', 'value required (max 200 chars)');
    if (def.valueType === 'ENUM' && !(def.allowedValues || []).includes(v)) return fail(400, 'value-not-allowed', `${policyKey} must be one of ${(def.allowedValues || []).join(', ')}`);
    if (def.valueType === 'NUMBER' && !(Number.isFinite(Number(v)) && Number(v) >= 0)) return fail(400, 'bad-number', `${policyKey} must be a non-negative number`);
    const id = `pol-${sha(`${tenantId}|${policyKey}|${key}`)}`;
    const r = await this.st.appendAccountingPolicyVersion(tenantId, { id, tenantId, policyKey, value: v, effectiveFrom, reason, createdBy: actor }, actor, key);
    if (r.success) await logAdmin(this.st, actor, `تغيير سياسة ${policyKey} إلى ${v} اعتبارًا من ${effectiveFrom}`, [policyKey], { tenantId, v });
    return r;
  }
  async getEffective(tenantId: string, policyKey: string, date: string): Promise<ResolveResult<AccountingPolicyRecord>> {
    const r = await this.st.listAccountingPolicies(tenantId, policyKey);
    return resolveVersion(policyKey, r.success ? r.data || [] : [], date);
  }
}
export { validateWindow };
