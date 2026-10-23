import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as offlineQueue from './db/offlineQueue';
import { CustodyDB } from './db';
import { TransactionsVoucherModule } from './db/transactions.voucher';
import { CashVoucher } from './types';

describe('Phase 3: Safe Async Expense and Cash Voucher Writes', () => {
  beforeEach(() => {
    if (typeof localStorage === 'undefined') {
      const store: Record<string, string> = {};
      (global as any).localStorage = {
        getItem: (k: string) => store[k] || null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { for (const k in store) delete store[k]; }
      };
    }
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. saveExpense returns explicit failure when syncWriteWithOfflineFallback fails', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: false,
      syncedToFirestore: false,
      queuedOffline: false,
      error: 'Simulated cloud write failure: network timeout'
    });

    const expense = {
      id: 'exp-test-1',
      company_id: 'comp-1',
      amount: 150,
      description: 'Test Expense',
      date: '2026-08-30'
    };

    const res = await CustodyDB.saveExpense(expense);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Simulated cloud write failure: network timeout');
  });

  it('2. deleteExpense returns explicit failure when syncWriteWithOfflineFallback fails', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: false,
      syncedToFirestore: false,
      queuedOffline: false,
      error: 'Simulated cloud delete failure'
    });

    const res = await CustodyDB.deleteExpense('exp-test-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Simulated cloud delete failure');
  });

  it('3. saveCashVoucher returns explicit failure when syncWriteWithOfflineFallback fails', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: false,
      syncedToFirestore: false,
      queuedOffline: false,
      error: 'Permission denied on CashVouchers collection'
    });

    const voucher: CashVoucher = {
      id: 'cv-test-1',
      voucher_no: 'V-1001',
      date: '2026-08-30',
      station_id: 'stn-1',
      company_id: 'comp-1',
      amount: 500,
      amount_in_words: { ar: 'خمسمائة', en: 'Five Hundred' },
      recipient_name: 'Ahmed',
      status: 'Approved',
      expense_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const res = await CustodyDB.saveCashVoucher(voucher);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Permission denied on CashVouchers collection');
  });

  it('4. deleteCashVoucher returns explicit failure when syncWriteWithOfflineFallback fails', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: false,
      syncedToFirestore: false,
      queuedOffline: false,
      error: 'Simulated cloud delete error for voucher'
    });

    const res = await CustodyDB.deleteCashVoucher('cv-test-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Simulated cloud delete error for voucher');
  });

  it('5. saveCashVoucher returns success: true when cloud write succeeds', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: true,
      syncedToFirestore: true,
      queuedOffline: false
    });

    const voucher: CashVoucher = {
      id: 'cv-test-ok',
      voucher_no: 'V-1002',
      date: '2026-08-30',
      station_id: 'stn-1',
      company_id: 'comp-1',
      amount: 750,
      amount_in_words: { ar: 'سبعمائة وخمسون', en: 'Seven Hundred Fifty' },
      recipient_name: 'Mahmoud',
      status: 'Approved',
      expense_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const res = await CustodyDB.saveCashVoucher(voucher);
    expect(res.success).toBe(true);
    expect(res.error).toBeUndefined();

    // Verify item in storage
    const stored = TransactionsVoucherModule.getCashVouchers();
    expect(stored.some(v => v.id === 'cv-test-ok')).toBe(true);
  });
});
