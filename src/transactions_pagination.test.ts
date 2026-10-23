import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine } from './db/storage';
import { CustodyDB } from './db';

describe('Phase 3: Paginated & Indexed Storage Queries for Transactions', () => {
  beforeEach(() => {
    CustodyDB.clearCache();
    StorageEngine.setStored('transactions', [
      { id: 'tx-101', company_id: 'comp-1', transaction_no: 'TX-001', amount: 100, status: 'Completed', date: '2026-08-01', description: 'Test 1' },
      { id: 'tx-102', company_id: 'comp-1', transaction_no: 'TX-002', amount: 200, status: 'Completed', date: '2026-08-02', description: 'Test 2' },
      { id: 'tx-103', company_id: 'comp-1', transaction_no: 'TX-003', amount: 300, status: 'Completed', date: '2026-08-03', description: 'Test 3' },
      { id: 'tx-104', company_id: 'comp-1', transaction_no: 'TX-004', amount: 400, status: 'Completed', date: '2026-08-04', description: 'Test 4' },
      { id: 'tx-105', company_id: 'comp-1', transaction_no: 'TX-005', amount: 500, status: 'Completed', date: '2026-08-05', description: 'Test 5' },
    ] as any);
  });

  it('should paginate items correctly using StorageEngine.getStoredPaginated', () => {
    const result = StorageEngine.getStoredPaginated<any>('transactions', 1, 2);
    expect(result.data.length).toBe(2);
    expect(result.data[0].id).toBe('tx-101');
    expect(result.data[1].id).toBe('tx-102');
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
    expect(result.totalPages).toBe(3);

    const page2 = StorageEngine.getStoredPaginated<any>('transactions', 2, 2);
    expect(page2.data.length).toBe(2);
    expect(page2.data[0].id).toBe('tx-103');
    expect(page2.data[1].id).toBe('tx-104');
    expect(page2.page).toBe(2);
  });

  it('should apply custom filterFn and sortFn in StorageEngine.getStoredPaginated', () => {
    const filterFn = (item: any) => item.amount >= 300;
    const sortFn = (a: any, b: any) => b.amount - a.amount; // descending
    const result = StorageEngine.getStoredPaginated<any>('transactions', 1, 10, filterFn, sortFn);

    expect(result.total).toBe(3);
    expect(result.data[0].id).toBe('tx-105');
    expect(result.data[1].id).toBe('tx-104');
    expect(result.data[2].id).toBe('tx-103');
  });

  it('should return paginated scoped transactions via CustodyDB.getPaginatedScopedTransactions', () => {
    const result = CustodyDB.getPaginatedScopedTransactions(1, 3);
    expect(result.data).toBeDefined();
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(3);
  });

  it('should return paginated scoped transactions asynchronously via CustodyDB.getPaginatedScopedTransactionsIDB', async () => {
    const result = await CustodyDB.getPaginatedScopedTransactionsIDB(1, 4);
    expect(result.data).toBeDefined();
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(4);
  });
});
