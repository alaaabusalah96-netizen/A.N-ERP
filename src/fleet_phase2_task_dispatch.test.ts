import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine } from './db/storage';
import { FleetBusinessEngine } from './lib/enterprise/fleet_engine';
import { Vehicle, Trip } from './types/fleet';

describe('Fleet Module Phase 2: Dynamic In-Field Tasks & Route Stops Reassignment Tests', () => {
  const testCompanyId = 'comp-phase2-test';
  const supervisorId = 'usr-supervisor-1';

  beforeEach(() => {
    StorageEngine.setStored('fleet_trips_items', []);
    StorageEngine.setStored('fleet_vehicles_items', []);
    StorageEngine.setStored('fleet_vehicle_constraints', []);
    StorageEngine.cache = {};

    const vehicles: Vehicle[] = [
      {
        id: 'veh-p2-01',
        company_id: testCompanyId,
        code: 'FLT-201',
        plateNumber: 'أ ب ج 201',
        make: 'Toyota',
        model: 'Hilux',
        year: 2024,
        type: 'PICKUP',
        status: 'ACTIVE',
        odometerReading: 15000,
        fuelCapacity: 80,
        createdAt: '2026-01-01T00:00:00Z'
      },
      {
        id: 'veh-p2-02',
        company_id: testCompanyId,
        code: 'FLT-202',
        plateNumber: 'س ص ع 202',
        make: 'Mercedes',
        model: 'Sprinter',
        year: 2023,
        type: 'VAN',
        status: 'ACTIVE',
        odometerReading: 32000,
        fuelCapacity: 120,
        createdAt: '2026-01-01T00:00:00Z'
      }
    ];

    StorageEngine.setStored('fleet_vehicles_items', vehicles);
  });

  it('1. should dynamically add a new task/stop to an active or draft trip', async () => {
    const trip = await FleetBusinessEngine.createTrip(testCompanyId, supervisorId, {
      vehicle_id: 'veh-p2-01',
      driver_id: 'drv-01',
      tripType: 'توصيل عهدة',
      scheduledAt: '2026-08-18T10:00:00Z',
      stops: [
        { id: 's1', location: { label: 'المستودع الرئيسي' }, taskTitle: 'نقطة الانطلاق' },
        { id: 's2', location: { label: 'فرع المعادي' }, taskTitle: 'تسليم أول' }
      ]
    });

    expect(trip.stops.length).toBe(2);

    // Add 3rd stop on the fly
    const updatedTrip = await FleetBusinessEngine.addStopToTrip(testCompanyId, supervisorId, trip.id, {
      taskTitle: 'بوسطة ومراسلات',
      notes: 'استلام ظرف مستندات من الأستاذ سامح',
      location: { label: 'فرع الدقي' }
    });

    expect(updatedTrip.stops.length).toBe(3);
    const addedStop = updatedTrip.stops[2];
    expect(addedStop.taskTitle).toBe('بوسطة ومراسلات');
    expect(addedStop.notes).toBe('استلام ظرف مستندات من الأستاذ سامح');
    expect(addedStop.location.label).toBe('فرع الدقي');
    expect(addedStop.sequence).toBe(3);
    expect(addedStop.status).toBe('PENDING');
  });

  it('2. should reorder route stops according to supervisor route prioritization', async () => {
    const trip = await FleetBusinessEngine.createTrip(testCompanyId, supervisorId, {
      vehicle_id: 'veh-p2-01',
      driver_id: 'drv-01',
      tripType: 'جولة صيانة وفحص',
      scheduledAt: '2026-08-18T10:00:00Z',
      stops: [
        { id: 'stop-a', location: { label: 'نقطة البداية' }, taskTitle: 'بداية' },
        { id: 'stop-b', location: { label: 'فرع الهرم' }, taskTitle: 'صيانة مكيفات' },
        { id: 'stop-c', location: { label: 'فرع 6 أكتوبر' }, taskTitle: 'فحص مولد' }
      ]
    });

    // Supervisor decides 6th of October has urgent priority over Haram: swap stop-c and stop-b
    const reordered = await FleetBusinessEngine.reorderTripStops(testCompanyId, supervisorId, trip.id, [
      'stop-a',
      'stop-c',
      'stop-b'
    ]);

    expect(reordered.stops[0].id).toBe('stop-a');
    expect(reordered.stops[0].sequence).toBe(1);

    expect(reordered.stops[1].id).toBe('stop-c');
    expect(reordered.stops[1].sequence).toBe(2);
    expect(reordered.stops[1].taskTitle).toBe('فحص مولد');

    expect(reordered.stops[2].id).toBe('stop-b');
    expect(reordered.stops[2].sequence).toBe(3);
  });

  it('3. should skip or cancel an individual stop with reason documentation', async () => {
    const trip = await FleetBusinessEngine.createTrip(testCompanyId, supervisorId, {
      vehicle_id: 'veh-p2-01',
      driver_id: 'drv-01',
      tripType: 'توزيع بضائع',
      scheduledAt: '2026-08-18T10:00:00Z',
      stops: [
        { id: 's-start', location: { label: 'المخزن' }, taskTitle: 'انطلاق' },
        { id: 's-client1', location: { label: 'عميل التجمع' }, taskTitle: 'تسليم شحنة' },
        { id: 's-client2', location: { label: 'عميل الشروق' }, taskTitle: 'تسليم كراتين' }
      ]
    });

    const updated = await FleetBusinessEngine.skipOrCancelStop(
      testCompanyId,
      supervisorId,
      trip.id,
      's-client1',
      'العميل غير متواجد وتم الاتفاق على التأجيل'
    );

    const targetStop = updated.stops.find(s => s.id === 's-client1');
    expect(targetStop?.status).toBe('SKIPPED');
    expect(targetStop?.skippedReason).toBe('العميل غير متواجد وتم الاتفاق على التأجيل');

    // Other stops remain unchanged
    const otherStop = updated.stops.find(s => s.id === 's-client2');
    expect(otherStop?.status).toBe('PENDING');
  });

  it('4. should reassign a single pending stop from one trip to another active trip', async () => {
    // Trip 1 (Driver 1)
    const trip1 = await FleetBusinessEngine.createTrip(testCompanyId, supervisorId, {
      vehicle_id: 'veh-p2-01',
      driver_id: 'drv-01',
      tripType: 'خط سير شرق القاهرة',
      scheduledAt: '2026-08-18T09:00:00Z',
      stops: [
        { id: 't1-s1', location: { label: 'المقر الرئيسي' }, taskTitle: 'انطلاق' },
        { id: 't1-s2', location: { label: 'مدينة نصر' }, taskTitle: 'تسليم أوراق' },
        { id: 't1-s3', location: { label: 'مصر الجديدة' }, taskTitle: 'استبدال اسطوانات غاز' }
      ]
    });

    // Trip 2 (Driver 2)
    const trip2 = await FleetBusinessEngine.createTrip(testCompanyId, supervisorId, {
      vehicle_id: 'veh-p2-02',
      driver_id: 'drv-02',
      tripType: 'خط سير مصر الجديدة',
      scheduledAt: '2026-08-18T09:30:00Z',
      stops: [
        { id: 't2-s1', location: { label: 'المقر الرئيسي' }, taskTitle: 'انطلاق' },
        { id: 't2-s2', location: { label: 'النزهة' }, taskTitle: 'صيانة' }
      ]
    });

    // Reassign t1-s3 (مصر الجديدة) from Trip 1 to Trip 2 (Driver 2 is closer)
    const { sourceTrip, targetTrip } = await FleetBusinessEngine.reassignStopToAnotherTrip(
      testCompanyId,
      supervisorId,
      trip1.id,
      't1-s3',
      trip2.id,
      'السائق الثاني متواجد بالفعل في منطقة مصر الجديدة'
    );

    // Source Trip: stop marked REASSIGNED
    const reassignedStop = sourceTrip.stops.find(s => s.id === 't1-s3');
    expect(reassignedStop?.status).toBe('REASSIGNED');
    expect(reassignedStop?.reassignedToTripId).toBe(trip2.id);

    // Target Trip: received new stop
    expect(targetTrip.stops.length).toBe(3);
    const addedStop = targetTrip.stops[2];
    expect(addedStop.taskTitle).toBe('استبدال اسطوانات غاز');
    expect(addedStop.location.label).toBe('مصر الجديدة');
    expect(addedStop.status).toBe('PENDING');
  });

  it('5. should split a pending stop into a new dedicated trip for another vehicle/driver', async () => {
    const trip = await FleetBusinessEngine.createTrip(testCompanyId, supervisorId, {
      vehicle_id: 'veh-p2-01',
      driver_id: 'drv-01',
      tripType: 'توصيل متعدد',
      scheduledAt: '2026-08-18T08:00:00Z',
      stops: [
        { id: 's1', location: { label: 'المخزن المركزي' }, taskTitle: 'انطلاق' },
        { id: 's2', location: { label: 'فرع الإسكندرية' }, taskTitle: 'تسليم شحنة كبرى', notes: 'شحنة حساسة' }
      ]
    });

    const { sourceTrip, newTrip } = await FleetBusinessEngine.splitStopToNewTrip(
      testCompanyId,
      supervisorId,
      trip.id,
      's2',
      {
        vehicle_id: 'veh-p2-02',
        driver_id: 'drv-02',
        tripType: 'مشوار منفصل: تسليم شحنة كبرى',
        notes: 'تم نقل المهمة للمركبة الفان لسرعة الوصول'
      }
    );

    expect(sourceTrip.stops.find(s => s.id === 's2')?.status).toBe('REASSIGNED');
    expect(newTrip).toBeDefined();
    expect(newTrip.vehicle_id).toBe('veh-p2-02');
    expect(newTrip.driver_id).toBe('drv-02');
    expect(newTrip.stops.length).toBe(2);
    expect(newTrip.stops[1].taskTitle).toBe('تسليم شحنة كبرى');
    expect(newTrip.stops[1].location.label).toBe('فرع الإسكندرية');
  });
});
