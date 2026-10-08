/**
 * @file decisionTypes.ts
 * @description Decision-layer contracts (F2): business event in, structured treatment + durable decision record out.
 * No AI-invented accounts or journals: account CODES only ever come from configured role mappings.
 */
import type { AccountingRuleRecord } from './standardsTypes';

export type DecisionStatus = 'APPLY' | 'REVIEW_REQUIRED' | 'NOT_APPLICABLE' | 'REJECT';

export interface BusinessEvent {
  eventType: string;
  eventId: string;                    // source document id (e.g. stock document / invoice id)
  sourceModule: string;
  tenantId: string;
  date: string;                       // YYYY-MM-DD, the transaction date (drives rule versions)
  currency: string;
  decimals?: number;                  // minor-unit precision, default 2
  reportingJurisdictionId?: string | null;  // accounting framework/jurisdiction of the entity (e.g. 'EG-EAS')
  taxJurisdictionId?: string | null;        // absent => tax treatment not requested
  facts: Record<string, unknown>;
}

export interface RuleRef {
  ruleId: string; version: number; standardId: string; framework: string; jurisdictionId: string;
  tier: number; priority: number; sourceReference?: string | null; status?: string;
}
export interface PolicyRef { key: string; value: string; version: number; effectiveFrom: string }

export interface EvaluationResult {
  decisionStatus: DecisionStatus;
  reasonCode: string;                 // RULE_APPLIED | NO_COVERED_RULE | MISSING_FACTS | CONFLICT | NOT_AUTOMATABLE | EXCEPTION_* | INVALID_EVENT | ...
  rule: AccountingRuleRecord | null;
  considered: RuleRef[];              // matching rules in explicit precedence order
  overridden: RuleRef[];              // matching rules that lost on precedence
  conflicting: RuleRef[];
  notAutomatable: RuleRef[];          // SOURCE_REQUIRED / REFERENCE_ONLY / DRAFT rules that blocked automation
  policy: PolicyRef | null;
  missingFacts: string[];
  warnings: string[];
}

export interface TaxEvaluation {
  decisionStatus: DecisionStatus;
  reasonCode: string;
  taxRuleId: string | null; version: number | null; taxType: string | null;
  rate: number | null; treatment: Record<string, unknown> | null;
  missingFacts: string[]; warnings: string[];
}

export interface TreatmentLine {
  side: 'DEBIT' | 'CREDIT';
  role: string;
  accountCode: string | null;
  amount: number;
  dimensions: Record<string, unknown>;
  description: string;
}

export interface AccountingTreatment {
  decisionStatus: DecisionStatus;
  reasonCode: string;
  lines: TreatmentLine[];
  currency: string;
  measurementBasis: string | null;
  recognitionTiming: string | null;
  reversal: { required: boolean; trigger?: string } | null;
  inventoryEffect: Record<string, unknown> | null;
  taxTreatment: TaxEvaluation | null;
  sourceEvent: { eventType: string; eventId: string; sourceModule: string; date: string };
  ruleId: string | null; ruleVersion: number | null; standardRef: string | null;
  explanation: { ar: string; en: string };
  warnings: string[];
  missingFacts: string[];
  confidence: 'DETERMINISTIC' | 'NONE';   // DETERMINISTIC only when APPLY and every mandatory fact exists
}

export interface AccountingDecisionRecord {
  id: string; tenantId: string; decisionKey: string;
  eventType: string; eventId: string; sourceModule: string; eventDate: string;
  decisionStatus: DecisionStatus; reasonCode: string;
  framework: string | null; jurisdictionId: string | null; standardId: string | null;
  ruleId: string | null; ruleVersion: number | null; tier: number | null;
  policyKey: string | null; policyValue: string | null; policyVersion: number | null;
  facts: Record<string, unknown>;
  treatment: AccountingTreatment;
  taxTreatment: TaxEvaluation | null;
  missingFacts: string[]; warnings: string[]; conflicting: RuleRef[];
  explanationAr: string; explanationEn: string;
  journalEntryId: string | null;
  createdBy: string; createdAt: string;
}
