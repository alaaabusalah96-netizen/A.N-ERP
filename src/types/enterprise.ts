import { UserRole } from '../types';

/**
 * 3.1 Base Metadata Specification
 * المواصفات الفنية للبيانات التعريفية للمؤسسات
 * 
 * This interface establishes the standard structure for audit and lineage tracking fields
 * on all documents across the enterprise modules.
 */
export interface BaseMetadata {
  tenantId: string;
  organizationId: string;
  created_at: string;       // ISO 8601 string (e.g. "2026-07-09T01:47:50-07:00")
  created_by: string;       // Operator user_id or "system"
  updated_at?: string;      // ISO 8601 string
  updated_by?: string;      // Operator user_id or "system"
  version: number;          // Document state version for optimistic concurrency control
}

/**
 * 3.1 Event Envelope Specification
 * غلاف الأحداث الخاص بنظام إدارة موارد المؤسسة الموحد
 * 
 * This interface outlines the strict structure for logging domain events in a past-tense form,
 * guaranteeing comprehensive audit trail preservation.
 */
export interface EventEnvelope<T = Record<string, any>> {
  eventId: string;          // UUID or unique custom identifier
  eventType: string;        // Past-tense domain event (must match a valid event in domain-event-catalog.md)
  timestamp: string;        // ISO 8601 event occurrence timestamp
  tenantId: string;
  organizationId: string;
  user_id: string;          // Operator user_id who triggered the event
  user_name: string;        // Operator full name
  user_role: UserRole | 'System'; // Operator system role
  payload: T;               // Specific event details/payload (immutable)
  metadataVersion: string;  // Format version of this event envelope (e.g., "1.0")
}

/**
 * 3.2 Sequence Configuration Structure
 * هيكلية إعدادات محرك الترقيم المتسلسل
 */
export interface SequenceOptions {
  prefix: string;
  suffix?: string;
  padding?: number;         // Defaults to 4 (e.g., "0001")
  includeYear?: boolean;    // Defaults to true (e.g., "-2026-")
  manualStartNo?: number;   // Defaults to 1001
}

/**
 * 3.2 Company Sequence Document Schema
 * هيكلية مستند عدادات الترقيم لدفاتر الشركات
 */
export interface CompanySequenceDoc {
  id: string;               // Company ID
  company_id: string;       // Identical to ID
  last_voucher_no: number;  // Required for backwards compatibility with cash custody voucher numbers
  [sequenceKey: string]: any; // Support for additional document types sequences (e.g., 'last_expense_no')
}

/**
 * 3.3 Generic Document Lifecycle Engine Types (FSM)
 * هيكلية محرك دورة حياة المستندات العام - آلة الحالات المحدودة
 */

export interface FsmStateConfig {
  name: string;
  labelAr: string;
  labelEn: string;
  isInitial?: boolean;
  isTerminal?: boolean;
}

export interface FsmTransition<TState extends string = string, TEvent extends string = string, TContext = any> {
  event: TEvent;
  from: TState;
  to: TState;
  labelAr: string;
  labelEn: string;
  authorizedRoles?: string[]; // Empty means all roles authorized or not restricted
  guard?: (context: TContext) => boolean | Promise<boolean>; // Pre-condition check
  action?: (context: TContext) => void | Promise<void>; // Post-transition execution hook
}

export interface FsmConfig<TState extends string = string, TEvent extends string = string, TContext = any> {
  documentType: string; // Dynamic document name (e.g., "CustodyVoucher", "PurchaseRequest")
  states: Record<TState, FsmStateConfig>;
  transitions: FsmTransition<TState, TEvent, TContext>[];
  initialState: TState;
}

export interface FsmTransitionResult<TState extends string = string> {
  success: boolean;
  fromState: TState;
  toState: TState;
  messageAr: string;
  messageEn: string;
}

/**
 * 3.4 Permission Engine Types
 * هيكلية محرك الصلاحيات والأمان المشترك
 */

export interface SystemPermission {
  id: string;              // Key identifier (e.g. 'create_expense')
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: string;        // e.g. 'expenses' | 'vouchers' | 'custody' | 'admin' | 'reports' | 'inventory'
}

export interface RolePermission {
  role: string;            // UserRole or custom role string
  permissions: string[];   // Array of permission IDs granted to this role
}

export interface UserOverride {
  userId: string;
  permissionId: string;
  granted: boolean;        // true to grant, false to explicitly revoke/deny
}

export interface TemporaryOverride {
  userId: string;
  permissionId: string;
  granted: boolean;
  validFrom: string;       // ISO-8601 string
  expiresAt: string;       // ISO-8601 string
}

export interface PermissionContext {
  userId: string;
  role: string;
  tenantId: string;
  organizationId: string;
  org_unit_id?: string;
  assigned_org_unit_ids?: string[];
  userOverrides?: UserOverride[];
  temporaryOverrides?: TemporaryOverride[];
  currentTime?: string;     // ISO-8601 string to check against (defaults to now)
}

/**
 * 3.5 Audit Log Types
 * هيكلية سجل التدقيق والرقابة المشترك للمؤسسات
 */
export interface AuditRecord<T = Record<string, any>> {
  id: string;               // Unique record ID (usually matches event.eventId)
  event: EventEnvelope<T>;  // Standardized EventEnvelope
  created_at: string;       // Server-side / engine-level ISO-8601 timestamp
}

/**
 * 3.6 Configuration Engine Types
 * هيكلية محرك الإعدادات والتحكم للمؤسسات
 */

export interface CompanySettings {
  companyNameEn?: string;
  companyNameAr?: string;
  timezone?: string;
  baseCurrency?: string;
  taxRegistrationNumber?: string;
}

export interface FeatureFlags {
  [flagKey: string]: boolean;
}

export interface LimitsThresholds {
  [limitKey: string]: number;
}

export interface DefaultValues {
  [valueKey: string]: any;
}

export interface NumberingSettings {
  voucherPrefix?: string;
  expensePrefix?: string;
  padding?: number;
  includeYear?: boolean;
}

export interface WorkflowSettings {
  requiresDualApproval?: boolean;
  autoPostLedger?: boolean;
  allowOverdraft?: boolean;
}

export interface TenantSettings {
  id: string;               // Tenant / Company ID
  tenantId: string;         // Multi-tenant isolation ID
  organizationId: string;   // Multi-tenant organization ID
  company_settings: CompanySettings;
  feature_flags: FeatureFlags;
  limits_thresholds: LimitsThresholds;
  default_values: DefaultValues;
  numbering_settings: NumberingSettings;
  workflow_settings: WorkflowSettings;
  updated_at?: string;      // ISO-8601 timestamp
}

/**
 * 3.7 Business Group Schema
 * هيكلية مجموعات الشركات / الأعمال
 */
export interface BusinessGroup {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;       // ISO 8601 string (e.g. "2026-07-09T01:47:50-07:00")
  updatedAt?: string;      // ISO 8601 string
}

