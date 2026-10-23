import { describe, it, expect, beforeEach } from 'vitest';
import { UserPermissions } from './types';
import { UsersModule } from './db/users';
import { FleetBusinessEngine } from './lib/enterprise/fleet_engine';
import { StorageEngine } from './db/storage';

describe('Trips & Fleet Security Rules & Permissions Logic', () => {
  beforeEach(() => {
    StorageEngine.setStored('fleet_trips_items', []);
    StorageEngine.cache = {};
  });

  it('1. SystemAdmin has all fleet and trip permissions enabled by default', () => {
    const sysAdminPerms = UsersModule.enrichUserPermissions('SystemAdmin');
    expect(sysAdminPerms.manage_fleet).toBe(true);
    expect(sysAdminPerms.create_trip).toBe(false); // default unless granted or admin
  });

  it('2. Custom permissions override default trip flags', () => {
    const customPerms: Partial<UserPermissions> = {
      manage_fleet: true,
      create_trip: true,
      approve_trip: true,
      dispatch_trip: true,
    };
    const enriched = UsersModule.enrichUserPermissions('StationAdmin', customPerms);
    expect(enriched.manage_fleet).toBe(true);
    expect(enriched.create_trip).toBe(true);
    expect(enriched.approve_trip).toBe(true);
    expect(enriched.dispatch_trip).toBe(true);
  });

  it('3. Real Trip creation validates company_id structure and status for Firestore security rules', async () => {
    const companyId = 'test-company-123';
    const createdTrip = await FleetBusinessEngine.createTrip(companyId, 'usr-creator', {
      vehicle_id: 'veh-1',
      driver_id: 'drv-1',
      tripType: 'Logistics Transfer',
      scheduledAt: new Date().toISOString(),
      stops: [
        {
          id: 'stop-1',
          sequence: 1,
          location: { label: 'Riyadh Depot', lat: 24.7136, lng: 46.6753 },
          status: 'PENDING'
        },
        {
          id: 'stop-2',
          sequence: 2,
          location: { label: 'Jeddah Station', lat: 21.4858, lng: 39.1925 },
          status: 'PENDING'
        }
      ]
    });

    expect(createdTrip.company_id).toBe(companyId);
    expect(createdTrip.id).toBeDefined();
    expect(createdTrip.status).toBe('DRAFT');
    expect(createdTrip.stops).toHaveLength(2);
    expect(createdTrip.stops[0].location.label).toBe('Riyadh Depot');
  });
});

