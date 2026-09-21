import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Receipt,
  RefreshCw,
  UserCheck,
  Plus,
  AlertCircle,
  CheckCircle2,
  FileText,
  Upload,
  Shield,
  ArrowRightLeft,
  XCircle,
  Eye,
  Building,
} from 'lucide-react';
import { UserProfile } from '../types/erp';

interface Custody {
  id: string;
  custodyCode: string;
  employeeId: string;
  employeeName: string;
  branchName?: string;
  costCenterId: string;
  costCenterName?: string;
  currency: string;
  allocatedAmount: number;
  currentBalance: number;
  maxLimitPerRole: number;
  status: string;
  openedBy: string;
  openedByName: string;
  openedAt: string;
  notes?: string;
}

interface CustodyTransaction {
  id: string;
  transactionCode: string;
  custodyId: string;
  amount: number;
  expenseCategory: string;
  expenseAccountCode: string;
  description: string;
  receiptNumber: string;
  attachmentUrl: string;
  attachmentName?: string;
  recordedByName: string;
  status: string;
  transactionDate: string;
}

interface CashCustodyWorkspaceProps {
  currentUser: UserProfile;
  onNotification: (msg: string) => void;
}

export const CashCustodyWorkspaceView: React.FC<CashCustodyWorkspaceProps> = ({
  currentUser,
  onNotification,
}) => {
  const [activeTab, setActiveTab] = useState<'custodies' | 'record_expense' | 'settlement' | 'hr_clearance'>('custodies');
  const [custodies, setCustodies] = useState<Custody[]>([]);
  const [selectedCustody, setSelectedCustody] = useState<Custody | null>(null);
  const [transactions, setTransactions] = useState<CustodyTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Form states - Open Custody
  const [isOpenModalVisible, setIsOpenModalVisible] = useState(false);
  const [openForm, setOpenForm] = useState({
    employeeId: '',
    employeeName: '',
    branchName: 'الفرع الرئيسي - الرياض',
    costCenterId: 'cc-ops-01',
    costCenterName: 'مركز تكلفة العمليات',
    allocatedAmount: 10000,
    employeeRole: 'accountant',
    notes: '',
  });

  // Form states - Record Expense
  const [expenseForm, setExpenseForm] = useState({
    custodyId: '',
    amount: 500,
    expenseCategory: 'نثريات وضيافة',
    expenseAccountCode: '5040',
    description: '',
    receiptNumber: '',
    attachmentUrl: '',
    attachmentName: '',
  });

  // Form states - Settlement
  const [settleForm, setSettleForm] = useState({
    custodyId: '',
    replenishmentAccountCode: '1010',
    notes: 'تسوية دورية معتمدة واستعاضة من الخزينة',
  });

  // HR Clearance State
  const [hrEmployeeId, setHrEmployeeId] = useState('');
  const [clearanceResult, setClearanceResult] = useState<any>(null);
  const [isCheckingClearance, setIsCheckingClearance] = useState(false);

  useEffect(() => {
    fetchCustodies();
  }, []);

  useEffect(() => {
    if (selectedCustody) {
      fetchTransactions(selectedCustody.id);
    }
  }, [selectedCustody]);

  const fetchCustodies = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/custody/custodies', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.success) {
        setCustodies(data.data || []);
        if (data.data && data.data.length > 0 && !selectedCustody) {
          setSelectedCustody(data.data[0]);
          setExpenseForm((prev) => ({ ...prev, custodyId: data.data[0].id }));
          setSettleForm((prev) => ({ ...prev, custodyId: data.data[0].id }));
        }
      }
    } catch {
      onNotification('تعذر تحميل قائمة العهد النقدية.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTransactions = async (custodyId: string) => {
    try {
      const res = await fetch(`/api/custody/expenses?custodyId=${custodyId}`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.success) {
        setTransactions(data.data || []);
      }
    } catch {
      // ignore
    }
  };

  const handleOpenCustody = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openForm.employeeName || !openForm.allocatedAmount) {
      onNotification('يرجى تعبئة كافة حقول فتح العهدة الإلزامية.');
      return;
    }

    try {
      const idemKey = `open-cust-${Date.now()}`;
      const res = await fetch('/api/custody/custodies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        credentials: 'include',
        body: JSON.stringify({
          ...openForm,
          allocatedAmount: Number(openForm.allocatedAmount),
          openedByName: currentUser.name,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification('تم فتح وتخصيص العهدة النقدية بنجاح.');
        setIsOpenModalVisible(false);
        fetchCustodies();
      } else {
        onNotification(data.detail || data.title || 'تعذر فتح العهدة');
      }
    } catch {
      onNotification('فشل الاتصال بالخادم أثناء فتح العهدة.');
    }
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.custodyId) {
      onNotification('يرجى اختيار العهدة النقدية أولاً.');
      return;
    }
    if (!expenseForm.receiptNumber.trim()) {
      onNotification('رقم الإيصال / الفاتورة إلزامي لتسجيل المصروف.');
      return;
    }
    if (!expenseForm.attachmentUrl.trim()) {
      onNotification('مرفق إثبات المصروف إلزامي للامتثال الرقابي.');
      return;
    }

    try {
      const idemKey = `rec-exp-${Date.now()}`;
      const res = await fetch('/api/custody/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        credentials: 'include',
        body: JSON.stringify({
          ...expenseForm,
          amount: Number(expenseForm.amount),
          recordedByName: currentUser.name,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification('تم تسجيل المصروف وخصم القيمة من رصيد العهدة بنجاح.');
        setExpenseForm({
          custodyId: expenseForm.custodyId,
          amount: 100,
          expenseCategory: 'نثريات وضيافة',
          expenseAccountCode: '5040',
          description: '',
          receiptNumber: '',
          attachmentUrl: '',
          attachmentName: '',
        });
        fetchCustodies();
        if (selectedCustody) fetchTransactions(selectedCustody.id);
        setActiveTab('custodies');
      } else {
        onNotification(data.detail || data.title || 'تعذر تسجيل المصروف');
      }
    } catch {
      onNotification('فشل الاتصال بالخادم أثناء تسجيل المصروف.');
    }
  };

  const handleSettleCustody = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleForm.custodyId) {
      onNotification('يرجى تحديد العهدة المطلوب تسويتها.');
      return;
    }

    try {
      const idemKey = `settle-${settleForm.custodyId}-${Date.now()}`;
      const res = await fetch('/api/custody/settlements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        credentials: 'include',
        body: JSON.stringify({
          custodyId: settleForm.custodyId,
          replenishmentAccountCode: settleForm.replenishmentAccountCode,
          settledByName: currentUser.name,
          notes: settleForm.notes,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification('تم ترحيل قيد التسوية المحاسبي واستعاضة رصيد العهدة بنجاح.');
        fetchCustodies();
        if (selectedCustody) fetchTransactions(selectedCustody.id);
        setActiveTab('custodies');
      } else {
        onNotification(data.detail || data.title || 'فشل اعتماد التسوية');
      }
    } catch {
      onNotification('فشل الاتصال بالخادم أثناء تسوية العهدة.');
    }
  };

  const handleCheckClearance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hrEmployeeId.trim()) {
      onNotification('يرجى إدخال الرقم الوظيفي للموظف.');
      return;
    }

    setIsCheckingClearance(true);
    try {
      const res = await fetch(`/api/custody/hr-clearance/${encodeURIComponent(hrEmployeeId.trim())}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setClearanceResult(data.data);
      } else {
        onNotification('تعذر التحقق من إخلاء الطرف للموظف.');
      }
    } catch {
      onNotification('فشل الاتصال بالخادم.');
    } finally {
      setIsCheckingClearance(false);
    }
  };

  const handleLiquidateCustody = async (custodyId: string) => {
    try {
      const idemKey = `liq-${custodyId}-${Date.now()}`;
      const res = await fetch(`/api/custody/custodies/${custodyId}/liquidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        credentials: 'include',
        body: JSON.stringify({ liquidatorName: currentUser.name }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification('تم إقفال وتصفية العهدة النقدية نهائياً.');
        fetchCustodies();
        if (hrEmployeeId) {
          const recheck = await fetch(`/api/custody/hr-clearance/${encodeURIComponent(hrEmployeeId.trim())}`, {
            credentials: 'include',
          });
          const recheckData = await recheck.json();
          if (recheckData.success) setClearanceResult(recheckData.data);
        }
      } else {
        onNotification(data.detail || data.title || 'تعذر تصفية العهدة');
      }
    } catch {
      onNotification('فشل الاتصال بالخادم.');
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Module Title Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">إدارة العهد النقدية والمصروفات النثرية</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                تخصيص العهد، تسجيل فواتير الصرف، التسوية الدورية عبر محرك الترحيل، وإخلاء طرف الموارد البشرية.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsOpenModalVisible(true)}
            id="btn-open-custody-modal"
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-2xs flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>فتح عهدة جديدة</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-2xl px-4 pt-2 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('custodies')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'custodies'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>العهد النقدية المفتوحة ({custodies.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('record_expense')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'record_expense'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>تسجيل مصروف من عهدة</span>
        </button>

        <button
          onClick={() => setActiveTab('settlement')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'settlement'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          <span>التسوية الدورية والاستعاضة</span>
        </button>

        <button
          onClick={() => setActiveTab('hr_clearance')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'hr_clearance'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>إخلاء طرف الموارد البشرية</span>
        </button>
      </div>

      {/* Tab 1: Custodies List & Detail */}
      {activeTab === 'custodies' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Custodies Cards */}
          <div className="lg:col-span-1 space-y-3">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">سجلات العهد</h2>
            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
                جاري التحميل...
              </div>
            ) : custodies.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500">
                <Wallet className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-semibold">لا توجد عهد نقدية مسجلة حتى الآن</p>
                <button
                  onClick={() => setIsOpenModalVisible(true)}
                  className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-bold"
                >
                  فتح أول عهدة نقدية
                </button>
              </div>
            ) : (
              custodies.map((c) => {
                const isSelected = selectedCustody?.id === c.id;
                const percentageUsed = Math.round(
                  ((c.allocatedAmount - c.currentBalance) / c.allocatedAmount) * 100
                );
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCustody(c);
                      setExpenseForm((prev) => ({ ...prev, custodyId: c.id }));
                      setSettleForm((prev) => ({ ...prev, custodyId: c.id }));
                    }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white ${
                      isSelected
                        ? 'border-blue-600 ring-2 ring-blue-100 shadow-2xs'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[11px] font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md font-bold">
                          {c.custodyCode}
                        </span>
                        <h3 className="text-xs font-bold text-slate-900 mt-2">{c.employeeName}</h3>
                        <p className="text-[11px] text-slate-500">{c.branchName || 'الفرع الرئيسي'}</p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          c.status === 'OPEN'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {c.status === 'OPEN' ? 'مفتوحة' : 'مقفلة'}
                      </span>
                    </div>

                    {/* Balance metrics */}
                    <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 block">المبلغ المخصص</span>
                        <span className="font-bold text-slate-700">{c.allocatedAmount.toLocaleString()} ر.س</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">الرصيد المتاح</span>
                        <span className="font-bold text-emerald-700">{c.currentBalance.toLocaleString()} ر.س</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, percentageUsed)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Custody Detailed Expenses View */}
          <div className="lg:col-span-2 space-y-4">
            {selectedCustody ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">
                        {selectedCustody.custodyCode} — {selectedCustody.employeeName}
                      </h2>
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                        {selectedCustody.costCenterName || selectedCustody.costCenterId}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      تم الفتح بواسطة: {selectedCustody.openedByName} بتاريخ {selectedCustody.openedAt?.slice(0, 10)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setExpenseForm((prev) => ({ ...prev, custodyId: selectedCustody.id }));
                        setActiveTab('record_expense');
                      }}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold rounded-xl border border-blue-200 transition-colors cursor-pointer"
                    >
                      تسجيل مصروف
                    </button>
                    <button
                      onClick={() => {
                        setSettleForm((prev) => ({ ...prev, custodyId: selectedCustody.id }));
                        setActiveTab('settlement');
                      }}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold rounded-xl border border-emerald-200 transition-colors cursor-pointer"
                    >
                      تسوية واستعاضة
                    </button>
                  </div>
                </div>

                {/* Transactions Table */}
                <div>
                  <h3 className="text-xs font-bold text-slate-900 mb-3">حركات الصرف والفواتير المرفقة</h3>
                  {transactions.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                      لا توجد حركات صرف مسجلة على هذه العهدة حتى الآن.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 border-y border-slate-100">
                            <th className="py-2.5 px-3">رقم الحركة</th>
                            <th className="py-2.5 px-3">التاريخ</th>
                            <th className="py-2.5 px-3">البند والتصنيف</th>
                            <th className="py-2.5 px-3">رقم الإيصال</th>
                            <th className="py-2.5 px-3">المبلغ</th>
                            <th className="py-2.5 px-3">المرفق</th>
                            <th className="py-2.5 px-3">الحالة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {transactions.map((tx) => (
                            <tr key={tx.id} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{tx.transactionCode}</td>
                              <td className="py-2.5 px-3 text-slate-600">{tx.transactionDate?.slice(0, 10)}</td>
                              <td className="py-2.5 px-3">
                                <span className="font-semibold text-slate-800 block">{tx.description}</span>
                                <span className="text-[10px] text-slate-400">{tx.expenseCategory}</span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-700">{tx.receiptNumber}</td>
                              <td className="py-2.5 px-3 font-bold text-slate-900">{tx.amount.toLocaleString()} ر.س</td>
                              <td className="py-2.5 px-3">
                                <a
                                  href={tx.attachmentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>عرض</span>
                                </a>
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    tx.status === 'RECORDED'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                                  }`}
                                >
                                  {tx.status === 'RECORDED' ? 'معلق للتسوية' : 'تمت التسوية'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
                اختر عهدة من القائمة لعرض تفاصيلها وسجل فواتيرها
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Record Expense Form */}
      {activeTab === 'record_expense' && (
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
          <div className="mb-6 pb-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">تسجيل فاتورة صرف من العهدة النقدية</h2>
            <p className="text-xs text-slate-500 mt-1">
              يتطلب إدخال رقم الإيصال ومرفق الإثبات الرسمي ويتم خصم القيمة لحظياً من رصيد العهدة.
            </p>
          </div>

          <form onSubmit={handleRecordExpense} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">العهدة النقدية المستهدفة *</label>
              <select
                value={expenseForm.custodyId}
                onChange={(e) => setExpenseForm({ ...expenseForm, custodyId: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">-- اختر العهدة --</option>
                {custodies
                  .filter((c) => c.status === 'OPEN')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.custodyCode} — {c.employeeName} (المتاح: {c.currentBalance.toLocaleString()} ر.س)
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">مبلغ الفاتورة (ر.س) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 font-mono text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">رقم الفاتورة أو الإيصال الرسمي *</label>
                <input
                  type="text"
                  placeholder="مثال: INV-2026-9810"
                  value={expenseForm.receiptNumber}
                  onChange={(e) => setExpenseForm({ ...expenseForm, receiptNumber: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">بند المصروف *</label>
                <select
                  value={expenseForm.expenseAccountCode}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expenseAccountCode: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="5040">5040 - مصروفات نثريات وضيافة</option>
                  <option value="5010">5010 - مصروفات نقل وانتقالات</option>
                  <option value="5020">5020 - أدوات مكتبية وقرطاسية</option>
                  <option value="5030">5030 - صيانة ونظافة تشغيلية</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">التصنيف التشغيلي</label>
                <input
                  type="text"
                  value={expenseForm.expenseCategory}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expenseCategory: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">بيان ووصف الصرف *</label>
              <textarea
                rows={2}
                placeholder="بيان تفصيلي لغرض المصروف..."
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">رابط أو مستند المرفق (مرفق إثبات الصرف) *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://storage.an-erp.local/proofs/rec-001.pdf"
                  value={expenseForm.attachmentUrl}
                  onChange={(e) =>
                    setExpenseForm({
                      ...expenseForm,
                      attachmentUrl: e.target.value,
                      attachmentName: e.target.value.split('/').pop() || 'مستند_الفاتورة.pdf',
                    })
                  }
                  className="flex-1 p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => {
                    const mockUrl = `https://storage.an-erp.local/proofs/inv-${Date.now().toString().slice(-4)}.pdf`;
                    setExpenseForm({
                      ...expenseForm,
                      attachmentUrl: mockUrl,
                      attachmentName: 'فاتورة_مرفقة_معتمدة.pdf',
                    });
                    onNotification('تم محاكاة إرفاق الفاتورة وتوليد رابط تخزين آمن.');
                  }}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>محاكاة رفع</span>
                </button>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveTab('custodies')}
                className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                id="btn-submit-expense"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-2xs transition-colors cursor-pointer"
              >
                حفظ المصروف وخصم الرصيد
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 3: Periodic Settlement & Replenishment (PostingEngine + SoD) */}
      {activeTab === 'settlement' && (
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
          <div className="mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2 text-emerald-700 mb-1">
              <Shield className="w-5 h-5" />
              <h2 className="text-base font-bold text-slate-900">التسوية الدورية والاستعاضة النقدية</h2>
            </div>
            <p className="text-xs text-slate-500">
              تعتمد المصروفات المعلقة، وتنتج قيداً محاسبياً متوازناً عبر محرك الترحيل، وتعيد رصيد العهدة لمستواه الأصلي.
              تخضع لقاعدة الرقابة الثنائية (منشئ العهدة لا يجوز له اعتماد تسويتها).
            </p>
          </div>

          <form onSubmit={handleSettleCustody} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">العهدة المراد تسويتها *</label>
              <select
                value={settleForm.custodyId}
                onChange={(e) => setSettleForm({ ...settleForm, custodyId: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">-- اختر العهدة --</option>
                {custodies
                  .filter((c) => c.status === 'OPEN')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.custodyCode} — {c.employeeName} (المخصص: {c.allocatedAmount} ر.س | المتاح: {c.currentBalance} ر.س)
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">حساب استعاضة الصرف (مصدر التجديد) *</label>
              <select
                value={settleForm.replenishmentAccountCode}
                onChange={(e) => setSettleForm({ ...settleForm, replenishmentAccountCode: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="1010">1010 - الصندوق والنقدية بالخزينة الرئيسية</option>
                <option value="1020">1020 - الحساب الجاري بالبنك الأهلي السعودي</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">ملاحظات ومحضر التسوية</label>
              <textarea
                rows={2}
                value={settleForm.notes}
                onChange={(e) => setSettleForm({ ...settleForm, notes: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>أثر الترحيل المحاسبي التلقائي:</span>
              </div>
              <p>• طرف مدين: حسابات المصروفات التشغيلية لكل فاتورة تم الصرف عليها.</p>
              <p>• طرف دائن: حساب الخزينة أو البنك بقيمة إجمالي المصروفات لإتمام الاستعاضة.</p>
              <p>• إعادة رصيد العهدة المتاح إلى سقف المبلغ المخصص فوراً.</p>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveTab('custodies')}
                className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                id="btn-submit-settlement"
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-2xs transition-colors cursor-pointer"
              >
                ترحيل قيد التسوية والاستعاضة
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 4: HR Clearance Check */}
      {activeTab === 'hr_clearance' && (
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">فحص إخلاء طرف الموظف للعهد النقدية</h2>
            <p className="text-xs text-slate-500 mt-1">
              قاعدة صارمة: لا يُسمح للموارد البشرية بإنهاء خدمة أي موظف لديه عهدة نقدية مفتوحة دون تصفيتها بالكامل أو تحويل مسؤوليتها.
            </p>
          </div>

          <form onSubmit={handleCheckClearance} className="flex gap-3">
            <input
              type="text"
              placeholder="أدخل الرقم الوظيفي للموظف (مثال: emp-01)"
              value={hrEmployeeId}
              onChange={(e) => setHrEmployeeId(e.target.value)}
              className="flex-1 p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button
              type="submit"
              disabled={isCheckingClearance}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isCheckingClearance ? 'جاري الفحص...' : 'فحص إخلاء الطرف'}
            </button>
          </form>

          {clearanceResult && (
            <div
              className={`p-5 rounded-2xl border ${
                clearanceResult.canTerminate
                  ? 'bg-emerald-50/50 border-emerald-200'
                  : 'bg-rose-50/50 border-rose-200'
              } space-y-4`}
            >
              <div className="flex items-start gap-3">
                {clearanceResult.canTerminate ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <h3
                    className={`text-xs font-bold ${
                      clearanceResult.canTerminate ? 'text-emerald-900' : 'text-rose-900'
                    }`}
                  >
                    {clearanceResult.canTerminate
                      ? 'إخلاء الطرف معتمد: لا توجد عهد نقدية مفتوحة بذمة الموظف'
                      : 'حظر إنهاء الخدمة: توجد عهد نقدية مفتوحة بذمة الموظف'}
                  </h3>
                  <p className="text-[11px] text-slate-600 mt-1">
                    {clearanceResult.reasonAr || 'يمكن استكمال إجراءات إنهاء الخدمة في نظام الموارد البشرية بأمان.'}
                  </p>
                </div>
              </div>

              {!clearanceResult.canTerminate && clearanceResult.openCustodies?.length > 0 && (
                <div className="pt-3 border-t border-rose-100 space-y-2">
                  <h4 className="text-[11px] font-bold text-rose-900">العهد المطلوب تصفيتها أو نقلها:</h4>
                  {clearanceResult.openCustodies.map((c: any) => (
                    <div
                      key={c.id}
                      className="p-3 bg-white rounded-xl border border-rose-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900">{c.custodyCode}</span>
                        <span className="text-slate-400 text-[11px] mr-2">
                          (المخصص: {c.allocatedAmount} ر.س | المتبقي: {c.currentBalance} ر.س)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLiquidateCustody(c.id)}
                        className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                      >
                        تصفية العهدة فوراً
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Open Custody Modal */}
      {isOpenModalVisible && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">فتح وتخصيص عهدة نقدية جديدة</h2>
              <button
                onClick={() => setIsOpenModalVisible(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOpenCustody} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم الموظف المسؤول *</label>
                <input
                  type="text"
                  placeholder="مثال: أحمد محمود العتيبي"
                  value={openForm.employeeName}
                  onChange={(e) =>
                    setOpenForm({
                      ...openForm,
                      employeeName: e.target.value,
                      employeeId: openForm.employeeId || `emp-${Date.now().toString().slice(-4)}`,
                    })
                  }
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الرقم الوظيفي</label>
                  <input
                    type="text"
                    placeholder="emp-01"
                    value={openForm.employeeId}
                    onChange={(e) => setOpenForm({ ...openForm, employeeId: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">دور الموظف (سقف الدور) *</label>
                  <select
                    value={openForm.employeeRole}
                    onChange={(e) => setOpenForm({ ...openForm, employeeRole: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold"
                  >
                    <option value="accountant">محاسب فرع (السقف: 15,000 ر.س)</option>
                    <option value="purchasing_agent">أمين مشتريات (السقف: 25,000 ر.س)</option>
                    <option value="site_supervisor">مشرف موقع (السقف: 35,000 ر.س)</option>
                    <option value="fleet_driver">سائق أسطول (السقف: 5,000 ر.س)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">مبلغ العهدة المخصص (ر.س) *</label>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    value={openForm.allocatedAmount}
                    onChange={(e) => setOpenForm({ ...openForm, allocatedAmount: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 font-mono text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">مركز التكلفة *</label>
                  <select
                    value={openForm.costCenterId}
                    onChange={(e) =>
                      setOpenForm({
                        ...openForm,
                        costCenterId: e.target.value,
                        costCenterName: e.target.value === 'cc-ops-01' ? 'مركز تكلفة العمليات' : 'مركز تكلفة الإدارة',
                      })
                    }
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold"
                  >
                    <option value="cc-ops-01">cc-ops-01 - العمليات والتشغيل</option>
                    <option value="cc-adm-01">cc-adm-01 - الإدارة العامة</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات الفتح</label>
                <input
                  type="text"
                  placeholder="غرض العهدة والفرع..."
                  value={openForm.notes}
                  onChange={(e) => setOpenForm({ ...openForm, notes: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOpenModalVisible(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  id="btn-confirm-open-custody"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-2xs cursor-pointer"
                >
                  تأكيد فتح العهدة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
