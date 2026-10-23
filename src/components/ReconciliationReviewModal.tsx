import React from 'react';
import { Language, Theme, Transaction, Station, ExpenseCategory } from '../types';
import { 
  X, 
  ShieldCheck, 
  FileText, 
  FileImage, 
  Eye, 
  Download, 
  CornerUpLeft, 
  XCircle,
  Building2,
  Calendar,
  Layers,
  Coins
} from 'lucide-react';

interface ReconciliationReviewModalProps {
  language: Language;
  theme: Theme;
  reviewingTx: Transaction | null;
  onClose: () => void;
  stations: Station[];
  allTransactions: Transaction[];
  categories: ExpenseCategory[];
  reviewComments: string;
  setReviewComments: (v: string) => void;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  revertReason: string;
  setRevertReason: (v: string) => void;
  handleRevert: (tx: Transaction, comments?: string) => void;
  handleRejectVoucher: (tx: Transaction, comments: string) => void;
  handleApproveVoucher: (tx: Transaction, comments: string) => void;
  setPreviewImage: (v: string | null) => void;
}

export default function ReconciliationReviewModal({
  language,
  theme,
  reviewingTx,
  onClose,
  stations,
  allTransactions,
  categories,
  reviewComments,
  setReviewComments,
  rejectReason,
  setRejectReason,
  revertReason,
  setRevertReason,
  handleRevert,
  handleRejectVoucher,
  handleApproveVoucher,
  setPreviewImage
}: ReconciliationReviewModalProps) {
  if (!reviewingTx) return null;

  const isRtl = language === 'ar';

  // Find associated station
  const station = stations.find(s => s.id === reviewingTx.station_id) || {
    station_name: isRtl ? 'محطة افتراضية' : 'Default Station',
    station_code: 'STN-XXX'
  };

  // Find the full list of bundled transactions under this voucher
  const vNo = reviewingTx.voucher_no;
  const bundledExpenses = vNo 
    ? allTransactions.filter(t => t.voucher_no === vNo)
    : [reviewingTx];

  const totalVoucherAmount = bundledExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Gather all attachments
  const allAttachments = bundledExpenses.flatMap(e => e.attachments || []);

  const formatVal = (val: number) => {
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EGP';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div 
        className={`w-full max-w-4xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh] ${
          theme === 'dark' ? 'bg-[#0f172a] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h3 className="font-extrabold text-sm md:text-base">
              {isRtl ? 'بوابة التدقيق واعتماد مستندات تسوية العهدة' : 'Voucher Audit & Settlement Portal'}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-slate-50/30 dark:bg-slate-900/10">
          
          {/* Metadata Grid */}
          <div className={`p-4 rounded-xl border grid grid-cols-2 md:grid-cols-4 gap-4 ${
            theme === 'dark' ? 'bg-[#1e293b]/40 border-slate-800' : 'bg-slate-50 border-slate-200/80'
          }`}>
            <div className="space-y-0.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                {isRtl ? 'رقم السند / الحافظة' : 'Voucher / Doc ID'}
              </span>
              <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">
                {vNo || reviewingTx.transaction_no}
              </span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                {isRtl ? 'تاريخ الاستحقاق/السند' : 'Voucher Date'}
              </span>
              <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                {reviewingTx.voucher_date || reviewingTx.date}
              </span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                {isRtl ? 'المحطة / الفرع' : 'Station / Branch'}
              </span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Building2 size={13} className="text-slate-400" />
                {station.station_name}
              </span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                {isRtl ? 'إجمالي قيمة الحافظة' : 'Voucher Total Amount'}
              </span>
              <span className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Coins size={14} className="text-emerald-500" />
                {formatVal(totalVoucherAmount)}
              </span>
            </div>
          </div>

          {/* Section 1: Linked Expense Items */}
          <div className="space-y-2.5">
            <h4 className="font-black text-xs text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Layers size={13} className="text-slate-400" />
              <span>{isRtl ? '١. تفاصيل المصروفات المرفقة بالحافظة' : '1. Bundled Expenses Ledger'}</span>
              <span className="font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full text-[10px] font-black">
                {bundledExpenses.length} {isRtl ? 'بنود' : 'items'}
              </span>
            </h4>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold">
                      <th className="p-2.5 text-center border-l border-slate-200 dark:border-slate-800 w-12">#</th>
                      <th className="p-2.5 border-l border-slate-200 dark:border-slate-800 w-28">{isRtl ? 'رقم الحركة' : 'Tx No'}</th>
                      <th className="p-2.5 border-l border-slate-200 dark:border-slate-800 w-24">{isRtl ? 'التاريخ' : 'Date'}</th>
                      <th className="p-2.5 border-l border-slate-200 dark:border-slate-800 w-32">{isRtl ? 'التصنيف' : 'Category'}</th>
                      <th className="p-2.5 border-l border-slate-200 dark:border-slate-800">{isRtl ? 'البيان والوصف' : 'Description'}</th>
                      <th className="p-2.5 text-left font-mono w-28">{isRtl ? 'المبلغ' : 'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {bundledExpenses.map((item, idx) => {
                      const cat = categories.find(c => c.id === item.category_id);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="p-2.5 text-center border-l border-slate-200 dark:border-slate-800 font-mono text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="p-2.5 font-mono text-slate-500 border-l border-slate-200 dark:border-slate-800">
                            {item.transaction_no}
                          </td>
                          <td className="p-2.5 font-mono text-slate-500 border-l border-slate-200 dark:border-slate-800">
                            {item.date}
                          </td>
                          <td className="p-2.5 border-l border-slate-200 dark:border-slate-800">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                              {cat ? (isRtl ? cat.name_ar : cat.name_en) : (isRtl ? 'عام' : 'General')}
                            </span>
                          </td>
                          <td className="p-2.5 font-medium text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800">
                            {item.description}
                            {item.notes && (
                              <span className="block text-[10px] text-slate-400 italic mt-0.5">
                                {isRtl ? 'ملاحظات: ' : 'Notes: '}{item.notes}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-left font-mono font-bold text-slate-900 dark:text-slate-100">
                            {formatVal(item.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Section 2: Attachments Verification */}
          <div className="space-y-2.5">
            <h4 className="font-black text-xs text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FileText size={13} className="text-slate-400" />
              <span>{isRtl ? '٢. مستندات الإثبات والملفات المرفقة بالفاتورة' : '2. Attached Proofs & Receipts'}</span>
              <span className="font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-black">
                {allAttachments.length} {isRtl ? 'ملفات' : 'files'}
              </span>
            </h4>

            {allAttachments.length === 0 ? (
              <div className={`p-5 rounded-xl border text-center text-xs font-semibold text-slate-400 ${
                theme === 'dark' ? 'bg-[#1e293b]/20 border-slate-800' : 'bg-slate-50 border-slate-150'
              }`}>
                {isRtl 
                  ? 'تنبيه محاسبي: لا يوجد صور أو فواتير مرفوعة مع هذا المستند.' 
                  : 'Auditing Alert: No scanned receipts or invoice copies uploaded with this voucher.'}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {allAttachments.map((file) => {
                  const isImage = file.type?.startsWith('image/') || file.name?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                  return (
                    <div 
                      key={file.id}
                      className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 transition-all ${
                        theme === 'dark' ? 'bg-slate-800/30 border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200 shadow-sm hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden flex-1">
                        {isImage ? (
                          <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                            <FileImage size={16} />
                          </span>
                        ) : (
                          <span className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                            <FileText size={16} />
                          </span>
                        )}
                        <div className="overflow-hidden flex-1">
                          <p className="font-bold text-slate-700 dark:text-slate-300 truncate" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {file.type || (isImage ? 'image' : 'document')}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isImage && (
                          <button
                            type="button"
                            onClick={() => setPreviewImage(file.url)}
                            className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                            title={isRtl ? 'عرض الصورة كاملة' : 'Preview Image'}
                          >
                            <Eye size={14} />
                          </button>
                        )}
                        <a 
                          href={file.url} 
                          download={file.name}
                          className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors inline-block"
                          title={isRtl ? 'تحميل الملف' : 'Download File'}
                        >
                          <Download size={14} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: Reviewer Comments & Optional Reasons Input */}
          <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-wider">
              {isRtl ? '٣. تدقيق الحسابات وملاحظات لجنة المراجعة' : '3. Auditor Auditing Comments & Workflow Actions'}
            </label>
            
            {/* General Review Notes */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                {isRtl ? 'ملاحظات وتوجيهات تدقيق عامة (تظهر في سجل الحركات)' : 'General Audit Remarks (Will be appended to transaction logs)'}
              </span>
              <textarea
                rows={2}
                value={reviewComments}
                onChange={(e) => setReviewComments(e.target.value)}
                placeholder={isRtl ? 'اكتب ملاحظات التدقيق هنا للتوثيق المحاسبي...' : 'Write official auditing remarks or logs here...'}
                className={`w-full p-3 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium ${
                  theme === 'dark' 
                    ? 'bg-[#1e293b]/40 border-slate-800 text-slate-100 placeholder-slate-500' 
                    : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 shadow-sm'
                }`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Rejection Reason */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-rose-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  {isRtl ? 'مبررات رفض السند (إلزامية في حالة الرفض)' : 'Rejection Reasoning (Mandatory if rejected)'}
                </span>
                <textarea
                  rows={2}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder={isRtl ? 'اكتب بالتفصيل أسباب عدم قبول هذا المستند محاسبياً...' : 'State why this voucher cannot be approved...'}
                  className={`w-full p-3 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all font-medium ${
                    theme === 'dark' 
                      ? 'bg-[#1e293b]/40 border-slate-800 text-slate-100 placeholder-slate-500' 
                      : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 shadow-sm'
                  }`}
                />
              </div>

              {/* Reversion Reason */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-amber-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {isRtl ? 'أسباب الإرجاع للتعديل (في حالة إعادة المعاملة للمعلق)' : 'Reversion Notes (Required for returning to pending)'}
                </span>
                <textarea
                  rows={2}
                  value={revertReason}
                  onChange={(e) => setRevertReason(e.target.value)}
                  placeholder={isRtl ? 'اكتب النواقص أو التعديلات المطلوبة من أمين العهدة بالفرع...' : 'State what modifications are required from the station cashier...'}
                  className={`w-full p-3 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all font-medium ${
                    theme === 'dark' 
                      ? 'bg-[#1e293b]/40 border-slate-800 text-slate-100 placeholder-slate-500' 
                      : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 shadow-sm'
                  }`}
                />
              </div>
            </div>
          </div>

        </div>

        {/* Action Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/80 shrink-0 bg-slate-50 dark:bg-slate-900/60 flex flex-col sm:flex-row justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all text-center shrink-0 border ${
              theme === 'dark' 
                ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300' 
                : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-600 shadow-sm'
            }`}
          >
            {isRtl ? 'إلغاء وإغلاق' : 'Cancel & Close'}
          </button>

          <div className="flex flex-wrap gap-2 justify-end">
            {/* Revert Button */}
            <button
              type="button"
              onClick={() => handleRevert(reviewingTx, reviewComments)}
              className="px-4 py-2 rounded-xl text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-white transition-all flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/10 hover:scale-[1.01]"
            >
              <CornerUpLeft size={14} />
              <span>{isRtl ? 'إعادة للمعلق للتعديل' : 'Revert to Pending'}</span>
            </button>

            {/* Reject Button */}
            <button
              type="button"
              onClick={() => handleRejectVoucher(reviewingTx, reviewComments)}
              className="px-4 py-2 rounded-xl text-xs font-extrabold bg-rose-600 hover:bg-rose-500 text-white transition-all flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/10 hover:scale-[1.01]"
            >
              <XCircle size={14} />
              <span>{isRtl ? 'رفض نهائي وإرجاع' : 'Reject Voucher'}</span>
            </button>

            {/* Approve Button */}
            <button
              type="button"
              onClick={() => handleApproveVoucher(reviewingTx, reviewComments)}
              className="px-4 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 hover:scale-[1.01]"
            >
              <ShieldCheck size={14} />
              <span>{isRtl ? 'اعتماد الحافظة وتسوية العهدة' : 'Approve & Settle'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
