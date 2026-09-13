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
  createdAt: string;
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
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  currency: string;
  debitBalance: number;
  creditBalance: number;
  isActive: boolean;
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
  changeType: 'SCHEMA_MIGRATION' | 'PHASE_CLOSURE' | 'STORAGE_CONFIG' | 'ENGINE_POST' | 'SOD_ENFORCEMENT';
  module: string;
  entitiesAffected: string[];
  summaryAr: string;
  beforeState?: any;
  afterState?: any;
  evidenceRef?: string;
  version: string;
}

export interface StoragePort {
  readonly adapterName: string;

  // Tenant / Company Aggregates
  getTenant(tenantId: string): Promise<StorageResult<TenantCompany>>;
  saveTenant(tenant: TenantCompany, idempotencyKey: string): Promise<StorageResult<TenantCompany>>;

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

  // Atomic Journal Posting Operations
  /**
   * PRECONDITION: Entry lines must be non-empty. Debits must equal credits. Accounts must exist.
   * POSTCONDITION: Entry created in status DRAFT or PENDING_APPROVAL without mutating account balances.
   */
  createJournalEntry(
    tenantId: string,
    entry: JournalEntry,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>>;

  /**
   * PRECONDITION: Entry must exist, be in status APPROVED/PENDING_POST, and balanced (Total Debit == Total Credit).
   * POSTCONDITION: Atomic execution updating account balances and setting Entry status to POSTED.
   *                Compensating transaction or DB rollback occurs if any sub-operation fails.
   */
  postJournalEntry(
    tenantId: string,
    entryId: string,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>>;

  /**
   * PRECONDITION: Original entry must be in status POSTED.
   * POSTCONDITION: Creates and posts an inverse journal entry. Sets original status to REVERSED.
   */
  reverseJournalEntry(
    tenantId: string,
    entryId: string,
    reason: string,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>>;

  getJournalEntry(tenantId: string, entryId: string): Promise<StorageResult<JournalEntry>>;
  listJournalEntries(tenantId: string): Promise<StorageResult<JournalEntry[]>>;

  // Atomic Numbering
  nextSequence(
    tenantId: string,
    sequenceKey: string,
    prefix: string,
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

  // Session & Refresh Token Storage (Zero internal class Map state)
  saveTokenFamily(family: TokenFamily): Promise<StorageResult<TokenFamily>>;
  getTokenFamily(familyId: string): Promise<StorageResult<TokenFamily>>;
  saveRefreshToken(record: RefreshTokenRecord): Promise<StorageResult<RefreshTokenRecord>>;
  getRefreshToken(tokenHash: string): Promise<StorageResult<RefreshTokenRecord>>;
  updateRefreshToken(record: RefreshTokenRecord): Promise<StorageResult<RefreshTokenRecord>>;
  invalidateTokenFamily(familyId: string, reason: string): Promise<StorageResult<boolean>>;

  // Tenant Scoping & Isolation
  withTenantScope<T>(tenantId: string, fn: () => Promise<T>): Promise<T>;
}
