/**
 * @file StoragePort.ts
 * @description StoragePort Contract for A.N ERP (v7.1)
 * Defined code-first at Aggregate level.
 * All write operations mandate an idempotencyKey.
 * Errors follow RFC 7807 problem details specification.
 */

export interface RFC7807Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  invalidParams?: Array<{ name: string; reason: string }>;
}

export interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: RFC7807Problem;
}

export type AdapterType = 'postgresql' | 'mysql' | 'mongodb' | 'firebase' | 'inmemory';
export type IsolationLevel = 'Shared' | 'Dedicated';

export interface BackendConfig {
  adapterType: AdapterType;
  /** Name of the environment reference / secret name (e.g. 'DATABASE_URL'), never raw credentials */
  connectionRef: string;
  isolationLevel: IsolationLevel;
}

export interface TenantCompany {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  taxNumber?: string;
  backendConfig: BackendConfig;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt?: string;
}

export interface User {
  id: string;
  tenantId: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  status: 'ACTIVE' | 'INACTIVE';
  passwordHash?: string;
  twoFactorSecret?: string;
  twoFactorEnabled?: boolean;
  backupCodes?: string[];
  permissions?: string[];
  requiresPasswordChange?: boolean;
  createdAt?: string;
}

export interface RefreshTokenRecord {
  tokenHash: string;
  familyId: string;
  sequence: number;
  userId: string;
  tenantId: string;
  sessionId: string;
  expiresAt: number; // ms timestamp
  isUsed: boolean;
  revokedAt?: number;
}

export interface TokenFamily {
  familyId: string;
  userId: string;
  tenantId: string;
  isInvalidated: boolean;
  invalidationReason?: string;
  createdAt: number;
}

export interface Account {
  code: string;
  tenantId: string;
  nameAr: string;
  nameEn?: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  nature?: 'DEBIT' | 'CREDIT';
  currency?: string;
  debitBalance?: number;
  creditBalance?: number;
  balance?: number;
  isActive?: boolean;
  isParent?: boolean;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface JournalLine {
  id: string;
  accountCode: string;
  costCenter?: string;
  debit: number;
  credit: number;
  description: string;
}

export type JournalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'POSTED' | 'REVERSED';

export interface JournalEntry {
  id: string;
  code: string;
  tenantId: string;
  date: string;
  type: string;
  description: string;
  lines: JournalLine[];
  totalAmount: number;
  status: JournalStatus;
  createdBy: string;
  approvedBy?: string;
  postedAt?: string;
  reversedByEntryId?: string;
}

export interface SequenceResult {
  sequenceNumber: number;
  formattedCode: string;
}

export interface ApprovalStep {
  stepNumber: number;
  roleRequired: string;
  approverId?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  actionTimestamp?: string;
  comment?: string;
}

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  documentType: string;
  documentId: string;
  documentCode: string;
  initiatorId: string;
  currentStep: number;
  steps: ApprovalStep[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export interface SystemChangeLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  changeType: 'SCHEMA_MIGRATION' | 'PHASE_CLOSURE' | 'STORAGE_CONFIG' | 'ENGINE_POST' | 'SOD_ENFORCEMENT' | 'MIGRATION' | 'NUMBERING_OVERRIDE';
  module: string;
  entitiesAffected: string[];
  summaryAr: string;
  beforeState?: any;
  afterState?: any;
  evidenceRef?: string;
  version: string;
}

export interface CountryTaxRule {
  countryCode: string; // SA, EG, AE, KW, QA, BH, OM
  countryNameAr: string;
  standardVatRate: number; // e.g. 0.15 for SA, 0.14 for EG
  currencyCode: string;
  taxAuthorityName: string;
  taxIdFormatRegex: string;
  updatedAt?: string;
}

export interface TenantModuleManifest {
  tenantId: string;
  moduleId: string; // e.g. 'pos', 'inventory', 'custody', 'expenses', etc.
  moduleNameAr: string;
  isEnabled: boolean;
  config?: Record<string, any>;
  activatedAt: string;
}

export type DualControlStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export interface MasterItem {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  category: string;
  unitPrice: number;
  costPrice: number;
  status: DualControlStatus;
  createdBy: string;
  approvedBy?: string;
  rejectionReason?: string;
  createdAt: string;
  approvedAt?: string;
}

export interface MasterPartner {
  id: string;
  tenantId: string;
  type: 'CUSTOMER' | 'VENDOR';
  code: string;
  nameAr: string;
  taxNumber?: string;
  phone?: string;
  status: DualControlStatus;
  createdBy: string;
  approvedBy?: string;
  rejectionReason?: string;
  createdAt: string;
  approvedAt?: string;
}

export interface AuditChainEntry {
  id: string;
  sequenceNumber: number;
  tenantId: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: any;
  afterState?: any;
  ipAddress?: string;
  previousHash: string;
  entryHash: string;
}

export interface StoragePort {
  readonly adapterName: string;

  // Tenant / Company Aggregates
  getTenant(tenantId: string): Promise<StorageResult<TenantCompany>>;
  saveTenant(tenant: TenantCompany, idempotencyKey: string): Promise<StorageResult<TenantCompany>>;
  listTenants(): Promise<StorageResult<TenantCompany[]>>;

  // Users & RBAC
  getUser(tenantId: string, userId: string): Promise<StorageResult<User>>;
  saveUser(user: User, idempotencyKey: string): Promise<StorageResult<User>>;

