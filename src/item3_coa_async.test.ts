import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AccountingBusinessEngine } from './lib/enterprise/accounting_engine';
import { StorageEngine } from './db/storage';
import * as offlineQueue from './db/offlineQueue';

describe('Item 3 (P1): Chart of Accounts async init & zero un-awaited sync writes', () => {
  beforeEach(() => {
    StorageEngine.clearCache();
    vi.restoreAllMocks();
  });

  it('1. getAccounts is async and calls initializeChartOfAccountsAsync when chart is empty', async () => {
    const syncSpy = vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: true,
      syncedToFirestore: true,
      queuedOffline: false
    });

    const accounts = await AccountingBusinessEngine.getAccounts('company-empty-test');
    expect(accounts.length).toBeGreaterThan(0);
    expect(syncSpy).toHaveBeenCalledTimes(accounts.length);

    // Subsequent call returns cached company accounts without re-initializing
    const cachedAccounts = await AccountingBusinessEngine.getAccounts('company-empty-test');
    expect(cachedAccounts.length).toBe(accounts.length);
    expect(syncSpy).toHaveBeenCalledTimes(accounts.length); // not called again
  });

  it('2. initializeChartOfAccounts (sync) does not fire un-awaited syncWriteWithOfflineFallback', () => {
    const syncSpy = vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback');

    const accounts = AccountingBusinessEngine.initializeChartOfAccounts('company-local-sync');
    expect(accounts.length).toBeGreaterThan(0);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it('3. postOperationalDoubleEntry awaits getAccounts properly', async () => {
    const syncSpy = vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: true,
      syncedToFirestore: true,
      queuedOffline: false
    });

    const je = await AccountingBusinessEngine.postOperationalDoubleEntry(
      'company-op-test',
      'user-op-1',
      'VOUCHER-001',
      'صرف عهدة نقدية',
      'Petty Cash Disbursement',
      [
        { accountCode: '110101', debit: 100, credit: 0 },
        { accountCode: '110201', debit: 0, credit: 100 }
      ]
    );

    expect(je).toBeDefined();
    expect(je.lines.length).toBe(2);
  });
});
