import { describe, it, expect, beforeEach } from 'vitest';
import { FleetBusinessEngine } from './lib/enterprise/fleet_engine';
import { StorageEngine } from './db/storage';
import { Vehicle } from './types/fleet';

describe('Phase 5: Fleet Safe Writes, Error Resilience & Maintenance/Fuel Integrity', () => {
  const companyId = 'comp-fleet-phase5';

  beforeEach(() => {
    StorageEngine.setStored('fleet_vehicles_items', []);
    StorageEngine.setStored('fleet_maintenance_logs', []);
    StorageEngine.setStored('fleet_fuel_logs', []);
    StorageEngine.setStored('fleet_trips_items', []);
  });

  it('1. Successfully logs maintenance and updates vehicle odometer and thresholds', async () => {
    const testVeh: Vehicle = {
      id: 'veh-p5-1',
      company_id: companyId,
      code: 'FLT-P5-01',
      plateNumber: 'أ ب ج 5555',
      make: 'Mercedes',
      model: 'Actros',
      year: 2024,
      type: 'TRUCK',
      status: 'ACTIVE',
      odometerReading: 12000,
      fuelCapacity: 300,
      maintenanceThresholds: {
        oilChangeIntervalKm: 5000,
        lastOilChangeKm: 10000
      },
      createdAt: '2026-01-01'
    };

    StorageEngine.setStored('fleet_vehicles_items', [testVeh]);

    const log = await FleetBusinessEngine.logMaintenance(companyId, 'user-admin', {
      vehicle_id: testVeh.id,
      maintenanceDate: '2026-08-31',
      type: 'OIL_CHANGE',
      description: 'تغيير زيت وفلتر 10,000 كم',
      cost: 2500,
      providerName: 'ورشة السلام المعتمدة',
      odometerAtService: 15500
    });

    expect(log).toBeDefined();
    expect(log.cost).toBe(2500);
    expect(log.odometerAtService).toBe(15500);

    const updatedVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const updated = updatedVehicles.find(v => v.id === testVeh.id);
    expect(updated?.odometerReading).toBe(15500);
    expect(updated?.maintenanceThresholds?.lastOilChangeKm).toBe(15500);
  });

  it('2. Successfully logs fuel refill and updates vehicle odometer', async () => {
    const testVeh: Vehicle = {
      id: 'veh-p5-2',
      company_id: companyId,
      code: 'FLT-P5-02',
      plateNumber: 'د هـ و 6666',
      make: 'Volvo',
      model: 'FH',
      year: 2023,
      type: 'TRUCK',
      status: 'ACTIVE',
      odometerReading: 45000,
      fuelCapacity: 400,
      createdAt: '2026-01-01'
    };

    StorageEngine.setStored('fleet_vehicles_items', [testVeh]);

    const fuelLog = await FleetBusinessEngine.logFuel(companyId, 'user-admin', {
      vehicle_id: testVeh.id,
      logDate: '2026-08-31',
      liters: 150,
      costPerLiter: 15,
      odometerReading: 46200
    });

    expect(fuelLog).toBeDefined();
    expect(fuelLog.liters).toBe(150);
    expect(fuelLog.costPerLiter).toBe(15);
    expect(fuelLog.totalCost).toBe(2250);

    const updatedVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const updated = updatedVehicles.find(v => v.id === testVeh.id);
    expect(updated?.odometerReading).toBe(46200);
  });

  it('3. Throws informative error when logging maintenance for non-existent vehicle', async () => {
    await expect(
      FleetBusinessEngine.recordVehicleMaintenance(companyId, {
        vehicle_id: 'non-existent-veh',
        type: 'ROUTINE',
        description: 'فحص عام',
        cost: 1000,
        odometerAtService: 5000
      })
    ).rejects.toThrow(/not found/i);
  });

  it('4. Throws informative error when logging fuel for non-existent vehicle', async () => {
    await expect(
      FleetBusinessEngine.recordVehicleFuelRefill(companyId, {
        vehicle_id: 'non-existent-veh',
        liters: 50,
        costPerLiter: 15,
        odometerReading: 1000
      })
    ).rejects.toThrow(/not found/i);
  });
});
