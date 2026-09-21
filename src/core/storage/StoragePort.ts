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
  crNumber?: string;
  taxNumber?: string;
  baseCurrency?: string;
  country?: string;
  auditRetentionPolicyYears?: number;
  backendConfig: BackendConfig;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt?: string;
}

export type CompanyProfile = TenantCompany;

export interface GeoLocation {
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export interface LoginAttemptRecord {
  userId: string;
  tenantId?: string;
  location: GeoLocation;
  ip: string;
  timestamp: number;
}

export interface FailedAttemptRecord {
  userId: string;
  count: number;
  lockedUntil?: number;
  updatedAt: number;
}

export interface ActiveSessionRecord {
  sessionId: string;
  userId: string;
  tenantId?: string;
  username: string;
  fullName: string;
  role: string;
  deviceType: string;
  ipAddress: string;
  location: GeoLocation;
  familyId?: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface User {
  id: string;
  tenantId: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  roleTitleAr?: string;
  branchName?: string;
  status: 'ACTIVE' | 'INACTIVE';
  passwordHash?: string;
  twoFactorSecret?: string;
  twoFactorEnabled?: boolean;
  backupCodes?: string[];
  hashedBackupCodes?: string[];
  permissions?: string[];
  assignedNodeId?: string;
  requiresPasswordChange?: boolean;
  encryptedPii?: { iv: string; tag: string; data: string } | string;
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

export interface BreakGlassDetails {
  executed: boolean;
  actor1Id: string;
  actor1Role: string;
  actor2Id: string;
  actor2Role: string;
  reasonAr: string;
  ticketRef: string;
  executedAt: string;
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
  breakGlass?: BreakGlassDetails;
}

export interface SystemChangeLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  changeType: 'SCHEMA_MIGRATION' | 'PHASE_CLOSURE' | 'STORAGE_CONFIG' | 'ENGINE_POST' | 'SOD_ENFORCEMENT' | 'MIGRATION' | 'NUMBERING_OVERRIDE' | 'SECURITY' | 'Security' | 'ANONYMIZATION' | 'CANARY_ALERT' | 'BREAK_GLASS' | 'PLATFORM_MANAGEMENT';
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

// Phase 5: Cash Custody Module (1 of 15)
export type CustodyStatus = 'OPEN' | 'SETTLED' | 'CLOSED' | 'LIQUIDATED';
export type CustodyTransactionStatus = 'RECORDED' | 'INCLUDED_IN_SETTLEMENT' | 'REJECTED';
export type CustodySettlementStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type CustodyVarianceType = 'NONE' | 'SURPLUS' | 'DEFICIT';

export interface CashCustody {
  id: string;
  tenantId: string;
  companyId: string;
  custodyCode: string;
  employeeId: string;
  employeeName: string;
  branchId?: string;
  branchName?: string;
  costCenterId: string;
  costCenterName?: string;
  currency: string;
  allocatedAmount: number;
  currentBalance: number;
  maxLimitPerRole: number;
  status: CustodyStatus;
  openedBy: string;
  openedByName: string;
  openedAt: string;
  closedAt?: string;
  closedBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashCustodyTransaction {
  id: string;
  tenantId: string;
  companyId: string;
  transactionCode: string;
  custodyId: string;
  amount: number;
  expenseCategory: string;
  expenseAccountCode: string;
  description: string;
  receiptNumber: string;
  attachmentUrl: string;
  attachmentName?: string;
  costCenterId?: string;
  recordedBy: string;
  recordedByName: string;
  status: CustodyTransactionStatus;
  settlementId?: string;
  transactionDate: string;
  createdAt: string;
  idempotencyKey: string;
}

export interface CashCustodySettlement {
  id: string;
  tenantId: string;
  companyId: string;
  settlementCode: string;
  custodyId: string;
  settlementDate: string;
  totalExpenses: number;
  replenishmentAmount: number;
  varianceAmount: number;
  varianceType: CustodyVarianceType;
  journalEntryId?: string;
  status: CustodySettlementStatus;
  settledBy: string;
  settledByName: string;
  notes?: string;
  createdAt: string;
  idempotencyKey: string;
}

// Phase 6: Expenses Module (2 of 15)
export type ExpenseRequestStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED_L1' | 'APPROVED' | 'REJECTED' | 'POSTED';
export type ExpenseApprovalTier = 'L1' | 'L2' | 'COMPLETED';
export type ExpensePaymentMethod = 'DIRECT_BANK_TRANSFER' | 'CHEQUE' | 'EMPLOYEE_REIMBURSEMENT';

export interface ExpenseCategory {
  id: string;
  tenantId: string;
  companyId: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  defaultAccountCode: string;
  requiresAttachment: boolean;
  attachmentThresholdAmount: number;
  isActive: boolean;
  createdAt: string;
}

export interface ExpenseLine {
  id: string;
  tenantId: string;
  companyId: string;
  requestId: string;
  categoryId: string;
  categoryNameAr: string;
  expenseAccountCode: string;
  description: string;
  amount: number;
  costCenterId?: string;
  projectId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  createdAt: string;
}

export interface ExpenseAttachment {
  id: string;
  tenantId: string;
  companyId: string;
  requestId: string;
  lineId?: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ExpenseRequest {
  id: string;
  tenantId: string;
  companyId: string;
  requestCode: string;
  titleAr: string;
  employeeId: string;
  employeeName: string;
  department?: string;
  costCenterId?: string;
  projectId?: string;
  totalAmount: number;
  currency: string;
  paymentMethod: ExpensePaymentMethod;
  disbursementAccountCode?: string;
  status: ExpenseRequestStatus;
  currentApprovalTier: ExpenseApprovalTier;
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  approvedL1By?: string;
  approvedL1ByName?: string;
  approvedL1At?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedByName?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  journalEntryId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  idempotencyKey?: string;
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

// Phase 3A: Organizational Hierarchy Types
export type OrgNodeType = 'REGION' | 'SITE' | 'BRANCH' | 'DEPARTMENT';

export interface OrgNode {
  id: string;
  tenantId: string;
  type: OrgNodeType;
  code: string;
  nameAr: string;
  nameEn?: string;
  parentId?: string | null;
  managerUserId?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt?: string;
}

// Phase 4.5: Operational Audit & Custom Fields Persistence (4.5E)
export interface CustomFieldDefinition {
  id: string;
  tenantId: string;
  module: string;
  fieldKey: string;
  fieldLabelAr: string;
  fieldType: string;
  isRequired: boolean;
  options?: string[];
}

export interface OperationalAuditRecord {
  id: string;
  tenantId: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: any;
  ipAddress?: string;
  timestamp: string;
}

export interface StoragePort {
  readonly adapterName: string;

  // Tenant / Company Aggregates
  getTenant(tenantId: string): Promise<StorageResult<TenantCompany>>;
  saveTenant(tenant: TenantCompany, idempotencyKey: string): Promise<StorageResult<TenantCompany>>;
  listTenants(): Promise<StorageResult<TenantCompany[]>>;

  // Users & RBAC
  getUser(tenantId: string, userId: string): Promise<StorageResult<User>>;
  getUserByUsername(tenantId: string, username: string): Promise<StorageResult<User>>;
  getUserById(userId: string): Promise<StorageResult<User>>;
  listUsers(tenantId?: string): Promise<StorageResult<User[]>>;
  saveUser(user: User, idempotencyKey: string): Promise<StorageResult<User>>;
  updateUser(userId: string, updates: Partial<User>): Promise<StorageResult<User>>;

  // Login Attempts & Security Tracking (Anomaly Detection & Lockout)
  getLastSuccessfulLogin(userId: string): Promise<StorageResult<LoginAttemptRecord | null>>;
  recordSuccessfulLogin(record: LoginAttemptRecord): Promise<StorageResult<void>>;
  getFailedLoginAttempts(userId: string): Promise<StorageResult<FailedAttemptRecord | null>>;
  recordFailedLoginAttempt(userId: string, count: number, lockedUntil?: number): Promise<StorageResult<void>>;
  clearFailedLoginAttempts(userId: string): Promise<StorageResult<void>>;

  // Active Sessions
  saveActiveSession(session: ActiveSessionRecord): Promise<StorageResult<ActiveSessionRecord>>;
  getActiveSession(sessionId: string): Promise<StorageResult<ActiveSessionRecord | null>>;
  listActiveSessionsByUser(userId: string): Promise<StorageResult<ActiveSessionRecord[]>>;
  listActiveSessions(tenantId: string): Promise<StorageResult<ActiveSessionRecord[]>>;
  deleteActiveSession(sessionId: string): Promise<StorageResult<void>>;

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

  // Phase 3A: Organizational Hierarchy
  saveOrgNode(tenantId: string, node: OrgNode, idempotencyKey: string): Promise<StorageResult<OrgNode>>;
  getOrgNode(tenantId: string, nodeId: string): Promise<StorageResult<OrgNode>>;
  listOrgHierarchy(tenantId: string, rootNodeId?: string): Promise<StorageResult<OrgNode[]>>;
  getUserVisibleNodes(tenantId: string, userAssignedNodeId: string): Promise<StorageResult<OrgNode[]>>;

  // Phase 3C: Break-Glass Approval Workflow
  approveBreakGlass(tenantId: string, requestId: string, breakGlass: BreakGlassDetails, idempotencyKey: string): Promise<StorageResult<ApprovalRequest>>;

  // Phase 3E: Privacy & Right to be Forgotten
  anonymizeUserPii(tenantId: string, userId: string, actorId: string, idempotencyKey: string): Promise<StorageResult<{ userId: string; anonymizedAt: string }>>;

  // Phase 4.5: Operational Audit & Custom Fields Persistence (4.5E)
  saveAuditRecord(record: OperationalAuditRecord): Promise<StorageResult<OperationalAuditRecord>>;
  getAuditRecords(tenantId: string, limit?: number): Promise<StorageResult<OperationalAuditRecord[]>>;
  saveCustomField(tenantId: string, field: CustomFieldDefinition): Promise<StorageResult<CustomFieldDefinition>>;
  getCustomFields(tenantId: string, module?: string): Promise<StorageResult<CustomFieldDefinition[]>>;
  checkIdempotencyRecord(tenantId: string, key: string, operation: string): Promise<StorageResult<any | null>>;
  saveIdempotencyRecord(tenantId: string, key: string, operation: string, payload: any): Promise<StorageResult<void>>;

  // Phase 5: Cash Custody Module Operations (1 of 15)
  createCashCustody(tenantId: string, custody: CashCustody, idempotencyKey: string): Promise<StorageResult<CashCustody>>;
  getCashCustody(tenantId: string, custodyId: string): Promise<StorageResult<CashCustody | null>>;
  listCashCustodies(tenantId: string, filter?: { status?: string; employeeId?: string }): Promise<StorageResult<CashCustody[]>>;
  updateCashCustody(tenantId: string, custodyId: string, updates: Partial<CashCustody>): Promise<StorageResult<CashCustody>>;
  recordCustodyExpense(tenantId: string, transaction: CashCustodyTransaction, idempotencyKey: string): Promise<StorageResult<CashCustodyTransaction>>;
  listCustodyTransactions(tenantId: string, custodyId?: string): Promise<StorageResult<CashCustodyTransaction[]>>;
  saveCustodySettlement(tenantId: string, settlement: CashCustodySettlement, idempotencyKey: string): Promise<StorageResult<CashCustodySettlement>>;
  listCustodySettlements(tenantId: string, custodyId?: string): Promise<StorageResult<CashCustodySettlement[]>>;

  // Phase 6: Expenses Module Operations (2 of 15)
  createExpenseRequest(tenantId: string, request: ExpenseRequest, lines: ExpenseLine[], attachments: ExpenseAttachment[], idempotencyKey: string): Promise<StorageResult<ExpenseRequest>>;
  getExpenseRequest(tenantId: string, requestId: string): Promise<StorageResult<{ request: ExpenseRequest; lines: ExpenseLine[]; attachments: ExpenseAttachment[] } | null>>;
  listExpenseRequests(tenantId: string, filter?: { status?: string; employeeId?: string }): Promise<StorageResult<ExpenseRequest[]>>;
  updateExpenseRequestStatus(tenantId: string, requestId: string, updates: Partial<ExpenseRequest>, idempotencyKey: string): Promise<StorageResult<ExpenseRequest>>;
  listExpenseCategories(tenantId: string): Promise<StorageResult<ExpenseCategory[]>>;
  saveExpenseCategory(tenantId: string, category: ExpenseCategory, idempotencyKey: string): Promise<StorageResult<ExpenseCategory>>;

  // Tenant Scoping & Isolation
  withTenantScope<T>(tenantId: string, fn: () => Promise<T>): Promise<T>;
}
