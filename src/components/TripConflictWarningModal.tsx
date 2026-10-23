import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Edit3, 
  X, 
  MapPin, 
  Truck, 
  User, 
  Clock, 
  ShieldAlert, 
  ArrowRight,
  Info,
  Calendar
} from 'lucide-react';
import { TripConflictWarning } from '../types/fleet';

interface TripConflictWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflicts: TripConflictWarning[];
  onProceedWithOverride: (reason: string) => void;
  onEditAssignment: () => void;
  onCancel: () => void;
  language: 'ar' | 'en';
  candidateVehiclePlate?: string;
  candidateVehicleCode?: string;
  candidateDriverName?: string;
  scheduledAt?: string;
}

export const TripConflictWarningModal: React.FC<TripConflictWarningModalProps> = ({
  isOpen,
  onClose,
  conflicts,
  onProceedWithOverride,
  onEditAssignment,
  onCancel,
  language,
  candidateVehiclePlate,
  candidateVehicleCode,
  candidateDriverName,
  scheduledAt
}) => {
  const isRtl = language === 'ar';
  const [overrideReason, setOverrideReason] = useState(
    isRtl 
      ? 'قرار المشرف: متابعة التشغيل وتجاوز التعارض يدوياً (حاجة عمل مؤكدة)' 
      : 'Supervisor decision: proceed despite operational conflict'
  );

  if (!isOpen || conflicts.length === 0) return null;

  const getConflictTypeLabel = (type: string) => {
    switch (type) {
      case 'SAME_DESTINATION':
        return isRtl ? 'تعارض: نفس الوجهة/الفرع في نفس اليوم' : 'Conflict: Same Destination Today';
      case 'SAME_TASK_TYPE':
        return isRtl ? 'تعارض: نفس نوع المهمة في نفس اليوم' : 'Conflict: Same Task Type Today';
      case 'SAME_VEHICLE':
        return isRtl ? 'تعارض: المركبة مسند إليها مشوار آخر' : 'Conflict: Vehicle Already Assigned';
      case 'SAME_DRIVER':
        return isRtl ? 'تعارض: السائق مسند إليه مشوار آخر' : 'Conflict: Driver Already Assigned';
      default:
        return isRtl ? 'تنبيه تعارض تشغيلي' : 'Operational Conflict Warning';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-5 border-b border-amber-200/80 dark:border-amber-900/50 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>{isRtl ? 'تنبيه تعارض تشغيلي في نفس اليوم' : 'Daily Operational Conflict Warning'}</span>
                <span className="px-2 py-0.5 text-xs font-mono font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 rounded-full border border-amber-300 dark:border-amber-800">
                  {conflicts.length} {isRtl ? 'تنبيه' : 'Alerts'}
                </span>
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {isRtl 
                  ? 'تم رصد مشاوير أو مهام أخرى متزامنة لنفس الوجهة أو نوع المهمة اليوم. القرار للمشرف لتوجيه الأسطول.'
                  : 'Concurrent trips detected for the same destination or task type today. Supervisor decision required.'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Candidate Info Summary */}
          {(candidateVehicleCode || candidateVehiclePlate || candidateDriverName) && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-4 text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300">{isRtl ? 'المشوار الجديد المقترح:' : 'Proposed New Trip:'}</span>
              {candidateVehicleCode && (
                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                  <Truck className="h-3.5 w-3.5 text-indigo-500" />
                  <span>{candidateVehicleCode} {candidateVehiclePlate ? `(${candidateVehiclePlate})` : ''}</span>
                </span>
              )}
              {candidateDriverName && (
                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                  <User className="h-3.5 w-3.5 text-emerald-500" />
                  <span>{candidateDriverName}</span>
                </span>
              )}
              {scheduledAt && (
                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                  <Calendar className="h-3.5 w-3.5 text-amber-500" />
                  <span>{scheduledAt.replace('T', ' ')}</span>
                </span>
              )}
            </div>
          )}

          {/* List of Detected Conflicts */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              <span>{isRtl ? 'تفاصيل المشاوير المتزامنة المكتشفة:' : 'Detected Concurrent Trips:'}</span>
            </h4>

            {conflicts.map((c, idx) => (
              <div 
                key={idx}
                className="p-3.5 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-xl space-y-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 font-bold rounded-md bg-amber-200 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 text-[11px]">
                    {getConflictTypeLabel(c.conflictType)}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {c.scheduledAt?.split('T')[0] || ''}
                  </span>
                </div>

                <p className="text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                  {isRtl ? c.messageAr : c.messageEn}
                </p>

                <div className="pt-2 border-t border-amber-200/60 dark:border-amber-900/40 grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 dark:text-slate-400 text-[11px]">
                  {c.conflictingVehicleCode && (
                    <div className="flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5 text-slate-400" />
                      <span>{isRtl ? 'مركبة المشوار القائم:' : 'Existing Vehicle:'} <strong>{c.conflictingVehicleCode} {c.conflictingVehiclePlate ? `(${c.conflictingVehiclePlate})` : ''}</strong></span>
                    </div>
                  )}
                  {c.conflictingDriverName && (
                    <div className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      <span>{isRtl ? 'السائق المكلف:' : 'Assigned Driver:'} <strong>{c.conflictingDriverName}</strong></span>
                    </div>
                  )}
                  {c.destinationLabel && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      <span>{isRtl ? 'الوجهة:' : 'Destination:'} <strong>{c.destinationLabel}</strong></span>
                    </div>
                  )}
                  {c.taskTitle && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>{isRtl ? 'نوع المهمة:' : 'Task:'} <strong>{c.taskTitle}</strong></span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Supervisor Decision Note */}
          <div className="pt-2 space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              {isRtl ? 'ملاحظة / تبرير قرار المشرف عند المتابعة:' : 'Supervisor Override Justification Note:'}
            </label>
            <input
              type="text"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder={isRtl ? 'اكتب سبب المتابعة (مثلاً: شحنة إضافية عاجلة / تنسيق مسبق بين السائقين)...' : 'Reason for override...'}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Info className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
              <span>{isRtl ? 'سيتم تسجيل المشوار مع توثيق قرار التجاوز اليدوي وهوية المشرف في سجل التدقيق.' : 'The trip will be saved with supervisor override documented in audit trail.'}</span>
            </p>
          </div>
        </div>

        {/* Footer Actions: 3 Clear Choices */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            {isRtl ? 'إلغاء المشوار' : 'Cancel Trip'}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onEditAssignment}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-xl transition-all"
            >
              <Edit3 className="h-4 w-4" />
              <span>{isRtl ? 'تعديل الإسناد (تغيير المركبة أو الوجهة)' : 'Edit Assignment'}</span>
            </button>

            <button
              type="button"
              onClick={() => onProceedWithOverride(overrideReason)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm hover:shadow transition-all"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isRtl ? 'متابعة رغم التعارض (الموافقة والتسجيل)' : 'Proceed Despite Conflict'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TripConflictWarningModal;
