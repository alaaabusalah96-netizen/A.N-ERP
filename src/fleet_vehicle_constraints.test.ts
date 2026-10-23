import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine } from './db/storage';
import { UsersModule } from './db/users';
import { FleetBusinessEngine } from './lib/enterprise/fleet_engine';
import { VehicleConstraintRule } from './types/fleet';
import { AppUser } from './types';

describe('Fleet Vehicle Constraints & Routing Governance Suite', () => {
  const companyId = 'comp-test-enterprise';
  const cairoBranchId = 'org-cairo-branch-101';
  const alexBranchId = 'org-alex-branch-102';
  const gizaBranchId = 'org-giza-branch-103';

  beforeEach(() => {
    StorageEngine.setStored('fleet_vehicles_items', []);
    StorageEngine.setStored('fleet_trips_items', []);
    StorageEngine.setStored('fleet_vehicle_constraints', []);
    StorageEngine.setStored('org_units', [
      { id: cairoBranchId, company_id: companyId, code: 'CAI-01', name: 'فرع القاهرة الرئيسي', type: 'BRANCH' },
      { id: alexBranchId, company_id: companyId, code: 'ALX-01', name: 'فرع الإسكندرية', type: 'BRANCH' },
      { id: gizaBranchId, company_id: companyId, code: 'GZA-01', name: 'فرع الجيزة والمستودع', type: 'WAREHOUSE' }
    ]);
    StorageEngine.cache = {};
  });

  it('1. should reject trip creation when vehicle has BLOCK_SPECIFIC_LOCATIONS constraint matching a stop', async () => {
    const vehicleId = 'veh-truck-001';

    // Configure constraint blocking Alex and Giza branches for vehicleId
    await FleetBusinessEngine.saveVehicleConstraint(companyId, 'usr-admin', {
      vehicle_id: vehicleId,
      mode: 'BLOCK_SPECIFIC_LOCATIONS',
      blocked_org_unit_ids: [alexBranchId, gizaBranchId],
      reason: 'شاحنة غير مجهزة للطرق السريعة لمحافظة الإسكندرية',
      is_active: true
    });

    // Attempting trip going to Alex branch must be rejected
    await expect(
      FleetBusinessEngine.createTrip(companyId, 'usr-supervisor', {
        vehicle_id: vehicleId,
        driver_id: 'usr-driver-1',
        tripType: 'نقل بضائع',
        scheduledAt: new Date().toISOString(),
        stops: [
          {
            id: 'stop-1',
            sequence: 1,
            taskTitle: 'تحميل من القاهرة',
            location: { org_unit_id: cairoBranchId, label: 'فرع القاهرة' },
            status: 'PENDING'
          },
          {
            id: 'stop-2',
            sequence: 2,
            taskTitle: 'تسليم للإسكندرية',
            location: { org_unit_id: alexBranchId, label: 'فرع الإسكندرية' },
            status: 'PENDING'
          }
        ]
      })
    ).rejects.toThrow(/ممنوعة من التوجه إلى الموقع المحدد/);

    // Trip going only to Cairo branch (unblocked) should succeed
    const allowedTrip = await FleetBusinessEngine.createTrip(companyId, 'usr-supervisor', {
      vehicle_id: vehicleId,
      driver_id: 'usr-driver-1',
      tripType: 'نقل داخلي',
      scheduledAt: new Date().toISOString(),
      stops: [
        {
          id: 'stop-1',
          sequence: 1,
          taskTitle: 'تحميل من القاهرة',
          location: { org_unit_id: cairoBranchId, label: 'فرع القاهرة' },
          status: 'PENDING'
        },
        {
          id: 'stop-2',
          sequence: 2,
          taskTitle: 'تسليم عميل خارجي',
          location: { label: 'عميل التجمع الخامس - خارجي' },
          status: 'PENDING'
        }
      ]
    });

    expect(allowedTrip).toBeDefined();
    expect(allowedTrip.id).toBeDefined();
  });

  it('2. should reject trip creation with EXTERNAL_ONLY vehicle when any stop has an org_unit_id', async () => {
    const vehicleId = 'veh-pickup-ext';

    // Configure constraint setting vehicle to EXTERNAL_ONLY
    await FleetBusinessEngine.saveVehicleConstraint(companyId, 'usr-admin', {
      vehicle_id: vehicleId,
      mode: 'EXTERNAL_ONLY',
      reason: 'سيارة مخصصة لخدمة وتوزيع عملاء السوق الخارجي فقط',
      is_active: true
    });

    // Attempting trip directed to any registered branch must be rejected
    await expect(
      FleetBusinessEngine.createTrip(companyId, 'usr-supervisor', {
        vehicle_id: vehicleId,
        driver_id: 'usr-driver-2',
        tripType: 'صيانة وتوصيل',
        scheduledAt: new Date().toISOString(),
        stops: [
          {
            id: 's-1',
            sequence: 1,
            taskTitle: 'نقطة الانطلاق الخارجية',
            location: { label: 'ميدان التحرير' },
            status: 'PENDING'
          },
          {
            id: 's-2',
            sequence: 2,
            taskTitle: 'تسليم فرع القاهرة',
            location: { org_unit_id: cairoBranchId, label: 'فرع القاهرة' },
            status: 'PENDING'
          }
        ]
      })
    ).rejects.toThrow(/محددة للمهام والمواقع الخارجية فقط/);
  });

  it('3. should allow trip creation with EXTERNAL_ONLY vehicle when all stops are external (no org_unit_id)', async () => {
    const vehicleId = 'veh-pickup-ext-2';

    await FleetBusinessEngine.saveVehicleConstraint(companyId, 'usr-admin', {
      vehicle_id: vehicleId,
      mode: 'EXTERNAL_ONLY',
      reason: 'توزيع خارجي',
      is_active: true
    });

    const extTrip = await FleetBusinessEngine.createTrip(companyId, 'usr-supervisor', {
      vehicle_id: vehicleId,
      driver_id: 'usr-driver-2',
      tripType: 'توصيل عملاء',
      scheduledAt: new Date().toISOString(),
      stops: [
        {
          id: 's-1',
          sequence: 1,
          taskTitle: 'استلام بضاعة من المورد',
          location: { label: 'مصنع الشروق - مورد خارجي', lat: 30.123, lng: 31.456 },
          status: 'PENDING'
        },
        {
          id: 's-2',
          sequence: 2,
          taskTitle: 'تسليم عميل',
          location: { label: 'مقر العميل بالمعادي', lat: 29.987, lng: 31.298 },
          status: 'PENDING'
        }
      ]
    });

    expect(extTrip).toBeDefined();
    expect(extTrip.status).toBe('DRAFT');
    expect(extTrip.stops.length).toBe(2);
  });

  it('4. should verify that manage_vehicle_constraints defaults to false for everyone except SystemAdmin', () => {
    const stationUser = {
      role: 'StationAdmin' as const,
      permissions: {}
    };

    const regionalUser = {
      role: 'RegionalManager' as const,
      permissions: {}
    };

    const adminUser = {
      role: 'Admin' as const,
      permissions: {}
    };

    const systemAdminUser = {
      role: 'SystemAdmin' as const,
      permissions: {}
    };

    const enrichedStation = UsersModule.enrichUserPermissions(stationUser.role, stationUser.permissions);
    const enrichedRegional = UsersModule.enrichUserPermissions(regionalUser.role, regionalUser.permissions);
    const enrichedAdmin = UsersModule.enrichUserPermissions(adminUser.role, adminUser.permissions);
    const enrichedSysAdmin = UsersModule.enrichUserPermissions(systemAdminUser.role, systemAdminUser.permissions);

    expect(enrichedStation.manage_vehicle_constraints).toBe(false);
    expect(enrichedRegional.manage_vehicle_constraints).toBe(false);
    expect(enrichedAdmin.manage_vehicle_constraints).toBe(false);
    expect(enrichedSysAdmin.manage_vehicle_constraints).toBe(true);
  });

  it('5. should allow trip after deactivating the constraint rule', async () => {
    const vehicleId = 'veh-toggle-test';

    const constraint = await FleetBusinessEngine.saveVehicleConstraint(companyId, 'usr-admin', {
      vehicle_id: vehicleId,
      mode: 'BLOCK_SPECIFIC_LOCATIONS',
      blocked_org_unit_ids: [gizaBranchId],
      is_active: true
    });

    // Verify it blocks
    await expect(
      FleetBusinessEngine.createTrip(companyId, 'usr-supervisor', {
        vehicle_id: vehicleId,
        driver_id: 'usr-driver-1',
        tripType: 'نقل',
        scheduledAt: new Date().toISOString(),
        stops: [
          { id: 's1', sequence: 1, location: { label: 'خارجي' }, status: 'PENDING' },
          { id: 's2', sequence: 2, location: { org_unit_id: gizaBranchId, label: 'فرع الجيزة' }, status: 'PENDING' }
        ]
      })
    ).rejects.toThrow();

    // Deactivate constraint
    await FleetBusinessEngine.toggleVehicleConstraint(companyId, constraint.id, false);

    // Now it must succeed
    const allowed = await FleetBusinessEngine.createTrip(companyId, 'usr-supervisor', {
      vehicle_id: vehicleId,
      driver_id: 'usr-driver-1',
      tripType: 'نقل',
      scheduledAt: new Date().toISOString(),
      stops: [
        { id: 's1', sequence: 1, location: { label: 'خارجي' }, status: 'PENDING' },
        { id: 's2', sequence: 2, location: { org_unit_id: gizaBranchId, label: 'فرع الجيزة' }, status: 'PENDING' }
      ]
    });

    expect(allowed).toBeDefined();
    expect(allowed.id).toBeDefined();
  });
});

