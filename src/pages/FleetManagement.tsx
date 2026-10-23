import React, { useState, useEffect } from 'react';
import { 
  Truck, Plus, Search, Filter, Wrench, Fuel, ShieldAlert,
  Building2, Gauge, Calendar, User, FileText, CheckCircle2,
  MapPin, Navigation, Trash2, Map, Play, ArrowRightLeft, Sparkles,
  Clock, CheckCircle, AlertTriangle, AlertCircle, Radio, Loader2,
  Siren, PauseCircle, MessageSquare, Compass, Ban, Lock, CheckSquare, Square,
  Power, ShieldCheck, X, Activity, Award
} from 'lucide-react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { StorageEngine } from '../db/storage';
import { UsersModule } from '../db/users';
import { CompaniesModule } from '../db/companies';
import { LogsModule } from '../db/logs';
import { OrganizationEngine } from '../db/organizationEngine';
import OrgUnitTreeSelect from '../components/OrgUnitTreeSelect';
import LeafletMapPickerModal from '../components/LeafletMapPickerModal';
import BreakdownReassignmentModal from '../components/BreakdownReassignmentModal';
import EmergencyTripModal from '../components/EmergencyTripModal';
import TripChatModal from '../components/TripChatModal';
import DriverPortalView from '../components/DriverPortalView';
import LiveFleetMapDashboard from '../components/LiveFleetMapDashboard';
import DailyOperationsDashboard from '../components/DailyOperationsDashboard';
import TripConflictWarningModal from '../components/TripConflictWarningModal';
import { TripStopsManagerModal } from '../components/TripStopsManagerModal';
import TripRouteReplayModal from '../components/TripRouteReplayModal';
import FleetCostAndMaintenanceDashboard from '../components/FleetCostAndMaintenanceDashboard';
import DriverPerformanceAndSafetyDashboard from '../components/DriverPerformanceAndSafetyDashboard';
import VehicleInspectionModal from '../components/VehicleInspectionModal';
import { FleetBusinessEngine } from '../lib/enterprise/fleet_engine';
import { 
  Vehicle, 
  MaintenanceLog, 
  FuelLog, 
  VehicleType, 
  VehicleStatus, 
  Trip, 
  TripStop, 
  LearnedLocationHistoryEntry,
  VehicleConstraintMode,
  VehicleConstraintRule,
  TripConflictWarning,
  SupervisorConflictOverride
} from '../types/fleet';

interface FleetManagementProps {
  language: 'ar' | 'en';
  theme?: string;
}

const TASK_PRESETS = [
  { id: 'POST', labelAr: 'بوسطة ومراسلات', labelEn: 'Post & Mail Delivery' },
  { id: 'GAS_CYLINDERS', labelAr: 'تغيير اسطوانات غاز / أنابيب', labelEn: 'Gas Cylinders Exchange' },
  { id: 'MAINTENANCE', labelAr: 'صيانة وتشغيل ميداني', labelEn: 'Field Maintenance' },
  { id: 'DELIVERY_PICKUP', labelAr: 'استلام وتسليم بضائع', labelEn: 'Pickup & Delivery' },
  { id: 'GENERAL', labelAr: 'مهمة عمل ونقل عام', labelEn: 'General Transport' },
  { id: 'OTHER', labelAr: 'أخرى (مهمة مخصصة)', labelEn: 'Other Custom Task' }
];

