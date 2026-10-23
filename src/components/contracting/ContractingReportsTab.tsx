import React from 'react';
import { ContractingPaymentVoucher, DailyAttendanceLog } from '../../types/contracting';

interface ContractingReportsTabProps {
  isRtl: boolean;
  vouchers: ContractingPaymentVoucher[];
  attendanceLogs: DailyAttendanceLog[];
}

export const ContractingReportsTab: React.FC<ContractingReportsTabProps> = ({
  isRtl,
  vouchers,
  attendanceLogs,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
          {isRtl ? 'تقرير ربحية وكفاءة الموقع' : 'Site Profitability & Cost Control'}
        </h3>
        <p className="text-xs text-slate-500 mb-6">
          {isRtl ? 'مقارنة إجمالي الأعمال المعتمدة بالمستخلصات مع مصروفات وأجور العمالة بالموقع' : 'Comparison of certified revenues vs labor expenses'}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700">
            <span className="text-xs text-slate-500">{isRtl ? 'إجمالي المستخلصات المعتمدة:' : 'Approved Revenue:'}</span>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {vouchers.reduce((s, v) => s + v.current_work_completed, 0).toLocaleString()} ج.م
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700">
            <span className="text-xs text-slate-500">{isRtl ? 'إجمالي أجور يوميات العمالة:' : 'Total Labor Cost:'}</span>
            <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">
              {attendanceLogs.reduce((s, a) => s + a.total_wage, 0).toLocaleString()} ج.م
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700">
            <span className="text-xs text-slate-500">{isRtl ? 'إجمالي المحتجزات (ضمان الأعمال):' : 'Retention Guarantees:'}</span>
            <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
              {vouchers.reduce((s, v) => s + v.retention_deduction, 0).toLocaleString()} ج.م
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
