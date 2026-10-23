import React from 'react';
import { Plus, Wallet } from 'lucide-react';
import { DailyWorker, DailyAttendanceLog } from '../../types/contracting';

interface ContractingDailyLaborTabProps {
  isRtl: boolean;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  workers: DailyWorker[];
  attendanceLogs: DailyAttendanceLog[];
  setShowWorkerModal: (show: boolean) => void;
  handleProcessBatchPayout: () => void;
  handleLogAttendance: (worker: DailyWorker, daysWorked: number, otHours: number) => void;
}

export const ContractingDailyLaborTab: React.FC<ContractingDailyLaborTabProps> = ({
  isRtl,
  selectedDate,
  setSelectedDate,
  workers,
  attendanceLogs,
  setShowWorkerModal,
  handleProcessBatchPayout,
  handleLogAttendance,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {isRtl ? 'كشف حضور ويوميات العمالة بالموقع' : 'Daily Site Worker Attendance & Wages'}
          </h3>
          <p className="text-xs text-slate-500">
            {isRtl ? 'تسجيل حضور العمالة باليومية وساعات الإضافي وإصدار سندات صرف الأجور بضغطة واحدة' : 'Log daily worker hours, overtime, and release cash wage payouts'}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-bold"
          />
          <button
            onClick={() => setShowWorkerModal(true)}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} />
            <span>{isRtl ? 'تعريف عامل جديد' : 'Add Worker'}</span>
          </button>
          <button
            onClick={handleProcessBatchPayout}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
          >
            <Wallet size={14} />
            <span>{isRtl ? 'إصدار سند صرف اليوميات' : 'Batch Pay Wages'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 font-bold uppercase text-[11px]">
              <tr>
                <th className="p-3">اسم العامل</th>
                <th className="p-3">المهنة / الصنعة</th>
                <th className="p-3 text-center">فئة اليومية</th>
                <th className="p-3 text-center">الحضور (أيام)</th>
                <th className="p-3 text-center">إضافي (ساعات)</th>
                <th className="p-3 text-center">إجمالي مستحق اليوم</th>
                <th className="p-3 text-center">حالة الصرف</th>
                <th className="p-3 text-center">إجراء تسجيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {workers.map((w) => {
                const log = attendanceLogs.find(a => a.worker_id === w.id && a.date === selectedDate);
                return (
                  <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors font-medium">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{w.name}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 rounded-md font-bold text-[10px]">
                        {w.trade}
                      </span>
                    </td>
                    <td className="p-3 text-center font-bold">{w.daily_rate} ج.م</td>
                    <td className="p-3 text-center font-bold text-blue-600">{log ? log.days_worked : 0} يوم</td>
                    <td className="p-3 text-center text-purple-600">{log ? log.overtime_hours : 0} س</td>
                    <td className="p-3 text-center font-black text-slate-900 dark:text-white text-sm">
                      {log ? log.total_wage.toLocaleString() : 0} ج.م
                    </td>
                    <td className="p-3 text-center">
                      {log?.payment_status === 'PAID' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600">
                          {isRtl ? 'تم الصرف' : 'Paid'}
                        </span>
                      ) : log ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600">
                          {isRtl ? 'مستحق للصرف' : 'Unpaid'}
                        </span>
                      ) : (
                        <span className="text-slate-400">{isRtl ? 'لم يسجل' : 'Not Logged'}</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleLogAttendance(w, 1, 0)}
                          className="px-2 py-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                        >
                          {isRtl ? 'يوم كامل' : 'Full Day'}
                        </button>
                        <button
                          onClick={() => handleLogAttendance(w, 1, 2)}
                          className="px-2 py-1 bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                        >
                          {isRtl ? '+2 س إضافي' : '+2h OT'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
