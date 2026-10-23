export type VehicleStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE' | 'DISPATCHED' | 'BREAKDOWN' | 'OUT_OF_SERVICE';
export type VehicleType = 'TRUCK' | 'VAN' | 'CAR' | 'MOTORCYCLE' | 'PICKUP' | 'HEAVY_EQUIPMENT';

export interface VehicleLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt: string;
  label?: string;
}

export interface VehicleMaintenanceThresholds {
  oilChangeIntervalKm?: number; // e.g. 5000 or 10000 KM
  routineIntervalKm?: number; // e.g. 15000 or 20000 KM
  tireIntervalKm?: number; // e.g. 40000 KM
  lastOilChangeKm?: number;
  lastRoutineKm?: number;
  lastTireKm?: number;
}

export interface Vehicle {
  id: string;
  company_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  code: string; // e.g. FLT-001
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  type: VehicleType;
  status: VehicleStatus;
  driverName?: string;
  odometerReading: number; // in KM
  fuelCapacity: number; // in Liters
  assignedOrgUnitName?: string;
  last_known_location?: VehicleLocation;
  maintenanceThresholds?: VehicleMaintenanceThresholds;
  createdAt: string;
}

export type MaintenanceUrgency = 'OVERDUE' | 'DUE_SOON' | 'HEALTHY';

export interface MaintenanceHealthAlert {
  vehicleId: string;
  vehicleCode: string;
  plateNumber: string;
  serviceType: 'OIL_CHANGE' | 'ROUTINE' | 'TIRES';
  serviceTypeAr: string;
  serviceTypeEn: string;
  currentOdometer: number;
  lastServiceKm: number;
  intervalKm: number;
  nextServiceDueKm: number;
  kmRemaining: number;
  urgency: MaintenanceUrgency;
  messageAr: string;
  messageEn: string;
}

export interface VehicleCostBreakdown {
  vehicleId: string;
  vehicleCode: string;
  plateNumber: string;
  makeModel: string;
  totalDistanceTraveledKm: number;
  totalFuelCost: number;
  totalFuelLiters: number;
  fuelEfficiencyKmPerLiter: number;
  totalMaintenanceCost: number;
  totalOperatingCost: number;
  costPerKm: number;
  maintenanceAlertsCount: number;
  highestMaintenanceUrgency: MaintenanceUrgency;
}

export interface FleetCostSummary {
  totalOperatingCost: number;
  totalFuelCost: number;
  totalMaintenanceCost: number;
  totalLitersConsumed: number;
  totalDistanceKm: number;
  averageCostPerKm: number;
  averageFuelEfficiencyKmPerLiter: number;
  activeAlertsCount: number;
  overdueAlertsCount: number;
  dueSoonAlertsCount: number;
  vehicles: VehicleCostBreakdown[];
}

export interface MaintenanceLog {
  id: string;
  company_id: string;
  vehicle_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  maintenanceDate: string;
  type: 'ROUTINE' | 'REPAIR' | 'OIL_CHANGE' | 'TIRES' | 'INSPECTION';
  description: string;
  cost: number;
  providerName?: string;
  odometerAtService: number;
  createdAt: string;
}

export interface FuelLog {
  id: string;
  company_id: string;
  vehicle_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  logDate: string;
  liters: number;
  costPerLiter: number;
  totalCost: number;
  odometerReading: number;
  createdAt: string;
}

export type TripStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' 
  | 'DISPATCHED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | 'POSTPONED' | 'SUSPENDED_BREAKDOWN';

export type TripStopStatus = 'PENDING' | 'IN_PROGRESS' | 'ARRIVED' | 'COMPLETED' | 'SKIPPED' | 'REASSIGNED';

export interface TripLocation {
  org_unit_id?: string;
  label: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  timestamp?: string;
}

export interface LearnedLocationHistoryEntry {
  label: string;
  lat: number;
  lng: number;
  accuracy?: number;
  visitedAt: string;
  tripId?: string;
}

export interface LearnedTaskLocation {
  id: string;
  company_id: string;
  org_unit_id: string; // Region or Org Unit mandatory to prevent cross-region collisions
  task_type: string;   // Normalized task name (e.g. "بوسطة", "تغيير اسطوانات غاز", "صيانة")
  label: string;
  lat: number;
  lng: number;
  accuracy?: number;
  visitCount: number;
  lastVisitedAt: string;
  history?: LearnedLocationHistoryEntry[];
}

