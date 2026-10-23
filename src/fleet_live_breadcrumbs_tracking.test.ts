import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageEngine } from './db/storage';
import { FleetBusinessEngine } from './lib/enterprise/fleet_engine';
import { Trip, Vehicle } from './types/fleet';

describe('Fleet Live Breadcrumbs Tracking Engine', () => {
  const companyId = 'comp-fleet-live-test';

  beforeEach(() => {
    localStorage.clear();
    StorageEngine.setStored('fleet_vehicles_items', [
      {
        id: 'veh-live-1',
        company_id: companyId,
        code: 'V-101',
        plateNumber: '1234-XYZ',
        make: 'Mercedes',
        model: 'Actros',
        year: 2024,
        type: 'TRUCK',
        status: 'ACTIVE',
        driverName: 'Captain Ahmed',
        odometerReading: 12000,
        fuelCapacity: 200,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    StorageEngine.setStored('fleet_trips_items', [
      {
        id: 'trip-live-1',
        company_id: companyId,
        vehicle_id: 'veh-live-1',
        driver_id: 'driver-live-1',
        tripType: 'DELIVERY',
        status: 'DISPATCHED',
        scheduledAt: new Date().toISOString(),
        startLocation: {
          lat: 24.7136,
          lng: 46.6753,
          label: 'Riyadh Hub'
        },
        stops: [
          {
            id: 'stop-1',
            trip_id: 'trip-live-1',
            sequence: 1,
            taskTitle: 'Origin Warehouse',
            status: 'COMPLETED',
            location: { lat: 24.7136, lng: 46.6753 }
          },
          {
            id: 'stop-2',
            trip_id: 'trip-live-1',
            sequence: 2,
            taskTitle: 'Customer Dropoff',
            status: 'PENDING',
            location: { lat: 24.7500, lng: 46.7000 }
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'trip-draft-1',
        company_id: companyId,
        vehicle_id: 'veh-live-1',
        driver_id: 'driver-live-1',
        tripType: 'SUPPLY',
        status: 'PENDING',
        scheduledAt: new Date().toISOString(),
        stops: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    StorageEngine.setStored('fleet_trip_tracks', []);
    StorageEngine.cache = {};
  });

  it('records the first breadcrumb point and initializes trip track', async () => {
    const result = await FleetBusinessEngine.recordTripBreadcrumbPoint(
      companyId,
      'trip-live-1',
      'veh-live-1',
      'driver-live-1',
      {
        lat: 24.7200,
        lng: 46.6800,
        accuracy: 8,
        speed: 15.5,
        heading: 90,
        timestamp: new Date().toISOString()
      },
      30
    );

    expect(result.recorded).toBe(true);
    expect(result.track).toBeDefined();
    expect(result.track.trip_id).toBe('trip-live-1');
    expect(result.track.vehicle_id).toBe('veh-live-1');
    expect(result.track.driver_id).toBe('driver-live-1');
    expect(result.track.is_active).toBe(true);
    expect(result.track.points.length).toBe(1);
    expect(result.track.points[0].lat).toBe(24.7200);

    // Verify vehicle last_known_location was synced
    const vehicle = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []).find(v => v.id === 'veh-live-1');
    expect(vehicle?.last_known_location?.lat).toBe(24.7200);
    expect(vehicle?.last_known_location?.lng).toBe(46.6800);
  });

  it('enforces throttling interval between breadcrumb points', async () => {
    const now = new Date();
    // First point
    await FleetBusinessEngine.recordTripBreadcrumbPoint(
      companyId,
      'trip-live-1',
      'veh-live-1',
      'driver-live-1',
      {
        lat: 24.7200,
        lng: 46.6800,
        timestamp: now.toISOString()
      },
      30
    );

    // Immediate second point (within 30 seconds) -> should be throttled
    const throttledResult = await FleetBusinessEngine.recordTripBreadcrumbPoint(
      companyId,
      'trip-live-1',
      'veh-live-1',
      'driver-live-1',
      {
        lat: 24.7205,
        lng: 46.6805,
        timestamp: new Date(now.getTime() + 5000).toISOString()
      },
      30
    );

    expect(throttledResult.recorded).toBe(false);
    expect(throttledResult.reason).toContain('Throttled');
    expect(throttledResult.track.points.length).toBe(1);

    // Point after 35 seconds -> should be accepted and update distance
    const acceptedResult = await FleetBusinessEngine.recordTripBreadcrumbPoint(
      companyId,
      'trip-live-1',
      'veh-live-1',
      'driver-live-1',
      {
        lat: 24.7300,
        lng: 46.6900,
        timestamp: new Date(now.getTime() + 35000).toISOString()
      },
      30
    );

    expect(acceptedResult.recorded).toBe(true);
    expect(acceptedResult.track.points.length).toBe(2);
    expect(acceptedResult.track.total_distance_km).toBeGreaterThan(0);
  });

  it('rejects recording breadcrumbs for trips not in DISPATCHED or IN_PROGRESS state', async () => {
    const result = await FleetBusinessEngine.recordTripBreadcrumbPoint(
      companyId,
      'trip-draft-1', // PENDING status
      'veh-live-1',
      'driver-live-1',
      {
        lat: 24.7200,
        lng: 46.6800,
        timestamp: new Date().toISOString()
      },
      30
    );

    expect(result.recorded).toBe(false);
    expect(result.reason).toContain('Trip is not in active state');
  });

  it('ends tracking properly when endTripTrack is invoked', async () => {
    // Record a point first
    await FleetBusinessEngine.recordTripBreadcrumbPoint(
      companyId,
      'trip-live-1',
      'veh-live-1',
      'driver-live-1',
      {
        lat: 24.7200,
        lng: 46.6800,
        timestamp: new Date().toISOString()
      },
      30
    );

    // End tracking
    const endTrack = await FleetBusinessEngine.endTripTrack(companyId, 'trip-live-1');
    expect(endTrack).toBeDefined();
    expect(endTrack?.is_active).toBe(false);
    expect(endTrack?.ended_at).toBeDefined();

    // Verify subsequent points are rejected
    const afterEndResult = await FleetBusinessEngine.recordTripBreadcrumbPoint(
      companyId,
      'trip-live-1',
      'veh-live-1',
      'driver-live-1',
      {
        lat: 24.7500,
        lng: 46.7000,
        timestamp: new Date(Date.now() + 60000).toISOString()
      },
      30
    );

    expect(afterEndResult.recorded).toBe(false);
    expect(afterEndResult.reason).toContain('no longer active');
  });

  it('completing a trip automatically finalizes live breadcrumb track', async () => {
    // Record a live point
    await FleetBusinessEngine.recordTripBreadcrumbPoint(
      companyId,
      'trip-live-1',
      'veh-live-1',
      'driver-live-1',
      {
        lat: 24.7200,
        lng: 46.6800,
        timestamp: new Date().toISOString()
      },
      30
    );

    // Complete the trip
    await FleetBusinessEngine.completeTrip(
      companyId,
      'driver-live-1',
      'trip-live-1',
      {
        lat: 24.7500,
        lng: 46.7000,
        label: 'Trip Destination'
      }
    );

    const track = FleetBusinessEngine.getTripTrack(companyId, 'trip-live-1');
    expect(track).toBeDefined();
    expect(track?.is_active).toBe(false);
    expect(track?.ended_at).toBeDefined();
  });
});
