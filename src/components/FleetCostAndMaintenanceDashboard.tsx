import React, { useState, useMemo } from 'react';
import { 
  Wrench, Fuel, Gauge, DollarSign, AlertTriangle, AlertCircle, CheckCircle2,
  TrendingDown, TrendingUp, Search, Filter, Plus, ArrowUpDown, ChevronRight,
  ShieldAlert, Settings, RefreshCw, Car
} from 'lucide-react';
import { FleetBusinessEngine } from '../lib/enterprise/fleet_engine';
import { 
  Vehicle, 
  FleetCostSummary, 
  MaintenanceHealthAlert, 
  VehicleCostBreakdown,
  MaintenanceUrgency 
} from '../types/fleet';

interface FleetCostAndMaintenanceDashboardProps {
  companyId: string;
  isRtl?: boolean;
  onOpenLogMaintenance: (vehicle: Vehicle, defaultType?: 'ROUTINE' | 'OIL_CHANGE' | 'TIRES') => void;
  onOpenLogFuel: (vehicle: Vehicle) => void;
  onRefresh: () => void;
}

export default function FleetCostAndMaintenanceDashboard({
  companyId,
  isRtl = true,
  onOpenLogMaintenance,
  onOpenLogFuel,
  onRefresh
}: FleetCostAndMaintenanceDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<'ALL' | 'ALERTS_ONLY' | 'OVERDUE' | 'DUE_SOON'>('ALL');
  const [sortBy, setSortBy] = useState<'cost' | 'distance' | 'costPerKm' | 'efficiency'>('cost');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Load analytics & alerts
  const costSummary: FleetCostSummary = useMemo(() => {
    return FleetBusinessEngine.calculateFleetCostAnalytics(companyId);
  }, [companyId]);

  const maintenanceAlerts: MaintenanceHealthAlert[] = useMemo(() => {
    return FleetBusinessEngine.evaluateVehicleMaintenanceAlerts(companyId);
  }, [companyId]);

  // Filter and sort vehicle breakdowns
  const filteredVehicles = useMemo(() => {
    return costSummary.vehicles.filter(v => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        v.plateNumber.toLowerCase().includes(q) || 
        v.vehicleCode.toLowerCase().includes(q) || 
        v.makeModel.toLowerCase().includes(q);

      let matchUrgency = true;
      if (urgencyFilter === 'ALERTS_ONLY') {
        matchUrgency = v.highestMaintenanceUrgency === 'OVERDUE' || v.highestMaintenanceUrgency === 'DUE_SOON';
      } else if (urgencyFilter === 'OVERDUE') {
        matchUrgency = v.highestMaintenanceUrgency === 'OVERDUE';
      } else if (urgencyFilter === 'DUE_SOON') {
        matchUrgency = v.highestMaintenanceUrgency === 'DUE_SOON';
      }

      return matchSearch && matchUrgency;
    }).sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortBy === 'cost') {
        valA = a.totalOperatingCost;
        valB = b.totalOperatingCost;
      } else if (sortBy === 'distance') {
        valA = a.totalDistanceTraveledKm;
        valB = b.totalDistanceTraveledKm;
      } else if (sortBy === 'costPerKm') {
        valA = a.costPerKm;
        valB = b.costPerKm;
      } else if (sortBy === 'efficiency') {
        valA = a.fuelEfficiencyKmPerLiter;
        valB = b.fuelEfficiencyKmPerLiter;
      }
      return sortDirection === 'desc' ? valB - valA : valA - valB;
    });
  }, [costSummary.vehicles, searchQuery, urgencyFilter, sortBy, sortDirection]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Header & Refresh */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span>{isRtl ? 'تحليلات تكاليف التشغيل وصحة صيانة الأسطول' : 'Operating Costs & Maintenance Health'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isRtl ? 'متابعة شاملة لتكاليف الوقود، الصيانة الدورية، كفاءة الاستهلاك وتنبيهات الكيلومترات المستحقة' : 'Comprehensive tracking of fuel costs, maintenance schedules, efficiency, and mileage service alerts'}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{isRtl ? 'تحديث البيانات' : 'Refresh'}</span>
        </button>
      </div>

      {/* KPI Cards Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Operating Cost */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>{isRtl ? 'إجمالي تكاليف التشغيل' : 'Total Operating Cost'}</span>
            <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {costSummary.totalOperatingCost.toLocaleString()} <span className="text-xs font-bold text-slate-500">EGP</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span>{isRtl ? 'وقود:' : 'Fuel:'} <strong className="text-amber-600 dark:text-amber-400">{costSummary.totalFuelCost.toLocaleString()}</strong></span>
            <span>•</span>
            <span>{isRtl ? 'صيانة:' : 'Maint:'} <strong className="text-indigo-600 dark:text-indigo-400">{costSummary.totalMaintenanceCost.toLocaleString()}</strong></span>
          </div>
        </div>

        {/* Cost Per KM */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>{isRtl ? 'تكلفة الكيلومتر الواحد' : 'Cost Per Kilometer (CPK)'}</span>
            <Gauge className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {costSummary.averageCostPerKm.toFixed(2)} <span className="text-xs font-bold text-slate-500">EGP/KM</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span>{isRtl ? 'إجمالي المسافات:' : 'Total Distance:'} <strong>{costSummary.totalDistanceKm.toLocaleString()} KM</strong></span>
          </div>
        </div>

        {/* Fuel Economy / Efficiency */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>{isRtl ? 'كفاءة استهلاك الوقود' : 'Fleet Fuel Economy'}</span>
            <Fuel className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {costSummary.averageFuelEfficiencyKmPerLiter.toFixed(1)} <span className="text-xs font-bold text-slate-500">KM / L</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span>{isRtl ? 'إجمالي الوقود:' : 'Total Fuel:'} <strong>{costSummary.totalLitersConsumed.toLocaleString()} L</strong></span>
          </div>
        </div>

        {/* Maintenance Health Alerts */}
        <div className={`p-4 rounded-2xl border shadow-sm space-y-1 ${
          costSummary.overdueAlertsCount > 0 
            ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800' 
            : costSummary.dueSoonAlertsCount > 0
            ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>{isRtl ? 'تنبيهات الصيانة المستحقة' : 'Maintenance Alerts'}</span>
            <Wrench className={`h-4 w-4 ${costSummary.overdueAlertsCount > 0 ? 'text-rose-600 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black font-mono ${
              costSummary.overdueAlertsCount > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-white'
            }`}>
              {costSummary.activeAlertsCount}
            </span>
            <span className="text-xs font-bold text-slate-500">{isRtl ? 'تنبيه نشط' : 'active alerts'}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] pt-1 border-t border-slate-200/60 dark:border-slate-800">
            <span className="text-rose-600 dark:text-rose-400 font-bold">{costSummary.overdueAlertsCount} {isRtl ? 'متأخرة' : 'overdue'}</span>
            <span>•</span>
            <span className="text-amber-600 dark:text-amber-400 font-bold">{costSummary.dueSoonAlertsCount} {isRtl ? 'مستحقة قريباً' : 'due soon'}</span>
          </div>
        </div>
      </div>

      {/* Proactive Maintenance Health Widget (If any alerts exist) */}
      {maintenanceAlerts.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                {isRtl ? 'تنبيهات جدول الصيانة وتغيير الزيوت الدورية (مباشر من العداد)' : 'Service Schedule & Oil Change Alerts'}
              </h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 font-mono">
              {maintenanceAlerts.length} {isRtl ? 'مركبة تحتاج لإجراء' : 'vehicles'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {maintenanceAlerts.map((alert, idx) => {
              const isOverdue = alert.urgency === 'OVERDUE';
              return (
                <div
                  key={`${alert.vehicleId}-${alert.serviceType}-${idx}`}
                  className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-2.5 transition-all ${
                    isOverdue 
                      ? 'bg-rose-50/50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800' 
                      : 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-black px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800">
                          {alert.plateNumber}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          ({alert.vehicleCode})
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        isOverdue 
                          ? 'bg-rose-600 text-white' 
                          : 'bg-amber-500 text-white'
                      }`}>
                        {isOverdue ? (isRtl ? 'متأخرة' : 'OVERDUE') : (isRtl ? 'مستحقة قريباً' : 'DUE SOON')}
                      </span>
                    </div>

                    <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5 pt-1">
                      <Wrench className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                      <span>{isRtl ? alert.serviceTypeAr : alert.serviceTypeEn}</span>
                    </div>

                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {isRtl ? alert.messageAr : alert.messageEn}
                    </p>
                  </div>

                  {/* 1-Click Quick Action to Log Service */}
                  <button
                    type="button"
                    onClick={() => {
                      const dummyVeh: Vehicle = {
                        id: alert.vehicleId,
                        company_id: companyId,
                        code: alert.vehicleCode,
                        plateNumber: alert.plateNumber,
                        make: '',
                        model: '',
                        year: 2024,
                        type: 'TRUCK',
                        status: 'ACTIVE',
                        odometerReading: alert.currentOdometer,
                        fuelCapacity: 80,
                        createdAt: ''
                      };
                      onOpenLogMaintenance(dummyVeh, alert.serviceType);
                    }}
                    className={`w-full py-1.5 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all text-white ${
                      isOverdue 
                        ? 'bg-rose-600 hover:bg-rose-700' 
                        : 'bg-amber-600 hover:bg-amber-700'
                    }`}
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    <span>{isRtl ? 'تسجيل هذه الصيانة الآن' : 'Log Maintenance Now'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vehicle Cost & Efficiency Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        {/* Table Controls */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
            <div className="relative w-full">
              <Search className="h-4 w-4 absolute right-3 rtl:right-3 rtl:left-auto ltr:left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isRtl ? 'بحث برقم اللوحة، كود المركبة، الموديل...' : 'Search plate, code, model...'}
                className="w-full pl-9 pr-9 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter by Urgency */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setUrgencyFilter('ALL')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  urgencyFilter === 'ALL' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                }`}
              >
                {isRtl ? 'الكل' : 'All'}
              </button>
              <button
                type="button"
                onClick={() => setUrgencyFilter('ALERTS_ONLY')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  urgencyFilter === 'ALERTS_ONLY' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                }`}
              >
                {isRtl ? 'تنبيهات فقط' : 'Alerts Only'}
              </button>
            </div>

            {/* Sort Options */}
            <select
              value={`${sortBy}-${sortDirection}`}
              onChange={(e) => {
                const [sb, sd] = e.target.value.split('-') as [any, any];
                setSortBy(sb);
                setSortDirection(sd);
              }}
              className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
            >
              <option value="cost-desc">{isRtl ? 'الأعلى تكلفة تشغيل' : 'Highest Cost'}</option>
              <option value="cost-asc">{isRtl ? 'الأقل تكلفة تشغيل' : 'Lowest Cost'}</option>
              <option value="distance-desc">{isRtl ? 'الأعلى مسافة (كم)' : 'Highest Distance'}</option>
              <option value="costPerKm-desc">{isRtl ? 'الأعلى تكلفة للكيلومتر' : 'Highest CPK'}</option>
              <option value="efficiency-desc">{isRtl ? 'الأفضل كفاءة وقود (كم/لتر)' : 'Best Fuel Economy'}</option>
            </select>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left rtl:text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold text-[11px] uppercase tracking-wider">
                <th className="py-3 px-3">{isRtl ? 'المركبة' : 'Vehicle'}</th>
                <th className="py-3 px-3">{isRtl ? 'العداد الحالي (كم)' : 'Odometer (KM)'}</th>
                <th className="py-3 px-3">{isRtl ? 'تكلفة الوقود' : 'Fuel Cost'}</th>
                <th className="py-3 px-3">{isRtl ? 'تكلفة الصيانة' : 'Maint Cost'}</th>
                <th className="py-3 px-3">{isRtl ? 'إجمالي التشغيل' : 'Total Op Cost'}</th>
                <th className="py-3 px-3">{isRtl ? 'التكلفة / كم' : 'Cost / KM'}</th>
                <th className="py-3 px-3">{isRtl ? 'كفاءة الوقود' : 'Fuel Econ'}</th>
                <th className="py-3 px-3">{isRtl ? 'حالة الصيانة' : 'Service Status'}</th>
                <th className="py-3 px-3 text-center">{isRtl ? 'إجراءات سريعة' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-semibold">
                    {isRtl ? 'لا توجد مركبات مطابقة لمعايير البحث' : 'No vehicles found'}
                  </td>
                </tr>
              ) : (
                filteredVehicles.map(v => {
                  const dummyVeh: Vehicle = {
                    id: v.vehicleId,
                    company_id: companyId,
                    code: v.vehicleCode,
                    plateNumber: v.plateNumber,
                    make: v.makeModel.split(' ')[0] || '',
                    model: v.makeModel.split(' ').slice(1).join(' ') || '',
                    year: 2024,
                    type: 'TRUCK',
                    status: 'ACTIVE',
                    odometerReading: v.totalDistanceTraveledKm,
                    fuelCapacity: 80,
                    createdAt: ''
                  };

                  return (
                    <tr key={v.vehicleId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span className="font-mono">{v.plateNumber}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {v.vehicleCode} • {v.makeModel}
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                        {v.totalDistanceTraveledKm.toLocaleString()} KM
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-amber-700 dark:text-amber-300">
                          {v.totalFuelCost.toLocaleString()} EGP
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {v.totalFuelLiters.toLocaleString()} L
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-300">
                        {v.totalMaintenanceCost.toLocaleString()} EGP
                      </td>

                      <td className="py-3 px-3 font-mono font-black text-emerald-700 dark:text-emerald-300">
                        {v.totalOperatingCost.toLocaleString()} EGP
                      </td>

                      <td className="py-3 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {v.costPerKm.toFixed(2)} EGP
                      </td>

                      <td className="py-3 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {v.fuelEfficiencyKmPerLiter > 0 ? `${v.fuelEfficiencyKmPerLiter.toFixed(1)} KM/L` : '—'}
                      </td>

                      <td className="py-3 px-3">
                        {v.highestMaintenanceUrgency === 'OVERDUE' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 flex items-center gap-1 w-fit">
                            <AlertCircle className="h-3 w-3" />
                            <span>{isRtl ? 'متأخرة' : 'Overdue'}</span>
                          </span>
                        ) : v.highestMaintenanceUrgency === 'DUE_SOON' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 flex items-center gap-1 w-fit">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{isRtl ? 'مستحقة' : 'Due Soon'}</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 flex items-center gap-1 w-fit">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>{isRtl ? 'سليمة' : 'Healthy'}</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenLogFuel(dummyVeh)}
                            title={isRtl ? 'تسجيل تموين وقود' : 'Log Fuel'}
                            className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:hover:bg-amber-900 dark:text-amber-300 transition-all"
                          >
                            <Fuel className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenLogMaintenance(dummyVeh)}
                            title={isRtl ? 'تسجيل صيانة وإصلاح' : 'Log Maintenance'}
                            className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 dark:text-indigo-300 transition-all"
                          >
                            <Wrench className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
