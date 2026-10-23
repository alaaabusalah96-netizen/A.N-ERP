import React, { useState } from 'react';
import { 
  X, CheckCircle2, AlertTriangle, AlertOctagon, ClipboardCheck, 
  ShieldAlert, User, Gauge, MessageSquare, Check, Sparkles, Loader2
} from 'lucide-react';
import { FleetBusinessEngine } from '../lib/enterprise/fleet_engine';
import { 
  Vehicle, 
  InspectionType, 
  InspectionChecklistItem, 
  VehicleInspectionRecord 
} from '../types/fleet';

interface VehicleInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle;
  driverId: string;
  driverName?: string;
  tripId?: string;
  companyId: string;
  isRtl?: boolean;
  onInspectionSubmitted: (record: VehicleInspectionRecord) => void;
}

export default function VehicleInspectionModal({
  isOpen,
  onClose,
  vehicle,
  driverId,
  driverName = '',
  tripId,
  companyId,
  isRtl = true,
  onInspectionSubmitted
}: VehicleInspectionModalProps) {
  if (!isOpen) return null;

  const [inspectionType, setInspectionType] = useState<InspectionType>('PRE_TRIP');
  const [odometer, setOdometer] = useState<number>(vehicle.odometerReading || 0);
  const [items, setItems] = useState<InspectionChecklistItem[]>(() => 
    FleetBusinessEngine.getDefaultInspectionChecklist()
  );
  const [driverNotes, setDriverNotes] = useState('');
  const [signatureName, setSignatureName] = useState(driverName || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Status counters
  const criticalCount = items.filter(i => i.status === 'DEFECT_CRITICAL').length;
  const minorCount = items.filter(i => i.status === 'DEFECT_MINOR').length;

  const handleStatusChange = (key: string, newStatus: 'PASS' | 'DEFECT_MINOR' | 'DEFECT_CRITICAL') => {
    setItems(prev => prev.map(item => {
      if (item.key === key) {
        return { ...item, status: newStatus };
      }
      return item;
    }));
  };

  const handleNotesChange = (key: string, notes: string) => {
    setItems(prev => prev.map(item => {
      if (item.key === key) {
        return { ...item, notes };
      }
      return item;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!signatureName.trim()) {
      setErrorMsg(isRtl ? 'يرجى كتابة اسم السائق لتأكيد التوقيع والإقرار' : 'Please enter driver name for digital signature');
      return;
    }

    if (odometer < 0) {
      setErrorMsg(isRtl ? 'قراءة العداد غير صحيحة' : 'Invalid odometer reading');
      return;
    }

    try {
      setIsSubmitting(true);
      const record = await FleetBusinessEngine.submitVehicleInspection(companyId, {
        vehicle_id: vehicle.id,
        driver_id: driverId,
        driver_name: signatureName.trim(),
        trip_id: tripId,
        type: inspectionType,
        odometerReading: odometer,
        items,
        driverNotes: driverNotes.trim(),
        driverSignatureName: signatureName.trim()
      });

      onInspectionSubmitted(record);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || (isRtl ? 'حدث خطأ أثناء حفظ الفحص' : 'Error saving inspection'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-black flex items-center gap-2">
                <span>{isRtl ? 'فحص السلامة الرقمي للمركبة' : 'Digital Vehicle Safety Inspection'}</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded-lg bg-white/10 text-indigo-200 border border-white/10">
                  {vehicle.plateNumber} ({vehicle.code})
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {isRtl 
                  ? 'قائمة الفحص والمطابقة الإلزامية قبل التحرك لضمان سلامة السائق والأسطول' 
                  : 'Mandatory pre/post trip walkaround checklist to ensure driver and fleet safety'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-xl flex items-center gap-2 font-bold">
              <AlertOctagon className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Inspection Type & Odometer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {isRtl ? 'نوع الفحص' : 'Inspection Type'}
              </label>
              <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setInspectionType('PRE_TRIP')}
                  className={`py-1.5 rounded-lg transition-all ${
                    inspectionType === 'PRE_TRIP' 
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-extrabold' 
                      : 'text-slate-500'
                  }`}
                >
                  {isRtl ? 'قبل الرحلة' : 'Pre-Trip'}
                </button>
                <button
                  type="button"
                  onClick={() => setInspectionType('POST_TRIP')}
                  className={`py-1.5 rounded-lg transition-all ${
                    inspectionType === 'POST_TRIP' 
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-extrabold' 
                      : 'text-slate-500'
                  }`}
                >
                  {isRtl ? 'بعد الرحلة' : 'Post-Trip'}
                </button>
                <button
                  type="button"
                  onClick={() => setInspectionType('ROUTINE')}
                  className={`py-1.5 rounded-lg transition-all ${
                    inspectionType === 'ROUTINE' 
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-extrabold' 
                      : 'text-slate-500'
                  }`}
                >
                  {isRtl ? 'دوري' : 'Routine'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {isRtl ? 'قراءة عداد الكيلومترات (كم)' : 'Odometer Reading (KM)'}
              </label>
              <div className="relative">
                <Gauge className="h-4 w-4 absolute right-3 rtl:right-3 rtl:left-auto ltr:left-3 top-2.5 text-slate-400" />
                <input
                  type="number"
                  min={0}
                  value={odometer}
                  onChange={(e) => setOdometer(Number(e.target.value))}
                  className="w-full pl-9 pr-9 py-2 text-xs font-mono font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  required
                />
              </div>
            </div>
          </div>

          {/* Critical Warning if critical defects detected */}
          {criticalCount > 0 && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-2xl space-y-1 animate-pulse">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs font-black">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{isRtl ? 'تحذير سلامة حرج: تم رصد عطل جسيم يمنع حركة المركبة!' : 'Critical Safety Warning: Severe defect detected!'}</span>
              </div>
              <p className="text-[11px] text-rose-600 dark:text-rose-400">
                {isRtl 
                  ? 'عند تقديم هذا التقرير، سيتم تحويل حالة المركبة فوراً إلى (صيانة - MAINTENANCE) لمنع تحركها وحماية السائق حتى اعتماد الإصلاح من المشرف.' 
                  : 'Upon submission, vehicle status will immediately be locked to MAINTENANCE to protect driver and public safety.'}
              </p>
            </div>
          )}

          {/* Checklist Items Table / Cards */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-extrabold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-2">
              <span>{isRtl ? 'بنود الفحص والمعاينة الميدانية' : 'Checklist Items'}</span>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-emerald-600 font-bold">{items.filter(i => i.status === 'PASS').length} {isRtl ? 'سليم' : 'Pass'}</span>
                <span>•</span>
                <span className="text-amber-600 font-bold">{minorCount} {isRtl ? 'ملاحظة' : 'Minor'}</span>
                <span>•</span>
                <span className="text-rose-600 font-bold">{criticalCount} {isRtl ? 'عطل حرج' : 'Critical'}</span>
              </div>
            </div>

            <div className="space-y-2">
              {items.map((item) => {
                return (
                  <div
                    key={item.key}
                    className={`p-3 rounded-2xl border transition-all ${
                      item.status === 'DEFECT_CRITICAL' 
                        ? 'bg-rose-50/50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800' 
                        : item.status === 'DEFECT_MINOR'
                        ? 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                        : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                          <span>{isRtl ? item.labelAr : item.labelEn}</span>
                          {item.isCritical && (
                            <span className="px-1.5 py-0.5 text-[9px] font-black rounded-md bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                              {isRtl ? 'إلزامي / حرج' : 'Critical'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 3-Way Status Toggle */}
                      <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(item.key, 'PASS')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                            item.status === 'PASS' 
                              ? 'bg-emerald-600 text-white shadow-sm' 
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          <span>{isRtl ? 'سليم' : 'Pass'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStatusChange(item.key, 'DEFECT_MINOR')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                            item.status === 'DEFECT_MINOR' 
                              ? 'bg-amber-500 text-white shadow-sm' 
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          <span>{isRtl ? 'ملاحظة بسيطة' : 'Minor'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStatusChange(item.key, 'DEFECT_CRITICAL')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                            item.status === 'DEFECT_CRITICAL' 
                              ? 'bg-rose-600 text-white shadow-sm' 
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          <AlertOctagon className="h-3 w-3" />
                          <span>{isRtl ? 'عطل حرج' : 'Critical'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Expandable note for minor or critical issues */}
                    {item.status !== 'PASS' && (
                      <div className="mt-2 pt-2 border-t border-slate-200/50 dark:border-slate-800">
                        <input
                          type="text"
                          value={item.notes || ''}
                          onChange={(e) => handleNotesChange(item.key, e.target.value)}
                          placeholder={isRtl ? 'اكتب تفاصيل الملاحظة أو العطل...' : 'Describe defect or note...'}
                          className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* General Notes & Digital Signature */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isRtl ? 'ملاحظات عامة للسائق' : 'General Driver Notes'}
              </label>
              <textarea
                value={driverNotes}
                onChange={(e) => setDriverNotes(e.target.value)}
                placeholder={isRtl ? 'أي ملاحظات إضافية بخصوص حالة الطريق أو حمولة المركبة...' : 'Any additional comments...'}
                rows={2}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isRtl ? 'التوقيع الرقمي وإقرار السائق بالمعاينة *' : 'Driver Signature & Confirmation *'}
              </label>
              <div className="relative">
                <User className="h-4 w-4 absolute right-3 rtl:right-3 rtl:left-auto ltr:left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder={isRtl ? 'اسم السائق بالكامل (إقرار بالمسؤولية)' : 'Full Driver Name'}
                  className="w-full pl-9 pr-9 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  required
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
            >
              {isRtl ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 text-xs font-bold rounded-xl text-white flex items-center gap-1.5 shadow-md transition-all ${
                criticalCount > 0 
                  ? 'bg-rose-600 hover:bg-rose-700' 
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              <span>
                {criticalCount > 0 
                  ? (isRtl ? 'إرسال التقرير وإيقاف المركبة للصيانة' : 'Submit & Flag Vehicle for Maintenance')
                  : (isRtl ? 'اعتماد وإرسال الفحص الرقمي' : 'Submit Safety Inspection')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
