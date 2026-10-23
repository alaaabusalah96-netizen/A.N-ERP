import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine } from './db/storage';
import { FleetBusinessEngine } from './lib/enterprise/fleet_engine';
import { Vehicle, Trip } from './types/fleet';
import { UsersModule } from './db/users';

describe('Fleet Module Phase 1: Daily Operations Dashboard & Conflict Override Tests', () => {
  const testCompanyId = 'company-test-phase1';
  const todayDateStr = '2026-08-18';

  beforeEach(() => {
    StorageEngine.setStored('fleet_trips_items', []);
    StorageEngine.setStored('fleet_vehicles_items', []);
    StorageEngine.cache = {};

    // Seed mock vehicles in different states
    const vehicles: Vehicle[] = [
      {
        id: 'veh-01',
        company_id: testCompanyId,
        code: 'FLT-01',
        plateNumber: 'أ ب ج 101',
        make: 'Toyota',
        model: 'Hilux',
        year: 2024,
        type: 'PICKUP',
        status: 'ACTIVE',
        odometerReading: 12000,
        fuelCapacity: 80,
        createdAt: '2026-01-01T00:00:00Z'
      },
      {
        id: 'veh-02',
        company_id: testCompanyId,
        code: 'FLT-02',
        plateNumber: 'س ص ع 202',
        make: 'Mercedes',
        model: 'Actros',
        year: 2023,
        type: 'TRUCK',
        status: 'DISPATCHED',
        odometerReading: 45000,
        fuelCapacity: 400,
        createdAt: '2026-01-01T00:00:00Z'
      },
      {
        id: 'veh-03',
        company_id: testCompanyId,
        code: 'FLT-03',
        plateNumber: 'د ذ ر 303',
        make: 'Isuzu',
        model: 'NPR',
        year: 2022,
        type: 'VAN',
        status: 'BREAKDOWN',
        odometerReading: 38000,
        fuelCapacity: 100,
        createdAt: '2026-01-01T00:00:00Z'
      },
      {
        id: 'veh-04',
        company_id: testCompanyId,
        code: 'FLT-04',
        plateNumber: 'ط ظ ع 404',
        make: 'Mitsubishi',
        model: 'Canter',
        year: 2021,
        type: 'TRUCK',
        status: 'MAINTENANCE',
        odometerReading: 95000,
        fuelCapacity: 120,
        createdAt: '2026-01-01T00:00:00Z'
      }
    ];

    StorageEngine.setStored('fleet_vehicles_items', vehicles);
  });

  it('1. should accurately aggregate vehicle statuses in the daily operations summary (Available, In-Trip, Breakdown, Out-of-Service)', () => {
    const summary = FleetBusinessEngine.getDailyOperationsSummary(testCompanyId, todayDateStr);

    expect(summary.vehicles.total).toBe(4);
    expect(summary.vehicles.available).toBe(1); // veh-01 (ACTIVE)
    expect(summary.vehicles.inTrip).toBe(1);    // veh-02 (DISPATCHED)
    expect(summary.vehicles.breakdown).toBe(1); // veh-03 (BREAKDOWN)
    expect(summary.vehicles.outOfService).toBe(1); // veh-04 (MAINTENANCE)

    expect(summary.vehicles.availableVehicles[0].code).toBe('FLT-01');
    expect(summary.vehicles.inTripVehicles[0].code).toBe('FLT-02');
    expect(summary.vehicles.breakdownVehicles[0].code).toBe('FLT-03');
    expect(summary.vehicles.outOfServiceVehicles[0].code).toBe('FLT-04');
  });

  it('2. should detect operational conflicts for same destination on the same day', async () => {
    // 1st trip: scheduled today to Maadi Branch
    await FleetBusinessEngine.createTrip(testCompanyId, 'supervisor-1', {
      vehicle_id: 'veh-01',
      driver_id: 'drv-01',
      tripType: 'توصيل عهدة',
      scheduledAt: `${todayDateStr}T09:00:00Z`,
      stops: [
        { id: 's1', location: { org_unit_id: 'org-hub', label: 'المستودع الرئيسي' } },
        { id: 's2', location: { org_unit_id: 'org-maadi', label: 'فرع المعادي' }, taskTitle: 'تسليم شحنة' }
      ]
    });

    // 2nd candidate trip: same day to same Maadi Branch with vehicle 2
    const conflicts = FleetBusinessEngine.detectTripConflicts(testCompanyId, {
      vehicle_id: 'veh-02',
      driver_id: 'drv-02',
      tripType: 'صيانة دورية',
      scheduledAt: `${todayDateStr}T14:00:00Z`,
      stops: [
        { location: { org_unit_id: 'org-hub', label: 'المستودع الرئيسي' } },
        { location: { org_unit_id: 'org-maadi', label: 'فرع المعادي' }, taskTitle: 'فحص الموقع' }
      ]
    });

    expect(conflicts.length).toBeGreaterThan(0);
    const destConflict = conflicts.find(c => c.conflictType === 'SAME_DESTINATION' && c.destinationOrgUnitId === 'org-maadi');
    expect(destConflict).toBeDefined();
    expect(destConflict?.destinationOrgUnitId).toBe('org-maadi');
    expect(destConflict?.messageAr).toContain('متجهة لنفس الوجهة');
  });

  it('3. should detect operational conflicts for same specific task type on the same day', async () => {
    // 1st trip: Post & Mail task today
    await FleetBusinessEngine.createTrip(testCompanyId, 'supervisor-1', {
      vehicle_id: 'veh-01',
      driver_id: 'drv-01',
      tripType: 'بوسطة ومراسلات',
      scheduledAt: `${todayDateStr}T08:30:00Z`,
      stops: [
        { id: 's1', location: { label: 'المقر الرئيسي' } },
        { id: 's2', location: { label: 'بريد الأهرام' }, taskTitle: 'بوسطة ومراسلات' }
      ]
    });

    // 2nd trip: same task type on same day
    const conflicts = FleetBusinessEngine.detectTripConflicts(testCompanyId, {
      vehicle_id: 'veh-02',
      driver_id: 'drv-02',
      tripType: 'بوسطة ومراسلات',
      scheduledAt: `${todayDateStr}T11:00:00Z`,
      stops: [
        { location: { label: 'المقر الرئيسي' } },
        { location: { label: 'بريد الدقي' }, taskTitle: 'بوسطة ومراسلات' }
      ]
    });

    expect(conflicts.length).toBeGreaterThan(0);
    const taskConflict = conflicts.find(c => c.conflictType === 'SAME_TASK_TYPE');
    expect(taskConflict).toBeDefined();
    expect(taskConflict?.messageAr).toContain('بنفس نوع المهمة');
  });

  it('4. should allow supervisor to proceed with conflict override and properly log decision and details', async () => {
    // Existing trip
    const existingTrip = await FleetBusinessEngine.createTrip(testCompanyId, 'supervisor-1', {
      vehicle_id: 'veh-01',
      driver_id: 'drv-01',
      tripType: 'نقل مواد',
      scheduledAt: `${todayDateStr}T09:00:00Z`,
      stops: [
        { id: 's1', location: { org_unit_id: 'org-hub', label: 'المستودع الرئيسي' } },
        { id: 's2', location: { org_unit_id: 'org-nasr', label: 'فرع مدينة نصر' } }
      ]
    });

    // Supervisor manually overrides conflict for second urgent trip
    const newTripWithOverride = await FleetBusinessEngine.createTrip(testCompanyId, 'supervisor-1', {
      vehicle_id: 'veh-02',
      driver_id: 'drv-02',
      tripType: 'نقل مواد إضافية',
      scheduledAt: `${todayDateStr}T10:00:00Z`,
      stops: [
        { id: 's1', location: { org_unit_id: 'org-hub', label: 'المستودع الرئيسي' } },
        { id: 's2', location: { org_unit_id: 'org-nasr', label: 'فرع مدينة نصر' } }
      ],
      ...({
        conflictOverride: {
          overridden: true,
          overriddenBy: 'supervisor-1',
          overriddenByName: 'مشرف التشغيل الأول',
          reason: 'حاجة عمل طارئة لنقل دفعة ثانية من التوريدات لنفس الفرع',
          timestamp: new Date().toISOString(),
          conflictingTripIds: [existingTrip.id],
          conflictSummary: 'تعارض نفس الوجهة: فرع مدينة نصر'
        }
      } as any)
    });

    expect(newTripWithOverride.status).toBe('DRAFT');
    expect(newTripWithOverride.conflictOverride?.overridden).toBe(true);
    expect(newTripWithOverride.conflictOverride?.reason).toContain('حاجة عمل طارئة');
    expect(newTripWithOverride.conflictOverride?.conflictingTripIds).toContain(existingTrip.id);

    // Verify summary includes both trips and detects conflict status
    const summary = FleetBusinessEngine.getDailyOperationsSummary(testCompanyId, todayDateStr);
    expect(summary.openTrips.length).toBe(2);
    expect(summary.conflictedTrips.length).toBeGreaterThan(0);
  });

  it('5. should identify unregistered/not started drivers and delayed trips in daily operations summary', async () => {
    // Create an unstarted trip scheduled for today
    await FleetBusinessEngine.createTrip(testCompanyId, 'supervisor-1', {
      vehicle_id: 'veh-01',
      driver_id: 'drv-01',
      tripType: 'توصيل صباحي',
      scheduledAt: `${todayDateStr}T07:00:00Z`,
      stops: [
        { id: 's1', location: { label: 'المقر' } },
        { id: 's2', location: { label: 'الفرع' } }
      ]
    });

    const summary = FleetBusinessEngine.getDailyOperationsSummary(testCompanyId, todayDateStr);

    expect(summary.delayedOrNotStartedTrips.length).toBe(1);
    expect(summary.unregisteredDrivers.length).toBe(1);
    expect(summary.unregisteredDrivers[0].driverId).toBe('drv-01');
  });
});
