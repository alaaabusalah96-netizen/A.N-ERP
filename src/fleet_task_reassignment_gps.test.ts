import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine } from './db/storage';
import { FleetBusinessEngine } from './lib/enterprise/fleet_engine';
import { Vehicle } from './types/fleet';

describe('Fleet Task-Oriented Trips & Smart Breakdown Reassignment Tests', () => {
  const companyId = 'comp-egypt-transport';

  beforeEach(() => {
    StorageEngine.setStored('fleet_vehicles_items', []);
    StorageEngine.setStored('fleet_trips_items', []);
    StorageEngine.cache = {};
  });

  it('1. should create task-oriented trips where office enters tasks without coordinates', async () => {
    const trip = await FleetBusinessEngine.createTrip(companyId, 'office-user-1', {
      vehicle_id: 'veh-truck-1',
      driver_id: 'driver-ahmed',
      tripType: 'مهام ميدانية ونقل',
      scheduledAt: '2026-08-20T08:00:00Z',
      notes: 'مشوار دوري للمكاتب والفروع',
      stops: [
        {
          id: 'stop-post',
          sequence: 1,
          taskTitle: 'بوسطة',
          notes: 'تسليم واستلام الطرود البريدية',
          location: { label: 'مكتب بريد الدقي' },
          status: 'PENDING'
        },
        {
          id: 'stop-gas',
          sequence: 2,
          taskTitle: 'تغيير اسطوانات غاز / أنابيب',
          notes: 'استبدال أنبوبتين في فرع المعادي',
          location: { label: 'فرع المعادي' },
          status: 'PENDING'
        },
        {
          id: 'stop-maint',
          sequence: 3,
          taskTitle: 'صيانة',
          notes: 'إصلاح طابعة الاستقبال',
          location: { label: 'فرع مدينة نصر' },
          status: 'PENDING'
        }
      ]
    });

    expect(trip.status).toBe('DRAFT');
    expect(trip.stops).toHaveLength(3);
    expect(trip.stops[0].taskTitle).toBe('بوسطة');
    expect(trip.stops[1].taskTitle).toBe('تغيير اسطوانات غاز / أنابيب');
    expect(trip.stops[0].location.lat).toBeUndefined(); // Office does not need to know coordinates
  });

  it('2. should start trip and record driver initial GPS coordinates', async () => {
    const vehicle: Vehicle = {
      id: 'veh-truck-1',
      company_id: companyId,
      code: 'VH-001',
      plateNumber: 'ط ر ق 1234',
      type: 'TRUCK',
      make: 'Mercedes',
      model: 'Actros',
      year: 2024,
      status: 'ACTIVE',
      odometerReading: 10000,
      fuelCapacity: 300,
      createdAt: new Date().toISOString()
    };
    StorageEngine.setStored('fleet_vehicles_items', [vehicle]);

    const trip = await FleetBusinessEngine.createTrip(companyId, 'office-user-1', {
      vehicle_id: 'veh-truck-1',
      driver_id: 'driver-ahmed',
      tripType: 'بوسطة وصيانة',
      scheduledAt: '2026-08-20T08:00:00Z',
      stops: [
        { id: 's1', sequence: 1, taskTitle: 'نقطة الانطلاق', location: { label: 'المخزن الرئيسي' }, status: 'PENDING' },
        { id: 's2', sequence: 2, taskTitle: 'تسليم فواتير', location: { label: 'فرع التجمع' }, status: 'PENDING' }
      ]
    });

    // Driver starts trip with current GPS location (Cairo coordinates)
    const started = await FleetBusinessEngine.startTrip(
      companyId,
      'driver-ahmed',
      trip.id,
      { lat: 30.0444, lng: 31.2357, label: 'المخزن الرئيسي - وسط البلد' }
    );

    expect(started.status).toBe('DISPATCHED');
    expect(started.startedAt).toBeDefined();

    // Verify vehicle status is updated to DISPATCHED and last known location recorded
    const updatedVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const updatedVeh = updatedVehicles.find(v => v.id === 'veh-truck-1');
    expect(updatedVeh?.status).toBe('DISPATCHED');
    expect(updatedVeh?.last_known_location?.lat).toBe(30.0444);
    expect(updatedVeh?.last_known_location?.lng).toBe(31.2357);
  });

  it('3. should record stop arrival when driver arrives at task location with GPS', async () => {
    const vehicle: Vehicle = {
      id: 'veh-truck-1',
      company_id: companyId,
      code: 'VH-001',
      plateNumber: 'ط ر ق 1234',
      type: 'TRUCK',
      make: 'Mercedes',
      model: 'Actros',
      year: 2024,
      status: 'ACTIVE',
      odometerReading: 10000,
      fuelCapacity: 300,
      createdAt: new Date().toISOString()
    };
    StorageEngine.setStored('fleet_vehicles_items', [vehicle]);

    const trip = await FleetBusinessEngine.createTrip(companyId, 'office-user-1', {
      vehicle_id: 'veh-truck-1',
      driver_id: 'driver-ahmed',
      tripType: 'توزيع أنابيب',
      scheduledAt: '2026-08-20T08:00:00Z',
      stops: [
        { id: 's1', sequence: 1, taskTitle: 'تعبئة أسطوانات', location: { label: 'المستودع' }, status: 'PENDING' },
        { id: 's2', sequence: 2, taskTitle: 'تغيير اسطوانات غاز', location: { label: 'فرع الهرم' }, status: 'PENDING' }
      ]
    });

    await FleetBusinessEngine.startTrip(
      companyId,
      'driver-ahmed',
      trip.id,
      { lat: 30.044, lng: 31.235, label: 'بداية المشوار' }
    );

    // Driver arrives at stop 2 in Al-Haram (Giza coordinates)
    const result = await FleetBusinessEngine.recordStopArrival(
      companyId,
      'driver-ahmed',
      trip.id,
      's2',
      { lat: 29.987, lng: 31.134, label: 'أمام فرع الهرم' }
    );

    const stop2 = result.trip.stops.find(s => s.id === 's2');
    expect(stop2?.status).toBe('ARRIVED');
    expect(stop2?.arrivedLocation?.lat).toBe(29.987);
    expect(stop2?.arrivedLocation?.lng).toBe(31.134);
    expect(stop2?.arrivedAt).toBeDefined();

    // Vehicle location is updated to the arrived stop coordinates
    const vehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const veh = vehicles.find(v => v.id === 'veh-truck-1');
    expect(veh?.last_known_location?.lat).toBe(29.987);
  });

  it('4. should calculate distance and suggest nearest available vehicle upon breakdown', async () => {
    // 3 Vehicles in different locations:
    // Breakdown Vehicle at Dokki (30.038, 31.211)
    const brokenVehicle: Vehicle = {
      id: 'veh-broken',
      company_id: companyId,
      code: 'VH-BROKEN',
      plateNumber: 'ب ر ك 1111',
      type: 'VAN',
      make: 'Toyota',
      model: 'HiAce',
      year: 2022,
      status: 'DISPATCHED',
      odometerReading: 50000,
      fuelCapacity: 70,
      last_known_location: { lat: 30.038, lng: 31.211, label: 'الدقي - معطلة', updatedAt: new Date().toISOString() },
      createdAt: new Date().toISOString()
    };

    // Candidate 1: Mohandessin (30.055, 31.200) -> approx 2.2 km away
    const nearVehicle: Vehicle = {
      id: 'veh-near',
      company_id: companyId,
      code: 'VH-NEAR',
      plateNumber: 'ق ر ب 2222',
      type: 'VAN',
      make: 'Toyota',
      model: 'HiAce',
      year: 2023,
      status: 'ACTIVE',
      driverName: 'محمود (سائق متاح)',
      odometerReading: 30000,
      fuelCapacity: 70,
      last_known_location: { lat: 30.055, lng: 31.200, label: 'المهندسين', updatedAt: new Date().toISOString() },
      createdAt: new Date().toISOString()
    };

    // Candidate 2: New Cairo (30.015, 31.490) -> approx 28 km away
    const farVehicle: Vehicle = {
      id: 'veh-far',
      company_id: companyId,
      code: 'VH-FAR',
      plateNumber: 'ب ع د 3333',
      type: 'VAN',
      make: 'Nissan',
      model: 'Urvan',
      year: 2021,
      status: 'ACTIVE',
      driverName: 'سامح',
      odometerReading: 60000,
      fuelCapacity: 70,
      last_known_location: { lat: 30.015, lng: 31.490, label: 'التجمع الخامس', updatedAt: new Date().toISOString() },
      createdAt: new Date().toISOString()
    };

    StorageEngine.setStored('fleet_vehicles_items', [brokenVehicle, nearVehicle, farVehicle]);

    // Active trip with pending tasks assigned to brokenVehicle
    const trip = await FleetBusinessEngine.createTrip(companyId, 'office-user-1', {
      vehicle_id: 'veh-broken',
      driver_id: 'driver-broke',
      tripType: 'تغيير اسطوانات وبوسطة',
      scheduledAt: '2026-08-20T08:00:00Z',
      stops: [
        { id: 's1', sequence: 1, taskTitle: 'بوسطة', location: { label: 'الدقي', lat: 30.038, lng: 31.211 }, status: 'ARRIVED' },
        { id: 's2', sequence: 2, taskTitle: 'تغيير اسطوانات غاز', location: { label: 'العجوزة', lat: 30.060, lng: 31.215 }, status: 'PENDING' }
      ]
    });

    // Mark broken vehicle status as BREAKDOWN
    const result = await FleetBusinessEngine.updateVehicleStatus(
      companyId,
      'admin-1',
      'veh-broken',
      'BREAKDOWN',
      'عطل مفاجئ في الموتور بمنطقة الدقي'
    );

    expect(result.affectedTrips).toHaveLength(1);
    expect(result.affectedTrips[0].id).toBe(trip.id);

    // Target coordinates: the breakdown vehicle position
    const targetCoords = { lat: 30.038, lng: 31.211 };

    // Get suggestions for nearest vehicles to pick up the remaining tasks
    const suggestions = FleetBusinessEngine.suggestNearestVehiclesForTasks(
      companyId,
      targetCoords,
      'veh-broken'
    );

    expect(suggestions.length).toBeGreaterThan(0);
    // Nearest vehicle must be veh-near (< 3km) rather than veh-far (> 25km) to save fuel & time
    expect(suggestions[0].vehicle.id).toBe('veh-near');
    expect(suggestions[0].distanceKm).toBeLessThan(5);
    expect(suggestions[1].vehicle.id).toBe('veh-far');
    expect(suggestions[1].distanceKm).toBeGreaterThan(20);
  });

  it('5. should reassign trip from broken vehicle to selected replacement vehicle', async () => {
    const brokenVehicle: Vehicle = {
      id: 'veh-broken-2',
      company_id: companyId,
      code: 'VH-B2',
      plateNumber: 'أ ب ج 9999',
      type: 'TRUCK',
      make: 'Mercedes',
      model: 'Actros',
      year: 2020,
      status: 'BREAKDOWN',
      odometerReading: 120000,
      fuelCapacity: 300,
      createdAt: new Date().toISOString()
    };

    const replacementVehicle: Vehicle = {
      id: 'veh-replace',
      company_id: companyId,
      code: 'VH-REP',
      plateNumber: 'س ع د 8888',
      type: 'TRUCK',
      make: 'Volvo',
      model: 'FH',
      year: 2023,
      status: 'ACTIVE',
      driverName: 'كريم',
      odometerReading: 40000,
      fuelCapacity: 300,
      createdAt: new Date().toISOString()
    };

    StorageEngine.setStored('fleet_vehicles_items', [brokenVehicle, replacementVehicle]);

    const trip = await FleetBusinessEngine.createTrip(companyId, 'office-user-1', {
      vehicle_id: 'veh-broken-2',
      driver_id: 'driver-old',
      tripType: 'صيانة ومعدات',
      scheduledAt: '2026-08-20T08:00:00Z',
      stops: [
        { id: 's1', sequence: 1, taskTitle: 'نقل قطع غيار', location: { label: 'مستودع 1' }, status: 'PENDING' },
        { id: 's2', sequence: 2, taskTitle: 'صيانة محطة', location: { label: 'محطة أكتوبر' }, status: 'PENDING' }
      ]
    });

    const reassignedTrip = await FleetBusinessEngine.reassignTripVehicle(
      companyId,
      'admin-1',
      trip.id,
      'veh-replace',
      'driver-new',
      'تحويل المهام بسبب عطل المركبة الأصلية'
    );

    expect(reassignedTrip.vehicle_id).toBe('veh-replace');
    expect(reassignedTrip.driver_id).toBe('driver-new');
    expect(reassignedTrip.reassignedFromVehicleId).toBe('veh-broken-2');
    expect(reassignedTrip.reassignReason).toContain('عطل المركبة الأصلية');

    // Confirm that open trips for broken vehicle is now empty
    const openTripsForBroken = FleetBusinessEngine.getOpenTripsForVehicle(companyId, 'veh-broken-2');
    expect(openTripsForBroken).toHaveLength(0);

    // Confirm open trips for replacement vehicle now includes the reassigned trip
    const openTripsForRep = FleetBusinessEngine.getOpenTripsForVehicle(companyId, 'veh-replace');
    expect(openTripsForRep).toHaveLength(1);
    expect(openTripsForRep[0].id).toBe(trip.id);
  });
});
