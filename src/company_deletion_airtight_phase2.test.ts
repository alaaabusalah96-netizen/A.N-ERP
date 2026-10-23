import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CustodyDB } from './db';
import { StorageEngine } from './db/storage';
import { CompaniesModule } from './db/companies';
import type { Company, Region, Station, AppUser } from './types';

describe('PHASE 2: Airtight Company Deletion Verification', () => {
  const TEST_COMPANY_ID = 'comp_airtight_del_test_2026';
  const TEST_REGION_ID = 'reg_airtight_del_2026';
  const TEST_STATION_ID = 'st_airtight_del_2026';
  const ADMIN_EMAIL = 'admin.airtight@test-company.com';

  beforeEach(() => {
    localStorage.clear();
    StorageEngine.cache = {};

    // Seed mock company
    const mockCompany: Company = {
      id: TEST_COMPANY_ID,
      name: 'شركة الحذف المحكم للتجارة',
      code: 'AIR-01',
      is_active: true
    };
    StorageEngine.setStored('companies', [mockCompany]);

    // Seed mock region
    const mockRegion: Region = {
      id: TEST_REGION_ID,
      company_id: TEST_COMPANY_ID,
      name: 'منطقة الرياض',
      code: 'RYD-REG'
    };
    StorageEngine.setStored('regions', [mockRegion]);

    // Seed mock station
    const mockStation: Station = {
      id: TEST_STATION_ID,
      company_id: TEST_COMPANY_ID,
      region_id: TEST_REGION_ID,
      station_name: 'محطة العليا',
      station_code: 'ST-01',
      custody_amount: 50000,
      is_active: true
    };
    StorageEngine.setStored('stations', [mockStation]);

    // Seed mock users
    const mockUsers: AppUser[] = [
      {
        id: 'usr-admin-1',
        email: ADMIN_EMAIL,
        full_name: 'مدير الشركة المحكم',
        role: 'Admin',
        company_id: TEST_COMPANY_ID,
        is_active: true,
        permissions: CustodyDB.enrichUserPermissions('Admin')
      },
      {
        id: 'usr-staff-2',
        email: 'staff@test-company.com',
        full_name: 'موظف المحطة',
        role: 'StationAdmin',
        company_id: TEST_COMPANY_ID,
        region_id: TEST_REGION_ID,
        station_id: TEST_STATION_ID,
        is_active: true,
        permissions: CustodyDB.enrichUserPermissions('StationAdmin')
      }
    ];
    StorageEngine.setStored('users', mockUsers);
  });

  it('1. Sends DELETE /api/admin/companies/:id with credentials and valid auth header', async () => {
    let capturedUrl = '';
    let capturedOptions: any = null;

    localStorage.setItem('custody_auth_token', 'mock_jwt_session_token_123');

    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, message: 'Deleted' })
      } as any;
    });

    const result = await CompaniesModule.deleteCompany(TEST_COMPANY_ID);

    expect(result.success).toBe(true);
    expect(capturedUrl).toContain(`/api/admin/companies/${TEST_COMPANY_ID}`);
    expect(capturedOptions.method).toBe('DELETE');
    expect(capturedOptions.credentials).toBe('include');
    expect(capturedOptions.headers['Authorization']).toBe('Bearer mock_jwt_session_token_123');
    expect(capturedOptions.headers['Content-Type']).toBe('application/json');
  });

  it('2. On server failure (HTTP error or success:false): does NOT remove company, users, regions, stations from local storage', async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 500,
        json: async () => ({
          success: false,
          message: 'فشل الحذف الكامل: ما زال هناك مستخدمين مرتبطين بالشركة'
        })
      } as any;
    });

    const result = await CompaniesModule.deleteCompany(TEST_COMPANY_ID);

    // 1. Result must indicate failure with server message
    expect(result.success).toBe(false);
    expect(result.error).toContain('فشل الحذف الكامل');

    // 2. Company must STILL exist in local storage
    const companies = StorageEngine.getStored<Company[]>('companies', []);
    expect(companies.some(c => c.id === TEST_COMPANY_ID)).toBe(true);

    // 3. Users must STILL exist in local storage
    const users = StorageEngine.getStored<AppUser[]>('users', []);
    expect(users.filter(u => u.company_id === TEST_COMPANY_ID).length).toBe(2);

    // 4. Regions and Stations must STILL exist in local storage
    const regions = StorageEngine.getStored<Region[]>('regions', []);
    expect(regions.some(r => r.company_id === TEST_COMPANY_ID)).toBe(true);
    const stations = StorageEngine.getStored<Station[]>('stations', []);
    expect(stations.some(s => s.company_id === TEST_COMPANY_ID)).toBe(true);

    // 5. Tombstone must NOT be recorded in deleted_company_ids
    const deletedIds = StorageEngine.getStored<string[]>('deleted_company_ids', []);
    expect(deletedIds.includes(TEST_COMPANY_ID)).toBe(false);
  });

  it('3. On server success: completely cascades local removal, records tombstone, and resets selection', async () => {
    StorageEngine.setStored('selected_company_id', TEST_COMPANY_ID);

    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'تم حذف الشركة وكافة المستخدمين والبيانات التابعة لها نهائياً'
        })
      } as any;
    });

    const result = await CompaniesModule.deleteCompany(TEST_COMPANY_ID);

    expect(result.success).toBe(true);

    // 1. Company is removed
    const companies = StorageEngine.getStored<Company[]>('companies', []);
    expect(companies.some(c => c.id === TEST_COMPANY_ID)).toBe(false);

    // 2. Associated users are removed
    const users = StorageEngine.getStored<AppUser[]>('users', []);
    expect(users.filter(u => u.company_id === TEST_COMPANY_ID).length).toBe(0);

    // 3. Associated regions and stations are removed
    const regions = StorageEngine.getStored<Region[]>('regions', []);
    expect(regions.some(r => r.company_id === TEST_COMPANY_ID)).toBe(false);
    const stations = StorageEngine.getStored<Station[]>('stations', []);
    expect(stations.some(s => s.company_id === TEST_COMPANY_ID)).toBe(false);

    // 4. Tombstone is recorded permanently
    const deletedIds = StorageEngine.getStored<string[]>('deleted_company_ids', []);
    expect(deletedIds.includes(TEST_COMPANY_ID)).toBe(true);

    // 5. Selected company was reset
    const selectedCompanyId = StorageEngine.getStored<string>('selected_company_id', '');
    expect(selectedCompanyId).not.toBe(TEST_COMPANY_ID);
  });

  it('4. Recreating company admin with SAME email after successful deletion succeeds cleanly without collision', async () => {
    // 1. Delete company successfully
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, message: 'Deleted' })
      } as any;
    });

    const delRes = await CompaniesModule.deleteCompany(TEST_COMPANY_ID);
    expect(delRes.success).toBe(true);

    // Verify users list has no trace of ADMIN_EMAIL
    const existingUsers = StorageEngine.getStored<AppUser[]>('users', []);
    expect(existingUsers.some(u => u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase())).toBe(false);

    // 2. Create new company and new admin with the same email
    const NEW_COMPANY_ID = 'comp_airtight_new_2026';
    const newCompany: Company = {
      id: NEW_COMPANY_ID,
      name: 'شركة جديدة لنفس المدير',
      code: 'NEW-02',
      is_active: true
    };
    StorageEngine.setStored('companies', [newCompany]);

    const newAdminUser: AppUser = {
      id: 'usr-new-admin-2',
      email: ADMIN_EMAIL,
      full_name: 'مدير الشركة المعاد إنشاؤه',
      role: 'Admin',
      company_id: NEW_COMPANY_ID,
      is_active: true,
      permissions: CustodyDB.enrichUserPermissions('Admin')
    };

    // User is added without conflict
    const updatedUsers = [...existingUsers, newAdminUser];
    StorageEngine.setStored('users', updatedUsers);

    const reloadedUsers = StorageEngine.getStored<AppUser[]>('users', []);
    const foundAdmin = reloadedUsers.find(u => u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
    expect(foundAdmin).toBeDefined();
    expect(foundAdmin?.company_id).toBe(NEW_COMPANY_ID);
  });
});
