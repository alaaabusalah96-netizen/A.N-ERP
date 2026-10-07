/**
 * @file standardsTypes.ts
 * @description Standards & Accounting Intelligence Layer — shared types (F1).
 * Decision layer only: PostingEngine still posts, StoragePort still persists.
 * Dates are calendar dates 'YYYY-MM-DD'; effectiveFrom and effectiveTo are both INCLUSIVE.
 */

export type Framework = 'IFRS' | 'EAS' | 'TAX' | 'PACK';
/** SI-6 status vocabulary. Only IMPLEMENTED / PARTIAL may ever drive automatic posting. */
export type CoverageStatus = 'IMPLEMENTED' | 'PARTIAL' | 'REFERENCE_ONLY' | 'SOURCE_REQUIRED' | 'NOT_IMPLEMENTED';
export type RuleStatus = 'ACTIVE' | 'DRAFT' | 'SOURCE_REQUIRED' | 'REFERENCE_ONLY' | 'SUPERSEDED' | 'RETIRED';
export type MappingRelation = 'UNVERIFIED' | 'EQUIVALENT_VERIFIED' | 'DIFFERS';
export type TransitionMethod = 'RETROSPECTIVE' | 'PROSPECTIVE' | 'MODIFIED_RETROSPECTIVE' | 'NONE';

/** Anything with a validity window. */
export interface Versioned {
  version: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  earlyAdoptionAllowed?: boolean;
  earlyAdoptionFrom?: string | null;
}

