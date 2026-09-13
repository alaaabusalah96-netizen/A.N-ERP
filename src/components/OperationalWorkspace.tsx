import React, { useState } from 'react';
import {
  Plus,
  FileCheck,
  Printer,
  Search,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
  Layers,
} from 'lucide-react';
import { OperationalTransaction, UserProfile } from '../types/erp';
import { ActiveSection } from './Sidebar';

interface OperationalWorkspaceProps {
  currentUser: UserProfile;
  activeSection: ActiveSection;
  transactions: OperationalTransaction[];
  isLoadingTransactions?: boolean;
  onOpenCreateModal: (type?: string) => void;
  onOpenPrintModal: (tx: OperationalTransaction) => void;
  onApproveTransaction: (id: string) => void;
  onPostTransaction: (id: string) => void;
}

export const OperationalWorkspace: React.FC<OperationalWorkspaceProps> = ({
  currentUser,
  activeSection,
  transactions,
  isLoadingTransactions = false,
  onOpenCreateModal,
  onOpenPrintModal,
  onApproveTransaction,
  onPostTransaction,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'معتمد' | 'بانتظار الاعتماد' | 'مسودة'>('all');

  // Filter transactions
  const filtered = transactions.filter((tx) => {
    if (statusFilter !== 'all' && tx.status !== statusFilter) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        tx.code.toLowerCase().includes(q) ||
        tx.description.toLowerCase().includes(q) ||
        tx.party.toLowerCase().includes(q) ||
        tx.type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalApproved = transactions
    .filter((t) => t.status === 'معتمد')
    .reduce((acc, cur) => acc + cur.amount, 0);

  const pendingCount = transactions.filter((t) => t.status === 'بانتظار الاعتماد').length;
  const hasTransactions = transactions.length > 0;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-700" />
            {activeSection === 'overview' && 'لوحة العمليات التشغيلية المباشرة'}
            {activeSection === 'accounting' && 'القيود والسندات المحاسبية'}
            {activeSection === 'approvals' && 'مركز الاعتمادات والرقابة المالية'}
            {activeSection === 'reports' && 'التقارير المالية والختامية'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            مرحباً بك، {currentUser.name} ({currentUser.roleTitleAr}) — قيد العمليات في الفرع الرئيسي
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onOpenCreateModal()}
            className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>إصدار سند / قيد جديد</span>
          </button>
        </div>
      </div>

      {/* Operational Metrics Row — Displayed ONLY if real data exists, avoiding fake fabricated zeros */}
      {hasTransactions && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-xs font-semibold text-slate-500">إجمالي العمليات المعتمدة</div>
            <div className="text-xl font-bold text-slate-900 mt-1 font-mono">
              {totalApproved.toLocaleString()} <span className="text-xs font-normal">ر.س</span>
            </div>
            <div className="text-[11px] text-emerald-600 mt-1 font-medium">قيود مرحلة في الدفاتر</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-xs font-semibold text-slate-500">بانتظار الاعتماد المالي</div>
            <div className="text-xl font-bold text-amber-600 mt-1 font-mono">
              {pendingCount} <span className="text-xs font-normal">مستندات</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">تتطلب تدقيق المعتمد المالي</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-xs font-semibold text-slate-500">إجمالي المستندات النشطة</div>
            <div className="text-xl font-bold text-slate-800 mt-1 font-mono">
              {transactions.length} <span className="text-xs font-normal">سجلات</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">تُقرأ مباشرة عبر مخزن البيانات الحي</div>
          </div>
        </div>
      )}

      {/* Main Table or Professional Empty State */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Search & Filter Header */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="البحث برقم السند، البيان، أو الحساب..."
              className="w-full text-xs pr-9 pl-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-medium text-slate-500">تصفية الحالة:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">كافة الحالات</option>
              <option value="معتمد">معتمد</option>
              <option value="بانتظار الاعتماد">بانتظار الاعتماد</option>
              <option value="مسودة">مسودة</option>
            </select>
          </div>
        </div>

        {/* Loading State */}
        {isLoadingTransactions ? (
          <div className="p-12 text-center text-xs text-slate-500">
            جارٍ استرجاع المستندات المحاسبية من قاعدة البيانات...
          </div>
        ) : !hasTransactions ? (
          /* Professional Empty State as mandated by Section 1A (لا صفر ملفّق) */
          <div className="p-16 text-center max-w-md mx-auto space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                لا توجد مستندات مسجلة في دفاتر هذه المنشأة بعد
              </h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                سجلات الأستاذ العام ودفاتر اليومية بانتظار أول قيد محاسبي أو سند صرف. ابدأ بإنشاء أول
                مستند مالي لبدء دورة الترحيل والاعتماد المؤسسي.
              </p>
            </div>
            <button
              onClick={() => onOpenCreateModal()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-colors shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              إصدار أول قيد أو سند
            </button>
          </div>
        ) : (
          /* Populated Table */
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم المستند</th>
                  <th className="p-3.5">التاريخ</th>
                  <th className="p-3.5">نوع المستند</th>
                  <th className="p-3.5">البيان والوصف</th>
                  <th className="p-3.5">الطرف المقابل / الحساب</th>
                  <th className="p-3.5 text-left">المبلغ (ر.س)</th>
                  <th className="p-3.5 text-center">حالة السند</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      لا توجد مستندات تطابق معايير البحث الحالية
                    </td>
                  </tr>
                ) : (
                  filtered.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-blue-700">{tx.code}</td>
                      <td className="p-3.5 text-slate-500">{tx.date}</td>
                      <td className="p-3.5">
                        <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px] font-semibold">
                          {tx.type}
                        </span>
                      </td>
                      <td className="p-3.5 max-w-xs truncate" title={tx.description}>
                        {tx.description}
                      </td>
                      <td className="p-3.5 font-semibold text-slate-800">{tx.party}</td>
                      <td className="p-3.5 text-left font-bold text-slate-900">
                        {tx.amount.toLocaleString()}
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            tx.status === 'معتمد'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : tx.status === 'بانتظار الاعتماد'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => onOpenPrintModal(tx)}
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="معاينة وطباعة المستند الرسمي"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {tx.status === 'بانتظار الاعتماد' && (
                            <button
                              onClick={() => onApproveTransaction(tx.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors shadow-2xs"
                              title="اعتماد المستند رسمياً"
                            >
                              <FileCheck className="w-3.5 h-3.5" /> اعتماد
                            </button>
                          )}

                          {tx.status === 'معتمد' && (
                            <button
                              onClick={() => onPostTransaction(tx.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-bold rounded-lg border border-blue-200 transition-colors"
                              title="ترحيل نهائي إلى دفاتر الأستاذ العام"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> ترحيل
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {hasTransactions && (
          <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs text-slate-500">
            <span>إجمالي المستندات المعروضة: {filtered.length}</span>
            <span className="font-semibold text-slate-700">A.N ERP — الإدارة المالية والمحاسبية الموحدة</span>
          </div>
        )}
      </div>
    </div>
  );
};
