/**
 * @file MySQLSmokeAdapter.ts
 * @description MySQL Storage Adapter for A.N ERP (Phase 0 Smoke Test)
 * Uses official 'mysql2/promise' library.
 * Reads connection from process.env.MYSQL_URL.
 */

import mysql, { Pool } from 'mysql2/promise';
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
  CountryTaxRule,
  TenantModuleManifest,
  MasterItem,
  MasterPartner,
  AuditChainEntry,
} from '../StoragePort';

export interface SmokeTestResult {
  adapter: string;
  passed: boolean;
  message: string;
  evidence?: any;
  error?: string;
  missingSecrets?: string[];
}

export class MySQLSmokeAdapter implements StoragePort {
  readonly adapterName = 'MySQL Adapter';
  private pool: Pool | null = null;

  constructor(private readonly connectionUrl?: string) {
    const url = connectionUrl || process.env.MYSQL_URL;
    if (url) {
      try {
        this.pool = mysql.createPool(url);
      } catch (e) {
        this.pool = null;
      }
    }
  }

  private smokeOnlyError<T>(action: string): Promise<StorageResult<T>> {
    return Promise.resolve({
      success: false,
      error: {
        type: 'https://api.an-erp.local/errors/smoke-only',
        title: 'الـ Adapter في وضع Smoke Test',
        status: 501,
        detail: `العملية (${action}) غير متاحة على ${this.adapterName} لأنه في وضع فحص الاتصال الأولي (Smoke Test) فقط ولم يستوفِ البطارية الكاملة بعد.`,
      },
    });
  }

  // StoragePort Implementation
  getTenant(tenantId: string) { return this.smokeOnlyError<TenantCompany>('getTenant'); }
  saveTenant(tenant: TenantCompany, idempotencyKey: string) { return this.smokeOnlyError<TenantCompany>('saveTenant'); }
  listTenants() { return this.smokeOnlyError<TenantCompany[]>('listTenants'); }
  getUser(tenantId: string, userId: string) { return this.smokeOnlyError<User>('getUser'); }
  saveUser(user: User, idempotencyKey: string) { return this.smokeOnlyError<User>('saveUser'); }
  getAccount(tenantId: string, accountCode: string) { return this.smokeOnlyError<Account>('getAccount'); }
  saveAccount(tenantId: string, account: Account, idempotencyKey: string) { return this.smokeOnlyError<Account>('saveAccount'); }
  getAccountBalance(tenantId: string, accountCode: string) { return this.smokeOnlyError<{ accountCode: string; debitTotal: number; creditTotal: number; balance: number }>('getAccountBalance'); }
  getAccountBalanceAsOf(tenantId: string, accountCode: string, asOfDate: string) { return this.smokeOnlyError<{ accountCode: string; debitTotal: number; creditTotal: number; balance: number; asOfDate: string }>('getAccountBalanceAsOf'); }
  createJournalEntry(tenantId: string, entry: JournalEntry, idempotencyKey: string) { return this.smokeOnlyError<JournalEntry>('createJournalEntry'); }
  postJournalEntry(tenantId: string, entryId: string, idempotencyKey: string) { return this.smokeOnlyError<JournalEntry>('postJournalEntry'); }
  reverseJournalEntry(tenantId: string, entryId: string, reason: string, idempotencyKey: string) { return this.smokeOnlyError<JournalEntry>('reverseJournalEntry'); }
  getJournalEntry(tenantId: string, entryId: string) { return this.smokeOnlyError<JournalEntry>('getJournalEntry'); }
  listJournalEntries(tenantId: string) { return this.smokeOnlyError<JournalEntry[]>('listJournalEntries'); }
  nextSequence(tenantId: string, sequenceKey: string, prefix: string, idempotencyKey: string) { return this.smokeOnlyError<SequenceResult>('nextSequence'); }
  overrideSequence(tenantId: string, sequenceKey: string, manualNumber: number, reason: string, authorizedBy: string, idempotencyKey: string) { return this.smokeOnlyError<SequenceResult>('overrideSequence'); }
  createApprovalRequest(tenantId: string, request: ApprovalRequest, idempotencyKey: string) { return this.smokeOnlyError<ApprovalRequest>('createApprovalRequest'); }
  approveStep(tenantId: string, requestId: string, approverId: string, idempotencyKey: string) { return this.smokeOnlyError<ApprovalRequest>('approveStep'); }
  appendSystemChangeLog(entry: SystemChangeLogEntry) { return this.smokeOnlyError<SystemChangeLogEntry>('appendSystemChangeLog'); }
  getSystemChangeLogs() { return this.smokeOnlyError<SystemChangeLogEntry[]>('getSystemChangeLogs'); }
  saveTokenFamily(family: TokenFamily) { return this.smokeOnlyError<TokenFamily>('saveTokenFamily'); }
  getTokenFamily(familyId: string) { return this.smokeOnlyError<TokenFamily>('getTokenFamily'); }
  saveRefreshToken(record: RefreshTokenRecord) { return this.smokeOnlyError<RefreshTokenRecord>('saveRefreshToken'); }
  getRefreshToken(tokenHash: string) { return this.smokeOnlyError<RefreshTokenRecord>('getRefreshToken'); }
  updateRefreshToken(record: RefreshTokenRecord) { return this.smokeOnlyError<RefreshTokenRecord>('updateRefreshToken'); }
  invalidateTokenFamily(familyId: string, reason: string) { return this.smokeOnlyError<boolean>('invalidateTokenFamily'); }
  getTenantModules(tenantId: string) { return this.smokeOnlyError<TenantModuleManifest[]>('getTenantModules'); }
  enableTenantModules(tenantId: string, modules: TenantModuleManifest[], idempotencyKey: string) { return this.smokeOnlyError<TenantModuleManifest[]>('enableTenantModules'); }
  saveMasterItem(tenantId: string, item: MasterItem, idempotencyKey: string) { return this.smokeOnlyError<MasterItem>('saveMasterItem'); }
  getMasterItem(tenantId: string, itemId: string) { return this.smokeOnlyError<MasterItem>('getMasterItem'); }
  listMasterItems(tenantId: string) { return this.smokeOnlyError<MasterItem[]>('listMasterItems'); }
  approveMasterItem(tenantId: string, itemId: string, approverId: string, idempotencyKey: string) { return this.smokeOnlyError<MasterItem>('approveMasterItem'); }
  saveMasterPartner(tenantId: string, partner: MasterPartner, idempotencyKey: string) { return this.smokeOnlyError<MasterPartner>('saveMasterPartner'); }
  getMasterPartner(tenantId: string, partnerId: string) { return this.smokeOnlyError<MasterPartner>('getMasterPartner'); }
  listMasterPartners(tenantId: string, type?: 'CUSTOMER' | 'VENDOR') { return this.smokeOnlyError<MasterPartner[]>('listMasterPartners'); }
  approveMasterPartner(tenantId: string, partnerId: string, approverId: string, idempotencyKey: string) { return this.smokeOnlyError<MasterPartner>('approveMasterPartner'); }
  appendAuditChain(tenantId: string, entry: Omit<AuditChainEntry, 'sequenceNumber' | 'previousHash' | 'entryHash'>) { return this.smokeOnlyError<AuditChainEntry>('appendAuditChain'); }
  getAuditChain(tenantId: string, limit?: number) { return this.smokeOnlyError<AuditChainEntry[]>('getAuditChain'); }
  verifyAuditChain(tenantId: string) { return this.smokeOnlyError<{ isValid: boolean; verifiedRecordsCount: number; brokenAtSequence?: number; messageAr: string }>('verifyAuditChain'); }
  getCountryTaxRule(countryCode: string) { return this.smokeOnlyError<CountryTaxRule>('getCountryTaxRule'); }
  listCountryTaxRules() { return this.smokeOnlyError<CountryTaxRule[]>('listCountryTaxRules'); }
  upsertCountryTaxRule(rule: CountryTaxRule) { return this.smokeOnlyError<CountryTaxRule>('upsertCountryTaxRule'); }
  withTenantScope<T>(tenantId: string, fn: () => Promise<T>): Promise<T> { return fn(); }

