/**
 * @file InMemoryAdapter.ts
 * @description In-Memory Storage Adapter for local interface development only.
 * EXPLICIT NOTICE: Strictly forbidden for closing Phase isolation or persistence batteries.
 */

import {
  StoragePort,
  StorageResult,
  TenantCompany,
  User,
  Account,
  JournalEntry,
  SequenceResult,
  ApprovalRequest,
  SystemChangeLogEntry,
  TokenFamily,
  RefreshTokenRecord,
} from '../StoragePort';

export class InMemoryAdapter implements StoragePort {
  readonly adapterName = 'InMemoryAdapter (Development Only - Non-Persistent)';

  private tenants = new Map<string, TenantCompany>();
  private users = new Map<string, User>();
  private accounts = new Map<string, Account>();
  private journalEntries = new Map<string, JournalEntry>();
  private sequences = new Map<string, number>();
  private approvalRequests = new Map<string, ApprovalRequest>();
  private changeLogs: SystemChangeLogEntry[] = [];
  private idempotencyRecords = new Map<string, any>();
  private tokenFamilies = new Map<string, TokenFamily>();
  private refreshTokens = new Map<string, RefreshTokenRecord>();

  constructor() {
    this.seedDefaultData();
  }

  private seedDefaultData() {
    const defaultTenant: TenantCompany = {
      id: 'tenant-main',
      code: 'CMP-001',
      nameAr: 'شركة الأعمال الموحدة القابضة',
      nameEn: 'Unified Business Holding Co.',
      taxNumber: '300128472900003',
      backendConfig: {
        adapterType: 'inmemory',
        connectionRef: 'IN_MEMORY_LOCAL',
        isolationLevel: 'Shared',
      },
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    this.tenants.set(defaultTenant.id, defaultTenant);

    const defaultAccounts: Account[] = [
      {
        code: '110101',
        tenantId: 'tenant-main',
        nameAr: 'الصندوق الرئيسي - الرياض',
        type: 'ASSET',
        currency: 'SAR',
        debitBalance: 500000,
        creditBalance: 0,
        isActive: true,
      },
      {
        code: '110201',
        tenantId: 'tenant-main',
        nameAr: 'بنك الراجحي - الحساب الجاري',
        type: 'ASSET',
        currency: 'SAR',
        debitBalance: 1250000,
        creditBalance: 0,
        isActive: true,
      },
      {
        code: '520101',
        tenantId: 'tenant-main',
        nameAr: 'مصروفات الصيانة والتشغيل',
        type: 'EXPENSE',
        currency: 'SAR',
        debitBalance: 45000,
        creditBalance: 0,
        isActive: true,
      },
      {
        code: '410101',
        tenantId: 'tenant-main',
        nameAr: 'إيرادات المبيعات العامة',
        type: 'REVENUE',
        currency: 'SAR',
        debitBalance: 0,
        creditBalance: 1795000,
        isActive: true,
      },
    ];

    for (const acc of defaultAccounts) {
      this.accounts.set(`${acc.tenantId}:${acc.code}`, acc);
    }
  }

  public async getTenant(tenantId: string): Promise<StorageResult<TenantCompany>> {
    const t = this.tenants.get(tenantId);
    if (!t) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/tenant-not-found',
          title: 'المستأجر غير موجود',
          status: 404,
          detail: `تعذر العثور على الشركة برقم ${tenantId}`,
        },
      };
    }
    return { success: true, data: t };
  }

  public async saveTenant(tenant: TenantCompany, idempotencyKey: string): Promise<StorageResult<TenantCompany>> {
    this.tenants.set(tenant.id, tenant);
    return { success: true, data: tenant };
  }

  public async getUser(tenantId: string, userId: string): Promise<StorageResult<User>> {
    const u = this.users.get(`${tenantId}:${userId}`);
    if (!u) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/user-not-found',
          title: 'المستخدم غير موجود',
          status: 404,
          detail: `المستخدم ${userId} غير مسجل للشركة ${tenantId}`,
        },
      };
    }
    return { success: true, data: u };
  }

  public async saveUser(user: User, idempotencyKey: string): Promise<StorageResult<User>> {
    this.users.set(`${user.tenantId}:${user.id}`, user);
    return { success: true, data: user };
  }

  public async getAccount(tenantId: string, accountCode: string): Promise<StorageResult<Account>> {
    const acc = this.accounts.get(`${tenantId}:${accountCode}`);
    if (!acc) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/account-not-found',
          title: 'الحساب غير موجود',
          status: 404,
          detail: `تعذر العثور على الحساب ${accountCode}`,
        },
      };
    }
    return { success: true, data: acc };
  }

  public async saveAccount(tenantId: string, account: Account, idempotencyKey: string): Promise<StorageResult<Account>> {
    this.accounts.set(`${tenantId}:${account.code}`, account);
    return { success: true, data: account };
  }

  public async getAccountBalance(
    tenantId: string,
    accountCode: string
  ): Promise<StorageResult<{ accountCode: string; debitTotal: number; creditTotal: number; balance: number }>> {
    const res = await this.getAccount(tenantId, accountCode);
    if (!res.success || !res.data) return { success: false, error: res.error };
    const acc = res.data;
    return {
      success: true,
      data: {
        accountCode: acc.code,
        debitTotal: acc.debitBalance,
        creditTotal: acc.creditBalance,
        balance: acc.debitBalance - acc.creditBalance,
      },
    };
  }

  public async createJournalEntry(
    tenantId: string,
    entry: JournalEntry,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>> {
    if (this.idempotencyRecords.has(idempotencyKey)) {
      return { success: true, data: this.idempotencyRecords.get(idempotencyKey) };
    }
    this.journalEntries.set(`${tenantId}:${entry.id}`, entry);
    this.idempotencyRecords.set(idempotencyKey, entry);
    return { success: true, data: entry };
  }

  public async postJournalEntry(
    tenantId: string,
    entryId: string,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>> {
    if (this.idempotencyRecords.has(idempotencyKey)) {
      return { success: true, data: this.idempotencyRecords.get(idempotencyKey) };
    }

    const entry = this.journalEntries.get(`${tenantId}:${entryId}`);
    if (!entry) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/entry-not-found',
          title: 'السند غير موجود',
          status: 404,
          detail: `تعذر العثور على القيد ${entryId}`,
        },
      };
    }

    // Atomic in-memory balance mutation
    for (const line of entry.lines) {
      const accKey = `${tenantId}:${line.accountCode}`;
      const acc = this.accounts.get(accKey);
      if (!acc) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/account-not-found',
            title: 'الحساب غير موجود',
            status: 404,
            detail: `الحساب ${line.accountCode} غير موجود في الدليل المحاسبي.`,
          },
        };
      }
      acc.debitBalance += line.debit;
      acc.creditBalance += line.credit;
    }

    entry.status = 'POSTED';
    entry.postedAt = new Date().toISOString();

    this.idempotencyRecords.set(idempotencyKey, entry);
    return { success: true, data: entry };
  }

  public async reverseJournalEntry(
    tenantId: string,
    entryId: string,
    reason: string,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>> {
    const entry = this.journalEntries.get(`${tenantId}:${entryId}`);
    if (!entry) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/entry-not-found',
          title: 'السند غير موجود',
          status: 404,
          detail: `تعذر العثور على القيد ${entryId}`,
        },
      };
    }

    const reversal: JournalEntry = {
      id: `REV-${Date.now()}`,
      code: `REV-${entry.code}`,
      tenantId,
      date: new Date().toISOString().split('T')[0],
      type: 'قيد عكسي',
      description: `قيد تسوية وعكس للسند رقم ${entry.code}. السبب: ${reason}`,
      lines: entry.lines.map((l, i) => ({
        ...l,
        id: `${entry.id}-REV-${i}`,
        debit: l.credit,
        credit: l.debit,
      })),
      totalAmount: entry.totalAmount,
      status: 'APPROVED',
      createdBy: 'SYSTEM_REVERSAL',
    };

    await this.createJournalEntry(tenantId, reversal, `${idempotencyKey}-c`);
    await this.postJournalEntry(tenantId, reversal.id, `${idempotencyKey}-p`);

    entry.status = 'REVERSED';
    entry.reversedByEntryId = reversal.id;

    return { success: true, data: reversal };
  }

  public async getJournalEntry(tenantId: string, entryId: string): Promise<StorageResult<JournalEntry>> {
    const entry = this.journalEntries.get(`${tenantId}:${entryId}`);
    if (!entry) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/entry-not-found',
          title: 'السند غير موجود',
          status: 404,
          detail: `تعذر العثور على القيد ${entryId}`,
        },
      };
    }
    return { success: true, data: entry };
  }

  public async listJournalEntries(tenantId: string): Promise<StorageResult<JournalEntry[]>> {
    const entries = Array.from(this.journalEntries.values()).filter((e) => e.tenantId === tenantId);
    return { success: true, data: entries };
  }

  public async nextSequence(
    tenantId: string,
    sequenceKey: string,
    prefix: string,
    idempotencyKey: string
  ): Promise<StorageResult<SequenceResult>> {
    const k = `${tenantId}:${sequenceKey}`;
    const curr = (this.sequences.get(k) || 0) + 1;
    this.sequences.set(k, curr);
    return {
      success: true,
      data: {
        sequenceNumber: curr,
        formattedCode: `${prefix}-${String(curr).padStart(6, '0')}`,
      },
    };
  }

  public async createApprovalRequest(
    tenantId: string,
    request: ApprovalRequest,
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>> {
    this.approvalRequests.set(`${tenantId}:${request.id}`, request);
    return { success: true, data: request };
  }

  public async approveStep(
    tenantId: string,
    requestId: string,
    approverId: string,
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>> {
    const req = this.approvalRequests.get(`${tenantId}:${requestId}`);
    if (!req) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/request-not-found',
          title: 'طلب الاعتماد غير موجود',
          status: 404,
          detail: `تعذر العثور على طلب الاعتماد ${requestId}`,
        },
      };
    }
    req.status = 'APPROVED';
    if (req.steps[0]) {
      req.steps[0].status = 'APPROVED';
      req.steps[0].approverId = approverId;
      req.steps[0].actionTimestamp = new Date().toISOString();
    }
    return { success: true, data: req };
  }

  public async appendSystemChangeLog(entry: SystemChangeLogEntry): Promise<StorageResult<SystemChangeLogEntry>> {
    this.changeLogs.push(entry);
    return { success: true, data: entry };
  }

  public async getSystemChangeLogs(): Promise<StorageResult<SystemChangeLogEntry[]>> {
    return { success: true, data: [...this.changeLogs].reverse() };
  }

  // Session & Refresh Tokens (InMemory development implementation)
  public async saveTokenFamily(family: TokenFamily): Promise<StorageResult<TokenFamily>> {
    this.tokenFamilies.set(family.familyId, { ...family });
    return { success: true, data: family };
  }

  public async getTokenFamily(familyId: string): Promise<StorageResult<TokenFamily>> {
    const family = this.tokenFamilies.get(familyId);
    if (!family) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/token-family-not-found',
          title: 'عائلة التوكن غير موجودة',
          status: 404,
          detail: `تعذر العثور على عائلة الجلسة ${familyId}`,
        },
      };
    }
    return { success: true, data: { ...family } };
  }

  public async saveRefreshToken(record: RefreshTokenRecord): Promise<StorageResult<RefreshTokenRecord>> {
    this.refreshTokens.set(record.tokenHash, { ...record });
    return { success: true, data: record };
  }

  public async getRefreshToken(tokenHash: string): Promise<StorageResult<RefreshTokenRecord>> {
    const record = this.refreshTokens.get(tokenHash);
    if (!record) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/refresh-token-not-found',
          title: 'رمز التحديث غير موجود',
          status: 404,
          detail: 'رمز التحديث غير مسجل أو منتهي',
        },
      };
    }
    return { success: true, data: { ...record } };
  }

  public async updateRefreshToken(record: RefreshTokenRecord): Promise<StorageResult<RefreshTokenRecord>> {
    this.refreshTokens.set(record.tokenHash, { ...record });
    return { success: true, data: record };
  }

  public async invalidateTokenFamily(familyId: string, reason: string): Promise<StorageResult<boolean>> {
    const family = this.tokenFamilies.get(familyId);
    if (family) {
      family.isInvalidated = true;
      family.invalidationReason = reason;
    }
    return { success: true, data: true };
  }

  public async withTenantScope<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}
