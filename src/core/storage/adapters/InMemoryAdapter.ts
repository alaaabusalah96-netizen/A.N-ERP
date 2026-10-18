/**
 * @file InMemoryAdapter.ts
 * @description In-Memory Storage Adapter for local interface development only.
 * EXPLICIT NOTICE: Strictly forbidden for closing Phase isolation or persistence batteries.
 */

import type { AccountingDecisionRecord } from '../../standards/decisionTypes';
import type { StandardRecord, JurisdictionRecord, AccountingRuleRecord, TaxRuleRecord, AccountingPolicyRecord, CoverageStatus } from '../../standards/standardsTypes';
import {
  StoragePort,
  PostStockDocumentAtomicInput,
  ApprovalPolicy,
  ApprovalDocumentType,
  InventorySettings,
  defaultInventorySettings,
  StockAccountingConfig,
  defaultStockAccountingConfig,
  PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine,
  PurchaseOrderStatus, CompleteGoodsReceiptAtomicInput, InventoryIntegrityRow,
  PurchaseRequest, PurchaseRequestLine, RequestForQuote, RfqLine, SupplierQuote, SupplierQuoteLine,
  SupplierInvoice, SupplierInvoiceLine,
  planCostLayerConsumption,
  PostStockTransferAtomicInput,
  Invitation,
  ConsumedInvitation,
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
  CustomFieldDefinition,
  OperationalAuditRecord,
  CashCustody,
  CashCustodyTransaction,
  CashCustodySettlement,
  ExpenseRequest,
  ExpenseLine,
  ExpenseAttachment,
  ExpenseCategory,
  Warehouse,
  WarehouseBin,
  StockItem,
  WarehouseStock,
  StockMovement,
  StockMovementType,
  StockTransfer,
  StockTransferLine,
  StockTransferStatus,
  StockCount,
  StockCountLine,
  StockCountStatus,
  ItemBatch,
  ItemSerial,
  AccountingPeriod,
  AccountingPeriodStatus,
  StockDocument,
  StockDocumentLine,
  StockDocumentType,
  CustodyExpenseLine,
  CustodyExpenseVoucher,
  DocumentAttachment,
  ItemPrice,
  CompanyGroup,
  GroupMasterItem,
  CrossCompanyTransfer,
} from '../StoragePort';
import { AuditChainService, GENESIS_PREVIOUS_HASH } from '../../audit/AuditChainService';
import { SEED_TENANT_ID } from '../../seed/seedOnly';

export class InMemoryAdapter implements StoragePort {
  readonly adapterName = 'InMemoryAdapter (Development Only - Non-Persistent)';

  private tenants = new Map<string, TenantCompany>();
  private companyGroups = new Map<string, CompanyGroup>();
  private groupMasterItems = new Map<string, GroupMasterItem>();
  private crossCompanyTransfers = new Map<string, CrossCompanyTransfer>();
  private users = new Map<string, User>();
  private orgNodes = new Map<string, OrgNode>();
  private lastLogins = new Map<string, LoginAttemptRecord>();
  private failedAttempts = new Map<string, FailedAttemptRecord>();
  private activeSessions = new Map<string, ActiveSessionRecord>();
  private accounts = new Map<string, Account>();
  private journalEntries = new Map<string, JournalEntry>();
  private accountingPeriods = new Map<string, AccountingPeriod>();
  private sequences = new Map<string, number>();
  private approvalRequests = new Map<string, ApprovalRequest>();
  private changeLogs: SystemChangeLogEntry[] = [];
  private idempotencyRecords = new Map<string, any>();
  private tokenFamilies = new Map<string, TokenFamily>();
  private refreshTokens = new Map<string, RefreshTokenRecord>();
  private auditRecords: OperationalAuditRecord[] = [];
  private customFields = new Map<string, CustomFieldDefinition>();

  // Phase 6 Expense collections
  private expenseRequests = new Map<string, ExpenseRequest>();
  private expenseLines = new Map<string, ExpenseLine[]>();
  private expenseAttachments = new Map<string, ExpenseAttachment[]>();
  private expenseCategories = new Map<string, ExpenseCategory>();

  // Phase 2 state collections
  private taxRules = new Map<string, CountryTaxRule>();
  private tenantModules = new Map<string, TenantModuleManifest[]>();
  private masterItems = new Map<string, MasterItem>();
  private masterPartners = new Map<string, MasterPartner>();
  private auditChains = new Map<string, AuditChainEntry[]>();

  // Phase 5: Cash Custody collections
  private cashCustodies = new Map<string, CashCustody>();
  private cashCustodyTransactions = new Map<string, CashCustodyTransaction>();
  private cashCustodySettlements = new Map<string, CashCustodySettlement>();

  // Phase 7: Inventory & Warehouses
  private warehouses = new Map<string, Warehouse>();
  private warehouseBins = new Map<string, WarehouseBin>();
  private stockItems = new Map<string, StockItem>();
  private warehouseStock = new Map<string, WarehouseStock>();
  private userWarehouseAccess = new Map<string, string[]>();
  private stockMovements = new Map<string, StockMovement>();
  private stockTransfers = new Map<string, StockTransfer>();
  private stockTransferLines = new Map<string, StockTransferLine[]>();
  private stockCounts = new Map<string, StockCount>();
  private stockCountLines = new Map<string, StockCountLine[]>();
  private itemBatches = new Map<string, ItemBatch>();
  private itemSerials = new Map<string, ItemSerial>();

  // Phase 7.6: Multi-line documents, vouchers, attachments, prices
  private stockDocuments = new Map<string, StockDocument>();
  // Phase 13 (COST-001): cost layers per tenant:warehouse:item (arrays are replaced, never mutated, so a snapshot is a shallow Map copy)
  private costLayers = new Map<string, Array<{ id: string; poNumber: string | null; remainingQty: number; unitCost: number; receivedAt: string; isOpening: boolean }>>();
  private inventorySettings = new Map<string, InventorySettings>();
  private stockAccountingConfig = new Map<string, StockAccountingConfig>();
  // Standards Intelligence F1 (same semantics as PostgresPrimaryAdapter: immutable history, idempotent replay)
  private stdStandards = new Map<string, StandardRecord & { _k: string }>();
  private stdJurisdictions = new Map<string, JurisdictionRecord & { _k: string }>();
  private stdRules = new Map<string, AccountingRuleRecord & { _k: string }>();
  private stdTaxRules = new Map<string, TaxRuleRecord & { _k: string }>();
  private stdPolicies = new Map<string, AccountingPolicyRecord[]>();
  private stdDecisions = new Map<string, AccountingDecisionRecord>(); // key: tenantId|decisionKey
  private stdInsertOnce<T extends { _k: string }>(m: Map<string, T>, pk: string, row: T, key: string): StorageResult<any> {
    const ex = m.get(pk);
    if (!ex) { m.set(pk, row); return { success: true, data: undefined }; }
    if (ex._k === key) return { success: true, data: undefined };
    return { success: false, error: { type: 'standards', title: 'version-conflict', status: 409, detail: `${pk} already exists (history is immutable)` } };
  }
  private stdStrip<T>(r: any): T { const { _k, ...rest } = r; return JSON.parse(JSON.stringify(rest)); }
  private purchaseOrders = new Map<string, any>();
  private purchaseOrderLines = new Map<string, any[]>();
  private goodsReceipts = new Map<string, any>();
  private goodsReceiptLines = new Map<string, any[]>();
  private purchaseRequests = new Map<string, any>();
  private purchaseRequestLines = new Map<string, any[]>();
  private rfqs = new Map<string, any>();
  private rfqLines = new Map<string, any[]>();
  private supplierQuotes = new Map<string, any>();
  private supplierQuoteLines = new Map<string, any[]>();
  private supplierInvoices = new Map<string, any>();
  private supplierInvoiceLines = new Map<string, any[]>();
  private custodyExpenseVouchers = new Map<string, CustodyExpenseVoucher>();
  private documentAttachments = new Map<string, DocumentAttachment>();
  private itemPrices = new Map<string, ItemPrice>();

  constructor() {
    this.seedDefaultData();
    this.seedDefaultTaxRules();
  }

  private seedDefaultData() {
    const defaultTenant: TenantCompany = {
      id: SEED_TENANT_ID,
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
        tenantId: SEED_TENANT_ID,
        nameAr: 'الصندوق الرئيسي - الرياض',
        type: 'ASSET',
        currency: 'SAR',
        debitBalance: 500000,
        creditBalance: 0,
        isActive: true,
      },
      {
        code: '110201',
        tenantId: SEED_TENANT_ID,
        nameAr: 'بنك الراجحي - الحساب الجاري',
        type: 'ASSET',
        currency: 'SAR',
        debitBalance: 1250000,
        creditBalance: 0,
        isActive: true,
      },
      {
        code: '520101',
        tenantId: SEED_TENANT_ID,
        nameAr: 'مصروفات الصيانة والتشغيل',
        type: 'EXPENSE',
        currency: 'SAR',
        debitBalance: 45000,
        creditBalance: 0,
        isActive: true,
      },
      {
        code: '410101',
        tenantId: SEED_TENANT_ID,
        nameAr: 'إيرادات المبيعات العامة',
        type: 'REVENUE',
        currency: 'SAR',
        debitBalance: 0,
        creditBalance: 1795000,
        isActive: true,
      },
      {
        code: '110301',
        tenantId: SEED_TENANT_ID,
        nameAr: 'مخزون البضاعة بغرض البيع',
        type: 'ASSET',
        currency: 'SAR',
        debitBalance: 0,
        creditBalance: 0,
        isActive: true,
      },
      {
        code: '510101',
        tenantId: SEED_TENANT_ID,
        nameAr: 'تكلفة البضاعة المباعة',
        type: 'EXPENSE',
        currency: 'SAR',
        debitBalance: 0,
        creditBalance: 0,
        isActive: true,
      },
      { code: '1105', tenantId: SEED_TENANT_ID, nameAr: 'المخزون السلعي', type: 'ASSET', currency: 'SAR', debitBalance: 0, creditBalance: 0, isActive: true },
      { code: '1109', tenantId: SEED_TENANT_ID, nameAr: 'مخزون في الطريق', type: 'ASSET', currency: 'SAR', debitBalance: 0, creditBalance: 0, isActive: true },
      { code: '2106', tenantId: SEED_TENANT_ID, nameAr: 'GR/IR', type: 'LIABILITY', currency: 'SAR', debitBalance: 0, creditBalance: 0, isActive: true },
      { code: '5101', tenantId: SEED_TENANT_ID, nameAr: 'تكلفة البضاعة', type: 'EXPENSE', currency: 'SAR', debitBalance: 0, creditBalance: 0, isActive: true },
    ];

    for (const acc of defaultAccounts) {
      this.accounts.set(`${acc.tenantId}:${acc.code}`, acc);
    }

