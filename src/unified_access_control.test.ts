import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine } from './db/storage';
import { UsersModule } from './db/users';
import { OrganizationEngine } from './db/organizationEngine';
import { OrganizationScopeEngine } from './db/organizationScopeEngine';
import { AppUser, UserRole, UserPermissions } from './types';
import { OrganizationUnit } from './types/organization';

describe('Unified Access Control & Scope Engine (شخص × فرع × موديول)', () => {
  const companyA = 'comp-test-a';
  const companyB = 'comp-test-b';

  const systemAdminUser: AppUser = {
    id: 'user-sysadmin',
    full_name: 'Platform Super Admin',
    email: 'admin@platform.com',
    role: 'SystemAdmin',
    is_active: true,
    is_platform_owner: true,
    permissions: UsersModule.enrichUserPermissions('SystemAdmin')
  };

  const companyAdminA: AppUser = {
    id: 'user-admin-a',
    full_name: 'Company A Admin',
    email: 'admin@comp-a.com',
    role: 'Admin',
    company_id: companyA,
    is_active: true,
    permissions: UsersModule.enrichUserPermissions('Admin')
  };

  const companyAdminB: AppUser = {
    id: 'user-admin-b',
    full_name: 'Company B Admin',
    email: 'admin@comp-b.com',
    role: 'Admin',
    company_id: companyB,
    is_active: true,
    permissions: UsersModule.enrichUserPermissions('Admin')
  };

  const regionalManagerCairo: AppUser = {
    id: 'user-reg-cairo',
    full_name: 'Cairo Sector Manager',
    email: 'cairo.mgr@comp-a.com',
    role: 'RegionalManager',
    company_id: companyA,
    org_unit_id: 'org-cairo-sector',
    is_active: true,
    permissions: {
      ...UsersModule.enrichUserPermissions('RegionalManager'),
      manage_users: true
    }
  };

  const fleetOfficerMaadi: AppUser = {
    id: 'user-fleet-maadi',
    full_name: 'Maadi Fleet Officer',
    email: 'maadi.fleet@comp-a.com',
    role: 'StationAdmin',
    company_id: companyA,
    org_unit_id: 'org-maadi-branch',
    is_active: true,
    permissions: {
      ...UsersModule.enrichUserPermissions('StationAdmin'),
      // ONLY Fleet module permissions enabled:
      manage_fleet: true,
      create_trip: true,
      approve_trip: true,
      dispatch_trip: true,
      create_expense: false,
      edit_expense: false,
      create_voucher: false,
      approve_voucher: false,
      view_reports: true
    }
  };

  const custodyAccountantMaadi: AppUser = {
    id: 'user-custody-maadi',
    full_name: 'Maadi Custody Accountant',
    email: 'maadi.custody@comp-a.com',
    role: 'StationAdmin',
    company_id: companyA,
    org_unit_id: 'org-maadi-branch',
    is_active: true,
    permissions: {
      ...UsersModule.enrichUserPermissions('StationAdmin'),
      // ONLY Custody & Vouchers module permissions enabled:
      manage_fleet: false,
      create_trip: false,
      approve_trip: false,
      dispatch_trip: false,
      create_expense: true,
      edit_expense: true,
      create_voucher: true,
      approve_voucher: true,
      view_reports: true
    }
  };

  const alexBranchUser: AppUser = {
    id: 'user-alex',
    full_name: 'Alexandria Branch User',
    email: 'alex@comp-a.com',
    role: 'StationAdmin',
    company_id: companyA,
    org_unit_id: 'org-alex-branch',
    is_active: true,
    permissions: UsersModule.enrichUserPermissions('StationAdmin')
  };

  const testOrgUnitsA: OrganizationUnit[] = [
    {
      id: 'org-root-a',
      companyId: companyA,
      parentId: null,
      typeId: 'out-company',
      code: 'HQ',
      name: 'HQ Sector',
      nameAr: 'قطاع المركز الرئيسي',
      path: '/org-root-a',
      level: 0,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'org-cairo-sector',
      companyId: companyA,
      parentId: 'org-root-a',
      typeId: 'out-region',
      code: 'REG-CAI',
      name: 'Cairo Greater Sector',
      nameAr: 'قطاع القاهرة الكبرى',
      path: '/org-root-a/org-cairo-sector',
      level: 1,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'org-maadi-branch',
      companyId: companyA,
      parentId: 'org-cairo-sector',
      typeId: 'out-branch',
      code: 'BR-MAADI',
      name: 'Maadi Main Branch',
      nameAr: 'فرع المعادي الرئيسي',
      path: '/org-root-a/org-cairo-sector/org-maadi-branch',
      level: 2,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'org-alex-sector',
      companyId: companyA,
      parentId: 'org-root-a',
      typeId: 'out-region',
      code: 'REG-ALX',
      name: 'Alexandria & Delta Sector',
      nameAr: 'قطاع الإسكندرية والدلتا',
      path: '/org-root-a/org-alex-sector',
      level: 1,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'org-alex-branch',
      companyId: companyA,
      parentId: 'org-alex-sector',
      typeId: 'out-branch',
      code: 'BR-ALEX',
      name: 'Alexandria Branch',
      nameAr: 'فرع الإسكندرية',
      path: '/org-root-a/org-alex-sector/org-alex-branch',
      level: 2,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    }
  ];

  beforeEach(async () => {
    StorageEngine.cache = {};
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    await OrganizationEngine.saveUnits(testOrgUnitsA);
    StorageEngine.setStored('users', [
      systemAdminUser,
      companyAdminA,
      companyAdminB,
      regionalManagerCairo,
      fleetOfficerMaadi,
      custodyAccountantMaadi,
      alexBranchUser
    ]);
  });

  describe('1. Cross-Company & Platform Isolation Boundaries', () => {
    it('SystemAdmin can manage any user across all tenant companies', () => {
      expect(UsersModule.canUserManageTargetUser(systemAdminUser, companyAdminA).allowed).toBe(true);
      expect(UsersModule.canUserManageTargetUser(systemAdminUser, companyAdminB).allowed).toBe(true);
      expect(UsersModule.canUserManageTargetUser(systemAdminUser, fleetOfficerMaadi).allowed).toBe(true);
    });

    it('Company Admin A can manage employees strictly within Company A', () => {
      expect(UsersModule.canUserManageTargetUser(companyAdminA, fleetOfficerMaadi).allowed).toBe(true);
      expect(UsersModule.canUserManageTargetUser(companyAdminA, custodyAccountantMaadi).allowed).toBe(true);
      expect(UsersModule.canUserManageTargetUser(companyAdminA, regionalManagerCairo).allowed).toBe(true);
    });

    it('Company Admin A is strictly BLOCKED from managing users in Company B', () => {
      const result = UsersModule.canUserManageTargetUser(companyAdminA, companyAdminB);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('شركة أخرى');
    });

    it('Non-SystemAdmin cannot modify or override Platform SuperAdmin profile', () => {
      const result = UsersModule.canUserManageTargetUser(companyAdminA, systemAdminUser);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('مدير المنصة');
    });
  });

  describe('2. Hierarchical Org Unit / Branch Scope Governance', () => {
    it('Regional Manager for Cairo Sector can manage Maadi branch user (descendant in tree)', () => {
      const result = UsersModule.canUserManageTargetUser(regionalManagerCairo, fleetOfficerMaadi);
      expect(result.allowed).toBe(true);
    });

    it('Regional Manager for Cairo Sector is BLOCKED from managing Alexandria branch user (outside Cairo branch tree)', () => {
      const result = UsersModule.canUserManageTargetUser(regionalManagerCairo, alexBranchUser);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('خارج نطاق فروعك');
    });

    it('Scoped user list for Regional Manager only includes Cairo subtree users', () => {
      UsersModule.setActiveUser(regionalManagerCairo);
      const scopedUsers = UsersModule.getScopedUsers();
      const userIds = scopedUsers.map(u => u.id);

      expect(userIds).toContain('user-reg-cairo');
      expect(userIds).toContain('user-fleet-maadi');
      expect(userIds).toContain('user-custody-maadi');
      expect(userIds).not.toContain('user-alex'); // Alex branch is in a different sector
      expect(userIds).not.toContain('user-admin-b'); // Company B
    });
  });

  describe('3. Multi-Person Branch Independence (Person × Branch × Module)', () => {
    it('allows two users in the same branch to possess distinct module privileges without collision', () => {
      // Both users share the same branch ID:
      expect(fleetOfficerMaadi.org_unit_id).toBe('org-maadi-branch');
      expect(custodyAccountantMaadi.org_unit_id).toBe('org-maadi-branch');

      // User 1 (Fleet Officer) has Fleet access, but NO Custody write access:
      expect(fleetOfficerMaadi.permissions.manage_fleet).toBe(true);
      expect(fleetOfficerMaadi.permissions.create_trip).toBe(true);
      expect(fleetOfficerMaadi.permissions.create_expense).toBe(false);
      expect(fleetOfficerMaadi.permissions.create_voucher).toBe(false);

      // User 2 (Custody Accountant) has Custody/Vouchers access, but NO Fleet access:
      expect(custodyAccountantMaadi.permissions.manage_fleet).toBe(false);
      expect(custodyAccountantMaadi.permissions.create_trip).toBe(false);
      expect(custodyAccountantMaadi.permissions.create_expense).toBe(true);
      expect(custodyAccountantMaadi.permissions.create_voucher).toBe(true);
    });
  });
});
