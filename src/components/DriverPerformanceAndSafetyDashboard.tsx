import React, { useState, useMemo } from 'react';
import { 
  Award, Shield, Star, CheckCircle2, AlertTriangle, AlertOctagon, 
  ClipboardCheck, UserCheck, Search, Filter, RefreshCw, Eye, ThumbsUp, 
  Gauge, Truck, Calendar, Clock, ChevronRight, Check, X, ShieldAlert, Sparkles
} from 'lucide-react';
import { FleetBusinessEngine } from '../lib/enterprise/fleet_engine';
import { StorageEngine } from '../db/storage';
import { 
  DriverScorecard, 
  DriverPerformanceTier, 
  VehicleInspectionRecord, 
  Vehicle 
} from '../types/fleet';

interface DriverPerformanceAndSafetyDashboardProps {
  companyId: string;
  isRtl?: boolean;
  onRefresh?: () => void;
  onOpenPerformInspection?: (vehicle: Vehicle, driverId: string, driverName: string) => void;
}

export default function DriverPerformanceAndSafetyDashboard({
  companyId,
  isRtl = true,
  onRefresh,
  onOpenPerformInspection
}: DriverPerformanceAndSafetyDashboardProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<'ALL' | DriverPerformanceTier>('ALL');
  const [selectedInspection, setSelectedInspection] = useState<VehicleInspectionRecord | null>(null);
  const [reviewModalRecord, setReviewModalRecord] = useState<VehicleInspectionRecord | null>(null);
  const [supervisorNotes, setSupervisorNotes] = useState('');
  const [restoreVehicleActive, setRestoreVehicleActive] = useState(true);
  const [isReviewing, setIsReviewing] = useState(false);

  // Compute analytics
  const summary = useMemo(() => {
    return FleetBusinessEngine.getFleetDriverPerformanceSummary(companyId);
  }, [companyId]);

  const allInspections = useMemo(() => {
    return StorageEngine.getStored<VehicleInspectionRecord[]>('fleet_inspections_records', [])
      .filter(i => i.company_id === companyId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [companyId]);

  const allVehicles = useMemo(() => {
    return StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', [])
      .filter(v => v.company_id === companyId);
  }, [companyId]);

  // Filtered Driver Scorecards
  const filteredScorecards = useMemo(() => {
    return summary.driverScorecards.filter(d => {
      const matchesSearch = d.driverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.driverId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTier = tierFilter === 'ALL' || d.tierRating === tierFilter;
      return matchesSearch && matchesTier;
    });
  }, [summary, searchTerm, tierFilter]);

  const pendingInspections = useMemo(() => {
    return allInspections.filter(i => i.supervisorReviewStatus === 'PENDING_REVIEW');
  }, [allInspections]);

  const handleReviewSubmit = async (decision: 'APPROVED' | 'OVERRIDDEN') => {
    if (!reviewModalRecord) return;
    try {
      setIsReviewing(true);
      await FleetBusinessEngine.reviewVehicleInspection(
        companyId,
        reviewModalRecord.id,
        'Supervisor',
        decision,
        supervisorNotes,
        restoreVehicleActive
      );
      setReviewModalRecord(null);
      setSupervisorNotes('');
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsReviewing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top High-Contrast KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Fleet Safety Score */}
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">{isRtl ? 'مؤشر أداء وسلامة الأسطول' : 'Fleet Safety Score'}</span>
            <div className="p-2 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Shield className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{summary.averageSafetyScore}%</span>
            <span className={`text-[11px] font-bold ${
              summary.averageSafetyScore >= 85 ? 'text-emerald-600' : 'text-amber-600'
            }`}>
              {summary.averageSafetyScore >= 85 ? (isRtl ? 'ممتاز' : 'Excellent') : (isRtl ? 'متوسط' : 'Moderate')}
            </span>
          </div>
        </div>

        {/* Stop Completion Rate */}
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">{isRtl ? 'معدل إنجاز المهام والمحطات' : 'Task Completion Rate'}</span>
            <div className="p-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{summary.overallCompletionRate}%</span>
            <span className="text-[11px] font-mono text-slate-400">{isRtl ? 'إجمالي المحطات' : 'All Stops'}</span>
          </div>
        </div>

        {/* Total Inspections */}
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">{isRtl ? 'الفحوصات الرقمية المنجزة' : 'Conducted Inspections'}</span>
            <div className="p-2 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <ClipboardCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{summary.totalInspectionsConducted}</span>
            <span className="text-[11px] font-bold text-blue-600">{isRtl ? 'فحص رقمي' : 'Inspections'}</span>
          </div>
        </div>

        {/* Pending Supervisor Review */}
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">{isRtl ? 'فحوصات بانتظار الاعتماد' : 'Pending Reviews'}</span>
            <div className="p-2 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{pendingInspections.length}</span>
            {pendingInspections.length > 0 ? (
              <span className="text-[11px] font-bold text-amber-600 animate-pulse">{isRtl ? 'تتطلب مراجعة' : 'Action Required'}</span>
            ) : (
              <span className="text-[11px] font-bold text-emerald-600">{isRtl ? 'مكتمل' : 'All Clear'}</span>
            )}
          </div>
        </div>

        {/* Critical Defects Prevented */}
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">{isRtl ? 'أعطال حرجة تم إيقافها' : 'Critical Defects Grounded'}</span>
            <div className="p-2 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-600">{summary.criticalDefectIncidents}</span>
            <span className="text-[11px] font-bold text-rose-500">{isRtl ? 'تدخل وقائي' : 'Prevented'}</span>
          </div>
        </div>
      </div>

      {/* Pending Supervisor Review Inbox (If Any) */}
      {pendingInspections.length > 0 && (
        <div className="bg-amber-500/10 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800 rounded-3xl p-5 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs font-black">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{isRtl ? `صندوق مراجعة الفحوصات والملاحظات الحرجة (${pendingInspections.length})` : `Pending Defect Inspections Inbox (${pendingInspections.length})`}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingInspections.map((insp) => (
              <div 
                key={insp.id}
                className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/80 rounded-2xl p-3.5 space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                    {insp.plate_number || insp.vehicle_code}
                  </span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-lg ${
                    insp.status === 'FAILED_CRITICAL' 
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' 
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                  }`}>
                    {insp.status === 'FAILED_CRITICAL' 
                      ? (isRtl ? 'عطل حرج - موقوفة' : 'Critical - Grounded') 
                      : (isRtl ? 'ملاحظات صيانة' : 'Minor Defects')}
                  </span>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                  <p className="flex items-center gap-1 text-[11px]">
                    <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                    <span>{insp.driver_name || insp.driverSignatureName}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {new Date(insp.createdAt).toLocaleString(isRtl ? 'ar-EG' : 'en-US')}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedInspection(insp)}
                    className="text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>{isRtl ? 'عرض التفاصيل' : 'Details'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReviewModalRecord(insp);
                      setSupervisorNotes('');
                    }}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                  >
                    {isRtl ? 'مراجعة واعتماد' : 'Review & Sign-off'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Section: Driver Leaderboard & Scorecards */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        {/* Controls Ribbon */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
              {isRtl ? 'لوحة تقييم وبطاقات أداء السائقين' : 'Driver Performance Leaderboard & Scorecards'}
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300">
              {filteredScorecards.length} {isRtl ? 'سائق' : 'Drivers'}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-60">
              <Search className="h-4 w-4 absolute right-3 rtl:right-3 rtl:left-auto ltr:left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder={isRtl ? 'بحث باسم السائق...' : 'Search driver...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-9 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100"
              />
            </div>

            {/* Tier Filter */}
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as any)}
              className="py-1.5 px-3 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200"
            >
              <option value="ALL">{isRtl ? 'جميع المستويات' : 'All Tiers'}</option>
              <option value="EXCELLENT">{isRtl ? '⭐⭐⭐⭐⭐ ممتاز' : '⭐⭐⭐⭐⭐ Excellent'}</option>
              <option value="VERY_GOOD">{isRtl ? '⭐⭐⭐⭐ جيد جداً' : '⭐⭐⭐⭐ Very Good'}</option>
              <option value="GOOD">{isRtl ? '⭐⭐⭐ جيد' : '⭐⭐⭐ Good'}</option>
              <option value="NEEDS_IMPROVEMENT">{isRtl ? '⚠️ يحتاج متابعة' : '⚠️ Needs Improvement'}</option>
            </select>
          </div>
        </div>

        {/* Scorecards Grid / List */}
        {filteredScorecards.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <UserCheck className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-700" />
            <p className="text-xs font-bold">{isRtl ? 'لا يوجد سائقين مطابقين لخيارات البحث' : 'No drivers matching criteria'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredScorecards.map((driver, index) => {
              const scoreColor = driver.safetyScore >= 90 
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                : driver.safetyScore >= 80 
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'
                : driver.safetyScore >= 65 
                ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
                : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800';

              return (
                <div 
                  key={driver.driverId}
                  className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all"
                >
                  {/* Left: Driver Rank, Avatar & Name */}
                  <div className="flex items-center gap-3.5 min-w-[240px]">
                    <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-black text-slate-600 dark:text-slate-300">
                      #{index + 1}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {driver.driverName}
                        </span>
                        {/* Stars */}
                        <div className="flex items-center text-amber-400">
                          {Array.from({ length: driver.ratingStars }).map((_, i) => (
                            <Star key={i} className="h-3.5 w-3.5 fill-amber-400" />
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span>{driver.totalTrips} {isRtl ? 'رحلة' : 'trips'}</span>
                        <span>•</span>
                        <span>{driver.totalDistanceDrivenKm.toLocaleString()} {isRtl ? 'كم مسافة' : 'KM'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Metrics Chips */}
                  <div className="grid grid-cols-3 gap-2 w-full md:w-auto flex-1 max-w-md">
                    {/* Task Completion Rate */}
                    <div className="p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 text-center">
                      <span className="block text-[10px] text-slate-500 font-bold">{isRtl ? 'إنجاز المحطات' : 'Stops Done'}</span>
                      <span className="text-xs font-black text-slate-800 dark:text-slate-200">{driver.stopCompletionRate}%</span>
                    </div>

                    {/* Inspections Done */}
                    <div className="p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 text-center">
                      <span className="block text-[10px] text-slate-500 font-bold">{isRtl ? 'فحوصات السلامة' : 'Inspections'}</span>
                      <span className="text-xs font-black text-slate-800 dark:text-slate-200">{driver.inspectionsCompleted}</span>
                    </div>

                    {/* Defect Incidents */}
                    <div className="p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 text-center">
                      <span className="block text-[10px] text-slate-500 font-bold">{isRtl ? 'أعطال مرصودة' : 'Defects Found'}</span>
                      <span className={`text-xs font-black ${
                        driver.criticalDefectsReported > 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'
                      }`}>
                        {driver.criticalDefectsReported}
                      </span>
                    </div>
                  </div>

                  {/* Right: Score Pill & Quick Inspection Trigger */}
                  <div className="flex items-center justify-between w-full md:w-auto gap-3">
                    <div className={`px-4 py-2 rounded-2xl border text-center font-black ${scoreColor}`}>
                      <span className="block text-[10px] uppercase font-bold opacity-80">{isRtl ? 'درجة الأداء' : 'Score'}</span>
                      <span className="text-base font-black">{driver.safetyScore}/100</span>
                    </div>

                    {/* Action to view inspection history of this driver */}
                    <button
                      type="button"
                      onClick={() => {
                        const driverFirstInspection = allInspections.find(i => i.driver_id === driver.driverId);
                        if (driverFirstInspection) {
                          setSelectedInspection(driverFirstInspection);
                        }
                      }}
                      className="p-2.5 rounded-2xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                      title={isRtl ? 'عرض سجل الفحوصات' : 'View Inspection Records'}
                    >
                      <ClipboardCheck className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Inspection Details Modal */}
      {selectedInspection && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden my-auto">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClipboardCheck className="h-6 w-6 text-indigo-400" />
                <div>
                  <h3 className="text-base font-black">
                    {isRtl ? 'تقرير فحص السلامة الميداني' : 'Vehicle Inspection Details'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {selectedInspection.plate_number || selectedInspection.vehicle_code} • {selectedInspection.driver_name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInspection(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Header Info */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <span className="block text-slate-400 font-bold">{isRtl ? 'نوع الفحص' : 'Type'}</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">
                    {selectedInspection.type === 'PRE_TRIP' 
                      ? (isRtl ? 'قبل الرحلة' : 'Pre-Trip') 
                      : (isRtl ? 'بعد الرحلة' : 'Post-Trip')}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <span className="block text-slate-400 font-bold">{isRtl ? 'العداد' : 'Odometer'}</span>
                  <span className="font-extrabold font-mono text-slate-800 dark:text-slate-200">
                    {selectedInspection.odometerReading?.toLocaleString()} {isRtl ? 'كم' : 'KM'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <span className="block text-slate-400 font-bold">{isRtl ? 'الحالة' : 'Status'}</span>
                  <span className={`font-black ${
                    selectedInspection.status === 'PASSED' 
                      ? 'text-emerald-600' 
                      : selectedInspection.status === 'FAILED_CRITICAL' 
                      ? 'text-rose-600' 
                      : 'text-amber-600'
                  }`}>
                    {selectedInspection.status === 'PASSED' 
                      ? (isRtl ? 'معتمد وسليم' : 'Passed') 
                      : selectedInspection.status === 'FAILED_CRITICAL' 
                      ? (isRtl ? 'عطل حرج' : 'Critical Failed') 
                      : (isRtl ? 'ملاحظات' : 'Passed w/ Defects')}
                  </span>
                </div>
              </div>

              {/* Checklist items breakdown */}
              <div className="space-y-2">
                <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                  {isRtl ? 'بنود المعاينة' : 'Inspection Items'}
                </h4>
                <div className="space-y-1.5">
                  {(selectedInspection.items || []).map((item) => (
                    <div 
                      key={item.key} 
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                        item.status === 'DEFECT_CRITICAL' 
                          ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 text-rose-800 dark:text-rose-300' 
                          : item.status === 'DEFECT_MINOR' 
                          ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 text-amber-800 dark:text-amber-300' 
                          : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="font-bold">{isRtl ? item.labelAr : item.labelEn}</span>
                      <div className="flex items-center gap-2">
                        {item.notes && (
                          <span className="text-[11px] text-slate-500 italic max-w-[180px] truncate">
                            "{item.notes}"
                          </span>
                        )}
                        <span className="font-extrabold text-[11px]">
                          {item.status === 'PASS' ? '✅ سليم' : item.status === 'DEFECT_CRITICAL' ? '⛔ عطل حرج' : '⚠️ ملاحظة'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Driver signature acknowledgement */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
                <span className="text-slate-400 block font-bold">{isRtl ? 'إقرار وتوقيع السائق' : 'Driver Signature'}</span>
                <span className="font-extrabold text-slate-800 dark:text-slate-200">{selectedInspection.driverSignatureName}</span>
                {selectedInspection.driverNotes && (
                  <p className="mt-1 text-slate-600 dark:text-slate-400 italic">"{selectedInspection.driverNotes}"</p>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedInspection(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white"
              >
                {isRtl ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supervisor Review Sign-Off Modal */}
      {reviewModalRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden my-auto">
            <div className="bg-amber-600 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-6 w-6" />
                <div>
                  <h3 className="text-base font-black">
                    {isRtl ? 'اعتماد ومراجعة فحص المركبة' : 'Supervisor Inspection Sign-Off'}
                  </h3>
                  <p className="text-xs text-amber-100">
                    {reviewModalRecord.plate_number || reviewModalRecord.vehicle_code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewModalRecord(null)}
                className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isRtl ? 'ملاحظات المشرف وتوجيهات الإصلاح' : 'Supervisor Notes & Directions'}
                </label>
                <textarea
                  value={supervisorNotes}
                  onChange={(e) => setSupervisorNotes(e.target.value)}
                  placeholder={isRtl ? 'تم فحص المركبة بالورشة / تم معالجة ملاحظات الفرامل...' : 'Inspection verified / repair authorized...'}
                  rows={3}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Restore vehicle toggle */}
              <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                <input
                  type="checkbox"
                  id="restoreActive"
                  checked={restoreVehicleActive}
                  onChange={(e) => setRestoreVehicleActive(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="restoreActive" className="text-xs font-bold text-emerald-800 dark:text-emerald-300 cursor-pointer">
                  {isRtl ? 'إعادة تنشيط المركبة وجعلها متاحة للرحلات (ACTIVE)' : 'Restore vehicle status to ACTIVE'}
                </label>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setReviewModalRecord(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                type="button"
                disabled={isReviewing}
                onClick={() => handleReviewSubmit('APPROVED')}
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-all flex items-center gap-1.5"
              >
                <Check className="h-4 w-4" />
                <span>{isRtl ? 'اعتماد التقرير وتأكيد السلامة' : 'Approve & Confirm Safety'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
