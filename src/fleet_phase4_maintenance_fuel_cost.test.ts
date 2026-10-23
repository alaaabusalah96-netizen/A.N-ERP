import { describe, it, expect, beforeEach } from 'vitest';
import { FleetBusinessEngine } from './lib/enterprise/fleet_engine';
import { StorageEngine } from './db/storage';
import { Vehicle, MaintenanceLog, FuelLog } from './types/fleet';

describe('Phase 4: Fleet Maintenance, Fuel & Operating Cost Intelligence', () => {
  const companyId = 'comp-test-phase4';

  beforeEach(() => {
    // Clear storage before each test
    StorageEngine.setStored('fleet_vehicles_items', []);
    StorageEngine.setStored('fleet_maintenance_logs', []);
    StorageEngine.setStored('fleet_fuel_logs', []);
    StorageEngine.setStored('fleet_trips_items', []);
  });

  it('1. Correctly detects OVERDUE and DUE_SOON maintenance alerts based on odometer and thresholds', () => {
    const vehicleOverdue: Vehicle = {
      id: 'veh-overdue-1',
      company_id: companyId,
      code: 'FLT-OVR',
      plateNumber: 'ط ر ق 1111',
      make: 'Toyota',
      model: 'Hilux',
      year: 2023,
      type: 'PICKUP',
      status: 'ACTIVE',
      odometerReading: 5400, // 400 KM past default 5000 KM oil interval
      fuelCapacity: 80,
      maintenanceThresholds: {
        oilChangeIntervalKm: 5000,
        lastOilChangeKm: 0,
        routineIntervalKm: 15000,
        lastRoutineKm: 0
      },
      createdAt: '2026-01-01'
    };

    const vehicleDueSoon: Vehicle = {
      id: 'veh-duesoon-1',
      company_id: companyId,
      code: 'FLT-DUE',
      plateNumber: 'س ي ر 2222',
      make: 'Isuzu',
      model: 'D-Max',
      year: 2023,
      type: 'PICKUP',
      status: 'ACTIVE',
      odometerReading: 4800, // 200 KM remaining (<= 500 KM threshold)
      fuelCapacity: 80,
      maintenanceThresholds: {
        oilChangeIntervalKm: 5000,
        lastOilChangeKm: 0
      },
      createdAt: '2026-01-01'
    };

    const vehicleHealthy: Vehicle = {
      id: 'veh-healthy-1',
      company_id: companyId,
      code: 'FLT-HLT',
      plateNumber: 'ج م ع 3333',
      make: 'Mercedes',
      model: 'Actros',
      year: 2024,
      type: 'TRUCK',
      status: 'ACTIVE',
      odometerReading: 1200, // 3800 KM remaining -> HEALTHY
      fuelCapacity: 300,
      maintenanceThresholds: {
        oilChangeIntervalKm: 5000,
        lastOilChangeKm: 0,
        routineIntervalKm: 20000,
        lastRoutineKm: 0,
        tireIntervalKm: 40000,
        lastTireKm: 0
      },
      createdAt: '2026-01-01'
    };

    StorageEngine.setStored('fleet_vehicles_items', [vehicleOverdue, vehicleDueSoon, vehicleHealthy]);

    const alerts = FleetBusinessEngine.evaluateVehicleMaintenanceAlerts(companyId);

    // Overdue vehicle alert
    const overdueAlert = alerts.find(a => a.vehicleId === 'veh-overdue-1' && a.serviceType === 'OIL_CHANGE');
    expect(overdueAlert).toBeDefined();
    expect(overdueAlert?.urgency).toBe('OVERDUE');
    expect(overdueAlert?.kmRemaining).toBe(-400);

    // Due soon vehicle alert
    const dueSoonAlert = alerts.find(a => a.vehicleId === 'veh-duesoon-1' && a.serviceType === 'OIL_CHANGE');
    expect(dueSoonAlert).toBeDefined();
    expect(dueSoonAlert?.urgency).toBe('DUE_SOON');
    expect(dueSoonAlert?.kmRemaining).toBe(200);

    // Healthy vehicle should have no active alerts
    const healthyAlerts = alerts.filter(a => a.vehicleId === 'veh-healthy-1');
    expect(healthyAlerts.length).toBe(0);
  });

  it('2. Records maintenance log, advances odometer, updates thresholds and clears overdue alerts', async () => {
    const vehicle: Vehicle = {
      id: 'veh-srv-1',
      company_id: companyId,
      code: 'FLT-SRV',
      plateNumber: 'م ع م 4444',
      make: 'Chevrolet',
      model: 'NPR',
      year: 2023,
      type: 'TRUCK',
      status: 'ACTIVE',
      odometerReading: 5500,
      fuelCapacity: 100,
      maintenanceThresholds: {
        oilChangeIntervalKm: 5000,
        lastOilChangeKm: 0
      },
      createdAt: '2026-01-01'
    };

    StorageEngine.setStored('fleet_vehicles_items', [vehicle]);

    // Pre-check: alert should be OVERDUE
    let alerts = FleetBusinessEngine.evaluateVehicleMaintenanceAlerts(companyId, vehicle.id);
    expect(alerts.length).toBe(1);
    expect(alerts[0].urgency).toBe('OVERDUE');

    // Perform oil change service at 5500 KM
    const log = await FleetBusinessEngine.recordVehicleMaintenance(companyId, {
      vehicle_id: vehicle.id,
      type: 'OIL_CHANGE',
      description: 'تغيير زيت تخليقي 5000 كم وفلتر زيت أصلي',
      cost: 1850,
      odometerAtService: 5500,
      providerName: 'مركز خدمة شل المعتمد'
    });

    expect(log.id).toBeDefined();
    expect(log.cost).toBe(1850);
    expect(log.type).toBe('OIL_CHANGE');

    // Check updated vehicle in storage
    const updatedVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const updatedVeh = updatedVehicles.find(v => v.id === vehicle.id);
    expect(updatedVeh?.maintenanceThresholds?.lastOilChangeKm).toBe(5500);

    // Post-check: Alert should now be cleared (next due is 5500 + 5000 = 10500 KM)
    alerts = FleetBusinessEngine.evaluateVehicleMaintenanceAlerts(companyId, vehicle.id);
    expect(alerts.length).toBe(0);
  });

  it('3. Records fuel refill, calculates total cost, and syncs odometer accurately', async () => {
    const vehicle: Vehicle = {
      id: 'veh-fuel-1',
      company_id: companyId,
      code: 'FLT-FUL',
      plateNumber: 'ب ت ر 5555',
      make: 'Nissan',
      model: 'Pickup',
      year: 2023,
      type: 'PICKUP',
      status: 'ACTIVE',
      odometerReading: 8000,
      fuelCapacity: 70,
      createdAt: '2026-01-01'
    };

    StorageEngine.setStored('fleet_vehicles_items', [vehicle]);

    const fuelLog = await FleetBusinessEngine.recordVehicleFuelRefill(companyId, {
      vehicle_id: vehicle.id,
      liters: 60,
      costPerLiter: 15.5,
      odometerReading: 8450
    });

    expect(fuelLog.liters).toBe(60);
    expect(fuelLog.costPerLiter).toBe(15.5);
    expect(fuelLog.totalCost).toBe(930); // 60 * 15.5

    // Check vehicle odometer advancement
    const updatedVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const updatedVeh = updatedVehicles.find(v => v.id === vehicle.id);
    expect(updatedVeh?.odometerReading).toBe(8450);
  });

  it('4. Calculates fleet operating costs, CPK (Cost per KM), and Fuel Economy summary', async () => {
    const vehicle1: Vehicle = {
      id: 'veh-c-1',
      company_id: companyId,
      code: 'FLT-C1',
      plateNumber: 'أ أ أ 1111',
      make: 'Toyota',
      model: 'Hilux',
      year: 2023,
      type: 'PICKUP',
      status: 'ACTIVE',
      odometerReading: 10000,
      fuelCapacity: 80,
      createdAt: '2026-01-01'
    };

    const vehicle2: Vehicle = {
      id: 'veh-c-2',
      company_id: companyId,
      code: 'FLT-C2',
      plateNumber: 'ب ب ب 2222',
      make: 'Isuzu',
      model: 'NPR',
      year: 2023,
      type: 'TRUCK',
      status: 'ACTIVE',
      odometerReading: 20000,
      fuelCapacity: 120,
      createdAt: '2026-01-01'
    };

    StorageEngine.setStored('fleet_vehicles_items', [vehicle1, vehicle2]);

    // Add fuel logs
    await FleetBusinessEngine.recordVehicleFuelRefill(companyId, {
      vehicle_id: vehicle1.id,
      liters: 1000,
      costPerLiter: 15,
      odometerReading: 10000
    }); // Fuel cost = 15,000 EGP

    await FleetBusinessEngine.recordVehicleFuelRefill(companyId, {
      vehicle_id: vehicle2.id,
      liters: 2000,
      costPerLiter: 15,
      odometerReading: 20000
    }); // Fuel cost = 30,000 EGP

    // Add maintenance logs
    await FleetBusinessEngine.recordVehicleMaintenance(companyId, {
      vehicle_id: vehicle1.id,
      type: 'OIL_CHANGE',
      description: 'Oil change',
      cost: 2000,
      odometerAtService: 10000
    });

    await FleetBusinessEngine.recordVehicleMaintenance(companyId, {
      vehicle_id: vehicle2.id,
      type: 'TIRES',
      description: 'Tires replacement',
      cost: 8000,
      odometerAtService: 20000
    });

    const summary = FleetBusinessEngine.calculateFleetCostAnalytics(companyId);

    expect(summary.totalFuelCost).toBe(45000); // 15,000 + 30,000
    expect(summary.totalMaintenanceCost).toBe(10000); // 2,000 + 8,000
    expect(summary.totalOperatingCost).toBe(55000); // 45,000 + 10,000
    expect(summary.totalLitersConsumed).toBe(3000);
    expect(summary.totalDistanceKm).toBe(30000); // 10,000 + 20,000

    // Average Cost Per KM: 55,000 / 30,000 ≈ 1.83 EGP/KM
    expect(summary.averageCostPerKm).toBe(1.83);

    // Average Fuel Efficiency: 30,000 KM / 3,000 L = 10 KM/L
    expect(summary.averageFuelEfficiencyKmPerLiter).toBe(10);
    expect(summary.vehicles.length).toBe(2);
  });

  it('5. Enforces monotonic advancement of odometer readings', async () => {
    const vehicle: Vehicle = {
      id: 'veh-odo-1',
      company_id: companyId,
      code: 'FLT-ODO',
      plateNumber: 'ع د د 9999',
      make: 'Mitsubishi',
      model: 'L200',
      year: 2023,
      type: 'PICKUP',
      status: 'ACTIVE',
      odometerReading: 15000,
      fuelCapacity: 80,
      createdAt: '2026-01-01'
    };

    StorageEngine.setStored('fleet_vehicles_items', [vehicle]);

    // Attempting to sync with a lower odometer should preserve current reading (no rollback)
    const syncedLow = await FleetBusinessEngine.syncVehicleOdometer(companyId, vehicle.id, 12000);
    expect(syncedLow.odometerReading).toBe(15000);

    // Syncing with a higher odometer advances reading
    const syncedHigh = await FleetBusinessEngine.syncVehicleOdometer(companyId, vehicle.id, 16500);
    expect(syncedHigh.odometerReading).toBe(16500);
  });
});
