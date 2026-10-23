import { TransactionHistory, DeletedTransaction } from '../types';
import { StorageEngine } from './storage';
import { syncWriteWithOfflineFallback } from './offlineQueue';
import { DEFAULT_TX_HISTORY } from './defaults';

export class TransactionsHistoryModule {
  static getTransactionHistory(): TransactionHistory[] {
    return StorageEngine.getStored<TransactionHistory[]>('TransactionHistory', DEFAULT_TX_HISTORY);
  }

  static async addTransactionHistoryAsync(history: TransactionHistory): Promise<{ success: boolean; error?: string }> {
    const res = await syncWriteWithOfflineFallback('TransactionHistory', history.id, history);
    if (!res.success) {
      console.warn(`[addTransactionHistoryAsync] Warning: ${res.error}`);
      return { success: false, error: res.error };
    }

    const records = TransactionsHistoryModule.getTransactionHistory();
    records.unshift(history);
    StorageEngine.setStored('TransactionHistory', records);
    return { success: true };
  }

  static addTransactionHistory(history: TransactionHistory): void {
    const records = TransactionsHistoryModule.getTransactionHistory();
    records.unshift(history);
    StorageEngine.setStored('TransactionHistory', records);
    syncWriteWithOfflineFallback('TransactionHistory', history.id, history).catch(err => {
      console.warn(`[addTransactionHistory] Background sync warning for history ${history.id}:`, err);
    });
  }

  static getDeletedTransactions(): DeletedTransaction[] {
    return StorageEngine.getStored<DeletedTransaction[]>('deleted_transactions', []);
  }

  static saveDeletedTransactions(records: DeletedTransaction[]): void {
    StorageEngine.setStored('deleted_transactions', records);
  }
}