    // Default Seed Warehouse and Items
    const defaultWarehouse: Warehouse = {
      id: 'wh-main',
      tenantId: SEED_TENANT_ID,
      companyId: SEED_TENANT_ID,
      code: 'WH-001',
      nameAr: 'المستودع الرئيسي - الرياض',
      nameEn: 'Main Warehouse - Riyadh',
      location: 'الرياض - المنطقة الصناعية الثانية',
      valuationMethod: 'WEIGHTED_AVERAGE',
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.warehouses.set(`${SEED_TENANT_ID}:${defaultWarehouse.id}`, defaultWarehouse);

    const branchWarehouse: Warehouse = {
      id: 'wh-jeddah',
      tenantId: SEED_TENANT_ID,
      companyId: SEED_TENANT_ID,
      code: 'WH-002',
      nameAr: 'مستودع جدة الإقليمي',
      nameEn: 'Jeddah Regional Warehouse',
      location: 'جدة - مستودعات الخمرة',
      valuationMethod: 'WEIGHTED_AVERAGE',
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.warehouses.set(`${SEED_TENANT_ID}:${branchWarehouse.id}`, branchWarehouse);

    const defaultItem: StockItem = {
      id: 'item-001',
      tenantId: SEED_TENANT_ID,
      companyId: SEED_TENANT_ID,
      itemCode: 'SKU-LAPTOP-01',
      nameAr: 'حاسب محمول للأعمال - فئة ممتازة',
      nameEn: 'Business Laptop Enterprise',
      category: 'ELECTRONICS',
      uom: 'قطعة',
      inventoryAccountCode: '110301',
      cogsAccountCode: '510101',
      adjustmentExpenseAccountCode: '520101',
      adjustmentGainAccountCode: '410101',
      valuationMethod: 'WEIGHTED_AVERAGE',
      standardCost: 3200,
      averageCost: 3200,
      sellingPrice: 4200,
      reorderPoint: 5,
      minStockLevel: 2,
      maxStockLevel: 30,
      trackBatch: false,
      trackSerial: true,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.stockItems.set(`${SEED_TENANT_ID}:${defaultItem.id}`, defaultItem);

    this.warehouseStock.set(`${SEED_TENANT_ID}:wh-main:item-001`, {
      id: 'wh-main-item-001',
      tenantId: SEED_TENANT_ID,
      companyId: SEED_TENANT_ID,
      itemId: 'item-001',
      warehouseId: 'wh-main',
      currentQty: 18,
      reservedQty: 0,
      availableQty: 18,
      averageCost: 3200,
      totalValue: 57600,
      updatedAt: new Date().toISOString(),
    });
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
    for (const u of this.users.values()) {
      if (u.tenantId === tenantId && (u.id === userId || u.username.toLowerCase() === userId.toLowerCase())) {
        return { success: true, data: u };
      }
    }
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

  public async getUserByUsername(tenantId: string, username: string): Promise<StorageResult<User>> {
    if (!tenantId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/tenant-required',
          title: 'مستأجر غير محدد',
          status: 400,
          detail: 'يجب تحديد المستأجر عند البحث عن مستخدم بالاسم.',
        },
      };
    }
    for (const u of this.users.values()) {
      if (tenantId && u.tenantId === tenantId && u.username.toLowerCase() === username.trim().toLowerCase()) {
        return { success: true, data: u };
      }
    }
    return {
      success: false,
      error: {
        type: 'https://api.an-erp.local/errors/user-not-found',
        title: 'المستخدم غير موجود',
        status: 404,
        detail: `المستخدم ${username} غير مسجل للشركة ${tenantId}`,
      },
    };
  }

  public async getUserById(userId: string): Promise<StorageResult<User>> {
    for (const u of this.users.values()) {
      if (u.id === userId || u.username.toLowerCase() === userId.toLowerCase()) {
        return { success: true, data: u };
      }
    }
    return {
      success: false,
      error: {
        type: 'https://api.an-erp.local/errors/user-not-found',
        title: 'المستخدم غير موجود',
        status: 404,
        detail: `المستخدم بالمعرف ${userId} غير مسجل بالنظام`,
      },
    };
  }

  public async listUsers(tenantId?: string): Promise<StorageResult<User[]>> {
    const list = Array.from(this.users.values()).filter(u => !tenantId || u.tenantId === tenantId);
    return { success: true, data: list };
  }

  public async saveUser(user: User, idempotencyKey: string): Promise<StorageResult<User>> {
    this.users.set(user.id, user);
    this.users.set(`${user.tenantId}:${user.id}`, user);
    return { success: true, data: user };
  }

  public async updateUser(userId: string, updates: Partial<User>): Promise<StorageResult<User>> {
    const existingRes = await this.getUserById(userId);
    if (!existingRes.success || !existingRes.data) return existingRes;
    const merged: User = { ...existingRes.data, ...updates };
    return this.saveUser(merged, `inmem-upd-${userId}-${Date.now()}`);
  }

  // Phase 4 (IDENT-001): membership is derived from the user; overrides come from setMembershipStatus
  private membershipStatusOverrides: Map<string, 'ACTIVE' | 'SUSPENDED' | 'REVOKED'> = new Map();

  public async getMembershipContext(tenantId: string, userId: string): Promise<StorageResult<{ membershipId: string; status: string; role: string | null; scopes: { type: 'TENANT' | 'NODE'; orgNodeId?: string }[] } | null>> {
    const res = await this.getUser(tenantId, userId);
    if (!res.success || !res.data) return { success: true, data: null };
    const u = res.data;
    const override = this.membershipStatusOverrides.get(`${tenantId}:${u.id}`);
    const status = override || (u.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED');
    return {
      success: true,
      data: {
        membershipId: `mbr-${u.id}`,
        status,
        role: u.role || null,
        scopes: [{ type: 'TENANT' }],
      },
    };
  }

  public async setMembershipStatus(tenantId: string, userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'): Promise<StorageResult<boolean>> {
    const res = await this.getUser(tenantId, userId);
    if (!res.success || !res.data) return { success: true, data: false };
    this.membershipStatusOverrides.set(`${tenantId}:${res.data.id}`, status);
    return { success: true, data: true };
  }

  // Phase 5 (AUTH-003): invitations. Adapter state, keyed by tenant + token hash (tenant isolation).
  private invitations: Map<string, Invitation> = new Map();

  public async createInvitation(tenantId: string, inv: Invitation): Promise<StorageResult<boolean>> {
    this.invitations.set(`${tenantId}:${inv.tokenHash}`, {
      ...inv,
      tenantId,
      status: 'PENDING',
      createdAt: inv.createdAt || new Date().toISOString(),
      consumedAt: undefined,
    });
    return { success: true, data: true };
  }

  // Synchronous read-check-write inside one async method: atomic with respect to the event loop.
  public async consumeInvitation(tenantId: string, tokenHash: string): Promise<StorageResult<ConsumedInvitation | null>> {
    const inv = this.invitations.get(`${tenantId}:${tokenHash}`);
    if (!inv || inv.status !== 'PENDING' || new Date(inv.expiresAt).getTime() <= Date.now()) {
      return { success: true, data: null };
    }
    inv.status = 'ACCEPTED';
    inv.consumedAt = new Date().toISOString();
    return { success: true, data: { id: inv.id, email: inv.email, proposedRole: inv.proposedRole, orgNodeId: inv.orgNodeId } };
  }

  public async releaseInvitation(tenantId: string, tokenHash: string): Promise<StorageResult<boolean>> {
    const inv = this.invitations.get(`${tenantId}:${tokenHash}`);
    if (!inv || inv.status !== 'ACCEPTED') return { success: true, data: false };
    inv.status = 'PENDING';
    inv.consumedAt = undefined;
    return { success: true, data: true };
  }

  // Login Attempts & Security Tracking (Anomaly Detection & Lockout)
  public async getLastSuccessfulLogin(userId: string): Promise<StorageResult<LoginAttemptRecord | null>> {
    return { success: true, data: this.lastLogins.get(userId) || null };
  }

  public async recordSuccessfulLogin(record: LoginAttemptRecord): Promise<StorageResult<void>> {
    this.lastLogins.set(record.userId, record);
    this.failedAttempts.delete(record.userId);
    return { success: true, data: undefined };
  }

  public async getFailedLoginAttempts(userId: string): Promise<StorageResult<FailedAttemptRecord | null>> {
    return { success: true, data: this.failedAttempts.get(userId) || null };
  }

  public async recordFailedLoginAttempt(userId: string, count: number, lockedUntil?: number): Promise<StorageResult<void>> {
    this.failedAttempts.set(userId, {
      userId,
      count,
      lockedUntil,
      updatedAt: Date.now(),
    });
    return { success: true, data: undefined };
  }

  public async clearFailedLoginAttempts(userId: string): Promise<StorageResult<void>> {
    this.failedAttempts.delete(userId);
    return { success: true, data: undefined };
  }

  // Active Sessions
  public async saveActiveSession(session: ActiveSessionRecord): Promise<StorageResult<ActiveSessionRecord>> {
    this.activeSessions.set(session.sessionId, session);
    return { success: true, data: session };
  }

  public async getActiveSession(sessionId: string): Promise<StorageResult<ActiveSessionRecord | null>> {
    return { success: true, data: this.activeSessions.get(sessionId) || null };
  }

  public async listActiveSessionsByUser(userId: string): Promise<StorageResult<ActiveSessionRecord[]>> {
    const list = Array.from(this.activeSessions.values()).filter(s => s.userId === userId);
    return { success: true, data: list };
  }

  public async listActiveSessions(tenantId: string): Promise<StorageResult<ActiveSessionRecord[]>> {
    const list = Array.from(this.activeSessions.values()).filter(s => s.tenantId === tenantId);
    return { success: true, data: list };
  }

  public async deleteActiveSession(sessionId: string): Promise<StorageResult<void>> {
    this.activeSessions.delete(sessionId);
    return { success: true, data: undefined };
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

  public async listAccounts(tenantId: string): Promise<StorageResult<Account[]>> {
    const list: Account[] = [];
    for (const [key, acc] of this.accounts.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        list.push(acc);
      }
    }
    return { success: true, data: list };
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

  public async deleteJournalEntry(tenantId: string, entryId: string): Promise<StorageResult<void>> {
    const key = `${tenantId}:${entryId}`;
    const entry = this.journalEntries.get(key);
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
    // Wave 7.5E & Section 13.1: Defense-in-depth immutable posted entry
    if (entry.status === 'POSTED' || entry.status === 'REVERSED') {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/immutable-posted-entry',
          title: 'حظر حذف القيد المعتمد',
          status: 403,
          detail: 'ممنوع نظامياً: لا يجوز حذف أو تعديل قيد محاسبي مرحل (POSTED) بحكم الثوابت المحاسبية (بند 13.1). التصحيح يتم حصرًا عبر قيد عكسي.',
        },
      };
    }
    this.journalEntries.delete(key);
    return { success: true, data: undefined };
  }

  public async getPeriodForDate(tenantId: string, date: string): Promise<StorageResult<AccountingPeriod | null>> {
    const target = new Date(date).getTime();
    const period = Array.from(this.accountingPeriods.values()).find((p) => {
      if (p.tenantId !== tenantId) return false;
      const start = new Date(p.startDate).getTime();
      const end = new Date(p.endDate).getTime();
      return target >= start && target <= end;
    });
    return { success: true, data: period ? { ...period } : null };
  }

  public async setPeriodStatus(
    tenantId: string,
    periodId: string,
    status: AccountingPeriodStatus,
    actorId: string,
    reason?: string
  ): Promise<StorageResult<AccountingPeriod>> {
    const key = `${tenantId}:${periodId}`;
    let period = this.accountingPeriods.get(key);
    if (!period) {
      period = {
        id: periodId,
        tenantId,
        code: periodId,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        status: 'OPEN',
      };
    }
    const updated: AccountingPeriod = {
      ...period,
      status,
      closedAt: status === 'CLOSED' ? new Date().toISOString() : undefined,
      closedBy: status === 'CLOSED' ? actorId : undefined,
      reopenedBy: status === 'REOPENED' ? actorId : undefined,
      reopenedReason: status === 'REOPENED' ? reason : undefined,
    };
    this.accountingPeriods.set(key, updated);
    return { success: true, data: updated };
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

  // Synchronous between read, check and write => atomic with respect to the event loop (same guarantee as the row lock in PostgreSQL)
  public async approveStep(
    tenantId: string,
    requestId: string,
    approverId: string,
    idempotencyKey: string,
    approverRole?: string
  ): Promise<StorageResult<ApprovalRequest>> {
    const cacheKey = `${tenantId}:approveStep:${idempotencyKey}`;
    if (idempotencyKey && this.idempotencyRecords.has(cacheKey)) {
      return { success: true, data: this.cloneApproval(this.idempotencyRecords.get(cacheKey)) };
    }
    const req = this.findApproval(tenantId, requestId);
    if (!req) {
      return { success: false, error: this.approvalProblem(404, 'request-not-found', 'طلب الاعتماد غير موجود', `تعذر العثور على طلب الاعتماد ${requestId}`) };
    }
    const ev = this.evaluateApprovalAction(req, approverId, approverRole);
    if (!ev.ok) return { success: false, error: (ev as any).error };
    const steps = req.steps.map(x => ({ ...x }));
    steps[ev.index].status = 'APPROVED';
    steps[ev.index].approverId = approverId;
    steps[ev.index].actionTimestamp = new Date().toISOString();
    const pending = steps.filter(x => x.status === 'PENDING').sort((x, y) => x.stepNumber - y.stepNumber);
    const updated: ApprovalRequest = {
      ...req,
      steps,
      status: pending.length > 0 ? 'PENDING' : 'APPROVED',
      currentStep: pending.length > 0 ? pending[0].stepNumber : req.currentStep,
    };
    this.saveApproval(tenantId, updated);
    if (idempotencyKey) this.idempotencyRecords.set(cacheKey, updated);
    return { success: true, data: this.cloneApproval(updated) };
  }

  public async rejectApprovalStep(
    tenantId: string,
    requestId: string,
    approverId: string,
    approverRole: string,
    reason: string,
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>> {
    const cleanReason = (reason || '').trim();
    if (cleanReason.length < 3 || cleanReason.length > 500) {
      return { success: false, error: this.approvalProblem(400, 'invalid-reject-reason', 'سبب الرفض مطلوب', 'سبب الرفض إلزامي ويجب أن يتراوح بين 3 و500 حرف.') };
    }
    const cacheKey = `${tenantId}:rejectApprovalStep:${idempotencyKey}`;
    if (idempotencyKey && this.idempotencyRecords.has(cacheKey)) {
      return { success: true, data: this.cloneApproval(this.idempotencyRecords.get(cacheKey)) };
    }
    const req = this.findApproval(tenantId, requestId);
    if (!req) {
      return { success: false, error: this.approvalProblem(404, 'request-not-found', 'طلب الاعتماد غير موجود', `تعذر العثور على طلب الاعتماد ${requestId}`) };
    }
    const ev = this.evaluateApprovalAction(req, approverId, approverRole);
    if (!ev.ok) return { success: false, error: (ev as any).error };
    const steps = req.steps.map(x => ({ ...x }));
    steps[ev.index].status = 'REJECTED';
    steps[ev.index].approverId = approverId;
    steps[ev.index].actionTimestamp = new Date().toISOString();
    steps[ev.index].rejectReason = cleanReason;
    const updated: ApprovalRequest = { ...req, steps, status: 'REJECTED', rejectReason: cleanReason, rejectedStep: steps[ev.index].stepNumber };
    this.saveApproval(tenantId, updated);
    if (idempotencyKey) this.idempotencyRecords.set(cacheKey, updated);
    return { success: true, data: this.cloneApproval(updated) };
  }

  public async getApprovalRequest(tenantId: string, id: string): Promise<StorageResult<ApprovalRequest | null>> {
    const found = this.findApproval(tenantId, id);
    return { success: true, data: found ? this.cloneApproval(found) : null };
  }

  public async listApprovalRequests(
    tenantId: string,
    filter?: { status?: string; documentType?: string; documentId?: string }
  ): Promise<StorageResult<ApprovalRequest[]>> {
    const out: ApprovalRequest[] = [];
    for (const [key, r] of this.approvalRequests.entries()) {
      if (!key.startsWith(`${tenantId}:`)) continue;
      if (filter?.status && r.status !== filter.status) continue;
      if (filter?.documentType && r.documentType !== filter.documentType) continue;
      if (filter?.documentId && r.documentId !== filter.documentId) continue;
      out.push(this.cloneApproval(r));
    }
    out.sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : 0));
    return { success: true, data: out };
  }

  private approvalPolicies = new Map<string, ApprovalPolicy>();

  public async getApprovalPolicy(tenantId: string, documentType: ApprovalDocumentType): Promise<StorageResult<ApprovalPolicy | null>> {
    const p = this.approvalPolicies.get(`${tenantId}:${documentType}`);
    return { success: true, data: p ? JSON.parse(JSON.stringify(p)) : null };
  }

  public async listApprovalPolicies(tenantId: string): Promise<StorageResult<ApprovalPolicy[]>> {
    const out: ApprovalPolicy[] = [];
    for (const [key, p] of this.approvalPolicies.entries()) if (key.startsWith(`${tenantId}:`)) out.push(JSON.parse(JSON.stringify(p)));
    return { success: true, data: out };
  }

  public async saveApprovalPolicy(tenantId: string, policy: ApprovalPolicy, idempotencyKey: string): Promise<StorageResult<ApprovalPolicy>> {
    const cacheKey = `${tenantId}:saveApprovalPolicy:${idempotencyKey}`;
    if (idempotencyKey && this.idempotencyRecords.has(cacheKey)) return { success: true, data: JSON.parse(JSON.stringify(this.idempotencyRecords.get(cacheKey))) };
    const key = `${tenantId}:${policy.documentType}`;
    const existing = this.approvalPolicies.get(key);
    const saved: ApprovalPolicy = {
      ...policy,
      tenantId,
      id: existing?.id || policy.id,
      version: (existing?.version || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.approvalPolicies.set(key, saved);
    if (idempotencyKey) this.idempotencyRecords.set(cacheKey, saved);
    return { success: true, data: JSON.parse(JSON.stringify(saved)) };
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

  public async consumeRefreshToken(tokenHash: string, revokedAt: number): Promise<StorageResult<boolean>> {
    const rec = this.refreshTokens.get(tokenHash);
    if (!rec || rec.isUsed) return { success: true, data: false };
    rec.isUsed = true;
    rec.revokedAt = revokedAt;
    return { success: true, data: true };
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

  // Phase 2 Implementations

  private seedDefaultTaxRules() {
    const defaultRules: CountryTaxRule[] = [
      {
        countryCode: 'SA',
        countryNameAr: 'المملكة العربية السعودية',
        standardVatRate: 0.15,
        currencyCode: 'SAR',
        taxAuthorityName: 'هيئة الزكاة والضريبة والجمارك (ZATCA)',
        taxIdFormatRegex: '^3[0-9]{13}3$',
      },
      {
        countryCode: 'EG',
        countryNameAr: 'جمهورية مصر العربية',
        standardVatRate: 0.14,
        currencyCode: 'EGP',
        taxAuthorityName: 'مصلحة الضرائب المصرية (ETA)',
        taxIdFormatRegex: '^[0-9]{9}$',
      },
      {
        countryCode: 'AE',
        countryNameAr: 'الإمارات العربية المتحدة',
        standardVatRate: 0.05,
        currencyCode: 'AED',
        taxAuthorityName: 'الهيئة الاتحادية للضرائب (FTA)',
        taxIdFormatRegex: '^100[0-9]{12}$',
      },
    ];
    for (const r of defaultRules) {
      this.taxRules.set(r.countryCode, r);
    }
  }

  public async listTenants(): Promise<StorageResult<TenantCompany[]>> {
    return { success: true, data: Array.from(this.tenants.values()) };
  }

  public async listCompanyGroups(): Promise<StorageResult<CompanyGroup[]>> {
    return { success: true, data: Array.from(this.companyGroups.values()) };
  }

  public async getCompanyGroup(groupId: string): Promise<StorageResult<CompanyGroup>> {
    const g = this.companyGroups.get(groupId);
    if (!g) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/group-not-found',
          title: 'المجموعة غير موجودة',
          status: 404,
          detail: 'لا توجد مجموعة شركات بهذا المعرّف.',
        },
      };
    }
    return { success: true, data: g };
  }

  public async saveCompanyGroup(group: CompanyGroup, _idempotencyKey: string): Promise<StorageResult<CompanyGroup>> {
    this.companyGroups.set(group.id, group);
    return { success: true, data: group };
  }


  public async listGroupMasterItems(groupId: string): Promise<StorageResult<GroupMasterItem[]>> {
    const list = Array.from(this.groupMasterItems.values()).filter((i) => i.groupId === groupId);
    return { success: true, data: list };
  }

  public async getGroupMasterItem(groupId: string, itemId: string): Promise<StorageResult<GroupMasterItem>> {
    const item = this.groupMasterItems.get(`${groupId}:${itemId}`)
      || Array.from(this.groupMasterItems.values()).find((i) => i.groupId === groupId && (i.id === itemId || i.itemCode === itemId));
    if (!item) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/group-item-not-found',
          title: 'صنف المجموعة غير موجود',
          status: 404,
          detail: 'لا يوجد صنف رئيسي بهذا المعرّف في المجموعة.',
        },
      };
    }
    return { success: true, data: item };
  }

  public async saveGroupMasterItem(item: GroupMasterItem, _idempotencyKey: string): Promise<StorageResult<GroupMasterItem>> {
    this.groupMasterItems.set(`${item.groupId}:${item.id}`, { ...item });
    return { success: true, data: item };
  }

  public async listCrossCompanyTransfers(filter?: { groupId?: string; status?: string }): Promise<StorageResult<CrossCompanyTransfer[]>> {
    let list = Array.from(this.crossCompanyTransfers.values());
    if (filter?.groupId) list = list.filter((t) => t.groupId === filter.groupId);
    if (filter?.status) list = list.filter((t) => t.status === filter.status);
    return { success: true, data: list };
  }
  public async getCrossCompanyTransfer(id: string): Promise<StorageResult<CrossCompanyTransfer>> {
    const t = this.crossCompanyTransfers.get(id);
    if (!t) {
      return { success: false, error: { type: 'https://api.an-erp.local/errors/xcompany-not-found', title: 'التحويل غير موجود', status: 404, detail: 'لا يوجد تحويل بين شركات بهذا المعرّف.' } };
    }
    return { success: true, data: t };
  }
  public async saveCrossCompanyTransfer(tr: CrossCompanyTransfer, _idempotencyKey: string): Promise<StorageResult<CrossCompanyTransfer>> {
    this.crossCompanyTransfers.set(tr.id, { ...tr });
    return { success: true, data: tr };
  }

  public async overrideSequence(
    tenantId: string,
    sequenceKey: string,
    manualNumber: number,
    reason: string,
    authorizedBy: string,
    idempotencyKey: string
  ): Promise<StorageResult<SequenceResult>> {
    const key = `${tenantId}:${sequenceKey}`;
    this.sequences.set(key, manualNumber);
    const prefix = sequenceKey.toUpperCase().split('_')[0] || 'DOC';
    return {
      success: true,
      data: {
        sequenceNumber: manualNumber,
        formattedCode: `${prefix}-${String(manualNumber).padStart(6, '0')}`,
      },
    };
  }

  public async getAccountBalanceAsOf(
    tenantId: string,
    accountCode: string,
    asOfDate: string
  ): Promise<StorageResult<{ accountCode: string; debitTotal: number; creditTotal: number; balance: number; asOfDate: string }>> {
    const targetTime = new Date(asOfDate).getTime();
    let debitTotal = 0;
    let creditTotal = 0;

    for (const entry of this.journalEntries.values()) {
      if (entry.tenantId === tenantId && entry.status === 'POSTED') {
        const entryTime = new Date(entry.date).getTime();
        if (entryTime <= targetTime) {
          for (const line of entry.lines) {
            if (line.accountCode === accountCode) {
              debitTotal += Number(line.debit) || 0;
              creditTotal += Number(line.credit) || 0;
            }
          }
        }
      }
    }

    return {
      success: true,
      data: {
        accountCode,
        debitTotal,
        creditTotal,
        balance: debitTotal - creditTotal,
        asOfDate,
      },
    };
  }

  public async getCountryTaxRule(countryCode: string): Promise<StorageResult<CountryTaxRule>> {
    const rule = this.taxRules.get(countryCode.toUpperCase());
    if (!rule) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/tax-rule-not-found',
          title: 'قاعدة الضريبة غير موجودة',
          status: 404,
          detail: `لا توجد قاعدة ضريبية مسجلة للدولة (${countryCode})`,
        },
      };
    }
    return { success: true, data: { ...rule } };
  }

  public async listCountryTaxRules(): Promise<StorageResult<CountryTaxRule[]>> {
    return { success: true, data: Array.from(this.taxRules.values()) };
  }

  public async upsertCountryTaxRule(rule: CountryTaxRule): Promise<StorageResult<CountryTaxRule>> {
    this.taxRules.set(rule.countryCode.toUpperCase(), { ...rule });
    return { success: true, data: rule };
  }

  public async getTenantModules(tenantId: string): Promise<StorageResult<TenantModuleManifest[]>> {
    const list = this.tenantModules.get(tenantId) || [];
    return { success: true, data: [...list] };
  }

  public async enableTenantModules(
    tenantId: string,
    modules: TenantModuleManifest[],
    idempotencyKey: string
  ): Promise<StorageResult<TenantModuleManifest[]>> {
    const existing = this.tenantModules.get(tenantId) || [];
    const map = new Map<string, TenantModuleManifest>();
    for (const m of existing) map.set(m.moduleId, m);
    for (const m of modules) map.set(m.moduleId, { ...m, tenantId });
    const updated = Array.from(map.values());
    this.tenantModules.set(tenantId, updated);
    return { success: true, data: updated };
  }

  public async saveMasterItem(tenantId: string, item: MasterItem, idempotencyKey: string): Promise<StorageResult<MasterItem>> {
    this.masterItems.set(`${tenantId}:${item.id}`, { ...item });
    return { success: true, data: item };
  }

  public async getMasterItem(tenantId: string, itemId: string): Promise<StorageResult<MasterItem>> {
    for (const item of this.masterItems.values()) {
      if (item.tenantId === tenantId && (item.id === itemId || item.code === itemId)) {
        return { success: true, data: { ...item } };
      }
    }
    return {
      success: false,
      error: {
        type: 'https://api.an-erp.local/errors/item-not-found',
        title: 'الصنف غير موجود',
        status: 404,
        detail: `تعذر العثور على الصنف ${itemId}`,
      },
    };
  }

  public async listMasterItems(tenantId: string): Promise<StorageResult<MasterItem[]>> {
    const list = Array.from(this.masterItems.values()).filter((i) => i.tenantId === tenantId);
    return { success: true, data: list };
  }

  public async approveMasterItem(
    tenantId: string,
    itemId: string,
    approvedBy: string,
    idempotencyKey: string
  ): Promise<StorageResult<MasterItem>> {
    const item = await this.getMasterItem(tenantId, itemId);
    if (!item.success || !item.data) return item;

    const updated: MasterItem = {
      ...item.data,
      status: 'APPROVED',
      approvedBy,
      approvedAt: new Date().toISOString(),
    };
    this.masterItems.set(`${tenantId}:${updated.id}`, updated);
    return { success: true, data: updated };
  }

  public async saveMasterPartner(tenantId: string, partner: MasterPartner, idempotencyKey: string): Promise<StorageResult<MasterPartner>> {
    this.masterPartners.set(`${tenantId}:${partner.id}`, { ...partner });
    return { success: true, data: partner };
  }

  public async getMasterPartner(tenantId: string, partnerId: string): Promise<StorageResult<MasterPartner>> {
    for (const p of this.masterPartners.values()) {
      if (p.tenantId === tenantId && (p.id === partnerId || p.code === partnerId)) {
        return { success: true, data: { ...p } };
      }
    }
    return {
      success: false,
      error: {
        type: 'https://api.an-erp.local/errors/partner-not-found',
        title: 'الشريك التجاري غير موجود',
        status: 404,
        detail: `تعذر العثور على الشريك ${partnerId}`,
      },
    };
  }

  public async listMasterPartners(tenantId: string, type?: 'CUSTOMER' | 'VENDOR'): Promise<StorageResult<MasterPartner[]>> {
    const list = Array.from(this.masterPartners.values()).filter(
      (p) => p.tenantId === tenantId && (!type || p.type === type)
    );
    return { success: true, data: list };
  }

  public async approveMasterPartner(
    tenantId: string,
    partnerId: string,
    approvedBy: string,
    idempotencyKey: string
  ): Promise<StorageResult<MasterPartner>> {
    const p = await this.getMasterPartner(tenantId, partnerId);
    if (!p.success || !p.data) return p;

    const updated: MasterPartner = {
      ...p.data,
      status: 'APPROVED',
      approvedBy,
      approvedAt: new Date().toISOString(),
    };
    this.masterPartners.set(`${tenantId}:${updated.id}`, updated);
    return { success: true, data: updated };
  }

  public async appendAuditChain(
    tenantId: string,
    entry: Omit<AuditChainEntry, 'sequenceNumber' | 'previousHash' | 'entryHash'>
  ): Promise<StorageResult<AuditChainEntry>> {
    const chain = this.auditChains.get(tenantId) || [];
    const seq = chain.length + 1;
    const prevHash = chain.length === 0 ? GENESIS_PREVIOUS_HASH : chain[chain.length - 1].entryHash;
    const hash = AuditChainService.computeRecordHash(
      seq,
      tenantId,
      entry.timestamp,
      entry.actorId,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.beforeState,
      entry.afterState,
      prevHash
    );

    const fullRecord: AuditChainEntry = {
      ...entry,
      sequenceNumber: seq,
      previousHash: prevHash,
      entryHash: hash,
    };

    chain.push(fullRecord);
    this.auditChains.set(tenantId, chain);
    return { success: true, data: fullRecord };
  }

  public async getAuditChain(tenantId: string, limit = 100): Promise<StorageResult<AuditChainEntry[]>> {
    const chain = this.auditChains.get(tenantId) || [];
    return { success: true, data: chain.slice(0, limit) };
  }

  public async verifyAuditChain(
    tenantId: string
  ): Promise<StorageResult<{ isValid: boolean; verifiedRecordsCount: number; brokenAtSequence?: number; messageAr: string }>> {
    const chain = this.auditChains.get(tenantId) || [];
    if (chain.length === 0) {
      return {
        success: true,
        data: {
          isValid: true,
          verifiedRecordsCount: 0,
          messageAr: 'سلسلة التدقيق فارغة (لا توجد سجلات بعد).',
        },
      };
    }

    let prev = GENESIS_PREVIOUS_HASH;
    for (const record of chain) {
      if (record.previousHash !== prev) {
        return {
          success: true,
          data: {
            isValid: false,
            verifiedRecordsCount: record.sequenceNumber - 1,
            brokenAtSequence: record.sequenceNumber,
            messageAr: `فشل التحقق: انقطاع في الهاش السابق عند السجل رقم ${record.sequenceNumber}.`,
          },
        };
      }

      const expected = AuditChainService.computeRecordHash(
        record.sequenceNumber,
        record.tenantId,
        record.timestamp,
        record.actorId,
        record.action,
        record.entityType,
        record.entityId,
        record.beforeState,
        record.afterState,
        record.previousHash
      );

      if (expected !== record.entryHash) {
        return {
          success: true,
          data: {
            isValid: false,
            verifiedRecordsCount: record.sequenceNumber - 1,
            brokenAtSequence: record.sequenceNumber,
            messageAr: `تم كشف تلاعب محتوى في السجل رقم ${record.sequenceNumber}. الهاش غير متطابق!`,
          },
        };
      }
      prev = record.entryHash;
    }

    return {
      success: true,
      data: {
        isValid: true,
        verifiedRecordsCount: chain.length,
        messageAr: 'تم التحقق المشفر من سلامة سلسلة سجلات التدقيق بالكامل (100% مطابقة وخالية من التلاعب).',
      },
    };
  }

  // Phase 3A: Organizational Hierarchy
  public async saveOrgNode(tenantId: string, node: OrgNode, idempotencyKey: string): Promise<StorageResult<OrgNode>> {
    const key = `${tenantId}:${node.id}`;
    this.orgNodes.set(key, { ...node, tenantId });
    return { success: true, data: this.orgNodes.get(key)! };
  }

  public async getOrgNode(tenantId: string, nodeId: string): Promise<StorageResult<OrgNode>> {
    const key = `${tenantId}:${nodeId}`;
    const node = this.orgNodes.get(key);
    if (!node) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/node-not-found',
          title: 'العقدة التنظيمية غير موجودة',
          status: 404,
          detail: `العقدة ${nodeId} غير مسجلة في هيكل المنشأة`,
        },
      };
    }
    return { success: true, data: node };
  }

  public async listOrgHierarchy(tenantId: string, rootNodeId?: string): Promise<StorageResult<OrgNode[]>> {
    const allForTenant = Array.from(this.orgNodes.values()).filter((n) => n.tenantId === tenantId);
    if (!rootNodeId) {
      return { success: true, data: allForTenant };
    }

    // Traverse recursively
    const result: OrgNode[] = [];
    const queue: string[] = [rootNodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const found = allForTenant.find((n) => n.id === currentId);
      if (found) {
        result.push(found);
        const children = allForTenant.filter((n) => n.parentId === currentId);
        for (const child of children) {
          queue.push(child.id);
        }
      }
    }

    return { success: true, data: result };
  }

  public async getUserVisibleNodes(tenantId: string, userAssignedNodeId: string): Promise<StorageResult<OrgNode[]>> {
    return this.listOrgHierarchy(tenantId, userAssignedNodeId);
  }

  // Phase 3C: Break-Glass
  public async approveBreakGlass(
    tenantId: string,
    requestId: string,
    breakGlass: BreakGlassDetails,
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>> {
    const req = this.approvalRequests.get(`${tenantId}:${requestId}`) || this.approvalRequests.get(requestId);
    if (!req || req.tenantId !== tenantId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/request-not-found',
          title: 'طلب الاعتماد غير موجود',
          status: 404,
          detail: `طلب الاعتماد ${requestId} غير مسجل`,
        },
      };
    }

    if (breakGlass.actor1Id === breakGlass.actor2Id) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/break-glass-single-actor',
          title: 'رفض: التجاوز الطارئ يتطلب شخصين مختلفين',
          status: 403,
          detail: 'لا يجوز أن يكون الشخص الأول والثاني في التحكم المزدوج نفس الشخص.',
        },
      };
    }

    if (req.initiatorId === breakGlass.actor1Id || req.initiatorId === breakGlass.actor2Id) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/break-glass-initiator-conflict',
          title: 'رفض: منشئ المستند لا يجوز أن يكون أحد أطراف التجاوز الطارئ',
          status: 403,
          detail: 'لا يجوز لمنشئ المستند أن يكون أحد الشخصين المنفّذين للتجاوز الطارئ على مستنده هو نفسه.',
        },
      };
    }

    const updatedSteps = req.steps.map((s) => ({
      ...s,
      status: 'APPROVED' as const,
      approverId: `${breakGlass.actor1Id}+${breakGlass.actor2Id}`,
      comment: `تجاوز طارئ Break-Glass: ${breakGlass.reasonAr}`,
      actionTimestamp: breakGlass.executedAt,
    }));

    const updatedReq: ApprovalRequest = {
      ...req,
      status: 'APPROVED',
      steps: updatedSteps,
      breakGlass,
    };
    this.approvalRequests.set(`${tenantId}:${requestId}`, updatedReq);
    this.approvalRequests.set(requestId, updatedReq);
    return { success: true, data: updatedReq };
  }

  // Phase 3E: Privacy & Anonymization
  public async anonymizeUserPii(
    tenantId: string,
    userId: string,
    actorId: string,
    idempotencyKey: string
  ): Promise<StorageResult<{ userId: string; anonymizedAt: string }>> {
    const user = this.users.get(userId);
    if (!user || user.tenantId !== tenantId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/user-not-found',
          title: 'المستخدم غير موجود',
          status: 404,
          detail: `تعذر العثور على المستخدم ${userId} ضمن مستأجر ${tenantId}`,
        },
      };
    }

    const scrubbed: User = {
      ...user,
      fullName: 'مستخدم مجهول (حق النسيان - GDPR/PDPL)',
      email: `anonymized_${userId.slice(-6)}@privacy.an-erp.local`,
      username: `anon_${userId.slice(-6)}`,
      encryptedPii: undefined,
      twoFactorSecret: undefined,
      twoFactorEnabled: false,
      backupCodes: undefined,
      hashedBackupCodes: undefined,
      status: 'INACTIVE',
    };
    this.users.set(userId, scrubbed);
    return { success: true, data: { userId, anonymizedAt: new Date().toISOString() } };
  }

  // Phase 4.5: Operational Audit & Custom Fields Persistence (4.5E)
  public async saveAuditRecord(record: OperationalAuditRecord): Promise<StorageResult<OperationalAuditRecord>> {
    this.auditRecords.unshift(record);
    if (this.auditRecords.length > 500) this.auditRecords.pop();
    return { success: true, data: record };
  }

  public async getAuditRecords(tenantId: string, limit: number = 100): Promise<StorageResult<OperationalAuditRecord[]>> {
    const list = this.auditRecords.filter(r => r.tenantId === tenantId).slice(0, limit);
    return { success: true, data: list };
  }

  public async saveCustomField(tenantId: string, field: CustomFieldDefinition): Promise<StorageResult<CustomFieldDefinition>> {
    this.customFields.set(`${tenantId}:${field.id}`, field);
    return { success: true, data: field };
  }

  public async getCustomFields(tenantId: string, module?: string): Promise<StorageResult<CustomFieldDefinition[]>> {
    let list = Array.from(this.customFields.values()).filter(f => f.tenantId === tenantId);
    if (module) list = list.filter(f => f.module === module);
    return { success: true, data: list };
  }

  public async checkIdempotencyRecord(tenantId: string, key: string, operation: string): Promise<StorageResult<any | null>> {
    const cacheKey = `${tenantId}:${operation}:${key}`;
    const cached = this.idempotencyRecords.get(cacheKey) || null;
    return { success: true, data: cached };
  }

  public async saveIdempotencyRecord(tenantId: string, key: string, operation: string, payload: any): Promise<StorageResult<void>> {
    const cacheKey = `${tenantId}:${operation}:${key}`;
    this.idempotencyRecords.set(cacheKey, payload);
    return { success: true, data: undefined };
  }

  // Phase 5: Cash Custody Operations
  public async createCashCustody(tenantId: string, custody: CashCustody, idempotencyKey: string): Promise<StorageResult<CashCustody>> {
    const cached = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'createCashCustody');
    if (cached.success && cached.data) {
      return { success: true, data: cached.data };
    }
    const key = `${tenantId}:${custody.id}`;
    this.cashCustodies.set(key, { ...custody, tenantId });
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'createCashCustody', custody);
    return { success: true, data: custody };
  }

  public async getCashCustody(tenantId: string, custodyId: string): Promise<StorageResult<CashCustody | null>> {
    for (const [k, c] of this.cashCustodies.entries()) {
      if (c.tenantId === tenantId && (c.id === custodyId || c.custodyCode === custodyId)) {
        return { success: true, data: { ...c } };
      }
    }
    return { success: true, data: null };
  }

  public async listCashCustodies(tenantId: string, filter?: { status?: string; employeeId?: string }): Promise<StorageResult<CashCustody[]>> {
    let list = Array.from(this.cashCustodies.values()).filter(c => c.tenantId === tenantId);
    if (filter?.status) {
      list = list.filter(c => c.status === filter.status);
    }
    if (filter?.employeeId) {
      list = list.filter(c => c.employeeId === filter.employeeId);
    }
    return { success: true, data: list.map(c => ({ ...c })) };
  }

  public async updateCashCustody(tenantId: string, custodyId: string, updates: Partial<CashCustody>): Promise<StorageResult<CashCustody>> {
    for (const [k, c] of this.cashCustodies.entries()) {
      if (c.tenantId === tenantId && (c.id === custodyId || c.custodyCode === custodyId)) {
        const updated = { ...c, ...updates, updatedAt: new Date().toISOString() };
        this.cashCustodies.set(k, updated);
        return { success: true, data: { ...updated } };
      }
    }
    return {
      success: false,
      error: {
        type: 'https://api.an-erp.local/errors/not-found',
        title: 'العهدة غير موجودة',
        status: 404,
        detail: 'لم يتم العثور على سجل العهدة المطلوب تحديثه.',
      },
    };
  }

  public async recordCustodyExpense(
    tenantId: string,
    transaction: CashCustodyTransaction,
    idempotencyKey: string,
    skipBalanceDeduction: boolean = false
  ): Promise<StorageResult<CashCustodyTransaction>> {
    const cached = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'recordCustodyExpense');
    if (cached.success && cached.data) {
      return { success: true, data: cached.data };
    }
    if (!skipBalanceDeduction) {
      // Deduct custody available balance
      const custody = await this.getCashCustody(tenantId, transaction.custodyId);
      if (!custody.success || !custody.data) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/not-found',
            title: 'العهدة غير موجودة',
            status: 404,
            detail: 'العهدة النقدية غير موجودة لتسجيل المصروف.',
          },
        };
      }
      const current = custody.data;
      const newBalance = Number(current.currentBalance) - Number(transaction.amount);
      await this.updateCashCustody(tenantId, current.id, { currentBalance: newBalance });
    }

    const key = `${tenantId}:${transaction.id}`;
    this.cashCustodyTransactions.set(key, { ...transaction, tenantId });
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'recordCustodyExpense', transaction);
    return { success: true, data: transaction };
  }

  public async listCustodyTransactions(tenantId: string, custodyId?: string): Promise<StorageResult<CashCustodyTransaction[]>> {
    let list = Array.from(this.cashCustodyTransactions.values()).filter(t => t.tenantId === tenantId);
    if (custodyId) {
      list = list.filter(t => t.custodyId === custodyId);
    }
    return { success: true, data: list.map(t => ({ ...t })) };
  }

  public async saveCustodySettlement(tenantId: string, settlement: CashCustodySettlement, idempotencyKey: string): Promise<StorageResult<CashCustodySettlement>> {
    const cached = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'saveCustodySettlement');
    if (cached.success && cached.data) {
      return { success: true, data: cached.data };
    }

    // Wave 7.5D & Section 7.1: Adapter-level SoD enforcement on STORED record
    const custody = this.cashCustodies.get(`${tenantId}:${settlement.custodyId}`);
    if (custody && custody.openedBy === settlement.settledBy) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/sod-violation',
          title: 'تعارض مصالح - فصل الصلاحيات والواجبات',
          status: 403,
          detail: 'ممنوع نظامياً: لا يجوز لمن قام بفتح وتخصيص العهدة أن يعتمد تسويتها النهائية (بند 7.1). تم التحقق بناءً على القيمة المخزنة فعلياً في قاعدة البيانات.',
        },
      };
    }

    // Mark pending transactions as INCLUDED_IN_SETTLEMENT
    for (const [k, tx] of this.cashCustodyTransactions.entries()) {
      if (tx.tenantId === tenantId && tx.custodyId === settlement.custodyId && tx.status === 'RECORDED') {
        this.cashCustodyTransactions.set(k, { ...tx, status: 'INCLUDED_IN_SETTLEMENT', settlementId: settlement.id });
      }
    }
    const key = `${tenantId}:${settlement.id}`;
    this.cashCustodySettlements.set(key, { ...settlement, tenantId });
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'saveCustodySettlement', settlement);
    return { success: true, data: settlement };
  }

  public async listCustodySettlements(tenantId: string, custodyId?: string): Promise<StorageResult<CashCustodySettlement[]>> {
    let list = Array.from(this.cashCustodySettlements.values()).filter(s => s.tenantId === tenantId);
    if (custodyId) {
      list = list.filter(s => s.custodyId === custodyId);
    }
    return { success: true, data: list.map(s => ({ ...s })) };
  }

  // Phase 6: Expenses Module Methods
  public async createExpenseRequest(
    tenantId: string,
    request: ExpenseRequest,
    lines: ExpenseLine[],
    attachments: ExpenseAttachment[],
    idempotencyKey: string
  ): Promise<StorageResult<ExpenseRequest>> {
    const cached = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'createExpenseRequest');
    if (cached.success && cached.data) {
      return { success: true, data: cached.data };
    }
    const key = `${tenantId}:${request.id}`;
    this.expenseRequests.set(key, { ...request, tenantId });
    this.expenseLines.set(request.id, lines.map(l => ({ ...l, tenantId })));
    this.expenseAttachments.set(request.id, attachments.map(a => ({ ...a, tenantId })));
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'createExpenseRequest', request);
    return { success: true, data: request };
  }

  public async getExpenseRequest(
    tenantId: string,
    requestId: string
  ): Promise<StorageResult<{ request: ExpenseRequest; lines: ExpenseLine[]; attachments: ExpenseAttachment[] } | null>> {
    const key = `${tenantId}:${requestId}`;
    const request = this.expenseRequests.get(key);
    if (!request) {
      return { success: true, data: null };
    }
    const lines = this.expenseLines.get(requestId) || [];
    const attachments = this.expenseAttachments.get(requestId) || [];
    return {
      success: true,
      data: {
        request: { ...request },
        lines: lines.map(l => ({ ...l })),
        attachments: attachments.map(a => ({ ...a })),
      },
    };
  }

  public async listExpenseRequests(
    tenantId: string,
    filter?: { status?: string; employeeId?: string }
  ): Promise<StorageResult<ExpenseRequest[]>> {
    let list = Array.from(this.expenseRequests.values()).filter(r => r.tenantId === tenantId);
    if (filter?.status) {
      list = list.filter(r => r.status === filter.status);
    }
    if (filter?.employeeId) {
      list = list.filter(r => r.employeeId === filter.employeeId);
    }
    return { success: true, data: list.map(r => ({ ...r })) };
  }

  public async updateExpenseRequestStatus(
    tenantId: string,
    requestId: string,
    updates: Partial<ExpenseRequest>,
    idempotencyKey: string
  ): Promise<StorageResult<ExpenseRequest>> {
    const cached = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'updateExpenseRequestStatus');
    if (cached.success && cached.data) {
      return { success: true, data: cached.data };
    }
    const key = `${tenantId}:${requestId}`;
    const existing = this.expenseRequests.get(key);
    if (!existing) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/expense-not-found',
          title: 'طلب الصرف غير موجود',
          status: 404,
          detail: 'تعذر العثور على طلب الصرف.',
        },
      };
    }

    // Wave 7.5D & Section 7.1: Adapter-level SoD enforcement on STORED record
    const storedCreator = (existing as any).createdBy || existing.submittedBy || existing.employeeId;
    if (updates.approvedL1By && updates.approvedL1By === storedCreator) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/sod-violation',
          title: 'تعارض مصالح - فصل الصلاحيات والواجبات',
          status: 403,
          detail: 'ممنوع نظامياً: لا يجوز لمنشئ أو مقدم طلب الصرف اعتماد طلبه (SoD بند 7.1). تم التحقق بناءً على القيمة المخزنة بالمخزن.',
        },
      };
    }
    if (updates.approvedBy && updates.approvedBy === storedCreator) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/sod-violation',
          title: 'تعارض مصالح - فصل الصلاحيات والواجبات',
          status: 403,
          detail: 'ممنوع نظامياً: لا يجوز لمنشئ أو مقدم طلب الصرف اعتماد طلبه (SoD بند 7.1). تم التحقق بناءً على القيمة المخزنة بالمخزن.',
        },
      };
    }

    const updated: ExpenseRequest = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.expenseRequests.set(key, updated);
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'updateExpenseRequestStatus', updated);
    return { success: true, data: updated };
  }

  public async listExpenseCategories(tenantId: string): Promise<StorageResult<ExpenseCategory[]>> {
    // Wave 7.5A & Section 5.4: Strictly filter by tenantId — zero cross-tenant fallback
    const list = Array.from(this.expenseCategories.values()).filter(
      c => c.tenantId === tenantId
    );
    return { success: true, data: list.map(c => ({ ...c })) };
  }

  public async saveExpenseCategory(
    tenantId: string,
    category: ExpenseCategory,
    idempotencyKey: string
  ): Promise<StorageResult<ExpenseCategory>> {
    const key = `${tenantId}:${category.code}`;
    this.expenseCategories.set(key, { ...category, tenantId });
    return { success: true, data: category };
  }

  // Phase 7: Inventory & Warehouses (InMemory)
  public async saveWarehouse(tenantId: string, warehouse: Warehouse, idempotencyKey: string): Promise<StorageResult<Warehouse>> {
    this.warehouses.set(`${tenantId}:${warehouse.id}`, { ...warehouse, tenantId });
    return { success: true, data: warehouse };
  }

  public async getWarehouse(tenantId: string, warehouseId: string): Promise<StorageResult<Warehouse | null>> {
    const wh = this.warehouses.get(`${tenantId}:${warehouseId}`);
    return { success: true, data: wh ? { ...wh } : null };
  }

  public async listWarehouses(tenantId: string, filter?: { isActive?: boolean; branchId?: string }): Promise<StorageResult<Warehouse[]>> {
    let list = Array.from(this.warehouses.values()).filter(w => w.tenantId === tenantId);
    if (filter?.isActive !== undefined) list = list.filter(w => w.isActive === filter.isActive);
    if (filter?.branchId) list = list.filter(w => w.branchId === filter.branchId);
    return { success: true, data: list.map(w => ({ ...w })) };
  }

  public async saveWarehouseBin(tenantId: string, bin: WarehouseBin): Promise<StorageResult<WarehouseBin>> {
    this.warehouseBins.set(`${tenantId}:${bin.id}`, { ...bin, tenantId });
    return { success: true, data: bin };
  }

  public async listWarehouseBins(tenantId: string, warehouseId: string): Promise<StorageResult<WarehouseBin[]>> {
    const list = Array.from(this.warehouseBins.values()).filter(b => b.tenantId === tenantId && b.warehouseId === warehouseId);
    return { success: true, data: list.map(b => ({ ...b })) };
  }

  public async saveStockItem(tenantId: string, item: StockItem, idempotencyKey: string): Promise<StorageResult<StockItem>> {
    const prevMethod = this.stockItems.get(`${tenantId}:${item.id}`)?.valuationMethod;
    this.stockItems.set(`${tenantId}:${item.id}`, { ...item, tenantId });
    // Phase 13 (COST-001): changing the valuation method of an existing item re-bases its cost layers
    if (prevMethod !== undefined) {
      const norm = (m: any) => (m === 'FIFO' || m === 'SPECIFIC_LOT' ? m : 'WEIGHTED_AVERAGE');
      if (norm(prevMethod) !== norm(item.valuationMethod)) {
        const affected = this.applyValuationMethodChangeMem(tenantId, item.id, norm(prevMethod), norm(item.valuationMethod));
        await this.appendSystemChangeLog({
          id: `scl-valm-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: new Date().toISOString(),
          actor: (item as any).updatedBy || 'system',
          changeType: 'PLATFORM_MANAGEMENT',
          module: 'INVENTORY',
          entitiesAffected: [`StockItem:${item.id}`],
          summaryAr: `تغيير طريقة تقييم الصنف ${item.itemCode} من ${norm(prevMethod)} إلى ${norm(item.valuationMethod)} (مستودعات متأثرة: ${affected})`,
          beforeState: { valuationMethod: norm(prevMethod) },
          afterState: { valuationMethod: norm(item.valuationMethod), warehousesAffected: affected },
          version: '1.0',
        });
      }
    }
    return { success: true, data: item };
  }

  // Phase 13 (COST-001) ---------------------------------------------------------------------------------------
  public async getInventorySettings(tenantId: string): Promise<StorageResult<InventorySettings>> {
    const s = this.inventorySettings.get(tenantId);
    return { success: true, data: s ? { ...s } : defaultInventorySettings(tenantId) };
  }

  public async saveInventorySettings(tenantId: string, settings: Partial<Omit<InventorySettings, 'tenantId'>>, actorId: string, idempotencyKey: string): Promise<StorageResult<InventorySettings>> {
    const cacheKey = `${tenantId}:saveInventorySettings:${idempotencyKey}`;
    if (idempotencyKey && this.idempotencyRecords.has(cacheKey)) return { success: true, data: { ...this.idempotencyRecords.get(cacheKey) } };
    const cur = this.inventorySettings.get(tenantId) || defaultInventorySettings(tenantId);
    const saved: InventorySettings = { ...cur, ...settings, tenantId, updatedBy: actorId, updatedAt: new Date().toISOString() };
    this.inventorySettings.set(tenantId, saved);
    if (idempotencyKey) this.idempotencyRecords.set(cacheKey, saved);
    return { success: true, data: { ...saved } };
  }

  private getValuationMethodMem(tenantId: string, itemId: string): 'WEIGHTED_AVERAGE' | 'FIFO' | 'SPECIFIC_LOT' {
    const it = this.stockItems.get(`${tenantId}:${itemId}`);
    return it && (it.valuationMethod === 'FIFO' || it.valuationMethod === 'SPECIFIC_LOT') ? it.valuationMethod : 'WEIGHTED_AVERAGE';
  }

  // WEIGHTED_AVERAGE items return { layered: false } and are never touched. FIFO / SPECIFIC_LOT items: entry adds a layer,
  // exit consumes layers (fails closed BEFORE any change when the layers cannot cover the quantity).
  private layerStepMem(tenantId: string, m: StockMovement, isIn: boolean, existing: WarehouseStock, newQty: number): {
    ok: boolean;
    layered: boolean;
    totalValue?: number;
    averageCost?: number;
    unitCost?: number;
    totalCost?: number;
    error?: { type: string; title: string; status: number; detail: string };
  } {
    const method = this.getValuationMethodMem(tenantId, m.itemId);
    if (method === 'WEIGHTED_AVERAGE') return { ok: true, layered: false };
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const lkey = `${tenantId}:${m.warehouseId}:${m.itemId}`;
    const layers = this.costLayers.get(lkey) || [];
    const qty = Math.abs(m.quantity);
    if (isIn) {
      if (qty > 0) {
        const po = m.sourcePoNumber || (m.sourceDocumentType === 'PURCHASE_ORDER' ? m.sourceDocumentNumber : undefined) || null;
        this.costLayers.set(lkey, [...layers, { id: `lyr-${m.id}-${Math.random().toString(36).substr(2, 4)}`, poNumber: po, remainingQty: qty, unitCost: m.unitCost, receivedAt: new Date().toISOString(), isOpening: false }]);
      }
      const tv = existing.totalValue + (m.movementType === 'TRANSFER_IN' && m.totalCost > 0 ? m.totalCost : qty * m.unitCost);
      return { ok: true, layered: true, totalValue: round2(tv), averageCost: round2(newQty > 0 ? tv / newQty : existing.averageCost), unitCost: m.unitCost, totalCost: m.totalCost };
    }
    const plan = planCostLayerConsumption(layers, qty, method, m.sourcePoNumber);
    if (!plan.ok) {
      return plan.code === 'insufficient-lot-stock'
        ? { ok: false, layered: true, error: { type: 'https://api.an-erp.local/errors/insufficient-lot-stock', title: 'رصيد أمر الشراء غير كافٍ', status: 422,
            detail: `رصيد أمر الشراء ${m.sourcePoNumber} للصنف ${m.itemNameAr} (${plan.available}) أقل من الكمية المطلوبة (${qty}). فشلت العملية بالكامل ذرياً.` } }
        : { ok: false, layered: true, error: { type: 'https://api.an-erp.local/errors/insufficient-stock', title: 'الرصيد المخزني غير كافٍ', status: 422,
            detail: `رصيد طبقات التكلفة للصنف ${m.itemNameAr} (${plan.available}) أقل من الكمية المطلوبة للصرف (${qty}). فشلت العملية بالكامل ذرياً.` } };
    }
    const taken = new Map(plan.takes.map(t => [t.layerId, t.newRemaining] as [string, number]));
    this.costLayers.set(lkey, layers.map(l => (taken.has(l.id) ? { ...l, remainingQty: taken.get(l.id)! } : l)).filter(l => l.remainingQty > 0.00005));
    const tv = Math.max(0, existing.totalValue - plan.totalCost);
    return { ok: true, layered: true, totalValue: round2(tv), averageCost: round2(newQty > 0 ? tv / newQty : existing.averageCost), unitCost: plan.unitCost, totalCost: round2(plan.totalCost) };
  }

  private applyValuationMethodChangeMem(tenantId: string, itemId: string, from: string, to: string): number {
    if (from === to) return 0;
    if (from !== 'WEIGHTED_AVERAGE' && to !== 'WEIGHTED_AVERAGE') return 0; // FIFO <-> SPECIFIC_LOT: layers unchanged
    let affected = 0;
    for (const [k, st] of Array.from(this.warehouseStock.entries())) {
      if (st.tenantId !== tenantId || st.itemId !== itemId) continue;
      if (from === 'WEIGHTED_AVERAGE') {
        this.costLayers.delete(k);
        if (st.currentQty > 0) {
          this.costLayers.set(k, [{ id: `lyr-open-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, poNumber: null, remainingQty: st.currentQty, unitCost: st.averageCost, receivedAt: new Date().toISOString(), isOpening: true }]);
          affected++;
        }
      } else {
        this.costLayers.delete(k);
        if (st.currentQty > 0) {
          this.warehouseStock.set(k, { ...st, averageCost: Math.round((st.totalValue / st.currentQty) * 100) / 100 });
          affected++;
        }
      }
    }
    return affected;
  }

  public async getStockAccountingConfig(tenantId: string): Promise<StorageResult<StockAccountingConfig>> {
    const c = this.stockAccountingConfig.get(tenantId);
    return { success: true, data: c ? { ...c } : defaultStockAccountingConfig(tenantId) };
  }
  public async saveStockAccountingConfig(tenantId: string, settings: Partial<Omit<StockAccountingConfig, 'tenantId'>>, actorId: string, _idempotencyKey: string): Promise<StorageResult<StockAccountingConfig>> {
    const cur = this.stockAccountingConfig.get(tenantId) || defaultStockAccountingConfig(tenantId);
    const next: StockAccountingConfig = { ...cur, ...settings, tenantId, updatedBy: actorId, updatedAt: new Date().toISOString() };
    this.stockAccountingConfig.set(tenantId, next);
    return { success: true, data: { ...next } };
  }
  public async saveStandard(s: StandardRecord, _actorId: string, key: string): Promise<StorageResult<StandardRecord>> {
    const r = this.stdInsertOnce(this.stdStandards, `${s.framework}|${s.standardId}|${s.version}`, { ...JSON.parse(JSON.stringify(s)), _k: key }, key);
    return r.success ? { success: true, data: s } : r;
  }
  public async listStandards(filter?: { standardId?: string; framework?: string }): Promise<StorageResult<StandardRecord[]>> {
    const rows = [...this.stdStandards.values()].filter(r => (!filter?.standardId || r.standardId === filter.standardId) && (!filter?.framework || r.framework === filter.framework))
      .sort((a, b) => (a.framework + a.standardId).localeCompare(b.framework + b.standardId) || a.version - b.version);
    return { success: true, data: rows.map(r => this.stdStrip<StandardRecord>(r)) };
  }
  public async updateStandardCoverage(standardId: string, version: number, coverage: CoverageStatus, evidenceRef: string | null, _a: string, _k: string): Promise<StorageResult<StandardRecord>> {
    const row = [...this.stdStandards.values()].find(r => r.standardId === standardId && r.version === version);
    if (!row) return { success: false, error: { type: 'standards', title: 'not-found', status: 404, detail: `${standardId} v${version}` } };
    row.coverageStatus = coverage; row.coverageEvidenceRef = evidenceRef; row.updatedAt = new Date().toISOString();
    return { success: true, data: this.stdStrip<StandardRecord>(row) };
  }
  public async saveJurisdiction(j: JurisdictionRecord, _a: string, key: string): Promise<StorageResult<JurisdictionRecord>> {
    const r = this.stdInsertOnce(this.stdJurisdictions, j.id, { ...JSON.parse(JSON.stringify(j)), _k: key }, key);
    return r.success ? { success: true, data: j } : r;
  }
  public async listJurisdictions(): Promise<StorageResult<JurisdictionRecord[]>> {
    return { success: true, data: [...this.stdJurisdictions.values()].sort((a, b) => a.id.localeCompare(b.id)).map(r => this.stdStrip<JurisdictionRecord>(r)) };
  }
  public async saveAccountingRule(rule: AccountingRuleRecord, _a: string, key: string): Promise<StorageResult<AccountingRuleRecord>> {
    const r = this.stdInsertOnce(this.stdRules, `${rule.ruleId}|${rule.version}`, { ...JSON.parse(JSON.stringify(rule)), _k: key }, key);
    return r.success ? { success: true, data: rule } : r;
  }
  public async listAccountingRules(f?: { ruleId?: string; eventType?: string; jurisdictionId?: string }): Promise<StorageResult<AccountingRuleRecord[]>> {
    const rows = [...this.stdRules.values()].filter(r => (!f?.ruleId || r.ruleId === f.ruleId) && (!f?.eventType || r.eventType === f.eventType) && (!f?.jurisdictionId || r.jurisdictionId === f.jurisdictionId))
      .sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.version - b.version);
    return { success: true, data: rows.map(r => this.stdStrip<AccountingRuleRecord>(r)) };
  }
  public async saveStdTaxRule(rule: TaxRuleRecord, _a: string, key: string): Promise<StorageResult<TaxRuleRecord>> {
    const r = this.stdInsertOnce(this.stdTaxRules, `${rule.taxRuleId}|${rule.version}`, { ...JSON.parse(JSON.stringify(rule)), _k: key }, key);
    return r.success ? { success: true, data: rule } : r;
  }
  public async listStdTaxRules(f?: { taxRuleId?: string; jurisdictionId?: string; taxType?: string }): Promise<StorageResult<TaxRuleRecord[]>> {
    const rows = [...this.stdTaxRules.values()].filter(r => (!f?.taxRuleId || r.taxRuleId === f.taxRuleId) && (!f?.jurisdictionId || r.jurisdictionId === f.jurisdictionId) && (!f?.taxType || r.taxType === f.taxType))
      .sort((a, b) => a.taxRuleId.localeCompare(b.taxRuleId) || a.version - b.version);
    return { success: true, data: rows.map(r => this.stdStrip<TaxRuleRecord>(r)) };
  }
  public async appendAccountingPolicyVersion(tenantId: string, input: { id: string; tenantId: string; policyKey: string; value: string; effectiveFrom: string; reason?: string | null; createdBy: string }, actorId: string, _k: string): Promise<StorageResult<AccountingPolicyRecord>> {
    // No await between the check and the write: same atomicity as the PG advisory lock + FOR UPDATE.
    const k = `${tenantId}|${input.policyKey}`;
    const hist = this.stdPolicies.get(k) || [];
    const dup = hist.find(h => h.id === input.id);
    if (dup) return { success: true, data: { ...dup } };
    const last = hist[hist.length - 1];
    if (last && input.effectiveFrom <= last.effectiveFrom)
      return { success: false, error: { type: 'standards', title: 'POLICY_BACKDATE_REJECTED', status: 409, detail: `effectiveFrom must be after ${last.effectiveFrom}` } };
    if (last) { const d = new Date(input.effectiveFrom + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); last.effectiveTo = d.toISOString().slice(0, 10); }
    const rec: AccountingPolicyRecord = { id: input.id, tenantId, policyKey: input.policyKey, value: input.value, version: (last?.version || 0) + 1, effectiveFrom: input.effectiveFrom, effectiveTo: null, reason: input.reason || null, createdBy: actorId, createdAt: new Date().toISOString() };
    this.stdPolicies.set(k, [...hist, rec]);
    return { success: true, data: { ...rec } };
  }
  public async listAccountingPolicies(tenantId: string, policyKey?: string): Promise<StorageResult<AccountingPolicyRecord[]>> {
    const out: AccountingPolicyRecord[] = [];
    for (const [k, v] of this.stdPolicies) if (k.startsWith(tenantId + '|') && (!policyKey || k === `${tenantId}|${policyKey}`)) out.push(...v.map(x => ({ ...x })));
    return { success: true, data: out.sort((a, b) => a.policyKey.localeCompare(b.policyKey) || a.version - b.version) };
  }
  public async saveAccountingDecision(tenantId: string, rec: AccountingDecisionRecord): Promise<StorageResult<AccountingDecisionRecord>> {
    const k = `${tenantId}|${rec.decisionKey}`;
    if (!this.stdDecisions.has(k)) this.stdDecisions.set(k, JSON.parse(JSON.stringify({ ...rec, tenantId, journalEntryId: null })));
    return { success: true, data: JSON.parse(JSON.stringify(this.stdDecisions.get(k))) };
  }
  public async getAccountingDecision(tenantId: string, id: string): Promise<StorageResult<AccountingDecisionRecord | null>> {
    const r = [...this.stdDecisions.values()].find(d => d.tenantId === tenantId && d.id === id);
    return { success: true, data: r ? JSON.parse(JSON.stringify(r)) : null };
  }
  public async listAccountingDecisions(tenantId: string, f?: { eventType?: string; eventId?: string; journalEntryId?: string; status?: string; limit?: number }): Promise<StorageResult<AccountingDecisionRecord[]>> {
    const rows = [...this.stdDecisions.values()].filter(d => d.tenantId === tenantId && (!f?.eventType || d.eventType === f.eventType) && (!f?.eventId || d.eventId === f.eventId) && (!f?.journalEntryId || d.journalEntryId === f.journalEntryId) && (!f?.status || d.decisionStatus === f.status))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? -1 : 1)).slice(0, Math.min(Math.max(Number(f?.limit) || 100, 1), 500));
    return { success: true, data: JSON.parse(JSON.stringify(rows)) };
  }
  public async linkDecisionToJournal(tenantId: string, decisionId: string, journalEntryId: string): Promise<StorageResult<AccountingDecisionRecord>> {
    const d = [...this.stdDecisions.values()].find(x => x.tenantId === tenantId && x.id === decisionId);
    if (!d) return { success: false, error: { type: 'standards', title: 'not-found', status: 404, detail: decisionId } };
    if (d.journalEntryId === journalEntryId) return { success: true, data: JSON.parse(JSON.stringify(d)) };
    if (d.decisionStatus !== 'APPLY') return { success: false, error: { type: 'standards', title: 'link-conflict', status: 409, detail: 'only APPLY decisions can be linked to a journal' } };
    if (d.journalEntryId) return { success: false, error: { type: 'standards', title: 'link-conflict', status: 409, detail: `decision already linked to journal ${d.journalEntryId}` } };
    d.journalEntryId = journalEntryId;
    return { success: true, data: JSON.parse(JSON.stringify(d)) };
  }
  public async setStockDocumentJournal(tenantId: string, docId: string, journalEntryId: string | null, status: 'NONE' | 'POSTED' | 'PENDING_RETRY'): Promise<StorageResult<void>> {
    const key = `${tenantId}:${docId}`;
    const doc = this.stockDocuments.get(key);
    if (doc) { (doc as any).journalEntryId = journalEntryId || undefined; (doc as any).journalStatus = status; this.stockDocuments.set(key, doc); }
    return { success: true, data: undefined as any };
  }
  public async setStockTransferJournal(tenantId: string, transferId: string, which: 'DISPATCH' | 'RECEIVE', journalEntryId: string | null, status: 'NONE' | 'POSTED' | 'PENDING_RETRY'): Promise<StorageResult<void>> {
    const key = `${tenantId}:${transferId}`;
    const tr = this.stockTransfers.get(key);
    if (tr) {
      if (which === 'DISPATCH') (tr as any).dispatchJournalEntryId = journalEntryId || undefined;
      else (tr as any).receiveJournalEntryId = journalEntryId || undefined;
      (tr as any).journalStatus = status;
      this.stockTransfers.set(key, tr);
    }
    return { success: true, data: undefined as any };
  }

  public async getStockItem(tenantId: string, itemId: string): Promise<StorageResult<StockItem | null>> {
    const item = this.stockItems.get(`${tenantId}:${itemId}`);
    return { success: true, data: item ? { ...item } : null };
  }

  public async listStockItems(tenantId: string, filter?: { category?: string; isActive?: boolean }): Promise<StorageResult<StockItem[]>> {
    let list = Array.from(this.stockItems.values()).filter(i => i.tenantId === tenantId);
    if (filter?.category) list = list.filter(i => i.category === filter.category);
    if (filter?.isActive !== undefined) list = list.filter(i => i.isActive === filter.isActive);
    return { success: true, data: list.map(i => ({ ...i })) };
  }


  // Phase 15 (PO-001)
  public async savePurchaseOrder(tenantId: string, po: PurchaseOrder, lines: PurchaseOrderLine[], idempotencyKey: string): Promise<StorageResult<PurchaseOrder>> {
    const cacheKey = `${tenantId}:savePO:${idempotencyKey}`;
    const hit = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'savePurchaseOrder');
    if (hit.success && hit.data) return { success: true, data: hit.data };
    this.purchaseOrders.set(`${tenantId}:${po.id}`, { ...po });
    this.purchaseOrderLines.set(`${tenantId}:${po.id}`, lines.map(l => ({ ...l })));
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'savePurchaseOrder', po);
    return { success: true, data: { ...po } };
  }
  public async getPurchaseOrder(tenantId: string, poId: string): Promise<StorageResult<{ po: PurchaseOrder; lines: PurchaseOrderLine[] } | null>> {
    const po = this.purchaseOrders.get(`${tenantId}:${poId}`);
    if (!po) return { success: true, data: null };
    const lines = this.purchaseOrderLines.get(`${tenantId}:${poId}`) || [];
    return { success: true, data: { po: { ...po }, lines: lines.map((l: any) => ({ ...l })) } };
  }
  public async listPurchaseOrders(tenantId: string, filter?: { status?: string; vendorId?: string }): Promise<StorageResult<PurchaseOrder[]>> {
    let list = Array.from(this.purchaseOrders.values()).filter((p: any) => p.tenantId === tenantId);
    if (filter?.status) list = list.filter((p: any) => p.status === filter.status);
    if (filter?.vendorId) list = list.filter((p: any) => p.vendorId === filter.vendorId);
    return { success: true, data: list.map((p: any) => ({ ...p })) };
  }
  public async updatePurchaseOrderStatus(tenantId: string, poId: string, status: PurchaseOrderStatus, _actorId: string): Promise<StorageResult<PurchaseOrder>> {
    const key = `${tenantId}:${poId}`;
    const po = this.purchaseOrders.get(key);
    if (!po) return { success: false, error: { type: 'not-found', title: 'أمر الشراء', status: 404, detail: 'أمر الشراء غير موجود' } };
    po.status = status; po.updatedAt = new Date().toISOString();
    this.purchaseOrders.set(key, po);
    return { success: true, data: { ...po } };
  }
  public async saveGoodsReceipt(tenantId: string, receipt: GoodsReceipt, lines: GoodsReceiptLine[], idempotencyKey: string, guard?: { tolerancePct: number }): Promise<StorageResult<GoodsReceipt>> {
    const hit = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'saveGoodsReceipt');
    if (hit.success && hit.data) return { success: true, data: hit.data };
    if (guard) {
      // Repair batch 1 (DEF-P2-001): the check and the write below run with no await in between (same atomicity as the SQL row lock)
      const poLines: any[] = this.purchaseOrderLines.get(`${tenantId}:${receipt.poId}`) || [];
      const wanted = new Map<string, number>();
      for (const l of lines) wanted.set(l.poLineId, (wanted.get(l.poLineId) || 0) + Number(l.receivedQty));
      for (const [poLineId, want] of Array.from(wanted.entries())) {
        const pl = poLines.find((x: any) => x.id === poLineId);
        if (!pl) return { success: false, error: { type: 'https://api.an-erp.local/errors/po-line-not-found', title: 'سطر الأمر غير موجود', status: 404, detail: `سطر ${poLineId} غير موجود.` } };
        let open = 0;
        for (const [key, rls] of this.goodsReceiptLines.entries()) {
          if (!key.startsWith(tenantId + ':')) continue;
          const rid = key.split(':').slice(1).join(':');
          const rec = this.goodsReceipts.get(`${tenantId}:${rid}`);
          // open = waiting for approval, or approved but not yet posted to stock (a completed receipt keeps status APPROVED but is already in received_qty)
          if (!rec || rec.id === receipt.id || !(rec.status === 'IN_APPROVAL' || (rec.status === 'APPROVED' && !rec.completedAt))) continue;
          for (const l of rls) if (l.poLineId === poLineId) open += Number(l.receivedQty);
        }
        const remaining = Number(pl.orderedQty) - Number(pl.receivedQty) - open;
        const maxAllowed = remaining * (1 + guard.tolerancePct / 100);
        if (want > maxAllowed + 1e-6) {
          return { success: false, error: { type: 'https://api.an-erp.local/errors/over-receipt', title: 'تجاوز كمية الأمر', status: 422, detail: `المتبقي ${remaining} (بسماح ${guard.tolerancePct}%)؛ المطلوب ${want}.` } };
        }
      }
    }
    this.goodsReceipts.set(`${tenantId}:${receipt.id}`, { ...receipt });
    this.goodsReceiptLines.set(`${tenantId}:${receipt.id}`, lines.map(l => ({ ...l })));
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'saveGoodsReceipt', receipt);
    return { success: true, data: { ...receipt } };
  }
  public async getGoodsReceipt(tenantId: string, receiptId: string): Promise<StorageResult<{ receipt: GoodsReceipt; lines: GoodsReceiptLine[] } | null>> {
    const r = this.goodsReceipts.get(`${tenantId}:${receiptId}`);
    if (!r) return { success: true, data: null };
    const lines = this.goodsReceiptLines.get(`${tenantId}:${receiptId}`) || [];
    return { success: true, data: { receipt: { ...r }, lines: lines.map((l: any) => ({ ...l })) } };
  }
  public async listGoodsReceipts(tenantId: string, filter?: { poId?: string; status?: string }): Promise<StorageResult<GoodsReceipt[]>> {
    let list = Array.from(this.goodsReceipts.values()).filter((r: any) => r.tenantId === tenantId);
    if (filter?.poId) list = list.filter((r: any) => r.poId === filter.poId);
    if (filter?.status) list = list.filter((r: any) => r.status === filter.status);
    return { success: true, data: list.map((r: any) => ({ ...r })) };
  }
  public async updateGoodsReceipt(tenantId: string, receipt: GoodsReceipt): Promise<StorageResult<GoodsReceipt>> {
    this.goodsReceipts.set(`${tenantId}:${receipt.id}`, { ...receipt });
    return { success: true, data: { ...receipt } };
  }
  public async completeGoodsReceiptAtomic(tenantId: string, input: CompleteGoodsReceiptAtomicInput, idempotencyKey: string): Promise<StorageResult<GoodsReceipt>> {
    const hit = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'completeGoodsReceipt');
    if (hit.success && hit.data) return { success: true, data: hit.data };
    for (const u of input.qtyUpdates) {
      const lines = this.purchaseOrderLines.get(`${tenantId}:${input.poId}`) || [];
      const line = lines.find((l: any) => l.id === u.poLineId);
      if (line) {
        line.receivedQty = Number(line.receivedQty) + Number(u.addReceived);
        line.rejectedQty = Number(line.rejectedQty) + Number(u.addRejected);
      }
      this.purchaseOrderLines.set(`${tenantId}:${input.poId}`, lines);
    }
    const po = this.purchaseOrders.get(`${tenantId}:${input.poId}`);
    if (po) { po.status = input.newPoStatus; po.updatedAt = new Date().toISOString(); this.purchaseOrders.set(`${tenantId}:${input.poId}`, po); }
    const receipt = { ...input.receipt };
    this.goodsReceipts.set(`${tenantId}:${receipt.id}`, receipt);
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'completeGoodsReceipt', receipt);
    return { success: true, data: receipt };
  }
  public async sumOpenReceiptQtyForPoLine(tenantId: string, poLineId: string): Promise<StorageResult<number>> {
    let sum = 0;
    for (const [key, lines] of this.goodsReceiptLines.entries()) {
      if (!key.startsWith(tenantId + ':')) continue;
      const rid = key.split(':').slice(1).join(':');
      const rec = this.goodsReceipts.get(`${tenantId}:${rid}`);
      if (!rec || rec.status !== 'IN_APPROVAL') continue;
      for (const l of lines) if (l.poLineId === poLineId) sum += Number(l.receivedQty);
    }
    return { success: true, data: sum };
  }

  
  
  // Phase 8a (P2P-001): Purchase Request / RFQ / Supplier Quotes
  public async savePurchaseRequest(tenantId: string, pr: PurchaseRequest, lines: PurchaseRequestLine[], idempotencyKey: string): Promise<StorageResult<PurchaseRequest>> {
    const hit = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'savePurchaseRequest');
    if (hit.success && hit.data) return { success: true, data: hit.data as PurchaseRequest };
    this.purchaseRequests.set(`${tenantId}:${pr.id}`, { ...pr });
    this.purchaseRequestLines.set(`${tenantId}:${pr.id}`, lines.map(l => ({ ...l })));
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'savePurchaseRequest', pr);
    return { success: true, data: pr };
  }
  public async getPurchaseRequest(tenantId: string, prId: string): Promise<StorageResult<{ pr: PurchaseRequest; lines: PurchaseRequestLine[] } | null>> {
    const pr = this.purchaseRequests.get(`${tenantId}:${prId}`);
    if (!pr) return { success: true, data: null };
    const lines = this.purchaseRequestLines.get(`${tenantId}:${prId}`) || [];
    return { success: true, data: { pr: { ...pr }, lines: lines.map(l => ({ ...l })) } };
  }
  public async listPurchaseRequests(tenantId: string, filter?: { status?: string; requestedBy?: string }): Promise<StorageResult<PurchaseRequest[]>> {
    const list = Array.from(this.purchaseRequests.values()).filter((p: any) => {
      if (p.tenantId !== tenantId) return false;
      if (filter?.status && p.status !== filter.status) return false;
      if (filter?.requestedBy && p.requestedBy !== filter.requestedBy) return false;
      return true;
    }).map((p: any) => ({ ...p }));
    return { success: true, data: list };
  }
  public async updatePurchaseRequest(tenantId: string, pr: PurchaseRequest): Promise<StorageResult<PurchaseRequest>> {
    const key = `${tenantId}:${pr.id}`;
    if (!this.purchaseRequests.has(key)) {
      return { success: false, error: { type: 'https://api.an-erp.local/errors/pr-not-found', title: 'طلب الشراء غير موجود', status: 404, detail: pr.id } };
    }
    const updated = { ...pr, updatedAt: new Date().toISOString() };
    this.purchaseRequests.set(key, updated);
    return { success: true, data: updated };
  }
  public async saveRfq(tenantId: string, rfq: RequestForQuote, lines: RfqLine[], idempotencyKey: string): Promise<StorageResult<RequestForQuote>> {
    const hit = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'saveRfq');
    if (hit.success && hit.data) return { success: true, data: hit.data as RequestForQuote };
    this.rfqs.set(`${tenantId}:${rfq.id}`, { ...rfq });
    this.rfqLines.set(`${tenantId}:${rfq.id}`, lines.map(l => ({ ...l })));
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'saveRfq', rfq);
    return { success: true, data: rfq };
  }
  public async getRfq(tenantId: string, rfqId: string): Promise<StorageResult<{ rfq: RequestForQuote; lines: RfqLine[] } | null>> {
    const rfq = this.rfqs.get(`${tenantId}:${rfqId}`);
    if (!rfq) return { success: true, data: null };
    const lines = this.rfqLines.get(`${tenantId}:${rfqId}`) || [];
    return { success: true, data: { rfq: { ...rfq }, lines: lines.map(l => ({ ...l })) } };
  }
  public async listRfqs(tenantId: string, filter?: { status?: string; prId?: string }): Promise<StorageResult<RequestForQuote[]>> {
    const list = Array.from(this.rfqs.values()).filter((r: any) => {
      if (r.tenantId !== tenantId) return false;
      if (filter?.status && r.status !== filter.status) return false;
      if (filter?.prId && r.prId !== filter.prId) return false;
      return true;
    }).map((r: any) => ({ ...r }));
    return { success: true, data: list };
  }
  public async updateRfq(tenantId: string, rfq: RequestForQuote): Promise<StorageResult<RequestForQuote>> {
    const key = `${tenantId}:${rfq.id}`;
    if (!this.rfqs.has(key)) {
      return { success: false, error: { type: 'https://api.an-erp.local/errors/rfq-not-found', title: 'طلب عرض السعر غير موجود', status: 404, detail: rfq.id } };
    }
    const updated = { ...rfq, updatedAt: new Date().toISOString() };
    this.rfqs.set(key, updated);
    return { success: true, data: updated };
  }
  public async saveSupplierQuote(tenantId: string, quote: SupplierQuote, lines: SupplierQuoteLine[], idempotencyKey: string): Promise<StorageResult<SupplierQuote>> {
    const hit = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'saveSupplierQuote');
    if (hit.success && hit.data) return { success: true, data: hit.data as SupplierQuote };
    this.supplierQuotes.set(`${tenantId}:${quote.id}`, { ...quote });
    this.supplierQuoteLines.set(`${tenantId}:${quote.id}`, lines.map(l => ({ ...l })));
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'saveSupplierQuote', quote);
    return { success: true, data: quote };
  }
  public async getSupplierQuote(tenantId: string, quoteId: string): Promise<StorageResult<{ quote: SupplierQuote; lines: SupplierQuoteLine[] } | null>> {
    const quote = this.supplierQuotes.get(`${tenantId}:${quoteId}`);
    if (!quote) return { success: true, data: null };
    const lines = this.supplierQuoteLines.get(`${tenantId}:${quoteId}`) || [];
    return { success: true, data: { quote: { ...quote }, lines: lines.map(l => ({ ...l })) } };
  }
  public async listSupplierQuotes(tenantId: string, filter?: { rfqId?: string; vendorId?: string; status?: string }): Promise<StorageResult<SupplierQuote[]>> {
    const list = Array.from(this.supplierQuotes.values()).filter((q: any) => {
      if (q.tenantId !== tenantId) return false;
      if (filter?.rfqId && q.rfqId !== filter.rfqId) return false;
      if (filter?.vendorId && q.vendorId !== filter.vendorId) return false;
      if (filter?.status && q.status !== filter.status) return false;
      return true;
    }).map((q: any) => ({ ...q }));
    return { success: true, data: list };
  }
  public async updateSupplierQuote(tenantId: string, quote: SupplierQuote): Promise<StorageResult<SupplierQuote>> {
    const key = `${tenantId}:${quote.id}`;
    if (!this.supplierQuotes.has(key)) {
      return { success: false, error: { type: 'https://api.an-erp.local/errors/quote-not-found', title: 'عرض المورد غير موجود', status: 404, detail: quote.id } };
    }
    const updated = { ...quote, updatedAt: new Date().toISOString() };
    this.supplierQuotes.set(key, updated);
    return { success: true, data: updated };
  }

  
  // Phase 8c (P2P-002): Supplier Invoice
  public async saveSupplierInvoice(tenantId: string, inv: SupplierInvoice, lines: SupplierInvoiceLine[], idempotencyKey: string): Promise<StorageResult<SupplierInvoice>> {
    const hit = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'saveSupplierInvoice');
    if (hit.success && hit.data) return { success: true, data: hit.data as SupplierInvoice };
    this.supplierInvoices.set(`${tenantId}:${inv.id}`, { ...inv });
    this.supplierInvoiceLines.set(`${tenantId}:${inv.id}`, lines.map(l => ({ ...l })));
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'saveSupplierInvoice', inv);
    return { success: true, data: inv };
  }
  public async getSupplierInvoice(tenantId: string, invoiceId: string): Promise<StorageResult<{ invoice: SupplierInvoice; lines: SupplierInvoiceLine[] } | null>> {
    const inv = this.supplierInvoices.get(`${tenantId}:${invoiceId}`);
    if (!inv) return { success: true, data: null };
    const lines = this.supplierInvoiceLines.get(`${tenantId}:${invoiceId}`) || [];
    return { success: true, data: { invoice: { ...inv }, lines: lines.map(l => ({ ...l })) } };
  }
  public async listSupplierInvoices(tenantId: string, filter?: { status?: string; poId?: string; vendorId?: string }): Promise<StorageResult<SupplierInvoice[]>> {
    const list = Array.from(this.supplierInvoices.values()).filter((p: any) => {
      if (p.tenantId !== tenantId) return false;
      if (filter?.status && p.status !== filter.status) return false;
      if (filter?.poId && p.poId !== filter.poId) return false;
      if (filter?.vendorId && p.vendorId !== filter.vendorId) return false;
      return true;
    }).map((p: any) => ({ ...p }));
    return { success: true, data: list };
  }
  public async updateSupplierInvoice(tenantId: string, inv: SupplierInvoice): Promise<StorageResult<SupplierInvoice>> {
    const key = `${tenantId}:${inv.id}`;
    if (!this.supplierInvoices.has(key)) {
      return { success: false, error: { type: 'https://api.an-erp.local/errors/invoice-not-found', title: 'فاتورة المورد غير موجودة', status: 404, detail: inv.id } };
    }
    const updated = { ...inv, updatedAt: new Date().toISOString() };
    this.supplierInvoices.set(key, updated);
    return { success: true, data: updated };
  }

  // Phase 16 (REC-001)
  public async getInventoryIntegrityAggregates(tenantId: string): Promise<StorageResult<InventoryIntegrityRow[]>> {
    const POS = new Set(['RECEIPT', 'TRANSFER_IN', 'COUNT_ADJUSTMENT_GAIN']);
    const NEG = new Set(['ISSUE', 'TRANSFER_OUT', 'COUNT_ADJUSTMENT_LOSS']);
    const map = new Map<string, InventoryIntegrityRow>();
    const key = (w: string, i: string) => `${w}|${i}`;
    for (const s of this.warehouseStock.values()) {
      if ((s as any).tenantId !== tenantId) continue;
      const k = key((s as any).warehouseId, (s as any).itemId);
      map.set(k, {
        warehouseId: (s as any).warehouseId,
        itemId: (s as any).itemId,
        stockQty: Number((s as any).currentQty) || 0,
        stockValue: Number((s as any).totalValue) || 0,
        movementsQty: 0,
        movementsValue: 0,
      });
    }
    // stock movements map name?
    for (const m of this.stockMovements.values()) {
      if ((m as any).tenantId !== tenantId) continue;
      const w = (m as any).warehouseId;
      const i = (m as any).itemId;
      const k = key(w, i);
      const row = map.get(k) || { warehouseId: w, itemId: i, stockQty: 0, stockValue: 0, movementsQty: 0, movementsValue: 0 };
      const qty = Math.abs(Number((m as any).quantity) || 0);
      const cost = Math.abs(Number((m as any).totalCost) || 0);
      const sign = POS.has((m as any).movementType) ? 1 : NEG.has((m as any).movementType) ? -1 : 0;
      row.movementsQty += sign * qty;
      row.movementsValue += sign * cost;
      map.set(k, row);
    }
    return { success: true, data: Array.from(map.values()) };
  }


  // Phase 18 (SCOPE-001)
  public async listUserWarehouseAccess(tenantId: string, userId: string): Promise<StorageResult<string[]>> {
    return { success: true, data: [...(this.userWarehouseAccess.get(`${tenantId}:${userId}`) || [])] };
  }
  public async setUserWarehouseAccess(tenantId: string, userId: string, warehouseIds: string[], actorId: string, idempotencyKey: string): Promise<StorageResult<string[]>> {
    const hit = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'setUserWarehouseAccess');
    if (hit.success && hit.data) return { success: true, data: hit.data };
    const user = await this.getUser(tenantId, userId);
    if (!user.success || !user.data) {
      return { success: false, error: { type: 'https://api.an-erp.local/errors/not-found', title: 'المستخدم غير موجود', status: 404, detail: 'المستخدم غير موجود في هذه المنشأة.' } };
    }
    const unique = Array.from(new Set((warehouseIds || []).filter(Boolean).map(String)));
    if (unique.length > 200) {
      return { success: false, error: { type: 'https://api.an-erp.local/errors/validation-failed', title: 'بيانات غير صالحة', status: 400, detail: 'الحد الأقصى 200 مستودعًا.' } };
    }
    for (const wid of unique) {
      const w = await this.getWarehouse(tenantId, wid);
      if (!w.success || !w.data) {
        return { success: false, error: { type: 'https://api.an-erp.local/errors/not-found', title: 'المستودع غير موجود', status: 404, detail: `المستودع ${wid} غير موجود في هذه المنشأة.` } };
      }
    }
    this.userWarehouseAccess.set(`${tenantId}:${userId}`, unique);
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'setUserWarehouseAccess', unique);
    return { success: true, data: unique };
  }