export interface TripChatMessage {
  id: string;
  trip_id: string;
  company_id: string;
  sender_id: string;
  sender_name: string;
  sender_role?: 'DRIVER' | 'SUPERVISOR' | 'ADMIN';
  message: string;
  created_at: string;
}

export type BreakdownDecisionType = 'REASSIGN' | 'POSTPONE' | 'SUSPEND';

export interface BreakdownDecisionLog {
  id: string;
  decision: BreakdownDecisionType;
  stopId?: string; // If decision is per individual task/stop
  stopTaskTitle?: string;
  fromVehicleId: string;
  toVehicleId?: string;
  toDriverId?: string;
  reason: string;
  postponedUntil?: string;
  operatorId: string;
  timestamp: string;
}

export interface TripStop {
  id: string;
  sequence: number;
  taskTitle?: string; // e.g. "بوسطة", "تغيير اسطوانات غاز", "صيانة", "استلام/تسليم"
  notes?: string;
  location: TripLocation;
  status: TripStopStatus;
  startLocation?: TripLocation;
  arrivedLocation?: TripLocation;
  reassignedToTripId?: string;
  reassignedToVehicleId?: string;
  reassignedToDriverId?: string;
  skippedReason?: string;
  postponedUntil?: string;
  postponeReason?: string;
  startedAt?: string;
  arrivedAt?: string;
  completedAt?: string;
}

export interface Trip {
  id: string;
  company_id: string;
  org_unit_id?: string;
  vehicle_id: string;
  driver_id: string;
  stops: TripStop[];
  tripType: string;
  isEmergency?: boolean;
  status: TripStatus;
  scheduledAt: string;
  startedAt?: string;
  dispatchedAt?: string;
  completedAt?: string;
  startLocation?: TripLocation;
  notes?: string;
  reassignedFromVehicleId?: string;
  reassignedAt?: string;
  reassignReason?: string;
  postponedUntil?: string;
  postponeReason?: string;
  breakdownDecisions?: BreakdownDecisionLog[];
  conflictOverride?: SupervisorConflictOverride;
  telemetry?: {
    totalDistanceKm: number;
    totalDurationMinutes: number;
    movingDurationMinutes: number;
    idleDurationMinutes: number;
    maxSpeedKmh: number;
    avgMovingSpeedKmh: number;
  };
  createdBy: string;
  createdAt: string;
}

export type TripConflictType = 'SAME_DESTINATION' | 'SAME_TASK_TYPE' | 'SAME_VEHICLE' | 'SAME_DRIVER';

export interface TripConflictWarning {
  conflictingTripId: string;
  conflictType: TripConflictType;
  conflictingVehicleId?: string;
  conflictingVehicleCode?: string;
  conflictingVehiclePlate?: string;
  conflictingDriverId?: string;
  conflictingDriverName?: string;
  destinationLabel?: string;
  destinationOrgUnitId?: string;
  taskTitle?: string;
  tripType?: string;
  scheduledAt: string;
  status: TripStatus;
  messageAr: string;
  messageEn: string;
}

export interface SupervisorConflictOverride {
  overridden: boolean;
  overriddenBy: string;
  overriddenByName?: string;
  reason?: string;
  timestamp: string;
  conflictingTripIds: string[];
  conflictSummary?: string;
}

export interface DailyOperationsSummary {
  date: string;
  vehicles: {
    total: number;
    available: number;
    inTrip: number;
    breakdown: number;
    outOfService: number;
    availableVehicles: Vehicle[];
    inTripVehicles: Vehicle[];
    breakdownVehicles: Vehicle[];
    outOfServiceVehicles: Vehicle[];
  };
  openTrips: Trip[];
  delayedOrNotStartedTrips: Trip[];
  unregisteredDrivers: Array<{
    driverId: string;
    driverName: string;
    tripId: string;
    scheduledAt: string;
    vehicleCode?: string;
    vehiclePlate?: string;
    taskTitle?: string;
  }>;
  conflictedTrips: Array<{
    trip: Trip;
    conflicts: TripConflictWarning[];
  }>;
}

