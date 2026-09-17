/**
 * @file MongoDBSmokeAdapter.ts
 * @description MongoDB Storage Adapter for A.N ERP (Phase 0 Smoke Test)
 * Uses official 'mongodb' library (MongoClient).
 * Reads connection string from process.env.MONGO_URL.
 */

import { MongoClient } from 'mongodb';
import { SmokeTestResult } from './MySQLSmokeAdapter';
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
  GeoLocation,
  LoginAttemptRecord,
  FailedAttemptRecord,
  ActiveSessionRecord,
  OrgNode,
  BreakGlassDetails,
} from '../StoragePort';

export class MongoDBSmokeAdapter implements StoragePort {
  readonly adapterName = 'MongoDB Adapter';

  constructor(private readonly connectionUrl?: string) {}

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
  getUserByUsername(tenantId: string, username: string) { return this.smokeOnlyError<User>('getUserByUsername'); }
  getUserById(userId: string) { return this.smokeOnlyError<User>('getUserById'); }
  listUsers(tenantId?: string) { return this.smokeOnlyError<User[]>('listUsers'); }
  saveUser(user: User, idempotencyKey: string) { return this.smokeOnlyError<User>('saveUser'); }
  updateUser(userId: string, updates: Partial<User>) { return this.smokeOnlyError<User>('updateUser'); }
  getLastSuccessfulLogin(userId: string) { return this.smokeOnlyError<LoginAttemptRecord | null>('getLastSuccessfulLogin'); }
  recordSuccessfulLogin(record: LoginAttemptRecord) { return this.smokeOnlyError<void>('recordSuccessfulLogin'); }
  getFailedLoginAttempts(userId: string) { return this.smokeOnlyError<FailedAttemptRecord | null>('getFailedLoginAttempts'); }
  recordFailedLoginAttempt(userId: string, count: number, lockedUntil?: number) { return this.smokeOnlyError<void>('recordFailedLoginAttempt'); }
  clearFailedLoginAttempts(userId: string) { return this.smokeOnlyError<void>('clearFailedLoginAttempts'); }
  saveActiveSession(session: ActiveSessionRecord) { return this.smokeOnlyError<ActiveSessionRecord>('saveActiveSession'); }
  getActiveSession(sessionId: string) { return this.smokeOnlyError<ActiveSessionRecord | null>('getActiveSession'); }
  listActiveSessionsByUser(userId: string) { return this.smokeOnlyError<ActiveSessionRecord[]>('listActiveSessionsByUser'); }
  listAllActiveSessions() { return this.smokeOnlyError<ActiveSessionRecord[]>('listAllActiveSessions'); }
  deleteActiveSession(sessionId: string) { return this.smokeOnlyError<void>('deleteActiveSession'); }
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
  saveOrgNode(tenantId: string, node: OrgNode, idempotencyKey: string) { return this.smokeOnlyError<OrgNode>('saveOrgNode'); }
  getOrgNode(tenantId: string, nodeId: string) { return this.smokeOnlyError<OrgNode>('getOrgNode'); }
  listOrgHierarchy(tenantId: string, rootNodeId?: string) { return this.smokeOnlyError<OrgNode[]>('listOrgHierarchy'); }
  getUserVisibleNodes(tenantId: string, userAssignedNodeId: string) { return this.smokeOnlyError<OrgNode[]>('getUserVisibleNodes'); }
  approveBreakGlass(tenantId: string, requestId: string, breakGlass: BreakGlassDetails, idempotencyKey: string) { return this.smokeOnlyError<ApprovalRequest>('approveBreakGlass'); }
  anonymizeUserPii(tenantId: string, userId: string, actorId: string, idempotencyKey: string) { return this.smokeOnlyError<{ userId: string; anonymizedAt: string }>('anonymizeUserPii'); }
  withTenantScope<T>(tenantId: string, fn: () => Promise<T>): Promise<T> { return fn(); }

  /**
   * Smoke Test Routine:
   * 1. Check MONGO_URL from environment.
   * 2. Attempt live connection via official mongodb driver.
   * 3. Write 1 sample document to an_smoke_test collection.
   * 4. Read document back and verify identity.
   * 5. Return explicit Pass/Fail with diagnostic summary.
   */
  public async runSmokeTest(): Promise<SmokeTestResult> {
    const envUrl = this.connectionUrl || process.env.MONGO_URL;
    if (!envUrl) {
      return {
        adapter: this.adapterName,
        passed: false,
        message: 'متغير البيئة MONGO_URL غير متوفر في بيئة التشغيل.',
        missingSecrets: ['MONGO_URL'],
      };
    }

    let client: MongoClient | null = null;
    try {
      client = new MongoClient(envUrl, { serverSelectionTimeoutMS: 5000 });
      await client.connect();

      const db = client.db('an_erp');
      const collection = db.collection('an_smoke_test');

      const testId = `smoke-mongo-${Date.now()}`;
      const payload = 'A.N ERP MongoDB Smoke Verification';

      // Write test document
      await collection.insertOne({
        _id: testId as any,
        payload,
        testedAt: new Date(),
      });

      // Read test document
      const doc = await collection.findOne({ _id: testId as any });

      if (doc && doc.payload === payload) {
        return {
          adapter: this.adapterName,
          passed: true,
          message: 'نجح اختبار Smoke Test لـ MongoDB بنجاح: تم الاتصال، إدراج المستند، وقراءته بدقة.',
          evidence: { testId, payloadReceived: doc.payload },
        };
      } else {
        return {
          adapter: this.adapterName,
          passed: false,
          message: 'فشل اختبار Smoke Test: المستند المسترجع من MongoDB لا يطابق القيمة.',
        };
      }
    } catch (err: any) {
      return {
        adapter: this.adapterName,
        passed: false,
        message: 'فشل الاتصال بقاعدة بيانات MongoDB عبر المكتبة الرسمية.',
        error: err.message,
      };
    } finally {
      if (client) {
        try {
          await client.close();
        } catch {
          // Ignored
        }
      }
    }
  }
}
