import { 
  calculateDistanceKm as calculateDistanceKmHelper,
  normalizeTaskType as normalizeTaskTypeHelper,
  checkGeofenceArrival as checkGeofenceArrivalHelper,
  getDefaultInspectionChecklist as getDefaultInspectionChecklistHelper
} from './fleet_pure_helpers';
import { StorageEngine } from '../../db/storage';
import { syncWriteWithOfflineFallback } from '../../db/offlineQueue';
import { DocumentNumberEngine } from '../../db/documentNumberEngine';

export const FLEET_COLLECTIONS = {
  VEHICLES: 'fleet_vehicles_items',
  TRIPS: 'fleet_trips_items',
  FUEL_LOGS: 'fleet_fuel_logs',
  MAINTENANCE_LOGS: 'fleet_maintenance_logs',
  INSPECTIONS: 'fleet_inspections_records',
  LEARNED_LOCATIONS: 'fleet_learned_locations_items',
  CHAT_MESSAGES: 'fleet_trip_chat_messages',
  TRIP_TRACKS: 'fleet_trip_tracks',
  CONSTRAINTS: 'fleet_vehicle_constraints'
} as const;
import { CostCenterEngine } from '../../db/costCenterEngine';
import { OrganizationEngine } from '../../db/organizationEngine';
import { UsersModule } from '../../db/users';
import { AccountingBusinessEngine } from './accounting_engine';
import { 
  Vehicle, 
  MaintenanceLog, 
  FuelLog, 
  VehicleType, 
  VehicleStatus, 
  Trip, 
  TripStatus, 
  TripStop, 
  TripLocation,
  TripStopStatus,
  VehicleLocation,
  LearnedTaskLocation,
  LearnedLocationHistoryEntry,
  BreakdownDecisionType,
  BreakdownDecisionLog,
  TripChatMessage,
  VehicleConstraintMode,
  VehicleConstraintRule,
  TripBreadcrumbPoint,
  TripBreadcrumbTrack,
  TripConflictWarning,
  TripConflictType,
  SupervisorConflictOverride,
  DailyOperationsSummary,
  TripTelemetryAnalysis,
  GeofenceArrivalCheckResult,
  VehicleMaintenanceThresholds,
  MaintenanceUrgency,
  MaintenanceHealthAlert,
  VehicleCostBreakdown,
  FleetCostSummary,
  InspectionType,
  InspectionStatus,
  ChecklistItemKey,
  InspectionChecklistItem,
  VehicleInspectionRecord,
  DriverPerformanceTier,
  DriverScorecard,
  FleetDriverPerformanceSummary
} from '../../types/fleet';

export class FleetBusinessEngine {
  /**
   * Retrieves trips filtered by company
   */
  public static getTripsByCompany(companyId: string): Trip[] {
    const all = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    return all.filter(t => t.company_id === companyId);
  }

  /**
   * Creates a new trip in DRAFT status with task-oriented multi-point stops
   */
  public static async createTrip(
    companyId: string,
    creatorId: string,
    data: {
      vehicle_id: string;
      driver_id: string;
      stops: Array<{
        id?: string;
        sequence?: number;
        taskTitle?: string;
        notes?: string;
        location: TripLocation;
        status?: TripStopStatus;
        startLocation?: TripLocation;
        arrivedLocation?: TripLocation;
        startedAt?: string;
        arrivedAt?: string;
        completedAt?: string;
      }>;
      tripType: string;
      scheduledAt: string;
      notes?: string;
      org_unit_id?: string;
    }
  ): Promise<Trip> {
    if (!data.stops || data.stops.length < 2) {
      throw new Error('Trip must contain at least 2 stops');
    }

    // Validate stops against active vehicle access constraints
    const activeConstraints = this.getActiveVehicleConstraints(companyId, data.vehicle_id);
    if (activeConstraints.length > 0) {
      const orgUnits = OrganizationEngine.getUnits(companyId);
      for (const rule of activeConstraints) {
        if (rule.mode === 'EXTERNAL_ONLY') {
          for (const stop of data.stops) {
            if (stop.location && stop.location.org_unit_id && stop.location.org_unit_id.trim() !== '') {
              const matchedUnit = orgUnits.find(u => u.id === stop.location.org_unit_id);
              const unitName = matchedUnit ? `${matchedUnit.name} (${matchedUnit.code})` : (stop.location.label || stop.location.org_unit_id);
              throw new Error(`لا يمكن تعيين المركبة لهذا المشوار: المركبة محددة للمهام والمواقع الخارجية فقط وممنوعة من زيارة الفروع والوحدات المسجلة (${unitName})`);
            }
          }
        } else if (rule.mode === 'BLOCK_SPECIFIC_LOCATIONS') {
          const blockedIds = rule.blocked_org_unit_ids || [];
          for (const stop of data.stops) {
            if (stop.location && stop.location.org_unit_id && blockedIds.includes(stop.location.org_unit_id)) {
              const matchedUnit = orgUnits.find(u => u.id === stop.location.org_unit_id);
              const unitName = matchedUnit ? `${matchedUnit.name} (${matchedUnit.code})` : (stop.location.label || stop.location.org_unit_id);
              throw new Error(`لا يمكن إنشاء المشوار: المركبة ممنوعة من التوجه إلى الموقع المحدد (${unitName}) بموجب قيود الوصول الجغرافي النشطة`);
            }
          }
        }
      }
    }

    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);

    const stops: TripStop[] = data.stops.map((stop, idx) => ({
      id: stop.id || `stop-${crypto.randomUUID()}`,
      sequence: idx + 1,
      taskTitle: stop.taskTitle || undefined,
      notes: stop.notes || '',
      location: {
        org_unit_id: stop.location.org_unit_id || undefined,
        label: stop.location.label || '',
        lat: typeof stop.location.lat === 'number' ? stop.location.lat : undefined,
        lng: typeof stop.location.lng === 'number' ? stop.location.lng : undefined,
        accuracy: typeof stop.location.accuracy === 'number' ? stop.location.accuracy : undefined,
        timestamp: stop.location.timestamp
      },
      status: stop.status || 'PENDING',
      startLocation: stop.startLocation,
      arrivedLocation: stop.arrivedLocation,
      startedAt: stop.startedAt,
      arrivedAt: stop.arrivedAt,
      completedAt: stop.completedAt
    }));

