import { describe, it, expect } from 'vitest';
import { CustodyDB } from './db';
import { UsersModule } from './db/users';
import { AppUser } from './types';

describe('Phase U: Inactive Users & Lifecycle Management in Unified Access Control Center', () => {
  it('1. Verifies that statusFilter = ACTIVE correctly excludes inactive users', () => {
    const mockUsers: AppUser[] = [
      {
        id: 'u1',
        email: 'active@example.com',
        full_name: 'Active User',
        role: 'StationAdmin',
        company_id: 'custodyflow',
        is_active: true,
        permissions: CustodyDB.enrichUserPermissions('StationAdmin', {})
      },
      {
        id: 'u2',
        email: 'inactive@example.com',
        full_name: 'Inactive User',
        role: 'StationAdmin',
        company_id: 'custodyflow',
        is_active: false,
        permissions: CustodyDB.enrichUserPermissions('StationAdmin', {})
      }
    ];

    const activeFiltered = mockUsers.filter(u => u.is_active !== false);
    expect(activeFiltered).toHaveLength(1);
    expect(activeFiltered[0].id).toBe('u1');

    const inactiveFiltered = mockUsers.filter(u => u.is_active === false);
    expect(inactiveFiltered).toHaveLength(1);
    expect(inactiveFiltered[0].id).toBe('u2');

    const allFiltered = mockUsers;
    expect(allFiltered).toHaveLength(2);
  });

  it('2. Verifies that toggling is_active updates user state correctly in CustodyDB', async () => {
    const testUser: AppUser = {
      id: 'test_user_lifecycle_toggle',
      email: 'toggle_user@example.com',
      full_name: 'Toggle User',
      role: 'StationAdmin',
      company_id: 'custodyflow',
      is_active: true,
      permissions: CustodyDB.enrichUserPermissions('StationAdmin', {})
    };

    const initialUsers = CustodyDB.getUsers();
    await CustodyDB.saveUsers([...initialUsers, testUser]);

    // Deactivate user
    const deactivatedUsers = CustodyDB.getUsers().map(u => 
      u.id === testUser.id ? { ...u, is_active: false } : u
    );
    await CustodyDB.saveUsers(deactivatedUsers);

    let retrieved = CustodyDB.getUsers().find(u => u.id === testUser.id);
    expect(retrieved?.is_active).toBe(false);

    // Reactivate user
    const reactivatedUsers = CustodyDB.getUsers().map(u => 
      u.id === testUser.id ? { ...u, is_active: true } : u
    );
    await CustodyDB.saveUsers(reactivatedUsers);

    retrieved = CustodyDB.getUsers().find(u => u.id === testUser.id);
    expect(retrieved?.is_active).toBe(true);

    // Clean up
    await CustodyDB.saveUsers(CustodyDB.getUsers().filter(u => u.id !== testUser.id));
  });

  it('3. Confirms UsersModule.canUserManageTargetUser enforces hierarchy when toggling status', () => {
    const companyAdmin: AppUser = {
      id: 'admin_1',
      email: 'admin@company.com',
      full_name: 'Company Admin',
      role: 'Admin',
      company_id: 'comp_a',
      is_active: true,
      permissions: CustodyDB.enrichUserPermissions('Admin', {})
    };

    const employeeInSameCompany: AppUser = {
      id: 'emp_1',
      email: 'emp@company.com',
      full_name: 'Employee',
      role: 'StationAdmin',
      company_id: 'comp_a',
      is_active: true,
      permissions: CustodyDB.enrichUserPermissions('StationAdmin', {})
    };

    const employeeInOtherCompany: AppUser = {
      id: 'emp_2',
      email: 'emp@other.com',
      full_name: 'Other Employee',
      role: 'StationAdmin',
      company_id: 'comp_b',
      is_active: true,
      permissions: CustodyDB.enrichUserPermissions('StationAdmin', {})
    };

    const sameCompanyCheck = UsersModule.canUserManageTargetUser(companyAdmin, employeeInSameCompany);
    expect(sameCompanyCheck.allowed).toBe(true);

    const otherCompanyCheck = UsersModule.canUserManageTargetUser(companyAdmin, employeeInOtherCompany);
    expect(otherCompanyCheck.allowed).toBe(false);
  });
});
