import { describe, it, expect } from 'vitest';
import { ERP_MODULES_REGISTRY } from './db/modules';
import { DEFAULT_PERMISSIONS } from './db/defaults';

describe('Fleet Module & Permissions Registration', () => {
  it('should have fleet module registered in ERP_MODULES_REGISTRY with correct data', () => {
    const fleetModule = ERP_MODULES_REGISTRY.find(m => m.id === 'fleet');
    expect(fleetModule).toBeDefined();
    expect(fleetModule?.id).toBe('fleet');
    expect(fleetModule?.name_ar).toBe('إدارة الأسطول والمشاوير');
    expect(fleetModule?.name_en).toBe('Fleet & Trip Management');
    expect(fleetModule?.screens).toEqual(['fleet']);
  });

  it('should have all 9 fleet permissions registered in DEFAULT_PERMISSIONS with category fleet', () => {
    const fleetPermissions = DEFAULT_PERMISSIONS.filter(p => p.category === 'fleet');
    expect(fleetPermissions.length).toBe(9);

    const manageFleet = DEFAULT_PERMISSIONS.find(p => p.id === 'manage_fleet');
    expect(manageFleet).toBeDefined();
    expect(manageFleet?.category).toBe('fleet');
    expect(manageFleet?.name_ar).toBe('إدارة الأسطول والمركبات');

    const createTrip = DEFAULT_PERMISSIONS.find(p => p.id === 'create_trip');
    expect(createTrip).toBeDefined();
    expect(createTrip?.category).toBe('fleet');
    expect(createTrip?.name_ar).toBe('إنشاء مشوار جديد');

    const approveTrip = DEFAULT_PERMISSIONS.find(p => p.id === 'approve_trip');
    expect(approveTrip).toBeDefined();
    expect(approveTrip?.category).toBe('fleet');
    expect(approveTrip?.name_ar).toBe('اعتماد مشوار');

    const dispatchTrip = DEFAULT_PERMISSIONS.find(p => p.id === 'dispatch_trip');
    expect(dispatchTrip).toBeDefined();
    expect(dispatchTrip?.category).toBe('fleet');
    expect(dispatchTrip?.name_ar).toBe('تحريك/تنفيذ مشوار');

    const reassignVehicle = DEFAULT_PERMISSIONS.find(p => p.id === 'reassign_vehicle');
    expect(reassignVehicle).toBeDefined();
    expect(reassignVehicle?.category).toBe('fleet');

    const executeBreakdown = DEFAULT_PERMISSIONS.find(p => p.id === 'execute_breakdown_decision');
    expect(executeBreakdown).toBeDefined();
    expect(executeBreakdown?.category).toBe('fleet');

    const createEmergency = DEFAULT_PERMISSIONS.find(p => p.id === 'create_emergency_trip');
    expect(createEmergency).toBeDefined();
    expect(createEmergency?.category).toBe('fleet');

    const manageConstraints = DEFAULT_PERMISSIONS.find(p => p.id === 'manage_vehicle_constraints');
    expect(manageConstraints).toBeDefined();
    expect(manageConstraints?.category).toBe('fleet');
    expect(manageConstraints?.name_ar).toBe('إدارة قيود وصول المركبات');

    const executeTasks = DEFAULT_PERMISSIONS.find(p => p.id === 'execute_trip_tasks');
    expect(executeTasks).toBeDefined();
    expect(executeTasks?.category).toBe('fleet');
    expect(executeTasks?.name_ar).toBe('تنفيذ مهام السائق الميدانية');
  });

  it('should maintain all pre-existing modules and permissions without any deletions', () => {
    // Check pre-existing core modules
    const expectedModules = ['custody', 'inventory', 'reports', 'audit', 'purchasing', 'accounting', 'sales_ar', 'pos', 'crm', 'fixed_assets', 'hr_payroll', 'contracting', 'restaurant'];
    for (const modId of expectedModules) {
      const mod = ERP_MODULES_REGISTRY.find(m => m.id === modId);
      expect(mod, `Module ${modId} should exist`).toBeDefined();
    }
    expect(ERP_MODULES_REGISTRY.length).toBeGreaterThanOrEqual(14);

    // Check pre-existing core permissions
    const expectedPermissions = ['create_expense', 'edit_expense', 'delete_expense', 'create_voucher', 'approve_voucher', 'reject_voucher', 'create_custody', 'edit_custody', 'replace_custody', 'view_reports', 'manage_users', 'manage_companies', 'manage_regions', 'manage_stations', 'manage_roles', 'manage_settings'];
    for (const permId of expectedPermissions) {
      const perm = DEFAULT_PERMISSIONS.find(p => p.id === permId);
      expect(perm, `Permission ${permId} should exist`).toBeDefined();
    }
    expect(DEFAULT_PERMISSIONS.length).toBeGreaterThanOrEqual(20);
  });
});