export type VehicleConstraintMode = 'BLOCK_SPECIFIC_LOCATIONS' | 'EXTERNAL_ONLY';

export interface VehicleConstraintRule {
  id: string;
  company_id: string;
  vehicle_id: string;
  mode: VehicleConstraintMode;
  blocked_org_unit_ids?: string[];
  reason?: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export interface TripBreadcrumbPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number | null;
  heading?: number | null;
  timestamp: string;
}

export interface TripBreadcrumbTrack {
  id: string;
  company_id: string;
  trip_id: string;
  vehicle_id: string;
  driver_id: string;
  status: 'ACTIVE' | 'COMPLETED' | 'SUSPENDED' | 'CANCELLED';
  is_active?: boolean;
  points: TripBreadcrumbPoint[];
  last_point?: TripBreadcrumbPoint;
  started_at: string;
  ended_at?: string;
  updated_at: string;
  total_distance_km: number;
}

export interface TripTelemetryAnalysis {
  tripId: string;
  vehicleId: string;
  totalDistanceKm: number;
  totalDurationMinutes: number;
  movingDurationMinutes: number;
  idleDurationMinutes: number;
  maxSpeedKmh: number;
  avgMovingSpeedKmh: number;
  estimatedFuelLiters: number;
  totalStops: number;
  completedStops: number;
  skippedOrReassignedStops: number;
  startedAt?: string;
  endedAt?: string;
  pointsCount: number;
}

export interface GeofenceArrivalCheckResult {
  isInsideGeofence: boolean;
  distanceMeters: number;
  matchedStop?: TripStop;
  matchedStopId?: string;
  geofenceRadiusMeters: number;
  messageAr: string;
  messageEn: string;
}

export type InspectionType = 'PRE_TRIP' | 'POST_TRIP' | 'ROUTINE';
export type InspectionStatus = 'PASSED' | 'PASSED_WITH_DEFECTS' | 'FAILED_CRITICAL';
export type ChecklistItemKey = 
  | 'BRAKES' 
  | 'TIRES' 
  | 'LIGHTS' 
  | 'FLUIDS' 
  | 'BODY_DAMAGE' 
  | 'SAFETY_EQUIPMENT' 
  | 'CLEANLINESS' 
  | 'DOCUMENTS';

export interface InspectionChecklistItem {
  key: ChecklistItemKey;
  labelAr: string;
  labelEn: string;
  isCritical: boolean;
  status: 'PASS' | 'DEFECT_MINOR' | 'DEFECT_CRITICAL';
  notes?: string;
}

export interface VehicleInspectionRecord {
  id: string;
  company_id: string;
  vehicle_id: string;
  vehicle_code?: string;
  plate_number?: string;
  driver_id: string;
  driver_name?: string;
  trip_id?: string;
  type: InspectionType;
  status: InspectionStatus;
  odometerReading: number;
  items: InspectionChecklistItem[];
  criticalDefectsFound: number;
  minorDefectsFound: number;
  driverNotes?: string;
  driverSignatureName: string;
  supervisorReviewStatus?: 'PENDING_REVIEW' | 'APPROVED' | 'OVERRIDDEN';
  supervisorNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export type DriverPerformanceTier = 'EXCELLENT' | 'VERY_GOOD' | 'GOOD' | 'NEEDS_IMPROVEMENT';

export interface DriverScorecard {
  driverId: string;
  driverName: string;
  totalTrips: number;
  completedTrips: number;
  cancelledOrBreakdownTrips: number;
  totalStopsAssigned: number;
  completedStops: number;
  stopCompletionRate: number; // percentage 0-100
  inspectionsCompleted: number;
  inspectionsPassedRate: number; // percentage 0-100
  criticalDefectsReported: number;
  totalDistanceDrivenKm: number;
  safetyScore: number; // overall composite 0-100 score
  tierRating: DriverPerformanceTier;
  ratingStars: number; // 1 to 5
  lastActiveDate?: string;
}

export interface FleetDriverPerformanceSummary {
  totalDrivers: number;
  averageSafetyScore: number;
  overallCompletionRate: number;
  totalInspectionsConducted: number;
  criticalDefectIncidents: number;
  driverScorecards: DriverScorecard[];
}


