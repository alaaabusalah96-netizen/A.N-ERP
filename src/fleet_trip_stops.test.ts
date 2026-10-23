import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine } from './db/storage';
import { FleetBusinessEngine } from './lib/enterprise/fleet_engine';
import { TripStop } from './types/fleet';

describe('Fleet Multi-Stop Route Unit Tests', () => {
  const companyId = 'comp-logistics-99';

  beforeEach(() => {
    StorageEngine.setStored('fleet_trips_items', []);
    StorageEngine.cache = {};
  });

  it('1. should reject trip creation when fewer than 2 stops are provided', async () => {
    await expect(
      FleetBusinessEngine.createTrip(companyId, 'usr-1', {
        vehicle_id: 'veh-01',
        driver_id: 'drv-01',
        tripType: 'Direct Haul',
        scheduledAt: '2026-08-20T09:00:00Z',
        stops: [
          {
            id: 'stop-single',
            sequence: 1,
            location: { label: 'Single Point Only' },
            status: 'PENDING'
          }
        ]
      })
    ).rejects.toThrow('Trip must contain at least 2 stops');
  });

  it('2. should preserve the exact sequence order across 4 stops', async () => {
    const stopsInput: TripStop[] = [
      { id: 's1', sequence: 1, location: { label: 'Main Warehouse' }, status: 'PENDING' },
      { id: 's2', sequence: 2, location: { label: 'Distribution Hub North' }, status: 'PENDING' },
      { id: 's3', sequence: 3, location: { label: 'Retail Outlet A' }, status: 'PENDING' },
      { id: 's4', sequence: 4, location: { label: 'Return Depot' }, status: 'PENDING' }
    ];

    const trip = await FleetBusinessEngine.createTrip(companyId, 'usr-1', {
      vehicle_id: 'veh-01',
      driver_id: 'drv-01',
      tripType: 'Multi-drop Distribution',
      scheduledAt: '2026-08-20T09:00:00Z',
      stops: stopsInput
    });

    expect(trip.stops).toHaveLength(4);
    expect(trip.stops[0].sequence).toBe(1);
    expect(trip.stops[0].location.label).toBe('Main Warehouse');
    expect(trip.stops[1].sequence).toBe(2);
    expect(trip.stops[1].location.label).toBe('Distribution Hub North');
    expect(trip.stops[2].sequence).toBe(3);
    expect(trip.stops[2].location.label).toBe('Retail Outlet A');
    expect(trip.stops[3].sequence).toBe(4);
    expect(trip.stops[3].location.label).toBe('Return Depot');
  });

  it('3. should support both registered org_unit_id and free-text labels in stops', async () => {
    const trip = await FleetBusinessEngine.createTrip(companyId, 'usr-1', {
      vehicle_id: 'veh-01',
      driver_id: 'drv-01',
      tripType: 'Service Delivery',
      scheduledAt: '2026-08-21T11:00:00Z',
      stops: [
        {
          id: 's1',
          sequence: 1,
          location: { org_unit_id: 'org-central-branch', label: 'Central HQ' },
          status: 'PENDING'
        },
        {
          id: 's2',
          sequence: 2,
          location: { label: 'Client Remote Site B (Free Text)' },
          status: 'PENDING'
        }
      ]
    });

    expect(trip.stops[0].location.org_unit_id).toBe('org-central-branch');
    expect(trip.stops[0].location.label).toBe('Central HQ');
    expect(trip.stops[1].location.org_unit_id).toBeUndefined();
    expect(trip.stops[1].location.label).toBe('Client Remote Site B (Free Text)');
  });

  it('4. should accurately store GPS coordinates (lat/lng) on stops', async () => {
    const trip = await FleetBusinessEngine.createTrip(companyId, 'usr-1', {
      vehicle_id: 'veh-01',
      driver_id: 'drv-01',
      tripType: 'Heavy Haul',
      scheduledAt: '2026-08-22T06:00:00Z',
      stops: [
        {
          id: 's-riyadh',
          sequence: 1,
          location: { label: 'Riyadh Hub', lat: 24.7136, lng: 46.6753 },
          status: 'PENDING'
        },
        {
          id: 's-dammam',
          sequence: 2,
          location: { label: 'Dammam Port', lat: 26.4207, lng: 50.0888 },
          status: 'PENDING'
        }
      ]
    });

    expect(trip.stops[0].location.lat).toBeCloseTo(24.7136);
    expect(trip.stops[0].location.lng).toBeCloseTo(46.6753);
    expect(trip.stops[1].location.lat).toBeCloseTo(26.4207);
    expect(trip.stops[1].location.lng).toBeCloseTo(50.0888);
  });
});
