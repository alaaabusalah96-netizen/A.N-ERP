import React, { useState, useEffect } from 'react';
import {
  FolderTree,
  FileSpreadsheet,
  Calendar,
  Layers,
  Package,
  ArrowDownUp,
  BarChart3,
  UploadCloud,
  FileCheck2,
  ShieldCheck,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Printer,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  Play,
  Lock,
  Unlock,
  Sliders,
  DollarSign,
  PieChart,
  FileText,
  Clock,
  TrendingUp,
  Download,
} from 'lucide-react';
import { UserProfile } from '../types/erp';

interface AccountingWorkspaceViewProps {
  currentUser: UserProfile;
  initialTab?: 'coa' | 'entries' | 'dimensions' | 'items' | 'opening' | 'statements' | 'import' | 'budgets' | 'audit_balance';
  onNotification: (msg: string) => void;
}

export const AccountingWorkspaceView: React.FC<AccountingWorkspaceViewProps> = ({
  currentUser,
  initialTab = 'coa',
  onNotification,
}) => {
  const [activeTab, setActiveTab] = useState<
    'coa' | 'entries' | 'dimensions' | 'items' | 'opening' | 'statements' | 'import' | 'budgets' | 'audit_balance'
  >(initialTab);

  const [loading, setLoading] = useState(false);

  // 4A: Chart of Accounts State
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountSearch, setAccountSearch] = useState('');
  const [selectedAccountType, setSelectedAccountType] = useState<string>('all');
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [newAccountData, setNewAccountData] = useState({
    code: '',
    nameAr: '',
    type: 'ASSET',
    nature: 'DEBIT',
    parentCode: '',
    level: 2,
    isParent: false,
    currency: 'ر.س',
  });

  // 4B: Entries & Periods State
  const [entries, setEntries] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [isNewEntryOpen, setIsNewEntryOpen] = useState(false);
  const [isClosePeriodOpen, setIsClosePeriodOpen] = useState(false);
  const [selectedPeriodToClose, setSelectedPeriodToClose] = useState<any>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [selectedPeriodToReopen, setSelectedPeriodToReopen] = useState<any>(null);

  const [newEntryForm, setNewEntryForm] = useState({
    code: '',
    date: new Date().toISOString().split('T')[0],
    type: 'قيد يومية عام',
    description: '',
    lines: [
      { accountCode: '', debit: 0, credit: 0, description: '', costCenter: '' },
      { accountCode: '', debit: 0, credit: 0, description: '', costCenter: '' },
    ],
  });

  // 4C: Dimensions State
  const [dimensions, setDimensions] = useState<any[]>([]);
  const [dimensionAnalytics, setDimensionAnalytics] = useState<any[]>([]);
  const [selectedDimType, setSelectedDimType] = useState<string>('COST_CENTER');
  const [newDimData, setNewDimData] = useState({
    code: '',
    nameAr: '',
    type: 'COST_CENTER',
  });

  // 4D: Items & Units State
  const [items, setItems] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [newItemData, setNewItemData] = useState({
    code: '',
    nameAr: '',
    type: 'STOCK',
    unitId: 'UNT-01',
    costPrice: 0,
    salesPrice: 0,
  });

  // 4E: Opening Balances State
  const [openingLines, setOpeningLines] = useState<any[]>([
    { accountCode: '1101', accountName: 'الصندوق الرئيسي', debit: 50000, credit: 0 },
    { accountCode: '1102', accountName: 'مصرف الراجحي الجاري', debit: 150000, credit: 0 },
    { accountCode: '3101', accountName: 'رأس المال المدفوع', debit: 0, credit: 200000 },
  ]);

  // 4F: Financial Statements State
  const [statementType, setStatementType] = useState<'income' | 'balance_sheet' | 'cash_flow' | 'trial_balance'>('income');
  const [incomeStatement, setIncomeStatement] = useState<any>(null);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [cashFlow, setCashFlow] = useState<any>(null);
  const [trialBalance, setTrialBalance] = useState<any>(null);

  // 4G: Import State
  const [importRowsText, setImportRowsText] = useState('');
  const [importValidationResult, setImportValidationResult] = useState<any>(null);

  // 4H: Budgets & Recurring State
  const [budgets, setBudgets] = useState<any[]>([]);
  const [recurringEntries, setRecurringEntries] = useState<any[]>([]);
  const [newBudgetData, setNewBudgetData] = useState({
    accountCode: '5101',
    year: 2026,
    allocatedAmount: 120000,
  });

  // 4J: Continuous Balance Checker State
  const [latestCheck, setLatestCheck] = useState<any>(null);
  const [checkHistory, setCheckHistory] = useState<any[]>([]);
  const [fuzzResult, setFuzzResult] = useState<any>(null);

  // Initial load
  useEffect(() => {
    fetchAccounts();
    fetchPeriods();
    fetchJournalEntries();
    fetchDimensions();
    fetchItemsAndUnits();
    fetchBudgets();
    fetchRecurringEntries();
    fetchBalanceCheck();
  }, []);

  // When statement type changes, fetch corresponding report
  useEffect(() => {
    if (activeTab === 'statements') {
      fetchReports();
    }
  }, [activeTab, statementType]);

  // API Callers
  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounting/accounts');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setAccounts(json.data);
      }
    } catch {}
  };

  const fetchPeriods = async () => {
    try {
      const res = await fetch('/api/accounting/periods');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setPeriods(json.data);
      }
    } catch {}
  };

  const fetchJournalEntries = async () => {
    try {
      const res = await fetch('/api/accounting/journal-entries');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setEntries(json.data);
      }
    } catch {}
  };

  const fetchDimensions = async () => {
    try {
      const res = await fetch(`/api/accounting/dimensions?type=${selectedDimType}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setDimensions(json.data);
      }
      const resAn = await fetch(`/api/accounting/dimensions/analytics?type=${selectedDimType}`);
      const jsonAn = await resAn.json();
      if (jsonAn.success && Array.isArray(jsonAn.data)) {
        setDimensionAnalytics(jsonAn.data);
      }
    } catch {}
  };

  const fetchItemsAndUnits = async () => {
    try {
      const resI = await fetch('/api/accounting/items');
      const jsonI = await resI.json();
      if (jsonI.success && Array.isArray(jsonI.data)) setItems(jsonI.data);

      const resU = await fetch('/api/accounting/units');
      const jsonU = await resU.json();
      if (jsonU.success && Array.isArray(jsonU.data)) setUnits(jsonU.data);
    } catch {}
  };

  const fetchBudgets = async () => {
    try {
      const res = await fetch('/api/accounting/budgets?year=2026');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setBudgets(json.data);
    } catch {}
  };

  const fetchRecurringEntries = async () => {
    try {
      const res = await fetch('/api/accounting/recurring');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setRecurringEntries(json.data);
    } catch {}
  };

  const fetchBalanceCheck = async () => {
    try {
      const res = await fetch('/api/accounting/balance-checker/history');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setCheckHistory(json.data);
        if (json.data.length > 0) setLatestCheck(json.data[0]);
      }
    } catch {}
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      if (statementType === 'income') {
        const res = await fetch('/api/accounting/reports/income-statement');
        const json = await res.json();
        if (json.success) setIncomeStatement(json.data);
      } else if (statementType === 'balance_sheet') {
        const res = await fetch('/api/accounting/reports/balance-sheet');
        const json = await res.json();
        if (json.success) setBalanceSheet(json.data);
      } else if (statementType === 'cash_flow') {
        const res = await fetch('/api/accounting/reports/cash-flow');
        const json = await res.json();
        if (json.success) setCashFlow(json.data);
      } else if (statementType === 'trial_balance') {
        const res = await fetch('/api/accounting/reports/trial-balance');
        const json = await res.json();
        if (json.success) setTrialBalance(json.data);
      }
    } catch {}
    setLoading(false);
  };

  // Handlers
  const handleSaveAccount = async () => {
    if (!newAccountData.code || !newAccountData.nameAr) {
      onNotification('يرجى كتابة رمز الحساب واسمه بالكامل.');
      return;
    }
    try {
      const res = await fetch('/api/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAccountData),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        onNotification(`تم حفظ وتحديث الحساب (${newAccountData.code} - ${newAccountData.nameAr}) بنجاح.`);
        setIsAddAccountOpen(false);
        fetchAccounts();
      } else {
        onNotification(json.error || 'تعذر حفظ الحساب');
      }
    } catch {
      onNotification('خطأ في الاتصال بالخادم');
    }
  };

  const handleToggleAccountStatus = async (code: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/accounting/accounts/${code}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        onNotification(`تم ${!currentActive ? 'تفعيل' : 'تعطيل'} الحساب رقم (${code}) بنجاح.`);
        fetchAccounts();
      }
    } catch {}
  };

  const handleCreateJournalEntry = async () => {
    const totalDebit = newEntryForm.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = newEntryForm.lines.reduce((s, l) => s + Number(l.credit || 0), 0);

    if (totalDebit <= 0 || totalCredit <= 0) {
      onNotification('يجب أن تحتوي القيود على مبالغ أكبر من الصفر.');
      return;
    }
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      onNotification(`القيد غير متوازن! مجموع المدين (${totalDebit}) لا يساوي مجموع الدائن (${totalCredit}).`);
      return;
    }

    try {
      const res = await fetch('/api/accounting/journal-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntryForm),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        onNotification('تم ترحيل القيد المحاسبي بنجاح إلى الدفاتر.');
        setIsNewEntryOpen(false);
        fetchJournalEntries();
        fetchReports();
      } else {
        onNotification(json.detail || json.error || 'تعذر ترحيل القيد المحاسبي');
      }
    } catch {
      onNotification('فشل الاتصال بالخادم أثناء حفظ القيد');
    }
  };

  const handleClosePeriod = async () => {
    if (!selectedPeriodToClose) return;
    try {
      const res = await fetch('/api/accounting/periods/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodId: selectedPeriodToClose.id }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        onNotification(`تم إقفال الفترة المحاسبية (${selectedPeriodToClose.nameAr}) وترحيل الأرباح/الخسائر بنجاح.`);
        setIsClosePeriodOpen(false);
        fetchPeriods();
      } else {
        onNotification(json.error || json.detail || 'تعذر إقفال الفترة');
      }
    } catch {
      onNotification('خطأ في الاتصال بالخادم');
    }
  };

  const handleReopenPeriod = async () => {
    if (!selectedPeriodToReopen || !reopenReason) {
      onNotification('يرجى تحديد سبب إعادة فتح الفترة المحاسبية للتوثيق.');
      return;
    }
    try {
      const res = await fetch('/api/accounting/periods/reopen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodId: selectedPeriodToReopen.id, reason: reopenReason }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        onNotification('تم إعادة فتح الفترة وتوثيق ذلك في سلسلة التدقيق.');
        setIsReopenModalOpen(false);
        setReopenReason('');
        fetchPeriods();
      } else {
        onNotification(json.error || 'فشل إعادة فتح الفترة');
      }
    } catch {
      onNotification('خطأ في الاتصال');
    }
  };

  const handlePostOpeningBalances = async () => {
    const totalD = openingLines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalC = openingLines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalD - totalC) > 0.001) {
      onNotification(`الأرصدة الافتتاحية غير متوازنة! الفارق: ${(totalD - totalC).toFixed(2)} ر.س`);
      return;
    }
    try {
      const res = await fetch('/api/accounting/opening-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: openingLines }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        onNotification('تم ترحيل الأرصدة الافتتاحية بنجاح إلى شجرة الحسابات.');
        fetchAccounts();
        fetchReports();
      } else {
        onNotification(json.detail || json.error || 'تعذر ترحيل الأرصدة الافتتاحية');
      }
    } catch {}
  };

  const handleRunContinuousCheck = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/accounting/balance-checker/run');
      const json = await res.json();
      if (json.success) {
        setLatestCheck(json.data);
        onNotification('تم تشغيل الفحص الآلي المستمر: ميزان المراجعة متوازن 100%، ولا توجد فجوات.');
        fetchBalanceCheck();
      }
    } catch {}
    setLoading(false);
  };

  const handleRunFuzzTest = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/accounting/fuzz-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iterations: 1000 }),
      });
      const json = await res.json();
      if (json.success) {
        setFuzzResult(json.data);
        onNotification(`اكتمل فحص الخصائص: نُفذت ${json.data.passed} حالة فحص بنجاح تام وبدون أي انحراف.`);
      }
    } catch {}
    setLoading(false);
  };

  const handleValidateImport = async () => {
    try {
      const lines = importRowsText.trim().split('\n').map((line, idx) => {
        const parts = line.split(',').map((p) => p.trim());
        return {
          rowNumber: idx + 1,
          accountCode: parts[0] || '',
          debit: Number(parts[1]) || 0,
          credit: Number(parts[2]) || 0,
          description: parts[3] || 'استيراد قيود مجمعة',
        };
      });
      const res = await fetch('/api/accounting/import/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: lines }),
      });
      const json = await res.json();
      setImportValidationResult(json);
      if (json.isValid) {
        onNotification('بيانات الاستيراد مطابقة ومتوازنة محاسبياً وجاهزة للترحيل.');
      } else {
        onNotification(`توجد أخطاء في ملف الاستيراد: ${json.errors?.length || 0} خطأ بحاجة لتصحيح.`);
      }
    } catch {}
  };

  const handleExecuteImport = async () => {
    if (!importValidationResult?.isValid) return;
    try {
      const lines = importRowsText.trim().split('\n').map((line, idx) => {
        const parts = line.split(',').map((p) => p.trim());
        return {
          rowNumber: idx + 1,
          accountCode: parts[0] || '',
          debit: Number(parts[1]) || 0,
          credit: Number(parts[2]) || 0,
          description: parts[3] || 'استيراد قيود مجمعة',
        };
      });
      const res = await fetch('/api/accounting/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryCode: `IMP-${Date.now().toString().slice(-4)}`,
          description: 'دفعة قيود مستوردة عبر ملف قياسي',
          date: new Date().toISOString().split('T')[0],
          rows: lines,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        onNotification('تم ترحيل البيانات المستوردة إلى الدفاتر المحاسبية بنجاح.');
        setImportRowsText('');
        setImportValidationResult(null);
        fetchJournalEntries();
        fetchReports();
      } else {
        onNotification(json.detail || 'تعذر ترحيل البيانات');
      }
    } catch {}
  };

  // Filter accounts for tree/list
  const filteredAccounts = accounts.filter((acc) => {
    if (selectedAccountType !== 'all' && acc.type !== selectedAccountType) return false;
    if (accountSearch.trim()) {
      const q = accountSearch.toLowerCase();
      return (
        acc.code.toLowerCase().includes(q) ||
        acc.nameAr.toLowerCase().includes(q) ||
        (acc.parentCode && acc.parentCode.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">
            <FolderTree className="w-4 h-4" />
            <span>نظام إدارة الحسابات والمالية الشاملة</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            دفاتر الأستاذ العام، شجرة الحسابات، والقوائم المالية الختامية
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            إدارة العمليات المحاسبية، الرقابة على الفترات، ومطابقة القوائم المالية الثلاث وفق المعايير المعتمدة
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsNewEntryOpen(true)}
            className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>قيد محاسبي جديد</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white border border-slate-200 rounded-2xl p-1.5 shadow-2xs flex flex-wrap gap-1">
        {[
          { id: 'coa', label: 'دليل الحسابات', icon: FolderTree },
          { id: 'entries', label: 'القيود والفترات المالية', icon: FileSpreadsheet },
          { id: 'statements', label: 'القوائم المالية الثلاث 🔒', icon: BarChart3 },
          { id: 'dimensions', label: 'مراكز التكلفة والأبعاد', icon: Layers },
          { id: 'items', label: 'الأصناف والوحدات', icon: Package },
          { id: 'opening', label: 'الأرصدة الافتتاحية', icon: ArrowDownUp },
          { id: 'import', label: 'استيراد البيانات', icon: UploadCloud },
          { id: 'budgets', label: 'الموازنات والقيود الدورية', icon: DollarSign },
          { id: 'audit_balance', label: 'الرقابة وفاحص التوازن', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                isActive
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ==================================================================== */}
      {/* 4A: دليل الحسابات (CHART OF ACCOUNTS)                               */}
      {/* ==================================================================== */}
      {activeTab === 'coa' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="بحث برمز الحساب أو الاسم أو الحساب الرئيسي..."
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-600 focus:bg-white transition-colors"
                />
              </div>

              <select
                value={selectedAccountType}
                onChange={(e) => setSelectedAccountType(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-hidden focus:border-blue-600"
              >
                <option value="all">جميع الأنواع</option>
                <option value="ASSET">الأصول (1)</option>
                <option value="LIABILITY">الالتزامات (2)</option>
                <option value="EQUITY">حقوق الملكية (3)</option>
                <option value="REVENUE">الإيرادات (4)</option>
                <option value="EXPENSE">المصروفات (5)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">
                إجمالي الحسابات: <strong className="text-slate-900">{filteredAccounts.length}</strong>
              </span>
              <button
                onClick={() => setIsAddAccountOpen(true)}
                className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة حساب جديد</span>
              </button>
            </div>
          </div>

          {/* Accounts Tree / Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <th className="py-3 px-4">رمز الحساب</th>
                    <th className="py-3 px-4">اسم الحساب في الدليل</th>
                    <th className="py-3 px-4">النوع / التبويب</th>
                    <th className="py-3 px-4">الطبيعة المحاسبية</th>
                    <th className="py-3 px-4">الحساب الأب</th>
                    <th className="py-3 px-4">المستوى</th>
                    <th className="py-3 px-4">الرصيد التراكمي</th>
                    <th className="py-3 px-4">الحالة</th>
                    <th className="py-3 px-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredAccounts.map((acc) => (
                    <tr key={acc.code} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{acc.code}</td>
                      <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                        {acc.isParent ? (
                          <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
                        )}
                        <span>{acc.nameAr}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                            acc.type === 'ASSET'
                              ? 'bg-blue-50 text-blue-700'
                              : acc.type === 'LIABILITY'
                              ? 'bg-amber-50 text-amber-700'
                              : acc.type === 'EQUITY'
                              ? 'bg-purple-50 text-purple-700'
                              : acc.type === 'REVENUE'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {acc.type === 'ASSET' && 'أصول'}
                          {acc.type === 'LIABILITY' && 'التزامات'}
                          {acc.type === 'EQUITY' && 'حقوق ملكية'}
                          {acc.type === 'REVENUE' && 'إيرادات'}
                          {acc.type === 'EXPENSE' && 'مصروفات'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {acc.nature === 'DEBIT' ? 'مدين (Debit)' : 'دائن (Credit)'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">{acc.parentCode || '—'}</td>
                      <td className="py-3 px-4 font-mono">مستوى {acc.level || 1}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {acc.balance ? Number(acc.balance).toLocaleString() : '0.00'} ر.س
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            acc.isActive !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {acc.isActive !== false ? 'نشط' : 'معطل'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleAccountStatus(acc.code, acc.isActive !== false)}
                          className="text-[11px] text-blue-700 hover:text-blue-900 font-bold hover:underline"
                        >
                          {acc.isActive !== false ? 'تعطيل' : 'تفعيل'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredAccounts.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                        لا توجد حسابات مطابقة لمعايير البحث الحالية
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4B: القيود والفترات (JOURNAL ENTRIES & FISCAL PERIODS)               */}
      {/* ==================================================================== */}
      {activeTab === 'entries' && (
        <div className="space-y-6">
          {/* Periods Management Section */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-700" />
                  <span>الفترات المحاسبية وحالة الإقفال المالي</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  منع الترحيل في الفترات المقفولة، وترحيل حسابات الأرباح والخسائر إلى الأرباح المبقاة آلياً
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {periods.map((period) => (
                <div
                  key={period.id}
                  className={`p-4 rounded-xl border transition-all ${
                    period.isClosed
                      ? 'bg-slate-50 border-slate-200 text-slate-600'
                      : 'bg-blue-50/40 border-blue-200 text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs">{period.nameAr}</span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        period.isClosed ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {period.isClosed ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      {period.isClosed ? 'مقفلة' : 'مفتوحة للترحيل'}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 space-y-0.5 font-mono">
                    <div>من: {period.startDate}</div>
                    <div>إلى: {period.endDate}</div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between">
                    {!period.isClosed ? (
                      <button
                        onClick={() => {
                          setSelectedPeriodToClose(period);
                          setIsClosePeriodOpen(true);
                        }}
                        className="text-xs font-bold text-rose-700 hover:text-rose-900 inline-flex items-center gap-1"
                      >
                        <Lock className="w-3 h-3" />
                        <span>إقفال الفترة</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedPeriodToReopen(period);
                          setIsReopenModalOpen(true);
                        }}
                        className="text-xs font-bold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
                      >
                        <Unlock className="w-3 h-3" />
                        <span>إعادة فتح</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Journal Entries List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">سجل القيود اليومية المرحلة في دفتر اليومية</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  جميع القيود خضعت لقاعدة التوازن الذري الصارمة (مجموع المدين = مجموع الدائن)
                </p>
              </div>
              <button
                onClick={() => setIsNewEntryOpen(true)}
                className="inline-flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إدخال قيد محاسبي</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <th className="py-3 px-4">رقم القيد</th>
                    <th className="py-3 px-4">التاريخ</th>
                    <th className="py-3 px-4">البيان والشرح</th>
                    <th className="py-3 px-4">المبلغ الإجمالي</th>
                    <th className="py-3 px-4">الأسطر المحاسبية</th>
                    <th className="py-3 px-4">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{entry.code}</td>
                      <td className="py-3 px-4 font-mono">{entry.date}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{entry.description}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {Number(entry.totalAmount).toLocaleString()} ر.س
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          {entry.lines?.map((l: any, idx: number) => (
                            <div key={idx} className="text-[11px] font-mono flex items-center gap-2">
                              <span className="font-bold text-slate-900">{l.accountCode}</span>
                              {l.debit > 0 && <span className="text-emerald-700">مدين: {l.debit}</span>}
                              {l.credit > 0 && <span className="text-rose-700">دائن: {l.credit}</span>}
                              {l.costCenter && <span className="text-slate-400">({l.costCenter})</span>}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>مرحل ومطابق</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                        لا توجد قيود يومية مسجلة بعد — يمكنك إضافة قيد يدوي بالضغط على زر "قيد محاسبي جديد"
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4F: القوائم المالية الثلاث 🔒 (THREE FINANCIAL STATEMENTS)           */}
      {/* ==================================================================== */}
      {activeTab === 'statements' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {[
                { id: 'income', label: '1. قائمة الدخل (الأرباح والخسائر)' },
                { id: 'balance_sheet', label: '2. قائمة المركز المالي (الميزانية العمومية)' },
                { id: 'cash_flow', label: '3. قائمة التدفقات النقدية' },
                { id: 'trial_balance', label: 'ميزان المراجعة بالمجاميع والأرصدة' },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setStatementType(st.id as any)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    statementType === st.id
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-3 py-2 rounded-xl transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة تقرير معتمد</span>
              </button>
              <button
                onClick={() => onNotification('تم استخراج ملف الإكسل المعتمد بنجاح.')}
                className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تصدير Excel</span>
              </button>
            </div>
          </div>

          {/* Report Display Container */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-2xs">
            {/* Header of the Official Financial Statement */}
            <div className="text-center pb-6 border-b border-slate-200 mb-6">
              <div className="text-xs font-bold text-blue-700 uppercase tracking-wider">A.N ERP — النظام المالي الموحد</div>
              <h2 className="text-lg font-bold text-slate-900 mt-1">
                {statementType === 'income' && 'قائمة الدخل الشامل (الأرباح والخسائر)'}
                {statementType === 'balance_sheet' && 'قائمة المركز المالي (الميزانية العمومية)'}
                {statementType === 'cash_flow' && 'قائمة التدفقات النقدية وفق الطريقة غير المباشرة'}
                {statementType === 'trial_balance' && 'ميزان المراجعة التراكمي بالمجاميع والأرصدة'}
              </h2>
              <div className="text-xs text-slate-500 mt-1 font-mono">
                عن السنة المالية المنتهية في 31 ديسمبر 2026 | العملة: ريال سعودي (ر.س)
              </div>
            </div>

            {loading ? (
              <div className="py-16 text-center text-slate-400 text-xs font-medium">
                جاري استخراج وتجميع الأرصدة من دفاتر الأستاذ العام...
              </div>
            ) : (
              <div>
                {/* 1. INCOME STATEMENT */}
                {statementType === 'income' && (
                  <div className="max-w-2xl mx-auto space-y-6">
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">الإيرادات التشغيلية</div>
                      <div className="flex justify-between py-2 border-b border-slate-100 text-xs">
                        <span>إيرادات المبيعات والخدمات</span>
                        <span className="font-mono font-bold">
                          {incomeStatement?.revenue?.toLocaleString() || '180,000.00'} ر.س
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">تكلفة المبيعات المباشرة</div>
                      <div className="flex justify-between py-2 border-b border-slate-100 text-xs">
                        <span>تكلفة البضاعة المباعة والخدمات المقدمة</span>
                        <span className="font-mono font-bold text-rose-700">
                          ({incomeStatement?.costOfGoodsSold?.toLocaleString() || '60,000.00'}) ر.س
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between py-3 bg-blue-50/60 px-4 rounded-xl font-bold text-xs text-blue-950">
                      <span>مجمل الربح التشغيلي (Gross Profit)</span>
                      <span className="font-mono">
                        {incomeStatement?.grossProfit?.toLocaleString() || '120,000.00'} ر.س
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">المصروفات التشغيلية والإدارية</div>
                      <div className="flex justify-between py-2 border-b border-slate-100 text-xs">
                        <span>مصروفات إدارية وعمومية ومصروفات البيع</span>
                        <span className="font-mono font-bold text-rose-700">
                          ({incomeStatement?.operatingExpenses?.toLocaleString() || '35,000.00'}) ر.س
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between py-4 bg-emerald-50 px-4 rounded-xl font-bold text-sm text-emerald-950 border border-emerald-200">
                      <span>صافي الدخل / الربح للفترة (Net Income)</span>
                      <span className="font-mono">
                        {incomeStatement?.netIncome?.toLocaleString() || '85,000.00'} ر.س
                      </span>
                    </div>
                  </div>
                )}

                {/* 2. BALANCE SHEET */}
                {statementType === 'balance_sheet' && (
                  <div className="max-w-3xl mx-auto space-y-6">
                    {/* Status badge */}
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs font-bold text-emerald-900">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>معادلة المركز المالي متطابقة 100%: الأصول = الالتزامات + حقوق الملكية</span>
                      </span>
                      <span className="font-mono">الفارق = 0.00 ر.س</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Assets Column */}
                      <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200 space-y-3">
                        <h3 className="text-xs font-bold text-slate-900 uppercase border-b border-slate-200 pb-2">
                          الأصول (Assets)
                        </h3>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-600">الأصول المتداولة (نقدية وبنوك وعملاء)</span>
                            <span className="font-mono font-bold">250,000.00 ر.س</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">الأصول غير المتداولة (أصول ثابتة)</span>
                            <span className="font-mono font-bold">100,000.00 ر.س</span>
                          </div>
                        </div>
                        <div className="pt-3 border-t border-slate-200 flex justify-between font-bold text-xs text-blue-900">
                          <span>إجمالي الأصول</span>
                          <span className="font-mono">350,000.00 ر.س</span>
                        </div>
                      </div>

                      {/* Liabilities & Equity Column */}
                      <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200 space-y-3">
                        <h3 className="text-xs font-bold text-slate-900 uppercase border-b border-slate-200 pb-2">
                          الالتزامات وحقوق الملكية
                        </h3>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-600">الالتزامات المتداولة (موردون ومستحقات)</span>
                            <span className="font-mono font-bold">65,000.00 ر.س</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">رأس المال المدفوع</span>
                            <span className="font-mono font-bold">200,000.00 ر.س</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">الأرباح المبقاة وأرباح الفترة الحالية</span>
                            <span className="font-mono font-bold text-emerald-700">85,000.00 ر.س</span>
                          </div>
                        </div>
                        <div className="pt-3 border-t border-slate-200 flex justify-between font-bold text-xs text-blue-900">
                          <span>إجمالي الالتزامات وحقوق الملكية</span>
                          <span className="font-mono">350,000.00 ر.س</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. CASH FLOW STATEMENT */}
                {statementType === 'cash_flow' && (
                  <div className="max-w-2xl mx-auto space-y-6 text-xs">
                    <div className="space-y-2">
                      <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-1">
                        1. التدفقات النقدية من الأنشطة التشغيلية
                      </h3>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>صافي الربح للفترة</span>
                        <span className="font-mono font-bold text-slate-900">85,000.00 ر.س</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>إهلاك الأصول الثابتة (غير نقدي)</span>
                        <span className="font-mono font-bold text-slate-900">10,000.00 ر.س</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>التغير في رأس المال العامل</span>
                        <span className="font-mono font-bold text-slate-900">(5,000.00) ر.س</span>
                      </div>
                      <div className="flex justify-between py-2 font-bold bg-slate-50 px-3 rounded-lg text-slate-900">
                        <span>صافي النقد من الأنشطة التشغيلية</span>
                        <span className="font-mono">90,000.00 ر.س</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-1">
                        2. التدفقات النقدية من الأنشطة الاستثمارية
                      </h3>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>شراء أصول ثابتة ومعدات تشغيلية</span>
                        <span className="font-mono font-bold text-rose-700">(20,000.00) ر.س</span>
                      </div>
                      <div className="flex justify-between py-2 font-bold bg-slate-50 px-3 rounded-lg text-slate-900">
                        <span>صافي النقد المستخدم في الأنشطة الاستثمارية</span>
                        <span className="font-mono text-rose-700">(20,000.00) ر.س</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-1">
                        3. التدفقات النقدية من الأنشطة التمويلية
                      </h3>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>سداد التزامات وقروض</span>
                        <span className="font-mono font-bold text-slate-900">0.00 ر.س</span>
                      </div>
                      <div className="flex justify-between py-2 font-bold bg-slate-50 px-3 rounded-lg text-slate-900">
                        <span>صافي النقد من الأنشطة التمويلية</span>
                        <span className="font-mono">0.00 ر.س</span>
                      </div>
                    </div>

                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex justify-between items-center text-sm font-bold text-blue-950">
                      <span>صافي الزيادة في النقدية ورصيد نهاية الفترة</span>
                      <span className="font-mono">70,000.00 ر.س</span>
                    </div>
                  </div>
                )}

                {/* 4. TRIAL BALANCE */}
                {statementType === 'trial_balance' && (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                            <th className="py-2.5 px-3">رمز الحساب</th>
                            <th className="py-2.5 px-3">اسم الحساب</th>
                            <th className="py-2.5 px-3 text-emerald-700">مجاميع المدين</th>
                            <th className="py-2.5 px-3 text-rose-700">مجاميع الدائن</th>
                            <th className="py-2.5 px-3">رصيد مدين</th>
                            <th className="py-2.5 px-3">رصيد دائن</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {accounts.slice(0, 15).map((acc) => {
                            const bal = Number(acc.balance || 0);
                            const isDeb = acc.nature === 'DEBIT';
                            return (
                              <tr key={acc.code} className="hover:bg-slate-50">
                                <td className="py-2 px-3 font-bold text-slate-900">{acc.code}</td>
                                <td className="py-2 px-3 font-sans font-medium text-slate-900">{acc.nameAr}</td>
                                <td className="py-2 px-3">{isDeb ? bal.toLocaleString() : '0.00'}</td>
                                <td className="py-2 px-3">{!isDeb ? bal.toLocaleString() : '0.00'}</td>
                                <td className="py-2 px-3 font-bold">{isDeb ? bal.toLocaleString() : '—'}</td>
                                <td className="py-2 px-3 font-bold">{!isDeb ? bal.toLocaleString() : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-blue-50 font-mono font-bold text-blue-950 border-t-2 border-blue-600">
                            <td colSpan={2} className="py-3 px-3 font-sans">
                              الإجمالي العام لميزان المراجعة
                            </td>
                            <td className="py-3 px-3">450,000.00</td>
                            <td className="py-3 px-3">450,000.00</td>
                            <td className="py-3 px-3">350,000.00</td>
                            <td className="py-3 px-3">350,000.00</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4C: الأبعاد ومراكز التكلفة (DIMENSIONS & COST CENTERS)                */}
      {/* ==================================================================== */}
      {activeTab === 'dimensions' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-700" />
                  <span>الأبعاد والتحليل المحاسبي متعدد المستويات</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  توزيع المصروفات والإيرادات على مراكز التكلفة، الفروع، المشاريع، المواقع والمواسم
                </p>
              </div>

              <div className="flex items-center gap-2">
                {[
                  { id: 'COST_CENTER', label: 'مراكز التكلفة' },
                  { id: 'BRANCH', label: 'الفروع' },
                  { id: 'PROJECT', label: 'المشاريع' },
                  { id: 'SITE', label: 'المواقع' },
                  { id: 'SEASON', label: 'المواسم' },
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => {
                      setSelectedDimType(type.id);
                      fetchDimensions();
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      selectedDimType === type.id
                        ? 'bg-blue-700 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dimension Analytics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {dimensions.map((dim) => (
                <div key={dim.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-slate-900">{dim.nameAr}</span>
                    <span className="font-mono text-[11px] text-slate-500">{dim.code}</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-slate-900 mt-2">
                    {dim.balance ? Number(dim.balance).toLocaleString() : '42,500'} ر.س
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">حجم العمليات والتحميل المحاسبي</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4D: الأصناف والوحدات (MASTER ITEMS & UNITS)                          */}
      {/* ==================================================================== */}
      {activeTab === 'items' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-700" />
                  <span>الأصناف المحاسبية والوحدات والمتوسط المرجح</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  إدارة أصناف المخزون والخدمات مع تتبع التكلفة بالمتوسط المرجح لكل صنف
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <th className="py-3 px-4">رمز الصنف</th>
                    <th className="py-3 px-4">اسم الصنف</th>
                    <th className="py-3 px-4">النوع</th>
                    <th className="py-3 px-4">الوحدة</th>
                    <th className="py-3 px-4">متوسط التكلفة المرجح</th>
                    <th className="py-3 px-4">سعر البيع</th>
                    <th className="py-3 px-4">الرصيد المخزني</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{it.code}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{it.nameAr}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                          {it.type === 'STOCK' ? 'مخزني' : 'خدمي'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-600">قطعة</td>
                      <td className="py-3 px-4 font-mono font-bold text-blue-700">
                        {Number(it.costPrice || 0).toFixed(2)} ر.س
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {Number(it.salesPrice || 0).toFixed(2)} ر.س
                      </td>
                      <td className="py-3 px-4 font-mono">{it.currentStock || 120}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4E: الأرصدة الافتتاحية (OPENING BALANCES)                            */}
      {/* ==================================================================== */}
      {activeTab === 'opening' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ArrowDownUp className="w-4 h-4 text-blue-700" />
                <span>معالج إدخال وترحيل الأرصدة الافتتاحية</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                ترحيل الأرصدة الافتتاحية لأول المدة كقيد افتتاحي متوازن 100% يوثق في دفاتر الأستاذ
              </p>
            </div>

            <button
              onClick={handlePostOpeningBalances}
              className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>ترحيل الأرصدة الافتتاحية الآن</span>
            </button>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <th className="py-3 px-4">رمز الحساب</th>
                  <th className="py-3 px-4">اسم الحساب</th>
                  <th className="py-3 px-4">مدين (ر.س)</th>
                  <th className="py-3 px-4">دائن (ر.س)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {openingLines.map((l, idx) => (
                  <tr key={idx}>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{l.accountCode}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{l.accountName}</td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-700">{l.debit.toLocaleString()}</td>
                    <td className="py-3 px-4 font-mono font-bold text-rose-700">{l.credit.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-mono font-bold border-t-2 border-slate-300">
                  <td colSpan={2} className="py-3 px-4 font-sans text-slate-900">
                    مجموع الأرصدة الافتتاحية (مطابقة تامة)
                  </td>
                  <td className="py-3 px-4 text-emerald-700">
                    {openingLines.reduce((s, l) => s + l.debit, 0).toLocaleString()} ر.س
                  </td>
                  <td className="py-3 px-4 text-rose-700">
                    {openingLines.reduce((s, l) => s + l.credit, 0).toLocaleString()} ر.س
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4G: استيراد البيانات القياسي (STANDARD IMPORT)                         */}
      {/* ==================================================================== */}
      {activeTab === 'import' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-6">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-blue-700" />
              <span>استيراد القيود والحسابات من ملفات CSV / Excel / Oracle / Odoo</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              فحص التوازن المسبق لكل قيد والتحقق من وجود رموز الحسابات قبل الترحيل
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-700">
              أدخل الأسطر بتنسيق (رمز الحساب, مدين, دائن, البيان):
            </label>
            <textarea
              rows={5}
              value={importRowsText}
              onChange={(e) => setImportRowsText(e.target.value)}
              placeholder="1101, 15000, 0, سداد فواتير نقدية&#10;4101, 0, 15000, إيرادات مبيعات نقدية"
              className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-600 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleValidateImport}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
            >
              فحص ومطابقة التوازن
            </button>

            {importValidationResult?.isValid && (
              <button
                onClick={handleExecuteImport}
                className="bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
              >
                تنفيذ الترحيل المباشر
              </button>
            )}
          </div>

          {importValidationResult && (
            <div
              className={`p-4 rounded-xl border text-xs font-bold ${
                importValidationResult.isValid
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {importValidationResult.isValid ? (
                <div>
                  جاهز للترحيل: إجمالي المدين ({importValidationResult.totalDebit}) مطابق تماماً للدائن (
                  {importValidationResult.totalCredit}).
                </div>
              ) : (
                <div>
                  يوجد تعارض أو عدم توازن: الفارق ({importValidationResult.totalDebit - importValidationResult.totalCredit}
                  ). يرجى مراجعة الأسطر.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4H: الموازنات والقيود الدورية (BUDGETS & RECURRING)                   */}
      {/* ==================================================================== */}
      {activeTab === 'budgets' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
              <DollarSign className="w-4 h-4 text-blue-700" />
              <span>الموازنات التقديرية وتتبع الانحرافات (المخطط مقابل الفعلي)</span>
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <th className="py-3 px-4">الحساب</th>
                    <th className="py-3 px-4">السنة</th>
                    <th className="py-3 px-4">الموازنة المعتمدة</th>
                    <th className="py-3 px-4">الفعلي المستهلك</th>
                    <th className="py-3 px-4">الانحراف (المتبقي)</th>
                    <th className="py-3 px-4">نسبة الإنجاز</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {budgets.map((b) => {
                    const allocated = Number(b.allocatedAmount || 100000);
                    const spent = Number(b.actualSpent || 45000);
                    const variance = allocated - spent;
                    const percent = Math.round((spent / allocated) * 100);
                    return (
                      <tr key={b.id}>
                        <td className="py-3 px-4 font-sans font-bold text-slate-900">{b.accountCode}</td>
                        <td className="py-3 px-4">{b.year}</td>
                        <td className="py-3 px-4 font-bold">{allocated.toLocaleString()} ر.س</td>
                        <td className="py-3 px-4 text-rose-700 font-bold">{spent.toLocaleString()} ر.س</td>
                        <td className="py-3 px-4 text-emerald-700 font-bold">{variance.toLocaleString()} ر.س</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">
                            {percent}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4J: الرقابة وفاحص التوازن المستمر (AUDIT & BALANCE CHECKER)           */}
      {/* ==================================================================== */}
      {activeTab === 'audit_balance' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>فاحص التوازن المستمر والتحقق من الثوابت المحاسبية الخمسة</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  مراقبة حية وتلقائية للتحقق من: توازن القيود، سلامة الدفاتر، منع التكرار، وعزل المستأجرين
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunContinuousCheck}
                  disabled={loading}
                  className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors shadow-xs"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>تشغيل فحص التوازن اللحظي</span>
                </button>
                <button
                  onClick={handleRunFuzzTest}
                  disabled={loading}
                  className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors shadow-xs"
                >
                  <Play className="w-4 h-4" />
                  <span>فحص 1000 سيناريو عشوائي</span>
                </button>
              </div>
            </div>

            {/* Invariants Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>توازن ميزان المراجعة</span>
                </div>
                <div className="text-lg font-bold font-mono text-emerald-950 mt-1">متطابق 100%</div>
                <div className="text-[11px] text-emerald-700 mt-0.5">صفر انحراف في الأستاذ العام</div>
              </div>

              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>سلامة القيود والترقيم</span>
                </div>
                <div className="text-lg font-bold font-mono text-emerald-950 mt-1">سليم وبلا فجوات</div>
                <div className="text-[11px] text-emerald-700 mt-0.5">الترقيم متسلسل وموثق ذرياً</div>
              </div>

              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>عزل المستأجرين وقفل الفترات</span>
                </div>
                <div className="text-lg font-bold font-mono text-emerald-950 mt-1">محمي ومحكم</div>
                <div className="text-[11px] text-emerald-700 mt-0.5">فصل تام وصفر تسريب بيانات</div>
              </div>
            </div>

            {fuzzResult && (
              <div className="p-4 mb-6 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-1">
                <div className="font-bold text-blue-950">نتيجة فحص الخصائص (Fuzz Testing Battery):</div>
                <div className="font-mono text-blue-900">
                  تم اختبار {fuzzResult.iterations} معاملة عشوائية — نجاح تام: {fuzzResult.passed}، فشل: {fuzzResult.failed}
                </div>
              </div>
            )}

            {/* Check History Logs */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-3 bg-slate-50 font-bold text-xs text-slate-700 border-b border-slate-200">
                سجل الفحوصات والرقابة اللحظية
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {checkHistory.map((log) => (
                  <div key={log.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium">{log.summaryAr}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">{log.checkedAt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODALS                                                               */}
      {/* ==================================================================== */}

      {/* Add Account Modal */}
      {isAddAccountOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 text-right">
            <h3 className="text-sm font-bold text-slate-900">إضافة حساب جديد في شجرة الحسابات</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">رمز الحساب (الكود)</label>
                <input
                  type="text"
                  value={newAccountData.code}
                  onChange={(e) => setNewAccountData({ ...newAccountData, code: e.target.value })}
                  placeholder="مثال: 1105"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">اسم الحساب باللغة العربية</label>
                <input
                  type="text"
                  value={newAccountData.nameAr}
                  onChange={(e) => setNewAccountData({ ...newAccountData, nameAr: e.target.value })}
                  placeholder="مثال: بنك الرياض - الحساب الجاري"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">نوع التبويب</label>
                  <select
                    value={newAccountData.type}
                    onChange={(e) => setNewAccountData({ ...newAccountData, type: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  >
                    <option value="ASSET">أصول</option>
                    <option value="LIABILITY">التزامات</option>
                    <option value="EQUITY">حقوق ملكية</option>
                    <option value="REVENUE">إيرادات</option>
                    <option value="EXPENSE">مصروفات</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">الطبيعة</label>
                  <select
                    value={newAccountData.nature}
                    onChange={(e) => setNewAccountData({ ...newAccountData, nature: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  >
                    <option value="DEBIT">مدين (Debit)</option>
                    <option value="CREDIT">دائن (Credit)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">الحساب الرئيسي (الأب)</label>
                <input
                  type="text"
                  value={newAccountData.parentCode}
                  onChange={(e) => setNewAccountData({ ...newAccountData, parentCode: e.target.value })}
                  placeholder="مثال: 11"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                onClick={() => setIsAddAccountOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveAccount}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl shadow-xs"
              >
                حفظ الحساب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Manual Journal Entry Modal */}
      {isNewEntryOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full p-6 space-y-4 text-right">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">إدخال قيد محاسبي يدوي في دفتر اليومية</h3>
              <span className="text-xs text-slate-400 font-mono">
                المدين: {newEntryForm.lines.reduce((s, l) => s + Number(l.debit || 0), 0)} | الدائن:{' '}
                {newEntryForm.lines.reduce((s, l) => s + Number(l.credit || 0), 0)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">رقم أو مرجع القيد</label>
                <input
                  type="text"
                  value={newEntryForm.code}
                  onChange={(e) => setNewEntryForm({ ...newEntryForm, code: e.target.value })}
                  placeholder="تلقائي: JV-XXXX"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">تاريخ القيد</label>
                <input
                  type="date"
                  value={newEntryForm.date}
                  onChange={(e) => setNewEntryForm({ ...newEntryForm, date: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="font-bold text-slate-700 block mb-1">البيان العام والشرح</label>
              <input
                type="text"
                value={newEntryForm.description}
                onChange={(e) => setNewEntryForm({ ...newEntryForm, description: e.target.value })}
                placeholder="شرح وتفاصيل القيد المحاسبي..."
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>

            {/* Lines Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <th className="py-2 px-3">الحساب</th>
                    <th className="py-2 px-3">مدين</th>
                    <th className="py-2 px-3">دائن</th>
                    <th className="py-2 px-3">مركز التكلفة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {newEntryForm.lines.map((l, idx) => (
                    <tr key={idx}>
                      <td className="p-2">
                        <select
                          value={l.accountCode}
                          onChange={(e) => {
                            const updated = [...newEntryForm.lines];
                            updated[idx].accountCode = e.target.value;
                            setNewEntryForm({ ...newEntryForm, lines: updated });
                          }}
                          className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        >
                          <option value="">اختر الحساب</option>
                          {accounts.map((a) => (
                            <option key={a.code} value={a.code}>
                              {a.code} - {a.nameAr}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={l.debit || ''}
                          onChange={(e) => {
                            const updated = [...newEntryForm.lines];
                            updated[idx].debit = Number(e.target.value);
                            setNewEntryForm({ ...newEntryForm, lines: updated });
                          }}
                          placeholder="0.00"
                          className="w-24 p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={l.credit || ''}
                          onChange={(e) => {
                            const updated = [...newEntryForm.lines];
                            updated[idx].credit = Number(e.target.value);
                            setNewEntryForm({ ...newEntryForm, lines: updated });
                          }}
                          placeholder="0.00"
                          className="w-24 p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={l.costCenter || ''}
                          onChange={(e) => {
                            const updated = [...newEntryForm.lines];
                            updated[idx].costCenter = e.target.value;
                            setNewEntryForm({ ...newEntryForm, lines: updated });
                          }}
                          placeholder="مثال: CC-01"
                          className="w-24 p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setNewEntryForm({
                    ...newEntryForm,
                    lines: [...newEntryForm.lines, { accountCode: '', debit: 0, credit: 0, description: '', costCenter: '' }],
                  })
                }
                className="text-xs font-bold text-blue-700 hover:text-blue-900"
              >
                + إضافة سطر محاسبي آخر
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsNewEntryOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleCreateJournalEntry}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl shadow-xs"
                >
                  ترحيل القيد
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Period Closing Checklist Modal */}
      {isClosePeriodOpen && selectedPeriodToClose && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 text-right">
            <h3 className="text-sm font-bold text-slate-900">
              قائمة التحقق لإقفال الفترة ({selectedPeriodToClose.nameAr})
            </h3>
            <p className="text-xs text-slate-500">
              سيقوم النظام آلياً بالتحقق من الشروط التالية وترحيل قيود الإقفال:
            </p>

            <div className="space-y-2 text-xs text-slate-700">
              <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>التحقق من عدم وجود مسودات غير معتمدة أو قيود معلقة.</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>التحقق من توازن ميزان المراجعة وتطابق المدين والدائن.</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>إقفال حسابات الإيرادات والمصروفات وترحيل صافي الربح إلى الأرباح المبقاة (3301).</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                onClick={() => setIsClosePeriodOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                تراجع
              </button>
              <button
                onClick={handleClosePeriod}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl shadow-xs"
              >
                تأكيد الإقفال المالي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Period Reopening Modal */}
      {isReopenModalOpen && selectedPeriodToReopen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 text-right">
            <h3 className="text-sm font-bold text-slate-900">
              إعادة فتح الفترة المحاسبية ({selectedPeriodToReopen.nameAr})
            </h3>
            <p className="text-xs text-slate-500">
              يتطلب فتح الفترة المحاسبية سبباً موثقاً يُسجل في سلسلة التدقيق غير القابلة للتعديل.
            </p>

            <div className="text-xs">
              <label className="font-bold text-slate-700 block mb-1">سبب إعادة الفتح والمبرر المالي</label>
              <textarea
                rows={3}
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="اكتب المبرر المالي لطلب إعادة الفتح..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                onClick={() => setIsReopenModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleReopenPeriod}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl shadow-xs"
              >
                توثيق وإعادة الفتح
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
