import React, { useState } from 'react';
import { 
  Activity, 
  Truck, 
  Navigation, 
  AlertTriangle, 
  Wrench, 
  Clock, 
  User, 
  MapPin, 
  Calendar, 
  Plus, 
  RefreshCw, 
  Siren, 
  Radio, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRightLeft, 
  MessageSquare, 
  ChevronRight, 
  ShieldAlert,
  Search,
  Filter,
  CheckCircle,
  Play
} from 'lucide-react';
import { 
  Vehicle, 
  Trip, 
  DailyOperationsSummary, 
  TripConflictWarning,
  TripStatus 
} from '../types/fleet';
import { FleetBusinessEngine } from '../lib/enterprise/fleet_engine';

interface DailyOperationsDashboardProps {
  language: 'ar' | 'en';
  companyId: string;
  vehicles: Vehicle[];
  trips: Trip[];
  users: any[];
  orgUnits: any[];
  onRefresh: () => void;
  onOpenAddTrip: () => void;
  onOpenEmergencyModal: () => void;
  onOpenChatModal: (trip: Trip) => void;
  onOpenStopsManager?: (trip: Trip) => void;
  onOpenBreakdownModal: (vehicle: Vehicle) => void;
  onNavigateToLiveMap: () => void;
  onNavigateToTrips: () => void;
  onNavigateToVehicles: () => void;
  onDispatchTrip?: (tripId: string) => void;
  onStartGpsTrip?: (tripId: string) => void;
}

