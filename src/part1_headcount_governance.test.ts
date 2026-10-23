import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrganizationEngine } from './db/organizationEngine';
import { UsersModule } from './db/users';
import { StorageEngine } from './db/storage';
import { SignupRequest, AppUser } from './types';
import { OrganizationUnit } from './types/organization';

describe('Part 1: Per-Organization-Unit Account Headcount Governance Acceptance Suite', () => {
  const companyId = 'comp-test-headcount';
  let parentUnit: OrganizationUnit;
  let childUnit: OrganizationUnit;

  beforeEach(async () => {
    StorageEngine.clearCache();
    if (typeof localStorage !== 'undefined') localStorage.clear();
    // Initialize units
    parentUnit = await OrganizationEngine.addUnit({
      companyId,
      code: 'REG-01',
      name: 'Northern Region',
      nameAr: 'المنطقة الشمالية',
      nameEn: 'Northern Region',
      typeId: 'region',
      parentId: null
    });

    childUnit = await OrganizationEngine.addUnit({
      companyId,
      code: 'STN-01',
      name: 'Alexandria Branch',
      nameAr: 'فرع الإسكندرية',
      nameEn: 'Alexandria Branch',
      typeId: 'station',
      parentId: parentUnit.id
    });
  });

  it('1. should default max_accounts_allowed to 1 on newly created organization units', () => {
    expect(childUnit.max_accounts_allowed).toBe(1);
    const headcount = OrganizationEngine.getUnitAccountHeadcount(childUnit.id);
    expect(headcount.maxAllowed).toBe(1);
    expect(headcount.activeAccountsCount).toBe(0);
  });

  it('2. should allow first signup request submission when unit has 0 active accounts (under limit)', () => {
    const req: SignupRequest = {
      id: 'req-1',
      email: 'user1@alex.com',
      full_name: 'User One',
      role: 'StationAdmin',
      company_id: companyId,
      org_unit_id: childUnit.id,
      created_at: new Date().toISOString(),
      status: 'Pending'
    };

    const validation = UsersModule.validateSignupRequestHeadcount(req);
    expect(validation.allowed).toBe(true);
    expect(validation.currentCount).toBe(0);
    expect(validation.maxAllowed).toBe(1);
  });

  it('3. should BLOCK second signup request at submission time when unit already has 1 active account (at default limit 1)', async () => {
    // Add 1 active user to childUnit
    const activeUser: AppUser = {
      id: 'usr-1',
      email: 'user1@alex.com',
      full_name: 'User One',
      role: 'StationAdmin',
      permissions: {} as any,
      company_id: companyId,
      org_unit_id: childUnit.id,
      is_active: true
    };
    StorageEngine.setStored('users', [activeUser]);

    // Now try to submit a second signup request for the same unit
    const req2: SignupRequest = {
      id: 'req-2',
      email: 'user2@alex.com',
      full_name: 'User Two',
      role: 'StationAdmin',
      company_id: companyId,
      org_unit_id: childUnit.id,
      created_at: new Date().toISOString(),
      status: 'Pending'
    };

    const validation = UsersModule.validateSignupRequestHeadcount(req2);
    expect(validation.allowed).toBe(false);
    expect(validation.currentCount).toBe(1);
    expect(validation.maxAllowed).toBe(1);
    expect(validation.messageEn).toContain('maximum allowed number of accounts (1)');

    // Attempting to save via UsersModule.saveSignupRequest should throw error
    await expect(UsersModule.saveSignupRequest(req2)).rejects.toThrow(/maximum allowed number of accounts/i);
  });

  it('4. should allow the administrator at the organizational level directly above to raise limit by +1', async () => {
    // Region admin user (level directly above childUnit)
    const regionAdmin: AppUser = {
      id: 'adm-reg',
      email: 'region@admin.com',
      full_name: 'Region Manager',
      role: 'RegionalManager',
      permissions: {} as any,
      company_id: companyId,
      org_unit_id: parentUnit.id,
      is_active: true
    };

    const clearance = OrganizationEngine.canRaiseMaxAccountsAllowed(childUnit, regionAdmin);
    expect(clearance.canRaise).toBe(true);

    const res = await OrganizationEngine.raiseMaxAccountsAllowed(childUnit.id, regionAdmin);
    expect(res.success).toBe(true);
    expect(res.unit?.max_accounts_allowed).toBe(2);

    // After raising limit to 2, submitting a second request now succeeds!
    const activeUser: AppUser = {
      id: 'usr-1',
      email: 'user1@alex.com',
      full_name: 'User One',
      role: 'StationAdmin',
      permissions: {} as any,
      company_id: companyId,
      org_unit_id: childUnit.id,
      is_active: true
    };
    StorageEngine.setStored('users', [activeUser]);

    const req2: SignupRequest = {
      id: 'req-2',
      email: 'user2@alex.com',
      full_name: 'User Two',
      role: 'StationAdmin',
      company_id: companyId,
      org_unit_id: childUnit.id,
      created_at: new Date().toISOString(),
      status: 'Pending'
    };

    const validation = UsersModule.validateSignupRequestHeadcount(req2);
    expect(validation.allowed).toBe(true);
    expect(validation.currentCount).toBe(1);
    expect(validation.maxAllowed).toBe(2);
  });

  it('5. should enforce hard ceiling of 5 accounts per unit, rejecting attempts to raise beyond 5', async () => {
    const sysAdmin: AppUser = {
      id: 'sys-adm',
      email: 'sys@admin.com',
      full_name: 'System Admin',
      role: 'SystemAdmin',
      permissions: {} as any,
      company_id: 'comp-1',
      is_active: true
    };

    // Raise from 1 to 5
    await OrganizationEngine.raiseMaxAccountsAllowed(childUnit.id, sysAdmin); // -> 2
    await OrganizationEngine.raiseMaxAccountsAllowed(childUnit.id, sysAdmin); // -> 3
    await OrganizationEngine.raiseMaxAccountsAllowed(childUnit.id, sysAdmin); // -> 4
    await OrganizationEngine.raiseMaxAccountsAllowed(childUnit.id, sysAdmin); // -> 5

    const unitAt5 = OrganizationEngine.getUnitById(childUnit.id);
    expect(unitAt5?.max_accounts_allowed).toBe(5);

    // Attempting to raise a 6th time should be rejected
    const attempt6 = await OrganizationEngine.raiseMaxAccountsAllowed(childUnit.id, sysAdmin);
    expect(attempt6.success).toBe(false);
    expect(attempt6.errorEn).toContain('absolute maximum headcount ceiling for any organization unit is 5');

    const unitStill5 = OrganizationEngine.getUnitById(childUnit.id);
    expect(unitStill5?.max_accounts_allowed).toBe(5);
  });

  it('6. headcount rule applies to accounts of ANY role tied to a given unit', () => {
    // 1 regular employee tied to childUnit
    const empUser: AppUser = {
      id: 'usr-emp',
      email: 'emp@alex.com',
      full_name: 'Regular Employee',
      role: 'StationAdmin',
      permissions: {} as any,
      company_id: companyId,
      org_unit_id: childUnit.id,
      is_active: true
    };
    StorageEngine.setStored('users', [empUser]);

    // Submitting a request for StationAdmin role for that same unit is blocked because headcount is 1/1
    const adminReq: SignupRequest = {
      id: 'req-adm',
      email: 'newadmin@alex.com',
      full_name: 'New Admin',
      role: 'StationAdmin',
      company_id: companyId,
      org_unit_id: childUnit.id,
      created_at: new Date().toISOString(),
      status: 'Pending'
    };

    const validation = UsersModule.validateSignupRequestHeadcount(adminReq);
    expect(validation.allowed).toBe(false);
    expect(validation.currentCount).toBe(1);
    expect(validation.maxAllowed).toBe(1);
  });

  it('7. should resolve org_unit_id across legacy station_id and region_id mappings', () => {
    const stnUser: AppUser = {
      id: 'legacy-usr',
      email: 'legacy@stn.com',
      full_name: 'Legacy Station User',
      role: 'StationAdmin',
      permissions: {} as any,
      company_id: companyId,
      station_id: childUnit.id,
      is_active: true
    };
    StorageEngine.setStored('users', [stnUser]);

    const headcount = OrganizationEngine.getUnitAccountHeadcount(childUnit.id);
    expect(headcount.activeAccountsCount).toBe(1);
  });
});

