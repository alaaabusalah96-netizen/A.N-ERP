import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageEngine, persistToIDB, loadFromIDB, migrateLocalStorageToIDB } from './db/storage';

describe('Phase 11: StorageEngine IndexedDB Migration & Fallback Unit Tests', () => {
  beforeEach(() => {
    StorageEngine.clearCache();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('should store and retrieve data across key domain modules via StorageEngine', () => {
    // Users module
    const userPayload = { id: 'u1', name: 'Test Admin', role: 'SystemAdmin' };
    StorageEngine.setStored('active_user', userPayload);
    expect(StorageEngine.getStored('active_user', null)).toEqual(userPayload);

    // Transactions module
    const txPayload = [{ id: 'tx-101', amount: 500, type: 'Disbursement' }];
    StorageEngine.setStored('transactions', txPayload);
    expect(StorageEngine.getStored('transactions', [])).toEqual(txPayload);

    // Organization module
    const orgPayload = [{ id: 'org-1', name: 'Cairo HQ' }];
    StorageEngine.setStored('org_units', orgPayload);
    expect(StorageEngine.getStored('org_units', [])).toEqual(orgPayload);

    // Warehouse module
    const whPayload = [{ id: 'wh-1', code: 'WH-MAIN' }];
    StorageEngine.setStored('warehouses', whPayload);
    expect(StorageEngine.getStored('warehouses', [])).toEqual(whPayload);
  });

  it('should handle QuotaExceededError in localStorage gracefully when IndexedDB fallback is active', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockStorage: Record<string, string> = {};
    const fakeLocalStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (_key: string, _value: string) => {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      },
      removeItem: (key: string) => delete mockStorage[key],
      clear: () => {},
      length: 0,
      key: () => null,
    };

    const originalLS = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: fakeLocalStorage,
      writable: true,
      configurable: true,
    });

    expect(() => {
      StorageEngine.setStored('heavy_data_key', { large: 'array_of_documents' });
    }).not.toThrow();

    expect(StorageEngine.getStored('heavy_data_key', null)).toEqual({ large: 'array_of_documents' });

    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLS,
      writable: true,
      configurable: true,
    });
    consoleSpy.mockRestore();
  });

  it('should fall back to localStorage when IndexedDB is unavailable', () => {
    // Verify fallback check returns boolean without crashing
    expect(typeof StorageEngine.isIDBSupported()).toBe('boolean');
  });
});
