import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AccountingBusinessEngine } from './accounting_engine';
import { StorageEngine } from '../../db/storage';
import * as offlineQueue from '../../db/offlineQueue';

describe('AccountingBusinessEngine - Write Consistency & Offline Fallback', () => {
  beforeEach(() => {
    StorageEngine.clearCache();
    vi.restoreAllMocks();
  });

  it('initializeChartOfAccountsAsync persists all accounts via syncWriteWithOfflineFallback', async () => {
    const syncSpy = vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: true,
      syncedToFirestore: true,
      queuedOffline: false
    });

    const accounts = await AccountingBusinessEngine.initializeChartOfAccountsAsync('test-comp-1', 'egypt_standard');
    expect(accounts.length).toBeGreaterThan(0);
    expect(syncSpy).toHaveBeenCalledTimes(accounts.length);

    // Verify storage has been populated
    const stored = StorageEngine.getStored<any[]>('gl_accounts', []);
    expect(stored.length).toBe(accounts.length);
  });

  it('initializeChartOfAccountsAsync throws error when syncWriteWithOfflineFallback fails', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: false,
      syncedToFirestore: false,
      queuedOffline: false,
      error: 'Simulated network write rejection'
    });

    await expect(
      AccountingBusinessEngine.initializeChartOfAccountsAsync('test-comp-2', 'egypt_standard')
    ).rejects.toThrow('Simulated network write rejection');
  });
});
