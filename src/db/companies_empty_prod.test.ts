import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CompaniesModule } from './companies';
import { StorageEngine } from './storage';
import { DEFAULT_COMPANIES } from './defaults';
import { Company } from '../types';

describe('CompaniesModule — Production vs Development Empty Fallback (Item 5)', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Clear storage and in-memory cache
    StorageEngine.cache = {};
    (CompaniesModule as any)._isHydrated = false;
    (CompaniesModule as any)._hydratePromise = null;
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    StorageEngine.cache = {};
  });

  it('In simulated production (NODE_ENV=production), empty storage returns [] and NOT DEFAULT_COMPANIES', () => {
    process.env.NODE_ENV = 'production';
    
    // Clear cache again after switching environment
    StorageEngine.cache = {};
    (CompaniesModule as any)._isHydrated = false;
    (CompaniesModule as any)._hydratePromise = null;

    const companies = CompaniesModule.getCompanies();
    expect(companies).toEqual([]);
    expect(companies.length).toBe(0);
  });

  it('In simulated development/test (NODE_ENV=test), empty storage returns DEFAULT_COMPANIES', () => {
    process.env.NODE_ENV = 'test';
    
    StorageEngine.cache = {};
    (CompaniesModule as any)._isHydrated = false;
    (CompaniesModule as any)._hydratePromise = null;

    const companies = CompaniesModule.getCompanies();
    expect(companies).toEqual(DEFAULT_COMPANIES);
    expect(companies.length).toBeGreaterThan(0);
  });

  it('In production, hydration status reflects empty when storage is unpopulated', async () => {
    process.env.NODE_ENV = 'production';
    
    StorageEngine.cache = {};
    (CompaniesModule as any)._isHydrated = false;
    (CompaniesModule as any)._hydratePromise = null;

    await CompaniesModule.ensureHydrated();
    expect(CompaniesModule.getHydrationStatus()).toBe('empty');
  });

  it('In production, adding and saving a company updates status to ready and returns that company', async () => {
    process.env.NODE_ENV = 'production';
    
    StorageEngine.cache = {};
    (CompaniesModule as any)._isHydrated = false;
    (CompaniesModule as any)._hydratePromise = null;

    const newCompany: Company = {
      id: 'tenant-prod-1',
      name: 'Real Production Enterprise',
      custody_value: 50000,
      subscription_plan: 'Enterprise',
      subscription_status: 'active'
    };

    const res = await CompaniesModule.saveCompanies([newCompany]);
    expect(res.success).toBe(true);

    const loaded = CompaniesModule.getCompanies();
    expect(loaded.length).toBe(1);
    expect(loaded[0].name).toBe('Real Production Enterprise');
    expect(CompaniesModule.getHydrationStatus()).toBe('ready');
  });
});
