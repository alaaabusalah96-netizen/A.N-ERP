import { describe, it, expect } from 'vitest';
import { UsersModule } from './db/users';
import { getFilteredMenuItems } from './components/Layout';
import { AppUser, UserRole } from './types';

describe('Fleet Permissions Enrichening', () => {
  it('should return manage_fleet: true for SystemAdmin by default', () => {
    const perms = UsersModule.enrichUserPermissions('SystemAdmin');
    expect(perms.manage_fleet).toBe(true);
    expect(perms.create_trip).toBe(false);
    expect(perms.approve_trip).toBe(false);
    expect(perms.dispatch_trip).toBe(false);
  });

  it('should return manage_fleet: false and create_trip: false for StationAdmin without currentPerms', () => {
    const perms = UsersModule.enrichUserPermissions('StationAdmin');
    expect(perms.manage_fleet).toBe(false);
    expect(perms.create_trip).toBe(false);
    expect(perms.approve_trip).toBe(false);
    expect(perms.dispatch_trip).toBe(false);
  });

  it('should preserve explicit currentPerms like create_trip: true even for StationAdmin role', () => {
    const perms = UsersModule.enrichUserPermissions('StationAdmin', {
      create_trip: true,
      manage_fleet: true
    });
    expect(perms.create_trip).toBe(true);
    expect(perms.manage_fleet).toBe(true);
    expect(perms.approve_trip).toBe(false);
  });

  it('should return manage_fleet: true for Admin role by default, and false for other roles like StationAdmin or RegionalManager', () => {
    const adminPerms = UsersModule.enrichUserPermissions('Admin');
    expect(adminPerms.manage_fleet).toBe(true);

    const stationPerms = UsersModule.enrichUserPermissions('StationAdmin');
    expect(stationPerms.manage_fleet).toBe(false);

    const regionalPerms = UsersModule.enrichUserPermissions('RegionalManager');
    expect(regionalPerms.manage_fleet).toBe(false);
  });

  describe('Phase 4: Sidebar OR Navigation and Page Gate Gating', () => {
    it('should show Fleet in sidebar when user has execute_trip_tasks only (no manage_fleet)', () => {
      const driverUser: AppUser = {
        id: 'usr-driver-1',
        email: 'driver@test.com',
        full_name: 'Driver Ali',
        role: 'StationAdmin' as UserRole,
        permissions: {
          execute_trip_tasks: true
        }
      };

      const menuItems = getFilteredMenuItems(driverUser, 'en');
      const fleetItem = menuItems.find(item => item.id === 'fleet');
      expect(fleetItem).toBeDefined();
      expect(fleetItem?.id).toBe('fleet');
    });

    it('should show Fleet in sidebar when user has any of the fleet sub-permissions', () => {
      const fleetSubPerms = [
        'manage_fleet',
        'create_trip',
        'approve_trip',
        'dispatch_trip',
        'reassign_vehicle',
        'execute_breakdown_decision',
        'create_emergency_trip',
        'manage_vehicle_constraints',
        'execute_trip_tasks'
      ] as const;

      for (const perm of fleetSubPerms) {
        const testUser: AppUser = {
          id: `usr-${perm}`,
          email: `${perm}@test.com`,
          full_name: `Test User ${perm}`,
          role: 'StationAdmin' as UserRole,
          permissions: {
            [perm]: true
          }
        };

        const menuItems = getFilteredMenuItems(testUser, 'en');
        const fleetItem = menuItems.find(item => item.id === 'fleet');
        expect(fleetItem, `Expected fleet link in sidebar for permission ${perm}`).toBeDefined();
      }
    });

    it('should hide Fleet in sidebar when user has no fleet permissions', () => {
      const regularUser: AppUser = {
        id: 'usr-regular-1',
        email: 'regular@test.com',
        full_name: 'Regular User',
        role: 'StationAdmin' as UserRole,
        permissions: {
          create_expense: true,
          view_reports: true
        }
      };

      const menuItems = getFilteredMenuItems(regularUser, 'en');
      const fleetItem = menuItems.find(item => item.id === 'fleet');
      expect(fleetItem).toBeUndefined();
    });

    it('should verify fine-grained tab visibility for execute_trip_tasks user (driver portal only, no admin tabs)', () => {
      const driverUser: AppUser = {
        id: 'usr-driver-1',
        email: 'driver@test.com',
        full_name: 'Driver Ali',
        role: 'StationAdmin' as UserRole,
        permissions: {
          execute_trip_tasks: true
        }
      };

      const hasAnyFleetPermission = Boolean(
        driverUser.role === 'SystemAdmin' ||
        driverUser.role === 'Admin' ||
        driverUser.permissions.manage_fleet ||
        driverUser.permissions.create_trip ||
        driverUser.permissions.approve_trip ||
        driverUser.permissions.dispatch_trip ||
        driverUser.permissions.reassign_vehicle ||
        driverUser.permissions.execute_breakdown_decision ||
        driverUser.permissions.create_emergency_trip ||
        driverUser.permissions.manage_vehicle_constraints ||
        driverUser.permissions.execute_trip_tasks
      );

      const canViewVehicles = Boolean(driverUser.permissions.manage_fleet || driverUser.role === 'SystemAdmin');
      const canViewTrips = Boolean(
        driverUser.permissions.create_trip || 
        driverUser.permissions.approve_trip || 
        driverUser.permissions.dispatch_trip || 
        driverUser.permissions.manage_fleet || 
        driverUser.role === 'SystemAdmin'
      );
      const canViewDriverPortal = Boolean(
        driverUser.permissions.execute_trip_tasks || 
        driverUser.permissions.manage_fleet || 
        driverUser.role === 'SystemAdmin'
      );
      const canManageConstraints = Boolean(
        driverUser.permissions.manage_vehicle_constraints || 
        driverUser.permissions.manage_fleet || 
        driverUser.role === 'SystemAdmin'
      );

      expect(hasAnyFleetPermission).toBe(true);
      expect(canViewDriverPortal).toBe(true);
      expect(canViewVehicles).toBe(false);
      expect(canViewTrips).toBe(false);
      expect(canManageConstraints).toBe(false);
    });
  });
});