  /**
   * Smoke Test Routine:
   * 1. Check MYSQL_URL from environment.
   * 2. Attempt live connection via official mysql2 library.
   * 3. Write 1 sample record to an_smoke_test table.
   * 4. Read record back and verify identity.
   * 5. Return explicit Pass/Fail with diagnostic summary.
   */
  public async runSmokeTest(): Promise<SmokeTestResult> {
    const envUrl = this.connectionUrl || process.env.MYSQL_URL;
    if (!envUrl) {
      return {
        adapter: this.adapterName,
        passed: false,
        message: 'متغير البيئة MYSQL_URL غير متوفر في بيئة التشغيل.',
        missingSecrets: ['MYSQL_URL'],
      };
    }

    try {
      if (!this.pool) {
        this.pool = mysql.createPool(envUrl);
      }

      const conn = await this.pool.getConnection();

      // Ensure test table exists
      await conn.query(`
        CREATE TABLE IF NOT EXISTS an_smoke_test (
          id VARCHAR(64) PRIMARY KEY,
          payload VARCHAR(255) NOT NULL,
          tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const testId = `smoke-mysql-${Date.now()}`;
      const payload = 'A.N ERP Phase 0 Smoke Verification';

      // Write test record
      await conn.query(
        'INSERT INTO an_smoke_test (id, payload) VALUES (?, ?)',
        [testId, payload]
      );

      // Read test record
      const [rows]: any = await conn.query(
        'SELECT id, payload FROM an_smoke_test WHERE id = ?',
        [testId]
      );

      conn.release();

      if (rows && rows.length > 0 && rows[0].payload === payload) {
        return {
          adapter: this.adapterName,
          passed: true,
          message: 'نجح اختبار Smoke Test لـ MySQL بنجاح: تم الاتصال والكتابة والقراءة بمطابقة تامة.',
          evidence: { testId, payloadReceived: rows[0].payload },
        };
      } else {
        return {
          adapter: this.adapterName,
          passed: false,
          message: 'فشل اختبار Smoke Test: السجل المسترجع لا يطابق القيمة المكتوبة.',
        };
      }
    } catch (err: any) {
      return {
        adapter: this.adapterName,
        passed: false,
        message: 'فشل الاتصال بقاعدة بيانات MySQL عبر المكتبة الرسمية mysql2.',
        error: err.message,
      };
    }
  }
}