export default function FleetManagement({ language }: FleetManagementProps) {
  const isRtl = language === 'ar';
  const activeUser = UsersModule.getActiveUser();
  const companyId = activeUser?.company_id || CompaniesModule.getSelectedCompanyId() || '';

  const isCompanyLevelFleetManager = Boolean(
    activeUser?.role === 'SystemAdmin' ||
    activeUser?.role === 'Admin' ||
    activeUser?.role === 'RegionalManager' ||
    (!activeUser?.org_unit_id && activeUser?.permissions?.manage_fleet)
  );

  const canViewVehicles = Boolean(
    activeUser?.permissions?.manage_fleet || 
    activeUser?.role === 'SystemAdmin'
  );

  const canViewTrips = Boolean(
    activeUser?.permissions?.create_trip || 
    activeUser?.permissions?.approve_trip || 
    activeUser?.permissions?.dispatch_trip || 
    activeUser?.permissions?.manage_fleet || 
    activeUser?.role === 'SystemAdmin'
  );

  const canViewDriverPortal = Boolean(
    activeUser?.permissions?.execute_trip_tasks || 
    activeUser?.permissions?.manage_fleet || 
    activeUser?.role === 'SystemAdmin'
  );

  const canCreateTrip = Boolean(
    activeUser?.permissions?.create_trip || 
    activeUser?.permissions?.manage_fleet || 
    activeUser?.role === 'SystemAdmin' ||
    activeUser?.role === 'Admin'
  );

  const canManageConstraints = Boolean(
    activeUser?.permissions?.manage_vehicle_constraints || 
    activeUser?.permissions?.manage_fleet || 
    activeUser?.role === 'SystemAdmin'
  );

  const canViewDailyOps = Boolean(
    canViewTrips || 
    canViewVehicles || 
    activeUser?.role === 'SystemAdmin' ||
    activeUser?.role === 'Admin' ||
    activeUser?.permissions?.manage_fleet
  );

  const hasAnyFleetPermission = Boolean(
    activeUser?.role === 'SystemAdmin' ||
    activeUser?.role === 'Admin' ||
    activeUser?.role === 'RegionalManager' ||
    activeUser?.permissions?.manage_fleet ||
    activeUser?.permissions?.create_trip ||
    activeUser?.permissions?.approve_trip ||
    activeUser?.permissions?.dispatch_trip ||
    activeUser?.permissions?.reassign_vehicle ||
    activeUser?.permissions?.execute_breakdown_decision ||
    activeUser?.permissions?.create_emergency_trip ||
    activeUser?.permissions?.manage_vehicle_constraints ||
    activeUser?.permissions?.execute_trip_tasks
  );

  // Tabs - Initialized dynamically to first available tab
  const [activeTab, setActiveTab] = useState<'daily_ops' | 'vehicles' | 'trips' | 'driver_portal' | 'live_map' | 'vehicle_constraints' | 'costs_and_maintenance' | 'driver_safety'>(() => {
    if (canViewDriverPortal && !canViewTrips && !canViewVehicles) {
      return 'driver_portal';
    }
    if (canViewDailyOps) {
      return 'daily_ops';
    }
    if (canViewTrips) {
      return 'trips';
    }
    if (canViewVehicles) {
      return 'vehicles';
    }
    if (canViewDriverPortal) {
      return 'driver_portal';
    }
    if (canManageConstraints) {
      return 'vehicle_constraints';
    }
    return 'daily_ops';
  });

  // State
  const [inspectionTargetVehicle, setInspectionTargetVehicle] = useState<Vehicle | null>(null);
  const [inspectionTargetDriver, setInspectionTargetDriver] = useState<{ id: string; name: string } | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [constraints, setConstraints] = useState<VehicleConstraintRule[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Conflict Modal & Warnings State
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictWarnings, setConflictWarnings] = useState<TripConflictWarning[]>([]);
  const [pendingTripData, setPendingTripData] = useState<any>(null);

  // Constraint Form State
  const [constraintForm, setConstraintForm] = useState<{
    vehicle_id: string;
    mode: VehicleConstraintMode;
    blocked_org_unit_ids: string[];
    reason: string;
  }>({
    vehicle_id: '',
    mode: 'BLOCK_SPECIFIC_LOCATIONS',
    blocked_org_unit_ids: [],
    reason: ''
  });
  const [orgUnitConstraintSearch, setOrgUnitConstraintSearch] = useState('');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [orgUnits, setOrgUnits] = useState<any[]>([]);
  const [selectedOrgUnitFilter, setSelectedOrgUnitFilter] = useState<string>('ALL');

  // Modals
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showAddTrip, setShowAddTrip] = useState(false);
  const [showLogMaintenance, setShowLogMaintenance] = useState(false);
  const [showLogFuel, setShowLogFuel] = useState(false);
  const [selectedVehicleForLog, setSelectedVehicleForLog] = useState<Vehicle | null>(null);

  // Breakdown & Reassignment Modal
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [selectedVehicleForBreakdown, setSelectedVehicleForBreakdown] = useState<Vehicle | null>(null);

  // Emergency Trip Modal
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);

  // Trip Chat Modal
  const [showChatModal, setShowChatModal] = useState(false);
  const [selectedTripForChat, setSelectedTripForChat] = useState<Trip | null>(null);

  // Stops Manager Modal (Phase 2)
  const [showStopsManagerModal, setShowStopsManagerModal] = useState(false);
  const [selectedTripForStopsManager, setSelectedTripForStopsManager] = useState<Trip | null>(null);

  // Route Replay Modal (Phase 3)
  const [showReplayModal, setShowReplayModal] = useState(false);
  const [selectedTripForReplay, setSelectedTripForReplay] = useState<Trip | null>(null);

  // GPS Execution State
  const [gpsLoadingId, setGpsLoadingId] = useState<string | null>(null);

  // Map Picker Modal
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [activeMapStopIndex, setActiveMapStopIndex] = useState<number | null>(null);

  // Forms
  const [formOrgUnitId, setFormOrgUnitId] = useState<string>('');
  const [vehicleForm, setVehicleForm] = useState({
    code: '',
    plateNumber: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    type: 'TRUCK' as VehicleType,
    status: 'ACTIVE' as VehicleStatus,
    driverName: '',
    odometerReading: 0,
    fuelCapacity: 100
  });

  const [tripForm, setTripForm] = useState({
    vehicle_id: '',
    driver_id: '',
    tripType: 'مهمة تشغيلية',
    scheduledAt: new Date().toISOString().slice(0, 16),
    notes: '',
    stops: [
      { id: 'stop-1', taskTitle: 'نقطة الانطلاق (الفرع/المحطة)', label: '', org_unit_id: '', notes: '', lat: undefined as number | undefined, lng: undefined as number | undefined },
      { id: 'stop-2', taskTitle: 'بوسطة ومراسلات', label: '', org_unit_id: '', notes: '', lat: undefined as number | undefined, lng: undefined as number | undefined },
    ]
  });

  const [maintenanceForm, setMaintenanceForm] = useState({
    maintenanceDate: new Date().toISOString().split('T')[0],
    type: 'ROUTINE' as 'ROUTINE' | 'REPAIR' | 'OIL_CHANGE' | 'TIRES' | 'INSPECTION',
    description: '',
    cost: 0,
    providerName: '',
    odometerAtService: 0
  });

  const [fuelForm, setFuelForm] = useState({
    logDate: new Date().toISOString().split('T')[0],
    liters: 0,
    costPerLiter: 15,
    odometerReading: 0
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = () => {
    const units = OrganizationEngine.getUnits(companyId);
    setOrgUnits(units);

    const loadedUsers = UsersModule.getUsers().filter(u => u.is_active);
    setUsers(loadedUsers);

    const loadedVehicles = FleetBusinessEngine.getVehiclesByOrgUnit(companyId, selectedOrgUnitFilter);

    if (loadedVehicles.length === 0 && selectedOrgUnitFilter === 'ALL') {
      // Seed default vehicles if empty
      const defaults: Vehicle[] = [
        {
          id: 'veh-001',
          company_id: companyId,
          code: 'FLT-101',
          plateNumber: 'أ ب ج 1234',
          make: 'Mercedes-Benz',
          model: 'Actros 1842',
          year: 2022,
          type: 'TRUCK',
          status: 'ACTIVE',
          driverName: 'أحمد محمود العبد',
          odometerReading: 45000,
          fuelCapacity: 300,
          createdAt: new Date().toISOString()
        },
        {
          id: 'veh-002',
          company_id: companyId,
          code: 'FLT-102',
          plateNumber: 'س ص ع 5678',
          make: 'Toyota',
          model: 'Hilux Pickup',
          year: 2023,
          type: 'PICKUP',
          status: 'ACTIVE',
          driverName: 'محمود السيد حسن',
          odometerReading: 18500,
          fuelCapacity: 80,
          createdAt: new Date().toISOString()
        }
      ];
      StorageEngine.setStored('fleet_vehicles_items', defaults);
      setVehicles(defaults);
    } else {
      setVehicles(loadedVehicles);
    }

    setMaintenanceLogs(StorageEngine.getStored<MaintenanceLog[]>('fleet_maintenance_logs', []).filter(l => l.company_id === companyId));
    setFuelLogs(StorageEngine.getStored<FuelLog[]>('fleet_fuel_logs', []).filter(l => l.company_id === companyId));
    setTrips(FleetBusinessEngine.getTripsByCompany(companyId));
    setConstraints(FleetBusinessEngine.getVehicleConstraints(companyId));
  };

  useEffect(() => {
    loadData();
    const onUpdate = () => loadData();
    window.addEventListener('custody_db_updated', onUpdate);
    return () => window.removeEventListener('custody_db_updated', onUpdate);
  }, [companyId, selectedOrgUnitFilter]);

  // Constraint Handlers
  const handleSaveConstraint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!constraintForm.vehicle_id) {
      showToast('error', isRtl ? 'يرجى اختيار المركبة المراد تطبيق القيد عليها' : 'Please select a vehicle');
      return;
    }
    if (constraintForm.mode === 'BLOCK_SPECIFIC_LOCATIONS' && constraintForm.blocked_org_unit_ids.length === 0) {
      showToast('error', isRtl ? 'يرجى تحديد موقع/فرع واحد على الأقل لحظره' : 'Please select at least one location to block');
      return;
    }

    setIsSubmitting(true);
    try {
      await FleetBusinessEngine.saveVehicleConstraint(companyId, activeUser?.id || 'system', {
        vehicle_id: constraintForm.vehicle_id,
        mode: constraintForm.mode,
        blocked_org_unit_ids: constraintForm.blocked_org_unit_ids,
        reason: constraintForm.reason,
        is_active: true
      });

      LogsModule.addLog(
        activeUser?.id || 'system',
        activeUser?.full_name || 'System',
        isRtl ? 'حفظ قيد وصول مركبة' : 'Save Vehicle Constraint',
        `Saved constraint for vehicle ${constraintForm.vehicle_id} in mode ${constraintForm.mode}`
      );

      showToast('success', isRtl ? 'تم حفظ وتفعيل قيد وصول المركبة بنجاح' : 'Vehicle constraint saved and active');
      setConstraintForm({
        vehicle_id: '',
        mode: 'BLOCK_SPECIFIC_LOCATIONS',
        blocked_org_unit_ids: [],
        reason: ''
      });
      setOrgUnitConstraintSearch('');
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || (isRtl ? 'تعذر حفظ القيد' : 'Failed to save constraint'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleConstraint = async (constraintId: string, currentActive: boolean) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await FleetBusinessEngine.toggleVehicleConstraint(companyId, constraintId, !currentActive);
      LogsModule.addLog(
        activeUser?.id || 'system',
        activeUser?.full_name || 'System',
        isRtl ? 'تعديل حالة قيد مركبة' : 'Toggle Vehicle Constraint',
        `Toggled constraint ${constraintId} to ${!currentActive ? 'ACTIVE' : 'INACTIVE'}`
      );
      showToast('success', !currentActive 
        ? (isRtl ? 'تم تفعيل القيد بنجاح' : 'Constraint activated')
        : (isRtl ? 'تم إلغاء تفعيل القيد بنجاح' : 'Constraint deactivated')
      );
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || (isRtl ? 'تعذر تعديل حالة القيد' : 'Failed to toggle constraint'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConstraint = async (constraintId: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await FleetBusinessEngine.deleteVehicleConstraint(companyId, constraintId);
      showToast('success', isRtl ? 'تم حذف القيد' : 'Constraint deleted');
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || (isRtl ? 'تعذر حذف القيد' : 'Failed to delete constraint'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers
  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!vehicleForm.plateNumber || !vehicleForm.plateNumber.trim()) {
      showToast('error', isRtl ? 'يرجى إدخال رقم اللوحة المعدنية (إلزامي)' : 'Please enter plate number (required)');
      return;
    }
    if (!vehicleForm.type) {
      showToast('error', isRtl ? 'يرجى تحديد نوع المركبة (إلزامي)' : 'Please select vehicle type (required)');
      return;
    }
    if (!vehicleForm.driverName || !vehicleForm.driverName.trim()) {
      showToast('error', isRtl ? 'يرجى إدخال اسم السائق المكلف (إلزامي)' : 'Please enter driver name (required)');
      return;
    }

    let targetOrgUnitId: string | undefined = undefined;
    if (isCompanyLevelFleetManager) {
      targetOrgUnitId = formOrgUnitId || undefined;
    } else {
      if (!activeUser?.org_unit_id) {
        showToast('error', isRtl
          ? 'لا يمكن إضافة مركبة: حسابك كمدير فرع/محطة غير مرتبط بأي فرع في النظام. يرجى مراجعة إدارة النظام.'
          : 'Cannot add vehicle: Your account is not assigned to any branch/station.');
        return;
      }
      targetOrgUnitId = activeUser.org_unit_id;
    }

    setIsSubmitting(true);
    try {
      const created = await FleetBusinessEngine.createVehicle(companyId, {
        code: vehicleForm.code?.trim() || undefined,
        plateNumber: vehicleForm.plateNumber.trim(),
        make: vehicleForm.make?.trim() || undefined,
        model: vehicleForm.model?.trim() || undefined,
        year: vehicleForm.year ? Number(vehicleForm.year) : undefined,
        type: vehicleForm.type,
        status: vehicleForm.status || 'ACTIVE',
        driverName: vehicleForm.driverName.trim(),
        odometerReading: vehicleForm.odometerReading ? Number(vehicleForm.odometerReading) : 0,
        fuelCapacity: vehicleForm.fuelCapacity ? Number(vehicleForm.fuelCapacity) : 0,
        org_unit_id: targetOrgUnitId
      });

      LogsModule.addLog(
        activeUser?.id || 'system',
        activeUser?.full_name || 'System',
        isRtl ? 'تسجيل مركبة أسطول' : 'Register Fleet Vehicle',
        `Registered vehicle ${created.plateNumber} (${created.make || ''} ${created.model || ''}) with code ${created.code}`
      );

      showToast('success', isRtl ? 'تم تسجيل المركبة بنجاح' : 'Vehicle registered successfully');
      setVehicleForm({
        code: '',
        plateNumber: '',
        make: '',
        model: '',
        year: new Date().getFullYear(),
        type: 'TRUCK',
        status: 'ACTIVE',
        driverName: '',
        odometerReading: 0,
        fuelCapacity: 100
      });
      setFormOrgUnitId('');
      setShowAddVehicle(false);
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', err?.message || (isRtl ? 'حدث خطأ أثناء تسجيل المركبة' : 'Error registering vehicle'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const captureGpsPosition = (): Promise<{ lat: number; lng: number; accuracy?: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error(isRtl 
          ? 'خاصية تحديد الموقع الجغرافي (GPS) غير مدعومة في هذا المتصفح' 
          : 'Geolocation is not supported by your browser'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          let msg = isRtl ? 'تعذر الحصول على إحداثيات GPS.' : 'Failed to retrieve GPS location.';
          if (error.code === error.PERMISSION_DENIED) {
            msg = isRtl 
              ? 'تم رفض إذن تحديد الموقع (GPS). يرجى السماح بالوصول للموقع من إعدادات المتصفح / الجوال للمتابعة.'
              : 'Location permission was denied. Please allow location access in your browser/device settings.';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            msg = isRtl 
              ? 'إشارة الموقع (GPS) غير متاحة حالياً.' 
              : 'GPS location information is currently unavailable.';
          } else if (error.code === error.TIMEOUT) {
            msg = isRtl 
              ? 'انتهت مهلة الحصول على الموقع (GPS).' 
              : 'GPS location request timed out.';
          }
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    });
  };

  const handleDriverStartTrip = async (trip: Trip) => {
    try {
      setGpsLoadingId(`start-${trip.id}`);
      const coords = await captureGpsPosition();
      await FleetBusinessEngine.startTrip(
        companyId, 
        activeUser?.id || 'driver', 
        trip.id, 
        {
          lat: coords.lat,
          lng: coords.lng,
          accuracy: coords.accuracy,
          label: isRtl ? 'نقطة انطلاق الرحلة (GPS)' : 'Trip Start Point (GPS)'
        }
      );
      showToast('success', isRtl ? 'تم تسجيل بداية الرحلة وموقع الانطلاق عبر GPS بنجاح' : 'Trip started with GPS coordinates recorded successfully');
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || (isRtl ? 'تعذر تسجيل بداية الرحلة' : 'Failed to start trip'));
    } finally {
      setGpsLoadingId(null);
    }
  };

  const handleDriverArriveStop = async (trip: Trip, stop: TripStop) => {
    try {
      setGpsLoadingId(`stop-${stop.id}`);
      const coords = await captureGpsPosition();
      await FleetBusinessEngine.recordStopArrival(
        companyId,
        activeUser?.id || 'driver',
        trip.id,
        stop.id,
        {
          lat: coords.lat,
          lng: coords.lng,
          accuracy: coords.accuracy,
          label: stop.taskTitle || stop.location.label || (isRtl ? 'موقع تنفيذ المهمة (GPS)' : 'Task Destination (GPS)')
        }
      );
      showToast('success', isRtl ? `تم تسجيل الوصول لمهمة (${stop.taskTitle || stop.location.label}) وتحديث الموقع عبر GPS` : 'Stop arrival and GPS location recorded successfully');
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || (isRtl ? 'تعذر تسجيل الوصول للمهمة' : 'Failed to record arrival'));
    } finally {
      setGpsLoadingId(null);
    }
  };

  const handleDriverCompleteTrip = async (trip: Trip) => {
    try {
      setGpsLoadingId(`complete-${trip.id}`);
      let coords: { lat: number; lng: number; accuracy?: number } | undefined;
      try {
        coords = await captureGpsPosition();
      } catch (e) {
        // Fallback without coords
      }
      await FleetBusinessEngine.completeTrip(
        companyId,
        activeUser?.id || 'driver',
        trip.id,
        coords ? {
          lat: coords.lat,
          lng: coords.lng,
          accuracy: coords.accuracy,
          label: isRtl ? 'نهاية الرحلة' : 'Trip End'
        } : undefined
      );
      showToast('success', isRtl ? 'تم إنهاء المشوار بنجاح وإعادة حالة المركبة لمتاحة' : 'Trip completed and vehicle marked active');
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || (isRtl ? 'تعذر إنهاء الرحلة' : 'Failed to complete trip'));
    } finally {
      setGpsLoadingId(null);
    }
  };

  const handleVehicleStatusChange = async (vehicle: Vehicle, newStatus: VehicleStatus) => {
    try {
      const { vehicle: updatedVeh, affectedTrips } = await FleetBusinessEngine.updateVehicleStatus(
        companyId,
        activeUser?.id || 'system',
        vehicle.id,
        newStatus
      );
      showToast('success', isRtl ? `تم تحديث حالة المركبة إلى ${newStatus}` : `Vehicle status updated to ${newStatus}`);
      loadData();

      if (['BREAKDOWN', 'OUT_OF_SERVICE', 'MAINTENANCE'].includes(newStatus) && affectedTrips.length > 0) {
        setSelectedVehicleForBreakdown(updatedVeh);
        setShowBreakdownModal(true);
      }
    } catch (err: any) {
      console.error(err);
      showToast('error', isRtl ? 'تعذر تحديث حالة المركبة' : 'Failed to update vehicle status');
    }
  };

  const handleOpenBreakdownModal = (vehicle: Vehicle) => {
    setSelectedVehicleForBreakdown(vehicle);
    setShowBreakdownModal(true);
  };

  const handleAddStopRow = () => {
    setTripForm(prev => ({
      ...prev,
      stops: [
        ...prev.stops,
        {
          id: `stop-${Date.now()}-${prev.stops.length + 1}`,
          taskTitle: 'استلام وتسليم بضائع',
          label: '',
          org_unit_id: '',
          notes: '',
          lat: undefined,
          lng: undefined
        }
      ]
    }));
  };

  const handleRemoveStopRow = (index: number) => {
    if (tripForm.stops.length <= 2) return;
    setTripForm(prev => ({
      ...prev,
      stops: prev.stops.filter((_, idx) => idx !== index)
    }));
  };

  const handleStopTaskChange = (index: number, taskTitle: string) => {
    setTripForm(prev => {
      const nextStops = [...prev.stops];
      nextStops[index] = {
        ...nextStops[index],
        taskTitle
      };
      return { ...prev, stops: nextStops };
    });
  };

  const handleStopNotesChange = (index: number, notes: string) => {
    setTripForm(prev => {
      const nextStops = [...prev.stops];
      nextStops[index] = {
        ...nextStops[index],
        notes
      };
      return { ...prev, stops: nextStops };
    });
  };

  const handleStopLabelChange = (index: number, value: string) => {
    const matchedUnit = orgUnits.find(u => 
      `${u.code} - ${u.name}` === value ||
      u.name === value ||
      u.code === value
    );

    setTripForm(prev => {
      const nextStops = [...prev.stops];
      nextStops[index] = {
        ...nextStops[index],
        label: value,
        org_unit_id: matchedUnit ? matchedUnit.id : ''
      };
      return { ...prev, stops: nextStops };
    });
  };

  const handleOpenMapPicker = (index: number) => {
    setActiveMapStopIndex(index);
    setMapModalOpen(true);
  };

  const handleConfirmMapCoords = (coords: { lat: number; lng: number }) => {
    if (activeMapStopIndex !== null) {
      setTripForm(prev => {
        const nextStops = [...prev.stops];
        const current = nextStops[activeMapStopIndex];
        nextStops[activeMapStopIndex] = {
          ...current,
          lat: coords.lat,
          lng: coords.lng,
          label: current.label || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
        };
        return { ...prev, stops: nextStops };
      });
    }
  };

  const executeCreateTrip = async (payload: any, override?: SupervisorConflictOverride) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await FleetBusinessEngine.createTrip(companyId, activeUser?.id || 'system', {
        ...payload,
        conflictOverride: override
      });

      LogsModule.addLog(
        activeUser?.id || 'system',
        activeUser?.full_name || 'System',
        isRtl ? 'تسجيل مشوار أسطول' : 'Register Fleet Trip',
        override 
          ? `Created trip with supervisor conflict override: ${override.conflictSummary || override.reason || ''}`
          : `Created trip ${payload.tripType}`
      );

      showToast(
        'success', 
        override 
          ? (isRtl ? 'تم تسجيل المشوار مع توثيق قرار تجاوز التعارض بقرار المشرف بنجاح' : 'Trip recorded with supervisor conflict override documented') 
          : (isRtl ? 'تم تسجيل المشوار بصفة مسودة (DRAFT) بنجاح - في انتظار بدء السائق للرحلة عبر GPS' : 'Trip recorded in DRAFT status successfully')
      );

      setTripForm({
        vehicle_id: '',
        driver_id: '',
        tripType: 'مهمة تشغيلية',
        scheduledAt: new Date().toISOString().slice(0, 16),
        notes: '',
        stops: [
          { id: 'stop-1', taskTitle: 'نقطة الانطلاق (الفرع/المحطة)', label: '', org_unit_id: '', notes: '', lat: undefined, lng: undefined },
          { id: 'stop-2', taskTitle: 'بوسطة ومراسلات', label: '', org_unit_id: '', notes: '', lat: undefined, lng: undefined },
        ]
      });
      setShowAddTrip(false);
      setShowConflictModal(false);
      setPendingTripData(null);
      setConflictWarnings([]);
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', err?.message || (isRtl ? 'حدث خطأ أثناء تسجيل المشوار' : 'Error creating trip'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!canCreateTrip) {
      showToast('error', isRtl ? 'غير مصرح لك بإنشاء مشوار' : 'Unauthorized to create trip');
      return;
    }

    if (!tripForm.vehicle_id || !tripForm.driver_id || !tripForm.tripType) {
      showToast('error', isRtl ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    if (tripForm.stops.length < 2) {
      showToast('error', isRtl ? 'يجب تحديد نقطتين على الأقل لخط السير' : 'At least 2 stops are required for the route');
      return;
    }

    const hasEmptyStop = tripForm.stops.some(s => !s.taskTitle?.trim() && !s.label.trim() && (s.lat === undefined || s.lng === undefined));
    if (hasEmptyStop) {
      showToast('error', isRtl ? 'يرجى تحديد المهمة أو الوجهة لكل محطة في المشوار' : 'Please specify a task title or destination for each stop');
      return;
    }

    const stopsData = tripForm.stops.map((s, idx) => ({
      id: s.id,
      sequence: idx + 1,
      taskTitle: s.taskTitle || undefined,
      notes: s.notes || '',
      location: {
        org_unit_id: s.org_unit_id || undefined,
        label: s.label.trim() || s.taskTitle || `${s.lat?.toFixed(4)}, ${s.lng?.toFixed(4)}`,
        lat: s.lat,
        lng: s.lng
      },
      status: 'PENDING' as const
    }));

    const tripPayload = {
      vehicle_id: tripForm.vehicle_id,
      driver_id: tripForm.driver_id,
      tripType: tripForm.tripType,
      scheduledAt: tripForm.scheduledAt,
      notes: tripForm.notes,
      stops: stopsData,
      org_unit_id: stopsData[0]?.location.org_unit_id
    };

    // Detect Operational Conflicts on the same date/destination/task/vehicle
    const detectedConflicts = FleetBusinessEngine.detectTripConflicts(companyId, tripPayload);
    if (detectedConflicts.length > 0) {
      setPendingTripData(tripPayload);
      setConflictWarnings(detectedConflicts);
      setShowConflictModal(true);
      return;
    }

    await executeCreateTrip(tripPayload);
  };

  const handleProceedConflictOverride = async (reason: string) => {
    if (!pendingTripData || isSubmitting) return;
    const override: SupervisorConflictOverride = {
      overridden: true,
      overriddenBy: activeUser?.id || 'system',
      overriddenByName: activeUser?.full_name || 'المشرف المسؤول',
      reason: reason.trim() || (isRtl ? 'قرار المشرف: متابعة التشغيل وتجاوز التعارض يدوياً' : 'Supervisor manual override'),
      timestamp: new Date().toISOString(),
      conflictingTripIds: conflictWarnings.map(w => w.conflictingTripId),
      conflictSummary: conflictWarnings.map(w => isRtl ? w.messageAr : w.messageEn).join(' | ')
    };
    await executeCreateTrip(pendingTripData, override);
  };

  const handleEditAssignmentFromConflict = () => {
    setShowConflictModal(false);
    // Keep showAddTrip open so supervisor can change vehicle or destination
  };

  const handleCancelConflict = () => {
    setShowConflictModal(false);
    setShowAddTrip(false);
    setPendingTripData(null);
    setConflictWarnings([]);
  };

  const handleLogMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicleForLog || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await FleetBusinessEngine.logMaintenance(companyId, activeUser?.id || 'system', {
        vehicle_id: selectedVehicleForLog.id,
        maintenanceDate: maintenanceForm.maintenanceDate,
        type: maintenanceForm.type,
        description: maintenanceForm.description,
        cost: maintenanceForm.cost,
        providerName: maintenanceForm.providerName,
        odometerAtService: maintenanceForm.odometerAtService || selectedVehicleForLog.odometerReading,
        org_unit_id: selectedVehicleForLog.org_unit_id
      });

      showToast('success', isRtl ? 'تم تسجيل الصيانة بنجاح' : 'Maintenance logged successfully');
      setShowLogMaintenance(false);
      setSelectedVehicleForLog(null);
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', err?.message || (isRtl ? 'حدث خطأ أثناء تسجيل الصيانة' : 'Error logging maintenance'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogFuel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicleForLog || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await FleetBusinessEngine.logFuel(companyId, activeUser?.id || 'system', {
        vehicle_id: selectedVehicleForLog.id,
        logDate: fuelForm.logDate,
        liters: fuelForm.liters,
        costPerLiter: fuelForm.costPerLiter,
        odometerReading: fuelForm.odometerReading || selectedVehicleForLog.odometerReading,
        org_unit_id: selectedVehicleForLog.org_unit_id
      });

      showToast('success', isRtl ? 'تم تسجيل الوقود بنجاح' : 'Fuel logged successfully');
      setShowLogFuel(false);
      setSelectedVehicleForLog(null);
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', err?.message || (isRtl ? 'حدث خطأ أثناء تسجيل الوقود' : 'Error logging fuel'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredVehicles = vehicles.filter(v => {
    const matchesSearch = v.plateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          v.make.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          v.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          v.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (v.driverName && v.driverName.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = typeFilter === 'ALL' || v.type === typeFilter;
    return matchesSearch && matchesType;
  });

  if (!hasAnyFleetPermission) {
    return (
      <div className="p-8 text-center max-w-md mx-auto my-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <ShieldAlert className="h-12 w-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">
          {isRtl ? 'غير مصرح لك بالوصول لهذه الصفحة' : 'Unauthorized Access'}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {isRtl
            ? 'عذراً، لا تمتلك أياً من صلاحيات إدارة الأسطول أو المشاوير أو بوابة السائق للوصول لهذه الشاشة.'
            : 'Sorry, you do not have permission to access Fleet Management or Driver Portal.'}
        </p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-xl border text-xs font-bold flex items-center gap-2 ${
          toast.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200' 
            : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-200'
        }`}>
          <CheckCircle2 className="h-4 w-4" />
          <span>{toast.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {isRtl ? 'إدارة الأسطول والحركة والنقل' : 'Fleet & Transportation Management'}
            </h1>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              {isRtl ? 'متابعة سيارات وشاحنات الشركة، المصاريف، الوقود، والمشاوير المرتبطة بالهياكل التنظيمية' : 'Manage corporate fleet vehicles, maintenance logs, fuel expenses, and trips.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeUser?.permissions?.create_emergency_trip && (
            <button
              onClick={() => setShowEmergencyModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-black bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md transition-all animate-pulse"
            >
              <Siren className="h-4 w-4" />
              <span>{isRtl ? 'مشوار طارئ' : 'Emergency Trip'}</span>
            </button>
          )}

          {activeTab === 'vehicles' && activeUser?.permissions?.manage_fleet && (
            <button
              onClick={() => setShowAddVehicle(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>{isRtl ? 'إضافة مركبة للأسطول' : 'Register Vehicle'}</span>
            </button>
          )}

          {canCreateTrip && (
            <button
              onClick={() => setShowAddTrip(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>{isRtl ? 'إنشاء مشوار جديد' : 'Create Trip'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-none pb-0.5 w-full scroll-smooth touch-pan-x">
        {canViewDailyOps && (
          <button
            onClick={() => setActiveTab('daily_ops')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
              activeTab === 'daily_ops'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Activity className="h-4 w-4 text-indigo-600 flex-shrink-0" />
            <span>{isRtl ? 'لوحة تشغيل اليوم' : 'Daily Operations'}</span>
            {trips.filter(t => t.scheduledAt?.split('T')[0] === new Date().toISOString().split('T')[0] && t.status !== 'CANCELLED').length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 rounded-full flex-shrink-0">
                {trips.filter(t => t.scheduledAt?.split('T')[0] === new Date().toISOString().split('T')[0] && t.status !== 'CANCELLED').length}
              </span>
            )}
          </button>
        )}

        {canViewVehicles && (
          <button
            onClick={() => setActiveTab('vehicles')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
              activeTab === 'vehicles'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Truck className="h-4 w-4 flex-shrink-0" />
            <span>{isRtl ? 'المركبات والأسطول' : 'Vehicles'}</span>
          </button>
        )}

        {canViewTrips && (
          <button
            onClick={() => setActiveTab('trips')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
              activeTab === 'trips'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Navigation className="h-4 w-4 flex-shrink-0" />
            <span>{isRtl ? 'المشاوير' : 'Trips'}</span>
          </button>
        )}

        {(canViewTrips || canViewVehicles) && (
          <button
            onClick={() => setActiveTab('live_map')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
              activeTab === 'live_map'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Radio className="h-4 w-4 text-indigo-600 animate-pulse flex-shrink-0" />
            <span>{isRtl ? '🗺️ التتبع المباشر والخريطة' : '🗺️ Live Tracking Map'}</span>
            {trips.filter(t => t.status === 'DISPATCHED' || t.status === 'IN_PROGRESS').length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-full flex-shrink-0">
                {trips.filter(t => t.status === 'DISPATCHED' || t.status === 'IN_PROGRESS').length}
              </span>
            )}
          </button>
        )}

        {canViewDriverPortal && (
          <button
            onClick={() => setActiveTab('driver_portal')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
              activeTab === 'driver_portal'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Compass className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>{isRtl ? 'بوابة السائق الميدانية (الموبايل)' : 'Driver Field Portal'}</span>
          </button>
        )}

        {canManageConstraints && (
          <button
            onClick={() => setActiveTab('vehicle_constraints')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
              activeTab === 'vehicle_constraints'
                ? 'border-rose-600 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Ban className="h-4 w-4 text-rose-600 flex-shrink-0" />
            <span>{isRtl ? 'قيود المركبات' : 'Vehicle Constraints'}</span>
            {constraints.filter(c => c.is_active).length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 rounded-full flex-shrink-0">
                {constraints.filter(c => c.is_active).length}
              </span>
            )}
          </button>
        )}

        {canViewVehicles && (
          <button
            onClick={() => setActiveTab('costs_and_maintenance')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
              activeTab === 'costs_and_maintenance'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Gauge className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>{isRtl ? '📊 تكاليف التشغيل وصحة الصيانة' : '📊 Costs & Maintenance'}</span>
            {(() => {
              const alerts = FleetBusinessEngine.evaluateVehicleMaintenanceAlerts(companyId);
              if (alerts.length === 0) return null;
              const hasOverdue = alerts.some(a => a.urgency === 'OVERDUE');
              return (
                <span className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-full flex-shrink-0 ${
                  hasOverdue 
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 animate-pulse' 
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                }`}>
                  {alerts.length}
                </span>
              );
            })()}
          </button>
        )}

        {canViewVehicles && (
          <button
            onClick={() => setActiveTab('driver_safety')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
              activeTab === 'driver_safety'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Award className="h-4 w-4 text-indigo-600 flex-shrink-0" />
            <span>{isRtl ? '⭐ تقييم السائقين وفحص السلامة' : '⭐ Driver Scorecards & Safety'}</span>
            {(() => {
              const pendingCount = FleetBusinessEngine.getFleetDriverPerformanceSummary(companyId).criticalDefectIncidents;
              if (pendingCount === 0) return null;
              return (
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 animate-pulse flex-shrink-0">
                  {pendingCount}
                </span>
              );
            })()}
          </button>
        )}
      </div>

      {/* Daily Operations Hub Tab */}
      {activeTab === 'daily_ops' && (
        <DailyOperationsDashboard
          language={language}
          companyId={companyId}
          vehicles={vehicles}
          trips={trips}
          users={users}
          orgUnits={orgUnits}
          onRefresh={loadData}
          onOpenAddTrip={() => setShowAddTrip(true)}
          onOpenEmergencyModal={() => setShowEmergencyModal(true)}
          onOpenChatModal={(t) => {
            setSelectedTripForChat(t);
            setShowChatModal(true);
          }}
          onOpenStopsManager={(t) => {
            setSelectedTripForStopsManager(t);
            setShowStopsManagerModal(true);
          }}
          onOpenBreakdownModal={(v) => {
            setSelectedVehicleForBreakdown(v);
            setShowBreakdownModal(true);
          }}
          onNavigateToLiveMap={() => setActiveTab('live_map')}
          onNavigateToTrips={() => setActiveTab('trips')}
          onNavigateToVehicles={() => setActiveTab('vehicles')}
          onDispatchTrip={(tripId) => {
            const trip = trips.find(t => t.id === tripId);
            if (trip) handleDriverStartTrip(trip);
          }}
        />
      )}

      {/* Vehicles Tab */}
      {activeTab === 'vehicles' && (
        <>
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 rtl:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isRtl ? 'ابحث برقم اللوحة، الماركة، السائق، الكود...' : 'Search plate, make, driver, code...'}
                className="w-full pl-9 pr-9 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <select
                  value={selectedOrgUnitFilter}
                  onChange={(e) => setSelectedOrgUnitFilter(e.target.value)}
                  className="bg-transparent text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                >
                  <option value="ALL">{isRtl ? 'جميع الهياكل التنظيمية' : 'All Org Units'}</option>
                  {orgUnits.map((u) => (
                    <option key={u.id} value={u.id}>{u.code} - {u.name}</option>
                  ))}
                </select>
              </div>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-100 rounded-xl px-2.5 py-1.5 focus:outline-none"
              >
                <option value="ALL">{isRtl ? 'جميع أنواع المركبات' : 'All Vehicle Types'}</option>
                <option value="TRUCK">{isRtl ? 'شاحنات نقل ثقيل' : 'Trucks'}</option>
                <option value="PICKUP">{isRtl ? 'سيارات نقل خفيف (بيك آب)' : 'Pickups'}</option>
                <option value="VAN">{isRtl ? 'فانات وتوزيع' : 'Vans'}</option>
                <option value="CAR">{isRtl ? 'سيارات ملاكي وموظفين' : 'Passenger Cars'}</option>
                <option value="HEAVY_EQUIPMENT">{isRtl ? 'معدات ثقيلة ورافعات' : 'Heavy Equipment'}</option>
              </select>
            </div>
          </div>

          {/* Vehicle Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVehicles.map(v => {
              const isBreakdown = ['BREAKDOWN', 'OUT_OF_SERVICE'].includes(v.status);
              const openTripsCount = FleetBusinessEngine.getOpenTripsForVehicle(companyId, v.id).length;

              return (
                <div key={v.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md">
                          {v.code}
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-md">
                          {v.type}
                        </span>
                        <select
                          value={v.status}
                          onChange={(e) => handleVehicleStatusChange(v, e.target.value as VehicleStatus)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border focus:outline-none cursor-pointer ${
                            v.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800' :
                            v.status === 'DISPATCHED' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800' :
                            v.status === 'MAINTENANCE' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' :
                            'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                          }`}
                        >
                          <option value="ACTIVE">{isRtl ? 'جاهزة / نشطة' : 'ACTIVE'}</option>
                          <option value="DISPATCHED">{isRtl ? 'في مشوار ميداني' : 'DISPATCHED'}</option>
                          <option value="MAINTENANCE">{isRtl ? 'صيانة دورية' : 'MAINTENANCE'}</option>
                          <option value="BREAKDOWN">{isRtl ? 'معطلة / عطل مفاجئ' : 'BREAKDOWN'}</option>
                          <option value="OUT_OF_SERVICE">{isRtl ? 'خارج الخدمة' : 'OUT_OF_SERVICE'}</option>
                          <option value="INACTIVE">{isRtl ? 'متوقفة' : 'INACTIVE'}</option>
                        </select>
                      </div>
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-1.5">
                        {v.make} {v.model} ({v.year})
                      </h3>
                      <p className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {v.plateNumber}
                      </p>
                      {v.org_unit_id && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                          <Building2 className="h-3 w-3" />
                          <span>{orgUnits.find(u => u.id === v.org_unit_id)?.name || v.org_unit_id}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Last Known GPS Location badge */}
                  {v.last_known_location && (
                    <div className="p-2 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200/60 dark:border-slate-800/60 text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                        <span className="truncate font-medium">
                          {v.last_known_location.label || `${v.last_known_location.lat.toFixed(4)}, ${v.last_known_location.lng.toFixed(4)}`}
                        </span>
                      </div>
                      {v.last_known_location.updatedAt && (
                        <span className="font-mono text-[9px] text-slate-400 shrink-0 mr-1 rtl:mr-0 rtl:ml-1">
                          {new Date(v.last_known_location.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-400 block">{isRtl ? 'السائق المسؤول' : 'Assigned Driver'}</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{v.driverName || '-'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">{isRtl ? 'عدّاد الكيلومترات' : 'Odometer (KM)'}</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{v.odometerReading.toLocaleString()} KM</span>
                    </div>
                  </div>

                  {/* Breakdown Redistribution Alert Button */}
                  {isBreakdown && openTripsCount > 0 && activeUser?.permissions?.execute_breakdown_decision && (
                    <button
                      onClick={() => handleOpenBreakdownModal(v)}
                      className="w-full py-2 px-3 text-xs font-extrabold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all animate-pulse"
                    >
                      <ShieldAlert className="h-4 w-4" />
                      <span>{isRtl ? `إعادة توزيع ${openTripsCount} مشاوير على الأقرب (توفير السولار)` : `Reassign ${openTripsCount} Trips to Nearest`}</span>
                    </button>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                    <button
                      onClick={() => {
                        setSelectedVehicleForLog(v);
                        setShowLogFuel(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded-xl hover:bg-amber-100 transition-all"
                    >
                      <Fuel className="h-3.5 w-3.5" />
                      <span>{isRtl ? 'تموين وقود' : 'Fuel Refill'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setSelectedVehicleForLog(v);
                        setShowLogMaintenance(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-xl hover:bg-indigo-100 transition-all"
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      <span>{isRtl ? 'تسجيل صيانة' : 'Maintenance'}</span>
                    </button>

                    {activeUser?.permissions?.execute_breakdown_decision && (
                      <button
                        onClick={() => handleOpenBreakdownModal(v)}
                        title={isRtl ? 'إعادة توزيع المهام عند العطل' : 'Reassign tasks'}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
                      >
                        <ArrowRightLeft className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Trips Tab */}
      {activeTab === 'trips' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden space-y-4 p-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Navigation className="h-5 w-5 text-indigo-600" />
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                  {isRtl ? 'جدول المشاوير والتشغيل الميداني' : 'Trips & Driver Operations'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isRtl ? 'يقوم المكتب بتسجيل مهام المشوار، ويسجل السائق بداية الرحلة والوصول للمواقع عبر الـ GPS تلقائياً' : 'Office creates task-based trips, driver marks starts and arrivals via GPS.'}
                </p>
              </div>
            </div>
            <span className="text-xs text-slate-500 font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl">
              {trips.length} {isRtl ? 'مشوار مسجل' : 'trips'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {trips.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-medium bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                {isRtl ? 'لا توجد مشاوير مسجلة حالياً.' : 'No trips recorded yet.'}
              </div>
            ) : (
              trips.map((t, idx) => {
                const vehicle = vehicles.find(v => v.id === t.vehicle_id);
                const driver = users.find(u => u.id === t.driver_id);
                const isDispatched = ['DISPATCHED', 'IN_PROGRESS'].includes(t.status);
                const isCompleted = t.status === 'COMPLETED';
                const isDraft = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(t.status);
                const startLoading = gpsLoadingId === `start-${t.id}`;
                const completeLoading = gpsLoadingId === `complete-${t.id}`;

                return (
                  <div
                    key={t.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isDispatched
                        ? 'border-indigo-300 dark:border-indigo-800 bg-indigo-50/20 dark:bg-indigo-950/20'
                        : isCompleted
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                    }`}
                  >
                    {/* Trip Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono font-black text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg">
                          #{idx + 1}
                        </span>
                        <div className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                          <Truck className="h-4 w-4 text-indigo-600" />
                          <span>{vehicle ? `${vehicle.plateNumber} (${vehicle.make} ${vehicle.model})` : t.vehicle_id}</span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <span>{driver ? driver.full_name : t.driver_id}</span>
                        </div>
                        {t.isEmergency && (
                          <span className="px-2.5 py-0.5 text-[11px] font-black rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 flex items-center gap-1 animate-pulse">
                            <Siren className="h-3 w-3" />
                            <span>{isRtl ? 'مشوار طارئ' : 'Emergency'}</span>
                          </span>
                        )}
                        <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          {t.tripType}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {t.reassignedFromVehicleId && (
                          <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 flex items-center gap-1">
                            <ArrowRightLeft className="h-3 w-3" />
                            {isRtl ? 'تمت إعادة توزيعه عند العطل' : 'Reassigned'}
                          </span>
                        )}
                        <span className={`px-3 py-1 text-xs font-black rounded-xl border ${
                          t.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300' :
                          t.status === 'POSTPONED' ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300' :
                          t.status === 'SUSPENDED_BREAKDOWN' ? 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200' :
                          isDispatched ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300 animate-pulse' :
                          'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                          {t.status === 'DRAFT' ? (isRtl ? 'مسودة (DRAFT)' : 'DRAFT') :
                           t.status === 'DISPATCHED' ? (isRtl ? 'في الطريق (DISPATCHED)' : 'DISPATCHED') :
                           t.status === 'POSTPONED' ? (isRtl ? 'مؤجل (POSTPONED)' : 'POSTPONED') :
                           t.status === 'SUSPENDED_BREAKDOWN' ? (isRtl ? 'معلق بسبب عطل' : 'SUSPENDED') :
                           t.status === 'COMPLETED' ? (isRtl ? 'مكتمل (COMPLETED)' : 'COMPLETED') : t.status}
                        </span>
                      </div>
                    </div>

                    {/* Multi-Task Stops List */}
                    <div className="py-3 space-y-2">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        {isRtl ? 'مهام ومحطات خط السير:' : 'Tasks & Route Stops:'}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {t.stops.map((stop, sIdx) => {
                          const isStopArrived = stop.status === 'ARRIVED';
                          const isStopPending = stop.status === 'PENDING' || stop.status === 'IN_PROGRESS';
                          const isStopLoading = gpsLoadingId === `stop-${stop.id}`;
                          const stopTitle = stop.taskTitle || stop.location.label || `المهمة ${sIdx + 1}`;

                          return (
                            <div
                              key={stop.id || sIdx}
                              className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                                isStopArrived
                                  ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                      #{sIdx + 1}
                                    </span>
                                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                                      {stopTitle}
                                    </span>
                                  </div>
                                  {isStopArrived ? (
                                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-0.5">
                                      <CheckCircle2 className="h-3 w-3" />
                                      {isRtl ? 'تم الوصول' : 'Arrived'}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold text-slate-400">
                                      {isRtl ? 'في الانتظار' : 'Pending'}
                                    </span>
                                  )}
                                </div>

                                {stop.location.label && stop.location.label !== stopTitle && (
                                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                                    📍 {stop.location.label}
                                  </p>
                                )}

                                {stop.notes && (
                                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 italic">
                                    "{stop.notes}"
                                  </p>
                                )}

                                {stop.arrivedLocation && typeof stop.arrivedLocation.lat === 'number' && (
                                  <div className="mt-1.5 p-1 px-2 rounded-lg bg-emerald-100/70 dark:bg-emerald-900/50 text-[10px] font-mono font-bold text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
                                    <span>📍 {stop.arrivedLocation.lat.toFixed(4)}, {stop.arrivedLocation.lng?.toFixed(4)}</span>
                                    {stop.arrivedAt && (
                                      <span>{new Date(stop.arrivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Stop Arrival Button for Drivers */}
                              {isDispatched && isStopPending && (
                                <button
                                  type="button"
                                  disabled={isStopLoading}
                                  onClick={() => handleDriverArriveStop(t, stop)}
                                  className="w-full py-1.5 px-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg shadow-sm flex items-center justify-center gap-1 transition-all mt-1"
                                >
                                  {isStopLoading ? (
                                    <>
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      <span>{isRtl ? 'جاري تحديد GPS...' : 'Fetching GPS...'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <MapPin className="h-3.5 w-3.5" />
                                      <span>{isRtl ? 'وصلت (تسجيل موقع المهمة GPS)' : 'Arrived (Record GPS)'}</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Driver Actions Footer Bar */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
                      <div className="text-[11px] text-slate-500 font-mono">
                        <span>{isRtl ? 'الموعد:' : 'Scheduled:'} {new Date(t.scheduledAt).toLocaleString(isRtl ? 'ar-EG' : 'en-US')}</span>
                        {t.startedAt && (
                          <span className="mr-2 rtl:mr-2 ltr:ml-2 text-indigo-600">
                            • {isRtl ? 'بدأ في:' : 'Started:'} {new Date(t.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Manage Stops and In-Field Tasks Button (Phase 2) */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTripForStopsManager(t);
                            setShowStopsManagerModal(true);
                          }}
                          className="px-3 py-2 text-xs font-bold bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-xl flex items-center gap-1.5 transition-all border border-blue-200 dark:border-blue-800"
                          title={isRtl ? 'إدارة محطات ومهام خط السير وإعادة التوزيع' : 'Manage route stops & tasks'}
                        >
                          <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <span>{isRtl ? 'المحطات والمهام' : 'Stops & Tasks'}</span>
                        </button>

                        {/* Route Replay Button (Phase 3) */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTripForReplay(t);
                            setShowReplayModal(true);
                          }}
                          className="px-3 py-2 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-xl flex items-center gap-1.5 transition-all border border-indigo-200 dark:border-indigo-800"
                          title={isRtl ? 'إعادة تشغيل المسار وتتبع حركة المشوار' : 'Replay route & telemetry'}
                        >
                          <Play className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          <span>{isRtl ? 'تشغيل المسار' : 'Replay Route'}</span>
                        </button>

                        {/* Operational Trip Chat Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTripForChat(t);
                            setShowChatModal(true);
                          }}
                          className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl flex items-center gap-1.5 transition-all"
                          title={isRtl ? 'المحادثة والتعليمات الميدانية للمشوار' : 'Trip operational messages'}
                        >
                          <MessageSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          <span>{isRtl ? 'شات المشوار' : 'Trip Chat'}</span>
                        </button>

                        {/* Start Trip Button */}
                        {isDraft && (
                          <button
                            type="button"
                            disabled={startLoading}
                            onClick={() => handleDriverStartTrip(t)}
                            className="px-4 py-2 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl shadow-sm flex items-center gap-1.5 transition-all"
                          >
                            {startLoading ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>{isRtl ? 'جاري جلب إحداثيات البداية...' : 'Starting with GPS...'}</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4 fill-white" />
                                <span>{isRtl ? 'بداية الرحلة (تسجيل موقع البداية GPS)' : 'Start Trip (GPS)'}</span>
                              </>
                            )}
                          </button>
                        )}

                        {/* Complete Trip Button */}
                        {isDispatched && (
                          <button
                            type="button"
                            disabled={completeLoading}
                            onClick={() => handleDriverCompleteTrip(t)}
                            className="px-4 py-2 text-xs font-extrabold bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white rounded-xl shadow-sm flex items-center gap-1.5 transition-all"
                          >
                            {completeLoading ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>{isRtl ? 'جاري الإغلاق...' : 'Finishing...'}</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4" />
                                <span>{isRtl ? 'إنهاء الرحلة' : 'Complete Trip'}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Driver Field Portal Tab */}
      {activeTab === 'driver_portal' && (
        <DriverPortalView
          trips={trips}
          companyId={companyId}
          activeUser={{
            id: activeUser?.id || 'usr-driver-1',
            full_name: activeUser?.full_name || 'السائق الميداني',
            role: activeUser?.role || 'driver',
            permissions: activeUser?.permissions
          }}
          isRtl={isRtl}
          onRefresh={() => loadData()}
          onOpenChat={(trip) => {
            setSelectedTripForChat(trip);
            setShowChatModal(true);
          }}
          showToast={(type, msg) => showToast(type === 'error' ? 'error' : 'success', msg)}
        />
      )}

      {/* Live Map & Breadcrumbs Tab */}
      {activeTab === 'live_map' && (
        <LiveFleetMapDashboard
          companyId={companyId}
          language={language}
          vehicles={vehicles}
          trips={trips}
          onRefreshData={loadData}
        />
      )}

      {/* Vehicle Constraints Tab */}
      {activeTab === 'vehicle_constraints' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-rose-900/10 via-amber-900/10 to-indigo-900/10 dark:from-rose-950/40 dark:via-amber-950/40 dark:to-indigo-950/40 border border-rose-200/60 dark:border-rose-900/40 rounded-2xl p-4.5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-600 text-white rounded-xl shadow-md">
                <Ban className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{isRtl ? 'قيود وصول وتوجيه المركبات' : 'Vehicle Access & Dispatch Constraints'}</span>
                  <span className="px-2 py-0.5 text-[11px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 rounded-full">
                    {constraints.filter(c => c.is_active).length} {isRtl ? 'قيد نشط' : 'Active'}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isRtl 
                    ? 'منع مركبات محددة من الذهاب لفروع معينة أو قصرها على المشاوير الخارجية فقط. يتم فحص القيود آلياً عند إنشاء أي مشوار.'
                    : 'Enforce routing rules per vehicle. Prohibit dispatching to specific branches or restrict to external trips only.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>{isRtl ? 'حماية تلقائية فعالة عند جدولة المشاوير' : 'Active enforcement on trip creation'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* New Constraint Form */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <Plus className="h-4 w-4 text-rose-600" />
                  <span>{isRtl ? 'إضافة قيد وصول جديد لمركبة' : 'Add Vehicle Access Constraint'}</span>
                </h3>
              </div>

              <form onSubmit={handleSaveConstraint} className="space-y-4">
                {/* 1. Vehicle Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    {isRtl ? '1. اختر المركبة *' : '1. Select Vehicle *'}
                  </label>
                  <select
                    value={constraintForm.vehicle_id}
                    onChange={(e) => setConstraintForm({ ...constraintForm, vehicle_id: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-semibold"
                  >
                    <option value="">{isRtl ? '-- اختر المركبة من الأسطول --' : '-- Select Fleet Vehicle --'}</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.plateNumber} — {v.make} {v.model} {v.driverName ? `(سائق: ${v.driverName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Mode Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    {isRtl ? '2. نوع القيد والوضع *' : '2. Constraint Mode *'}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setConstraintForm({ ...constraintForm, mode: 'BLOCK_SPECIFIC_LOCATIONS' })}
                      className={`p-3 rounded-2xl border text-right transition-all flex flex-col gap-1 ${
                        constraintForm.mode === 'BLOCK_SPECIFIC_LOCATIONS'
                          ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-950/50 text-rose-900 dark:text-rose-100 shadow-sm ring-2 ring-rose-400/20'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold text-xs">{isRtl ? 'منع مواقع محددة' : 'Block Specific Locations'}</span>
                        {constraintForm.mode === 'BLOCK_SPECIFIC_LOCATIONS' && <CheckCircle2 className="h-4 w-4 text-rose-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {isRtl ? 'حظر توجيه المركبة إلى فروع ومواقع تختارها بنفسك' : 'Block dispatch to selected branches only'}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConstraintForm({ ...constraintForm, mode: 'EXTERNAL_ONLY' })}
                      className={`p-3 rounded-2xl border text-right transition-all flex flex-col gap-1 ${
                        constraintForm.mode === 'EXTERNAL_ONLY'
                          ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/50 text-amber-900 dark:text-amber-100 shadow-sm ring-2 ring-amber-400/20'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold text-xs">{isRtl ? 'خارجي فقط' : 'External Trips Only'}</span>
                        {constraintForm.mode === 'EXTERNAL_ONLY' && <CheckCircle2 className="h-4 w-4 text-amber-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {isRtl ? 'منع كل الفروع والوحدات المسجلة (للمشاوير الخارجية فقط)' : 'Block all registered company branches'}
                      </p>
                    </button>
                  </div>
                </div>

                {/* 3. Location Selector (if BLOCK_SPECIFIC_LOCATIONS) */}
                {constraintForm.mode === 'BLOCK_SPECIFIC_LOCATIONS' && (
                  <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-rose-600" />
                        <span>{isRtl ? '3. اختر المواقع والفروع المحظورة *' : '3. Select Blocked Locations *'}</span>
                      </label>
                      <span className="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400">
                        {constraintForm.blocked_org_unit_ids.length} {isRtl ? 'موقع محدد' : 'selected'}
                      </span>
                    </div>

                    <div className="relative">
                      <Search className="absolute right-2.5 rtl:right-2.5 rtl:left-auto ltr:left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={orgUnitConstraintSearch}
                        onChange={(e) => setOrgUnitConstraintSearch(e.target.value)}
                        placeholder={isRtl ? 'بحث في الفروع والمواقع...' : 'Search locations...'}
                        className="w-full pl-3 pr-8 rtl:pr-8 rtl:pl-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = orgUnits.map(u => u.id);
                          setConstraintForm({ ...constraintForm, blocked_org_unit_ids: allIds });
                        }}
                        className="text-indigo-600 hover:underline font-bold"
                      >
                        {isRtl ? 'تحديد كل المواقع' : 'Select All'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConstraintForm({ ...constraintForm, blocked_org_unit_ids: [] })}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        {isRtl ? 'إلغاء التحديد' : 'Clear All'}
                      </button>
                    </div>

                    {/* OrgUnit Multi-select Checkbox List */}
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                      {orgUnits
                        .filter(u => !orgUnitConstraintSearch || u.name.toLowerCase().includes(orgUnitConstraintSearch.toLowerCase()) || (u.code && u.code.toLowerCase().includes(orgUnitConstraintSearch.toLowerCase())))
                        .map(unit => {
                          const isChecked = constraintForm.blocked_org_unit_ids.includes(unit.id);
                          return (
                            <div
                              key={unit.id}
                              onClick={() => {
                                if (isChecked) {
                                  setConstraintForm({
                                    ...constraintForm,
                                    blocked_org_unit_ids: constraintForm.blocked_org_unit_ids.filter(id => id !== unit.id)
                                  });
                                } else {
                                  setConstraintForm({
                                    ...constraintForm,
                                    blocked_org_unit_ids: [...constraintForm.blocked_org_unit_ids, unit.id]
                                  });
                                }
                              }}
                              className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all border ${
                                isChecked
                                  ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {isChecked ? (
                                  <CheckSquare className="h-4 w-4 text-rose-600 shrink-0" />
                                ) : (
                                  <Square className="h-4 w-4 text-slate-400 shrink-0" />
                                )}
                                <span className="font-bold">{unit.name}</span>
                              </div>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                {unit.code || unit.type}
                              </span>
                            </div>
                          );
                        })}
                      {orgUnits.length === 0 && (
                        <p className="text-center py-3 text-xs text-slate-400">
                          {isRtl ? 'لا توجد وحدات تنظيمية مسجلة' : 'No org units found'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. Reason */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    {isRtl ? '4. سبب وضع القيد (اختياري)' : '4. Reason for constraint (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={constraintForm.reason}
                    onChange={(e) => setConstraintForm({ ...constraintForm, reason: e.target.value })}
                    placeholder={isRtl ? 'مثال: سيارة مخصصة لعملاء الإسكندرية / غير مجهزة لدخول المستودع الرئيسي' : 'e.g. Dedicated for external clients only'}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <ShieldAlert className="h-4 w-4" />
                  <span>
                    {isSubmitting 
                      ? (isRtl ? 'جاري حفظ القيد...' : 'Saving constraint...') 
                      : (isRtl ? 'حفظ وتفعيل القيد على المركبة' : 'Save & Activate Constraint')}
                  </span>
                </button>
              </form>
            </div>

            {/* Constraints Table / List */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                    {isRtl ? 'سجل قيود وصول المركبات' : 'Active & Configured Constraints'}
                  </h3>
                </div>
                <span className="text-xs font-bold text-slate-400">
                  {constraints.length} {isRtl ? 'قيد مسجل' : 'records'}
                </span>
              </div>

              {constraints.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Ban className="h-10 w-10 text-slate-300 dark:text-slate-700 mx-auto" />
                  <p className="text-sm font-bold text-slate-500">
                    {isRtl ? 'لا توجد أي قيود وصول مسجلة للمركبات حالياً' : 'No vehicle constraints configured yet'}
                  </p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {isRtl ? 'استخدم النموذج الجانبي لتحديد فروع محظورة أو قصر مركبات معينة على المشاوير الخارجية.' : 'Use the form to enforce routing rules for vehicles.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right rtl:text-right ltr:text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold">
                        <th className="pb-3 px-2">{isRtl ? 'المركبة' : 'Vehicle'}</th>
                        <th className="pb-3 px-2">{isRtl ? 'نوع القيد' : 'Mode'}</th>
                        <th className="pb-3 px-2">{isRtl ? 'المواقع الممنوعة' : 'Blocked Targets'}</th>
                        <th className="pb-3 px-2">{isRtl ? 'الحالة' : 'Status'}</th>
                        <th className="pb-3 px-2 text-center">{isRtl ? 'الإجراءات' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {constraints.map((rule) => {
                        const targetVehicle = vehicles.find(v => v.id === rule.vehicle_id);
                        const blockedCount = rule.blocked_org_unit_ids?.length || 0;
                        const blockedNames = (rule.blocked_org_unit_ids || [])
                          .map(id => orgUnits.find(u => u.id === id)?.name || id)
                          .slice(0, 3);

                        return (
                          <tr key={rule.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40 transition-colors">
                            <td className="py-3 px-2">
                              <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                <Truck className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                <span>{targetVehicle?.plateNumber || rule.vehicle_id}</span>
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {targetVehicle ? `${targetVehicle.make} ${targetVehicle.model}` : ''}
                              </div>
                            </td>

                            <td className="py-3 px-2">
                              {rule.mode === 'EXTERNAL_ONLY' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                                  <span>{isRtl ? 'خارجي فقط' : 'External Only'}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300">
                                  <span>{isRtl ? 'منع مواقع محددة' : 'Specific Locations'}</span>
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-2 max-w-[200px]">
                              {rule.mode === 'EXTERNAL_ONLY' ? (
                                <span className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                                  {isRtl ? 'جميع الفروع والوحدات المسجلة' : 'All registered branches'}
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  <div className="flex flex-wrap gap-1">
                                    {blockedNames.map((name, i) => (
                                      <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-700 dark:text-slate-300">
                                        {name}
                                      </span>
                                    ))}
                                    {blockedCount > 3 && (
                                      <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 text-[10px] font-bold font-mono">
                                        +{blockedCount - 3}
                                      </span>
                                    )}
                                  </div>
                                  {rule.reason && (
                                    <p className="text-[10px] text-slate-400 truncate" title={rule.reason}>
                                      💬 {rule.reason}
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-2">
                              {rule.is_active ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                                  <CheckCircle className="h-3 w-3" />
                                  <span>{isRtl ? 'نشط' : 'Active'}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                                  <X className="h-3 w-3" />
                                  <span>{isRtl ? 'معطّل' : 'Inactive'}</span>
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-2 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleConstraint(rule.id, rule.is_active)}
                                  title={rule.is_active ? (isRtl ? 'إلغاء تفعيل القيد' : 'Deactivate') : (isRtl ? 'إعادة تفعيل القيد' : 'Activate')}
                                  className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 border transition-all ${
                                    rule.is_active
                                      ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                                  }`}
                                >
                                  <Power className="h-3.5 w-3.5" />
                                  <span>{rule.is_active ? (isRtl ? 'إلغاء التفعيل' : 'Disable') : (isRtl ? 'تفعيل' : 'Enable')}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteConstraint(rule.id)}
                                  title={isRtl ? 'حذف القيد' : 'Delete'}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition-all"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Costs & Maintenance Health Tab */}
      {activeTab === 'costs_and_maintenance' && (
        <FleetCostAndMaintenanceDashboard
          companyId={companyId}
          isRtl={isRtl}
          onRefresh={loadData}
          onOpenLogMaintenance={(veh, defaultType) => {
            const actualVeh = vehicles.find(v => v.id === veh.id) || veh;
            setSelectedVehicleForLog(actualVeh);
            if (defaultType) {
              setMaintenanceForm(prev => ({
                ...prev,
                type: defaultType,
                description: defaultType === 'OIL_CHANGE' 
                  ? (isRtl ? 'تغيير زيت وفلتر دوري' : 'Periodic Oil & Filter Change')
                  : defaultType === 'TIRES'
                  ? (isRtl ? 'صيانة وترصيص وتغيير إطارات' : 'Tire & Brake Service')
                  : (isRtl ? 'صيانة دورية شاملة' : 'Routine Comprehensive Service'),
                odometerAtService: actualVeh.odometerReading || 0
              }));
            }
            setShowLogMaintenance(true);
          }}
          onOpenLogFuel={(veh) => {
            const actualVeh = vehicles.find(v => v.id === veh.id) || veh;
            setSelectedVehicleForLog(actualVeh);
            setFuelForm(prev => ({
              ...prev,
              odometerReading: actualVeh.odometerReading || 0
            }));
            setShowLogFuel(true);
          }}
        />
      )}

      {/* Driver Performance Scorecards & Digital Safety Inspection Tab */}
      {activeTab === 'driver_safety' && (
        <DriverPerformanceAndSafetyDashboard
          companyId={companyId}
          isRtl={isRtl}
          onRefresh={loadData}
          onOpenPerformInspection={(veh, driverId, driverName) => {
            setInspectionTargetVehicle(veh);
            setInspectionTargetDriver({ id: driverId, name: driverName });
          }}
        />
      )}

      {/* Standalone Inspection Modal triggered from Management */}
      {inspectionTargetVehicle && inspectionTargetDriver && (
        <VehicleInspectionModal
          isOpen={Boolean(inspectionTargetVehicle)}
          onClose={() => {
            setInspectionTargetVehicle(null);
            setInspectionTargetDriver(null);
          }}
          vehicle={inspectionTargetVehicle}
          driverId={inspectionTargetDriver.id}
          driverName={inspectionTargetDriver.name}
          companyId={companyId}
          isRtl={isRtl}
          onInspectionSubmitted={() => {
            loadData();
            setInspectionTargetVehicle(null);
            setInspectionTargetDriver(null);
          }}
        />
      )}

      {/* Add Vehicle Modal */}
      {showAddVehicle && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-lg border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                  {isRtl ? 'تسجيل مركبة جديدة بالأسطول' : 'Register New Fleet Vehicle'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {isRtl ? 'الحقول الإلزامية: رقم اللوحة، نوع المركبة، اسم السائق' : 'Required fields: Plate Number, Vehicle Type, Driver Name'}
                </p>
              </div>
              <button onClick={() => setShowAddVehicle(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleAddVehicle} className="space-y-3">
              {/* Branch / Station Selection or Auto-Assignment */}
              {isCompanyLevelFleetManager ? (
                <div>
                  <OrgUnitTreeSelect
                    label={isRtl ? 'الوحدة التنظيمية / الفرع / المحطة' : 'Organization Unit / Branch / Station'}
                    value={formOrgUnitId}
                    onChange={(id) => setFormOrgUnitId(id)}
                    placeholder={isRtl ? '-- حدد الفرع أو المحطة التابعة لها المركبة --' : '-- Select Branch or Station --'}
                    companyId={companyId}
                    isRtl={isRtl}
                    theme={undefined}
                    showInheritanceSummary={false}
                  />
                </div>
              ) : (
                <div>
                  {activeUser?.org_unit_id ? (
                    <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/60 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                          {isRtl ? 'الفرع / المحطة التابعة لها المركبة' : 'Assigned Branch / Station'}
                        </span>
                        <span className="text-xs font-black text-indigo-700 dark:text-indigo-300">
                          {orgUnits.find(u => u.id === activeUser.org_unit_id)?.name || orgUnits.find(u => u.id === activeUser.org_unit_id)?.name_ar || activeUser.org_unit_id}
                        </span>
                      </div>
                      <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 font-bold px-2.5 py-1 rounded-full">
                        {isRtl ? 'تلقائي حسب صلاحيتك' : 'Auto-Assigned'}
                      </span>
                    </div>
                  ) : (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-2xl flex items-start gap-2.5">
                      <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-rose-800 dark:text-rose-200 font-medium leading-relaxed">
                        {isRtl
                          ? 'تنبيه: حسابك غير مرتبط بأي فرع أو محطة بالهيكل التنظيمي. لا يمكنك إضافة مركبات حتى يتم ربط حسابك بفرع من قبل إدارة النظام.'
                          : 'Notice: Your account is not assigned to any branch/station. You cannot register vehicles until assigned to a branch by an admin.'}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Required Core Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                    {isRtl ? 'رقم اللوحة المعدنية' : 'Plate Number'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={vehicleForm.plateNumber}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })}
                    required
                    placeholder="e.g. أ ب ج 1234"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                    {isRtl ? 'نوع المركبة' : 'Vehicle Type'} <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={vehicleForm.type}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, type: e.target.value as any })}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="TRUCK">شاحنة نقل</option>
                    <option value="PICKUP">بيك آب / نصف نقل</option>
                    <option value="VAN">فان توزيع</option>
                    <option value="CAR">سيارة ركوب</option>
                    <option value="HEAVY_EQUIPMENT">معدات ثقيلة</option>
                  </select>
                </div>
              </div>

              {/* Required Driver */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  {isRtl ? 'اسم السائق المكلّف' : 'Driver Name'} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={vehicleForm.driverName}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, driverName: e.target.value })}
                  required
                  placeholder={isRtl ? 'اسم السائق المسؤول عن المركبة' : 'Driver in charge'}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Optional Fields Divider */}
              <div className="pt-2 pb-1 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-400">
                  {isRtl ? 'بيانات ومواصفات إضافية (اختيارية):' : 'Additional details (optional):'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {isRtl ? 'الماركة المصنعة (اختياري)' : 'Make (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={vehicleForm.make}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
                    placeholder="e.g. Mercedes, Toyota"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {isRtl ? 'الموديل وسنة الصنع (اختياري)' : 'Model & Year (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={vehicleForm.model}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                    placeholder="e.g. Actros 1842"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {isRtl ? 'كود المركبة' : 'Code'}
                  </label>
                  <input
                    type="text"
                    value={vehicleForm.code}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, code: e.target.value })}
                    placeholder={isRtl ? 'تلقائي' : 'Auto'}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {isRtl ? 'قراءة العداد (KM)' : 'Odometer (KM)'}
                  </label>
                  <input
                    type="number"
                    value={vehicleForm.odometerReading || ''}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, odometerReading: Number(e.target.value) })}
                    placeholder="0"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {isRtl ? 'سعة الخزان (لتر)' : 'Fuel Cap. (L)'}
                  </label>
                  <input
                    type="number"
                    value={vehicleForm.fuelCapacity || ''}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, fuelCapacity: Number(e.target.value) })}
                    placeholder="100"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddVehicle(false)}
                  className="flex-1 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (!isCompanyLevelFleetManager && !activeUser?.org_unit_id)}
                  className="flex-1 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl shadow-sm transition-all"
                >
                  {isSubmitting ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ وتأكيد المركبة' : 'Save Vehicle')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Trip Modal */}
      {showAddTrip && canCreateTrip && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-lg border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <Navigation className="h-5 w-5 text-emerald-600" />
                <span>{isRtl ? 'إنشاء مشوار جديد (مسودة)' : 'Create New Trip (DRAFT)'}</span>
              </h3>
              <button onClick={() => setShowAddTrip(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleCreateTrip} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    {isRtl ? 'اختر المركبة *' : 'Select Vehicle *'}
                  </label>
                  <select
                    value={tripForm.vehicle_id}
                    onChange={(e) => setTripForm({ ...tripForm, vehicle_id: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  >
                    <option value="">{isRtl ? '-- اختر مركبة --' : '-- Select Vehicle --'}</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.plateNumber} ({v.make} {v.model})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    {isRtl ? 'اختر السائق *' : 'Select Driver *'}
                  </label>
                  <select
                    value={tripForm.driver_id}
                    onChange={(e) => setTripForm({ ...tripForm, driver_id: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  >
                    <option value="">{isRtl ? '-- اختر سائق --' : '-- Select Driver --'}</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Multi-stop Route / Tasks Section */}
              <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60 dark:border-slate-800/60">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                        {isRtl ? 'مهام ومحطات المشوار *' : 'Trip Tasks & Stops *'}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        {isRtl ? 'سجل المهام المطلوبة (ويتم تسجيل إحداثيات الوصول بالـ GPS تلقائياً بواسطة السائق)' : 'Register required tasks (Driver captures GPS on arrival)'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddStopRow}
                    className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg flex items-center gap-1 transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{isRtl ? '+ إضافة مهمة/محطة' : '+ Add Task/Stop'}</span>
                  </button>
                </div>

                {/* Quick Task Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] font-bold text-slate-400">{isRtl ? 'مهام شائعة:' : 'Common Tasks:'}</span>
                  {['بوسطة', 'تغيير اسطوانات غاز / أنابيب', 'صيانة', 'استلام بضاعة ومستندات', 'تسليم عميل'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        // Apply preset to the last pending stop or add a new stop
                        const lastIndex = tripForm.stops.length - 1;
                        if (lastIndex >= 0 && !tripForm.stops[lastIndex].taskTitle && !tripForm.stops[lastIndex].label) {
                          handleStopLabelChange(lastIndex, preset);
                        } else {
                          setTripForm(prev => ({
                            ...prev,
                            stops: [
                              ...prev.stops,
                              {
                                id: `stop-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                                taskTitle: preset,
                                label: preset,
                                org_unit_id: '',
                                notes: '',
                                lat: undefined,
                                lng: undefined
                              }
                            ]
                          }));
                        }
                      }}
                      className="px-2 py-0.5 text-[10px] font-semibold bg-white dark:bg-slate-900 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950 border border-slate-200 dark:border-slate-800 rounded-md transition-all"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>

                <datalist id="fleet-org-units-list">
                  {orgUnits.map(u => (
                    <option key={u.id} value={`${u.code} - ${u.name}`} />
                  ))}
                </datalist>

                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {tripForm.stops.map((stop, sIdx) => {
                    const isFirst = sIdx === 0;
                    const isLast = sIdx === tripForm.stops.length - 1;
                    const stopDefaultPlaceholder = isFirst
                      ? (isRtl ? 'نقطة الانطلاق (مثال: الفرع الرئيسي)' : 'Departure / Origin')
                      : isLast
                      ? (isRtl ? 'المهمة الأخيرة / نقطة العودة' : 'Final Task / Destination')
                      : (isRtl ? `المهمة / النقطة (${sIdx + 1})` : `Task (${sIdx + 1})`);

                    return (
                      <div
                        key={stop.id || sIdx}
                        className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-[10px] font-black rounded-md shrink-0 ${
                            isFirst ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
                            isLast ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' :
                            'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                            #{sIdx + 1}
                          </span>

                          <div className="flex-1 relative">
                            <input
                              type="text"
                              list="fleet-org-units-list"
                              value={stop.label}
                              onChange={(e) => handleStopLabelChange(sIdx, e.target.value)}
                              placeholder={stopDefaultPlaceholder}
                              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                            />
                            {stop.lat !== undefined && stop.lng !== undefined && (
                              <span className="absolute left-2 rtl:left-2 rtl:right-auto ltr:right-2 top-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 pointer-events-none">
                                📍 {stop.lat.toFixed(3)}, {stop.lng.toFixed(3)}
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleOpenMapPicker(sIdx)}
                            title={isRtl ? 'اختار من الخريطة (اختياري)' : 'Select from Map (Optional)'}
                            className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 border transition-all ${
                              stop.lat !== undefined
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700'
                            }`}
                          >
                            <Map className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={tripForm.stops.length <= 2}
                            onClick={() => handleRemoveStopRow(sIdx)}
                            title={isRtl ? 'حذف هذه النقطة' : 'Remove Stop'}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-all"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Learned Location Suggestions for this task/stop */}
                        {(() => {
                          const taskKey = stop.taskTitle || stop.label;
                          if (!taskKey) return null;
                          const learnedList = FleetBusinessEngine.getLearnedLocations(companyId, stop.org_unit_id, taskKey);
                          if (!learnedList || learnedList.length === 0) return null;
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5">
                                <Sparkles className="h-2.5 w-2.5" />
                                {isRtl ? 'مواقع مقترحة بناءً على السوابق:' : 'Learned locations:'}
                              </span>
                              {learnedList.slice(0, 3).map((entry, eIdx) => (
                                <button
                                  key={eIdx}
                                  type="button"
                                  onClick={() => {
                                    const updated = [...tripForm.stops];
                                    updated[sIdx] = {
                                      ...updated[sIdx],
                                      label: entry.label,
                                      lat: entry.lat,
                                      lng: entry.lng
                                    };
                                    setTripForm({ ...tripForm, stops: updated });
                                  }}
                                  className="px-2 py-0.5 text-[9px] font-medium bg-indigo-50/80 dark:bg-indigo-950/80 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 rounded-md transition-all flex items-center gap-1"
                                >
                                  <span>📍 {entry.label}</span>
                                  <span className="opacity-60 font-mono">({entry.visitCount}x)</span>
                                </button>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Stop Notes / Description */}
                        <div>
                          <input
                            type="text"
                            value={stop.notes || ''}
                            onChange={(e) => {
                              const updated = [...tripForm.stops];
                              updated[sIdx] = { ...updated[sIdx], notes: e.target.value };
                              setTripForm({ ...tripForm, stops: updated });
                            }}
                            placeholder={isRtl ? 'تفاصيل المهمة (مثال: استلام 3 طرود بريدية أو تغيير أنبوبتين بالفرع)...' : 'Task details & instructions...'}
                            className="w-full px-2.5 py-1 text-[11px] rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 placeholder:text-slate-400"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    {isRtl ? 'نوع المشوار *' : 'Trip Type *'}
                  </label>
                  <input
                    type="text"
                    value={tripForm.tripType}
                    onChange={(e) => setTripForm({ ...tripForm, tripType: e.target.value })}
                    required
                    placeholder={isRtl ? 'مثال: نقل بضائع / صيانة خارجية / مهمة عمل' : 'e.g. Freight / Cargo / Patrol'}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    {isRtl ? 'الموعد المجدول *' : 'Scheduled At *'}
                  </label>
                  <input
                    type="datetime-local"
                    value={tripForm.scheduledAt}
                    onChange={(e) => setTripForm({ ...tripForm, scheduledAt: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {isRtl ? 'ملاحظات إضافية' : 'Additional Notes'}
                </label>
                <input
                  type="text"
                  value={tripForm.notes}
                  onChange={(e) => setTripForm({ ...tripForm, notes: e.target.value })}
                  placeholder={isRtl ? 'أي تفاصيل خاصة بالمشوار...' : 'Any additional notes...'}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddTrip(false)}
                  className="flex-1 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl shadow-sm"
                >
                  {isSubmitting ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ بصفة مسودة' : 'Save Draft Trip')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Maintenance Modal */}
      {showLogMaintenance && selectedVehicleForLog && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                {isRtl ? `تسجيل صيانة: ${selectedVehicleForLog.plateNumber}` : `Log Maintenance: ${selectedVehicleForLog.plateNumber}`}
              </h3>
              <button onClick={() => setShowLogMaintenance(false)} className="text-slate-400">✕</button>
            </div>

            <form onSubmit={handleLogMaintenance} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'نوع الصيانة' : 'Maintenance Type'}</label>
                <select
                  value={maintenanceForm.type}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, type: e.target.value as any })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                >
                  <option value="ROUTINE">صيانة دورية</option>
                  <option value="OIL_CHANGE">تغيير زيوت وفلاتر</option>
                  <option value="TIRES">تغيير إطارات وبطاريات</option>
                  <option value="REPAIR">إصلاح أعطال مفاجئة</option>
                  <option value="INSPECTION">فحص وفحص فني</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'وصف الصيانة والإصلاح' : 'Description'}</label>
                <input
                  type="text"
                  value={maintenanceForm.description}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })}
                  required
                  placeholder="e.g. تغيير زيت المحرك 10,000 كم وفلتر الزيت"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'التكلفة الإجمالية (ج.م)' : 'Cost (EGP)'}</label>
                  <input
                    type="number"
                    value={maintenanceForm.cost}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, cost: Number(e.target.value) })}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'الكيلومترات عند الخدمة' : 'Odometer Reading'}</label>
                  <input
                    type="number"
                    value={maintenanceForm.odometerAtService || selectedVehicleForLog.odometerReading}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, odometerAtService: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowLogMaintenance(false)}
                  className="flex-1 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 rounded-xl"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl"
                >
                  {isSubmitting ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ واعتماد الصيانة' : 'Save Maintenance')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Fuel Modal */}
      {showLogFuel && selectedVehicleForLog && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                {isRtl ? `تسجيل وقود: ${selectedVehicleForLog.plateNumber}` : `Fuel Refill: ${selectedVehicleForLog.plateNumber}`}
              </h3>
              <button onClick={() => setShowLogFuel(false)} className="text-slate-400">✕</button>
            </div>

            <form onSubmit={handleLogFuel} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'كمية اللترات' : 'Liters'}</label>
                  <input
                    type="number"
                    value={fuelForm.liters}
                    onChange={(e) => setFuelForm({ ...fuelForm, liters: Number(e.target.value) })}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'سعر اللتر (ج.م)' : 'Price / Liter'}</label>
                  <input
                    type="number"
                    value={fuelForm.costPerLiter}
                    onChange={(e) => setFuelForm({ ...fuelForm, costPerLiter: Number(e.target.value) })}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/60 rounded-xl border border-amber-200/50 flex items-center justify-between text-xs font-bold text-amber-800 dark:text-amber-200">
                <span>{isRtl ? 'التكلفة الإجمالية' : 'Total Fuel Cost'}:</span>
                <span className="font-mono text-sm">{(fuelForm.liters * fuelForm.costPerLiter).toLocaleString()} EGP</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'الكيلومترات عند التموين' : 'Odometer Reading'}</label>
                <input
                  type="number"
                  value={fuelForm.odometerReading || selectedVehicleForLog.odometerReading}
                  onChange={(e) => setFuelForm({ ...fuelForm, odometerReading: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowLogFuel(false)}
                  className="flex-1 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 rounded-xl"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl"
                >
                  {isSubmitting ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ واعتماد الوقود' : 'Save Fuel Record')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Breakdown Reassignment Modal (Smart Task Redistribution) */}
      <BreakdownReassignmentModal
        isOpen={showBreakdownModal}
        onClose={() => {
          setShowBreakdownModal(false);
          setSelectedVehicleForBreakdown(null);
        }}
        vehicle={selectedVehicleForBreakdown}
        companyId={companyId}
        activeUserId={activeUser?.id || 'admin'}
        isRtl={isRtl}
        onReassigned={() => {
          setShowBreakdownModal(false);
          setSelectedVehicleForBreakdown(null);
          loadData();
        }}
      />

      {/* Emergency Trip Fast Dispatch Modal */}
      <EmergencyTripModal
        isOpen={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
        companyId={companyId}
        activeUserId={activeUser?.id || 'admin'}
        orgUnits={orgUnits}
        isRtl={isRtl}
        onSuccess={() => {
          showToast('success', isRtl ? 'تم إرسال المشوار الطارئ بنجاح وجاري المتابعة الميدانية' : 'Emergency trip dispatched successfully');
          loadData();
        }}
      />

      {/* Leaflet Map Picker Modal */}
      <LeafletMapPickerModal
        isOpen={mapModalOpen}
        onClose={() => {
          setMapModalOpen(false);
          setActiveMapStopIndex(null);
        }}
        onConfirm={handleConfirmMapCoords}
        initialLat={activeMapStopIndex !== null ? tripForm.stops[activeMapStopIndex]?.lat : undefined}
        initialLng={activeMapStopIndex !== null ? tripForm.stops[activeMapStopIndex]?.lng : undefined}
        stopLabel={activeMapStopIndex !== null ? tripForm.stops[activeMapStopIndex]?.label : undefined}
        isRtl={isRtl}
      />

      {/* Operational Trip Chat Modal */}
      <TripChatModal
        isOpen={showChatModal}
        onClose={() => {
          setShowChatModal(false);
          setSelectedTripForChat(null);
        }}
        trip={selectedTripForChat}
        companyId={companyId}
        currentUser={{
          id: activeUser?.id || 'admin',
          full_name: activeUser?.full_name || 'إدارة الحركة والتشغيل',
          role: activeUser?.role || 'admin'
        }}
        isRtl={isRtl}
      />

      {/* Trip Conflict Warning Modal (Manual Supervisor Decisions) */}
      <TripConflictWarningModal
        isOpen={showConflictModal}
        onClose={handleCancelConflict}
        conflicts={conflictWarnings}
        onProceedWithOverride={handleProceedConflictOverride}
        onEditAssignment={handleEditAssignmentFromConflict}
        onCancel={handleCancelConflict}
        language={language}
        candidateVehiclePlate={vehicles.find(v => v.id === pendingTripData?.vehicle_id)?.plateNumber}
        candidateVehicleCode={vehicles.find(v => v.id === pendingTripData?.vehicle_id)?.code}
        candidateDriverName={users.find(u => u.id === pendingTripData?.driver_id)?.full_name}
        scheduledAt={pendingTripData?.scheduledAt}
      />

      {/* Dynamic Route Stops & Tasks Manager Modal (Phase 2) */}
      {showStopsManagerModal && selectedTripForStopsManager && (
        <TripStopsManagerModal
          trip={selectedTripForStopsManager}
          companyId={companyId}
          currentUserId={activeUser?.id || 'admin'}
          allTrips={trips}
          vehicles={vehicles}
          drivers={users.filter(u => u.is_active).map(u => ({ id: u.id, name: u.full_name || u.name || u.email }))}
          onClose={() => {
            setShowStopsManagerModal(false);
            setSelectedTripForStopsManager(null);
          }}
          onTripUpdated={(updatedTrip) => {
            setSelectedTripForStopsManager(updatedTrip);
            loadData();
          }}
        />
      )}

      {/* Historical Route Replay Modal (Phase 3) */}
      {showReplayModal && selectedTripForReplay && (
        <TripRouteReplayModal
          isOpen={showReplayModal}
          onClose={() => {
            setShowReplayModal(false);
            setSelectedTripForReplay(null);
          }}
          trip={selectedTripForReplay}
          companyId={companyId}
          isRtl={isRtl}
        />
      )}
      </div>
    </ErrorBoundary>
  );
}
