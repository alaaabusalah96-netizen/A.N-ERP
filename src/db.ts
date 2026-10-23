import { 
  AppUser, 
  ExpenseCategory, 
  Transaction, 
  TransactionStatus, 
  ActivityLog, 
  CustodyConfig, 
  Region, 
  Station, 
  Company, 
  UserRole, 
  UserPermissions, 
  CashVoucher, 
  TransactionHistory, 
  Notification, 
  AuditLog, 
  SystemPermission, 
  SystemRole, 
  DeletedTransaction, 
  SignupRequest,
  AccountCorrectionRequest
} from './types';

import { seedDatabaseIfEmpty, setupFirebaseSync, dbFetchUserByEmail } from './firebase';

import { StorageEngine } from './db/storage';
import { OrganizationEngine } from './db/organizationEngine';
import { OrganizationScopeEngine } from './db/organizationScopeEngine';
import { 
  DEFAULT_COMPANIES,
  DEFAULT_REGIONS,
  DEFAULT_STATIONS,
  DEFAULT_CATEGORIES,
  DEFAULT_USERS,
  DEFAULT_TRANSACTIONS,
  DEFAULT_LOGS,
  DEFAULT_CONFIG,
  DEFAULT_EXPENSES,
  DEFAULT_VOUCHERS,
  DEFAULT_TX_HISTORY,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_AUDIT_LOGS,
  DEFAULT_PERMISSIONS,
  DEFAULT_ROLES,
  DEFAULT_ORGANIZATION_UNITS
} from './db/defaults';

import { LogsModule } from './db/logs';
import { UsersModule } from './db/users';
import { hashPassword, legacyHashPassword, legacySinglePassHashPassword, legacyStretchedHashPassword1000 } from './lib/hash';
import { CompaniesModule } from './db/companies';
import { StationsModule } from './db/stations';
import { NotificationsModule } from './db/notifications';
import { TransactionsModule } from './db/transactions';
import { ModulesModule, ERP_MODULES_REGISTRY, CompanyModuleSettings } from './db/modules';
import { InventoryModule, StockLookupIndex } from './db/inventory';
import { ContractingEngine } from './db/contracting';
import { RestaurantEngine } from './db/restaurant';
import { CustodyEngine, ReplenishParams, ReverseReplenishParams, CountAdjustParams, UpdateReplenishParams, ConsumeParams } from './db/custody';
import { PeriodReportFilter, CustodyPeriodReport } from './types';
import { ConfigurationEngine } from './lib/enterprise/configuration';
import { TenantSettings } from './types/enterprise';
import { db } from './firebase';

export { hashPassword, legacyHashPassword, legacySinglePassHashPassword, legacyStretchedHashPassword1000, ModulesModule, ERP_MODULES_REGISTRY, type CompanyModuleSettings, ConfigurationEngine, type TenantSettings, type StockLookupIndex, ContractingEngine, RestaurantEngine, InventoryModule, CompaniesModule, UsersModule, CustodyEngine };

export class CustodyDB {
  static hashPassword(password: string, salt: string = '', pepperVersion: number = 2): string {
    return hashPassword(password, salt, pepperVersion);
  }

  static legacyStretchedHashPassword1000(password: string, salt: string = '', pepperVersion: number = 2): string {
    return legacyStretchedHashPassword1000(password, salt, pepperVersion);
  }

  static legacySinglePassHashPassword(password: string, salt: string = '', pepperVersion: number = 2): string {
    return legacySinglePassHashPassword(password, salt, pepperVersion);
  }

  static legacyHashPassword(password: string, salt: string = ''): string {
    return legacyHashPassword(password, salt);
  }

  static initializeFirebase(): void {
    seedDatabaseIfEmpty({
      companies: DEFAULT_COMPANIES,
      regions: DEFAULT_REGIONS,
      stations: DEFAULT_STATIONS,
      categories: DEFAULT_CATEGORIES,
      users: DEFAULT_USERS,
      transactions: DEFAULT_TRANSACTIONS,
      logs: DEFAULT_LOGS,
      config: DEFAULT_CONFIG,
      expenses: DEFAULT_EXPENSES,
      cashVouchers: DEFAULT_VOUCHERS,
      transactionHistory: DEFAULT_TX_HISTORY,
      notifications: DEFAULT_NOTIFICATIONS,
      auditLogs: DEFAULT_AUDIT_LOGS,
      permissions: DEFAULT_PERMISSIONS,
      roles: DEFAULT_ROLES,
      organizationUnits: DEFAULT_ORGANIZATION_UNITS
    }).then(() => {
      setupFirebaseSync();
    }).catch(err => {
      console.warn('Failed to seed or synchronize with Firebase, running in fallback mode:', err);
    });
  }

