import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FleetBusinessEngine } from './lib/enterprise/fleet_engine';
import { StorageEngine } from './db/storage';
import { Trip, Vehicle, TripBreadcrumbTrack } from './types/fleet';

// Mock StorageEngine and firebase dbSetDoc
vi.mock('./firebase', () => ({
  dbSetDoc: vi.fn().mockResolvedValue(true)
}));

describe('Fleet Phase 3: Route Historical Replay, Geofence Arrival & Telemetry Analysis', () => {
  const companyId = 'comp-test-phase3';
  const userId = 'user-supervisor-01';

  beforeEach(() => {
    localStorage.clear();

    const initialVehicles: Vehicle[] = [
      {
        id: 'veh-01',
        company_id: companyId,
        code: 'FLT-001',
        plateNumber: '1111-AAA',
        make: 'Toyota',
        model: 'Hilux',
        year: 2023,
        type: 'PICKUP',
        status: 'ACTIVE',
        driverName: 'سائق تجريبي 1',
        odometerReading: 12000,
        fuelCapacity: 80,
        createdAt: '2026-08-01T00:00:00Z',
        last_known_location: {
          lat: 24.7136,
          lng: 46.6753,
          updatedAt: '2026-08-18T08:00:00Z',
          label: 'فرع الرياض الرئيسي'
        }
      }
    ];

    const initialTrips: Trip[] = [
      {
        id: 'trip-p3-01',
        company_id: companyId,
        vehicle_id: 'veh-01',
        driver_id: 'driver-01',
        tripType: 'صيانة ميدانية',
        status: 'DISPATCHED',
        scheduledAt: '2026-08-18T09:00:00Z',
        startedAt: '2026-08-18T09:05:00Z',
        createdBy: userId,
        createdAt: '2026-08-18T08:30:00Z',
        stops: [
          {
            id: 'stop-1',
            sequence: 1,
            taskTitle: 'نقطة الانطلاق (الفرع الرئيسي)',
            status: 'COMPLETED',
            location: {
              label: 'الفرع الرئيسي',
              lat: 24.7136,
              lng: 46.6753
            }
          },
          {
            id: 'stop-2',
            sequence: 2,
            taskTitle: 'تغيير اسطوانات غاز - فرع العليا',
            status: 'PENDING',
            location: {
              label: 'فرع العليا',
              lat: 24.7200,
              lng: 46.6800
            }
          },
          {
            id: 'stop-3',
            sequence: 3,
            taskTitle: 'صيانة - فرع السليمانية',
            status: 'PENDING',
            location: {
              label: 'فرع السليمانية',
              lat: 24.7500,
              lng: 46.7200
            }
          }
        ]
      }
    ];

    StorageEngine.setStored('fleet_vehicles_items', initialVehicles);
    StorageEngine.setStored('fleet_trips_items', initialTrips);
    StorageEngine.setStored('fleet_trip_tracks', []);
  });

  it('1. Correctly calculates geofence arrival proximity (inside vs outside radius)', () => {
    const targetCoord = { lat: 24.7200, lng: 46.6800 }; // Stop 2 location

    // Exact or very close position (within 50 meters)
    const closeCoord = { lat: 24.7203, lng: 46.6802 };
    const closeCheck = FleetBusinessEngine.checkGeofenceArrival(closeCoord, targetCoord, 150);

    expect(closeCheck.isInsideGeofence).toBe(true);
    expect(closeCheck.distanceMeters).toBeLessThanOrEqual(150);
    expect(closeCheck.messageAr).toContain('داخل النطاق الجغرافي');

    // Far position (more than 2 kilometers away)
    const farCoord = { lat: 24.7500, lng: 46.7200 };
    const farCheck = FleetBusinessEngine.checkGeofenceArrival(farCoord, targetCoord, 150);

    expect(farCheck.isInsideGeofence).toBe(false);
    expect(farCheck.distanceMeters).toBeGreaterThan(150);
  });

  it('2. Automatically processes stop arrival when driver enters geofence perimeter', async () => {
    // Ping right at Stop 2 (فرع العليا)
    const arrivingCoord = {
      lat: 24.7201,
      lng: 46.6801,
      accuracy: 10,
      timestamp: '2026-08-18T09:20:00Z'
    };

    const res = await FleetBusinessEngine.autoProcessTripArrivals(
      companyId,
      'trip-p3-01',
      'driver-01',
      arrivingCoord,
      200
    );

    expect(res.newlyArrivedStops.length).toBe(1);
    expect(res.newlyArrivedStops[0].id).toBe('stop-2');
    expect(res.newlyArrivedStops[0].status).toBe('ARRIVED');
    expect(res.newlyArrivedStops[0].arrivedAt).toBe('2026-08-18T09:20:00Z');

    // Verify trip stop 3 is still PENDING
    const updatedTrip = res.trip;
    const stop3 = updatedTrip.stops.find(s => s.id === 'stop-3');
    expect(stop3?.status).toBe('PENDING');
  });

  it('3. Computes comprehensive telemetry analytics (speed, distance, duration, fuel estimation)', async () => {
    // Simulate recording multiple breadcrumbs
    const p1 = { lat: 24.7136, lng: 46.6753, speed: 0, heading: 90, timestamp: '2026-08-18T09:05:00Z' };
    const p2 = { lat: 24.7160, lng: 46.6775, speed: 45, heading: 45, timestamp: '2026-08-18T09:10:00Z' };
    const p3 = { lat: 24.7200, lng: 46.6800, speed: 60, heading: 30, timestamp: '2026-08-18T09:15:00Z' };

    await FleetBusinessEngine.recordTripBreadcrumbPoint(companyId, 'trip-p3-01', 'veh-01', 'driver-01', p1, 0);
    await FleetBusinessEngine.recordTripBreadcrumbPoint(companyId, 'trip-p3-01', 'veh-01', 'driver-01', p2, 0);
    await FleetBusinessEngine.recordTripBreadcrumbPoint(companyId, 'trip-p3-01', 'veh-01', 'driver-01', p3, 0);

    const telemetry = FleetBusinessEngine.analyzeTripTelemetry(companyId, 'trip-p3-01');

    expect(telemetry).not.toBeNull();
    expect(telemetry?.tripId).toBe('trip-p3-01');
    expect(telemetry?.vehicleId).toBe('veh-01');
    expect(telemetry?.totalDistanceKm).toBeGreaterThan(0);
    expect(telemetry?.maxSpeedKmh).toBeGreaterThanOrEqual(60);
    expect(telemetry?.avgMovingSpeedKmh).toBeGreaterThan(0);
    expect(telemetry?.totalDurationMinutes).toBe(10); // 9:05 to 9:15 = 10 minutes
    expect(telemetry?.pointsCount).toBe(3);
    expect(telemetry?.totalStops).toBe(3);
  });

  it('4. Handles track lifecycle correctly (record, retrieve, end track)', async () => {
    const p1 = { lat: 24.7136, lng: 46.6753, speed: 20, heading: 0, timestamp: '2026-08-18T09:05:00Z' };
    await FleetBusinessEngine.recordTripBreadcrumbPoint(companyId, 'trip-p3-01', 'veh-01', 'driver-01', p1, 0);

    let track = FleetBusinessEngine.getTripTrack(companyId, 'trip-p3-01');
    expect(track).not.toBeNull();
    expect(track?.points.length).toBe(1);
    expect(track?.status).toBe('ACTIVE');

    // Complete trip tracking
    await FleetBusinessEngine.endTripTrack(companyId, 'trip-p3-01', 'COMPLETED');

    track = FleetBusinessEngine.getTripTrack(companyId, 'trip-p3-01');
    expect(track?.status).toBe('COMPLETED');
    expect(track?.ended_at).toBeDefined();
  });
});
