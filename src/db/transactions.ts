import { 
  ExpenseCategory, 
  CustodyConfig, 
  Transaction, 
  TransactionStatus, 
  TransactionHistory, 
  DeletedTransaction, 
  CashVoucher 
} from '../types';
import { dbFetchPaginated } from '../firebase';
import { StorageEngine } from './storage';
import { syncWriteWithOfflineFallback } from './offlineQueue';
import { DEFAULT_CATEGORIES, DEFAULT_TRANSACTIONS } from './defaults';
import { UsersModule } from './users';
import { LogsModule } from './logs';
import { CompaniesModule } from './companies';
import { StationsModule } from './stations';
import { OrganizationScopeEngine } from './organizationScopeEngine';

// Import submodules
import { TransactionsCreateModule } from './transactions.create';
import { TransactionsUpdateModule } from './transactions.update';
import { TransactionsDeleteModule } from './transactions.delete';
import { TransactionsRestoreModule } from './transactions.restore';
import { TransactionsHistoryModule } from './transactions.history';
import { TransactionsVoucherModule } from './transactions.voucher';
import { TransactionsReconciliationModule } from './transactions.reconciliation';

export class TransactionsModule {
  // Expense Categories
  static getCategories(): ExpenseCategory[] {
    return StorageEngine.getStored<ExpenseCategory[]>('categories', DEFAULT_CATEGORIES);
  }

