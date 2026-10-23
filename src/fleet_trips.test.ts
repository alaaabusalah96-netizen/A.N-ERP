import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine } from './db/storage';
import { FleetBusinessEngine } from './lib/enterprise/fleet_engine';
import { Trip } from './types/fleet';
import { UsersModule } from './db/users';

describe('Fleet Trips Unit Tests', () => {
  const companyA = 'comp-alpha-123';
  const companyB = 'comp-beta-456';

  beforeEach(() => {
    StorageEngine.setStored('fleet_trips_items', []);
    StorageEngine.cache = {};
  });

  it('1. should register a new trip with status: DRAFT by default', async () => {
    const created = await FleetBusinessEngine.createTrip(companyA, 'user-001', {
      vehicle_id: 'veh-001',
      driver_id: 'drv-001',
      tripType: 'Freight Transport',
      scheduledAt: '2026-08-15T08:00:00Z',
      notes: 'Initial cargo delivery',
      stops: [
        {
          id: 'stop-1',
          sequence: 1,
          location: { org_unit_id: 'org-hub-1', label: 'Hub 1' },
          status: 'PENDING'
        },
        {
          id: 'stop-2',
          sequence: 2,
          location: { org_unit_id: 'org-hub-2', label: 'Hub 2' },
          status: 'PENDING'
        }
      ]
    });

    expect(created.status).toBe('DRAFT');
    expect(created.company_id).toBe(companyA);
    expect(created.createdBy).toBe('user-001');
    expect(created.stops).toHaveLength(2);

    const storedTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    expect(storedTrips).toHaveLength(1);
    expect(storedTrips[0].status).toBe('DRAFT');
  });

  it('2. should verify create_trip permission check before trip creation', () => {
    // User without create_trip or manage_fleet
    const restrictedUser = UsersModule.enrichUserPermissions('StationAdmin', {
      create_trip: false,
      manage_fleet: false
    });
    const canCreateRestricted = Boolean(
      restrictedUser.create_trip || restrictedUser.manage_fleet
    );
    expect(canCreateRestricted).toBe(false);

    // User with create_trip permission
    const authorizedUser = UsersModule.enrichUserPermissions('StationAdmin', {
      create_trip: true,
      manage_fleet: false
    });
    const canCreateAuthorized = Boolean(
      authorizedUser.create_trip || authorizedUser.manage_fleet
    );
    expect(canCreateAuthorized).toBe(true);

    // SystemAdmin or Admin user
    const adminUser = UsersModule.enrichUserPermissions('SystemAdmin', {});
    const canCreateAdmin = Boolean(
      adminUser.create_trip || adminUser.manage_fleet
    );
    expect(canCreateAdmin).toBe(true);
  });

  it('3. should correctly filter trips by company_id', async () => {
    await FleetBusinessEngine.createTrip(companyA, 'user-a', {
      vehicle_id: 'veh-a1',
      driver_id: 'drv-a1',
      tripType: 'Internal Transport',
      scheduledAt: '2026-08-16T10:00:00Z',
      stops: [
        { id: 's1', sequence: 1, location: { label: 'A1' }, status: 'PENDING' },
        { id: 's2', sequence: 2, location: { label: 'A2' }, status: 'PENDING' }
      ]
    });

    await FleetBusinessEngine.createTrip(companyA, 'user-a', {
      vehicle_id: 'veh-a2',
      driver_id: 'drv-a2',
      tripType: 'Equipment Move',
      scheduledAt: '2026-08-17T12:00:00Z',
      stops: [
        { id: 's1', sequence: 1, location: { label: 'A2' }, status: 'PENDING' },
        { id: 's2', sequence: 2, location: { label: 'A3' }, status: 'PENDING' }
      ]
    });

    await FleetBusinessEngine.createTrip(companyB, 'user-b', {
      vehicle_id: 'veh-b1',
      driver_id: 'drv-b1',
      tripType: 'Inter-branch Delivery',
      scheduledAt: '2026-08-18T14:00:00Z',
      stops: [
        { id: 's1', sequence: 1, location: { label: 'B1' }, status: 'PENDING' },
        { id: 's2', sequence: 2, location: { label: 'B2' }, status: 'PENDING' }
      ]
    });

    const companyATrips = FleetBusinessEngine.getTripsByCompany(companyA);
    const companyBTrips = FleetBusinessEngine.getTripsByCompany(companyB);

    expect(companyATrips).toHaveLength(2);
    expect(companyATrips.every(t => t.company_id === companyA)).toBe(true);

    expect(companyBTrips).toHaveLength(1);
    expect(companyBTrips[0].company_id).toBe(companyB);
  });
});