  static async seedSampleData(): Promise<void> {
    StorageEngine.setStored('companies', DEFAULT_COMPANIES);
    StorageEngine.setStored('regions', DEFAULT_REGIONS);
    StorageEngine.setStored('stations', DEFAULT_STATIONS);
    StorageEngine.setStored('organization_units', DEFAULT_ORGANIZATION_UNITS);
    StorageEngine.setStored('users', DEFAULT_USERS);
    StorageEngine.setStored('transactions', DEFAULT_TRANSACTIONS);
    StorageEngine.setStored('categories', DEFAULT_CATEGORIES);
    StorageEngine.setStored('expenses', DEFAULT_EXPENSES);
    StorageEngine.setStored('vouchers', DEFAULT_VOUCHERS);
    StorageEngine.setStored('Permissions', DEFAULT_PERMISSIONS);
    StorageEngine.setStored('permissions', DEFAULT_PERMISSIONS);
    StorageEngine.setStored('Roles', DEFAULT_ROLES);
    StorageEngine.setStored('roles', DEFAULT_ROLES);

    CustodyDB.clearCache();

    try {
      await seedDatabaseIfEmpty({
        companies: DEFAULT_COMPANIES,
        regions: DEFAULT_REGIONS,
        stations: DEFAULT_STATIONS,
        categories: DEFAULT_CATEGORIES,
        users: DEFAULT_USERS,
        transactions: DEFAULT_TRANSACTIONS,
        logs: DEFAULT_LOGS,
        config: DEFAULT_CONFIG,
        expenses: DEFAULT_EXPENSES,
        cashVouchers: DEFAULT_VOUCHERS,
        transactionHistory: DEFAULT_TX_HISTORY,
        notifications: DEFAULT_NOTIFICATIONS,
        auditLogs: DEFAULT_AUDIT_LOGS,
        permissions: DEFAULT_PERMISSIONS,
        roles: DEFAULT_ROLES,
        organizationUnits: DEFAULT_ORGANIZATION_UNITS
      });
    } catch (e) {
      console.warn('Firebase seed failed, local storage seeded successfully:', e);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('custody_db_updated', { detail: { key: 'all' } }));
    }
  }

  static enrichUserPermissions(role: UserRole, currentPerms?: Partial<UserPermissions>): UserPermissions {
    return UsersModule.enrichUserPermissions(role, currentPerms);
  }

  static clearCache(): void {
    StorageEngine.clearCache();
    OrganizationEngine.invalidateLookupIndex();
    OrganizationScopeEngine.invalidateScopeCache();
    InventoryModule.clearStockLookupIndex();
  }

  static initializeCacheListener(): void {
    StorageEngine.initializeCacheListener();
    if (typeof window !== 'undefined') {
      window.addEventListener('custody_db_updated', ((e: CustomEvent) => {
        const { key } = e.detail || {};
        if (key === 'organization_units' || !key) {
          OrganizationEngine.invalidateLookupIndex();
          OrganizationScopeEngine.invalidateScopeCache();
        }
        if (key === 'stock_movements' || !key) {
          InventoryModule.clearStockLookupIndex();
        }
      }) as EventListener);
    }
  }

  static getStockLookupIndex(): StockLookupIndex {
    return InventoryModule.getStockLookupIndex();
  }

  static clearStockLookupIndex(): void {
    InventoryModule.clearStockLookupIndex();
  }

  // Companies
  static getCompanies(): Company[] {
    return CompaniesModule.getCompanies();
  }

  static async saveCompanies(companies: Company[]): Promise<{ success: boolean; error?: string }> {
    return CompaniesModule.saveCompanies(companies);
  }

  static async addCompany(name: string, custodyValue?: number, customId?: string): Promise<Company | null> {
    return CompaniesModule.addCompany(name, custodyValue, customId);
  }

  static async updateCompany(id: string, updates: Partial<Company>): Promise<{ success: boolean; error?: string }> {
    return CompaniesModule.updateCompany(id, updates);
  }

  static async deleteCompany(id: string): Promise<{ success: boolean; error?: string; message?: string }> {
    return CompaniesModule.deleteCompany(id);
  }

  static getSelectedCompanyId(): string {
    return CompaniesModule.getSelectedCompanyId();
  }

  static setSelectedCompanyId(id: string): void {
    CompaniesModule.setSelectedCompanyId(id);
  }

  static async toggleCompanyStatus(companyId: string, isActive: boolean): Promise<void> {
    return CompaniesModule.toggleCompanyStatus(companyId, isActive);
  }

  static async updateCompanySubscription(
    companyId: string,
    plan: Company['subscription_plan'],
    status: Company['subscription_status'],
    expiry: string
  ): Promise<void> {
    return CompaniesModule.updateCompanySubscription(companyId, plan, status, expiry);
  }

  // Users
  static isPlatformOwner(email?: string): boolean {
    return UsersModule.isPlatformOwner(email);
  }

  static getUsers(): AppUser[] {
    return UsersModule.getUsers();
  }

  static getActiveUser(): AppUser | null {
    return UsersModule.getActiveUser();
  }

  static setActiveUser(user: AppUser | null): void {
    UsersModule.setActiveUser(user);
  }

  static async saveUsers(users: AppUser[]): Promise<void> {
    return UsersModule.saveUsers(users);
  }

  static async fetchUserByEmail(email: string): Promise<AppUser | null> {
    return dbFetchUserByEmail(email);
  }

  static upsertLocalUser(user: AppUser): void {
    UsersModule.upsertLocalUser(user);
  }

  static getScopedUsers(): AppUser[] {
    return UsersModule.getScopedUsers();
  }

  static impersonateUser(targetUser: AppUser, reason?: string): void {
    UsersModule.impersonateUser(targetUser, reason);
  }

  static exitImpersonation(): void {
    UsersModule.exitImpersonation();
  }

  static async resetUserPassword(userId: string, newPasswordPlain: string): Promise<void> {
    return UsersModule.resetUserPassword(userId, newPasswordPlain);
  }

  static getPermissions(): SystemPermission[] {
    return UsersModule.getPermissions();
  }

  static async savePermission(permission: SystemPermission): Promise<void> {
    return UsersModule.savePermission(permission);
  }

  static getRoles(): SystemRole[] {
    return UsersModule.getRoles();
  }

  static async saveRole(role: SystemRole): Promise<void> {
    return UsersModule.saveRole(role);
  }

  static getSignupRequests(): SignupRequest[] {
    return UsersModule.getSignupRequests();
  }

  static validateSignupRequestHeadcount(request: any) {
    return UsersModule.validateSignupRequestHeadcount(request);
  }

  static async saveSignupRequest(request: SignupRequest): Promise<void> {
    return UsersModule.saveSignupRequest(request);
  }

  static async deleteSignupRequest(id: string): Promise<void> {
    return UsersModule.deleteSignupRequest(id);
  }

  static getAccountCorrectionRequests(): AccountCorrectionRequest[] {
    return UsersModule.getAccountCorrectionRequests();
  }

  static async saveAccountCorrectionRequest(request: AccountCorrectionRequest): Promise<void> {
    return UsersModule.saveAccountCorrectionRequest(request);
  }

  static async deleteAccountCorrectionRequest(id: string): Promise<void> {
    return UsersModule.deleteAccountCorrectionRequest(id);
  }

  static async approveAccountCorrectionRequest(
    id: string,
    updates: {
      newEmail?: string;
      newFullName?: string;
      newPasswordPlain?: string;
      approvedBy?: string;
    }
  ) {
    return UsersModule.approveAccountCorrectionRequest(id, updates);
  }

  static async rejectAccountCorrectionRequest(
    id: string,
    rejectionReason: string,
    rejectedBy?: string
  ) {
    return UsersModule.rejectAccountCorrectionRequest(id, rejectionReason, rejectedBy);
  }

  static verifyUserPassword(email: string, passwordPlain: string): AppUser | null {
    return UsersModule.verifyUserPassword(email, passwordPlain);
  }

  // Regions
  static getRegions(): Region[] {
    return StationsModule.getRegions();
  }

  static getScopedRegions(): Region[] {
    return StationsModule.getScopedRegions();
  }

  static async saveRegions(regions: Region[]): Promise<{ success: boolean; error?: string }> {
    return StationsModule.saveRegions(regions);
  }

  static async addRegion(name: string, code?: string, companyId?: string): Promise<Region | null> {
    return StationsModule.addRegion(name, code, companyId);
  }

  static async updateRegion(id: string, updates: Partial<Region>): Promise<{ success: boolean; error?: string }> {
    return StationsModule.updateRegion(id, updates);
  }

  static async deleteRegion(id: string): Promise<{ success: boolean; error?: string }> {
    return StationsModule.deleteRegion(id);
  }

  // Stations
  static getStations(): Station[] {
    return StationsModule.getStations();
  }

  static getScopedStations(): Station[] {
    return StationsModule.getScopedStations();
  }

  static getStationsForUser(user: AppUser | null | undefined): Station[] {
    return StationsModule.getStationsForUser(user);
  }

  static async saveStations(stations: Station[]): Promise<{ success: boolean; error?: string }> {
    return StationsModule.saveStations(stations);
  }

  static async addStation(name: string, code: string, custodyAmount: number, regionId?: string, companyId?: string): Promise<Station | null> {
    return StationsModule.addStation(name, code, custodyAmount, regionId, companyId);
  }

  static async updateStation(id: string, updates: Partial<Station>): Promise<{ success: boolean; error?: string }> {
    return StationsModule.updateStation(id, updates);
  }

  static async deleteStation(id: string): Promise<{ success: boolean; error?: string }> {
    return StationsModule.deleteStation(id);
  }

  // Notifications
  static getNotifications(): Notification[] {
    return NotificationsModule.getNotifications();
  }

  static saveNotification(notification: Notification): void {
    NotificationsModule.saveNotification(notification);
  }

  static markNotificationAsRead(id: string): void {
    NotificationsModule.markNotificationAsRead(id);
  }

  // Logs
  static getLogs(): ActivityLog[] {
    return LogsModule.getLogs();
  }

  static getPaginatedLogs(
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (log: ActivityLog) => boolean,
    sortFn?: (a: ActivityLog, b: ActivityLog) => number
  ): { data: ActivityLog[]; total: number; page: number; pageSize: number; totalPages: number } {
    return LogsModule.getPaginatedLogs(page, pageSize, filterFn, sortFn);
  }

  static async getPaginatedLogsIDB(
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (log: ActivityLog) => boolean,
    sortFn?: (a: ActivityLog, b: ActivityLog) => number
  ): Promise<{ data: ActivityLog[]; total: number; page: number; pageSize: number; totalPages: number }> {
    return LogsModule.getPaginatedLogsIDB(page, pageSize, filterFn, sortFn);
  }

  static addLog(
    userId: string,
    userName: string,
    action: string,
    details: string,
    stationId?: string,
    companyId?: string,
    amount?: number,
    notes?: string
  ): void {
    LogsModule.addLog(userId, userName, action, details, stationId, companyId, amount, notes);
  }

  static deleteLog(id: string): void {
    LogsModule.deleteLog(id);
  }

  static updateReplenishmentLog(id: string, amount: number, notes: string, details: string): void {
    LogsModule.updateReplenishmentLog(id, amount, notes, details);
  }

  static getAuditLogs(): AuditLog[] {
    return LogsModule.getAuditLogs();
  }

  static getPaginatedAuditLogs(
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (log: AuditLog) => boolean,
    sortFn?: (a: AuditLog, b: AuditLog) => number
  ): { data: AuditLog[]; total: number; page: number; pageSize: number; totalPages: number } {
    return LogsModule.getPaginatedAuditLogs(page, pageSize, filterFn, sortFn);
  }

  static async getPaginatedAuditLogsIDB(
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (log: AuditLog) => boolean,
    sortFn?: (a: AuditLog, b: AuditLog) => number
  ): Promise<{ data: AuditLog[]; total: number; page: number; pageSize: number; totalPages: number }> {
    return LogsModule.getPaginatedAuditLogsIDB(page, pageSize, filterFn, sortFn);
  }

  static getPaginatedInventoryDocuments(
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (doc: any) => boolean,
    sortFn?: (a: any, b: any) => number
  ): { data: any[]; total: number; page: number; pageSize: number; totalPages: number } {
    return InventoryModule.getPaginatedInventoryDocuments(page, pageSize, filterFn, sortFn);
  }

  static async getPaginatedInventoryDocumentsIDB(
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (doc: any) => boolean,
    sortFn?: (a: any, b: any) => number
  ): Promise<{ data: any[]; total: number; page: number; pageSize: number; totalPages: number }> {
    return InventoryModule.getPaginatedInventoryDocumentsIDB(page, pageSize, filterFn, sortFn);
  }

  static getPaginatedStockMovements(
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (m: any) => boolean,
    sortFn?: (a: any, b: any) => number
  ): { data: any[]; total: number; page: number; pageSize: number; totalPages: number } {
    return InventoryModule.getPaginatedStockMovements(page, pageSize, filterFn, sortFn);
  }

  static async getPaginatedStockMovementsIDB(
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (m: any) => boolean,
    sortFn?: (a: any, b: any) => number
  ): Promise<{ data: any[]; total: number; page: number; pageSize: number; totalPages: number }> {
    return InventoryModule.getPaginatedStockMovementsIDB(page, pageSize, filterFn, sortFn);
  }

  static addAuditLog(auditLog: AuditLog): void {
    LogsModule.addAuditLog(auditLog);
  }

  static logAudit(actionType: string, description: string, details?: Record<string, any>): void {
    LogsModule.logAudit(actionType, description, details);
  }

  // Config
  static getConfig(): CustodyConfig {
    return TransactionsModule.getConfig();
  }

  static async saveConfig(config: CustodyConfig): Promise<{ success: boolean; error?: string }> {
    return TransactionsModule.saveConfig(config);
  }

  // Categories
  static getCategories(): ExpenseCategory[] {
    return TransactionsModule.getCategories();
  }

  static async saveCategories(categories: ExpenseCategory[]): Promise<{ success: boolean; error?: string }> {
    return TransactionsModule.saveCategories(categories);
  }

  // Transactions
  static getTransactions(): Transaction[] {
    return TransactionsModule.getTransactions();
  }

  static getScopedTransactions(): Transaction[] {
    return TransactionsModule.getScopedTransactions();
  }

  static getPaginatedScopedTransactions(
    page?: number,
    pageSize?: number,
    filterFn?: (tx: Transaction) => boolean,
    sortFn?: (a: Transaction, b: Transaction) => number
  ): { data: Transaction[]; total: number; page: number; pageSize: number; totalPages: number } {
    return TransactionsModule.getPaginatedScopedTransactions(page, pageSize, filterFn, sortFn);
  }

  static async getPaginatedScopedTransactionsIDB(
    page?: number,
    pageSize?: number,
    filterFn?: (tx: Transaction) => boolean,
    sortFn?: (a: Transaction, b: Transaction) => number
  ): Promise<{ data: Transaction[]; total: number; page: number; pageSize: number; totalPages: number }> {
    return TransactionsModule.getPaginatedScopedTransactionsIDB(page, pageSize, filterFn, sortFn);
  }

  static saveTransactions(transactions: Transaction[]): void {
    TransactionsModule.saveTransactions(transactions);
  }

  static async addTransaction(data: Omit<Transaction, 'id' | 'transaction_no' | 'status' | 'created_at' | 'updated_at' | 'created_by'> & { status?: TransactionStatus }): Promise<{ success: boolean; errors?: string[]; data?: Transaction }> {
    return TransactionsModule.addTransaction(data);
  }

  static async updateTransaction(id: string, updates: Partial<Transaction>): Promise<{ success: boolean; errors?: string[] }> {
    return TransactionsModule.updateTransaction(id, updates);
  }

  static deleteTransaction(id: string, reason: string): Promise<boolean> {
    return TransactionsModule.deleteTransaction(id, reason);
  }

  static restoreTransaction(id: string): Promise<boolean> {
    return TransactionsModule.restoreTransaction(id);
  }

  static getReconciliation(stationId?: string, regionId?: string, org_unit_id?: string) {
    return TransactionsModule.getReconciliation(stationId, regionId, org_unit_id);
  }

  static getStationDeductedCustody(stationId: string): number {
    return TransactionsModule.getStationDeductedCustody(stationId);
  }

  static getCustodyBalances(stationId: string) {
    return CustodyEngine.getBalances(stationId);
  }

  static replenishCustody(params: ReplenishParams) {
    return CustodyEngine.replenish(params);
  }

  static reverseCustodyReplenishment(params: ReverseReplenishParams) {
    return CustodyEngine.reverseReplenishment(params);
  }

  static countAdjustCustody(params: CountAdjustParams) {
    return CustodyEngine.count_adjust(params);
  }

  static getCustodyMovements(stationId?: string, companyId?: string) {
    return CustodyEngine.getMovements(stationId, companyId);
  }

  static getBalanceAt(stationId: string, at: Date | string, inclusive: boolean = true): number {
    return CustodyEngine.getBalanceAt(stationId, at, inclusive);
  }

  static getPeriodReport(filter: PeriodReportFilter): CustodyPeriodReport {
    return CustodyEngine.getPeriodReport(filter);
  }

  static async consumeCustody(params: ConsumeParams) {
    return CustodyEngine.consume(params);
  }

  static getCompanyDeductedCustody(companyId: string): number {
    return TransactionsModule.getCompanyDeductedCustody(companyId);
  }

  static getExpenses(): any[] {
    return TransactionsModule.getExpenses();
  }

  static async saveExpense(expense: any): Promise<{ success: boolean; error?: string }> {
    return TransactionsModule.saveExpense(expense);
  }

  static async deleteExpense(id: string): Promise<{ success: boolean; error?: string }> {
    return TransactionsModule.deleteExpense(id);
  }

  static getCashVouchers(): CashVoucher[] {
    return TransactionsModule.getCashVouchers();
  }

  static async saveCashVoucher(voucher: CashVoucher, expectedVersion?: number): Promise<{ success: boolean; error?: string }> {
    return TransactionsModule.saveCashVoucher(voucher, expectedVersion);
  }

  static async deleteCashVoucher(id: string): Promise<{ success: boolean; error?: string }> {
    return TransactionsModule.deleteCashVoucher(id);
  }

  static getCompanySequences(): { id: string; company_id: string; last_voucher_no: number }[] {
    return TransactionsModule.getCompanySequences();
  }

  static getCompanySequence(companyId: string): number | null {
    return TransactionsModule.getCompanySequence(companyId);
  }

  static hasCompanySequence(companyId: string): boolean {
    return TransactionsModule.hasCompanySequence(companyId);
  }

  static hasAnyVouchersForCompany(companyId: string): boolean {
    return TransactionsModule.hasAnyVouchersForCompany(companyId);
  }

  static needsManualFirstVoucherNo(companyId: string): boolean {
    return TransactionsModule.needsManualFirstVoucherNo(companyId);
  }

  static getNextAutoVoucherNo(companyId: string): string {
    return TransactionsModule.getNextAutoVoucherNo(companyId);
  }

  static initializeOrIncrementSequence(companyId: string, manualFirstNo?: number): Promise<number> {
    return TransactionsModule.initializeOrIncrementSequence(companyId, manualFirstNo);
  }

  static resetCompanySequence(companyId: string): Promise<void> {
    return TransactionsModule.resetCompanySequence(companyId);
  }

  static getTransactionHistory(): TransactionHistory[] {
    return TransactionsModule.getTransactionHistory();
  }

  static addTransactionHistory(history: TransactionHistory): void {
    TransactionsModule.addTransactionHistory(history);
  }

  static getDeletedTransactions(): DeletedTransaction[] {
    return TransactionsModule.getDeletedTransactions();
  }

  static saveDeletedTransactions(records: DeletedTransaction[]): void {
    TransactionsModule.saveDeletedTransactions(records);
  }

  static fetchPaginated<T>(
    collectionName: string,
    limitVal: number,
    lastDocId?: string
  ): Promise<{ data: T[]; lastDocId?: string; hasMore: boolean }> {
    return TransactionsModule.fetchPaginated<T>(collectionName, limitVal, lastDocId);
  }

  static getConfigurationEngine(): ConfigurationEngine {
    return new ConfigurationEngine(db as any);
  }

  static async getTenantSettings(tenantId: string): Promise<TenantSettings> {
    const engine = CustodyDB.getConfigurationEngine();
    return await engine.getTenantSettings(tenantId);
  }

  static async saveTenantSettings(tenantId: string, settings: Partial<TenantSettings>): Promise<TenantSettings> {
    const engine = CustodyDB.getConfigurationEngine();
    return await engine.saveTenantSettings(tenantId, settings);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('custody_db_updated', () => {
    CustodyDB.clearCache();
  });
}