  static async saveCategories(categories: ExpenseCategory[]): Promise<{ success: boolean; error?: string }> {
    const existing = StorageEngine.getStored<ExpenseCategory[]>('categories', []);
    const changedCategories = categories.filter(c => {
      const old = existing.find(ex => ex.id === c.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(c);
    });

    for (const c of changedCategories) {
      const res = await syncWriteWithOfflineFallback('categories', c.id, c);
      if (!res.success) {
        const errorMsg = res.error || `فشل حفظ بيانات بند المصروفات ${c.name_ar || c.name_en || c.id} في قاعدة البيانات.`;
        console.warn(`[saveCategories] Warning: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    }

    StorageEngine.setStored('categories', categories);
    const user = UsersModule.getActiveUser();
    LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Update Categories', 'Modified available expense category configurations.');
    return { success: true };
  }

  // Custody Config
  static getConfig(): CustodyConfig {
    const targetCompanyId = CompaniesModule.getSelectedCompanyId();
    const companies = CompaniesModule.getCompanies();
    const activeCompany = companies.find(c => c.id === targetCompanyId) || companies[0] || { name: 'KEMIT ERP', custody_value: 0 } as any;
    return {
      company_name: activeCompany.name || 'KEMIT ERP',
      custody_value: activeCompany.custody_value || 0,
      use_custom_template: activeCompany.use_custom_template || false,
      custom_template_image: activeCompany.custom_template_image || ''
    };
  }

  static async saveConfig(config: CustodyConfig): Promise<{ success: boolean; error?: string }> {
    const targetCompanyId = CompaniesModule.getSelectedCompanyId();
    const companies = CompaniesModule.getCompanies();
    const updated = companies.map(c => {
      if (c.id === targetCompanyId) {
        return { 
          ...c, 
          name: config.company_name, 
          custody_value: config.custody_value,
          use_custom_template: config.use_custom_template,
          custom_template_image: config.custom_template_image
        };
      }
      return c;
    });
    const res = await CompaniesModule.saveCompanies(updated);
    if (!res.success) {
      return res;
    }
    
    const user = UsersModule.getActiveUser();
    LogsModule.addLog(
      user?.id || 'system', 
      user?.full_name || 'System', 
      'Update Custody', 
      `Adjusted company metadata for ${config.company_name}.`
    );
    return { success: true };
  }

  // Transactions list
  static getTransactions(): Transaction[] {
    return StorageEngine.getStored<Transaction[]>('transactions', DEFAULT_TRANSACTIONS);
  }

  static getScopedTransactions(): Transaction[] {
    const txs = TransactionsModule.getTransactions().filter(t => t.status !== 'Deleted' && (t.status as string) !== 'deleted');
    const user = UsersModule.getActiveUser();
    if (!user) return [];
    
    const targetCompanyId = user.role === 'SystemAdmin' 
      ? CompaniesModule.getSelectedCompanyId() 
      : user.company_id;
      
    const companyTxs = txs.filter(t => (t as any).company_id === targetCompanyId);
    
    if (user.role === 'SystemAdmin' || user.role === 'Admin') {
      return companyTxs;
    }
    
    // Dynamic permission scope filter based on Organization Units / Regions / Stations
    return OrganizationScopeEngine.filterByOrganizationScope(companyTxs, user);
  }

  static getPaginatedScopedTransactions(
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (tx: Transaction) => boolean,
    sortFn?: (a: Transaction, b: Transaction) => number
  ): { data: Transaction[]; total: number; page: number; pageSize: number; totalPages: number } {
    const user = UsersModule.getActiveUser();
    if (!user) {
      return { data: [], total: 0, page: 1, pageSize, totalPages: 1 };
    }
    const targetCompanyId = user.role === 'SystemAdmin'
      ? CompaniesModule.getSelectedCompanyId()
      : user.company_id;

    const scopedFilter = (t: Transaction): boolean => {
      if (t.status === 'Deleted' || (t.status as string) === 'deleted') return false;
      if ((t as any).company_id !== targetCompanyId) return false;
      if (user.role !== 'SystemAdmin' && user.role !== 'Admin') {
        if (!OrganizationScopeEngine.isTargetInUserScope(t as any, user)) return false;
      }
      return filterFn ? filterFn(t) : true;
    };

    return StorageEngine.getStoredPaginated<Transaction>('transactions', page, pageSize, scopedFilter, sortFn);
  }

  static async getPaginatedScopedTransactionsIDB(
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (tx: Transaction) => boolean,
    sortFn?: (a: Transaction, b: Transaction) => number
  ): Promise<{ data: Transaction[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const user = UsersModule.getActiveUser();
    if (!user) {
      return { data: [], total: 0, page: 1, pageSize, totalPages: 1 };
    }
    const targetCompanyId = user.role === 'SystemAdmin'
      ? CompaniesModule.getSelectedCompanyId()
      : user.company_id;

    const scopedFilter = (t: Transaction): boolean => {
      if (t.status === 'Deleted' || (t.status as string) === 'deleted') return false;
      if ((t as any).company_id !== targetCompanyId) return false;
      if (user.role !== 'SystemAdmin' && user.role !== 'Admin') {
        if (!OrganizationScopeEngine.isTargetInUserScope(t as any, user)) return false;
      }
      return filterFn ? filterFn(t) : true;
    };

    return StorageEngine.getPaginatedIDB<Transaction>('transactions', page, pageSize, scopedFilter, sortFn);
  }

  static saveTransactions(transactions: Transaction[]): void {
    StorageEngine.setStored('transactions', transactions);
  }

  // Create
  static async addTransaction(data: Omit<Transaction, 'id' | 'transaction_no' | 'status' | 'created_at' | 'updated_at' | 'created_by'> & { status?: TransactionStatus }): Promise<{ success: boolean; errors?: string[]; data?: Transaction }> {
    return TransactionsCreateModule.addTransaction(data);
  }

  // Update
  static async updateTransaction(id: string, updates: Partial<Transaction>): Promise<{ success: boolean; errors?: string[] }> {
    return TransactionsUpdateModule.updateTransaction(id, updates);
  }

  // Delete
  static async deleteTransaction(id: string, reason: string): Promise<boolean> {
    return TransactionsDeleteModule.deleteTransaction(id, reason);
  }

  // Restore
  static async restoreTransaction(id: string): Promise<boolean> {
    return TransactionsRestoreModule.restoreTransaction(id);
  }

  // Reconciliation & Custody Metrics
  static getReconciliation(stationId?: string, regionId?: string, org_unit_id?: string) {
    return TransactionsReconciliationModule.getReconciliation(stationId, regionId, org_unit_id);
  }

  static getStationDeductedCustody(stationId: string): number {
    return TransactionsReconciliationModule.getStationDeductedCustody(stationId);
  }

  static getCompanyDeductedCustody(companyId: string): number {
    return TransactionsReconciliationModule.getCompanyDeductedCustody(companyId);
  }

  // Voucher & Expenses
  static getExpenses(): any[] {
    return TransactionsVoucherModule.getExpenses();
  }

  static async saveExpense(expense: any): Promise<{ success: boolean; error?: string }> {
    return TransactionsVoucherModule.saveExpense(expense);
  }

  static async deleteExpense(id: string): Promise<{ success: boolean; error?: string }> {
    return TransactionsVoucherModule.deleteExpense(id);
  }

  static getCashVouchers(): CashVoucher[] {
    return TransactionsVoucherModule.getCashVouchers();
  }

  static async saveCashVoucher(voucher: CashVoucher, expectedVersion?: number): Promise<{ success: boolean; error?: string }> {
    return TransactionsVoucherModule.saveCashVoucher(voucher, expectedVersion);
  }

  static async deleteCashVoucher(id: string): Promise<{ success: boolean; error?: string }> {
    return TransactionsVoucherModule.deleteCashVoucher(id);
  }

  static getCompanySequences(): { id: string; company_id: string; last_voucher_no: number }[] {
    return TransactionsVoucherModule.getCompanySequences();
  }

  static getCompanySequence(companyId: string): number | null {
    return TransactionsVoucherModule.getCompanySequence(companyId);
  }

  static hasCompanySequence(companyId: string): boolean {
    return TransactionsVoucherModule.hasCompanySequence(companyId);
  }

  static hasAnyVouchersForCompany(companyId: string): boolean {
    return TransactionsVoucherModule.hasAnyVouchersForCompany(companyId);
  }

  static needsManualFirstVoucherNo(companyId: string): boolean {
    return TransactionsVoucherModule.needsManualFirstVoucherNo(companyId);
  }

  static getNextAutoVoucherNo(companyId: string): string {
    return TransactionsVoucherModule.getNextAutoVoucherNo(companyId);
  }

  static async initializeOrIncrementSequence(companyId: string, manualFirstNo?: number): Promise<number> {
    return TransactionsVoucherModule.initializeOrIncrementSequence(companyId, manualFirstNo);
  }

  static async getNextDocumentNo(
    companyId: string, 
    docType: 'voucher' | 'expense' | 'transfer' | 'receipt' | 'inventory' | 'adjustment', 
    manualFirstNo?: number
  ): Promise<number> {
    return TransactionsVoucherModule.getNextDocumentNo(companyId, docType, manualFirstNo);
  }

  static async resetCompanySequence(companyId: string): Promise<void> {
    return TransactionsVoucherModule.resetCompanySequence(companyId);
  }

  // History & Deletes Log
  static getTransactionHistory(): TransactionHistory[] {
    return TransactionsHistoryModule.getTransactionHistory();
  }

  static addTransactionHistory(history: TransactionHistory): void {
    TransactionsHistoryModule.addTransactionHistory(history);
  }

  static getDeletedTransactions(): DeletedTransaction[] {
    return TransactionsHistoryModule.getDeletedTransactions();
  }

  static saveDeletedTransactions(records: DeletedTransaction[]): void {
    TransactionsHistoryModule.saveDeletedTransactions(records);
  }

  static async fetchPaginated<T>(
    collectionName: string,
    limitVal: number,
    lastDocId?: string
  ): Promise<{ data: T[]; lastDocId?: string; hasMore: boolean }> {
    const companyId = CompaniesModule.getSelectedCompanyId();
    return dbFetchPaginated<T>(collectionName, companyId, limitVal, lastDocId);
  }
}
