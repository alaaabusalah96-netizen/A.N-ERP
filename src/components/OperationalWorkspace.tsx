import React, { useState } from 'react';
import { 
  Plus, 
  FileCheck, 
  Printer, 
  Search, 
  TrendingUp, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';
import { OperationalTransaction, UserProfile } from '../types/erp';
import { ActiveSection } from './Sidebar';

interface OperationalWorkspaceProps {
  currentUser: UserProfile;
  activeSection: ActiveSection;
  transactions: OperationalTransaction[];
  onOpenCreateModal: (type?: string) => void;
  onOpenPrintModal: (tx: OperationalTransaction) => void;
  onApproveTransaction: (id: string) => void;
  onPostTransaction: (id: string) => void;
}

export const OperationalWorkspace: React.FC<OperationalWorkspaceProps> = ({
  currentUser,
  activeSection,
  transactions,
  onOpenCreateModal,
  onOpenPrintModal,
  onApproveTransaction,
  onPostTransaction,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'معتمد' | 'بانتظار الاعتماد' | 'مسودة'>('all');

  // Filter transactions based on activeSection & filters
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

  // Calculate quick metrics
  const totalApproved = transactions
    .filter((t) => t.status === 'معتمد')
    .reduce((acc, cur) => acc + cur.amount, 0);

  const pendingCount = transactions.filter((t) => t.status === 'بانتظار الاعتماد').length;
  const draftCount = transactions.filter((t) => t.status === 'مسودة').length;

  return (
    <div className="space-y-6">
      {/* Top Action & Welcome Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {activeSection === 'overview' && 'لوحة العمليات والتشغيل اليومي'}
            {activeSection === 'accounting' && 'دفتر الحسابات والقيود المحاسبية'}
            {activeSection === 'treasury' && 'الخزينة النقدية وسندات الصرف والقبض'}
            {activeSection === 'inventory' && 'حركة المستودعات ومحاضر الاستلام والتسليم'}
            {activeSection === 'sales' && 'فواتير المبيعات ومطالبات العملاء'}
            {activeSection === 'procurement' && 'فواتير المشتريات ومستحقات الموردين'}
            {activeSection === 'approvals' && 'مركز اعتماد المستندات المالية والتشغيلية'}
            {activeSection === 'reports' && 'التقارير المالية والتشغيلية والختامية'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            مرحباً بك، {currentUser.name} ({currentUser.roleTitleAr}) — قيد التشغيل في الفرع الرئيسي
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

      {/* Operational Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">إجمالي العمليات المعتمدة</span>
            <span className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <p className="text-xl font-bold text-slate-900 mt-2">
            {totalApproved.toLocaleString()} <span className="text-xs font-medium text-slate-500">ر.س</span>
          </p>
          <p className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> تم الترحيل لدفاتر الأستاذ العام
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">بانتظار الاعتماد المالي</span>
            <span className="p-2 bg-amber-50 text-amber-700 rounded-lg">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <p className="text-xl font-bold text-slate-900 mt-2">
            {pendingCount} <span className="text-xs font-medium text-slate-500">سندات</span>
          </p>
          <p className="text-[11px] text-amber-600 font-medium mt-1">تتطلب تدقيق المعتمد المالي</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">المسودات قيد التحرير</span>
            <span className="p-2 bg-slate-100 text-slate-600 rounded-lg">
              <FileSpreadsheet className="w-4 h-4" />
            </span>
          </div>
          <p className="text-xl font-bold text-slate-900 mt-2">
            {draftCount} <span className="text-xs font-medium text-slate-500">مسودة</span>
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">لم تُرسل للاعتماد بعد</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">حالة الموازنة والترحيل</span>
            <span className="p-2 bg-blue-50 text-blue-700 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <p className="text-base font-bold text-emerald-700 mt-2">متوازنة بالكامل</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">المدين يساوي الدائن 100%</p>
        </div>
      </div>

      {/* Main Transactions List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Table Filters & Search */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              type="text"
              placeholder="بحث برقم السند، البيان، الحساب، أو نوع العملية..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-9 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">الحالة:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'all' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setStatusFilter('بانتظار الاعتماد')}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'بانتظار الاعتماد' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                قيد الاعتماد
              </button>
              <button
                onClick={() => setStatusFilter('معتمد')}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'معتمد' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                المعتمدة
              </button>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
              <tr>
                <th className="p-3.5">رقم السند</th>
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
                        {/* Print Action */}
                        <button
                          onClick={() => onOpenPrintModal(tx)}
                          className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="معاينة وطباعة المستند الرسمي"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        {/* Approval action if pending */}
                        {tx.status === 'بانتظار الاعتماد' && (
                          <button
                            onClick={() => onApproveTransaction(tx.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors shadow-2xs"
                            title="اعتماد المستند رسمياً"
                          >
                            <FileCheck className="w-3.5 h-3.5" /> اعتماد
                          </button>
                        )}

                        {/* Post to Ledger if approved */}
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

        {/* Table Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs text-slate-500">
          <span>إجمالي المستندات المعروضة: {filtered.length}</span>
          <span className="font-semibold text-slate-700">A.N ERP — الإدارة المالية والمحاسبية الموحدة</span>
        </div>
      </div>
    </div>
  );
};
