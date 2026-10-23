import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine } from './db/storage';
import { FleetBusinessEngine } from './lib/enterprise/fleet_engine';
import { OrganizationEngine } from './db/organizationEngine';

describe('Fleet Vehicle Creation & Role-Based Scope Test Suite', () => {
  const companyId = 'comp-test-fleet-scope';
  const cairoBranchId = 'org-cairo-branch-101';
  const alexStationId = 'org-alex-station-102';

  beforeEach(() => {
    StorageEngine.setStored('fleet_vehicles_items', []);
    OrganizationEngine.saveUnits([
      { 
        id: cairoBranchId, 
        companyId, 
        code: 'CAI-01', 
        name: 'فرع القاهرة الرئيسي', 
        nameAr: 'فرع القاهرة الرئيسي',
        nameEn: 'Cairo Main Branch',
        typeId: 'out-branch',
        parentId: null,
        path: `/${cairoBranchId}`,
        level: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      { 
        id: alexStationId, 
        companyId, 
        code: 'ALX-01', 
        name: 'محطة الإسكندرية', 
        nameAr: 'محطة الإسكندرية',
        nameEn: 'Alex Station',
        typeId: 'out-station',
        parentId: null,
        path: `/${alexStationId}`,
        level: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    StorageEngine.cache = {};
  });

  it('1. should create vehicle successfully with ONLY mandatory fields (plateNumber, type, driverName)', async () => {
    const created = await FleetBusinessEngine.createVehicle(companyId, {
      plateNumber: 'أ ب ج 1234',
      type: 'TRUCK',
      driverName: 'محمود عبد الفتاح'
    });

    expect(created).toBeDefined();
    expect(created.plateNumber).toBe('أ ب ج 1234');
    expect(created.type).toBe('TRUCK');
    expect(created.driverName).toBe('محمود عبد الفتاح');
    expect(created.status).toBe('ACTIVE');
    expect(created.code).toBeTruthy();
    expect(created.make).toBe('');
    expect(created.model).toBe('');
    expect(created.odometerReading).toBe(0);
    expect(created.fuelCapacity).toBe(0);
    expect(created.year).toBeGreaterThanOrEqual(2000);
  });

  it('2. should reject vehicle creation if plateNumber is missing or empty', async () => {
    await expect(
      FleetBusinessEngine.createVehicle(companyId, {
        plateNumber: '   ',
        type: 'TRUCK',
        driverName: 'محمود عبد الفتاح'
      })
    ).rejects.toThrow('Plate number is required');
  });

  it('3. should reject vehicle creation if vehicle type is missing', async () => {
    await expect(
      FleetBusinessEngine.createVehicle(companyId, {
        plateNumber: 'أ ب ج 1234',
        type: undefined as any,
        driverName: 'محمود عبد الفتاح'
      })
    ).rejects.toThrow('Vehicle type is required');
  });

  it('4. should reject vehicle creation if driverName is missing or empty', async () => {
    await expect(
      FleetBusinessEngine.createVehicle(companyId, {
        plateNumber: 'أ ب ج 1234',
        type: 'PICKUP',
        driverName: '   '
      })
    ).rejects.toThrow('Driver name is required');
  });

  it('5. should respect optional fields when provided (custom code, make, model, year, odometer, capacity, status)', async () => {
    const created = await FleetBusinessEngine.createVehicle(companyId, {
      code: 'CUSTOM-FLT-999',
      plateNumber: 'ط ي ر 9999',
      make: 'Volvo',
      model: 'FH16 750',
      year: 2024,
      type: 'TRUCK',
      status: 'ACTIVE',
      driverName: 'سامح إبراهيم',
      odometerReading: 12500,
      fuelCapacity: 600,
      org_unit_id: cairoBranchId
    });

    expect(created.code).toBe('CUSTOM-FLT-999');
    expect(created.make).toBe('Volvo');
    expect(created.model).toBe('FH16 750');
    expect(created.year).toBe(2024);
    expect(created.odometerReading).toBe(12500);
    expect(created.fuelCapacity).toBe(600);
    expect(created.org_unit_id).toBe(cairoBranchId);
  });

  it('6. should correctly scope vehicles to specific branch/station vs company-wide', async () => {
    // Vehicle assigned to Cairo branch
    await FleetBusinessEngine.createVehicle(companyId, {
      plateNumber: 'ق هـ ر 1111',
      type: 'VAN',
      driverName: 'سائق القاهرة',
      org_unit_id: cairoBranchId
    });

    // Vehicle assigned to Alex station
    await FleetBusinessEngine.createVehicle(companyId, {
      plateNumber: 'س ك ن 2222',
      type: 'PICKUP',
      driverName: 'سائق الإسكندرية',
      org_unit_id: alexStationId
    });

    // Company-wide vehicle (no branch specified)
    await FleetBusinessEngine.createVehicle(companyId, {
      plateNumber: 'ع ا م 3333',
      type: 'CAR',
      driverName: 'سائق الشركة العام'
    });

    // Query for all
    const allVehicles = FleetBusinessEngine.getVehiclesByOrgUnit(companyId, 'ALL');
    expect(allVehicles.length).toBe(3);

    // Query for Cairo branch
    const cairoVehicles = FleetBusinessEngine.getVehiclesByOrgUnit(companyId, cairoBranchId);
    expect(cairoVehicles.length).toBe(1);
    expect(cairoVehicles[0].plateNumber).toBe('ق هـ ر 1111');

    // Query for Alex station
    const alexVehicles = FleetBusinessEngine.getVehiclesByOrgUnit(companyId, alexStationId);
    expect(alexVehicles.length).toBe(1);
    expect(alexVehicles[0].plateNumber).toBe('س ك ن 2222');
  });
});
