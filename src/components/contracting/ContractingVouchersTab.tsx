import React from 'react';
import { FileText, Plus, CheckCircle2, Printer } from 'lucide-react';
import { ContractingPaymentVoucher, PaymentVoucherType } from '../../types/contracting';

interface ContractingVouchersTabProps {
  isRtl: boolean;
  vouchers: ContractingPaymentVoucher[];
  handleOpenNewVoucherModal: (type: PaymentVoucherType) => void;
  setActivePrintVoucher: (v: ContractingPaymentVoucher) => void;
  setShowPrintModal: (show: boolean) => void;
}

export const ContractingVouchersTab: React.FC<ContractingVouchersTabProps> = ({
  isRtl,
  vouchers,
  handleOpenNewVoucherModal,
  setActivePrintVoucher,
  setShowPrintModal,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {isRtl ? 'سجل مستخلصات المالك ومقاولي الباطن' : 'Payment Certificates Ledger'}
          </h3>
          <p className="text-xs text-slate-500">
            {isRtl ? 'احتساب إجمالي الأعمال المنفذة، الاستقطاعات، وخصم الدفعة المقدمة وضمان الأعمال' : 'Track current work completed, deductions, and net payouts'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenNewVoucherModal('CLIENT')}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            <span>{isRtl ? '+ مستخلص مالك جديد' : '+ New Client Certificate'}</span>
          </button>
          <button
            onClick={() => handleOpenNewVoucherModal('SUBCONTRACTOR')}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            <span>{isRtl ? '+ مستخلص مقاول باطن' : '+ New Subcontractor Certificate'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 font-bold uppercase text-[11px]">
              <tr>
                <th className="p-3">رقم المستخلص</th>
                <th className="p-3">النوع</th>
                <th className="p-3">التاريخ والنزول</th>
                <th className="p-3 text-center">الأعمال المنفذة</th>
                <th className="p-3 text-center">خصم الدفعة المقدمة</th>
                <th className="p-3 text-center">ضمان الأعمال (محتجز)</th>
                <th className="p-3 text-left">صافي المستحق</th>
                <th className="p-3 text-center">الحالة</th>
                <th className="p-3 text-center">طباعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {vouchers.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors font-medium">
                  <td className="p-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText size={16} className="text-amber-500" />
                    <span>{v.voucher_number}</span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      v.type === 'CLIENT' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-blue-500/10 text-blue-600'
                    }`}>
                      {v.type === 'CLIENT' ? (isRtl ? 'مستخلص مالك' : 'Client Certificate') : (isRtl ? 'مقاول باطن' : 'Subcontractor')}
                    </span>
                  </td>
                  <td className="p-3 text-slate-500">{v.date}</td>
                  <td className="p-3 text-center font-bold">{v.current_work_completed.toLocaleString()} ج.م</td>
                  <td className="p-3 text-center text-amber-600 font-medium">-{v.advance_deduction.toLocaleString()} ج.م</td>
                  <td className="p-3 text-center text-indigo-600 font-medium">-{v.retention_deduction.toLocaleString()} ج.م</td>
                  <td className="p-3 text-left font-black text-emerald-600 dark:text-emerald-400 text-sm">
                    {v.net_amount.toLocaleString()} ج.م
                  </td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 flex items-center justify-center gap-1">
                      <CheckCircle2 size={12} />
                      <span>{isRtl ? 'معتمد' : 'Approved'}</span>
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => {
                        setActivePrintVoucher(v);
                        setShowPrintModal(true);
                      }}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-all cursor-pointer"
                    >
                      <Printer size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {!vouchers.length && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-slate-400">
                    {isRtl ? 'لا توجد مستخلصات مسجلة لهذا المشروع بعد.' : 'No payment certificates logged yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