export const DailyOperationsDashboard: React.FC<DailyOperationsDashboardProps> = ({
  language,
  companyId,
  vehicles,
  trips,
  users,
  orgUnits,
  onRefresh,
  onOpenAddTrip,
  onOpenEmergencyModal,
  onOpenChatModal,
  onOpenStopsManager,
  onOpenBreakdownModal,
  onNavigateToLiveMap,
  onNavigateToTrips,
  onNavigateToVehicles,
  onDispatchTrip,
  onStartGpsTrip
}) => {
  const isRtl = language === 'ar';
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE_TRIPS' | 'DELAYED' | 'CONFLICTS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate summary using FleetBusinessEngine
  const summary: DailyOperationsSummary = React.useMemo(() => {
    return FleetBusinessEngine.getDailyOperationsSummary(companyId, selectedDate);
  }, [companyId, selectedDate, vehicles, trips]);

  const getDriverName = (driverId: string) => {
    const u = users.find(user => user.id === driverId);
    return u?.full_name || driverId || (isRtl ? 'غير محدد' : 'Unassigned');
  };

  const getVehicleInfo = (vehicleId: string) => {
    const v = vehicles.find(veh => veh.id === vehicleId);
    if (!v) return { code: vehicleId, plate: '', model: '' };
    return { code: v.code, plate: v.plateNumber, model: `${v.make} ${v.model}` };
  };

  const getStatusBadge = (status: TripStatus) => {
    switch (status) {
      case 'DRAFT':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">{isRtl ? 'مسودة' : 'Draft'}</span>;
      case 'APPROVED':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">{isRtl ? 'معتمد' : 'Approved'}</span>;
      case 'DISPATCHED':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 animate-pulse">{isRtl ? 'بدأ الرحلة' : 'Dispatched'}</span>;
      case 'IN_PROGRESS':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">{isRtl ? 'جاري التنفيذ' : 'In Progress'}</span>;
      case 'COMPLETED':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">{isRtl ? 'مكتمل' : 'Completed'}</span>;
      case 'CANCELLED':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">{isRtl ? 'ملغي' : 'Cancelled'}</span>;
      default:
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  // Filter open trips for search
  const filteredOpenTrips = summary.openTrips.filter(trip => {
    if (statusFilter === 'ACTIVE_TRIPS' && trip.status !== 'DISPATCHED' && trip.status !== 'IN_PROGRESS') return false;
    if (statusFilter === 'DELAYED' && !summary.delayedOrNotStartedTrips.some(d => d.id === trip.id)) return false;
    if (statusFilter === 'CONFLICTS' && !summary.conflictedTrips.some(c => c.trip.id === trip.id)) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const veh = getVehicleInfo(trip.vehicle_id);
    const driver = getDriverName(trip.driver_id).toLowerCase();
    const tripType = (trip.tripType || '').toLowerCase();
    const stopsLabels = (trip.stops || []).map(s => s.location?.label || s.taskTitle || '').join(' ').toLowerCase();

    return veh.code.toLowerCase().includes(q) ||
      veh.plate.toLowerCase().includes(q) ||
      driver.includes(q) ||
      tripType.includes(q) ||
      stopsLabels.includes(q);
  });

  return (
    <div className="space-y-5" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header & Date Controller */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>{isRtl ? 'لوحة تشغيل اليوم الميداني' : 'Daily Field Operations Hub'}</span>
              <span className="px-2 py-0.5 text-xs font-mono font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 rounded-full">
                {selectedDate === todayStr ? (isRtl ? 'تشغيل اليوم' : 'Today') : selectedDate}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isRtl ? 'الرؤية الميدانية الشاملة: حالة العربات، المشاوير المفتوحة، التنبيهات، والسائقين' : 'Field visibility: vehicle availability, open trips, alerts, and driver status'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none"
            />
            {selectedDate !== todayStr && (
              <button
                onClick={() => setSelectedDate(todayStr)}
                className="px-2 py-0.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 rounded-md hover:bg-indigo-100 transition-colors"
              >
                {isRtl ? 'اليوم' : 'Today'}
              </button>
            )}
          </div>

          <button
            onClick={onRefresh}
            title={isRtl ? 'تحديث البيانات' : 'Refresh'}
            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            onClick={onOpenEmergencyModal}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 rounded-xl transition-all shadow-sm"
          >
            <Siren className="h-4 w-4 text-rose-600" />
            <span>{isRtl ? 'مشوار طوارئ فوري' : 'Emergency Trip'}</span>
          </button>

          <button
            onClick={onOpenAddTrip}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm hover:shadow transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>{isRtl ? 'إنشاء مشوار جديد' : 'New Trip'}</span>
          </button>
        </div>
      </div>

      {/* 4 Clear Vehicle Status Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* 1. Available / Idle */}
        <div 
          onClick={onNavigateToVehicles}
          className="cursor-pointer group p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-emerald-900/40 hover:border-emerald-400 dark:hover:border-emerald-700 shadow-sm transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Truck className="h-5 w-5" />
            </div>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full">
              {isRtl ? 'جاهزة للإسناد' : 'Ready to Dispatch'}
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {summary.vehicles.available}
            </div>
            <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-0.5">
              {isRtl ? 'عربيات فاضية / جاهزة' : 'Available / Idle Vehicles'}
            </div>
          </div>
          {summary.vehicles.availableVehicles.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1">
              {summary.vehicles.availableVehicles.slice(0, 4).map(v => (
                <span key={v.id} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {v.code}
                </span>
              ))}
              {summary.vehicles.availableVehicles.length > 4 && (
                <span className="text-[10px] text-slate-400 self-center">
                  +{summary.vehicles.availableVehicles.length - 4}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 2. In Trip / Dispatched */}
        <div 
          onClick={onNavigateToLiveMap}
          className="cursor-pointer group p-4 rounded-2xl bg-white dark:bg-slate-900 border border-blue-200/80 dark:border-blue-900/40 hover:border-blue-400 dark:hover:border-blue-700 shadow-sm transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Navigation className="h-5 w-5 animate-pulse" />
            </div>
            <span className="flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-2 py-0.5 rounded-full">
              <Radio className="h-3 w-3" />
              <span>{isRtl ? 'في الطريق' : 'En Route'}</span>
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {summary.vehicles.inTrip}
            </div>
            <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-0.5">
              {isRtl ? 'في مشوار ميداني حالياً' : 'In-Trip / Dispatched'}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-blue-600 dark:text-blue-400 group-hover:underline">
            <span>{isRtl ? 'فتح الخريطة المباشرة' : 'Open Live Tracking'}</span>
            <ChevronRight className={`h-3.5 w-3.5 ${isRtl ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* 3. Breakdown */}
        <div 
          className={`p-4 rounded-2xl bg-white dark:bg-slate-900 border ${
            summary.vehicles.breakdown > 0 
              ? 'border-rose-300 dark:border-rose-800 bg-rose-50/20' 
              : 'border-slate-200/80 dark:border-slate-800/80'
          } shadow-sm transition-all`}
        >
          <div className="flex items-center justify-between">
            <div className={`p-2.5 rounded-xl ${summary.vehicles.breakdown > 0 ? 'bg-rose-100 dark:bg-rose-950 text-rose-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            {summary.vehicles.breakdown > 0 && (
              <span className="text-[11px] font-bold text-rose-600 bg-rose-100 dark:bg-rose-950 px-2 py-0.5 rounded-full animate-bounce">
                {isRtl ? 'يتطلب تغطية فورية' : 'Action Needed'}
              </span>
            )}
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {summary.vehicles.breakdown}
            </div>
            <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-0.5">
              {isRtl ? 'عربيات عاطلة / عطل مفاجئ' : 'Breakdown Vehicles'}
            </div>
          </div>
          {summary.vehicles.breakdownVehicles.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => onOpenBreakdownModal(summary.vehicles.breakdownVehicles[0])}
                className="w-full text-center py-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100/80 dark:bg-rose-950/80 rounded-lg hover:bg-rose-200 transition-colors"
              >
                {isRtl ? 'إعادة توزيع مهام العطل' : 'Reassign Breakdown Tasks'}
              </button>
            </div>
          )}
        </div>

        {/* 4. Maintenance / Out of Service */}
        <div 
          onClick={onNavigateToVehicles}
          className="cursor-pointer group p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-900/40 hover:border-amber-400 shadow-sm transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <Wrench className="h-5 w-5" />
            </div>
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-full">
              {isRtl ? 'صيانة دورية' : 'Maintenance'}
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {summary.vehicles.outOfService}
            </div>
            <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-0.5">
              {isRtl ? 'صيانة / خارج الخدمة' : 'Out of Service / Maintenance'}
            </div>
          </div>
          {summary.vehicles.outOfServiceVehicles.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1">
              {summary.vehicles.outOfServiceVehicles.slice(0, 3).map(v => (
                <span key={v.id} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700">
                  {v.code}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active Conflict Alerts Banner for Today */}
      {summary.conflictedTrips.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-900/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <span>{isRtl ? `يوجد ${summary.conflictedTrips.length} مشوار به تعارض تشغيلي مرصود لليوم` : `${summary.conflictedTrips.length} trips have operational conflicts today`}</span>
            </div>
            <span className="text-[11px] text-amber-700 dark:text-amber-400">
              {isRtl ? 'القرار للمشرف: التجاوز اليدوي متاح دائماً' : 'Supervisor manual override is supported'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {summary.conflictedTrips.map(({ trip, conflicts }, idx) => {
              const veh = getVehicleInfo(trip.vehicle_id);
              const driver = getDriverName(trip.driver_id);
              return (
                <div key={idx} className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-900/50 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {veh.code} ({veh.plate}) - {driver}
                    </span>
                    {trip.conflictOverride ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                        {isRtl ? 'تم التجاوز بقرار المشرف' : 'Overridden by Supervisor'}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                        {isRtl ? 'تعارض قيد المراجعة' : 'Pending Review'}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                    {conflicts[0]?.messageAr}
                  </p>
                  {trip.conflictOverride?.reason && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-lg">
                      <strong>{isRtl ? 'تبرير المشرف:' : 'Override reason:'}</strong> {trip.conflictOverride.reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Grid: Open Trips + Delayed & Unregistered Drivers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: Open Trips Today */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {isRtl ? 'المشاوير والمهام المفتوحة اليوم' : 'Open Trips & Tasks Today'}
              </h3>
              <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {filteredOpenTrips.length}
              </span>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {isRtl ? 'الكل' : 'All'}
              </button>

              <button
                onClick={() => setStatusFilter('ACTIVE_TRIPS')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  statusFilter === 'ACTIVE_TRIPS'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {isRtl ? 'في الطريق' : 'En Route'}
              </button>

              <button
                onClick={() => setStatusFilter('DELAYED')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  statusFilter === 'DELAYED'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {isRtl ? 'لم تبدأ / متأخرة' : 'Not Started'}
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute right-3 rtl:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isRtl ? 'بحث في مشاوير اليوم بالسائق، المركبة، الوجهة...' : 'Search today trips...'}
              className="w-full pl-9 pr-9 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none"
            />
          </div>

          {/* Trips Cards List */}
          {filteredOpenTrips.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
              <Navigation className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {isRtl ? 'لا توجد مشاوير مسجلة لهذا اليوم وفق التصفية المحددة' : 'No trips found for this date with selected filters'}
              </p>
              <button
                onClick={onOpenAddTrip}
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 rounded-xl hover:bg-indigo-100 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{isRtl ? 'إنشاء مشوار جديد' : 'Create Trip'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOpenTrips.map((trip) => {
                const veh = getVehicleInfo(trip.vehicle_id);
                const driver = getDriverName(trip.driver_id);
                const isDelayed = summary.delayedOrNotStartedTrips.some(d => d.id === trip.id);

                return (
                  <div
                    key={trip.id}
                    className={`p-4 rounded-2xl bg-white dark:bg-slate-900 border transition-all ${
                      isDelayed 
                        ? 'border-amber-300 dark:border-amber-900/70 shadow-sm' 
                        : 'border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl">
                          <Truck className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {veh.code} {veh.plate ? `(${veh.plate})` : ''}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              • {driver}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-slate-400" />
                              <span>{trip.scheduledAt?.split('T')[1]?.substring(0, 5) || trip.scheduledAt}</span>
                            </span>
                            <span>•</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{trip.tripType}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {trip.conflictOverride && (
                          <span 
                            title={trip.conflictOverride.reason}
                            className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                          >
                            {isRtl ? 'تجاوز المشرف' : 'Override'}
                          </span>
                        )}
                        {getStatusBadge(trip.status)}
                      </div>
                    </div>

                    {/* Stops summary */}
                    <div className="py-2.5 flex items-center gap-2 overflow-x-auto text-xs text-slate-600 dark:text-slate-400">
                      <span className="font-bold text-slate-700 dark:text-slate-300 flex-shrink-0">
                        {isRtl ? 'خط السير:' : 'Route:'}
                      </span>
                      {(trip.stops || []).map((stop, sIdx) => (
                        <React.Fragment key={stop.id || sIdx}>
                          <span className="px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center gap-1 flex-shrink-0 text-[11px]">
                            <MapPin className="h-3 w-3 text-indigo-500" />
                            <span>{stop.taskTitle || stop.location?.label || (isRtl ? `المحطة ${sIdx + 1}` : `Stop ${sIdx + 1}`)}</span>
                          </span>
                          {sIdx < (trip.stops?.length || 0) - 1 && (
                            <span className="text-slate-300 dark:text-slate-600 font-bold flex-shrink-0">→</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>

                    {/* Footer buttons */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-400">
                        {trip.notes && <span>ملاحظات: {trip.notes}</span>}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {onOpenStopsManager && (
                          <button
                            onClick={() => onOpenStopsManager(trip)}
                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 dark:border-blue-800"
                            title={isRtl ? 'إدارة وتعديل محطات ومهام المشوار' : 'Manage route stops & tasks'}
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            <span>{isRtl ? 'المحطات والمهام' : 'Stops & Tasks'}</span>
                          </button>
                        )}

                        <button
                          onClick={() => onOpenChatModal(trip)}
                          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span>{isRtl ? 'المحادثة' : 'Chat'}</span>
                        </button>

                        {(trip.status === 'DRAFT' || trip.status === 'APPROVED') && onDispatchTrip && (
                          <button
                            onClick={() => onDispatchTrip(trip.id)}
                            className="flex items-center gap-1 px-3 py-1 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                          >
                            <Play className="h-3 w-3" />
                            <span>{isRtl ? 'بدء المشوار' : 'Dispatch'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 1 Col: Operational Alerts, Delayed Trips & Unregistered Drivers */}
        <div className="space-y-4">
          {/* Delayed / Not Started Trips Box */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
            <div className="p-3.5 bg-gradient-to-r from-amber-500/10 to-transparent border-b border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {isRtl ? 'مشاوير متأخرة أو لم تبدأ بعد' : 'Delayed / Not Started Trips'}
                </h3>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {summary.delayedOrNotStartedTrips.length}
              </span>
            </div>

            <div className="p-3 space-y-2.5">
              {summary.delayedOrNotStartedTrips.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
                  <span>{isRtl ? 'جميع المشاوير في موعدها' : 'All trips are on schedule'}</span>
                </div>
              ) : (
                summary.delayedOrNotStartedTrips.map((trip) => {
                  const veh = getVehicleInfo(trip.vehicle_id);
                  const driver = getDriverName(trip.driver_id);
                  return (
                    <div key={trip.id} className="p-2.5 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/60 dark:border-amber-900/40 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{veh.code} ({veh.plate})</span>
                        <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400">{trip.scheduledAt?.split('T')[1]?.substring(0, 5) || trip.scheduledAt}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
                        <span>{driver}</span>
                        <span className="text-slate-500">{trip.stops?.[1]?.taskTitle || trip.stops?.[1]?.location?.label || trip.tripType}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Unregistered / Not Checked-in Drivers Box */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
            <div className="p-3.5 bg-gradient-to-r from-slate-500/10 to-transparent border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {isRtl ? 'سائقون لم يسجلوا بدء الرحلة' : 'Drivers Not Started'}
                </h3>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {summary.unregisteredDrivers.length}
              </span>
            </div>

            <div className="p-3 space-y-2">
              {summary.unregisteredDrivers.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
                  <span>{isRtl ? 'جميع السائقين سجلوا وبدأوا رحلاتهم' : 'All drivers have checked in'}</span>
                </div>
              ) : (
                summary.unregisteredDrivers.map((d, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">{d.driverName}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                        <span>{d.vehicleCode}</span>
                        <span>•</span>
                        <span>{d.taskTitle}</span>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800">
                      {d.scheduledAt?.split('T')[1]?.substring(0, 5) || d.scheduledAt}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyOperationsDashboard;