    const newTrip: Trip = {
      id: `trip-${crypto.randomUUID()}`,
      company_id: companyId,
      org_unit_id: data.org_unit_id || stops[0]?.location.org_unit_id || undefined,
      vehicle_id: data.vehicle_id,
      driver_id: data.driver_id,
      stops,
      tripType: data.tripType,
      status: 'DRAFT',
      scheduledAt: data.scheduledAt,
      notes: data.notes || '',
      conflictOverride: (data as any).conflictOverride || undefined,
      createdBy: creatorId,
      createdAt: new Date().toISOString(),
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, newTrip.id, newTrip);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync trip with cloud database');
    }

    const updated = [...allTrips, newTrip];
    StorageEngine.setStored('fleet_trips_items', updated);

    return newTrip;
  }

  /**
   * Detects potential daily operational conflicts for a trip candidate before creation/dispatch.
   * Checks for:
   * 1. Same destination (org_unit_id or location label) on the same date by another vehicle.
   * 2. Same task type (taskTitle or tripType) on the same date in the same company.
   * 3. Same vehicle assigned to multiple active trips on the same date.
   * 4. Same driver assigned to multiple active trips on the same date.
   * Note: This returns non-blocking warnings to guide supervisor decisions without enforcing rigid automated blockage.
   */
  public static detectTripConflicts(
    companyId: string,
    data: {
      vehicle_id?: string;
      driver_id?: string;
      scheduledAt: string;
      tripType?: string;
      stops: Array<{
        location?: { org_unit_id?: string; label?: string };
        taskTitle?: string;
      }>;
    },
    currentTripId?: string
  ): TripConflictWarning[] {
    const warnings: TripConflictWarning[] = [];
    if (!companyId || !data.scheduledAt) return warnings;

    const targetDate = data.scheduledAt.split('T')[0];
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const allUsers = UsersModule.getUsers();

    // Filter trips belonging to same company, on the same calendar day, excluding current trip and cancelled trips
    const candidateTrips = allTrips.filter(t => 
      t.company_id === companyId && 
      t.id !== currentTripId && 
      t.status !== 'CANCELLED' && 
      t.scheduledAt && 
      t.scheduledAt.split('T')[0] === targetDate
    );

    const destStops = data.stops || [];

    for (const otherTrip of candidateTrips) {
      const otherVehicle = allVehicles.find(v => v.id === otherTrip.vehicle_id);
      const otherDriver = allUsers.find(u => u.id === otherTrip.driver_id);
      const vehicleDesc = otherVehicle ? `${otherVehicle.code} (${otherVehicle.plateNumber})` : otherTrip.vehicle_id;
      const driverDesc = otherDriver ? otherDriver.full_name : otherTrip.driver_id;

      // 1. Same vehicle overlap on same day
      if (data.vehicle_id && otherTrip.vehicle_id === data.vehicle_id) {
        warnings.push({
          conflictingTripId: otherTrip.id,
          conflictType: 'SAME_VEHICLE',
          conflictingVehicleId: otherTrip.vehicle_id,
          conflictingVehicleCode: otherVehicle?.code,
          conflictingVehiclePlate: otherVehicle?.plateNumber,
          conflictingDriverId: otherTrip.driver_id,
          conflictingDriverName: driverDesc,
          tripType: otherTrip.tripType,
          scheduledAt: otherTrip.scheduledAt,
          status: otherTrip.status,
          messageAr: `المركبة (${vehicleDesc}) مسند إليها مشوار آخر (${otherTrip.tripType}) في نفس اليوم (${targetDate}) في حالة (${otherTrip.status})`,
          messageEn: `Vehicle (${vehicleDesc}) is already assigned to another trip (${otherTrip.tripType}) on (${targetDate}) in status (${otherTrip.status})`
        });
      }

      // 2. Same driver overlap on same day
      if (data.driver_id && otherTrip.driver_id === data.driver_id && (!data.vehicle_id || otherTrip.vehicle_id !== data.vehicle_id)) {
        warnings.push({
          conflictingTripId: otherTrip.id,
          conflictType: 'SAME_DRIVER',
          conflictingVehicleId: otherTrip.vehicle_id,
          conflictingVehicleCode: otherVehicle?.code,
          conflictingVehiclePlate: otherVehicle?.plateNumber,
          conflictingDriverId: otherTrip.driver_id,
          conflictingDriverName: driverDesc,
          tripType: otherTrip.tripType,
          scheduledAt: otherTrip.scheduledAt,
          status: otherTrip.status,
          messageAr: `السائق (${driverDesc}) مسند إليه مشوار آخر (${otherTrip.tripType}) مع المركبة (${vehicleDesc}) في نفس اليوم (${targetDate})`,
          messageEn: `Driver (${driverDesc}) is already assigned to another trip (${otherTrip.tripType}) with vehicle (${vehicleDesc}) on (${targetDate})`
        });
      }

      // 3. Same destination check across stops
      for (const newStop of destStops) {
        const newOrgId = newStop.location?.org_unit_id?.trim();
        const newLabel = (newStop.location?.label || '').trim().toLowerCase();

        for (const otherStop of (otherTrip.stops || [])) {
          const otherOrgId = otherStop.location?.org_unit_id?.trim();
          const otherLabel = (otherStop.location?.label || '').trim().toLowerCase();

          const isOrgMatch = Boolean(newOrgId && otherOrgId && newOrgId === otherOrgId);
          const isLabelMatch = Boolean(!isOrgMatch && newLabel && otherLabel && newLabel.length > 2 && newLabel === otherLabel);

          if (isOrgMatch || isLabelMatch) {
            const destName = otherStop.location?.label || newStop.location?.label || otherOrgId || 'الوجهة المحددة';
            warnings.push({
              conflictingTripId: otherTrip.id,
              conflictType: 'SAME_DESTINATION',
              conflictingVehicleId: otherTrip.vehicle_id,
              conflictingVehicleCode: otherVehicle?.code,
              conflictingVehiclePlate: otherVehicle?.plateNumber,
              conflictingDriverId: otherTrip.driver_id,
              conflictingDriverName: driverDesc,
              destinationLabel: destName,
              destinationOrgUnitId: otherOrgId || newOrgId,
              taskTitle: otherStop.taskTitle || otherTrip.tripType,
              tripType: otherTrip.tripType,
              scheduledAt: otherTrip.scheduledAt,
              status: otherTrip.status,
              messageAr: `توجد مركبة أخرى (${vehicleDesc} بقيادة ${driverDesc}) متجهة لنفس الوجهة (${destName}) في نفس اليوم (${targetDate})`,
              messageEn: `Another vehicle (${vehicleDesc} driven by ${driverDesc}) is already scheduled to visit (${destName}) on the same date (${targetDate})`
            });
            break; // avoid duplicate warning for same otherTrip
          }
        }
      }

      // 4. Same specific task type check on same day
      for (const newStop of destStops) {
        const newTaskTitle = (newStop.taskTitle || data.tripType || '').trim().toLowerCase();
        if (!newTaskTitle || newTaskTitle === 'مهمة عمل ونقل عام' || newTaskTitle === 'أخرى (مهمة مخصصة)' || newTaskTitle === 'مهمة تشغيلية') continue;

        for (const otherStop of (otherTrip.stops || [])) {
          const otherTaskTitle = (otherStop.taskTitle || otherTrip.tripType || '').trim().toLowerCase();
          if (otherTaskTitle && otherTaskTitle === newTaskTitle) {
            // Check if already warned for same destination
            const alreadyWarned = warnings.some(w => w.conflictingTripId === otherTrip.id && w.conflictType === 'SAME_TASK_TYPE');
            if (!alreadyWarned) {
              warnings.push({
                conflictingTripId: otherTrip.id,
                conflictType: 'SAME_TASK_TYPE',
                conflictingVehicleId: otherTrip.vehicle_id,
                conflictingVehicleCode: otherVehicle?.code,
                conflictingVehiclePlate: otherVehicle?.plateNumber,
                conflictingDriverId: otherTrip.driver_id,
                conflictingDriverName: driverDesc,
                taskTitle: otherStop.taskTitle || otherTrip.tripType,
                tripType: otherTrip.tripType,
                scheduledAt: otherTrip.scheduledAt,
                status: otherTrip.status,
                messageAr: `يوجد مشوار آخر للمركبة (${vehicleDesc}) بنفس نوع المهمة (${otherStop.taskTitle || otherTrip.tripType}) في نفس اليوم (${targetDate})`,
                messageEn: `Another vehicle (${vehicleDesc}) is scheduled for the same task type (${otherStop.taskTitle || otherTrip.tripType}) on (${targetDate})`
              });
            }
            break;
          }
        }
      }
    }

    return warnings;
  }

  /**
   * Retrieves a comprehensive daily operational summary for supervisors:
   * - Vehicles breakdown by 4 clear statuses: Idle/Available, In-Trip, Breakdown, Maintenance/Out-of-Service.
   * - Open trips for target date.
   * - Delayed / Not started trips.
   * - Unregistered / Not started drivers.
   * - Conflicted trips with supervisor override statuses.
   */
  public static getDailyOperationsSummary(companyId: string, targetDate?: string): DailyOperationsSummary {
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []).filter(v => v.company_id === companyId);
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []).filter(t => t.company_id === companyId);
    const allUsers = UsersModule.getUsers();

    // Vehicles categorisation
    const availableVehicles = allVehicles.filter(v => v.status === 'ACTIVE' || v.status === 'INACTIVE');
    const inTripVehicles = allVehicles.filter(v => v.status === 'DISPATCHED');
    const breakdownVehicles = allVehicles.filter(v => v.status === 'BREAKDOWN');
    const outOfServiceVehicles = allVehicles.filter(v => v.status === 'OUT_OF_SERVICE' || v.status === 'MAINTENANCE');

    // Trips for target date (or active in-progress trips)
    const todayTrips = allTrips.filter(t => {
      if (t.status === 'CANCELLED') return false;
      const tripDate = t.scheduledAt ? t.scheduledAt.split('T')[0] : '';
      return tripDate === dateStr || t.status === 'DISPATCHED' || t.status === 'IN_PROGRESS';
    });

    const openTrips = todayTrips.filter(t => 
      ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'DISPATCHED', 'IN_PROGRESS'].includes(t.status)
    );

    // Delayed or Not Started: Scheduled date is today or earlier and trip is not completed/dispatched
    const now = new Date();
    const delayedOrNotStartedTrips = todayTrips.filter(t => {
      if (t.status === 'COMPLETED' || t.status === 'CANCELLED' || t.status === 'DISPATCHED' || t.status === 'IN_PROGRESS') {
        return false;
      }
      return t.status === 'DRAFT' || t.status === 'APPROVED' || t.status === 'PENDING_APPROVAL';
    });

    // Unregistered / Not Started Drivers
    const driverMap = new Map<string, {
      driverId: string;
      driverName: string;
      tripId: string;
      scheduledAt: string;
      vehicleCode?: string;
      vehiclePlate?: string;
      taskTitle?: string;
    }>();

    for (const trip of todayTrips) {
      if (['DRAFT', 'APPROVED', 'PENDING_APPROVAL'].includes(trip.status) && !trip.startedAt) {
        const driverUser = allUsers.find(u => u.id === trip.driver_id);
        const vehicle = allVehicles.find(v => v.id === trip.vehicle_id);
        const driverName = driverUser?.full_name || trip.driver_id;
        if (!driverMap.has(trip.driver_id)) {
          driverMap.set(trip.driver_id, {
            driverId: trip.driver_id,
            driverName,
            tripId: trip.id,
            scheduledAt: trip.scheduledAt,
            vehicleCode: vehicle?.code,
            vehiclePlate: vehicle?.plateNumber,
            taskTitle: trip.stops?.[1]?.taskTitle || trip.stops?.[1]?.location?.label || trip.tripType
          });
        }
      }
    }

    // Detect conflicts for all open today trips
    const conflictedTrips: Array<{ trip: Trip; conflicts: TripConflictWarning[] }> = [];
    for (const trip of todayTrips) {
      const conflicts = this.detectTripConflicts(companyId, {
        vehicle_id: trip.vehicle_id,
        driver_id: trip.driver_id,
        scheduledAt: trip.scheduledAt,
        tripType: trip.tripType,
        stops: trip.stops || []
      }, trip.id);

      if (conflicts.length > 0) {
        conflictedTrips.push({ trip, conflicts });
      }
    }

    return {
      date: dateStr,
      vehicles: {
        total: allVehicles.length,
        available: availableVehicles.length,
        inTrip: inTripVehicles.length,
        breakdown: breakdownVehicles.length,
        outOfService: outOfServiceVehicles.length,
        availableVehicles,
        inTripVehicles,
        breakdownVehicles,
        outOfServiceVehicles
      },
      openTrips,
      delayedOrNotStartedTrips,
      unregisteredDrivers: Array.from(driverMap.values()),
      conflictedTrips
    };
  }

  /**
   * Records supervisor's manual decision to proceed with a trip despite conflicts.
   */
  public static async recordSupervisorConflictOverride(
    companyId: string,
    operatorId: string,
    tripId: string,
    overrideData: {
      reason?: string;
      conflictingTripIds: string[];
      conflictSummary?: string;
    }
  ): Promise<Trip> {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const tripIndex = allTrips.findIndex(t => t.id === tripId && t.company_id === companyId);
    if (tripIndex === -1) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const allUsers = UsersModule.getUsers();
    const operator = allUsers.find(u => u.id === operatorId);

    const trip = allTrips[tripIndex];
    const now = new Date().toISOString();

    const override: SupervisorConflictOverride = {
      overridden: true,
      overriddenBy: operatorId,
      overriddenByName: operator?.full_name || operatorId,
      reason: overrideData.reason || 'قرار المشرف: متابعة التشغيل وتجاوز التعارض يدوياً',
      timestamp: now,
      conflictingTripIds: overrideData.conflictingTripIds,
      conflictSummary: overrideData.conflictSummary
    };

    const updatedTrip: Trip = {
      ...trip,
      conflictOverride: override
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, updatedTrip.id, updatedTrip);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync trip conflict override with cloud database');
    }

    allTrips[tripIndex] = updatedTrip;
    StorageEngine.setStored('fleet_trips_items', allTrips);

    return updatedTrip;
  }

  /**
   * Driver begins trip: captures start GPS location, marks status DISPATCHED,
   * records start timestamp and updates vehicle's last known location.
   */
  public static async startTrip(
    companyId: string,
    operatorId: string,
    tripId: string,
    coords: {
      lat: number;
      lng: number;
      accuracy?: number;
      label?: string;
    }
  ): Promise<Trip> {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const tripIndex = allTrips.findIndex(t => t.id === tripId && t.company_id === companyId);
    if (tripIndex === -1) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const trip = allTrips[tripIndex];
    const now = new Date().toISOString();

    const startLoc: TripLocation = {
      label: coords.label || 'نقطة انطلاق الرحلة (GPS)',
      lat: coords.lat,
      lng: coords.lng,
      accuracy: coords.accuracy,
      timestamp: now
    };

    // Update first stop start details if pending
    const updatedStops = trip.stops.map((stop, idx) => {
      if (idx === 0) {
        return {
          ...stop,
          startLocation: startLoc,
          startedAt: stop.startedAt || now,
          status: (stop.status === 'PENDING' ? 'IN_PROGRESS' : stop.status) as TripStopStatus
        };
      }
      return stop;
    });

    const updatedTrip: Trip = {
      ...trip,
      status: 'DISPATCHED',
      startedAt: now,
      dispatchedAt: trip.dispatchedAt || now,
      startLocation: startLoc,
      stops: updatedStops
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, updatedTrip.id, updatedTrip);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync trip dispatch with cloud database');
    }

    allTrips[tripIndex] = updatedTrip;
    StorageEngine.setStored('fleet_trips_items', allTrips);

    // Update vehicle's last known location and status to DISPATCHED
    await this.updateVehicleLocationAndStatus(
      companyId,
      trip.vehicle_id,
      {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy,
        updatedAt: now,
        label: coords.label || 'نقطة انطلاق الرحلة'
      },
      'DISPATCHED'
    );

    return updatedTrip;
  }

  /**
   * Driver arrives at task stop: captures destination GPS location,
   * updates stop status to ARRIVED, records arrived timestamp and updates vehicle location.
   */
  public static async recordStopArrival(
    companyId: string,
    operatorId: string,
    tripId: string,
    stopId: string,
    coords: {
      lat: number;
      lng: number;
      accuracy?: number;
      label?: string;
    }
  ): Promise<{ trip: Trip; stop: TripStop }> {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const tripIndex = allTrips.findIndex(t => t.id === tripId && t.company_id === companyId);
    if (tripIndex === -1) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const trip = allTrips[tripIndex];
    const now = new Date().toISOString();

    let targetStop: TripStop | null = null;

    const updatedStops = trip.stops.map(stop => {
      if (stop.id === stopId) {
        const arrivalLoc: TripLocation = {
          org_unit_id: stop.location.org_unit_id,
          label: coords.label || stop.location.label || stop.taskTitle || 'موقع المهمة (GPS)',
          lat: coords.lat,
          lng: coords.lng,
          accuracy: coords.accuracy,
          timestamp: now
        };

        const updatedStop: TripStop = {
          ...stop,
          status: 'ARRIVED',
          arrivedAt: now,
          arrivedLocation: arrivalLoc,
          location: {
            ...stop.location,
            lat: coords.lat,
            lng: coords.lng,
            accuracy: coords.accuracy,
            label: stop.location.label || arrivalLoc.label
          }
        };
        targetStop = updatedStop;
        return updatedStop;
      }
      return stop;
    });

    if (!targetStop) {
      throw new Error(`Stop ${stopId} not found in trip ${tripId}`);
    }

    const updatedTrip: Trip = {
      ...trip,
      stops: updatedStops
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, updatedTrip.id, updatedTrip);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync stop arrival with cloud database');
    }

    allTrips[tripIndex] = updatedTrip;
    StorageEngine.setStored('fleet_trips_items', allTrips);

    // Update vehicle's last known location
    const stopObj = targetStop as TripStop;
    await this.updateVehicleLocationAndStatus(
      companyId,
      trip.vehicle_id,
      {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy,
        updatedAt: now,
        label: stopObj.taskTitle || stopObj.location.label || 'موقع تنفيذ المهمة'
      }
    );

    // Auto-learn task location with key: company_id + org_unit_id + task_type
    const taskTypeToLearn = stopObj.taskTitle || stopObj.location.label;
    const orgUnitToLearn = stopObj.location.org_unit_id || trip.org_unit_id;
    if (orgUnitToLearn && taskTypeToLearn && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
      try {
        await this.recordLearnedLocation(
          companyId,
          orgUnitToLearn,
          taskTypeToLearn,
          {
            label: coords.label || stopObj.location.label || taskTypeToLearn,
            lat: coords.lat,
            lng: coords.lng,
            accuracy: coords.accuracy,
            tripId: trip.id
          }
        );
      } catch (err) {
        console.error('Failed to record learned task location:', err);
      }
    }

    return { trip: updatedTrip, stop: targetStop };
  }

  /**
   * Driver ends trip: sets status COMPLETED, records completion timestamp,
   * and resets vehicle status to ACTIVE.
   */
  public static async completeTrip(
    companyId: string,
    operatorId: string,
    tripId: string,
    coords?: {
      lat: number;
      lng: number;
      accuracy?: number;
      label?: string;
    }
  ): Promise<Trip> {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const tripIndex = allTrips.findIndex(t => t.id === tripId && t.company_id === companyId);
    if (tripIndex === -1) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const trip = allTrips[tripIndex];
    const now = new Date().toISOString();

    const updatedTrip: Trip = {
      ...trip,
      status: 'COMPLETED',
      completedAt: now
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, updatedTrip.id, updatedTrip);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync trip completion with cloud database');
    }

    allTrips[tripIndex] = updatedTrip;
    StorageEngine.setStored('fleet_trips_items', allTrips);

    // Reset vehicle status to ACTIVE
    const locUpdate: VehicleLocation | undefined = coords ? {
      lat: coords.lat,
      lng: coords.lng,
      accuracy: coords.accuracy,
      updatedAt: now,
      label: coords.label || 'نهاية الرحلة'
    } : undefined;

    await this.updateVehicleLocationAndStatus(
      companyId,
      trip.vehicle_id,
      locUpdate,
      'ACTIVE'
    );

    // End active breadcrumb tracking track
    try {
      await this.endTripTrack(companyId, tripId, 'COMPLETED');
    } catch (err) {
      console.warn('Failed to end trip tracking log on completeTrip:', err);
    }

    // Persist computed telemetry (distance, duration, speed) onto the trip record
    // so downstream analytics (e.g. driver scorecards) read real values instead of undefined.
    try {
      const telemetry = this.analyzeTripTelemetry(companyId, tripId);
      if (telemetry) {
        const allTripsAfter = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
        const idxAfter = allTripsAfter.findIndex(t => t.id === tripId && t.company_id === companyId);
        if (idxAfter !== -1) {
          const tripWithTelemetry: Trip = {
            ...allTripsAfter[idxAfter],
            telemetry: {
              totalDistanceKm: telemetry.totalDistanceKm,
              totalDurationMinutes: telemetry.totalDurationMinutes,
              movingDurationMinutes: telemetry.movingDurationMinutes,
              idleDurationMinutes: telemetry.idleDurationMinutes,
              maxSpeedKmh: telemetry.maxSpeedKmh,
              avgMovingSpeedKmh: telemetry.avgMovingSpeedKmh
            }
          };
          const telSyncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, tripId, tripWithTelemetry);
          if (telSyncRes.success) {
            allTripsAfter[idxAfter] = tripWithTelemetry;
            StorageEngine.setStored('fleet_trips_items', allTripsAfter);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to persist trip telemetry on completeTrip:', err);
    }

    return updatedTrip;
  }

  /**
   * Phase 2: Add a new task/stop dynamically to an existing trip (DRAFT, DISPATCHED, or IN_PROGRESS)
   */
  public static async addStopToTrip(
    companyId: string,
    operatorId: string,
    tripId: string,
    stopData: {
      taskTitle?: string;
      notes?: string;
      location: TripLocation;
    }
  ): Promise<Trip> {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const tripIndex = allTrips.findIndex(t => t.id === tripId && t.company_id === companyId);
    if (tripIndex === -1) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const trip = allTrips[tripIndex];
    if (trip.status === 'COMPLETED' || trip.status === 'CANCELLED') {
      throw new Error('لا يمكن إضافة محطات لرحلة مكتملة أو ملغاة');
    }

    // Validate stop against active vehicle access constraints
    const activeConstraints = this.getActiveVehicleConstraints(companyId, trip.vehicle_id);
    if (activeConstraints.length > 0) {
      const orgUnits = OrganizationEngine.getUnits(companyId);
      for (const rule of activeConstraints) {
        if (rule.mode === 'EXTERNAL_ONLY' && stopData.location.org_unit_id) {
          const matchedUnit = orgUnits.find(u => u.id === stopData.location.org_unit_id);
          const unitName = matchedUnit ? `${matchedUnit.name} (${matchedUnit.code})` : stopData.location.label;
          throw new Error(`المركبة محددة للمهام الخارجية فقط وممنوعة من زيارة (${unitName})`);
        } else if (rule.mode === 'BLOCK_SPECIFIC_LOCATIONS' && stopData.location.org_unit_id) {
          if ((rule.blocked_org_unit_ids || []).includes(stopData.location.org_unit_id)) {
            const matchedUnit = orgUnits.find(u => u.id === stopData.location.org_unit_id);
            const unitName = matchedUnit ? `${matchedUnit.name} (${matchedUnit.code})` : stopData.location.label;
            throw new Error(`المركبة ممنوعة من زيارة الموقع المحدد (${unitName}) بموجب قيود الوصول النشطة`);
          }
        }
      }
    }

    const maxSeq = trip.stops.length > 0 ? Math.max(...trip.stops.map(s => s.sequence || 0)) : 0;
    const newStop: TripStop = {
      id: `stop-${crypto.randomUUID()}`,
      sequence: maxSeq + 1,
      taskTitle: stopData.taskTitle || undefined,
      notes: stopData.notes || '',
      location: {
        org_unit_id: stopData.location.org_unit_id || undefined,
        label: stopData.location.label || stopData.taskTitle || 'محطة إضافية',
        lat: typeof stopData.location.lat === 'number' ? stopData.location.lat : undefined,
        lng: typeof stopData.location.lng === 'number' ? stopData.location.lng : undefined,
        accuracy: typeof stopData.location.accuracy === 'number' ? stopData.location.accuracy : undefined,
        timestamp: stopData.location.timestamp
      },
      status: 'PENDING'
    };

    const updatedTrip: Trip = {
      ...trip,
      stops: [...trip.stops, newStop]
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, updatedTrip.id, updatedTrip);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync added stop with cloud database');
    }

    allTrips[tripIndex] = updatedTrip;
    StorageEngine.setStored('fleet_trips_items', allTrips);

    return updatedTrip;
  }

  /**
   * Phase 2: Reorder stops within a trip
   */
  public static async reorderTripStops(
    companyId: string,
    operatorId: string,
    tripId: string,
    orderedStopIds: string[]
  ): Promise<Trip> {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const tripIndex = allTrips.findIndex(t => t.id === tripId && t.company_id === companyId);
    if (tripIndex === -1) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const trip = allTrips[tripIndex];
    if (trip.status === 'COMPLETED' || trip.status === 'CANCELLED') {
      throw new Error('لا يمكن إعادة ترتيب محطات رحلة مكتملة أو ملغاة');
    }

    const stopMap = new Map(trip.stops.map(s => [s.id, s]));
    const reorderedStops: TripStop[] = [];

    orderedStopIds.forEach((id, index) => {
      const stop = stopMap.get(id);
      if (stop) {
        reorderedStops.push({
          ...stop,
          sequence: index + 1
        });
        stopMap.delete(id);
      }
    });

    // Append any leftover stops
    stopMap.forEach(stop => {
      reorderedStops.push({
        ...stop,
        sequence: reorderedStops.length + 1
      });
    });

    const updatedTrip: Trip = {
      ...trip,
      stops: reorderedStops
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, updatedTrip.id, updatedTrip);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync stop reordering with cloud database');
    }

    allTrips[tripIndex] = updatedTrip;
    StorageEngine.setStored('fleet_trips_items', allTrips);

    return updatedTrip;
  }

  /**
   * Phase 2: Skip or Cancel an individual stop with reason
   */
  public static async skipOrCancelStop(
    companyId: string,
    operatorId: string,
    tripId: string,
    stopId: string,
    reason: string
  ): Promise<Trip> {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const tripIndex = allTrips.findIndex(t => t.id === tripId && t.company_id === companyId);
    if (tripIndex === -1) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const trip = allTrips[tripIndex];
    let found = false;

    const updatedStops = trip.stops.map(stop => {
      if (stop.id === stopId) {
        found = true;
        return {
          ...stop,
          status: 'SKIPPED' as const,
          skippedReason: reason || 'تم تخطي المحطة بقرار المشرف'
        };
      }
      return stop;
    });

    if (!found) {
      throw new Error(`Stop ${stopId} not found in trip ${tripId}`);
    }

    const updatedTrip: Trip = {
      ...trip,
      stops: updatedStops
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, updatedTrip.id, updatedTrip);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync skipped stop with cloud database');
    }

    allTrips[tripIndex] = updatedTrip;
    StorageEngine.setStored('fleet_trips_items', allTrips);

    return updatedTrip;
  }

  /**
   * Phase 2: Reassign a single pending stop to another active/pending trip
   */
  public static async reassignStopToAnotherTrip(
    companyId: string,
    operatorId: string,
    sourceTripId: string,
    stopId: string,
    targetTripId: string,
    reason?: string
  ): Promise<{ sourceTrip: Trip; targetTrip: Trip }> {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const sourceIndex = allTrips.findIndex(t => t.id === sourceTripId && t.company_id === companyId);
    const targetIndex = allTrips.findIndex(t => t.id === targetTripId && t.company_id === companyId);

    if (sourceIndex === -1) throw new Error(`Source trip ${sourceTripId} not found`);
    if (targetIndex === -1) throw new Error(`Target trip ${targetTripId} not found`);

    const sourceTrip = allTrips[sourceIndex];
    const targetTrip = allTrips[targetIndex];

    const stopToMove = sourceTrip.stops.find(s => s.id === stopId);
    if (!stopToMove) throw new Error(`Stop ${stopId} not found in source trip`);

    // 1. Mark stop in source trip as REASSIGNED
    const updatedSourceStops = sourceTrip.stops.map(s => {
      if (s.id === stopId) {
        return {
          ...s,
          status: 'REASSIGNED' as const,
          reassignedToTripId: targetTrip.id,
          reassignedToVehicleId: targetTrip.vehicle_id,
          reassignedToDriverId: targetTrip.driver_id,
          notes: `${s.notes ? s.notes + ' | ' : ''}تمت إعادة التوزيع إلى مشوار آخر: ${reason || ''}`.trim()
        };
      }
      return s;
    });

    const updatedSourceTrip: Trip = {
      ...sourceTrip,
      stops: updatedSourceStops
    };

    // 2. Add stop to target trip
    const maxTargetSeq = targetTrip.stops.length > 0 ? Math.max(...targetTrip.stops.map(s => s.sequence || 0)) : 0;
    const newTargetStop: TripStop = {
      id: `stop-${crypto.randomUUID()}`,
      sequence: maxTargetSeq + 1,
      taskTitle: stopToMove.taskTitle,
      notes: `${stopToMove.notes ? stopToMove.notes + ' | ' : ''}محولة من مشوار سابق`.trim(),
      location: { ...stopToMove.location },
      status: 'PENDING'
    };

    const updatedTargetTrip: Trip = {
      ...targetTrip,
      stops: [...targetTrip.stops, newTargetStop]
    };

    const sourceSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, updatedSourceTrip.id, updatedSourceTrip);
    const targetSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, updatedTargetTrip.id, updatedTargetTrip);
    if (!sourceSync.success || !targetSync.success) {
      throw new Error(sourceSync.error || targetSync.error || 'Failed to sync stop reassignment with cloud database');
    }

    allTrips[sourceIndex] = updatedSourceTrip;
    allTrips[targetIndex] = updatedTargetTrip;
    StorageEngine.setStored('fleet_trips_items', allTrips);

    return { sourceTrip: updatedSourceTrip, targetTrip: updatedTargetTrip };
  }

  /**
   * Phase 2: Split a pending stop into a brand-new trip for another vehicle/driver
   */
  public static async splitStopToNewTrip(
    companyId: string,
    operatorId: string,
    sourceTripId: string,
    stopId: string,
    newTripConfig: {
      vehicle_id: string;
      driver_id: string;
      scheduledAt?: string;
      tripType?: string;
      notes?: string;
    }
  ): Promise<{ sourceTrip: Trip; newTrip: Trip }> {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const sourceIndex = allTrips.findIndex(t => t.id === sourceTripId && t.company_id === companyId);
    if (sourceIndex === -1) throw new Error(`Source trip ${sourceTripId} not found`);

    const sourceTrip = allTrips[sourceIndex];
    const stopToMove = sourceTrip.stops.find(s => s.id === stopId);
    if (!stopToMove) throw new Error(`Stop ${stopId} not found in source trip`);

    // Create the new trip with 2 stops (Origin + the reallocated task stop)
    const newTrip = await this.createTrip(companyId, operatorId, {
      vehicle_id: newTripConfig.vehicle_id,
      driver_id: newTripConfig.driver_id,
      tripType: newTripConfig.tripType || stopToMove.taskTitle || 'مهمة محولة من مشوار آخر',
      scheduledAt: newTripConfig.scheduledAt || new Date().toISOString().slice(0, 16),
      notes: newTripConfig.notes || `مهمة محولة من المشوار (${sourceTrip.id})`,
      stops: [
        {
          id: `stop-${Date.now()}-origin`,
          sequence: 1,
          taskTitle: 'نقطة الانطلاق (المقر/المحطة)',
          location: { label: 'نقطة الانطلاق' },
          status: 'PENDING'
        },
        {
          id: `stop-${Date.now()}-dest`,
          sequence: 2,
          taskTitle: stopToMove.taskTitle,
          notes: stopToMove.notes,
          location: { ...stopToMove.location },
          status: 'PENDING'
        }
      ]
    });

    // Mark stop on source trip as REASSIGNED
    const refreshedTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const refreshedSourceIndex = refreshedTrips.findIndex(t => t.id === sourceTripId && t.company_id === companyId);
    if (refreshedSourceIndex !== -1) {
      const curSource = refreshedTrips[refreshedSourceIndex];
      const updatedStops = curSource.stops.map(s => {
        if (s.id === stopId) {
          return {
            ...s,
            status: 'REASSIGNED' as const,
            reassignedToTripId: newTrip.id,
            reassignedToVehicleId: newTrip.vehicle_id,
            reassignedToDriverId: newTrip.driver_id,
            notes: `${s.notes ? s.notes + ' | ' : ''}تم تفريغ المهمة في مشوار جديد: ${newTrip.id}`.trim()
          };
        }
        return s;
      });
      const finalSource: Trip = { ...curSource, stops: updatedStops };
      const splitSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, finalSource.id, finalSource);
      if (!splitSync.success) {
        throw new Error(splitSync.error || 'Failed to sync source trip split with cloud database');
      }
      refreshedTrips[refreshedSourceIndex] = finalSource;
      StorageEngine.setStored('fleet_trips_items', refreshedTrips);
      return { sourceTrip: finalSource, newTrip };
    }

    return { sourceTrip, newTrip };
  }

  /**
   * Helper to update vehicle's last known location and optional status
   */
  public static async updateVehicleLocationAndStatus(
    companyId: string,
    vehicleId: string,
    location?: VehicleLocation,
    status?: VehicleStatus
  ): Promise<Vehicle | null> {
    const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const vIndex = allVehicles.findIndex(v => v.id === vehicleId && v.company_id === companyId);
    if (vIndex === -1) return null;

    const current = allVehicles[vIndex];
    const updated: Vehicle = {
      ...current,
      status: status || current.status,
      last_known_location: location || current.last_known_location
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.VEHICLES, updated.id, updated);
    if (!syncRes.success) {
      console.warn(`Failed to sync vehicle status/location for ${vehicleId}:`, syncRes.error);
    }

    allVehicles[vIndex] = updated;
    StorageEngine.setStored('fleet_vehicles_items', allVehicles);

    return updated;
  }

  /**
   * Haversine formula to compute great-circle distance between two GPS coordinates in Kilometers
   */
  public static calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return calculateDistanceKmHelper(lat1, lon1, lat2, lon2);
  }

  /**
   * Reassigns an active/draft trip from one vehicle to a replacement vehicle
   */
  public static async reassignTripVehicle(
    companyId: string,
    operatorId: string,
    tripId: string,
    newVehicleId: string,
    newDriverId?: string,
    reason?: string
  ): Promise<Trip> {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const tripIndex = allTrips.findIndex(t => t.id === tripId && t.company_id === companyId);
    if (tripIndex === -1) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const trip = allTrips[tripIndex];
    const oldVehicleId = trip.vehicle_id;

    // Find new vehicle to deduce driver if not provided
    const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const newVeh = allVehicles.find(v => v.id === newVehicleId && v.company_id === companyId);
    if (!newVeh) {
      throw new Error(`Target vehicle ${newVehicleId} not found`);
    }

    const updatedTrip: Trip = {
      ...trip,
      vehicle_id: newVehicleId,
      driver_id: newDriverId || trip.driver_id,
      reassignedFromVehicleId: oldVehicleId,
      reassignedAt: new Date().toISOString(),
      reassignReason: reason || 'إعادة توزيع بسبب تعطل المركبة الأصلية'
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, updatedTrip.id, updatedTrip);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync trip vehicle reassignment with cloud database');
    }

    allTrips[tripIndex] = updatedTrip;
    StorageEngine.setStored('fleet_trips_items', allTrips);

    return updatedTrip;
  }

  /**
   * Retrieves open/active trips assigned to a specific vehicle
   */
  public static getOpenTripsForVehicle(companyId: string, vehicleId: string): Trip[] {
    const trips = this.getTripsByCompany(companyId);
    return trips.filter(t => 
      t.vehicle_id === vehicleId && 
      ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'DISPATCHED', 'IN_PROGRESS'].includes(t.status)
    );
  }

  /**
   * Suggests the nearest available vehicles to a target location (e.g. broken vehicle or task coordinates)
   * to minimize travel time and diesel consumption.
   */
  public static suggestNearestVehiclesForTasks(
    companyId: string,
    targetCoords: { lat: number; lng: number },
    excludeVehicleId?: string
  ): Array<{ vehicle: Vehicle; distanceKm: number; lastLocationLabel?: string }> {
    const allVehicles = this.getVehiclesByOrgUnit(companyId);
    
    // Candidates: ACTIVE or DISPATCHED vehicles (not OUT_OF_SERVICE or BREAKDOWN)
    const available = allVehicles.filter(v => 
      v.id !== excludeVehicleId && 
      !['BREAKDOWN', 'OUT_OF_SERVICE', 'MAINTENANCE', 'INACTIVE'].includes(v.status)
    );

    const candidatesWithDistance = available.map(v => {
      if (v.last_known_location && typeof v.last_known_location.lat === 'number' && typeof v.last_known_location.lng === 'number') {
        const dist = this.calculateDistanceKm(
          v.last_known_location.lat,
          v.last_known_location.lng,
          targetCoords.lat,
          targetCoords.lng
        );
        return {
          vehicle: v,
          distanceKm: dist,
          lastLocationLabel: v.last_known_location.label || `${v.last_known_location.lat.toFixed(3)}, ${v.last_known_location.lng.toFixed(3)}`
        };
      }
      // If no GPS coords known yet, assign large distance
      return {
        vehicle: v,
        distanceKm: 99999,
        lastLocationLabel: 'الموقع غير مسجل بعد'
      };
    });

    // Sort by shortest distance first
    candidatesWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);

    return candidatesWithDistance;
  }

  /**
   * Updates a vehicle's status (e.g. BREAKDOWN, MAINTENANCE, ACTIVE)
   * and returns open trips affected if out of service.
   */
  public static async updateVehicleStatus(
    companyId: string,
    operatorId: string,
    vehicleId: string,
    status: VehicleStatus,
    notes?: string
  ): Promise<{ vehicle: Vehicle; affectedTrips: Trip[] }> {
    const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const vIndex = allVehicles.findIndex(v => v.id === vehicleId && v.company_id === companyId);
    if (vIndex === -1) {
      throw new Error(`Vehicle ${vehicleId} not found`);
    }

    const current = allVehicles[vIndex];
    const updated: Vehicle = {
      ...current,
      status
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.VEHICLES, updated.id, updated);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync vehicle status with cloud database');
    }

    allVehicles[vIndex] = updated;
    StorageEngine.setStored('fleet_vehicles_items', allVehicles);

    const isOutOfService = ['BREAKDOWN', 'OUT_OF_SERVICE', 'MAINTENANCE', 'INACTIVE'].includes(status);
    const affectedTrips = isOutOfService ? this.getOpenTripsForVehicle(companyId, vehicleId) : [];

    return { vehicle: updated, affectedTrips };
  }

  /**
   * Retrieves vehicles filtered by company and optional organization unit subtree
   */
  public static getVehiclesByOrgUnit(companyId: string, org_unit_id?: string): Vehicle[] {
    const all = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const companyVehicles = all.filter(v => v.company_id === companyId);

    if (!org_unit_id || org_unit_id === 'ALL') {
      return companyVehicles;
    }

    const validSubtreeIds = new Set(OrganizationEngine.getSubtreeUnitIds(org_unit_id, companyId));
    return companyVehicles.filter(v => v.org_unit_id && validSubtreeIds.has(v.org_unit_id));
  }

  /**
   * Registers a new vehicle in the fleet with automatic sequence numbering and cost center resolution
   */
  public static async createVehicle(
    companyId: string,
    data: {
      code?: string;
      plateNumber: string;
      make?: string;
      model?: string;
      year?: number;
      type: VehicleType;
      status?: VehicleStatus;
      driverName?: string;
      odometerReading?: number;
      fuelCapacity?: number;
      org_unit_id?: string;
      cost_center_id?: string;
    }
  ): Promise<Vehicle> {
    if (!data.plateNumber || !data.plateNumber.trim()) {
      throw new Error('Plate number is required');
    }
    if (!data.type) {
      throw new Error('Vehicle type is required');
    }
    if (!data.driverName || !data.driverName.trim()) {
      throw new Error('Driver name is required');
    }

    const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const targetOrgUnit = data.org_unit_id || undefined;

    let targetCostCenter = data.cost_center_id;
    if (!targetCostCenter && targetOrgUnit) {
      const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
      if (cc) targetCostCenter = cc.id;
    }

    // Code generation
    let code = data.code?.trim() || '';
    if (!code) {
      try {
        const genResult = await DocumentNumberEngine.generateNextNumberAsync({
          companyId,
          documentType: 'FLEET',
          org_unit_id: targetOrgUnit
        });
        code = genResult.documentNumber;
      } catch {
        const nextNo = 101 + allVehicles.filter(v => v.company_id === companyId).length;
        code = `FLT-${nextNo}`;
      }
    }

    const newVehicle: Vehicle = {
      id: `veh-${crypto.randomUUID()}`,
      company_id: companyId,
      org_unit_id: targetOrgUnit,
      cost_center_id: targetCostCenter,
      code,
      plateNumber: data.plateNumber.trim(),
      make: data.make?.trim() || '',
      model: data.model?.trim() || '',
      year: Number(data.year) || new Date().getFullYear(),
      type: data.type,
      status: data.status || 'ACTIVE',
      driverName: data.driverName?.trim() || '',
      odometerReading: Number(data.odometerReading) || 0,
      fuelCapacity: Number(data.fuelCapacity) || 0,
      createdAt: new Date().toISOString()
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.VEHICLES, newVehicle.id, newVehicle);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync vehicle with cloud database');
    }

    const updated = [...allVehicles, newVehicle];
    StorageEngine.setStored('fleet_vehicles_items', updated);

    return newVehicle;
  }

  /**
   * Logs a vehicle maintenance service, updates odometer, and posts GL expense
   */
  public static async logMaintenance(
    companyId: string,
    operatorId: string,
    data: {
      vehicle_id: string;
      maintenanceDate: string;
      type: 'ROUTINE' | 'REPAIR' | 'OIL_CHANGE' | 'TIRES' | 'INSPECTION';
      description: string;
      cost: number;
      providerName?: string;
      odometerAtService: number;
      org_unit_id?: string;
      cost_center_id?: string;
    }
  ): Promise<MaintenanceLog> {
    const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const vehicle = allVehicles.find(v => v.id === data.vehicle_id);

    const targetOrgUnit = data.org_unit_id || vehicle?.org_unit_id || undefined;
    let targetCostCenter = data.cost_center_id || vehicle?.cost_center_id;

    if (!targetCostCenter && targetOrgUnit) {
      const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
      if (cc) targetCostCenter = cc.id;
    }

    const log: MaintenanceLog = {
      id: `maint-${Date.now()}`,
      company_id: companyId,
      vehicle_id: data.vehicle_id,
      org_unit_id: targetOrgUnit,
      cost_center_id: targetCostCenter,
      maintenanceDate: data.maintenanceDate,
      type: data.type,
      description: data.description,
      cost: Number(data.cost),
      providerName: data.providerName || '',
      odometerAtService: Number(data.odometerAtService),
      createdAt: new Date().toISOString()
    };

    const logSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.MAINTENANCE_LOGS, log.id, log);
    if (!logSync.success) {
      throw new Error(logSync.error || 'Failed to sync maintenance log with cloud database');
    }

    const logs = StorageEngine.getStored<MaintenanceLog[]>('fleet_maintenance_logs', []);
    StorageEngine.setStored('fleet_maintenance_logs', [...logs, log]);

    // Update vehicle odometer and maintenance thresholds
    if (vehicle) {
      const currentThresholds = vehicle.maintenanceThresholds || {};
      const updatedThresholds: VehicleMaintenanceThresholds = { ...currentThresholds };
      const serviceKm = Number(data.odometerAtService) || vehicle.odometerReading || 0;

      if (data.type === 'OIL_CHANGE') {
        updatedThresholds.lastOilChangeKm = serviceKm;
      } else if (data.type === 'ROUTINE') {
        updatedThresholds.lastRoutineKm = serviceKm;
        updatedThresholds.lastOilChangeKm = serviceKm;
      } else if (data.type === 'TIRES') {
        updatedThresholds.lastTireKm = serviceKm;
      }

      const finalOdo = Math.max(vehicle.odometerReading || 0, serviceKm);
      const updatedVehicle: Vehicle = {
        ...vehicle,
        odometerReading: finalOdo,
        maintenanceThresholds: updatedThresholds
      };

      const vehSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.VEHICLES, vehicle.id, updatedVehicle);
      if (vehSync.success) {
        const updatedVehicles = allVehicles.map(v => v.id === vehicle.id ? updatedVehicle : v);
        StorageEngine.setStored('fleet_vehicles_items', updatedVehicles);
      }
    }

    // Post GL Double-Entry for Maintenance Expense (510301)
    if (log.cost > 0) {
      try {
        await AccountingBusinessEngine.postOperationalDoubleEntry(
          companyId,
          operatorId,
          `FLT-MAINT-${Date.now()}`,
          `مصاريف صيانة مركبة أسطول (${vehicle?.plateNumber || data.vehicle_id}): ${data.description}`,
          `Fleet vehicle maintenance cost (${vehicle?.plateNumber || data.vehicle_id}): ${data.description}`,
          [
            { accountCode: '510301', debit: log.cost, credit: 0, notes: `صيانة مركبات الأسطول - ${vehicle?.code}` },
            { accountCode: '110101', debit: 0, credit: log.cost, notes: `سداد مصاريف صيانة من الخزينة` }
          ],
          {
            org_unit_id: targetOrgUnit,
            cost_center_id: targetCostCenter
          }
        );
      } catch (err) {
        console.error('Fleet maintenance GL post error:', err);
      }
    }

    return log;
  }

  /**
   * Logs fuel refill for a vehicle and posts GL fuel expense
   */
  public static async logFuel(
    companyId: string,
    operatorId: string,
    data: {
      vehicle_id: string;
      logDate: string;
      liters: number;
      costPerLiter: number;
      odometerReading: number;
      org_unit_id?: string;
      cost_center_id?: string;
    }
  ): Promise<FuelLog> {
    const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const vehicle = allVehicles.find(v => v.id === data.vehicle_id);

    const targetOrgUnit = data.org_unit_id || vehicle?.org_unit_id || undefined;
    let targetCostCenter = data.cost_center_id || vehicle?.cost_center_id;

    if (!targetCostCenter && targetOrgUnit) {
      const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
      if (cc) targetCostCenter = cc.id;
    }

    const totalCost = Number(data.liters) * Number(data.costPerLiter);

    const log: FuelLog = {
      id: `fuel-${Date.now()}`,
      company_id: companyId,
      vehicle_id: data.vehicle_id,
      org_unit_id: targetOrgUnit,
      cost_center_id: targetCostCenter,
      logDate: data.logDate,
      liters: Number(data.liters),
      costPerLiter: Number(data.costPerLiter),
      totalCost,
      odometerReading: Number(data.odometerReading),
      createdAt: new Date().toISOString()
    };

    const fuelSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.FUEL_LOGS, log.id, log);
    if (!fuelSync.success) {
      throw new Error(fuelSync.error || 'Failed to sync fuel log with cloud database');
    }

    const logs = StorageEngine.getStored<FuelLog[]>('fleet_fuel_logs', []);
    StorageEngine.setStored('fleet_fuel_logs', [...logs, log]);

    // Update vehicle odometer
    if (vehicle && Number(data.odometerReading) > vehicle.odometerReading) {
      const updatedVehicle = { ...vehicle, odometerReading: Number(data.odometerReading) };
      const vehSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.VEHICLES, vehicle.id, updatedVehicle);
      if (vehSync.success) {
        const updatedVehicles = allVehicles.map(v => v.id === vehicle.id ? updatedVehicle : v);
        StorageEngine.setStored('fleet_vehicles_items', updatedVehicles);
      }
    }

    // Post GL Double-Entry for Fuel Expense (510302)
    if (totalCost > 0) {
      try {
        await AccountingBusinessEngine.postOperationalDoubleEntry(
          companyId,
          operatorId,
          `FLT-FUEL-${Date.now()}`,
          `مصاريف وقود مركبة أسطول (${vehicle?.plateNumber || data.vehicle_id}): ${data.liters} لتر`,
          `Fleet vehicle fuel expense (${vehicle?.plateNumber || data.vehicle_id}): ${data.liters} L`,
          [
            { accountCode: '510302', debit: totalCost, credit: 0, notes: `وقود ومحروقات أسطول - ${vehicle?.code}` },
            { accountCode: '110101', debit: 0, credit: totalCost, notes: `سداد وقود من الخزينة` }
          ],
          {
            org_unit_id: targetOrgUnit,
            cost_center_id: targetCostCenter
          }
        );
      } catch (err) {
        console.error('Fleet fuel GL post error:', err);
      }
    }

    return log;
  }

  /**
   * Normalizes a task title or type for consistent multi-tenant indexing
   */
  public static normalizeTaskType(task: string): string {
    return normalizeTaskTypeHelper(task);
  }

  /**
   * Retrieves all learned task locations for a company, optionally filtered by org_unit_id / task_type
   */
  public static getLearnedLocations(
    companyId: string,
    org_unit_id?: string,
    task_type?: string
  ): LearnedTaskLocation[] {
    const all = StorageEngine.getStored<LearnedTaskLocation[]>('fleet_learned_locations_items', []);
    let filtered = all.filter(l => l.company_id === companyId);

    if (org_unit_id && org_unit_id !== 'ALL') {
      filtered = filtered.filter(l => l.org_unit_id === org_unit_id);
    }

    if (task_type) {
      const norm = this.normalizeTaskType(task_type);
      filtered = filtered.filter(l => this.normalizeTaskType(l.task_type) === norm);
    }

    return filtered;
  }

  /**
   * Suggests top 2-3 past known locations for a given task type strictly within the specific org unit / region.
   * Never mixes locations across different regions or companies!
   */
  public static getSuggestedLocationsForTask(
    companyId: string,
    org_unit_id: string,
    task_type: string
  ): LearnedLocationHistoryEntry[] {
    if (!companyId || !org_unit_id || !task_type) {
      return [];
    }

    const norm = this.normalizeTaskType(task_type);
    if (!norm) return [];

    const all = StorageEngine.getStored<LearnedTaskLocation[]>('fleet_learned_locations_items', []);
    const match = all.find(
      l => l.company_id === companyId && 
           l.org_unit_id === org_unit_id && 
           this.normalizeTaskType(l.task_type) === norm
    );

    if (!match) return [];

    const candidates: LearnedLocationHistoryEntry[] = [];
    
    // Add primary current location
    candidates.push({
      label: match.label,
      lat: match.lat,
      lng: match.lng,
      accuracy: match.accuracy,
      visitedAt: match.lastVisitedAt
    });

    // Add unique past historical points (up to 3 total)
    if (match.history && Array.isArray(match.history)) {
      for (const h of match.history) {
        if (candidates.length >= 3) break;
        const exists = candidates.some(c => 
          Math.abs(c.lat - h.lat) < 0.0001 && Math.abs(c.lng - h.lng) < 0.0001
        );
        if (!exists) {
          candidates.push(h);
        }
      }
    }

    return candidates.slice(0, 3);
  }

  /**
   * Records or updates a learned location reference keyed by (company_id + org_unit_id + task_type)
   */
  public static async recordLearnedLocation(
    companyId: string,
    org_unit_id: string,
    task_type: string,
    location: {
      label: string;
      lat: number;
      lng: number;
      accuracy?: number;
      tripId?: string;
    }
  ): Promise<LearnedTaskLocation | null> {
    if (!companyId || !org_unit_id || !task_type || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      return null;
    }

    const norm = this.normalizeTaskType(task_type);
    if (!norm) return null;

    const all = StorageEngine.getStored<LearnedTaskLocation[]>('fleet_learned_locations_items', []);
    const now = new Date().toISOString();
    const existingIndex = all.findIndex(
      l => l.company_id === companyId && 
           l.org_unit_id === org_unit_id && 
           this.normalizeTaskType(l.task_type) === norm
    );

    let resultEntry: LearnedTaskLocation;

    if (existingIndex >= 0) {
      const current = all[existingIndex];
      const prevHistory = current.history || [];
      
      const newHistoryEntry: LearnedLocationHistoryEntry = {
        label: location.label || current.label,
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
        visitedAt: now,
        tripId: location.tripId
      };

      const updatedHistory = [newHistoryEntry, ...prevHistory.filter(h => 
        !(Math.abs(h.lat - location.lat) < 0.0001 && Math.abs(h.lng - location.lng) < 0.0001)
      )].slice(0, 10);

      resultEntry = {
        ...current,
        label: location.label || current.label,
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
        visitCount: (current.visitCount || 1) + 1,
        lastVisitedAt: now,
        history: updatedHistory
      };

      all[existingIndex] = resultEntry;
    } else {
      resultEntry = {
        id: `lloc-${crypto.randomUUID()}`,
        company_id: companyId,
        org_unit_id: org_unit_id,
        task_type: task_type.trim(),
        label: location.label || task_type.trim(),
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
        visitCount: 1,
        lastVisitedAt: now,
        history: [{
          label: location.label || task_type.trim(),
          lat: location.lat,
          lng: location.lng,
          accuracy: location.accuracy,
          visitedAt: now,
          tripId: location.tripId
        }]
      };
      all.push(resultEntry);
    }

    const locSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.LEARNED_LOCATIONS, resultEntry.id, resultEntry);
    if (!locSync.success) {
      console.warn('Failed to sync learned location to cloud:', locSync.error);
    }

    StorageEngine.setStored('fleet_learned_locations_items', all);

    return resultEntry;
  }

  /**
   * Fast creation of an Internal Emergency Trip directly from the Fleet system.
   * Completely self-contained with no external chat/messaging dependencies.
   */
  public static async createEmergencyTrip(
    companyId: string,
    creatorId: string,
    data: {
      vehicle_id: string;
      driver_id: string;
      task_type: string; // e.g. "نقل عاجل", "تغيير اسطوانات غاز طارئ", "صيانة طارئة"
      org_unit_id: string;
      notes?: string;
      startLocationLabel?: string;
      startLat?: number;
      startLng?: number;
      destinationLabel?: string;
      destLat?: number;
      destLng?: number;
      confirmDespiteConflict?: boolean;
      conflictOverrideReason?: string;
    }
  ): Promise<Trip> {
    const now = new Date().toISOString();

    const startStop: TripStop = {
      id: `stop-${Date.now()}-1`,
      sequence: 1,
      taskTitle: 'نقطة الانطلاق (مشوار طارئ)',
      location: {
        org_unit_id: data.org_unit_id,
        label: data.startLocationLabel || 'نقطة الانطلاق',
        lat: data.startLat,
        lng: data.startLng
      },
      status: 'IN_PROGRESS',
      startedAt: now
    };

    const destStop: TripStop = {
      id: `stop-${Date.now()}-2`,
      sequence: 2,
      taskTitle: data.task_type,
      notes: data.notes || '',
      location: {
        org_unit_id: data.org_unit_id,
        label: data.destinationLabel || data.task_type,
        lat: data.destLat,
        lng: data.destLng
      },
      status: 'PENDING'
    };

    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);

    // Guard: warn + require explicit confirmation before double-booking a busy vehicle
    const conflictingTrips = this.getOpenTripsForVehicle(companyId, data.vehicle_id);
    if (conflictingTrips.length > 0 && !data.confirmDespiteConflict) {
      throw new Error(`VEHICLE_BUSY:${data.vehicle_id}:${conflictingTrips[0].id}`);
    }

    const emergencyTrip: Trip = {
      id: `trip-emg-${crypto.randomUUID()}`,
      company_id: companyId,
      org_unit_id: data.org_unit_id,
      vehicle_id: data.vehicle_id,
      driver_id: data.driver_id,
      stops: [startStop, destStop],
      tripType: `مشوار طارئ - ${data.task_type}`,
      isEmergency: true,
      status: 'DISPATCHED',
      scheduledAt: now,
      startedAt: now,
      dispatchedAt: now,
      notes: conflictingTrips.length > 0 && data.confirmDespiteConflict
        ? `${data.notes || 'مشوار طارئ داخلي'} | تم سحب المركبة رغم انشغالها بمشوار آخر - السبب: ${data.conflictOverrideReason || 'غير محدد'}`
        : (data.notes || 'مشوار طارئ داخلي'),
      createdBy: creatorId,
      createdAt: now
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, emergencyTrip.id, emergencyTrip);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync emergency trip with cloud database');
    }

    const updated = [...allTrips, emergencyTrip];
    StorageEngine.setStored('fleet_trips_items', updated);

    return emergencyTrip;
  }

  /**
   * Executes a supervisor decision on an open trip affected by vehicle breakdown:
   * 1. REASSIGN: Reassigns to another vehicle & driver with distance optimization.
   * 2. POSTPONE: Delays the trip to a future date/time with a recorded reason.
   * 3. SUSPEND: Leaves the trip pending under breakdown status for later resolution.
   */
  public static async executeBreakdownDecision(
    companyId: string,
    operatorId: string,
    data: {
      tripId: string;
      decision: BreakdownDecisionType;
      fromVehicleId: string;
      toVehicleId?: string;
      toDriverId?: string;
      reason: string;
      postponedUntil?: string;
      confirmDespiteConflict?: boolean;
    }
  ): Promise<Trip> {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const tripIndex = allTrips.findIndex(t => t.id === data.tripId && t.company_id === companyId);
    if (tripIndex === -1) {
      throw new Error(`Trip ${data.tripId} not found`);
    }

    const trip = allTrips[tripIndex];
    const now = new Date().toISOString();

    const decisionLog: BreakdownDecisionLog = {
      id: `bd-${crypto.randomUUID()}`,
      decision: data.decision,
      fromVehicleId: data.fromVehicleId,
      toVehicleId: data.toVehicleId,
      toDriverId: data.toDriverId,
      reason: data.reason || 'قرار عطل تشغيلي',
      postponedUntil: data.postponedUntil,
      operatorId,
      timestamp: now
    };

    const existingLogs = trip.breakdownDecisions || [];
    let updatedTrip: Trip;

    if (data.decision === 'REASSIGN') {
      if (!data.toVehicleId) {
        throw new Error('Target vehicle is required for REASSIGN decision');
      }

      // Guard: warn + require explicit confirmation before double-booking the replacement vehicle
      const conflictingTrips = this.getOpenTripsForVehicle(companyId, data.toVehicleId)
        .filter(t => t.id !== data.tripId);
      if (conflictingTrips.length > 0 && !data.confirmDespiteConflict) {
        throw new Error(`VEHICLE_BUSY:${data.toVehicleId}:${conflictingTrips[0].id}`);
      }

      // Check if target vehicle has a driver if toDriverId not explicitly passed
      const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
      const targetVeh = allVehicles.find(v => v.id === data.toVehicleId && v.company_id === companyId);

      updatedTrip = {
        ...trip,
        vehicle_id: data.toVehicleId,
        driver_id: data.toDriverId || targetVeh?.driverName || trip.driver_id,
        reassignedFromVehicleId: data.fromVehicleId,
        reassignedAt: now,
        reassignReason: data.reason || 'إعادة توزيع بعد تعطل المركبة الأصلية',
        breakdownDecisions: [...existingLogs, decisionLog]
      };
    } else if (data.decision === 'POSTPONE') {
      updatedTrip = {
        ...trip,
        status: 'POSTPONED',
        postponeReason: data.reason,
        postponedUntil: data.postponedUntil,
        breakdownDecisions: [...existingLogs, decisionLog]
      };
    } else {
      // SUSPEND
      updatedTrip = {
        ...trip,
        status: 'SUSPENDED_BREAKDOWN',
        reassignReason: data.reason,
        breakdownDecisions: [...existingLogs, decisionLog]
      };
    }

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, updatedTrip.id, updatedTrip);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync breakdown decision with cloud database');
    }

    allTrips[tripIndex] = updatedTrip;
    StorageEngine.setStored('fleet_trips_items', allTrips);

    if (data.decision === 'POSTPONE' || data.decision === 'SUSPEND') {
      try {
        await this.endTripTrack(companyId, data.tripId, 'SUSPENDED');
      } catch (err) {
        console.warn('Failed to suspend trip tracking track:', err);
      }
    }

    return updatedTrip;
  }

  /**
   * Executes a supervisor decision on an INDIVIDUAL task/stop inside an affected trip:
   * 1. REASSIGN: Moves the individual stop to another active trip or creates a dedicated transfer trip.
   * 2. POSTPONE: Sets postponement datetime on the stop and records audit note.
   * 3. SUSPEND: Flags stop as pending without blocking the overall vehicle resolution.
   */
  public static async executeIndividualStopDecision(
    companyId: string,
    operatorId: string,
    data: {
      tripId: string;
      stopId: string;
      decision: BreakdownDecisionType;
      fromVehicleId: string;
      toVehicleId?: string;
      toDriverId?: string;
      reason: string;
      postponedUntil?: string;
    }
  ): Promise<{ sourceTrip: Trip; targetTrip?: Trip }> {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const sourceIndex = allTrips.findIndex(t => t.id === data.tripId && t.company_id === companyId);
    if (sourceIndex === -1) {
      throw new Error(`Trip ${data.tripId} not found`);
    }

    const sourceTrip = allTrips[sourceIndex];
    const stopIndex = sourceTrip.stops.findIndex(s => s.id === data.stopId);
    if (stopIndex === -1) {
      throw new Error(`Stop ${data.stopId} not found in trip ${data.tripId}`);
    }

    const targetStop = sourceTrip.stops[stopIndex];
    const now = new Date().toISOString();

    const decisionLog: BreakdownDecisionLog = {
      id: `bd-stop-${crypto.randomUUID()}`,
      decision: data.decision,
      stopId: data.stopId,
      stopTaskTitle: targetStop.taskTitle || targetStop.location.label,
      fromVehicleId: data.fromVehicleId,
      toVehicleId: data.toVehicleId,
      toDriverId: data.toDriverId,
      reason: data.reason || 'قرار عطل تشغيلي لمهمة فردية',
      postponedUntil: data.postponedUntil,
      operatorId,
      timestamp: now
    };

    let targetTrip: Trip | undefined;

    if (data.decision === 'REASSIGN') {
      if (!data.toVehicleId) {
        throw new Error('Target vehicle is required for task reassignment');
      }

      const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
      const targetVeh = allVehicles.find(v => v.id === data.toVehicleId && v.company_id === companyId);
      const targetDriver = data.toDriverId || targetVeh?.driverName || sourceTrip.driver_id;

      // Find an open/in-progress trip for this target vehicle, or create a transfer trip
      const existingTargetTripIndex = allTrips.findIndex(
        t => t.company_id === companyId && 
             t.vehicle_id === data.toVehicleId && 
             ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'DISPATCHED', 'IN_PROGRESS'].includes(t.status)
      );

      if (existingTargetTripIndex >= 0) {
        const existing = allTrips[existingTargetTripIndex];
        const newStop: TripStop = {
          ...targetStop,
          id: `stop-reassigned-${crypto.randomUUID()}`,
          sequence: existing.stops.length + 1,
          notes: `${targetStop.notes || ''} [مهمة محولة من المركبة ${data.fromVehicleId}]`.trim(),
          status: 'PENDING'
        };

        targetTrip = {
          ...existing,
          stops: [...existing.stops, newStop],
          breakdownDecisions: [...(existing.breakdownDecisions || []), decisionLog]
        };
        allTrips[existingTargetTripIndex] = targetTrip;
      } else {
        // Create new transfer trip for the target vehicle
        const startStop: TripStop = {
          id: `stop-transfer-start-${Date.now()}`,
          sequence: 1,
          taskTitle: 'نقطة الانطلاق (تحويل مهمة)',
          location: {
            org_unit_id: targetStop.location.org_unit_id || sourceTrip.org_unit_id,
            label: 'نقطة الانطلاق للمهمة المحولة',
            lat: sourceTrip.startLocation?.lat,
            lng: sourceTrip.startLocation?.lng
          },
          status: 'PENDING'
        };

        const destStop: TripStop = {
          ...targetStop,
          id: `stop-transferred-${Date.now()}`,
          sequence: 2,
          notes: `${targetStop.notes || ''} [مهمة محولة من المركبة ${data.fromVehicleId}]`.trim(),
          status: 'PENDING'
        };

        targetTrip = {
          id: `trip-reassigned-${crypto.randomUUID()}`,
          company_id: companyId,
          org_unit_id: targetStop.location.org_unit_id || sourceTrip.org_unit_id,
          vehicle_id: data.toVehicleId,
          driver_id: targetDriver,
          stops: [startStop, destStop],
          tripType: `تحويل مهمة: ${targetStop.taskTitle || targetStop.location.label}`,
          status: 'DRAFT',
          scheduledAt: now,
          notes: `تحويل مهمة فردية بعد عطل المركبة الأصلية: ${data.reason}`,
          reassignedFromVehicleId: data.fromVehicleId,
          reassignedAt: now,
          reassignReason: data.reason,
          breakdownDecisions: [decisionLog],
          createdBy: operatorId,
          createdAt: now
        };
        allTrips.push(targetTrip);
      }

      // Mark the original stop as skipped/reassigned in the source trip
      const updatedSourceStops = [...sourceTrip.stops];
      updatedSourceStops[stopIndex] = {
        ...targetStop,
        status: 'SKIPPED',
        reassignedToTripId: targetTrip.id,
        reassignedToVehicleId: data.toVehicleId,
        reassignedToDriverId: targetDriver,
        notes: `${targetStop.notes || ''} [تم تحويل المهمة إلى ${data.toVehicleId} - السائق: ${targetDriver}]`.trim()
      };

      // Check if all non-start stops in source trip are completed or skipped
      const pendingRemaining = updatedSourceStops.filter(s => s.sequence > 1 && !['COMPLETED', 'SKIPPED'].includes(s.status));
      const sourceStatus = pendingRemaining.length === 0 ? 'COMPLETED' : sourceTrip.status;

      sourceTrip.stops = updatedSourceStops;
      sourceTrip.status = sourceStatus;
      sourceTrip.breakdownDecisions = [...(sourceTrip.breakdownDecisions || []), decisionLog];

    } else if (data.decision === 'POSTPONE') {
      const updatedSourceStops = [...sourceTrip.stops];
      updatedSourceStops[stopIndex] = {
        ...targetStop,
        status: 'PENDING',
        postponedUntil: data.postponedUntil,
        postponeReason: data.reason,
        notes: `${targetStop.notes || ''} [مؤجلة إلى: ${data.postponedUntil}]`.trim()
      };
      sourceTrip.stops = updatedSourceStops;
      sourceTrip.breakdownDecisions = [...(sourceTrip.breakdownDecisions || []), decisionLog];

    } else {
      // SUSPEND
      const updatedSourceStops = [...sourceTrip.stops];
      updatedSourceStops[stopIndex] = {
        ...targetStop,
        status: 'PENDING',
        notes: `${targetStop.notes || ''} [معلقة لعطل بالمركبة]`.trim()
      };
      sourceTrip.stops = updatedSourceStops;
      sourceTrip.breakdownDecisions = [...(sourceTrip.breakdownDecisions || []), decisionLog];
    }

    const sourceSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, sourceTrip.id, sourceTrip);
    if (!sourceSync.success) {
      throw new Error(sourceSync.error || 'Failed to sync source trip decision with cloud database');
    }
    if (targetTrip) {
      const targetSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, targetTrip.id, targetTrip);
      if (!targetSync.success) {
        throw new Error(targetSync.error || 'Failed to sync target trip decision with cloud database');
      }
    }

    allTrips[sourceIndex] = sourceTrip;
    StorageEngine.setStored('fleet_trips_items', allTrips);

    return { sourceTrip, targetTrip };
  }

  /**
   * Retrieves trips assigned specifically to a driver
   */
  public static getTripsForDriver(companyId: string, driverIdOrName: string): Trip[] {
    const all = this.getTripsByCompany(companyId);
    if (!driverIdOrName) return [];
    const norm = driverIdOrName.trim().toLowerCase();
    return all.filter(t => 
      (t.driver_id && t.driver_id.toLowerCase() === norm) ||
      (t.driver_id && t.driver_id.includes(driverIdOrName))
    );
  }

  /**
   * Retrieves all chat messages for a specific trip
   */
  public static getTripChatMessages(companyId: string, tripId: string): TripChatMessage[] {
    if (!companyId || !tripId) return [];
    const all = StorageEngine.getStored<TripChatMessage[]>('fleet_trip_chat_messages', []);
    return all
      .filter(m => m.company_id === companyId && m.trip_id === tripId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  /**
   * Sends a message to a trip operational chat
   */
  public static async sendTripChatMessage(
    companyId: string,
    tripId: string,
    sender: { id: string; name: string; role?: 'DRIVER' | 'SUPERVISOR' | 'ADMIN' },
    messageText: string
  ): Promise<TripChatMessage> {
    if (!messageText.trim()) {
      throw new Error('Message cannot be empty');
    }

    const all = StorageEngine.getStored<TripChatMessage[]>('fleet_trip_chat_messages', []);
    const newMsg: TripChatMessage = {
      id: `tmsg-${crypto.randomUUID()}`,
      trip_id: tripId,
      company_id: companyId,
      sender_id: sender.id,
      sender_name: sender.name,
      sender_role: sender.role || 'SUPERVISOR',
      message: messageText.trim(),
      created_at: new Date().toISOString()
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.CHAT_MESSAGES, newMsg.id, newMsg);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync chat message with cloud database');
    }

    const updated = [...all, newMsg];
    StorageEngine.setStored('fleet_trip_chat_messages', updated);

    return newMsg;
  }

  /**
   * Retrieves all vehicle constraint rules for a company
   */
  public static getVehicleConstraints(companyId: string): VehicleConstraintRule[] {
    const all = StorageEngine.getStored<VehicleConstraintRule[]>('fleet_vehicle_constraints', []);
    return all.filter(c => c.company_id === companyId);
  }

  /**
   * Retrieves active vehicle constraint rules for a company, optionally filtered by vehicleId
   */
  public static getActiveVehicleConstraints(companyId: string, vehicleId?: string): VehicleConstraintRule[] {
    const all = this.getVehicleConstraints(companyId);
    return all.filter(c => c.is_active && (!vehicleId || c.vehicle_id === vehicleId));
  }

  /**
   * Creates or updates a vehicle access constraint rule
   */
  public static async saveVehicleConstraint(
    companyId: string,
    creatorId: string,
    data: {
      id?: string;
      vehicle_id: string;
      mode: VehicleConstraintMode;
      blocked_org_unit_ids?: string[];
      reason?: string;
      is_active?: boolean;
    }
  ): Promise<VehicleConstraintRule> {
    if (!data.vehicle_id) {
      throw new Error('Vehicle ID is required');
    }
    if (data.mode === 'BLOCK_SPECIFIC_LOCATIONS' && (!data.blocked_org_unit_ids || data.blocked_org_unit_ids.length === 0)) {
      throw new Error('Please select at least one location to block');
    }

    const all = StorageEngine.getStored<VehicleConstraintRule[]>('fleet_vehicle_constraints', []);
    const now = new Date().toISOString();

    if (data.id) {
      const idx = all.findIndex(c => c.id === data.id && c.company_id === companyId);
      if (idx !== -1) {
        const updatedRule: VehicleConstraintRule = {
          ...all[idx],
          vehicle_id: data.vehicle_id,
          mode: data.mode,
          blocked_org_unit_ids: data.mode === 'BLOCK_SPECIFIC_LOCATIONS' ? (data.blocked_org_unit_ids || []) : [],
          reason: data.reason || '',
          is_active: data.is_active !== undefined ? data.is_active : all[idx].is_active,
        };

        const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.CONSTRAINTS, updatedRule.id, updatedRule);
        if (!syncRes.success) {
          throw new Error(syncRes.error || 'Failed to sync constraint rule with cloud database');
        }

        all[idx] = updatedRule;
        StorageEngine.setStored('fleet_vehicle_constraints', all);
        return updatedRule;
      }
    }

    const newRule: VehicleConstraintRule = {
      id: `vconst-${crypto.randomUUID()}`,
      company_id: companyId,
      vehicle_id: data.vehicle_id,
      mode: data.mode,
      blocked_org_unit_ids: data.mode === 'BLOCK_SPECIFIC_LOCATIONS' ? (data.blocked_org_unit_ids || []) : [],
      reason: data.reason || '',
      is_active: data.is_active !== undefined ? data.is_active : true,
      created_by: creatorId,
      created_at: now
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.CONSTRAINTS, newRule.id, newRule);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync constraint rule with cloud database');
    }

    const updated = [...all, newRule];
    StorageEngine.setStored('fleet_vehicle_constraints', updated);
    return newRule;
  }

  /**
   * Toggles active status of a vehicle constraint rule
   */
  public static async toggleVehicleConstraint(
    companyId: string,
    constraintId: string,
    isActive: boolean
  ): Promise<VehicleConstraintRule> {
    const all = StorageEngine.getStored<VehicleConstraintRule[]>('fleet_vehicle_constraints', []);
    const idx = all.findIndex(c => c.id === constraintId && c.company_id === companyId);
    if (idx === -1) {
      throw new Error(`Vehicle constraint ${constraintId} not found`);
    }

    const updatedRule: VehicleConstraintRule = {
      ...all[idx],
      is_active: isActive
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.CONSTRAINTS, updatedRule.id, updatedRule);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync constraint toggle with cloud database');
    }

    all[idx] = updatedRule;
    StorageEngine.setStored('fleet_vehicle_constraints', all);
    return updatedRule;
  }

  /**
   * Deletes a vehicle constraint rule
   */
  public static async deleteVehicleConstraint(companyId: string, constraintId: string): Promise<void> {
    const delSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.CONSTRAINTS, constraintId, null);
    if (!delSync.success) {
      throw new Error(delSync.error || 'Failed to delete constraint rule from cloud database');
    }
    const all = StorageEngine.getStored<VehicleConstraintRule[]>('fleet_vehicle_constraints', []);
    const filtered = all.filter(c => !(c.id === constraintId && c.company_id === companyId));
    StorageEngine.setStored('fleet_vehicle_constraints', filtered);
  }

  /**
   * Retrieves all breadcrumb tracks for a company
   */
  public static getTracksByCompany(companyId: string): TripBreadcrumbTrack[] {
    const all = StorageEngine.getStored<TripBreadcrumbTrack[]>('fleet_trip_tracks', []);
    return all.filter(t => t.company_id === companyId);
  }

  /**
   * Retrieves a specific trip's breadcrumb track
   */
  public static getTripTrack(companyId: string, tripId: string): TripBreadcrumbTrack | null {
    const all = StorageEngine.getStored<TripBreadcrumbTrack[]>('fleet_trip_tracks', []);
    return all.find(t => t.trip_id === tripId && t.company_id === companyId) || null;
  }

  /**
   * Records a near real-time breadcrumb point for an active trip with strict throttling and validation.
   * Throttling: Enforces minimum interval in seconds (default 30s) between recorded points.
   * Scope: Strictly restricted to active trips (DISPATCHED or IN_PROGRESS).
   */
  public static async recordTripBreadcrumbPoint(
    companyId: string,
    tripId: string,
    vehicleId: string,
    driverId: string,
    point: {
      lat: number;
      lng: number;
      accuracy?: number;
      speed?: number | null;
      heading?: number | null;
      timestamp?: string;
    },
    minIntervalSeconds: number = 30
  ): Promise<{ recorded: boolean; track?: TripBreadcrumbTrack; reason?: string }> {
    if (!companyId || !tripId || !vehicleId || typeof point.lat !== 'number' || typeof point.lng !== 'number') {
      return { recorded: false, reason: 'Invalid tracking payload' };
    }

    // Reject GPS fixes with poor accuracy to avoid poisoning distance calculations with signal jumps
    const MAX_ACCEPTABLE_ACCURACY_METERS = 100;
    if (typeof point.accuracy === 'number' && point.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
      return { recorded: false, reason: `GPS accuracy too low (${Math.round(point.accuracy)}m), point discarded` };
    }

    // Verify trip exists and is strictly active
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const trip = allTrips.find(t => t.id === tripId && t.company_id === companyId);
    if (!trip) {
      return { recorded: false, reason: 'Trip not found' };
    }

    if (trip.status !== 'DISPATCHED' && trip.status !== 'IN_PROGRESS') {
      return { recorded: false, reason: `Trip is not in active state (current: ${trip.status})` };
    }

    const allTracks = StorageEngine.getStored<TripBreadcrumbTrack[]>('fleet_trip_tracks', []);
    let trackIndex = allTracks.findIndex(t => t.trip_id === tripId && t.company_id === companyId);
    const nowIso = point.timestamp || new Date().toISOString();
    const nowTime = new Date(nowIso).getTime();

    let track: TripBreadcrumbTrack;

    if (trackIndex >= 0) {
      track = allTracks[trackIndex];
      // Check if track was ended
      if (track.status !== 'ACTIVE' || track.is_active === false) {
        return { recorded: false, reason: 'Trip track is no longer active', track };
      }
      // Check throttling against last recorded point
      if (track.last_point && track.last_point.timestamp) {
        const lastTime = new Date(track.last_point.timestamp).getTime();
        const diffSeconds = (nowTime - lastTime) / 1000;
        if (diffSeconds < minIntervalSeconds) {
          return { 
            recorded: false, 
            reason: `Throttled: only ${diffSeconds.toFixed(1)}s elapsed since last recorded point (min: ${minIntervalSeconds}s)`,
            track 
          };
        }
      }
    } else {
      // Initialize new breadcrumb track for this trip
      track = {
        id: `track-${tripId}`,
        company_id: companyId,
        trip_id: tripId,
        vehicle_id: vehicleId,
        driver_id: driverId,
        status: 'ACTIVE',
        is_active: true,
        points: [],
        started_at: nowIso,
        updated_at: nowIso,
        total_distance_km: 0
      };
      allTracks.push(track);
      trackIndex = allTracks.length - 1;
    }

    // Prepare point
    const newPoint: TripBreadcrumbPoint = {
      lat: point.lat,
      lng: point.lng,
      accuracy: point.accuracy,
      speed: point.speed ?? null,
      heading: point.heading ?? null,
      timestamp: nowIso
    };

    // Calculate distance delta if there is a previous point
    let distanceDeltaKm = 0;
    if (track.last_point && typeof track.last_point.lat === 'number' && typeof track.last_point.lng === 'number') {
      distanceDeltaKm = this.calculateDistanceKm(
        track.last_point.lat,
        track.last_point.lng,
        newPoint.lat,
        newPoint.lng
      );
    }

    const MAX_TRACK_POINTS = 2000;
    const updatedPointsFull = [...track.points, newPoint];
    const updatedPoints = updatedPointsFull.length > MAX_TRACK_POINTS
      ? updatedPointsFull.slice(updatedPointsFull.length - MAX_TRACK_POINTS)
      : updatedPointsFull;
    const updatedTotalKm = Math.round(((track.total_distance_km || 0) + distanceDeltaKm) * 100) / 100;

    const updatedTrack: TripBreadcrumbTrack = {
      ...track,
      status: 'ACTIVE',
      is_active: true,
      points: updatedPoints,
      last_point: newPoint,
      updated_at: nowIso,
      total_distance_km: updatedTotalKm
    };

    const trackSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIP_TRACKS, updatedTrack.id, updatedTrack);
    if (!trackSync.success) {
      console.warn('Failed to sync breadcrumb track to cloud:', trackSync.error);
    }

    allTracks[trackIndex] = updatedTrack;
    StorageEngine.setStored('fleet_trip_tracks', allTracks);

    // Update vehicle's last known location for quick list display
    try {
      await this.updateVehicleLocationAndStatus(
        companyId,
        vehicleId,
        {
          lat: newPoint.lat,
          lng: newPoint.lng,
          accuracy: newPoint.accuracy,
          updatedAt: nowIso,
          label: 'تتبع مباشر (أثناء المشوار)'
        }
      );
    } catch (err) {
      console.warn('Failed to update vehicle last known location on breadcrumb:', err);
    }

    return { recorded: true, track: updatedTrack };
  }

  /**
   * Finalizes or suspends a trip's breadcrumb tracking log
   */
  public static async endTripTrack(
    companyId: string,
    tripId: string,
    finalStatus: 'COMPLETED' | 'SUSPENDED' | 'CANCELLED' = 'COMPLETED'
  ): Promise<TripBreadcrumbTrack | null> {
    const allTracks = StorageEngine.getStored<TripBreadcrumbTrack[]>('fleet_trip_tracks', []);
    const trackIndex = allTracks.findIndex(t => t.trip_id === tripId && t.company_id === companyId);
    if (trackIndex === -1) return null;

    const current = allTracks[trackIndex];
    const nowIso = new Date().toISOString();
    const updated: TripBreadcrumbTrack = {
      ...current,
      status: finalStatus,
      is_active: false,
      ended_at: nowIso,
      updated_at: nowIso
    };

    const trackSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIP_TRACKS, updated.id, updated);
    if (!trackSync.success) {
      console.warn('Failed to sync ended track to cloud:', trackSync.error);
    }

    allTracks[trackIndex] = updated;
    StorageEngine.setStored('fleet_trip_tracks', allTracks);
    return updated;
  }

  /**
   * Cancels a trip and stops live tracking
   */
  public static async cancelTrip(
    companyId: string,
    operatorId: string,
    tripId: string,
    reason?: string
  ): Promise<Trip> {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const tripIndex = allTrips.findIndex(t => t.id === tripId && t.company_id === companyId);
    if (tripIndex === -1) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const trip = allTrips[tripIndex];
    const now = new Date().toISOString();

    const updatedTrip: Trip = {
      ...trip,
      status: 'CANCELLED',
      postponeReason: reason || 'إلغاء المشوار'
    };

    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, updatedTrip.id, updatedTrip);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync cancelled trip with cloud database');
    }

    allTrips[tripIndex] = updatedTrip;
    StorageEngine.setStored('fleet_trips_items', allTrips);

    // Reset vehicle status to ACTIVE if it was dispatched
    await this.updateVehicleLocationAndStatus(
      companyId,
      trip.vehicle_id,
      undefined,
      'ACTIVE'
    );

    // End tracking
    await this.endTripTrack(companyId, tripId, 'CANCELLED');

    return updatedTrip;
  }

  /**
   * Phase 3: Checks if a current GPS coordinate is inside the geofence perimeter of a target stop or location.
   * Default radius: 150 meters (can be customized).
   */
  public static checkGeofenceArrival(
    currentCoord: { lat: number; lng: number },
    targetCoord: { lat: number; lng: number },
    geofenceRadiusMeters: number = 150,
    targetStop?: TripStop
  ): GeofenceArrivalCheckResult {
    return checkGeofenceArrivalHelper(
      currentCoord,
      targetCoord,
      geofenceRadiusMeters,
      targetStop
    );
  }

  /**
   * Phase 3: Automatically processes geofence arrivals for all pending stops in an active trip.
   * If the driver enters the geofence perimeter of a pending stop, records arrivedAt and arrivedLocation automatically.
   */
  public static async autoProcessTripArrivals(
    companyId: string,
    tripId: string,
    driverId: string,
    currentPoint: { lat: number; lng: number; accuracy?: number; timestamp?: string },
    geofenceRadiusMeters: number = 150
  ): Promise<{ trip: Trip; newlyArrivedStops: TripStop[] }> {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const tripIndex = allTrips.findIndex(t => t.id === tripId && t.company_id === companyId);
    if (tripIndex === -1) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const trip = allTrips[tripIndex];
    if (trip.status !== 'DISPATCHED' && trip.status !== 'IN_PROGRESS') {
      return { trip, newlyArrivedStops: [] };
    }

    const nowIso = currentPoint.timestamp || new Date().toISOString();
    const newlyArrivedStops: TripStop[] = [];

    const updatedStops = trip.stops.map(stop => {
      // Only process PENDING or IN_PROGRESS stops that have known coordinates
      if (
        (stop.status === 'PENDING' || stop.status === 'IN_PROGRESS') &&
        stop.location &&
        typeof stop.location.lat === 'number' &&
        typeof stop.location.lng === 'number'
      ) {
        const check = this.checkGeofenceArrival(
          { lat: currentPoint.lat, lng: currentPoint.lng },
          { lat: stop.location.lat, lng: stop.location.lng },
          geofenceRadiusMeters,
          stop
        );

        if (check.isInsideGeofence) {
          const arrivedStop: TripStop = {
            ...stop,
            status: 'ARRIVED',
            arrivedAt: stop.arrivedAt || nowIso,
            arrivedLocation: {
              label: stop.location.label,
              lat: currentPoint.lat,
              lng: currentPoint.lng,
              accuracy: currentPoint.accuracy,
              timestamp: nowIso
            }
          };
          newlyArrivedStops.push(arrivedStop);
          return arrivedStop;
        }
      }
      return stop;
    });

    if (newlyArrivedStops.length > 0) {
      const updatedTrip: Trip = {
        ...trip,
        status: 'IN_PROGRESS',
        stops: updatedStops
      };

      const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.TRIPS, updatedTrip.id, updatedTrip);
      if (!syncRes.success) {
        throw new Error(syncRes.error || 'Failed to sync auto-processed trip arrivals with cloud database');
      }

      allTrips[tripIndex] = updatedTrip;
      StorageEngine.setStored('fleet_trips_items', allTrips);

      return { trip: updatedTrip, newlyArrivedStops };
    }

    return { trip, newlyArrivedStops: [] };
  }

  /**
   * Phase 3: Computes deep telemetry analytics & metrics for a trip based on its breadcrumb trajectory.
   * Calculates moving vs idle duration, maximum speed, average moving speed, estimated fuel, and stop compliance.
   */
  public static analyzeTripTelemetry(companyId: string, tripId: string): TripTelemetryAnalysis | null {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', []);
    const trip = allTrips.find(t => t.id === tripId && t.company_id === companyId);
    if (!trip) return null;

    const track = this.getTripTrack(companyId, tripId);
    const points = track?.points || [];

    const totalStops = trip.stops.length;
    const completedStops = trip.stops.filter(s => s.status === 'COMPLETED' || s.status === 'ARRIVED').length;
    const skippedOrReassignedStops = trip.stops.filter(s => s.status === 'SKIPPED' || s.status === 'REASSIGNED').length;

    if (points.length === 0) {
      return {
        tripId,
        vehicleId: trip.vehicle_id,
        totalDistanceKm: track?.total_distance_km || 0,
        totalDurationMinutes: 0,
        movingDurationMinutes: 0,
        idleDurationMinutes: 0,
        maxSpeedKmh: 0,
        avgMovingSpeedKmh: 0,
        estimatedFuelLiters: 0,
        totalStops,
        completedStops,
        skippedOrReassignedStops,
        startedAt: track?.started_at || trip.startedAt || trip.scheduledAt,
        endedAt: track?.ended_at || trip.completedAt,
        pointsCount: 0
      };
    }

    let maxSpeed = 0;
    let speedSum = 0;
    let movingPointsCount = 0;
    let idleDurationMs = 0;
    let movingDurationMs = 0;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const speedKmh = typeof p.speed === 'number' && !isNaN(p.speed) ? (p.speed > 10 ? p.speed : p.speed * 3.6) : 0; // Handle m/s vs km/h if applicable
      if (speedKmh > maxSpeed) {
        maxSpeed = speedKmh;
      }

      if (speedKmh > 2) {
        speedSum += speedKmh;
        movingPointsCount++;
      }

      if (i > 0) {
        const prev = points[i - 1];
        const timeDiff = new Date(p.timestamp).getTime() - new Date(prev.timestamp).getTime();
        if (timeDiff > 0 && timeDiff < 3600000) { // cap single gap at 1h
          if (speedKmh > 2) {
            movingDurationMs += timeDiff;
          } else {
            idleDurationMs += timeDiff;
          }
        }
      }
    }

    const firstTime = new Date(points[0].timestamp).getTime();
    const lastTime = new Date(points[points.length - 1].timestamp).getTime();
    const totalDurationMs = Math.max(0, lastTime - firstTime);

    const totalDistanceKm = track?.total_distance_km || 0;
    const avgMovingSpeed = movingPointsCount > 0 ? Math.round((speedSum / movingPointsCount) * 10) / 10 : 0;
    
    // Standard commercial fleet fuel consumption baseline: ~10 Liters / 100 KM (0.1 L / KM)
    const estimatedFuelLiters = Math.round(totalDistanceKm * 0.1 * 10) / 10;

    return {
      tripId,
      vehicleId: trip.vehicle_id,
      totalDistanceKm,
      totalDurationMinutes: Math.round(totalDurationMs / 60000),
      movingDurationMinutes: Math.round(movingDurationMs / 60000),
      idleDurationMinutes: Math.round(idleDurationMs / 60000),
      maxSpeedKmh: Math.round(maxSpeed * 10) / 10,
      avgMovingSpeedKmh: avgMovingSpeed,
      estimatedFuelLiters,
      totalStops,
      completedStops,
      skippedOrReassignedStops,
      startedAt: track?.started_at || points[0].timestamp,
      endedAt: track?.ended_at || points[points.length - 1].timestamp,
      pointsCount: points.length
    };
  }

  /**
   * Evaluates dynamic periodic maintenance thresholds for all fleet vehicles or a specific vehicle.
   * Checks Oil Change, Routine Service, and Tires/Brakes against odometer readings and service history.
   */
  public static evaluateVehicleMaintenanceAlerts(
    companyId: string,
    targetVehicleId?: string
  ): MaintenanceHealthAlert[] {
    const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', [])
      .filter(v => v.company_id === companyId && (!targetVehicleId || v.id === targetVehicleId));
    
    const allLogs = StorageEngine.getStored<MaintenanceLog[]>('fleet_maintenance_logs', [])
      .filter(l => l.company_id === companyId);

    const alerts: MaintenanceHealthAlert[] = [];

    for (const vehicle of allVehicles) {
      const currentOdo = vehicle.odometerReading || 0;
      const thresholds = vehicle.maintenanceThresholds || {};
      const vehicleLogs = allLogs.filter(l => l.vehicle_id === vehicle.id);

      // Define default intervals
      const oilInterval = thresholds.oilChangeIntervalKm || 5000;
      const routineInterval = thresholds.routineIntervalKm || 15000;
      const tireInterval = thresholds.tireIntervalKm || 40000;

      // Determine last service km from threshold or latest log
      const findLastKm = (type: string, fallbackThresholdKm?: number): number => {
        if (typeof fallbackThresholdKm === 'number' && fallbackThresholdKm > 0) {
          return fallbackThresholdKm;
        }
        const relevantLogs = vehicleLogs
          .filter(l => l.type === type && typeof l.odometerAtService === 'number')
          .sort((a, b) => b.odometerAtService - a.odometerAtService);
        return relevantLogs.length > 0 ? relevantLogs[0].odometerAtService : 0;
      };

      const lastOilKm = findLastKm('OIL_CHANGE', thresholds.lastOilChangeKm);
      const lastRoutineKm = findLastKm('ROUTINE', thresholds.lastRoutineKm);
      const lastTireKm = findLastKm('TIRES', thresholds.lastTireKm);

      const checks: Array<{
        type: 'OIL_CHANGE' | 'ROUTINE' | 'TIRES';
        typeAr: string;
        typeEn: string;
        interval: number;
        lastKm: number;
      }> = [
        { type: 'OIL_CHANGE', typeAr: 'تغيير زيت المحرك والفلاتر', typeEn: 'Engine Oil & Filter Change', interval: oilInterval, lastKm: lastOilKm },
        { type: 'ROUTINE', typeAr: 'الصيانة الدورية الشاملة', typeEn: 'Routine Comprehensive Service', interval: routineInterval, lastKm: lastRoutineKm },
        { type: 'TIRES', typeAr: 'صيانة الإطارات والفرامل', typeEn: 'Tire & Brake Service', interval: tireInterval, lastKm: lastTireKm }
      ];

      for (const check of checks) {
        const nextDueKm = check.lastKm + check.interval;
        const kmRemaining = nextDueKm - currentOdo;
        let urgency: MaintenanceUrgency = 'HEALTHY';

        if (kmRemaining <= 0) {
          urgency = 'OVERDUE';
        } else if (kmRemaining <= 500) {
          urgency = 'DUE_SOON';
        }

        if (urgency !== 'HEALTHY') {
          alerts.push({
            vehicleId: vehicle.id,
            vehicleCode: vehicle.code,
            plateNumber: vehicle.plateNumber,
            serviceType: check.type,
            serviceTypeAr: check.typeAr,
            serviceTypeEn: check.typeEn,
            currentOdometer: currentOdo,
            lastServiceKm: check.lastKm,
            intervalKm: check.interval,
            nextServiceDueKm: nextDueKm,
            kmRemaining,
            urgency,
            messageAr: urgency === 'OVERDUE'
              ? `متأخرة عن موعد ${check.typeAr} بمقدار ${Math.abs(kmRemaining).toLocaleString()} كم (العداد: ${currentOdo.toLocaleString()} / المستحق: ${nextDueKm.toLocaleString()})`
              : `موعد ${check.typeAr} مستحق قريباً بعد ${kmRemaining.toLocaleString()} كم (العداد: ${currentOdo.toLocaleString()})`,
            messageEn: urgency === 'OVERDUE'
              ? `Overdue for ${check.typeEn} by ${Math.abs(kmRemaining).toLocaleString()} km (Current: ${currentOdo.toLocaleString()} / Due: ${nextDueKm.toLocaleString()})`
              : `${check.typeEn} due soon in ${kmRemaining.toLocaleString()} km (Current: ${currentOdo.toLocaleString()})`
          });
        }
      }
    }

    // Sort: OVERDUE first, then lowest remaining KM
    return alerts.sort((a, b) => {
      if (a.urgency === 'OVERDUE' && b.urgency !== 'OVERDUE') return -1;
      if (a.urgency !== 'OVERDUE' && b.urgency === 'OVERDUE') return 1;
      return a.kmRemaining - b.kmRemaining;
    });
  }

  /**
   * Calculates comprehensive fleet operating cost, fuel efficiency, and TCO summary.
   */
  public static calculateFleetCostAnalytics(
    companyId: string,
    options?: { vehicleId?: string; orgUnitId?: string; startDate?: string; endDate?: string }
  ): FleetCostSummary {
    let vehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', [])
      .filter(v => v.company_id === companyId);
    
    if (options?.vehicleId) {
      vehicles = vehicles.filter(v => v.id === options.vehicleId);
    }
    if (options?.orgUnitId) {
      vehicles = vehicles.filter(v => v.org_unit_id === options.orgUnitId);
    }

    const allFuelLogs = StorageEngine.getStored<FuelLog[]>('fleet_fuel_logs', [])
      .filter(l => l.company_id === companyId);

    const allMaintLogs = StorageEngine.getStored<MaintenanceLog[]>('fleet_maintenance_logs', [])
      .filter(l => l.company_id === companyId);

    const allAlerts = this.evaluateVehicleMaintenanceAlerts(companyId);

    let totalFleetFuelCost = 0;
    let totalFleetFuelLiters = 0;
    let totalFleetMaintenanceCost = 0;
    let totalFleetDistanceKm = 0;

    const vehicleBreakdowns: VehicleCostBreakdown[] = vehicles.map(vehicle => {
      const vFuelLogs = allFuelLogs.filter(l => l.vehicle_id === vehicle.id);
      const vMaintLogs = allMaintLogs.filter(l => l.vehicle_id === vehicle.id);
      const vAlerts = allAlerts.filter(a => a.vehicleId === vehicle.id);

      const vFuelCost = vFuelLogs.reduce((sum, l) => sum + (Number(l.totalCost) || (Number(l.liters) * Number(l.costPerLiter)) || 0), 0);
      const vFuelLiters = vFuelLogs.reduce((sum, l) => sum + (Number(l.liters) || 0), 0);
      const vMaintCost = vMaintLogs.reduce((sum, l) => sum + (Number(l.cost) || 0), 0);
      const vOperatingCost = vFuelCost + vMaintCost;
      const vDistance = Math.max(
        Number(vehicle.odometerReading) || 0,
        ...vFuelLogs.map(l => Number(l.odometerReading) || 0),
        ...vMaintLogs.map(l => Number(l.odometerAtService) || 0)
      );

      const vCostPerKm = vDistance > 0 ? Math.round((vOperatingCost / vDistance) * 100) / 100 : 0;
      const vFuelEfficiency = vFuelLiters > 0 ? Math.round((vDistance / vFuelLiters) * 10) / 10 : 0;

      const hasOverdue = vAlerts.some(a => a.urgency === 'OVERDUE');
      const hasDueSoon = vAlerts.some(a => a.urgency === 'DUE_SOON');
      const highestUrgency: MaintenanceUrgency = hasOverdue ? 'OVERDUE' : hasDueSoon ? 'DUE_SOON' : 'HEALTHY';

      totalFleetFuelCost += vFuelCost;
      totalFleetFuelLiters += vFuelLiters;
      totalFleetMaintenanceCost += vMaintCost;
      totalFleetDistanceKm += vDistance;

      return {
        vehicleId: vehicle.id,
        vehicleCode: vehicle.code,
        plateNumber: vehicle.plateNumber,
        makeModel: `${vehicle.make} ${vehicle.model}`,
        totalDistanceTraveledKm: vDistance,
        totalFuelCost: vFuelCost,
        totalFuelLiters: vFuelLiters,
        fuelEfficiencyKmPerLiter: vFuelEfficiency,
        totalMaintenanceCost: vMaintCost,
        totalOperatingCost: vOperatingCost,
        costPerKm: vCostPerKm,
        maintenanceAlertsCount: vAlerts.length,
        highestMaintenanceUrgency: highestUrgency
      };
    });

    const totalFleetOperatingCost = totalFleetFuelCost + totalFleetMaintenanceCost;
    const avgCostPerKm = totalFleetDistanceKm > 0 ? Math.round((totalFleetOperatingCost / totalFleetDistanceKm) * 100) / 100 : 0;
    const avgFuelEfficiency = totalFleetFuelLiters > 0 ? Math.round((totalFleetDistanceKm / totalFleetFuelLiters) * 10) / 10 : 0;

    const overdueCount = allAlerts.filter(a => a.urgency === 'OVERDUE').length;
    const dueSoonCount = allAlerts.filter(a => a.urgency === 'DUE_SOON').length;

    return {
      totalOperatingCost: totalFleetOperatingCost,
      totalFuelCost: totalFleetFuelCost,
      totalMaintenanceCost: totalFleetMaintenanceCost,
      totalLitersConsumed: totalFleetFuelLiters,
      totalDistanceKm: totalFleetDistanceKm,
      averageCostPerKm: avgCostPerKm,
      averageFuelEfficiencyKmPerLiter: avgFuelEfficiency,
      activeAlertsCount: allAlerts.length,
      overdueAlertsCount: overdueCount,
      dueSoonAlertsCount: dueSoonCount,
      vehicles: vehicleBreakdowns
    };
  }

  /**
   * Records a new maintenance log, syncs vehicle odometer reading, and updates service thresholds.
   */
  public static async recordVehicleMaintenance(
    companyId: string,
    data: {
      vehicle_id: string;
      type: 'ROUTINE' | 'REPAIR' | 'OIL_CHANGE' | 'TIRES' | 'INSPECTION';
      description: string;
      cost: number;
      odometerAtService: number;
      providerName?: string;
      org_unit_id?: string;
      cost_center_id?: string;
      maintenanceDate?: string;
    }
  ): Promise<MaintenanceLog> {
    const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const vIndex = allVehicles.findIndex(v => v.id === data.vehicle_id && v.company_id === companyId);
    if (vIndex === -1) {
      throw new Error(`Vehicle ${data.vehicle_id} not found in company ${companyId}`);
    }

    const vehicle = allVehicles[vIndex];
    const logId = `maint-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const log: MaintenanceLog = {
      id: logId,
      company_id: companyId,
      vehicle_id: data.vehicle_id,
      org_unit_id: data.org_unit_id || vehicle.org_unit_id,
      cost_center_id: data.cost_center_id || vehicle.cost_center_id,
      maintenanceDate: data.maintenanceDate || now.split('T')[0],
      type: data.type,
      description: data.description,
      cost: Number(data.cost) || 0,
      providerName: data.providerName || '',
      odometerAtService: Number(data.odometerAtService) || vehicle.odometerReading || 0,
      createdAt: now
    };

    // Save Maintenance Log
    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.MAINTENANCE_LOGS, log.id, log);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync maintenance log with cloud database');
    }

    const allLogs = StorageEngine.getStored<MaintenanceLog[]>('fleet_maintenance_logs', []);
    allLogs.push(log);
    StorageEngine.setStored('fleet_maintenance_logs', allLogs);

    // Update vehicle thresholds & odometer
    const updatedThresholds: VehicleMaintenanceThresholds = {
      ...(vehicle.maintenanceThresholds || {})
    };

    if (data.type === 'OIL_CHANGE') {
      updatedThresholds.lastOilChangeKm = log.odometerAtService;
    } else if (data.type === 'ROUTINE') {
      updatedThresholds.lastRoutineKm = log.odometerAtService;
      updatedThresholds.lastOilChangeKm = log.odometerAtService; // Routine includes oil change
    } else if (data.type === 'TIRES') {
      updatedThresholds.lastTireKm = log.odometerAtService;
    }

    const updatedVehicle: Vehicle = {
      ...vehicle,
      odometerReading: Math.max(vehicle.odometerReading || 0, log.odometerAtService),
      maintenanceThresholds: updatedThresholds
    };

    const vehSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.VEHICLES, updatedVehicle.id, updatedVehicle);
    if (!vehSync.success) {
      throw new Error(vehSync.error || 'Failed to sync updated vehicle thresholds with cloud database');
    }

    allVehicles[vIndex] = updatedVehicle;
    StorageEngine.setStored('fleet_vehicles_items', allVehicles);

    return log;
  }

  /**
   * Records a fuel refill log and syncs vehicle odometer reading.
   */
  public static async recordVehicleFuelRefill(
    companyId: string,
    data: {
      vehicle_id: string;
      liters: number;
      costPerLiter: number;
      odometerReading: number;
      logDate?: string;
      org_unit_id?: string;
      cost_center_id?: string;
    }
  ): Promise<FuelLog> {
    const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const vIndex = allVehicles.findIndex(v => v.id === data.vehicle_id && v.company_id === companyId);
    if (vIndex === -1) {
      throw new Error(`Vehicle ${data.vehicle_id} not found in company ${companyId}`);
    }

    const vehicle = allVehicles[vIndex];
    const logId = `fuel-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const liters = Number(data.liters) || 0;
    const costPerLiter = Number(data.costPerLiter) || 0;
    const totalCost = Math.round(liters * costPerLiter * 100) / 100;
    const odo = Number(data.odometerReading) || vehicle.odometerReading || 0;

    const log: FuelLog = {
      id: logId,
      company_id: companyId,
      vehicle_id: data.vehicle_id,
      org_unit_id: data.org_unit_id || vehicle.org_unit_id,
      cost_center_id: data.cost_center_id || vehicle.cost_center_id,
      logDate: data.logDate || now.split('T')[0],
      liters,
      costPerLiter,
      totalCost,
      odometerReading: odo,
      createdAt: now
    };

    // Save Fuel Log
    const syncRes = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.FUEL_LOGS, log.id, log);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync fuel log with cloud database');
    }

    const allLogs = StorageEngine.getStored<FuelLog[]>('fleet_fuel_logs', []);
    allLogs.push(log);
    StorageEngine.setStored('fleet_fuel_logs', allLogs);

    // Update vehicle odometer if higher
    if (odo > (vehicle.odometerReading || 0)) {
      const updatedVehicle: Vehicle = {
        ...vehicle,
        odometerReading: odo
      };
      const vehSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.VEHICLES, updatedVehicle.id, updatedVehicle);
      if (!vehSync.success) {
        throw new Error(vehSync.error || 'Failed to sync updated vehicle odometer with cloud database');
      }

      allVehicles[vIndex] = updatedVehicle;
      StorageEngine.setStored('fleet_vehicles_items', allVehicles);
    }

    return log;
  }

  /**
   * Syncs vehicle odometer reading monotonically.
   */
  public static async syncVehicleOdometer(
    companyId: string,
    vehicleId: string,
    newOdometerReading: number
  ): Promise<Vehicle> {
    const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const vIndex = allVehicles.findIndex(v => v.id === vehicleId && v.company_id === companyId);
    if (vIndex === -1) {
      throw new Error(`Vehicle ${vehicleId} not found in company ${companyId}`);
    }

    const vehicle = allVehicles[vIndex];
    const finalOdo = Math.max(vehicle.odometerReading || 0, Number(newOdometerReading) || 0);

    const updatedVehicle: Vehicle = {
      ...vehicle,
      odometerReading: finalOdo
    };

    const vehSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.VEHICLES, updatedVehicle.id, updatedVehicle);
    if (!vehSync.success) {
      throw new Error(vehSync.error || 'Failed to sync vehicle odometer with cloud database');
    }

    allVehicles[vIndex] = updatedVehicle;
    StorageEngine.setStored('fleet_vehicles_items', allVehicles);

    return updatedVehicle;
  }

  /**
   * Returns the standard pre-trip / post-trip inspection checklist template.
   */
  public static getDefaultInspectionChecklist(): InspectionChecklistItem[] {
    return getDefaultInspectionChecklistHelper();
  }

  /**
   * Submits a digital pre-trip or post-trip vehicle inspection.
   * Auto-flags vehicle status to MAINTENANCE if critical defect is found to prevent unsafe trips.
   */
  public static async submitVehicleInspection(
    companyId: string,
    data: {
      vehicle_id: string;
      driver_id: string;
      driver_name?: string;
      trip_id?: string;
      type: InspectionType;
      odometerReading: number;
      items: InspectionChecklistItem[];
      driverNotes?: string;
      driverSignatureName: string;
    }
  ): Promise<VehicleInspectionRecord> {
    const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
    const vIndex = allVehicles.findIndex(v => v.id === data.vehicle_id && v.company_id === companyId);
    if (vIndex === -1) {
      throw new Error(`Vehicle ${data.vehicle_id} not found in company ${companyId}`);
    }

    const vehicle = allVehicles[vIndex];
    const now = new Date().toISOString();

    // Count defects
    let criticalDefectsCount = 0;
    let minorDefectsCount = 0;

    data.items.forEach(item => {
      if (item.status === 'DEFECT_CRITICAL') {
        criticalDefectsCount += 1;
      } else if (item.status === 'DEFECT_MINOR') {
        minorDefectsCount += 1;
      }
    });

    let overallStatus: InspectionStatus = 'PASSED';
    if (criticalDefectsCount > 0) {
      overallStatus = 'FAILED_CRITICAL';
    } else if (minorDefectsCount > 0) {
      overallStatus = 'PASSED_WITH_DEFECTS';
    }

    const inspectionId = `insp-${crypto.randomUUID()}`;
    const record: VehicleInspectionRecord = {
      id: inspectionId,
      company_id: companyId,
      vehicle_id: data.vehicle_id,
      vehicle_code: vehicle.code,
      plate_number: vehicle.plateNumber,
      driver_id: data.driver_id,
      driver_name: data.driver_name || '',
      trip_id: data.trip_id,
      type: data.type,
      status: overallStatus,
      odometerReading: Number(data.odometerReading) || vehicle.odometerReading || 0,
      items: data.items,
      criticalDefectsFound: criticalDefectsCount,
      minorDefectsFound: minorDefectsCount,
      driverNotes: data.driverNotes || '',
      driverSignatureName: data.driverSignatureName,
      supervisorReviewStatus: overallStatus === 'PASSED' ? 'APPROVED' : 'PENDING_REVIEW',
      createdAt: now
    };

    // Save record
    const inspSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.INSPECTIONS, record.id, record);
    if (!inspSync.success) {
      throw new Error(inspSync.error || 'Failed to sync vehicle inspection record with cloud database');
    }

    const allRecords = StorageEngine.getStored<VehicleInspectionRecord[]>('fleet_inspections_records', []);
    allRecords.push(record);
    StorageEngine.setStored('fleet_inspections_records', allRecords);

    // Update vehicle status if critical defect found
    let updatedVehicle: Vehicle = { ...vehicle };
    if (overallStatus === 'FAILED_CRITICAL') {
      updatedVehicle.status = 'MAINTENANCE';
    }
    
    // Monotonically advance vehicle odometer
    if (record.odometerReading > (vehicle.odometerReading || 0)) {
      updatedVehicle.odometerReading = record.odometerReading;
    }

    const vehSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.VEHICLES, updatedVehicle.id, updatedVehicle);
    if (!vehSync.success) {
      throw new Error(vehSync.error || 'Failed to sync vehicle state after inspection with cloud database');
    }

    allVehicles[vIndex] = updatedVehicle;
    StorageEngine.setStored('fleet_vehicles_items', allVehicles);

    return record;
  }

  /**
   * Supervisor reviews and resolves a vehicle inspection record.
   */
  public static async reviewVehicleInspection(
    companyId: string,
    inspectionId: string,
    reviewerId: string,
    decision: 'APPROVED' | 'OVERRIDDEN',
    supervisorNotes?: string,
    restoreVehicleToActive?: boolean
  ): Promise<VehicleInspectionRecord> {
    const allRecords = StorageEngine.getStored<VehicleInspectionRecord[]>('fleet_inspections_records', []);
    const rIndex = allRecords.findIndex(r => r.id === inspectionId && r.company_id === companyId);
    if (rIndex === -1) {
      throw new Error(`Inspection record ${inspectionId} not found`);
    }

    const record = allRecords[rIndex];
    const now = new Date().toISOString();

    const updatedRecord: VehicleInspectionRecord = {
      ...record,
      supervisorReviewStatus: decision,
      supervisorNotes: supervisorNotes || '',
      reviewedBy: reviewerId,
      reviewedAt: now
    };

    const inspSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.INSPECTIONS, updatedRecord.id, updatedRecord);
    if (!inspSync.success) {
      throw new Error(inspSync.error || 'Failed to sync reviewed inspection record with cloud database');
    }

    allRecords[rIndex] = updatedRecord;
    StorageEngine.setStored('fleet_inspections_records', allRecords);

    if (restoreVehicleToActive) {
      const allVehicles = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
      const vIndex = allVehicles.findIndex(v => v.id === record.vehicle_id && v.company_id === companyId);
      if (vIndex !== -1) {
        const restoredVehicle: Vehicle = {
          ...allVehicles[vIndex],
          status: 'ACTIVE'
        };
        const vehSync = await syncWriteWithOfflineFallback(FLEET_COLLECTIONS.VEHICLES, restoredVehicle.id, restoredVehicle);
        if (!vehSync.success) {
          throw new Error(vehSync.error || 'Failed to sync restored vehicle state with cloud database');
        }

        allVehicles[vIndex] = restoredVehicle;
        StorageEngine.setStored('fleet_vehicles_items', allVehicles);
      }
    }

    return updatedRecord;
  }

  /**
   * Calculates detailed performance scorecard for a single driver.
   */
  public static calculateDriverScorecard(
    companyId: string,
    driverId: string,
    driverName?: string
  ): DriverScorecard {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', [])
      .filter(t => t.company_id === companyId && t.driver_id === driverId);

    const allInspections = StorageEngine.getStored<VehicleInspectionRecord[]>('fleet_inspections_records', [])
      .filter(i => i.company_id === companyId && i.driver_id === driverId);

    const totalTrips = allTrips.length;
    const completedTrips = allTrips.filter(t => t.status === 'COMPLETED').length;
    const cancelledOrBreakdownTrips = allTrips.filter(t => t.status === 'CANCELLED' || t.status === 'SUSPENDED_BREAKDOWN' || (t.status as string) === 'BREAKDOWN').length;

    let totalStopsAssigned = 0;
    let completedStops = 0;

    allTrips.forEach(t => {
      (t.stops || []).forEach(s => {
        totalStopsAssigned += 1;
        if (s.status === 'COMPLETED') {
          completedStops += 1;
        }
      });
    });

    const stopCompletionRate = totalStopsAssigned > 0 
      ? Math.round((completedStops / totalStopsAssigned) * 1000) / 10 
      : 100;

    const inspectionsCompleted = allInspections.length;
    const passedInspections = allInspections.filter(i => i.status === 'PASSED' || i.status === 'PASSED_WITH_DEFECTS').length;
    const inspectionsPassedRate = inspectionsCompleted > 0
      ? Math.round((passedInspections / inspectionsCompleted) * 1000) / 10
      : 100;

    const criticalDefectsReported = allInspections.reduce((sum, i) => sum + (i.criticalDefectsFound || 0), 0);

    // Total distance driven
    let totalDistanceDrivenKm = 0;
    allTrips.forEach(t => {
      if ((t as any).telemetry?.totalDistanceKm) {
        totalDistanceDrivenKm += (t as any).telemetry.totalDistanceKm;
      }
    });

    // Score Algorithm (0-100):
    // 1. Stop completion weight (45%)
    // 2. Inspection diligence & pass rate weight (35%)
    // 3. Trip reliability (non-cancellation/breakdown) (20%)
    let tripReliabilityRate = totalTrips > 0 
      ? Math.max(0, 100 - (cancelledOrBreakdownTrips / totalTrips) * 100) 
      : 100;

    let compositeScore = Math.round(
      (stopCompletionRate * 0.45) + 
      (inspectionsPassedRate * 0.35) + 
      (tripReliabilityRate * 0.20)
    );

    compositeScore = Math.min(100, Math.max(0, compositeScore));

    let tierRating: DriverPerformanceTier = 'GOOD';
    let ratingStars = 3;

    if (compositeScore >= 90) {
      tierRating = 'EXCELLENT';
      ratingStars = 5;
    } else if (compositeScore >= 80) {
      tierRating = 'VERY_GOOD';
      ratingStars = 4;
    } else if (compositeScore >= 65) {
      tierRating = 'GOOD';
      ratingStars = 3;
    } else {
      tierRating = 'NEEDS_IMPROVEMENT';
      ratingStars = 2;
    }

    const lastTripDate = allTrips.length > 0 
      ? allTrips.map(t => (t as any).scheduled_date || t.scheduledAt || t.createdAt).sort().reverse()[0] 
      : undefined;

    return {
      driverId,
      driverName: driverName || (allTrips[0]?.driver_id === driverId ? 'سائق' : driverId),
      totalTrips,
      completedTrips,
      cancelledOrBreakdownTrips,
      totalStopsAssigned,
      completedStops,
      stopCompletionRate,
      inspectionsCompleted,
      inspectionsPassedRate,
      criticalDefectsReported,
      totalDistanceDrivenKm: Math.round(totalDistanceDrivenKm * 10) / 10,
      safetyScore: compositeScore,
      tierRating,
      ratingStars,
      lastActiveDate: lastTripDate
    };
  }

  /**
   * Retrieves summary analytics and rankings for all drivers in the company.
   */
  public static getFleetDriverPerformanceSummary(companyId: string): FleetDriverPerformanceSummary {
    const allTrips = StorageEngine.getStored<Trip[]>('fleet_trips_items', [])
      .filter(t => t.company_id === companyId);
    
    const allInspections = StorageEngine.getStored<VehicleInspectionRecord[]>('fleet_inspections_records', [])
      .filter(i => i.company_id === companyId);

    // Identify unique drivers from trips and inspections
    const driverMap = new Map<string, string>();
    allTrips.forEach(t => {
      if (t.driver_id) {
        driverMap.set(t.driver_id, t.driver_id);
      }
    });
    allInspections.forEach(i => {
      if (i.driver_id) {
        driverMap.set(i.driver_id, i.driver_name || i.driver_id);
      }
    });

    const driverScorecards: DriverScorecard[] = [];
    driverMap.forEach((name, id) => {
      driverScorecards.push(this.calculateDriverScorecard(companyId, id, name));
    });

    // Sort by safety score descending
    driverScorecards.sort((a, b) => b.safetyScore - a.safetyScore);

    const totalDrivers = driverScorecards.length;
    const avgSafetyScore = totalDrivers > 0 
      ? Math.round((driverScorecards.reduce((sum, d) => sum + d.safetyScore, 0) / totalDrivers) * 10) / 10 
      : 100;
    
    const totalAssignedStops = driverScorecards.reduce((sum, d) => sum + d.totalStopsAssigned, 0);
    const totalCompletedStops = driverScorecards.reduce((sum, d) => sum + d.completedStops, 0);
    const overallCompletionRate = totalAssignedStops > 0 
      ? Math.round((totalCompletedStops / totalAssignedStops) * 1000) / 10 
      : 100;

    const totalInspections = allInspections.length;
    const criticalDefectIncidents = allInspections.filter(i => i.status === 'FAILED_CRITICAL').length;

    return {
      totalDrivers,
      averageSafetyScore: avgSafetyScore,
      overallCompletionRate,
      totalInspectionsConducted: totalInspections,
      criticalDefectIncidents,
      driverScorecards
    };
  }
}