  // Chart of Accounts & Balances
  getAccount(tenantId: string, accountCode: string): Promise<StorageResult<Account>>;
  saveAccount(tenantId: string, account: Account, idempotencyKey: string): Promise<StorageResult<Account>>;
  getAccountBalance(
    tenantId: string,
    accountCode: string
  ): Promise<StorageResult<{ accountCode: string; debitTotal: number; creditTotal: number; balance: number }>>;

  // Historical Financial Query (As Of - 2D)
  getAccountBalanceAsOf(
    tenantId: string,
    accountCode: string,
    asOfDate: string
  ): Promise<StorageResult<{ accountCode: string; debitTotal: number; creditTotal: number; balance: number; asOfDate: string }>>;

  // Atomic Journal Posting Operations
  createJournalEntry(
    tenantId: string,
    entry: JournalEntry,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>>;

  postJournalEntry(
    tenantId: string,
    entryId: string,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>>;

  reverseJournalEntry(
    tenantId: string,
    entryId: string,
    reason: string,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>>;

  getJournalEntry(tenantId: string, entryId: string): Promise<StorageResult<JournalEntry>>;
  listJournalEntries(tenantId: string): Promise<StorageResult<JournalEntry[]>>;

  // Atomic Numbering & Override (2C)
  nextSequence(
    tenantId: string,
    sequenceKey: string,
    prefix: string,
    idempotencyKey: string
  ): Promise<StorageResult<SequenceResult>>;

  overrideSequence(
    tenantId: string,
    sequenceKey: string,
    manualNumber: number,
    reason: string,
    authorizedBy: string,
    idempotencyKey: string
  ): Promise<StorageResult<SequenceResult>>;

  // Approval Workflow
  createApprovalRequest(
    tenantId: string,
    request: ApprovalRequest,
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>>;
  
  approveStep(
    tenantId: string,
    requestId: string,
    approverId: string,
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>>;

  // System Change Log (Immutable Ledger on Primary)
  appendSystemChangeLog(entry: SystemChangeLogEntry): Promise<StorageResult<SystemChangeLogEntry>>;
  getSystemChangeLogs(): Promise<StorageResult<SystemChangeLogEntry[]>>;

  // Session & Refresh Token Storage
  saveTokenFamily(family: TokenFamily): Promise<StorageResult<TokenFamily>>;
  getTokenFamily(familyId: string): Promise<StorageResult<TokenFamily>>;
  saveRefreshToken(record: RefreshTokenRecord): Promise<StorageResult<RefreshTokenRecord>>;
  getRefreshToken(tokenHash: string): Promise<StorageResult<RefreshTokenRecord>>;
  updateRefreshToken(record: RefreshTokenRecord): Promise<StorageResult<RefreshTokenRecord>>;
  invalidateTokenFamily(familyId: string, reason: string): Promise<StorageResult<boolean>>;

  // Phase 2: Module Manifest Management (2H)
  getTenantModules(tenantId: string): Promise<StorageResult<TenantModuleManifest[]>>;
  enableTenantModules(tenantId: string, modules: TenantModuleManifest[], idempotencyKey: string): Promise<StorageResult<TenantModuleManifest[]>>;

  // Phase 2: Master Data with Dual-Control (2F)
  saveMasterItem(tenantId: string, item: MasterItem, idempotencyKey: string): Promise<StorageResult<MasterItem>>;
  getMasterItem(tenantId: string, itemId: string): Promise<StorageResult<MasterItem>>;
  listMasterItems(tenantId: string): Promise<StorageResult<MasterItem[]>>;
  approveMasterItem(tenantId: string, itemId: string, approverId: string, idempotencyKey: string): Promise<StorageResult<MasterItem>>;

  saveMasterPartner(tenantId: string, partner: MasterPartner, idempotencyKey: string): Promise<StorageResult<MasterPartner>>;
  getMasterPartner(tenantId: string, partnerId: string): Promise<StorageResult<MasterPartner>>;
  listMasterPartners(tenantId: string, type?: 'CUSTOMER' | 'VENDOR'): Promise<StorageResult<MasterPartner[]>>;
  approveMasterPartner(tenantId: string, partnerId: string, approverId: string, idempotencyKey: string): Promise<StorageResult<MasterPartner>>;

  // Phase 2: Tamper-Evident Hash-Chained Audit Trail (2G & 2E)
  appendAuditChain(tenantId: string, entry: Omit<AuditChainEntry, 'sequenceNumber' | 'previousHash' | 'entryHash'>): Promise<StorageResult<AuditChainEntry>>;
  getAuditChain(tenantId: string, limit?: number): Promise<StorageResult<AuditChainEntry[]>>;
  verifyAuditChain(tenantId: string): Promise<StorageResult<{ isValid: boolean; verifiedRecordsCount: number; brokenAtSequence?: number; messageAr: string }>>;

  // Phase 2: Country Tax Rules (2A)
  getCountryTaxRule(countryCode: string): Promise<StorageResult<CountryTaxRule>>;
  listCountryTaxRules(): Promise<StorageResult<CountryTaxRule[]>>;
  upsertCountryTaxRule(rule: CountryTaxRule): Promise<StorageResult<CountryTaxRule>>;

  // Tenant Scoping & Isolation
  withTenantScope<T>(tenantId: string, fn: () => Promise<T>): Promise<T>;
}
