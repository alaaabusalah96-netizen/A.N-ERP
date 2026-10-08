/**
 * @file MySQLSmokeAdapter.ts
 * @description MySQL Storage Adapter for A.N ERP (Phase 0 Smoke Test)
 * Uses official 'mysql2/promise' library.
 * Reads connection from process.env.MYSQL_URL.
 */

import mysql, { Pool } from 'mysql2/promise';
import {
  StoragePort,
  Invitation,
  ConsumedInvitation,
  StorageResult,
  AccountingPeriod,
  AccountingPeriodStatus,
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
  getUserByUsername(tenantId: string, username: string) { return this.smokeOnlyError<User>('getUserByUsername'); }
  getUserById(userId: string) { return this.smokeOnlyError<User>('getUserById'); }
  listUsers(tenantId?: string) { return this.smokeOnlyError<User[]>('listUsers'); }
  saveUser(user: User, idempotencyKey: string) { return this.smokeOnlyError<User>('saveUser'); }
  updateUser(userId: string, updates: Partial<User>) { return this.smokeOnlyError<User>('updateUser'); }
  getMembershipContext(tenantId: string, userId: string) { return this.smokeOnlyError<{ membershipId: string; status: string; role: string | null; scopes: { type: 'TENANT' | 'NODE'; orgNodeId?: string }[] } | null>('getMembershipContext'); }
  setMembershipStatus(tenantId: string, userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED') { return this.smokeOnlyError<boolean>('setMembershipStatus'); }
  createInvitation(tenantId: string, inv: Invitation) { return this.smokeOnlyError<boolean>('createInvitation'); }
  consumeInvitation(tenantId: string, tokenHash: string) { return this.smokeOnlyError<ConsumedInvitation | null>('consumeInvitation'); }
  releaseInvitation(tenantId: string, tokenHash: string) { return this.smokeOnlyError<boolean>('releaseInvitation'); }
  getLastSuccessfulLogin(userId: string) { return this.smokeOnlyError<LoginAttemptRecord | null>('getLastSuccessfulLogin'); }
  recordSuccessfulLogin(record: LoginAttemptRecord) { return this.smokeOnlyError<void>('recordSuccessfulLogin'); }
  getFailedLoginAttempts(userId: string) { return this.smokeOnlyError<FailedAttemptRecord | null>('getFailedLoginAttempts'); }
  recordFailedLoginAttempt(userId: string, count: number, lockedUntil?: number) { return this.smokeOnlyError<void>('recordFailedLoginAttempt'); }
  clearFailedLoginAttempts(userId: string) { return this.smokeOnlyError<void>('clearFailedLoginAttempts'); }
  saveActiveSession(session: ActiveSessionRecord) { return this.smokeOnlyError<ActiveSessionRecord>('saveActiveSession'); }
  getActiveSession(sessionId: string) { return this.smokeOnlyError<ActiveSessionRecord | null>('getActiveSession'); }
  listActiveSessionsByUser(userId: string) { return this.smokeOnlyError<ActiveSessionRecord[]>('listActiveSessionsByUser'); }
  listActiveSessions(tenantId: string) { return this.smokeOnlyError<ActiveSessionRecord[]>('listActiveSessions'); }
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
  deleteJournalEntry(tenantId: string, entryId: string) { return this.smokeOnlyError<void>('deleteJournalEntry'); }
  getPeriodForDate(tenantId: string, date: string) { return this.smokeOnlyError<AccountingPeriod | null>('getPeriodForDate'); }
  setPeriodStatus(tenantId: string, periodId: string, status: AccountingPeriodStatus) { return this.smokeOnlyError<AccountingPeriod>('setPeriodStatus'); }
  nextSequence(tenantId: string, sequenceKey: string, prefix: string, idempotencyKey: string) { return this.smokeOnlyError<SequenceResult>('nextSequence'); }
  overrideSequence(tenantId: string, sequenceKey: string, manualNumber: number, reason: string, authorizedBy: string, idempotencyKey: string) { return this.smokeOnlyError<SequenceResult>('overrideSequence'); }
  createApprovalRequest(tenantId: string, request: ApprovalRequest, idempotencyKey: string) { return this.smokeOnlyError<ApprovalRequest>('createApprovalRequest'); }
  approveStep(tenantId: string, requestId: string, approverId: string, idempotencyKey: string, approverRole?: string) { return this.smokeOnlyError<ApprovalRequest>('approveStep'); }
  rejectApprovalStep(tenantId: string, requestId: string, approverId: string, approverRole: string, reason: string, idempotencyKey: string) { return this.smokeOnlyError<any>('rejectApprovalStep'); }
  getApprovalRequest(tenantId: string, id: string) { return this.smokeOnlyError<any>('getApprovalRequest'); }
  listApprovalRequests(tenantId: string, filter?: any) { return this.smokeOnlyError<any[]>('listApprovalRequests'); }
  getApprovalPolicy(tenantId: string, documentType: any) { return this.smokeOnlyError<any>('getApprovalPolicy'); }
  listApprovalPolicies(tenantId: string) { return this.smokeOnlyError<any[]>('listApprovalPolicies'); }
  saveApprovalPolicy(tenantId: string, policy: any, idempotencyKey: string) { return this.smokeOnlyError<any>('saveApprovalPolicy'); }
  getInventorySettings(tenantId: string) { return this.smokeOnlyError<any>('getInventorySettings'); }
  saveInventorySettings(tenantId: string, settings: any, actorId: string, idempotencyKey: string) { return this.smokeOnlyError<any>('saveInventorySettings'); }
  appendSystemChangeLog(entry: SystemChangeLogEntry) { return this.smokeOnlyError<SystemChangeLogEntry>('appendSystemChangeLog'); }
  getSystemChangeLogs() { return this.smokeOnlyError<SystemChangeLogEntry[]>('getSystemChangeLogs'); }
  saveTokenFamily(family: TokenFamily) { return this.smokeOnlyError<TokenFamily>('saveTokenFamily'); }
  getTokenFamily(familyId: string) { return this.smokeOnlyError<TokenFamily>('getTokenFamily'); }
  saveRefreshToken(record: RefreshTokenRecord) { return this.smokeOnlyError<RefreshTokenRecord>('saveRefreshToken'); }
  getRefreshToken(tokenHash: string) { return this.smokeOnlyError<RefreshTokenRecord>('getRefreshToken'); }
  updateRefreshToken(record: RefreshTokenRecord) { return this.smokeOnlyError<RefreshTokenRecord>('updateRefreshToken'); }
  consumeRefreshToken(tokenHash: string, revokedAt: number) { return this.smokeOnlyError<boolean>('consumeRefreshToken'); }
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
  saveAuditRecord(record: any) { return this.smokeOnlyError<any>('saveAuditRecord'); }
  getAuditRecords(tenantId: string, limit?: number) { return this.smokeOnlyError<any[]>('getAuditRecords'); }
  saveCustomField(tenantId: string, field: any) { return this.smokeOnlyError<any>('saveCustomField'); }
  getCustomFields(tenantId: string, module?: string) { return this.smokeOnlyError<any[]>('getCustomFields'); }
  checkIdempotencyRecord(tenantId: string, key: string, operation: string) { return this.smokeOnlyError<any>('checkIdempotencyRecord'); }
  saveIdempotencyRecord(tenantId: string, key: string, operation: string, payload: any) { return this.smokeOnlyError<void>('saveIdempotencyRecord'); }
  createCashCustody(tenantId: string, custody: any, idempotencyKey: string) { return this.smokeOnlyError<any>('createCashCustody'); }
  getCashCustody(tenantId: string, custodyId: string) { return this.smokeOnlyError<any>('getCashCustody'); }
  listCashCustodies(tenantId: string, filter?: any) { return this.smokeOnlyError<any[]>('listCashCustodies'); }
  updateCashCustody(tenantId: string, custodyId: string, updates: any) { return this.smokeOnlyError<any>('updateCashCustody'); }
  recordCustodyExpense(tenantId: string, transaction: any, idempotencyKey: string) { return this.smokeOnlyError<any>('recordCustodyExpense'); }
  listCustodyTransactions(tenantId: string, custodyId?: string) { return this.smokeOnlyError<any[]>('listCustodyTransactions'); }
  saveCustodySettlement(tenantId: string, settlement: any, idempotencyKey: string) { return this.smokeOnlyError<any>('saveCustodySettlement'); }
  listCustodySettlements(tenantId: string, custodyId?: string) { return this.smokeOnlyError<any[]>('listCustodySettlements'); }
  createExpenseRequest(tenantId: string, request: any, lines: any[], attachments: any[], idempotencyKey: string) { return this.smokeOnlyError<any>('createExpenseRequest'); }
  getExpenseRequest(tenantId: string, requestId: string) { return this.smokeOnlyError<any>('getExpenseRequest'); }
  listExpenseRequests(tenantId: string, filter?: any) { return this.smokeOnlyError<any[]>('listExpenseRequests'); }
  updateExpenseRequestStatus(tenantId: string, requestId: string, updates: any, idempotencyKey: string) { return this.smokeOnlyError<any>('updateExpenseRequestStatus'); }
  listExpenseCategories(tenantId: string) { return this.smokeOnlyError<any[]>('listExpenseCategories'); }
  saveExpenseCategory(tenantId: string, category: any, idempotencyKey: string) { return this.smokeOnlyError<any>('saveExpenseCategory'); }

  // Inventory & Warehouses (Phase 7)
  saveWarehouse(tenantId: string, warehouse: any, idempotencyKey: string) { return this.smokeOnlyError<any>('saveWarehouse'); }
  getWarehouse(tenantId: string, warehouseId: string) { return this.smokeOnlyError<any>('getWarehouse'); }
  listWarehouses(tenantId: string, filter?: any) { return this.smokeOnlyError<any[]>('listWarehouses'); }
  saveWarehouseBin(tenantId: string, bin: any) { return this.smokeOnlyError<any>('saveWarehouseBin'); }
  listWarehouseBins(tenantId: string, warehouseId: string) { return this.smokeOnlyError<any[]>('listWarehouseBins'); }
  saveStockItem(tenantId: string, item: any, idempotencyKey: string) { return this.smokeOnlyError<any>('saveStockItem'); }
  getStockItem(tenantId: string, itemId: string) { return this.smokeOnlyError<any>('getStockItem'); }
  listStockItems(tenantId: string, filter?: any) { return this.smokeOnlyError<any[]>('listStockItems'); }
  getWarehouseStock(tenantId: string, warehouseId: string, itemId: string) { return this.smokeOnlyError<any>('getWarehouseStock'); }
  listWarehouseStock(tenantId: string, warehouseId?: string, itemId?: string) { return this.smokeOnlyError<any[]>('listWarehouseStock'); }
  recordStockMovement(tenantId: string, movement: any, idempotencyKey: string) { return this.smokeOnlyError<any>('recordStockMovement'); }
  listStockMovements(tenantId: string, filter?: any) { return this.smokeOnlyError<any[]>('listStockMovements'); }
  createStockTransfer(tenantId: string, transfer: any, lines: any[], idempotencyKey: string) { return this.smokeOnlyError<any>('createStockTransfer'); }
  postStockTransferAtomic(tenantId: string, input: any, idempotencyKey: string) { return this.smokeOnlyError<any>('postStockTransferAtomic'); }
  getStockTransfer(tenantId: string, transferId: string) { return this.smokeOnlyError<any>('getStockTransfer'); }
  listStockTransfers(tenantId: string, filter?: any) { return this.smokeOnlyError<any[]>('listStockTransfers'); }
  updateStockTransferStatus(tenantId: string, transferId: string, status: any, actorId: string, actorName: string, idempotencyKey: string) { return this.smokeOnlyError<any>('updateStockTransferStatus'); }
  createStockCount(tenantId: string, count: any, lines: any[], idempotencyKey: string) { return this.smokeOnlyError<any>('createStockCount'); }
  getStockCount(tenantId: string, countId: string) { return this.smokeOnlyError<any>('getStockCount'); }
  listStockCounts(tenantId: string, filter?: any) { return this.smokeOnlyError<any[]>('listStockCounts'); }
  updateStockCountStatus(tenantId: string, countId: string, status: any, actorId: string, actorName: string, journalEntryId?: string, idempotencyKey?: string) { return this.smokeOnlyError<any>('updateStockCountStatus'); }
  saveItemBatch(tenantId: string, batch: any) { return this.smokeOnlyError<any>('saveItemBatch'); }
  listItemBatches(tenantId: string, itemId?: string, warehouseId?: string) { return this.smokeOnlyError<any[]>('listItemBatches'); }
  saveItemSerial(tenantId: string, serial: any) { return this.smokeOnlyError<any>('saveItemSerial'); }
  listItemSerials(tenantId: string, itemId?: string, warehouseId?: string) { return this.smokeOnlyError<any[]>('listItemSerials'); }
  saveStockDocument(tenantId: string, doc: any, idempotencyKey: string) { return this.smokeOnlyError<any>('saveStockDocument'); }
  postStockDocumentAtomic(tenantId: string, input: any, idempotencyKey: string) { return this.smokeOnlyError<any>('postStockDocumentAtomic'); }
  getStockDocument(tenantId: string, documentId: string) { return this.smokeOnlyError<any>('getStockDocument'); }
  listStockDocuments(tenantId: string, filter?: any) { return this.smokeOnlyError<any[]>('listStockDocuments'); }
  saveCustodyExpenseVoucher(tenantId: string, voucher: any, idempotencyKey: string) { return this.smokeOnlyError<any>('saveCustodyExpenseVoucher'); }
  getCustodyExpenseVoucher(tenantId: string, voucherId: string) { return this.smokeOnlyError<any>('getCustodyExpenseVoucher'); }
  listCustodyExpenseVouchers(tenantId: string, custodyId?: string) { return this.smokeOnlyError<any[]>('listCustodyExpenseVouchers'); }
  reverseCustodyExpenseVoucher(tenantId: string, voucherId: string, reversedBy: string, idempotencyKey: string) { return this.smokeOnlyError<any>('reverseCustodyExpenseVoucher'); }
  saveItemPrice(tenantId: string, price: any) { return this.smokeOnlyError<any>('saveItemPrice'); }
  getItemPrices(tenantId: string, itemId: string) { return this.smokeOnlyError<any[]>('getItemPrices'); }
  saveDocumentAttachment(tenantId: string, attachment: any) { return this.smokeOnlyError<any>('saveDocumentAttachment'); }
  listDocumentAttachments(tenantId: string, documentType: string, documentId: string) { return this.smokeOnlyError<any[]>('listDocumentAttachments'); }

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
  saveAccountingDecision(tenantId: string, rec: any) { return this.smokeOnlyError<any>('saveAccountingDecision'); }
  getAccountingDecision(tenantId: string, id: string) { return this.smokeOnlyError<any>('getAccountingDecision'); }
  listAccountingDecisions(tenantId: string, filter?: any) { return this.smokeOnlyError<any>('listAccountingDecisions'); }
  linkDecisionToJournal(tenantId: string, decisionId: string, journalEntryId: string) { return this.smokeOnlyError<any>('linkDecisionToJournal'); }
  saveStandard(s: any, actorId: string, idempotencyKey: string) { return this.smokeOnlyError<any>('saveStandard'); }
  listStandards(filter?: any) { return this.smokeOnlyError<any>('listStandards'); }
  updateStandardCoverage(standardId: string, version: number, coverage: any, evidenceRef: string | null, actorId: string, idempotencyKey: string) { return this.smokeOnlyError<any>('updateStandardCoverage'); }
  saveJurisdiction(j: any, actorId: string, idempotencyKey: string) { return this.smokeOnlyError<any>('saveJurisdiction'); }
  listJurisdictions() { return this.smokeOnlyError<any>('listJurisdictions'); }
  saveAccountingRule(rule: any, actorId: string, idempotencyKey: string) { return this.smokeOnlyError<any>('saveAccountingRule'); }
  listAccountingRules(filter?: any) { return this.smokeOnlyError<any>('listAccountingRules'); }
  saveStdTaxRule(rule: any, actorId: string, idempotencyKey: string) { return this.smokeOnlyError<any>('saveStdTaxRule'); }
  listStdTaxRules(filter?: any) { return this.smokeOnlyError<any>('listStdTaxRules'); }
  appendAccountingPolicyVersion(tenantId: string, input: any, actorId: string, idempotencyKey: string) { return this.smokeOnlyError<any>('appendAccountingPolicyVersion'); }
  listAccountingPolicies(tenantId: string, policyKey?: string) { return this.smokeOnlyError<any>('listAccountingPolicies'); }
  getStockAccountingConfig(tenantId: string) { return this.smokeOnlyError<any>('getStockAccountingConfig'); }
  saveStockAccountingConfig(tenantId: string, settings: any, actorId: string, idempotencyKey: string) { return this.smokeOnlyError<any>('saveStockAccountingConfig'); }
  setStockDocumentJournal(tenantId: string, docId: string, journalEntryId: string | null, status: any) { return this.smokeOnlyError<any>('setStockDocumentJournal'); }
  setStockTransferJournal(tenantId: string, transferId: string, which: any, journalEntryId: string | null, status: any) { return this.smokeOnlyError<any>('setStockTransferJournal'); }

  savePurchaseOrder(..._a: any[]) { return this.smokeOnlyError<any>('savePurchaseOrder'); }
  getPurchaseOrder(..._a: any[]) { return this.smokeOnlyError<any>('getPurchaseOrder'); }
  listPurchaseOrders(..._a: any[]) { return this.smokeOnlyError<any>('listPurchaseOrders'); }
  updatePurchaseOrderStatus(..._a: any[]) { return this.smokeOnlyError<any>('updatePurchaseOrderStatus'); }

  savePurchaseRequest(..._a: any[]) { return this.smokeOnlyError<any>('savePurchaseRequest'); }
  getPurchaseRequest(..._a: any[]) { return this.smokeOnlyError<any>('getPurchaseRequest'); }
  listPurchaseRequests(..._a: any[]) { return this.smokeOnlyError<any>('listPurchaseRequests'); }
  updatePurchaseRequest(..._a: any[]) { return this.smokeOnlyError<any>('updatePurchaseRequest'); }
  saveRfq(..._a: any[]) { return this.smokeOnlyError<any>('saveRfq'); }
  getRfq(..._a: any[]) { return this.smokeOnlyError<any>('getRfq'); }
  listRfqs(..._a: any[]) { return this.smokeOnlyError<any>('listRfqs'); }
  updateRfq(..._a: any[]) { return this.smokeOnlyError<any>('updateRfq'); }
  saveSupplierQuote(..._a: any[]) { return this.smokeOnlyError<any>('saveSupplierQuote'); }
  getSupplierQuote(..._a: any[]) { return this.smokeOnlyError<any>('getSupplierQuote'); }
  listSupplierQuotes(..._a: any[]) { return this.smokeOnlyError<any>('listSupplierQuotes'); }
  updateSupplierQuote(..._a: any[]) { return this.smokeOnlyError<any>('updateSupplierQuote'); }

  saveSupplierInvoice(..._a: any[]) { return this.smokeOnlyError<any>('saveSupplierInvoice'); }
  getSupplierInvoice(..._a: any[]) { return this.smokeOnlyError<any>('getSupplierInvoice'); }
  listSupplierInvoices(..._a: any[]) { return this.smokeOnlyError<any>('listSupplierInvoices'); }
  updateSupplierInvoice(..._a: any[]) { return this.smokeOnlyError<any>('updateSupplierInvoice'); }


  saveGoodsReceipt(..._a: any[]) { return this.smokeOnlyError<any>('saveGoodsReceipt'); }
  getGoodsReceipt(..._a: any[]) { return this.smokeOnlyError<any>('getGoodsReceipt'); }
  listGoodsReceipts(..._a: any[]) { return this.smokeOnlyError<any>('listGoodsReceipts'); }
  updateGoodsReceipt(..._a: any[]) { return this.smokeOnlyError<any>('updateGoodsReceipt'); }
  completeGoodsReceiptAtomic(..._a: any[]) { return this.smokeOnlyError<any>('completeGoodsReceiptAtomic'); }
  sumOpenReceiptQtyForPoLine(..._a: any[]) { return this.smokeOnlyError<any>('sumOpenReceiptQtyForPoLine'); }

  getInventoryIntegrityAggregates(tenantId: string) { return this.smokeOnlyError<any>('getInventoryIntegrityAggregates'); }

  listUserWarehouseAccess(..._a: any[]) { return this.smokeOnlyError<any>('listUserWarehouseAccess'); }
  setUserWarehouseAccess(..._a: any[]) { return this.smokeOnlyError<any>('setUserWarehouseAccess'); }

}
