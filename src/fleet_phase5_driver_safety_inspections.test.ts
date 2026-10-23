import { describe, it, expect, beforeEach } from 'vitest';
import { FleetBusinessEngine } from './lib/enterprise/fleet_engine';
import { StorageEngine } from './db/storage';
import { Vehicle, Trip, VehicleInspectionRecord, InspectionChecklistItem } from './types/fleet';

describe('Phase 5: Digital Vehicle Safety Inspections & Driver Performance Scorecards', () => {
  const companyId = 'comp-test-phase5';

  beforeEach(() => {
    StorageEngine.setStored('fleet_vehicles_items', []);
    StorageEngine.setStored('fleet_trips_items', []);
    StorageEngine.setStored('fleet_inspections_records', []);
  });

  it('1. Submits clean pre-trip inspection and maintains ACTIVE vehicle status', async () => {
    const vehicle: Vehicle = {
      id: 'veh-safe-1',
      company_id: companyId,
      code: 'FLT-001',
      plateNumber: 'س ل م 1234',
      make: 'Toyota',
      model: 'Hilux',
      year: 2024,
      type: 'PICKUP',
      status: 'ACTIVE',
      odometerReading: 12000,
      fuelCapacity: 80,
      createdAt: '2026-01-01'
    };
    StorageEngine.setStored('fleet_vehicles_items', [vehicle]);

    const checklist = FleetBusinessEngine.getDefaultInspectionChecklist();
    expect(checklist.length).toBeGreaterThanOrEqual(8);

    const record = await FleetBusinessEngine.submitVehicleInspection(companyId, {
      vehicle_id: vehicle.id,
      driver_id: 'drv-ahmed',
      driver_name: 'أحمد محمود',
      type: 'PRE_TRIP',
      odometerReading: 12150,
      items: checklist,
      driverNotes: 'المركبة جاهزة ومطابقة للمواصفات',
      driverSignatureName: 'أحمد محمود'
    });

    expect(record.id).toBeDefined();
    expect(record.status).toBe('PASSED');
    expect(record.criticalDefectsFound).toBe(0);
    expect(record.minorDefectsFound).toBe(0);
    expect(record.supervisorReviewStatus).toBe('APPROVED');

    // Vehicle odometer advanced and status remains ACTIVE
    const storedVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const storedVeh = storedVehicles.find(v => v.id === vehicle.id);
    expect(storedVeh?.odometerReading).toBe(12150);
    expect(storedVeh?.status).toBe('ACTIVE');
  });

  it('2. Automatically grounds vehicle to MAINTENANCE upon detecting a critical defect during inspection', async () => {
    const vehicle: Vehicle = {
      id: 'veh-hazard-1',
      company_id: companyId,
      code: 'FLT-002',
      plateNumber: 'خ ط ر 5678',
      make: 'Isuzu',
      model: 'NPR',
      year: 2023,
      type: 'TRUCK',
      status: 'ACTIVE',
      odometerReading: 35000,
      fuelCapacity: 120,
      createdAt: '2026-01-01'
    };
    StorageEngine.setStored('fleet_vehicles_items', [vehicle]);

    const checklist = FleetBusinessEngine.getDefaultInspectionChecklist();
    // Simulate critical brake failure
    const brakeItem = checklist.find(i => i.key === 'BRAKES');
    if (brakeItem) {
      brakeItem.status = 'DEFECT_CRITICAL';
      brakeItem.notes = 'تسريب زيت فرامل واستجابة ضعيفة جداً للدواسة';
    }

    const record = await FleetBusinessEngine.submitVehicleInspection(companyId, {
      vehicle_id: vehicle.id,
      driver_id: 'drv-mohamed',
      driver_name: 'محمد علي',
      type: 'PRE_TRIP',
      odometerReading: 35000,
      items: checklist,
      driverNotes: 'يوجد عطل فرامل حرج تم إيقاف المركبة فوراً',
      driverSignatureName: 'محمد علي'
    });

    expect(record.status).toBe('FAILED_CRITICAL');
    expect(record.criticalDefectsFound).toBe(1);
    expect(record.supervisorReviewStatus).toBe('PENDING_REVIEW');

    // Vehicle must automatically transition to MAINTENANCE
    const storedVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const storedVeh = storedVehicles.find(v => v.id === vehicle.id);
    expect(storedVeh?.status).toBe('MAINTENANCE');
  });

  it('3. Supervisor reviews and signs off critical inspection, restoring vehicle to ACTIVE', async () => {
    const vehicle: Vehicle = {
      id: 'veh-rev-1',
      company_id: companyId,
      code: 'FLT-003',
      plateNumber: 'ص ح ح 9999',
      make: 'Mercedes',
      model: 'Actros',
      year: 2023,
      type: 'TRUCK',
      status: 'MAINTENANCE',
      odometerReading: 40000,
      fuelCapacity: 300,
      createdAt: '2026-01-01'
    };
    StorageEngine.setStored('fleet_vehicles_items', [vehicle]);

    const checklist = FleetBusinessEngine.getDefaultInspectionChecklist();
    const brakeItem = checklist.find(i => i.key === 'BRAKES');
    if (brakeItem) brakeItem.status = 'DEFECT_CRITICAL';

    const record = await FleetBusinessEngine.submitVehicleInspection(companyId, {
      vehicle_id: vehicle.id,
      driver_id: 'drv-khaled',
      type: 'PRE_TRIP',
      odometerReading: 40000,
      items: checklist,
      driverSignatureName: 'خالد السيد'
    });

    expect(record.supervisorReviewStatus).toBe('PENDING_REVIEW');

    // Supervisor sign-off & repair verification
    const reviewed = await FleetBusinessEngine.reviewVehicleInspection(
      companyId,
      record.id,
      'sup-manager-1',
      'APPROVED',
      'تم تغيير تيل الفرامل وخراطيم الزيت بالورشة والتجربة بنجاح',
      true // restore to ACTIVE
    );

    expect(reviewed.supervisorReviewStatus).toBe('APPROVED');
    expect(reviewed.reviewedBy).toBe('sup-manager-1');

    // Check vehicle status is now restored to ACTIVE
    const storedVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const storedVeh = storedVehicles.find(v => v.id === vehicle.id);
    expect(storedVeh?.status).toBe('ACTIVE');
  });

  it('4. Computes driver scorecard metrics, safety scores, and tier ratings accurately', async () => {
    const driverId = 'drv-top-performer';
    const driverName = 'ياسر إبراهيم';

    // Seed trips with completed stops
    const trips: any[] = [
      {
        id: 'trp-1',
        company_id: companyId,
        trip_number: 'TRP-101',
        vehicle_id: 'veh-1',
        driver_id: driverId,
        tripType: 'GENERAL',
        scheduledAt: '2026-08-10',
        createdBy: 'usr-1',
        start_location: 'مستودع القاهرة',
        end_location: 'فرع الإسكندرية',
        status: 'COMPLETED',
        stops: [
          { id: 'stp-1', sequence: 1, location: { label: 'نقطة 1' }, status: 'COMPLETED' },
          { id: 'stp-2', sequence: 2, location: { label: 'نقطة 2' }, status: 'COMPLETED' }
        ],
        telemetry: { totalDistanceKm: 220, recordedPointsCount: 20 },
        createdAt: '2026-08-10'
      },
      {
        id: 'trp-2',
        company_id: companyId,
        trip_number: 'TRP-102',
        vehicle_id: 'veh-1',
        driver_id: driverId,
        tripType: 'GENERAL',
        scheduledAt: '2026-08-12',
        createdBy: 'usr-1',
        start_location: 'مستودع القاهرة',
        end_location: 'فرع طنطا',
        status: 'COMPLETED',
        stops: [
          { id: 'stp-3', sequence: 1, location: { label: 'نقطة 3' }, status: 'COMPLETED' },
          { id: 'stp-4', sequence: 2, location: { label: 'نقطة 4' }, status: 'COMPLETED' }
        ],
        telemetry: { totalDistanceKm: 110, recordedPointsCount: 15 },
        createdAt: '2026-08-12'
      }
    ];
    StorageEngine.setStored('fleet_trips_items', trips);

    // Seed passed inspections
    const inspection: VehicleInspectionRecord = {
      id: 'insp-1',
      company_id: companyId,
      vehicle_id: 'veh-1',
      driver_id: driverId,
      driver_name: driverName,
      type: 'PRE_TRIP',
      status: 'PASSED',
      odometerReading: 15000,
      items: FleetBusinessEngine.getDefaultInspectionChecklist(),
      criticalDefectsFound: 0,
      minorDefectsFound: 0,
      driverSignatureName: driverName,
      createdAt: '2026-08-10'
    };
    StorageEngine.setStored('fleet_inspections_records', [inspection]);

    const scorecard = FleetBusinessEngine.calculateDriverScorecard(companyId, driverId, driverName);

    expect(scorecard.driverId).toBe(driverId);
    expect(scorecard.totalTrips).toBe(2);
    expect(scorecard.completedTrips).toBe(2);
    expect(scorecard.totalStopsAssigned).toBe(4);
    expect(scorecard.completedStops).toBe(4);
    expect(scorecard.stopCompletionRate).toBe(100);
    expect(scorecard.inspectionsCompleted).toBe(1);
    expect(scorecard.inspectionsPassedRate).toBe(100);
    expect(scorecard.totalDistanceDrivenKm).toBe(330);
    expect(scorecard.safetyScore).toBeGreaterThanOrEqual(90);
    expect(scorecard.tierRating).toBe('EXCELLENT');
    expect(scorecard.ratingStars).toBe(5);
  });

  it('5. Generates fleet-wide driver performance summary and leaderboards', () => {
    const trips: any[] = [
      {
        id: 'trp-a',
        company_id: companyId,
        trip_number: 'TRP-201',
        vehicle_id: 'veh-1',
        driver_id: 'drv-a',
        tripType: 'GENERAL',
        scheduledAt: '2026-08-15',
        createdBy: 'usr-1',
        start_location: 'القاهرة',
        end_location: 'الجيزة',
        status: 'COMPLETED',
        stops: [{ id: 's1', sequence: 1, location: { label: 'نقطة أ' }, status: 'COMPLETED' }],
        createdAt: '2026-08-15'
      },
      {
        id: 'trp-b',
        company_id: companyId,
        trip_number: 'TRP-202',
        vehicle_id: 'veh-2',
        driver_id: 'drv-b',
        tripType: 'GENERAL',
        scheduledAt: '2026-08-15',
        createdBy: 'usr-1',
        start_location: 'القاهرة',
        end_location: 'السويس',
        status: 'SUSPENDED_BREAKDOWN',
        stops: [
          { id: 's2', sequence: 1, location: { label: 'نقطة ب' }, status: 'SKIPPED' }
        ],
        createdAt: '2026-08-15'
      }
    ];
    StorageEngine.setStored('fleet_trips_items', trips);

    const summary = FleetBusinessEngine.getFleetDriverPerformanceSummary(companyId);

    expect(summary.totalDrivers).toBe(2);
    expect(summary.driverScorecards.length).toBe(2);
    // Highest score driver is ranked first in leaderboard
    expect(summary.driverScorecards[0].driverId).toBe('drv-a');
    expect(summary.driverScorecards[0].safetyScore).toBeGreaterThan(summary.driverScorecards[1].safetyScore);
  });
});