public async getWarehouseStock(tenantId: string, warehouseId: string, itemId: string): Promise<StorageResult<WarehouseStock | null>> {
    const sl = this.warehouseStock.get(`${tenantId}:${warehouseId}:${itemId}`);
    return { success: true, data: sl ? { ...sl } : null };
  }

  public async listWarehouseStock(tenantId: string, warehouseId?: string, itemId?: string): Promise<StorageResult<WarehouseStock[]>> {
    let list = Array.from(this.warehouseStock.values()).filter(s => s.tenantId === tenantId);
    if (warehouseId) list = list.filter(s => s.warehouseId === warehouseId);
    if (itemId) list = list.filter(s => s.itemId === itemId);
    return { success: true, data: list.map(s => ({ ...s })) };
  }

  public async recordStockMovement(tenantId: string, movement: StockMovement, idempotencyKey: string): Promise<StorageResult<StockMovement>> {
    const cached = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'recordStockMovement');
    if (cached.success && cached.data) {
      return { success: true, data: cached.data };
    }

    const key = `${tenantId}:${movement.warehouseId}:${movement.itemId}`;
    const existing = this.warehouseStock.get(key) || {
      id: `${movement.warehouseId}-${movement.itemId}`,
      tenantId,
      companyId: movement.companyId || tenantId,
      warehouseId: movement.warehouseId,
      itemId: movement.itemId,
      currentQty: 0,
      reservedQty: 0,
      availableQty: 0,
      averageCost: movement.unitCost || 0,
      totalValue: 0,
      updatedAt: new Date().toISOString(),
    };

    let newQty = existing.currentQty;
    let newAvgCost = existing.averageCost;

    if (movement.movementType === 'RECEIPT' || movement.movementType === 'TRANSFER_IN' || movement.movementType === 'COUNT_ADJUSTMENT_GAIN') {
      const addedQty = movement.quantity;
      const totalQty = newQty + addedQty;
      if (totalQty > 0 && movement.unitCost) {
        newAvgCost = ((newQty * existing.averageCost) + (addedQty * movement.unitCost)) / totalQty;
      }
      newQty = totalQty;
    } else {
      newQty = Math.max(0, newQty - movement.quantity);
    }

    // Phase 13 (COST-001): FIFO / SPECIFIC_LOT items use cost layers (WEIGHTED_AVERAGE items are unchanged)
    const legIsIn = movement.movementType === 'RECEIPT' || movement.movementType === 'TRANSFER_IN' || movement.movementType === 'COUNT_ADJUSTMENT_GAIN';
    const lay = this.layerStepMem(tenantId, movement, legIsIn, existing, newQty);
    if (!lay.ok) return { success: false, error: lay.error };

    const updatedStock: WarehouseStock = {
      ...existing,
      currentQty: newQty,
      availableQty: Math.max(0, newQty - existing.reservedQty),
      averageCost: lay.layered ? lay.averageCost : Math.round(newAvgCost * 100) / 100,
      totalValue: lay.layered ? lay.totalValue : Math.round(newQty * newAvgCost * 100) / 100,
      updatedAt: new Date().toISOString(),
    };
    this.warehouseStock.set(key, updatedStock);

    const savedMovement: StockMovement = {
      ...movement,
      ...(lay.layered && !legIsIn ? { unitCost: lay.unitCost, totalCost: lay.totalCost } : {}),
      balanceAfterQty: newQty,
      timestamp: movement.timestamp || new Date().toISOString(),
    };
    this.stockMovements.set(`${tenantId}:${movement.id}`, savedMovement);
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'recordStockMovement', savedMovement);
    return { success: true, data: savedMovement };
  }

  public async listStockMovements(tenantId: string, filter?: { warehouseId?: string; itemId?: string; movementType?: string; fromDate?: string; toDate?: string; limit?: number }): Promise<StorageResult<StockMovement[]>> {
    let list = Array.from(this.stockMovements.values()).filter(m => m.tenantId === tenantId);
    if (filter?.warehouseId) list = list.filter(m => m.warehouseId === filter.warehouseId);
    if (filter?.itemId) list = list.filter(m => m.itemId === filter.itemId);
    if (filter?.movementType) list = list.filter(m => m.movementType === filter.movementType);
    if (filter?.fromDate) {
      const fromTs = new Date(filter.fromDate).getTime();
      list = list.filter(m => new Date(m.timestamp).getTime() >= fromTs);
    }
    if (filter?.toDate) {
      const toTs = new Date(filter.toDate).getTime();
      // include whole end day if date-only
      const end = filter.toDate.length <= 10 ? toTs + 86400000 - 1 : toTs;
      list = list.filter(m => new Date(m.timestamp).getTime() <= end);
    }
    list = list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (filter?.limit) list = list.slice(0, filter.limit);
    return { success: true, data: list.map(m => ({ ...m })) };
  }

  public async createStockTransfer(tenantId: string, transfer: StockTransfer, lines: StockTransferLine[], idempotencyKey: string): Promise<StorageResult<StockTransfer>> {
    this.stockTransfers.set(`${tenantId}:${transfer.id}`, { ...transfer, tenantId });
    this.stockTransferLines.set(`${tenantId}:${transfer.id}`, lines.map(l => ({ ...l, tenantId })));
    return { success: true, data: transfer };
  }

  // Phase 11 (STK-ATOMIC-002): same contract as the PostgreSQL adapter; synchronous between snapshot and commit.
  public async postStockTransferAtomic(tenantId: string, input: PostStockTransferAtomicInput, idempotencyKey: string): Promise<StorageResult<StockTransfer>> {
    const cacheKey = `${tenantId}:postStockTransferAtomic:${idempotencyKey}`;
    if (idempotencyKey && this.idempotencyRecords.has(cacheKey)) return { success: true, data: this.idempotencyRecords.get(cacheKey) };
    const fail = (status: number, type: string, title: string, detail: string): StorageResult<StockTransfer> =>
      ({ success: false, error: { type: `https://api.an-erp.local/errors/${type}`, title, status, detail } });
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const snap = { stock: new Map(this.warehouseStock), movements: new Map(this.stockMovements), transfers: new Map(this.stockTransfers), lines: new Map(this.stockTransferLines), layers: new Map(this.costLayers) };
    const restore = () => { this.costLayers = snap.layers; this.warehouseStock = snap.stock; this.stockMovements = snap.movements; this.stockTransfers = snap.transfers; this.stockTransferLines = snap.lines; };
    try {
      if (input.mode === 'DISPATCH') {
        const t = input.transfer;
        if (!input.lines || input.lines.length === 0) return fail(400, 'invalid-transfer', 'تحويل غير صالح', 'لا توجد أسطر في مستند التحويل.');
        for (const x of this.stockTransfers.values()) {
          if (x.tenantId === tenantId && x.transferNumber === t.transferNumber) return fail(500, 'db-error', 'خطأ في التخزين', `رقم التحويل ${t.transferNumber} مستخدم بالفعل.`);
        }
        const lines = input.lines.map(l => ({ ...l, tenantId }));
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          const r = this.applyMovementMem(tenantId, {
            id: `mov-trf-out-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`, tenantId, companyId: tenantId,
            movementNumber: `MOV-${t.transferNumber}-OUT-${i + 1}`, movementType: 'TRANSFER_OUT',
            warehouseId: t.sourceWarehouseId, warehouseNameAr: t.sourceWarehouseNameAr, itemId: l.itemId, itemCode: l.itemCode, itemNameAr: l.itemNameAr,
            quantity: l.quantity, unitCost: l.unitCost, totalCost: l.totalCost, balanceAfterQty: 0,
            sourceDocumentType: 'STOCK_TRANSFER', sourceDocumentId: t.id, sourceDocumentNumber: t.transferNumber,
            performedBy: input.actorId, performedByName: input.actorName, timestamp: new Date().toISOString(),
          }, { providedCost: false, rejectNegative: true });
          if (!r.ok) { restore(); return { success: false, error: (r as any).error }; }
          l.unitCost = r.saved.unitCost; l.totalCost = r.saved.totalCost;
        }
        const final: StockTransfer = { ...t, tenantId, status: 'IN_TRANSIT', totalItemsCount: lines.length, totalCost: round2(lines.reduce((sum, l) => sum + Number(l.totalCost || 0), 0)) };
        this.stockTransfers.set(`${tenantId}:${t.id}`, final);
        this.stockTransferLines.set(`${tenantId}:${t.id}`, lines);
        if (idempotencyKey) this.idempotencyRecords.set(cacheKey, final);
        return { success: true, data: { ...final } };
      }
      // RECEIVE
      const tr = this.stockTransfers.get(`${tenantId}:${input.transfer.id}`);
      if (!tr) return fail(404, 'transfer-not-found', 'مستند التحويل غير موجود', 'تعذر العثور على مستند التحويل المطلوب استلامه.');
      if (tr.status !== 'IN_TRANSIT') return fail(409, 'invalid-transfer-status', 'حالة التحويل لا تسمح بالاستلام', `المستند حالياً في حالة (${tr.status}) ولا يمكن استلامه مجدداً.`);
      const lines = this.stockTransferLines.get(`${tenantId}:${tr.id}`) || [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const r = this.applyMovementMem(tenantId, {
          id: `mov-trf-in-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`, tenantId, companyId: tenantId,
          movementNumber: `MOV-${tr.transferNumber}-IN-${i + 1}`, movementType: 'TRANSFER_IN',
          warehouseId: tr.targetWarehouseId, warehouseNameAr: tr.targetWarehouseNameAr, itemId: l.itemId, itemCode: l.itemCode, itemNameAr: l.itemNameAr,
          quantity: l.quantity, unitCost: l.unitCost, totalCost: l.totalCost, balanceAfterQty: 0,
          sourceDocumentType: 'STOCK_TRANSFER', sourceDocumentId: tr.id, sourceDocumentNumber: tr.transferNumber,
          performedBy: input.actorId, performedByName: input.actorName, timestamp: new Date().toISOString(),
        }, { providedCost: true, rejectNegative: false });
        if (!r.ok) { restore(); return { success: false, error: (r as any).error }; }
      }
      const nowIso = new Date().toISOString();
      const updated: StockTransfer = { ...tr, status: 'RECEIVED', receivedBy: input.actorId, receivedByName: input.actorName, receivedAt: nowIso, updatedAt: nowIso };
      this.stockTransfers.set(`${tenantId}:${tr.id}`, updated);
      if (idempotencyKey) this.idempotencyRecords.set(cacheKey, updated);
      return { success: true, data: { ...updated } };
    } catch (e: any) {
      restore();
      return fail(500, 'db-error', 'خطأ في التخزين', e?.message || 'فشل ترحيل التحويل المخزني.');
    }
  }

  public async getStockTransfer(tenantId: string, transferId: string): Promise<StorageResult<{ transfer: StockTransfer; lines: StockTransferLine[] } | null>> {
    const tr = this.stockTransfers.get(`${tenantId}:${transferId}`);
    if (!tr) return { success: true, data: null };
    const lines = this.stockTransferLines.get(`${tenantId}:${transferId}`) || [];
    return { success: true, data: { transfer: { ...tr }, lines: lines.map(l => ({ ...l })) } };
  }

  public async listStockTransfers(tenantId: string, filter?: { status?: string; warehouseId?: string }): Promise<StorageResult<StockTransfer[]>> {
    let list = Array.from(this.stockTransfers.values()).filter(t => t.tenantId === tenantId);
    if (filter?.status) list = list.filter(t => t.status === filter.status);
    if (filter?.warehouseId) list = list.filter(t => t.sourceWarehouseId === filter.warehouseId || t.targetWarehouseId === filter.warehouseId);
    return { success: true, data: list.map(t => ({ ...t })) };
  }

  public async updateStockTransferStatus(
    tenantId: string,
    transferId: string,
    status: StockTransferStatus,
    actorId: string,
    actorName: string,
    idempotencyKey: string
  ): Promise<StorageResult<StockTransfer>> {
    const tr = this.stockTransfers.get(`${tenantId}:${transferId}`);
    if (!tr) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/transfer-not-found',
          title: 'مستند التحويل غير موجود',
          status: 404,
          detail: 'تعذر العثور على مستند التحويل المخزني.',
        },
      };
    }
    const updated: StockTransfer = {
      ...tr,
      status,
      receivedBy: status === 'RECEIVED' ? actorId : tr.receivedBy,
      receivedByName: status === 'RECEIVED' ? actorName : tr.receivedByName,
      receivedAt: status === 'RECEIVED' ? new Date().toISOString() : tr.receivedAt,
      updatedAt: new Date().toISOString(),
    };
    this.stockTransfers.set(`${tenantId}:${transferId}`, updated);
    return { success: true, data: updated };
  }

  public async createStockCount(tenantId: string, count: StockCount, lines: StockCountLine[], idempotencyKey: string): Promise<StorageResult<StockCount>> {
    this.stockCounts.set(`${tenantId}:${count.id}`, { ...count, tenantId });
    this.stockCountLines.set(`${tenantId}:${count.id}`, lines.map(l => ({ ...l, tenantId })));
    return { success: true, data: count };
  }

  public async getStockCount(tenantId: string, countId: string): Promise<StorageResult<{ count: StockCount; lines: StockCountLine[] } | null>> {
    const sc = this.stockCounts.get(`${tenantId}:${countId}`);
    if (!sc) return { success: true, data: null };
    const lines = this.stockCountLines.get(`${tenantId}:${countId}`) || [];
    return { success: true, data: { count: { ...sc }, lines: lines.map(l => ({ ...l })) } };
  }

  public async listStockCounts(tenantId: string, filter?: { warehouseId?: string; status?: string }): Promise<StorageResult<StockCount[]>> {
    let list = Array.from(this.stockCounts.values()).filter(c => c.tenantId === tenantId);
    if (filter?.warehouseId) list = list.filter(c => c.warehouseId === filter.warehouseId);
    if (filter?.status) list = list.filter(c => c.status === filter.status);
    return { success: true, data: list.map(c => ({ ...c })) };
  }

  public async updateStockCountStatus(
    tenantId: string,
    countId: string,
    status: StockCountStatus,
    actorId: string,
    actorName: string,
    journalEntryId?: string,
    idempotencyKey?: string
  ): Promise<StorageResult<StockCount>> {
    const sc = this.stockCounts.get(`${tenantId}:${countId}`);
    if (!sc) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/count-not-found',
          title: 'مستند الجرد غير موجود',
          status: 404,
          detail: 'تعذر العثور على عملية الجرد المخزني.',
        },
      };
    }

    // Strict SoD check: creator/performer cannot approve their own inventory count
    if (status === 'APPROVED' || status === 'POSTED') {
      if (sc.performedBy === actorId) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/sod-violation',
            title: 'تعارض مصالح - فصل الصلاحيات والواجبات',
            status: 403,
            detail: 'ممنوع نظامياً: لا يجوز لمن قام بتنفيذ الجرد المخزني فعلياً اعتماده أو ترحيله (SoD).',
          },
        };
      }
    }

    const updated: StockCount = {
      ...sc,
      status,
      approvedBy: (status === 'APPROVED' || status === 'POSTED') ? actorId : sc.approvedBy,
      approvedByName: (status === 'APPROVED' || status === 'POSTED') ? actorName : sc.approvedByName,
      approvedAt: (status === 'APPROVED' || status === 'POSTED') ? new Date().toISOString() : sc.approvedAt,
      journalEntryId: journalEntryId || sc.journalEntryId,
      updatedAt: new Date().toISOString(),
    };
    this.stockCounts.set(`${tenantId}:${countId}`, updated);
    return { success: true, data: updated };
  }

  public async saveItemBatch(tenantId: string, batch: ItemBatch): Promise<StorageResult<ItemBatch>> {
    this.itemBatches.set(`${tenantId}:${batch.id}`, { ...batch, tenantId });
    return { success: true, data: batch };
  }

  public async listItemBatches(tenantId: string, itemId?: string, warehouseId?: string): Promise<StorageResult<ItemBatch[]>> {
    let list = Array.from(this.itemBatches.values()).filter(b => b.tenantId === tenantId);
    if (itemId) list = list.filter(b => b.itemId === itemId);
    if (warehouseId) list = list.filter(b => b.warehouseId === warehouseId);
    return { success: true, data: list.map(b => ({ ...b })) };
  }

  public async saveItemSerial(tenantId: string, serial: ItemSerial): Promise<StorageResult<ItemSerial>> {
    this.itemSerials.set(`${tenantId}:${serial.id}`, { ...serial, tenantId });
    return { success: true, data: serial };
  }

  public async listItemSerials(tenantId: string, itemId?: string, warehouseId?: string): Promise<StorageResult<ItemSerial[]>> {
    let list = Array.from(this.itemSerials.values()).filter(s => s.tenantId === tenantId);
    if (itemId) list = list.filter(s => s.itemId === itemId);
    if (warehouseId) list = list.filter(s => s.warehouseId === warehouseId);
    return { success: true, data: list.map(s => ({ ...s })) };
  }

  // ============================================================================
  // Phase 7.6 Storage Implementations (InMemory)
  // ============================================================================

  public async saveStockDocument(tenantId: string, doc: StockDocument, idempotencyKey: string): Promise<StorageResult<StockDocument>> {
    const cached = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'saveStockDocument');
    if (cached.success && cached.data) return { success: true, data: cached.data };

    this.stockDocuments.set(`${tenantId}:${doc.id}`, { ...doc, tenantId });
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'saveStockDocument', doc);
    return { success: true, data: { ...doc } };
  }

  // Phase 10/11: synchronous movement step shared by the atomic document and transfer posts (the caller owns snapshot/restore).
  private applyMovementMem(
    tenantId: string,
    m: StockMovement,
    opts: { providedCost: boolean; rejectNegative: boolean }
  ): { ok: true; saved: StockMovement; incoming: boolean } | { ok: false; error: { type: string; title: string; status: number; detail: string } } {
    const isIn = m.movementType === 'RECEIPT' || m.movementType === 'TRANSFER_IN' || m.movementType === 'COUNT_ADJUSTMENT_GAIN';
    const key = `${tenantId}:${m.warehouseId}:${m.itemId}`;
    const existing = this.warehouseStock.get(key) || {
      id: `${m.warehouseId}-${m.itemId}`, tenantId, companyId: m.companyId || tenantId, warehouseId: m.warehouseId, itemId: m.itemId,
      currentQty: 0, reservedQty: 0, availableQty: 0, averageCost: m.unitCost || 0, totalValue: 0, updatedAt: new Date().toISOString(),
    };
    let newQty = existing.currentQty;
    let newAvg = existing.averageCost;
    let unitCostUsed = m.unitCost;
    let totalCostUsed = m.totalCost;
    if (isIn) {
      const total = newQty + Math.abs(m.quantity);
      if (total > 0 && m.unitCost) newAvg = ((newQty * existing.averageCost) + (Math.abs(m.quantity) * m.unitCost)) / total;
      newQty = total;
    } else {
      newQty = newQty - Math.abs(m.quantity);
      if (newQty < -0.00005 && opts.rejectNegative) {
        return { ok: false, error: { type: 'https://api.an-erp.local/errors/insufficient-stock', title: 'الرصيد المخزني غير كافٍ', status: 422,
          detail: `الرصيد المتاح للصنف ${m.itemNameAr} (${existing.currentQty}) أقل من الكمية المطلوبة للصرف (${Math.abs(m.quantity)}). فشلت العملية بالكامل ذرياً.` } };
      }
      if (!opts.providedCost) {
        unitCostUsed = existing.averageCost > 0 ? existing.averageCost : m.unitCost;
        totalCostUsed = Math.round(Math.abs(m.quantity) * unitCostUsed * 100) / 100;
      }
    }
    // Phase 13 (COST-001): FIFO / SPECIFIC_LOT items use cost layers (WEIGHTED_AVERAGE items are unchanged)
    const lay = this.layerStepMem(tenantId, m, isIn, existing, newQty);
    if (!lay.ok) return { ok: false, error: lay.error };
    if (lay.layered && !isIn && !opts.providedCost) { unitCostUsed = lay.unitCost; totalCostUsed = lay.totalCost; }
    this.warehouseStock.set(key, {
      ...existing,
      currentQty: newQty,
      availableQty: newQty - existing.reservedQty,
      averageCost: lay.layered ? lay.averageCost : Math.round(newAvg * 100) / 100,
      totalValue: lay.layered ? lay.totalValue : Math.round(newQty * newAvg * 100) / 100,
      updatedAt: new Date().toISOString(),
    });
    const saved: StockMovement = { ...m, unitCost: unitCostUsed, totalCost: totalCostUsed, balanceAfterQty: newQty, timestamp: m.timestamp || new Date().toISOString() };
    this.stockMovements.set(`${tenantId}:${m.id}`, saved);
    return { ok: true, saved, incoming: isIn };
  }

  // Phase 10 (STK-ATOMIC-001): same contract as the PostgreSQL adapter. There is NO await between taking the snapshot and
  // committing, so the whole post is atomic with respect to the event loop; any failure restores the snapshot.
  public async postStockDocumentAtomic(tenantId: string, input: PostStockDocumentAtomicInput, idempotencyKey: string): Promise<StorageResult<StockDocument>> {
    const cacheKey = `${tenantId}:postStockDocumentAtomic:${idempotencyKey}`;
    if (idempotencyKey && this.idempotencyRecords.has(cacheKey)) {
      return { success: true, data: this.idempotencyRecords.get(cacheKey) };
    }
    const { doc, movements } = input;
    const fail = (status: number, type: string, title: string, detail: string): StorageResult<StockDocument> =>
      ({ success: false, error: { type: `https://api.an-erp.local/errors/${type}`, title, status, detail } });

    if (!doc.lines || doc.lines.length === 0 || doc.lines.length !== movements.length) {
      return fail(400, 'invalid-document', 'مستند مخزني غير صالح', 'عدد أسطر المستند لا يطابق عدد الحركات.');
    }
    for (let i = 0; i < movements.length; i++) {
      if (doc.lines[i].itemId !== movements[i].itemId || Number(doc.lines[i].quantity) !== Number(movements[i].quantity)) {
        return fail(400, 'invalid-document', 'مستند مخزني غير صالح', `السطر رقم ${i + 1} لا يطابق حركته (الصنف أو الكمية).`);
      }
    }
    for (const d of this.stockDocuments.values()) {
      if (d.tenantId === tenantId && d.documentNumber === doc.documentNumber) {
        return fail(500, 'db-error', 'خطأ في التخزين', `رقم المستند ${doc.documentNumber} مستخدم بالفعل.`);
      }
    }

    // Atomic cumulative return guard (same rules as InventoryService; closes concurrent double-return window on InMemory)
    if ((doc.documentType === 'RETURN_RECEIPT' || doc.documentType === 'RETURN_ISSUE') && doc.referenceId) {
      const orig = this.stockDocuments.get(`${tenantId}:${doc.referenceId}`);
      if (!orig || orig.tenantId !== tenantId) {
        return fail(404, 'document-not-found', 'المستند الأصلي غير موجود', 'تعذر قفل/قراءة المستند الأصلي للمرتجع.');
      }
      if (orig.status !== 'POSTED') {
        return fail(400, 'invalid-original-status', 'حالة المستند الأصلي غير صالحة للمرتجع', `لا يمكن إنشاء مرتجع لمستند حالته ${orig.status || 'غير معروفة'}؛ يجب أن يكون مرحّلاً (POSTED).`);
      }
      const expect = doc.documentType === 'RETURN_RECEIPT' ? 'RECEIPT' : 'ISSUE';
      if (orig.documentType !== expect) {
        return fail(400, 'return-type-mismatch', 'نوع المرتجع لا يطابق الأصل', `المتوقع ${expect} والفعلي ${orig.documentType}.`);
      }
      const origBy = new Map<string, number>();
      for (const l of orig.lines || []) origBy.set(l.itemId, (origBy.get(l.itemId) || 0) + Number(l.quantity));
      const priorBy = new Map<string, number>();
      for (const d of this.stockDocuments.values()) {
        if (d.tenantId !== tenantId || d.status !== 'POSTED' || d.referenceId !== orig.id) continue;
        if (d.documentType !== 'RETURN_RECEIPT' && d.documentType !== 'RETURN_ISSUE') continue;
        for (const l of d.lines || []) priorBy.set(l.itemId, (priorBy.get(l.itemId) || 0) + Number(l.quantity));
      }
      const reqBy = new Map<string, number>();
      for (const l of doc.lines || []) reqBy.set(l.itemId, (reqBy.get(l.itemId) || 0) + Number(l.quantity));
      for (const [itemId, reqQty] of reqBy) {
        const origQty = origBy.get(itemId) || 0;
        const priorQty = priorBy.get(itemId) || 0;
        const remaining = Math.round((origQty - priorQty) * 1000) / 1000;
        if (!origBy.has(itemId) || reqQty > remaining + 1e-9) {
          return fail(400, 'quantity-exceeds-original', 'الكمية تتجاوز المتاح للإرجاع',
            `الصنف ${itemId}: المطلوب (${reqQty}) + السابق (${priorQty}) / الأصل (${origQty}).`);
        }
      }
    }

    const snap = {
      stock: new Map(this.warehouseStock),
      movements: new Map(this.stockMovements),
      batches: new Map(this.itemBatches),
      serials: new Map(this.itemSerials),
      docs: new Map(this.stockDocuments),
      layers: new Map(this.costLayers),
    };
    const restore = () => {
      this.costLayers = snap.layers;
      this.warehouseStock = snap.stock;
      this.stockMovements = snap.movements;
      this.itemBatches = snap.batches;
      this.itemSerials = snap.serials;
      this.stockDocuments = snap.docs;
    };
    const isIn = (t: string) => t === 'RECEIPT' || t === 'TRANSFER_IN' || t === 'COUNT_ADJUSTMENT_GAIN';
    const round2 = (n: number) => Math.round(n * 100) / 100;

    try {
      const savedMovements: StockMovement[] = [];
      const lines = doc.lines.map(l => ({ ...l }));
      for (let i = 0; i < movements.length; i++) {
        const m = movements[i];
        const key = `${tenantId}:${m.warehouseId}:${m.itemId}`;
        const existing = this.warehouseStock.get(key) || {
          id: `${m.warehouseId}-${m.itemId}`, tenantId, companyId: m.companyId || tenantId, warehouseId: m.warehouseId, itemId: m.itemId,
          currentQty: 0, reservedQty: 0, availableQty: 0, averageCost: m.unitCost || 0, totalValue: 0, updatedAt: new Date().toISOString(),
        };
        let newQty = existing.currentQty;
        let newAvg = existing.averageCost;
        let unitCostUsed = m.unitCost;
        let totalCostUsed = m.totalCost;
        if (isIn(m.movementType)) {
          const total = newQty + Math.abs(m.quantity);
          if (total > 0 && m.unitCost) newAvg = ((newQty * existing.averageCost) + (Math.abs(m.quantity) * m.unitCost)) / total;
          newQty = total;
        } else {
          newQty = newQty - Math.abs(m.quantity);
          if (newQty < -0.00005 && input.allowNegative !== true) {
            restore();
            return fail(422, 'insufficient-stock', 'الرصيد المخزني غير كافٍ',
              `الرصيد المتاح للصنف ${m.itemNameAr} (${existing.currentQty}) أقل من الكمية المطلوبة للصرف (${Math.abs(m.quantity)}). فشلت العملية بالكامل ذرياً.`);
          }
          if (input.useProvidedCost !== true) {
            unitCostUsed = existing.averageCost > 0 ? existing.averageCost : m.unitCost;
            totalCostUsed = round2(Math.abs(m.quantity) * unitCostUsed);
          }
        }
        // Phase 13 (COST-001): FIFO / SPECIFIC_LOT items use cost layers (WEIGHTED_AVERAGE items are unchanged)
        const lay = this.layerStepMem(tenantId, m, isIn(m.movementType), existing, newQty);
        if (!lay.ok) {
          restore();
          return fail(lay.error.status, lay.error.type.split('/').pop() as string, lay.error.title, lay.error.detail);
        }
        if (lay.layered && !isIn(m.movementType) && input.useProvidedCost !== true) { unitCostUsed = lay.unitCost; totalCostUsed = lay.totalCost; }
        this.warehouseStock.set(key, {
          ...existing,
          currentQty: newQty,
          availableQty: newQty - existing.reservedQty,
          averageCost: lay.layered ? lay.averageCost : Math.round(newAvg * 100) / 100,
          totalValue: lay.layered ? lay.totalValue : Math.round(newQty * newAvg * 100) / 100,
          updatedAt: new Date().toISOString(),
        });
        const saved: StockMovement = { ...m, unitCost: unitCostUsed, totalCost: totalCostUsed, balanceAfterQty: newQty, timestamp: m.timestamp || new Date().toISOString() };
        this.stockMovements.set(`${tenantId}:${m.id}`, saved);
        savedMovements.push(saved);
        if (!isIn(m.movementType)) { lines[i].unitCost = unitCostUsed; lines[i].totalCost = totalCostUsed; }
      }
      for (const b of input.batches || []) this.itemBatches.set(`${tenantId}:${b.id}`, { ...b, tenantId });
      for (const sr of input.serials || []) this.itemSerials.set(`${tenantId}:${sr.id}`, { ...sr, tenantId });
      const finalDoc: StockDocument = {
        ...doc,
        tenantId,
        lines,
        movements: savedMovements,
        totalCost: round2(lines.reduce((sum, l) => sum + Number(l.totalCost || 0), 0)),
      };
      this.stockDocuments.set(`${tenantId}:${doc.id}`, finalDoc);
      if (idempotencyKey) this.idempotencyRecords.set(cacheKey, finalDoc);
      return { success: true, data: { ...finalDoc } };
    } catch (e: any) {
      restore();
      return fail(500, 'db-error', 'خطأ في التخزين', e?.message || 'فشل ترحيل المستند المخزني.');
    }
  }

  public async getStockDocument(tenantId: string, docId: string): Promise<StorageResult<StockDocument | null>> {
    for (const doc of this.stockDocuments.values()) {
      if (doc.tenantId === tenantId && (doc.id === docId || doc.documentNumber === docId)) {
        return { success: true, data: { ...doc } };
      }
    }
    return { success: true, data: null };
  }

  public async listStockDocuments(
    tenantId: string,
    filter?: { warehouseId?: string; documentType?: StockDocumentType; referenceId?: string; limit?: number }
  ): Promise<StorageResult<StockDocument[]>> {
    let list = Array.from(this.stockDocuments.values()).filter(d => d.tenantId === tenantId);
    if (filter?.warehouseId) list = list.filter(d => d.warehouseId === filter.warehouseId);
    if (filter?.documentType) list = list.filter(d => d.documentType === filter.documentType);
    if (filter?.referenceId) list = list.filter(d => d.referenceId === filter.referenceId);
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (filter?.limit) list = list.slice(0, filter.limit);
    return { success: true, data: list.map(d => ({ ...d })) };
  }

  public async saveCustodyExpenseVoucher(
    tenantId: string,
    voucher: CustodyExpenseVoucher,
    idempotencyKey: string
  ): Promise<StorageResult<CustodyExpenseVoucher>> {
    const cached = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'saveCustodyExpenseVoucher');
    if (cached.success && cached.data) return { success: true, data: cached.data };

    // Deduct custody balance
    const custody = this.cashCustodies.get(`${tenantId}:${voucher.custodyId}`);
    if (!custody) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/custody-not-found',
          title: 'العهدة غير موجودة',
          status: 404,
          detail: 'لم يتم العثور على سجل العهدة النقدية.',
        },
      };
    }
    if (custody.currentBalance < voucher.totalAmount) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/insufficient-custody-balance',
          title: 'رصيد العهدة غير كافٍ',
          status: 400,
          detail: `الرصيد المتاح بالعهدة (${custody.currentBalance} ر.س) لا يكفي لتغطية إجمالي بنود المصروف (${voucher.totalAmount} ر.س).`,
        },
      };
    }

    custody.currentBalance -= voucher.totalAmount;
    custody.updatedAt = new Date().toISOString();
    this.cashCustodies.set(`${tenantId}:${voucher.custodyId}`, custody);

    this.custodyExpenseVouchers.set(`${tenantId}:${voucher.id}`, { ...voucher, tenantId });
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'saveCustodyExpenseVoucher', voucher);
    return { success: true, data: { ...voucher } };
  }

  public async getCustodyExpenseVoucher(tenantId: string, voucherId: string): Promise<StorageResult<CustodyExpenseVoucher | null>> {
    for (const v of this.custodyExpenseVouchers.values()) {
      if (v.tenantId === tenantId && (v.id === voucherId || v.voucherNumber === voucherId)) {
        return { success: true, data: { ...v } };
      }
    }
    return { success: true, data: null };
  }

  // Phase 11/12 Helpers
  private approvalProblem(status: number, type: string, title: string, detail: string) {
    return { type: `https://api.an-erp.local/errors/${type}`, title, status, detail };
  }

  private evaluateApprovalAction(
    req: ApprovalRequest,
    approverId: string,
    approverRole: string | undefined
  ): { ok: true; index: number } | { ok: false; error: { type: string; title: string; status: number; detail: string } } {
    if (req.status !== 'PENDING') {
      return { ok: false, error: this.approvalProblem(409, 'request-not-pending', 'طلب الاعتماد ليس قيد الانتظار', `حالة الطلب الحالية (${req.status}) لا تسمح بأي إجراء.`) };
    }
    if (req.initiatorId === approverId) {
      return { ok: false, error: this.approvalProblem(403, 'sod-violation', 'تعارض مصالح - فصل الصلاحيات والواجبات', 'ممنوع نظامياً: لا يجوز لمنشئ المستند اعتماده بنفسه (قاعدة فصل المهام والرقابة الثنائية).') };
    }
    let index = -1;
    req.steps.forEach((st, i) => {
      if (st.status === 'PENDING' && (index < 0 || st.stepNumber < req.steps[index].stepNumber)) index = i;
    });
    if (index < 0) {
      return { ok: false, error: this.approvalProblem(409, 'request-not-pending', 'طلب الاعتماد ليس قيد الانتظار', 'لا توجد خطوة معلّقة في هذا الطلب.') };
    }
    const step = req.steps[index];
    if (step.approverType) {
      if (step.approverType === 'USER') {
        if (approverId !== step.approverRef) {
          return { ok: false, error: this.approvalProblem(403, 'not-assigned-approver', 'المستخدم غير مكلّف بهذه الخطوة', 'هذه الخطوة مخصصة لمستخدم آخر.') };
        }
      } else if ((approverRole || '').toLowerCase() !== (step.approverRef || '').toLowerCase() || !approverRole) {
        return { ok: false, error: this.approvalProblem(403, 'role-not-allowed', 'دور المستخدم لا يسمح بهذه الخطوة', 'دور المستخدم الحالي لا يطابق الدور المطلوب لهذه الخطوة.') };
      }
      if (req.enforceDistinctApprovers && req.steps.some(x => x.status === 'APPROVED' && x.approverId === approverId)) {
        return { ok: false, error: this.approvalProblem(403, 'duplicate-approver', 'لا يجوز لنفس الشخص اعتماد أكثر من خطوة', 'السياسة تشترط أن يكون لكل خطوة موافق مختلف.') };
      }
    }
    return { ok: true, index };
  }

  private cloneApproval(req: ApprovalRequest): ApprovalRequest {
    return JSON.parse(JSON.stringify(req));
  }

  private findApproval(tenantId: string, requestId: string): ApprovalRequest | null {
    const found = this.approvalRequests.get(`${tenantId}:${requestId}`) || this.approvalRequests.get(requestId);
    if (!found) return null;
    if (found.tenantId && found.tenantId !== tenantId) return null;
    return found;
  }

  private saveApproval(tenantId: string, req: ApprovalRequest) {
    this.approvalRequests.set(`${tenantId}:${req.id}`, req);
    this.approvalRequests.set(req.id, req);
  }

  public async listCustodyExpenseVouchers(tenantId: string, custodyId?: string): Promise<StorageResult<CustodyExpenseVoucher[]>> {
    let list = Array.from(this.custodyExpenseVouchers.values()).filter(v => v.tenantId === tenantId);
    if (custodyId) list = list.filter(v => v.custodyId === custodyId);
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { success: true, data: list.map(v => ({ ...v })) };
  }

  public async reverseCustodyExpenseVoucher(
    tenantId: string,
    voucherId: string,
    reversedBy: string,
    idempotencyKey: string
  ): Promise<StorageResult<CustodyExpenseVoucher>> {
    const cached = await this.checkIdempotencyRecord(tenantId, idempotencyKey, 'reverseCustodyExpenseVoucher');
    if (cached.success && cached.data) return { success: true, data: cached.data };

    const voucher = this.custodyExpenseVouchers.get(`${tenantId}:${voucherId}`);
    if (!voucher) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/voucher-not-found',
          title: 'سند صرف العهدة غير موجود',
          status: 404,
          detail: 'تعذر العثور على سند صرف العهدة المراد عكسه.',
        },
      };
    }
    if (voucher.status === 'REVERSED') {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/already-reversed',
          title: 'السند معكوس مسبقاً',
          status: 400,
          detail: 'تم عكس سند صرف العهدة مسبقاً.',
        },
      };
    }

    // Refund custody balance
    const custody = this.cashCustodies.get(`${tenantId}:${voucher.custodyId}`);
    if (custody) {
      custody.currentBalance += voucher.totalAmount;
      custody.updatedAt = new Date().toISOString();
      this.cashCustodies.set(`${tenantId}:${voucher.custodyId}`, custody);
    }

    voucher.status = 'REVERSED';
    this.custodyExpenseVouchers.set(`${tenantId}:${voucherId}`, voucher);
    await this.saveIdempotencyRecord(tenantId, idempotencyKey, 'reverseCustodyExpenseVoucher', voucher);
    return { success: true, data: { ...voucher } };
  }

  public async saveDocumentAttachment(tenantId: string, attachment: DocumentAttachment): Promise<StorageResult<DocumentAttachment>> {
    this.documentAttachments.set(`${tenantId}:${attachment.id}`, { ...attachment, tenantId });
    return { success: true, data: { ...attachment } };
  }

  public async listDocumentAttachments(
    tenantId: string,
    documentType: string,
    documentId: string
  ): Promise<StorageResult<DocumentAttachment[]>> {
    const list = Array.from(this.documentAttachments.values()).filter(
      a => a.tenantId === tenantId && a.documentType === documentType && a.documentId === documentId
    );
    return { success: true, data: list.map(a => ({ ...a })) };
  }

  public async saveItemPrice(tenantId: string, price: ItemPrice): Promise<StorageResult<ItemPrice>> {
    this.itemPrices.set(`${tenantId}:${price.id}`, { ...price, tenantId });
    return { success: true, data: { ...price } };
  }

  public async getItemPrices(tenantId: string, itemId: string): Promise<StorageResult<ItemPrice[]>> {
    const list = Array.from(this.itemPrices.values()).filter(p => p.tenantId === tenantId && p.itemId === itemId);
    return { success: true, data: list.map(p => ({ ...p })) };
  }
}
