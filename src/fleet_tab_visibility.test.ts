import { describe, it, expect } from 'vitest';
import { UsersModule } from './db/users';
import { DEFAULT_PERMISSIONS } from './db/defaults';
import { UserRole } from './types';

describe('Fleet Tab Visibility & Permissions Suite', () => {
  it('1. should verify execute_trip_tasks defaults to false for any role except SystemAdmin', () => {
    const stationUser = {
      role: 'StationAdmin' as UserRole,
      permissions: {}
    };

    const regionalUser = {
      role: 'RegionalManager' as UserRole,
      permissions: {}
    };

    const adminUser = {
      role: 'Admin' as UserRole,
      permissions: {}
    };

    const systemAdminUser = {
      role: 'SystemAdmin' as UserRole,
      permissions: {}
    };

    const enrichedStation = UsersModule.enrichUserPermissions(stationUser.role, stationUser.permissions);
    const enrichedRegional = UsersModule.enrichUserPermissions(regionalUser.role, regionalUser.permissions);
    const enrichedAdmin = UsersModule.enrichUserPermissions(adminUser.role, adminUser.permissions);
    const enrichedSystemAdmin = UsersModule.enrichUserPermissions(systemAdminUser.role, systemAdminUser.permissions);

    expect(enrichedStation.execute_trip_tasks).toBe(false);
    expect(enrichedRegional.execute_trip_tasks).toBe(false);
    expect(enrichedAdmin.execute_trip_tasks).toBe(false);
    expect(enrichedSystemAdmin.execute_trip_tasks).toBe(true);

    const permDef = DEFAULT_PERMISSIONS.find(p => p.id === 'execute_trip_tasks');
    expect(permDef).toBeDefined();
    expect(permDef?.name_ar).toBe('تنفيذ مهام السائق الميدانية');
    expect(permDef?.category).toBe('fleet');
  });

  it('2. should verify a user with only create_trip can see trips tab but not vehicles tab or driver portal', () => {
    const user = {
      id: 'usr-trip-creator',
      role: 'StationAdmin' as UserRole,
      permissions: {
        create_trip: true
      }
    };

    const enriched = UsersModule.enrichUserPermissions(user.role, user.permissions);

    const canViewVehicles = Boolean(enriched.manage_fleet || user.role === 'SystemAdmin');
    const canViewTrips = Boolean(
      enriched.create_trip || 
      enriched.approve_trip || 
      enriched.dispatch_trip || 
      enriched.manage_fleet || 
      user.role === 'SystemAdmin'
    );
    const canViewDriverPortal = Boolean(
      enriched.execute_trip_tasks || 
      enriched.manage_fleet || 
      user.role === 'SystemAdmin'
    );

    expect(canViewTrips).toBe(true);
    expect(canViewVehicles).toBe(false);
    expect(canViewDriverPortal).toBe(false);
  });

  it('3. should verify a user with only execute_trip_tasks can access driver portal and is blocked from other tabs', () => {
    const user = {
      id: 'usr-field-driver',
      role: 'StationAdmin' as UserRole,
      permissions: {
        execute_trip_tasks: true
      }
    };

    const enriched = UsersModule.enrichUserPermissions(user.role, user.permissions);

    const canViewVehicles = Boolean(enriched.manage_fleet || user.role === 'SystemAdmin');
    const canViewTrips = Boolean(
      enriched.create_trip || 
      enriched.approve_trip || 
      enriched.dispatch_trip || 
      enriched.manage_fleet || 
      user.role === 'SystemAdmin'
    );
    const canViewDriverPortal = Boolean(
      enriched.execute_trip_tasks || 
      enriched.manage_fleet || 
      user.role === 'SystemAdmin'
    );
    const canManageConstraints = Boolean(
      enriched.manage_vehicle_constraints || 
      enriched.manage_fleet || 
      user.role === 'SystemAdmin'
    );

    expect(canViewDriverPortal).toBe(true);
    expect(canViewTrips).toBe(false);
    expect(canViewVehicles).toBe(false);
    expect(canManageConstraints).toBe(false);

    // Default tab resolution check
    let resolvedDefaultTab: string;
    if (canViewDriverPortal && !canViewTrips && !canViewVehicles) {
      resolvedDefaultTab = 'driver_portal';
    } else if (canViewTrips) {
      resolvedDefaultTab = 'trips';
    } else if (canViewVehicles) {
      resolvedDefaultTab = 'vehicles';
    } else {
      resolvedDefaultTab = 'driver_portal';
    }

    expect(resolvedDefaultTab).toBe('driver_portal');
  });
});
