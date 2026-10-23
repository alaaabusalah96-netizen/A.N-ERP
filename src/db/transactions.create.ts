import { Transaction, TransactionStatus } from '../types';
import { StorageEngine } from './storage';
import { UsersModule } from './users';
import { LogsModule } from './logs';
import { CompaniesModule } from './companies';
import { TransactionsHistoryModule } from './transactions.history';
import { ValidationEngine, isValidCompanyId, REQUIRE_COMPANY_ID_ERROR } from './validation';
import { DEFAULT_TRANSACTIONS } from './defaults';
import { syncWriteWithOfflineFallback } from './offlineQueue';
import { ApprovalEngine } from './approvalEngine';

export class TransactionsCreateModule {
  static async addTransaction(data: Omit<Transaction, 'id' | 'transaction_no' | 'status' | 'created_at' | 'updated_at' | 'created_by'> & { status?: TransactionStatus }): Promise<{ success: boolean; errors?: string[]; data?: Transaction }> {
    try {
      const transactions = StorageEngine.getStored<Transaction[]>('transactions', DEFAULT_TRANSACTIONS);
      const user = UsersModule.getActiveUser();
      const station_id = data.station_id || user?.station_id;
      const company_id = data.company_id || user?.company_id || (typeof localStorage !== 'undefined' ? localStorage.getItem('custody_selected_company_id') : null);
      if (!isValidCompanyId(company_id)) {
        return {
          success: false,
          errors: [REQUIRE_COMPANY_ID_ERROR]
        };
      }
      const status = data.status || 'Pending';
      const category_id = data.category_id || 'cat-6';

      // FIX: Validate BEFORE assigning an id. Passing an object that already
      // has an id makes ValidationEngine treat this as an UPDATE (checks
      // edit_expense) instead of a CREATE (checks create_expense), which
      // incorrectly blocked create-only users. This payload intentionally
      // has no `id` field so validation resolves to "create" mode.
      const validationPayload: Partial<Transaction> = {
        ...data,
        category_id,
        status,
        station_id,
        company_id
      };
      const validation = ValidationEngine.validateTransaction(validationPayload, user);
      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      // FIX: use crypto.randomUUID() for collision-proof transaction ID
      const newTx: Transaction = {
        ...data,
        category_id,
        id: crypto.randomUUID(),
        transaction_no: '',
        status,
        created_by: user?.id || 'unknown',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        station_id,
        company_id,
        metadata: {
          version: 1
        }
      };

      transactions.push(newTx);
      StorageEngine.setStored('transactions', transactions);

      // Await Firestore write with online requirement
      const syncRes = await syncWriteWithOfflineFallback('transactions', newTx.id, newTx);
      if (!syncRes.success) {
        // Rollback memory state
        const idx = transactions.findIndex(t => t.id === newTx.id);
        if (idx !== -1) transactions.splice(idx, 1);
        StorageEngine.setStored('transactions', transactions);
        return {
          success: false,
          errors: [syncRes.error || 'يلزم وجود اتصال بالإنترنت للحفظ. يرجى إعادة الاتصال والمحاولة مرة أخرى.']
        };
      }

      // Evaluate and start Approval Workflow for EXPENSE if configured
      try {
        await ApprovalEngine.evaluateAndStartWorkflow({
          companyId: company_id,
          documentType: 'EXPENSE',
          documentId: newTx.id,
          amount: newTx.amount,
          org_unit_id: newTx.org_unit_id,
          requesterId: user?.id || 'unknown',
          requesterName: user?.full_name || 'Anonymous'
        });
      } catch (err) {
        console.warn('Approval Engine evaluation for expense skipped:', err);
      }

      TransactionsHistoryModule.addTransactionHistory({
        id: crypto.randomUUID(),
        transaction_id: newTx.id,
        action: 'Created',
        performed_by: user?.id || 'unknown',
        performed_by_name: user?.full_name || 'Anonymous',
        timestamp: newTx.created_at,
        new_status: newTx.status,
        notes: newTx.notes || `Registered ${newTx.status} expense`
      });

      LogsModule.addLog(
        user?.id || 'unknown',
        user?.full_name || 'Anonymous',
        'Create Transaction',
        `Registered ${newTx.status} expense for ${newTx.amount.toLocaleString()} EGP - "${newTx.description}"`
      );

      // Enhanced Audit with metadata
      LogsModule.logAudit(
        'CREATE_TRANSACTION',
        `Registered ${newTx.status} expense for ${newTx.amount.toLocaleString()} EGP - "${newTx.description}"`,
        { after: newTx }
      );

      return { success: true, data: newTx };
    } catch (err: any) {
      console.error('Error creating transaction:', err);
      return { success: false, errors: [err.message || 'Unknown error occurred'] };
    }
  }
}
