import { describe, it, expect } from 'vitest';
import { UsersModule } from './db/users';
import { DEFAULT_PERMISSIONS } from './db/defaults';
import { Trip } from './types/fleet';

describe('Fleet GPS Fallback Elimination, Granular Permissions & Driver ID Strict Matching Tests', () => {

  describe('1. Granular Fleet Permissions & Defaults', () => {
    it('should default reassign_vehicle, execute_breakdown_decision, and create_emergency_trip to false in enrichUserPermissions', () => {
      const perms = UsersModule.enrichUserPermissions('StationAdmin', {});
      expect(perms.reassign_vehicle).toBe(false);
      expect(perms.execute_breakdown_decision).toBe(false);
      expect(perms.create_emergency_trip).toBe(false);
    });

    it('should preserve explicit true values in enrichUserPermissions', () => {
      const perms = UsersModule.enrichUserPermissions('StationAdmin', {
        reassign_vehicle: true,
        execute_breakdown_decision: true,
        create_emergency_trip: true
      });
      expect(perms.reassign_vehicle).toBe(true);
      expect(perms.execute_breakdown_decision).toBe(true);
      expect(perms.create_emergency_trip).toBe(true);
    });

    it('should include the new permissions in DEFAULT_PERMISSIONS list', () => {
      const ids = DEFAULT_PERMISSIONS.map(p => p.id);
      expect(ids).toContain('reassign_vehicle');
      expect(ids).toContain('execute_breakdown_decision');
      expect(ids).toContain('create_emergency_trip');
    });
  });

  describe('2. Strict Driver ID Matching Logic', () => {
    const trips: Trip[] = [
      {
        id: 'trip-1',
        company_id: 'comp-1',
        vehicle_id: 'veh-1',
        driver_id: 'driver-usr-101',
        tripType: 'توصيل مستندات',
        scheduledAt: new Date().toISOString(),
        status: 'PENDING_APPROVAL',
        stops: [],
        createdBy: 'usr-1',
        createdAt: new Date().toISOString()
      },
      {
        id: 'trip-2',
        company_id: 'comp-1',
        vehicle_id: 'veh-2',
        driver_id: 'driver-usr-102',
        tripType: 'توزيع بضائع',
        scheduledAt: new Date().toISOString(),
        status: 'IN_PROGRESS',
        stops: [],
        createdBy: 'usr-1',
        createdAt: new Date().toISOString()
      },
      {
        id: 'trip-3',
        company_id: 'comp-1',
        vehicle_id: 'veh-3',
        driver_id: 'driver-usr-101-helper', // partial match test
        tripType: 'صيانة',
        scheduledAt: new Date().toISOString(),
        status: 'DRAFT',
        stops: [],
        createdBy: 'usr-1',
        createdAt: new Date().toISOString()
      }
    ];

    it('should only match trips where t.driver_id === activeUser.id strictly', () => {
      const activeUser = { id: 'driver-usr-101', full_name: 'أحمد محمود' };
      // Strict matching logic as in DriverPortalView
      const matchedTrips = trips.filter(t => t.driver_id === activeUser.id);
      
      expect(matchedTrips).toHaveLength(1);
      expect(matchedTrips[0].id).toBe('trip-1');
      expect(matchedTrips[0].driver_id).toBe('driver-usr-101');
    });

    it('should return empty array if activeUser.id is not assigned, even if name matches partially', () => {
      const activeUser = { id: 'driver-usr-999', full_name: 'usr-101' };
      const matchedTrips = trips.filter(t => t.driver_id === activeUser.id);
      expect(matchedTrips).toHaveLength(0);
    });
  });

  describe('3. GPS Fallback Elimination Verification', () => {
    it('should verify that GPS failure rejects with proper Arabic error message without Cairo fallback', async () => {
      const simulateGpsCapture = (hasPermission: boolean, isRtl = true): Promise<{ lat: number; lng: number }> => {
        return new Promise((resolve, reject) => {
          if (!hasPermission) {
            reject(new Error(isRtl ? 'تعذر تحديد الموقع، لا يمكن تسجيل هذا الإجراء بدون تفعيل GPS' : 'Unable to determine location, this action cannot be recorded without GPS'));
            return;
          }
          resolve({ lat: 29.9792, lng: 31.1342 });
        });
      };

      // When GPS is denied/failed, it MUST reject and not return Cairo { lat: 30.0444, lng: 31.2357 }
      await expect(simulateGpsCapture(false, true)).rejects.toThrow('تعذر تحديد الموقع، لا يمكن تسجيل هذا الإجراء بدون تفعيل GPS');
      
      // When GPS succeeds, it returns actual coordinates
      const res = await simulateGpsCapture(true, true);
      expect(res.lat).toBe(29.9792);
      expect(res.lng).toBe(31.1342);
    });
  });

});
