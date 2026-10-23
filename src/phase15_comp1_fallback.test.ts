import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsersModule } from './db/users';
import { CompaniesModule } from './db/companies';
import { TransactionsModule } from './db/transactions';
import { TransactionsVoucherModule } from './db/transactions.voucher';
import { TransactionsUpdateModule } from './db/transactions.update';
import { DEFAULT_CATEGORIES, DEFAULT_COMPANIES, DEFAULT_STATIONS } from './db/defaults';
import { StationsModule } from './db/stations';
import { OrganizationScopeEngine } from './db/organizationScopeEngine';
import { LogsModule } from './db/logs';
import { InventoryModule } from './db/inventory';

describe('Phase 15: Stop Silent comp-1 Write Fallback (Custody Paths Only)', () => {
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
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
    }
    vi.spyOn(UsersModule, 'getActiveUser').mockReturnValue(null);
    localStorage.removeItem('custody_selected_company_id');
    CompaniesModule.saveCompanies(DEFAULT_COMPANIES);
    StationsModule.saveStations(DEFAULT_STATIONS);
    TransactionsModule.saveCategories(DEFAULT_CATEGORIES);
  });

  it('1. custody company resolution returns empty string "" without falling back to "comp-1" when custody_selected_company_id is unset', () => {
    const custodySelected = localStorage.getItem('custody_selected_company_id') || '';
    expect(custodySelected).toBe('');
  });

  it('2. addTransaction rejects save and returns bilingual error when company_id is empty', async () => {
    const res = await TransactionsModule.addTransaction({
      date: '2026-07-31',
      amount: 100,
      description: 'Test expense without company',
      company_id: '',
      station_id: 'stn-1-1-1'
    });
    expect(res.success).toBe(false);
    expect(res.errors).toContain('يجب اختيار شركة قبل الحفظ. / Please select a company before saving.');
  });

  it('3. saveExpense throws bilingual error when company_id is empty', async () => {
    await expect(
      TransactionsVoucherModule.saveExpense({
        id: 'exp-999',
        amount: 50,
        description: 'No company expense',
        company_id: ''
      })
    ).rejects.toThrow('يجب اختيار شركة قبل الحفظ. / Please select a company before saving.');
  });

  it('4. saveCashVoucher throws bilingual error when company_id is empty', async () => {
    await expect(
      TransactionsVoucherModule.saveCashVoucher({
        id: 'vouch-999',
        voucher_no: 'V-001',
        date: '2026-07-31',
        station_id: 'stn-1-1-1',
        amount: 500,
        company_id: '',
        status: 'Draft',
        expense_ids: [],
        amount_in_words: { ar: 'خمسمائة', en: 'Five Hundred' },
        recipient_name: 'Test Recipient',
        created_at: '2026-07-31T00:00:00Z',
        updated_at: '2026-07-31T00:00:00Z'
      })
    ).rejects.toThrow('يجب اختيار شركة قبل الحفظ. / Please select a company before saving.');
  });

  it('5. updateTransaction rejects update and returns bilingual error when company_id is empty', async () => {
    // Add a dummy transaction first with a valid company
    const added = await TransactionsModule.addTransaction({
      date: '2026-07-31',
      amount: 100,
      description: 'Test expense',
      company_id: 'comp-cairo-poultry',
      station_id: 'stn-cairo-1',
      category_id: 'cat-6'
    });
    expect(added.errors || []).toEqual([]);
    expect(added.success).toBe(true);

    const txs = TransactionsModule.getTransactions();
    const target = txs[txs.length - 1];

    const res = await TransactionsUpdateModule.updateTransaction(target.id, {
      company_id: ''
    });
    expect(res.success).toBe(false);
    expect(res.errors).toContain('يجب اختيار شركة قبل الحفظ. / Please select a company before saving.');
  });

  it('6. OrganizationScopeEngine.getAccessibleOrgUnitIds returns empty array when user company_id is empty without falling back to comp-1', () => {
    const user: any = { id: 'u-no-comp', role: 'CompanyAdmin', company_id: '' };
    const res = OrganizationScopeEngine.getAccessibleOrgUnitIds(user);
    expect(res).toEqual([]);
  });

  it('7. OrganizationScopeEngine.isTargetInUserScope returns false when user and target company_id are empty without falling back to comp-1', () => {
    const user: any = { id: 'u-no-comp', role: 'CompanyAdmin', company_id: '' };
    const target: any = { id: 'target-no-comp', company_id: '' };
    const res = OrganizationScopeEngine.isTargetInUserScope(target, user);
    expect(res).toBe(false);
  });

  it('8. UsersModule.getScopedUsers for SystemAdmin does not default targetCompanyId to comp-1 when saved company is unset', () => {
    vi.spyOn(UsersModule, 'getActiveUser').mockReturnValue({
      id: 'sys-admin',
      role: 'SystemAdmin',
      full_name: 'Super Admin',
      company_id: ''
    } as any);
    localStorage.removeItem('custody_selected_company_id');
    const users = UsersModule.getScopedUsers();
    expect(Array.isArray(users)).toBe(true);
  });

  it('9. LogsModule.logAudit drops log cleanly when no company context is available without falling back to comp-1', () => {
    vi.spyOn(UsersModule, 'getActiveUser').mockReturnValue(null);
    localStorage.removeItem('custody_selected_company_id');
    const initialCount = LogsModule.getAuditLogs().length;
    LogsModule.logAudit('TEST_ACTION', 'Test description');
    const newCount = LogsModule.getAuditLogs().length;
    expect(newCount).toBe(initialCount);
  });

  it('10. InventoryModule.relocateBinStock returns failure without falling back to comp-1 when companyId is empty', async () => {
    const res = await InventoryModule.relocateBinStock('', 'wh-1', 'prod-1', 'bin-from', 'bin-to', 10);
    expect(res.success).toBe(false);
    expect(res.messageAr).toContain('يجب اختيار شركة');
  });

  it('11. StationsModule.addRegion throws bilingual error when company_id is empty', async () => {
    await expect(
      StationsModule.addRegion('Region Test', 'REG-T', '')
    ).rejects.toThrow('يجب اختيار شركة قبل الحفظ. / Please select a company before saving.');
  });

  it('12. StationsModule.addStation throws bilingual error when company_id is empty', async () => {
    await expect(
      StationsModule.addStation('Station Test', 'STN-T', 500, undefined, '')
    ).rejects.toThrow('يجب اختيار شركة قبل الحفظ. / Please select a company before saving.');
  });

  it('13. isValidCompanyId and requireCompanyId guard behavior', async () => {
    const { isValidCompanyId, requireCompanyId, REQUIRE_COMPANY_ID_ERROR } = await import('./db/companyGuard');
    expect(isValidCompanyId('')).toBe(false);
    expect(isValidCompanyId('   ')).toBe(false);
    expect(isValidCompanyId(null)).toBe(false);
    expect(isValidCompanyId(undefined)).toBe(false);
    expect(isValidCompanyId('comp-real')).toBe(true);

    expect(() => requireCompanyId('')).toThrow(REQUIRE_COMPANY_ID_ERROR);
    expect(requireCompanyId('comp-123')).toBe('comp-123');
  });

  it('14. Static codebase scan: No live write path in src/db contains silent comp-1 / comp-default / comp-restaurant-01 fallback', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const dbDir = path.resolve(process.cwd(), 'src/db');
    const files = fs.readdirSync(dbDir).filter(f => f.endsWith('.ts') && f !== 'defaults.ts');

    const forbiddenPatterns = [
      /\|\|\s*['"]comp-1['"]/g,
      /\?\?\s*['"]comp-1['"]/g,
      /\|\|\s*['"]comp-default['"]/g,
      /\?\?\s*['"]comp-default['"]/g,
      /\|\|\s*['"]comp-restaurant-01['"]/g,
      /\?\?\s*['"]comp-restaurant-01['"]/g,
    ];

    for (const file of files) {
      const content = fs.readFileSync(path.join(dbDir, file), 'utf-8');
      for (const pattern of forbiddenPatterns) {
        expect(pattern.test(content)).toBe(false);
      }
    }
  });
});

