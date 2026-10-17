import React, { useState } from 'react';
import { X, Printer, CheckCircle } from 'lucide-react';
import { OperationalTransaction } from '../types/erp';

interface PrintVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: OperationalTransaction | null;
}

export const PrintVoucherModal: React.FC<PrintVoucherModalProps> = ({
  isOpen,
  onClose,
  transaction,
}) => {
  if (!isOpen || !transaction) return null;

  const [officialBusy, setOfficialBusy] = useState(false);
  const [officialError, setOfficialError] = useState<string | null>(null);

  const handlePrint = () => {
    window.print();
  };

  /** UI-AUDIT-PRINT-1: official template via UnifiedPrintService */
  const handleOfficialPrint = async () => {
    if (!transaction?.id) return;
    setOfficialBusy(true);
    setOfficialError(null);
    try {
      const docType = 'journal-entry';
      const res = await fetch(
        `/api/print/${encodeURIComponent(docType)}/${encodeURIComponent(transaction.id)}?format=raw`,
        {
          credentials: 'include',
          headers: { Accept: 'text/html' },
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setOfficialError(
          err.detail || err.error || err.title || `تعذر جلب المستند الرسمي (${res.status})`,
        );
        return;
      }
      const html = await res.text();
      const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
      if (!w) {
        setOfficialError('المتصفح منع النافذة المنبثقة — اسمح بالنوافذ ثم أعد المحاولة');
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      setTimeout(() => {
        try {
          w.focus();
          w.print();
        } catch {
          /* user can print manually */
        }
      }, 300);
    } catch {
      setOfficialError('فشل الاتصال بخدمة الطباعة الموحدة');
    } finally {
      setOfficialBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Controls */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between no-print">
          <div>
            <span className="text-xs font-bold text-slate-700">معاينة المستند الرسمي للطباعة</span>
            {officialError && (
              <div className="text-[10px] text-rose-700 mt-0.5 max-w-xs">{officialError}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOfficialPrint}
              disabled={officialBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-lg transition-colors shadow-2xs disabled:opacity-50"
            >
              <Printer className="w-4 h-4" /> {officialBusy ? 'جاري التحميل…' : 'طباعة رسمية (خادم)'}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg transition-colors shadow-2xs"
            >
              <Printer className="w-4 h-4" /> طباعة معاينة محلية
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="p-8 bg-white text-slate-900 space-y-6">
          {/* Header with A.N ERP System Branding */}
          <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">A.N ERP</h2>
              <p className="text-xs font-semibold text-slate-600">شركة الأعمال الموحدة القابضة - الإدارة المالية</p>
              <p className="text-[11px] text-slate-500">الفرع الرئيسي - الرياض | السجل التجاري: 1010894521</p>
            </div>
            <div className="text-left space-y-1">
              <div className="inline-block bg-slate-100 border border-slate-300 rounded px-3 py-1 text-xs font-bold">
                {transaction.type}
              </div>
              <p className="text-xs font-mono font-bold text-slate-700">رقم السند: {transaction.code}</p>
              <p className="text-xs text-slate-500">التاريخ: {transaction.date}</p>
            </div>
          </div>

          {/* Document Content Details */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block mb-1">الطرف المستفيد / الحساب المقابل:</span>
              <span className="font-bold text-slate-900 text-sm">{transaction.party}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-1">المبلغ المالي الإجمالي:</span>
              <span className="font-bold text-blue-700 text-sm">
                {transaction.amount.toLocaleString()} {transaction.currency}
              </span>
            </div>
            <div className="col-span-2 pt-2 border-t border-slate-200">
              <span className="text-slate-500 block mb-1">البيان والشرح:</span>
              <span className="font-semibold text-slate-800">{transaction.description}</span>
            </div>
          </div>

          {/* Table of Entries */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="p-3">الحساب المدين</th>
                  <th className="p-3">الحساب الدائن</th>
                  <th className="p-3">مركز التكلفة</th>
                  <th className="p-3 text-left">المبلغ (ر.س)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-3 font-semibold">{transaction.party}</td>
                  <td className="p-3 font-semibold">الصندوق الرئيسي</td>
                  <td className="p-3 text-slate-600">الفرع الرئيسي</td>
                  <td className="p-3 text-left font-bold text-slate-900">
                    {transaction.amount.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Signatures & Authorizations */}
          <div className="pt-8 border-t border-slate-200 grid grid-cols-3 gap-6 text-center text-xs">
            <div>
              <p className="text-slate-500 mb-6">المُنشئ ومحرر السند</p>
              <p className="font-bold text-slate-800">{transaction.initiator}</p>
              <p className="text-[10px] text-slate-400">محاسب العمليات</p>
            </div>
            <div>
              <p className="text-slate-500 mb-6">المراجعة والتدقيق المالي</p>
              <p className="font-bold text-slate-800">عبدالله السالم</p>
              <p className="text-[10px] text-slate-400">رئيس الحسابات</p>
            </div>
            <div>
              <p className="text-slate-500 mb-6">الاعتماد النهائي</p>
              <div className="flex items-center justify-center gap-1 text-emerald-700 font-bold">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>{transaction.status === 'معتمد' ? 'معتمد نظامياً' : 'بانتظار التوقيع'}</span>
              </div>
              <p className="text-[10px] text-slate-400">المدير المالي التنفيذي</p>
            </div>
          </div>

          {/* Official Footer */}
          <div className="border-t border-slate-100 pt-4 flex items-center justify-between text-[11px] text-slate-400">
            <span>تم إصدار هذا المستند رسمياً عبر نظام A.N ERP لإدارة المؤسسات</span>
            <span>تاريخ الطباعة: {new Date().toLocaleDateString('ar-SA')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