export interface StandardRecord extends Versioned {
  standardId: string;            // e.g. 'IAS 2'
  framework: Framework;
  titleEn: string;
  titleAr?: string;
  coverageStatus: CoverageStatus;
  coverageEvidenceRef?: string | null; // mandatory when coverageStatus is IMPLEMENTED or PARTIAL
  amendment?: string | null;
  transitionMethod?: TransitionMethod;
  supersededBy?: string | null;
  sourceReference?: string | null;
  sourceVerified: boolean;
  mapping?: { standardId: string; relation: MappingRelation; sourceReference?: string | null } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface JurisdictionRecord {
  id: string;                    // e.g. 'GLOBAL-IFRS', 'EG-EAS', 'EG-TAX'
  kind: 'GLOBAL' | 'COUNTRY' | 'REGION_PACK';
  countryCode?: string | null;
  framework: Framework;
  parentId?: string | null;
  relationToIfrs: 'SELF' | 'UNVERIFIED' | 'MAPPED' | 'NOT_APPLICABLE';
  nameAr: string;
  nameEn: string;
  status: 'ACTIVE' | 'PLACEHOLDER';
  createdAt?: string;
}

export interface AccountingRuleRecord extends Versioned {
  ruleId: string;
  standardId: string;
  framework: Framework;
  jurisdictionId: string;
  eventType: string;
  priority: number;
  /** Precedence tier (SI-5): 1 law, 2 standard, 3 local override, 4 policy, 5 operational. */
  tier: 1 | 2 | 3 | 4 | 5;
  conditions: Record<string, unknown>;
  treatment: Record<string, unknown>;   // account ROLES only, never account numbers
  requiredData: string[];
  exceptions: Array<Record<string, unknown>>;
  policyOption?: string | null;
  sourceReference?: string | null;
  sourceVerified: boolean;
  status: RuleStatus;
  supersededBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaxRuleRecord extends Versioned {
  taxRuleId: string;
  jurisdictionId: string;        // must belong to a framework 'TAX' jurisdiction
  taxType: string;               // e.g. 'VAT', 'WITHHOLDING'
  priority: number;
  conditions: Record<string, unknown>;
  treatment: Record<string, unknown>;
  rate?: number | null;          // only with a verified source
  requiredData: string[];
  sourceReference?: string | null;
  sourceVerified: boolean;
  status: RuleStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccountingPolicyRecord {
  id: string;
  tenantId: string;
  policyKey: string;
  value: string;
  version: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  reason?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface PolicyDefinition {
  key: string;
  labelAr: string;
  valueType: 'ENUM' | 'NUMBER' | 'STRING';
  /** Platform-configured option set. Not a legal determination of what a standard permits. */
  allowedValues?: string[];
}

export const POLICY_DEFINITIONS: PolicyDefinition[] = [
  { key: 'inventory_valuation_method', labelAr: 'طريقة تقييم المخزون', valueType: 'ENUM', allowedValues: ['FIFO', 'WEIGHTED_AVERAGE', 'SPECIFIC_IDENTIFICATION'] },
  { key: 'capitalization_threshold', labelAr: 'حد رسملة الأصول', valueType: 'NUMBER' },
  { key: 'depreciation_method', labelAr: 'طريقة الإهلاك', valueType: 'ENUM', allowedValues: ['STRAIGHT_LINE', 'DECLINING_BALANCE', 'UNITS_OF_PRODUCTION'] },
  { key: 'depreciation_convention', labelAr: 'اتفاقية بدء الإهلاك', valueType: 'ENUM', allowedValues: ['FULL_MONTH', 'MID_MONTH', 'DAILY'] },
  { key: 'revenue_recognition_policy', labelAr: 'سياسة الاعتراف بالإيراد', valueType: 'STRING' },
  { key: 'fx_policy', labelAr: 'سياسة العملات الأجنبية', valueType: 'STRING' },
  { key: 'cost_allocation_policy', labelAr: 'سياسة توزيع التكاليف', valueType: 'STRING' },
  { key: 'materiality_threshold', labelAr: 'حد الأهمية النسبية', valueType: 'NUMBER' },
  { key: 'tax_treatment_config', labelAr: 'إعداد المعالجة الضريبية', valueType: 'STRING' },
];

/** Canonical, extensible event taxonomy shared by all modules. */
export const ACCOUNTING_EVENTS: readonly string[] = [
  'PURCHASE_ORDER', 'GOODS_RECEIPT', 'SUPPLIER_INVOICE', 'SUPPLIER_PAYMENT', 'PURCHASE_RETURN',
  'SALES_ORDER', 'DELIVERY', 'SALES_INVOICE', 'CUSTOMER_RECEIPT', 'SALES_RETURN', 'CREDIT_NOTE',
  'INVENTORY_TRANSFER', 'INVENTORY_COUNT', 'INVENTORY_WRITE_DOWN', 'INVENTORY_WRITE_DOWN_REVERSAL',
  'INVENTORY_LOSS', 'INVENTORY_GAIN', 'PRODUCTION_ISSUE', 'PRODUCTION_RECEIPT',
  'ASSET_ACQUISITION', 'ASSET_CAPITALIZATION', 'DEPRECIATION_RUN', 'ASSET_DISPOSAL', 'ASSET_IMPAIRMENT', 'ASSET_REVALUATION',
  'PAYROLL_RUN', 'FOREIGN_CURRENCY_SETTLEMENT', 'FOREIGN_CURRENCY_REVALUATION',
  'LEASE_COMMENCEMENT', 'LEASE_PAYMENT', 'LEASE_REMEASUREMENT',
  'INTEREST_ACCRUAL', 'LOAN_DRAW', 'LOAN_REPAYMENT', 'EXPECTED_CREDIT_LOSS',
  'PROVISION_RECOGNITION', 'PROVISION_REASSESSMENT', 'TAX_ACCRUAL', 'TAX_PAYMENT',
  'PERIOD_CLOSE', 'CONSOLIDATION', 'INTERCOMPANY_ELIMINATION',
];

const extraEvents = new Set<string>();
/** Taxonomy is extensible: later phases register their own events (UPPER_SNAKE_CASE only). */
export function registerAccountingEvent(name: string): boolean {
  if (!/^[A-Z][A-Z0-9_]{2,60}$/.test(name)) return false;
  extraEvents.add(name);
  return true;
}
export function isKnownAccountingEvent(name: string): boolean {
  return ACCOUNTING_EVENTS.includes(name) || extraEvents.has(name);
}

/** Sentinel for catalogue placeholders: the real effective date is NOT asserted (SI-10). Never usable for ACTIVE rules. */
export const UNASSERTED_DATE = '0001-01-01';

export const isIsoDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
