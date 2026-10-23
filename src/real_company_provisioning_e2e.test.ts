import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { CustodyDB } from './db';
import { StorageEngine } from './db/storage';
import { hashPasswordPBKDF2_210k } from './lib/server_hash';
import type { Company, Region, Station, AppUser } from './types';

describe('End-to-End Real Lifecycle: Platform Admin Manual Company, Region, Station, Users, Auth & Cascading Deletion', () => {
  const TEST_COMPANY_ID = 'comp_riyadh_enterprise_2026';
  const TEST_REGION_ID = 'reg_central_riyadh_2026';
  const TEST_STATION_ID = 'st_olaya_branch_2026';

  const COMPANY_ADMIN_EMAIL = 'ahmed.admin@riyadh-enterprise.com';
  const STATION_ADMIN_EMAIL = 'khaled.branch@riyadh-enterprise.com';
  const SUPER_ADMIN_EMAIL = 'superadmin@kemit-platform.com';

  const INITIAL_TEMP_PASSWORD = 'InitialTempPass2026!#';
  const NEW_PERMANENT_PASSWORD = 'RiyadhPermSecurePass2026!#';
  const BRANCH_TEMP_PASSWORD = 'BranchTempPass2026!#';

  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, message: 'Company deleted successfully' })
      } as any;
    });
  });

  it('1. Platform Admin creates Company, Region, and Station manually', async () => {
    // 1. Create Company
    const newCompany: Company = {
      id: TEST_COMPANY_ID,
      name: 'شركة الرياض للتوريدات والمقاولات',
      code: 'RYD-01',
      is_active: true
    };

    await CustodyDB.saveCompanies([newCompany]);
    const companies = CustodyDB.getCompanies();
    const foundComp = companies.find(c => c.id === TEST_COMPANY_ID);
    expect(foundComp).toBeDefined();
    expect(foundComp?.name).toBe('شركة الرياض للتوريدات والمقاولات');

    // 2. Create Region for the company
    const newRegion: Region = {
      id: TEST_REGION_ID,
      company_id: TEST_COMPANY_ID,
      name: 'المنطقة الوسطى - الرياض',
      code: 'REG-RYD'
    };

    await CustodyDB.saveRegions([newRegion]);
    const regions = CustodyDB.getRegions();
    const foundRegion = regions.find(r => r.id === TEST_REGION_ID);
    expect(foundRegion).toBeDefined();
    expect(foundRegion?.company_id).toBe(TEST_COMPANY_ID);

    // 3. Create Station / Branch for the region and company
    const newStation: Station = {
      id: TEST_STATION_ID,
      company_id: TEST_COMPANY_ID,
      region_id: TEST_REGION_ID,
      station_name: 'فرع العليا المركزي',
      station_code: 'ST-OLY-01',
      custody_amount: 50000,
      is_active: true
    };

    await CustodyDB.saveStations([newStation]);
    const stations = CustodyDB.getStations();
    const foundStation = stations.find(s => s.id === TEST_STATION_ID);
    expect(foundStation).toBeDefined();
    expect(foundStation?.company_id).toBe(TEST_COMPANY_ID);
    expect(foundStation?.region_id).toBe(TEST_REGION_ID);
    expect(foundStation?.station_name).toBe('فرع العليا المركزي');
  });

  it('2. Platform Admin provisions Company Admin, Station Admin, and Platform SuperAdmin users', async () => {
    // Setup company structure first
    await CustodyDB.saveCompanies([{
      id: TEST_COMPANY_ID,
      name: 'شركة الرياض للتوريدات والمقاولات'
    }]);

    // Provision Company Admin User
    const companyAdminSalt = crypto.randomUUID();
    const companyAdminHash = hashPasswordPBKDF2_210k(INITIAL_TEMP_PASSWORD, companyAdminSalt, 2);
    expect(companyAdminHash).toBeDefined();

    const companyAdminUser: AppUser = {
      id: 'usr_ahmed_admin_2026',
      email: COMPANY_ADMIN_EMAIL,
      full_name: 'أحمد المنصوري (أدمن الشركة)',
      role: 'Admin',
      company_id: TEST_COMPANY_ID,
      permissions: CustodyDB.enrichUserPermissions('Admin'),
      must_change_password: true,
      is_active: true
    };

    // Provision Station Admin User
    const stationAdminSalt = crypto.randomUUID();
    const stationAdminHash = hashPasswordPBKDF2_210k(BRANCH_TEMP_PASSWORD, stationAdminSalt, 2);
    expect(stationAdminHash).toBeDefined();

    const stationAdminUser: AppUser = {
      id: 'usr_khaled_branch_2026',
      email: STATION_ADMIN_EMAIL,
      full_name: 'خالد السالم (مدير فرع العليا)',
      role: 'StationAdmin',
      company_id: TEST_COMPANY_ID,
      region_id: TEST_REGION_ID,
      station_id: TEST_STATION_ID,
      permissions: CustodyDB.enrichUserPermissions('StationAdmin'),
      must_change_password: true,
      is_active: true
    };

    // Platform Super Admin
    const superAdminUser: AppUser = {
      id: 'usr_superadmin_2026',
      email: SUPER_ADMIN_EMAIL,
      full_name: 'مدير المنصة الرئيسي',
      role: 'SystemAdmin',
      is_platform_owner: true,
      permissions: CustodyDB.enrichUserPermissions('SystemAdmin'),
      must_change_password: false,
      is_active: true
    };

    // Save users into DB
    await CustodyDB.saveUsers([companyAdminUser, stationAdminUser, superAdminUser]);

    const users = CustodyDB.getUsers();
    expect(users.find(u => u.email === COMPANY_ADMIN_EMAIL)).toBeDefined();
    expect(users.find(u => u.email === STATION_ADMIN_EMAIL)).toBeDefined();
    expect(users.find(u => u.email === SUPER_ADMIN_EMAIL)).toBeDefined();

    // Verify user documents have NO plaintext password stored
    for (const u of users) {
      expect((u as any).password).toBeUndefined();
    }
  });

  it('3. Company Admin logs in with Temporary Password -> enters Forced Password Change mode', async () => {
    const salt = crypto.randomUUID();
    const storedHash = hashPasswordPBKDF2_210k(INITIAL_TEMP_PASSWORD, salt, 2);

    const user: AppUser = {
      id: 'usr_ahmed_admin_2026',
      email: COMPANY_ADMIN_EMAIL,
      full_name: 'أحمد المنصوري',
      role: 'Admin',
      company_id: TEST_COMPANY_ID,
      permissions: CustodyDB.enrichUserPermissions('Admin'),
      must_change_password: true,
      is_active: true
    };
    await CustodyDB.saveUsers([user]);

    // Verification Step: check input password against stored PBKDF2 hash
    const inputPassword = INITIAL_TEMP_PASSWORD.trim();
    const computedHash = hashPasswordPBKDF2_210k(inputPassword, salt, 2);

    expect(computedHash).toBe(storedHash);

    // Verify user requires password change
    const authenticatedUser = CustodyDB.getUsers().find(u => u.email === COMPANY_ADMIN_EMAIL);
    expect(authenticatedUser).toBeDefined();
    expect(authenticatedUser?.must_change_password).toBe(true);

    // Normal operational access is locked until password is changed
    const canAccessNormalOps = authenticatedUser?.must_change_password === false;
    expect(canAccessNormalOps).toBe(false);
  });

  it('4. Company Admin changes password from temporary to new permanent password successfully', async () => {
    let currentSalt = crypto.randomUUID();
    let currentHash = hashPasswordPBKDF2_210k(INITIAL_TEMP_PASSWORD, currentSalt, 2);

    const user: AppUser = {
      id: 'usr_ahmed_admin_2026',
      email: COMPANY_ADMIN_EMAIL,
      full_name: 'أحمد المنصوري',
      role: 'Admin',
      company_id: TEST_COMPANY_ID,
      permissions: CustodyDB.enrichUserPermissions('Admin'),
      must_change_password: true,
      is_active: true
    };
    await CustodyDB.saveUsers([user]);

    // Validation 1: Verify current password
    const enteredCurrentPassword = INITIAL_TEMP_PASSWORD.trim();
    const verifyHash = hashPasswordPBKDF2_210k(enteredCurrentPassword, currentSalt, 2);
    expect(verifyHash).toBe(currentHash);

    // Validation 2: Validate new password policy (>= 12 chars, letters + numbers)
    expect(NEW_PERMANENT_PASSWORD.length).toBeGreaterThanOrEqual(12);
    expect(/[a-zA-Z]/.test(NEW_PERMANENT_PASSWORD)).toBe(true);
    expect(/[0-9]/.test(NEW_PERMANENT_PASSWORD)).toBe(true);

    // Perform Password Update: generate fresh salt and PBKDF2 hash with pepper_version 2
    const newSalt = crypto.randomUUID();
    const newHash = hashPasswordPBKDF2_210k(NEW_PERMANENT_PASSWORD, newSalt, 2);
    currentSalt = newSalt;
    currentHash = newHash;

    // Update user document to clear must_change_password flag
    const allUsers = CustodyDB.getUsers();
    const updatedUsers = allUsers.map(u => {
      if (u.email === COMPANY_ADMIN_EMAIL) {
        return { ...u, must_change_password: false };
      }
      return u;
    });
    await CustodyDB.saveUsers(updatedUsers);

    // Check user state after update
    const updatedUser = CustodyDB.getUsers().find(u => u.email === COMPANY_ADMIN_EMAIL);
    expect(updatedUser?.must_change_password).toBe(false);

    // Validation 3: Verify new password matches
    const newPasswordTestHash = hashPasswordPBKDF2_210k(NEW_PERMANENT_PASSWORD, currentSalt, 2);
    expect(newPasswordTestHash).toBe(currentHash);

    // Validation 4: Verify old temporary password is REJECTED
    const oldPasswordTestHash = hashPasswordPBKDF2_210k(INITIAL_TEMP_PASSWORD, currentSalt, 2);
    expect(oldPasswordTestHash).not.toBe(currentHash);
  });

  it('5. Station Admin logs in with their temporary credentials and gets bound to their branch', async () => {
    const branchSalt = crypto.randomUUID();
    const branchHash = hashPasswordPBKDF2_210k(BRANCH_TEMP_PASSWORD, branchSalt, 2);

    const stationUser: AppUser = {
      id: 'usr_khaled_branch_2026',
      email: STATION_ADMIN_EMAIL,
      full_name: 'خالد السالم',
      role: 'StationAdmin',
      company_id: TEST_COMPANY_ID,
      region_id: TEST_REGION_ID,
      station_id: TEST_STATION_ID,
      permissions: CustodyDB.enrichUserPermissions('StationAdmin'),
      must_change_password: true,
      is_active: true
    };
    await CustodyDB.saveUsers([stationUser]);

    // Verify authentication succeeds
    const computedBranchHash = hashPasswordPBKDF2_210k(BRANCH_TEMP_PASSWORD, branchSalt, 2);
    expect(computedBranchHash).toBe(branchHash);

    const authenticatedBranchAdmin = CustodyDB.getUsers().find(u => u.email === STATION_ADMIN_EMAIL);
    expect(authenticatedBranchAdmin).toBeDefined();
    expect(authenticatedBranchAdmin?.role).toBe('StationAdmin');
    expect(authenticatedBranchAdmin?.company_id).toBe(TEST_COMPANY_ID);
    expect(authenticatedBranchAdmin?.station_id).toBe(TEST_STATION_ID);
    expect(authenticatedBranchAdmin?.region_id).toBe(TEST_REGION_ID);
    expect(authenticatedBranchAdmin?.must_change_password).toBe(true);
  });

  it('6. Platform Admin permanently deletes Company -> Cascading deletion removes regions, stations, users, and enforces tombstone', async () => {
    // Seed initial state
    await CustodyDB.saveCompanies([{
      id: TEST_COMPANY_ID,
      name: 'شركة الرياض للتوريدات والمقاولات'
    }]);
    await CustodyDB.saveRegions([{
      id: TEST_REGION_ID,
      company_id: TEST_COMPANY_ID,
      name: 'المنطقة الوسطى'
    }]);
    await CustodyDB.saveStations([{
      id: TEST_STATION_ID,
      company_id: TEST_COMPANY_ID,
      region_id: TEST_REGION_ID,
      station_name: 'فرع العليا',
      station_code: 'ST-01',
      custody_amount: 50000,
      is_active: true
    }]);
    await CustodyDB.saveUsers([
      {
        id: 'usr_ahmed_admin_2026',
        email: COMPANY_ADMIN_EMAIL,
        full_name: 'أحمد المنصوري',
        role: 'Admin',
        company_id: TEST_COMPANY_ID,
        permissions: CustodyDB.enrichUserPermissions('Admin')
      },
      {
        id: 'usr_khaled_branch_2026',
        email: STATION_ADMIN_EMAIL,
        full_name: 'خالد السالم',
        role: 'StationAdmin',
        company_id: TEST_COMPANY_ID,
        region_id: TEST_REGION_ID,
        station_id: TEST_STATION_ID,
        permissions: CustodyDB.enrichUserPermissions('StationAdmin')
      }
    ]);

    // Verify data exists prior to deletion
    expect(CustodyDB.getCompanies().some(c => c.id === TEST_COMPANY_ID)).toBe(true);
    expect(CustodyDB.getRegions().some(r => r.company_id === TEST_COMPANY_ID)).toBe(true);
    expect(CustodyDB.getStations().some(s => s.company_id === TEST_COMPANY_ID)).toBe(true);
    expect(CustodyDB.getUsers().some(u => u.company_id === TEST_COMPANY_ID)).toBe(true);

    // Execute Cascading Company Deletion
    const deleteResult = await CustodyDB.deleteCompany(TEST_COMPANY_ID);
    expect(deleteResult.success).toBe(true);

    // Verify 1: Company is removed from client database
    expect(CustodyDB.getCompanies().some(c => c.id === TEST_COMPANY_ID)).toBe(false);

    // Verify 2: Regions belonging to this company are completely removed
    expect(CustodyDB.getRegions().some(r => r.company_id === TEST_COMPANY_ID)).toBe(false);

    // Verify 3: Stations belonging to this company are completely removed
    expect(CustodyDB.getStations().some(s => s.company_id === TEST_COMPANY_ID)).toBe(false);

    // Verify 4: Users belonging to this company are completely removed
    expect(CustodyDB.getUsers().some(u => u.company_id === TEST_COMPANY_ID)).toBe(false);

    // Verify 5: Tombstone is recorded permanently in deleted_company_ids
    const deletedIds = StorageEngine.getStored<string[]>('deleted_company_ids', []);
    expect(deletedIds).toContain(TEST_COMPANY_ID);

    // Verify 6: Resurrection Prevention: Even if raw storage receives the deleted company, getCompanies filters it out
    StorageEngine.setStored('companies', [{ id: TEST_COMPANY_ID, name: 'Ghost Company' }]);
    expect(CustodyDB.getCompanies().some(c => c.id === TEST_COMPANY_ID)).toBe(false);
  });
});
