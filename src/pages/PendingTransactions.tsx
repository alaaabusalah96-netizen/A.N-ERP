import React, { useState, useEffect } from 'react';
import { CustodyDB } from '../db';
import { useScreenListeners } from '../firebase';
import { translations, Language, Theme, Transaction } from '../types';
import { PaginationToolbar, usePaginatedList } from '../components/PaginationToolbar';
import { 
  Clock, 
  Search, 
  Trash2, 
  Edit, 
  FileCheck, 
  X, 
  Check, 
  Calendar, 
  AlertTriangle,
  Info,
  Printer,
  SlidersHorizontal,
  CheckSquare,
  Square,
  RefreshCw,
  Coins,
  ChevronDown,
  Building2,
  MapPin,
  ListFilter
} from 'lucide-react';
import VoucherModal from '../components/VoucherModal';

interface PendingTransactionsProps {
  language: Language;
  theme: Theme;
  onNavigate: (tab: string) => void;
  onSelectTransactionForSettle?: (tx: Transaction) => void;
}

const localLabels = {
  ar: {
    filtersTitle: 'تصفية وبحث متقدم',
    statusAll: 'كل الحالات (المعلقة والمرفوضة)',
    companyAll: 'كل الشركات',
    stationAll: 'كل المحطات',
    dateFrom: 'من تاريخ',
    dateTo: 'إلى تاريخ',
    amountMin: 'الحد الأدنى للمبلغ',
    amountMax: 'الحد الأقصى للمبلغ',
    clearFilters: 'إعادة تعيين التصفية',
    statsTotalCount: 'عدد الحركات المصفاة',
    statsTotalAmount: 'إجمالي قيمة الحركات المصفاة',
    statsSelectedCount: 'إجمالي المحدد للتسوية',
    statsSelectedAmount: 'إجمالي المبالغ المحددة',
    bulkActionsTitle: 'العمليات الجماعية على الحركات المحددة',
    bulkSettleButton: 'تسوية جماعية بسند موحد',
    bulkVoucherModalTitle: 'تسوية جماعية للمصروفات المحددة',
    bulkVoucherPlaceholder: 'رقم السند المالي الموحد (مثال: CPV-2026-MULTI)',
    bulkVoucherDate: 'تاريخ السند الموحد',
    bulkSettleSuccess: 'تمت التسوية الجماعية بنجاح وإصدار السند رقم ',
    clearSelection: 'إلغاء التحديد',
    bulkSettleBtn: 'تأكيد التسوية الجماعية وإصدار السندات',
    companyLabel: 'الشركة',
    stationLabel: 'المحطة',
    statusFilter: 'الحالة',
    showingAll: 'عرض الكل',
    pendingOnly: 'معلقة فقط',
    rejectedOnly: 'مرفوضة فقط',
    selectAll: 'تحديد الكل',
    toggleFilters: 'تخصيص البحث والتصفية',
    bulkVoucherConfirmMsg: 'سيتم تحويل كافة المصاريف المحددة أعلاه إلى حالة (تحت التسوية) وربطها بنفس رقم السند المالي المدخل.',
  },
  en: {
    filtersTitle: 'Filters & Advanced Search',
    statusAll: 'All Statuses (Pending & Rejected)',
    companyAll: 'All Companies',
    stationAll: 'All Stations',
    dateFrom: 'From Date',
    dateTo: 'To Date',
    amountMin: 'Min Amount',
    amountMax: 'Max Amount',
    clearFilters: 'Reset Filters',
    statsTotalCount: 'Filtered Transactions',
    statsTotalAmount: 'Filtered Value',
    statsSelectedCount: 'Selected Items',
    statsSelectedAmount: 'Selected Value Sum',
    bulkActionsTitle: 'Bulk Actions on Selected Items',
    bulkSettleButton: 'Bulk Settle Selected',
    bulkVoucherModalTitle: 'Bulk Settle Selected Expenses',
    bulkVoucherPlaceholder: 'Unified Voucher No. (e.g. CPV-2026-MULTI)',
    bulkVoucherDate: 'Unified Voucher Date',
    bulkSettleSuccess: 'Bulk settlement succeeded with Voucher No. ',
    clearSelection: 'Clear Selection',
    bulkSettleBtn: 'Confirm Bulk Settlement',
    companyLabel: 'Company',
    stationLabel: 'Station',
    statusFilter: 'Status',
    showingAll: 'All',
    pendingOnly: 'Pending Only',
    rejectedOnly: 'Rejected Only',
    selectAll: 'Select All',
    toggleFilters: 'Advanced Filter & Search Tools',
    bulkVoucherConfirmMsg: 'All selected expenses will be transitioned to "Under Settlement" status and linked with the entered voucher number.',
  }
};

export default function PendingTransactions({ 
  language, 
  theme, 
  onNavigate,
  onSelectTransactionForSettle 
}: PendingTransactionsProps) {
  useScreenListeners(['transactions']);

  const t = translations[language];
  const l = localLabels[language];
  const isRtl = language === 'ar';

  const user = CustodyDB.getActiveUser();

  // Load Companies & Stations for the filters
  const companies = CustodyDB.getCompanies();
  const stations = CustodyDB.getScopedStations();

  // State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Search and Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Rejected'>('All');
  const [companyFilter, setCompanyFilter] = useState<string>('All');
  const [stationFilter, setStationFilter] = useState<string>('All');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [amountMin, setAmountMin] = useState<string>('');
  const [amountMax, setAmountMax] = useState<string>('');

  // Modal / Action states
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [settlingTx, setSettlingTx] = useState<Transaction | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [printingTx, setPrintingTx] = useState<Transaction | null>(null);
  
  // Bulk Settle Modal states
  const [isBulkSettleOpen, setIsBulkSettleOpen] = useState(false);
  const [bulkVoucherNo, setBulkVoucherNo] = useState('');
  const [bulkVoucherDate, setBulkVoucherDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkSettleError, setBulkSettleError] = useState('');

  // Edit fields
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Settle fields
  const [voucherNo, setVoucherNo] = useState('');
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
  const [settleError, setSettleError] = useState('');

  // Toast
  const [toastMessage, setToastMessage] = useState('');

  // Fetch transactions from CustodyDB scoped
  const refreshList = () => {
    const list = CustodyDB.getScopedTransactions().filter(
      t => t.status === 'Pending' || t.status === 'Rejected'
    );
    setTransactions(list);
  };

  useEffect(() => {
    refreshList();

    // Live update when Firebase/Firestore database updates
    window.addEventListener('custody_db_updated', refreshList);
    return () => {
      window.removeEventListener('custody_db_updated', refreshList);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Helper: Reset Filters
  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('All');
    setCompanyFilter('All');
    setStationFilter('All');
    setDateFrom('');
    setDateTo('');
    setAmountMin('');
    setAmountMax('');
  };

  // Delete Transaction Handler
  const handleDelete = async (id: string) => {
    if (!deleteReason.trim()) {
      alert(isRtl ? 'يجب إدخال سبب الحذف الإجباري!' : 'Mandatory deletion reason is required!');
      return;
    }
    const success = await CustodyDB.deleteTransaction(id, deleteReason);
    if (success) {
      showToast(t.successDeleted);
      refreshList();
      setSelectedIds(prev => prev.filter(selId => selId !== id));
      setDeletingId(null);
      setDeleteReason('');
    } else {
      alert(isRtl ? 'عذراً، يحتاج الحذف إلى صلاحيات مدير النظام (Admin)' : 'Unauthorized: Deletion requires Admin permissions.');
      setDeletingId(null);
    }
  };

  // Edit Transaction Click
  const startEdit = (tx: Transaction) => {
    if (tx.status === 'Rejected') {
      alert(isRtl ? 'لا يمكن تعديل حركة مرفوضة نهائياً.' : 'Cannot edit a permanently rejected transaction.');
      return;
    }
    setEditingTx(tx);
    setEditDesc(tx.description);
    setEditAmount(String(tx.amount));
    setEditNotes(tx.notes || '');
  };

  // Save Edits
  const saveEdit = async () => {
    if (!editingTx) return;
    if (editingTx.status === 'Rejected') {
      alert(isRtl ? 'لا يمكن تعديل حركة مرفوضة نهائياً.' : 'Cannot edit a permanently rejected transaction.');
      return;
    }
    const amountNum = parseFloat(editAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert(t.positiveNumber);
      return;
    }

    const res = await CustodyDB.updateTransaction(editingTx.id, {
      description: editDesc,
      amount: amountNum,
      notes: editNotes || undefined
    });

    if (!res.success) {
      alert(res.errors?.join(' \n ') || 'Failed to update transaction');
      return;
    }

    showToast(t.successUpdated);
    setEditingTx(null);
    refreshList();
  };

  // Start Settle Click
  const startSettle = (tx: Transaction) => {
    if (tx.status === 'Rejected') {
      alert(isRtl ? 'لا يمكن اختيار الحركات المرفوضة نهائياً للتسوية' : 'Rejected transactions cannot be selected for settlement');
      return;
    }
    if (onSelectTransactionForSettle) {
      // If we have a custom router workflow, let's navigate there
      onSelectTransactionForSettle(tx);
      onNavigate('voucher');
    } else {
      // fall back to inline modal
      setSettlingTx(tx);
      setVoucherNo(tx.transaction_no);
      setVoucherDate(new Date().toISOString().split('T')[0]);
      setSettleError('');
    }
  };

  // Save Settle (Inline Voucher preparation)
  const saveSettle = async () => {
    if (!settlingTx) return;
    if (settlingTx.status === 'Rejected') {
      alert(isRtl ? 'لا يمكن إعادة تسوية حركة مرفوضة نهائياً.' : 'Cannot settle a permanently rejected transaction.');
      return;
    }
    if (!voucherNo.trim()) {
      setSettleError(t.required);
      return;
    }

    const res = await CustodyDB.updateTransaction(settlingTx.id, {
      status: 'Under Settlement',
      voucher_no: voucherNo.trim(),
      voucher_date: voucherDate
    });

    if (!res.success) {
      setSettleError(res.errors?.join(' \n ') || 'Failed to settle transaction');
      return;
    }

    showToast(t.successSettled);
    setSettlingTx(null);
    refreshList();
  };

  // Bulk Settle Execution
  const handleBulkSettleSubmit = async () => {
    if (!bulkVoucherNo.trim()) {
      setBulkSettleError(t.required);
      return;
    }

    // Filter out any accidentally selected rejected transactions
    const validIds = selectedIds.filter(id => {
      const tx = transactions.find(t => t.id === id);
      return tx && tx.status !== 'Rejected';
    });

    if (validIds.length === 0) {
      alert(isRtl ? 'لا توجد حركات صالحة للتسوية' : 'No valid transactions to settle.');
      return;
    }

    // Update each selected transaction
    let bulkSuccess = true;
    const bulkErrors: string[] = [];
    for (const id of validIds) {
      const res = await CustodyDB.updateTransaction(id, {
        status: 'Under Settlement',
        voucher_no: bulkVoucherNo.trim(),
        voucher_date: bulkVoucherDate
      });
      if (!res.success) {
        bulkSuccess = false;
        if (res.errors) {
          bulkErrors.push(...res.errors);
        }
      }
    }

    if (!bulkSuccess) {
      alert((isRtl ? 'فشل تسوية بعض الحركات:\n' : 'Failed to settle some transactions:\n') + bulkErrors.join('\n'));
      return;
    }

    showToast(`${l.bulkSettleSuccess} "${bulkVoucherNo.trim()}"`);
    setIsBulkSettleOpen(false);
    setBulkVoucherNo('');
    setSelectedIds([]);
    refreshList();
  };

  // Filter and search logic
  const filtered = transactions.filter(tx => {
    // 1. Text Search matches sequence number, description, notes, or amount (as string)
    const matchesSearch = 
      searchTerm.trim() === '' ||
      tx.transaction_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.notes && tx.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
      String(tx.amount).includes(searchTerm);

    // 2. Status Filter
    const matchesStatus = 
      statusFilter === 'All' || 
      tx.status === statusFilter;

    // 3. Company Filter
    const matchesCompany = 
      companyFilter === 'All' || 
      tx.company_id === companyFilter;

    // 4. Station Filter
    const matchesStation = 
      stationFilter === 'All' || 
      tx.station_id === stationFilter;

    // 5. Date Range Filter
    let matchesDate = true;
    if (dateFrom) {
      matchesDate = matchesDate && tx.date >= dateFrom;
    }
    if (dateTo) {
      matchesDate = matchesDate && tx.date <= dateTo;
    }

    // 6. Amount Range Filter
    let matchesAmount = true;
    if (amountMin) {
      const minVal = parseFloat(amountMin);
      if (!isNaN(minVal)) {
        matchesAmount = matchesAmount && tx.amount >= minVal;
      }
    }
    if (amountMax) {
      const maxVal = parseFloat(amountMax);
      if (!isNaN(maxVal)) {
        matchesAmount = matchesAmount && tx.amount <= maxVal;
      }
    }

    return matchesSearch && matchesStatus && matchesCompany && matchesStation && matchesDate && matchesAmount;
  });

  const {
    items: paginatedTransactions,
    totalItems,
    totalPages,
    currentPage,
    pageSize,
    setCurrentPage,
    setPageSize,
  } = usePaginatedList(filtered, 15);

  // Selection toggle handlers
  const handleToggleSelect = (id: string) => {
    const tx = transactions.find(t => t.id === id);
    if (tx?.status === 'Rejected') return;
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    const nonRejectedFilteredIds = filtered.filter(tx => tx.status !== 'Rejected').map(tx => tx.id);
    if (nonRejectedFilteredIds.length === 0) return;

    const allFilteredAreSelected = nonRejectedFilteredIds.every(id => selectedIds.includes(id));
    
    if (allFilteredAreSelected) {
      // Deselect all filtered items
      setSelectedIds(prev => prev.filter(id => !nonRejectedFilteredIds.includes(id)));
    } else {
      // Select all filtered items (merge with existing selections)
      setSelectedIds(prev => {
        const unique = new Set([...prev, ...nonRejectedFilteredIds]);
        return Array.from(unique);
      });
    }
  };

  // Selected totals
  const selectedTransactions = transactions.filter(t => selectedIds.includes(t.id));
  const selectedTotalAmount = selectedTransactions.reduce((sum, tx) => sum + tx.amount, 0);

  // Filtered totals
  const filteredTotalAmount = filtered.reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight md:text-2xl flex items-center gap-2">
            <Clock className="text-amber-500 animate-pulse" />
            <span>{t.pendingTransactions}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isRtl 
              ? 'مصاريف معلقة ومرفوضة بانتظار الاعتماد. تتيح لك التصفية السريعة والتحديد المتعدد لتسوية المصروفات وسندات الصرف بشكل جماعي.' 
              : 'Pending and rejected expenditures awaiting settlement. Features multiple selection and comprehensive advanced filtering.'
            }
          </p>
        </div>
        <button 
          onClick={() => onNavigate('new-expense')}
          className="self-start md:self-auto px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md flex items-center gap-2"
        >
          <span>+</span>
          <span>{isRtl ? 'إضافة مصروف جديد' : 'Add New Expense'}</span>
        </button>
      </div>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs md:text-sm font-bold animate-fade-in flex items-center gap-3 shadow-sm">
          <Check className="text-emerald-500 shrink-0 h-5 w-5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Stats Summary Panel */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Filtered Count */}
        <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'}`}>
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">{l.statsTotalCount}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black text-slate-800 dark:text-slate-100">{filtered.length}</span>
            <span className="text-slate-400 text-xs">/ {transactions.length}</span>
          </div>
        </div>

        {/* Filtered Amount */}
        <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'}`}>
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">{l.statsTotalAmount}</div>
          <div className="text-lg font-black text-slate-800 dark:text-slate-100 font-mono">
            {filteredTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal">EGP</span>
          </div>
        </div>

        {/* Selected Count */}
        <div className={`p-4 rounded-2xl border transition-all duration-300 ${
          selectedIds.length > 0 
            ? 'bg-amber-500/10 border-amber-500/35 ring-1 ring-amber-500/20' 
            : theme === 'dark' ? 'bg-[#1e293b]/50 border-slate-800/80' : 'bg-slate-50/50 border-slate-100'
        }`}>
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">{l.statsSelectedCount}</div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400">
            {selectedIds.length} <span className="text-xs font-normal text-slate-400">{isRtl ? 'حركات' : 'items'}</span>
          </div>
        </div>

        {/* Selected Value Sum */}
        <div className={`p-4 rounded-2xl border transition-all duration-300 ${
          selectedIds.length > 0 
            ? 'bg-emerald-500/10 border-emerald-500/35 ring-1 ring-emerald-500/20' 
            : theme === 'dark' ? 'bg-[#1e293b]/50 border-slate-800/80' : 'bg-slate-50/50 border-slate-100'
        }`}>
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">{l.statsSelectedAmount}</div>
          <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
            {selectedTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-xs font-normal">EGP</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar Container */}
      <div className={`p-5 rounded-2xl border space-y-4 ${
        theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          {/* Text Search Input */}
          <div className="flex-1 relative">
            <Search className={`absolute top-3 text-slate-400 h-4.5 w-4.5 ${isRtl ? 'right-3' : 'left-3'}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t.searchPlaceholder}
              className={`w-full text-xs py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${
                isRtl ? 'pr-10 pl-3' : 'pl-10 pr-3'
              } ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
              }`}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className={`absolute top-2.5 text-slate-400 hover:text-slate-600 ${isRtl ? 'left-3' : 'right-3'}`}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Toggle Filter Button */}
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
              showFilters 
                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600' 
                : theme === 'dark' 
                  ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal size={14} />
            <span>{l.toggleFilters}</span>
            <ChevronDown size={14} className={`transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Expandable Advanced Filters block */}
        {showFilters && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 animate-slide-down">
            {/* Status Filter */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">{l.statusFilter}</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className={`w-full text-xs p-2.5 rounded-xl border focus:outline-none ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <option value="All">{l.statusAll}</option>
                <option value="Pending">{l.pendingOnly}</option>
                <option value="Rejected">{l.rejectedOnly}</option>
              </select>
            </div>

            {/* Company Filter */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">{l.companyLabel}</label>
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className={`w-full text-xs p-2.5 rounded-xl border focus:outline-none ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <option value="All">{l.companyAll}</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Station Filter */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">{l.stationLabel}</label>
              <select
                value={stationFilter}
                onChange={(e) => setStationFilter(e.target.value)}
                className={`w-full text-xs p-2.5 rounded-xl border focus:outline-none ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <option value="All">{l.stationAll}</option>
                {stations.map(s => (
                  <option key={s.id} value={s.id}>{s.station_name} ({s.station_code})</option>
                ))}
              </select>
            </div>

            {/* Date From */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">{l.dateFrom}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={`w-full text-xs p-2 rounded-xl border font-mono focus:outline-none ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
                }`}
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">{l.dateTo}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={`w-full text-xs p-2 rounded-xl border font-mono focus:outline-none ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
                }`}
              />
            </div>

            {/* Amount Min */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">{l.amountMin}</label>
              <input
                type="number"
                placeholder="0.00"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
                className={`w-full text-xs p-2.5 rounded-xl border font-mono focus:outline-none ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
                }`}
              />
            </div>

            {/* Amount Max */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">{l.amountMax}</label>
              <input
                type="number"
                placeholder="99,999.00"
                value={amountMax}
                onChange={(e) => setAmountMax(e.target.value)}
                className={`w-full text-xs p-2.5 rounded-xl border font-mono focus:outline-none ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
                }`}
              />
            </div>

            {/* Clear filters trigger */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleResetFilters}
                className="w-full py-2.5 text-xs font-bold text-rose-500 hover:text-rose-600 bg-rose-500/5 hover:bg-rose-500/10 rounded-xl transition-colors border border-dashed border-rose-500/20"
              >
                {l.clearFilters}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Multi-Select & Bulk Actions Panel */}
      {selectedIds.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in shadow-md">
          <div className="flex items-center gap-3">
            <CheckSquare className="text-amber-500 h-5 w-5 animate-pulse shrink-0" />
            <div>
              <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>{isRtl ? `تم اختيار (${selectedIds.length}) حركة للتسوية` : `(${selectedIds.length}) items selected for settlement`}</span>
                <span className="font-mono bg-amber-500 text-white px-2 py-0.5 rounded text-[10px] font-black">
                  {selectedTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isRtl ? 'يمكنك ربطهم جميعاً برقم مستند وسند صرف واحد دفعة واحدة.' : 'Settle all selected expenses instantly using a unified voucher number.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds([])}
              className={`px-3 py-2 text-xs font-bold rounded-xl border border-transparent hover:bg-slate-100 dark:hover:bg-slate-800 ${
                theme === 'dark' ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              {l.clearSelection}
            </button>
            <button
              onClick={() => {
                const firstTx = transactions.find(t => t.id === selectedIds[0]);
                setBulkVoucherNo(firstTx ? firstTx.transaction_no : '');
                setBulkVoucherDate(new Date().toISOString().split('T')[0]);
                setBulkSettleError('');
                setIsBulkSettleOpen(true);
              }}
              className="px-4 py-2 text-xs font-black rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/10 flex items-center gap-1.5"
            >
              <FileCheck size={14} />
              <span>{l.bulkSettleButton}</span>
            </button>
          </div>
        </div>
      )}

      {/* Transactions Table & List */}
      <div className={`rounded-2xl border overflow-hidden ${
        theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-medium bg-slate-50/50 dark:bg-slate-800/20">
                {/* Checkbox column */}
                <th className="py-3 px-4 w-12 text-center">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    title={l.selectAll}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                  >
                    {filtered.length > 0 && filtered.filter(tx => tx.status !== 'Rejected').length > 0 && filtered.filter(tx => tx.status !== 'Rejected').every(tx => selectedIds.includes(tx.id)) ? (
                      <CheckSquare className="h-4.5 w-4.5 text-amber-500" />
                    ) : (
                      <Square className="h-4.5 w-4.5 text-slate-300 dark:text-slate-600" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4 font-semibold text-slate-500">{t.transactionNo}</th>
                <th className="py-3 px-4 font-semibold text-slate-500">{l.companyLabel} & {l.stationLabel}</th>
                <th className="py-3 px-4 font-semibold text-slate-500">{t.date}</th>
                <th className="py-3 px-4 font-semibold text-slate-500">{t.description}</th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-right">{t.amount}</th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-center">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedTransactions.map((tx) => {
                const isRejected = tx.status === 'Rejected';
                const isSelected = selectedIds.includes(tx.id);

                // Fetch details
                const txCompany = companies.find(c => c.id === tx.company_id);
                const txStation = stations.find(s => s.id === tx.station_id);

                return (
                  <tr 
                    key={tx.id} 
                    className={`transition-all duration-150 ${
                      isSelected 
                        ? 'bg-amber-500/5 dark:bg-amber-500/10 font-bold' 
                        : isRejected 
                          ? 'bg-rose-500/5 hover:bg-rose-500/10' 
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    {/* Checkbox item */}
                    <td className="py-4 px-4 text-center">
                      {!isRejected ? (
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(tx.id)}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-amber-500" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </button>
                      ) : (
                        <div 
                          className="flex items-center justify-center text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-40" 
                          title={isRtl ? 'لا يمكن اختيار الحركات المرفوضة نهائياً للتسوية' : 'Rejected transactions cannot be selected for settlement'}
                        >
                          <Square className="h-4 w-4" />
                        </div>
                      )}
                    </td>

                    {/* Transaction Sequence No */}
                    <td className="py-4 px-4 font-mono font-bold">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${isRejected ? 'bg-rose-500' : 'bg-amber-500'}`} />
                        <span className={isRejected ? 'text-rose-600 dark:text-rose-400 font-extrabold' : 'text-slate-800 dark:text-slate-200'}>{tx.transaction_no || (isRtl ? 'قيد الانتظار' : 'Pending')}</span>
                        {isRejected && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] bg-rose-500 text-white font-black uppercase">
                            {isRtl ? 'مرفوض' : 'Rejected'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Company and Station lookup */}
                    <td className="py-4 px-4 text-slate-500 dark:text-slate-400">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1">
                          <Building2 size={11} className="text-slate-400" />
                          <span>{txCompany?.name || tx.company_id || '---'}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <MapPin size={11} className="text-slate-400" />
                          <span>{txStation?.station_name || tx.station_id || '---'}</span>
                        </span>
                      </div>
                    </td>
                    
                    {/* Date */}
                    <td className="py-4 px-4 font-mono text-slate-500 dark:text-slate-400">{tx.date}</td>
                    
                    {/* Description & internal notes */}
                    <td className="py-4 px-4">
                      <div className="font-medium text-slate-800 dark:text-slate-100 max-w-xs md:max-w-md truncate" title={tx.description}>
                        {tx.description}
                      </div>
                      {tx.notes && (
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-1 font-mono">
                          <Info size={10} className="text-emerald-500 shrink-0" />
                          <span className="truncate max-w-xs">{tx.notes}</span>
                        </div>
                      )}
                    </td>
                    
                    {/* Amount */}
                    <td className="py-4 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-50">
                      {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    
                    {/* Action buttons */}
                    <td className="py-4 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Print/Preview Voucher Button */}
                        <button
                          onClick={() => setPrintingTx(tx)}
                          className="p-1.5 rounded bg-blue-500/10 hover:bg-blue-500 text-blue-600 hover:text-white transition-all font-semibold text-[10px] flex items-center gap-1"
                          title={isRtl ? 'معاينة وطباعة مستند الصرف' : 'Preview & Print Voucher'}
                        >
                          <Printer size={12} />
                          <span>{isRtl ? 'طباعة' : 'Print'}</span>
                        </button>

                        {/* Edit Button */}
                        {!isRejected && (
                          <button
                            onClick={() => startEdit(tx)}
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                            title="Edit"
                          >
                            <Edit size={14} />
                          </button>
                        )}

                        {/* Settle (convert) Button */}
                        {!isRejected && (
                          <button
                            onClick={() => startSettle(tx)}
                            className="p-1.5 rounded bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white transition-all font-semibold text-[10px] flex items-center gap-1"
                            title="Settle Transaction"
                          >
                            <FileCheck size={12} />
                            <span>{isRtl ? 'تسوية' : 'Settle'}</span>
                          </button>
                        )}

                        {/* Delete Button (Restricted) */}
                        <button
                          onClick={() => setDeletingId(tx.id)}
                          className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ListFilter className="h-8 w-8 stroke-1 text-slate-300" />
                      <p className="text-xs">{t.noData}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="p-3 border-t border-slate-100 dark:border-slate-800/40">
            <PaginationToolbar
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              language={language}
              theme={theme}
            />
          </div>
        )}
      </div>

      {/* BULK VOUCHER SETTLEMENT MODAL */}
      {isBulkSettleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-xl animate-fade-in ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex justify-between items-center mb-4 border-b pb-2.5 border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-amber-500 flex items-center gap-2">
                <FileCheck size={16} />
                <span>{l.bulkVoucherModalTitle}</span>
              </h3>
              <button 
                onClick={() => setIsBulkSettleOpen(false)}
                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Selected stats summary box */}
              <div className={`p-4 rounded-xl text-xs space-y-1.5 border ${
                theme === 'dark' ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-100'
              }`}>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">{isRtl ? 'عدد الحركات المشمولة:' : 'Count of Selected:'}</span>
                  <span className="font-extrabold">{selectedIds.length}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200/50 dark:border-slate-700 pt-1.5">
                  <span className="text-slate-400 font-bold">{isRtl ? 'المبلغ الإجمالي للتسوية:' : 'Total Settlement Value:'}</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    {selectedTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP
                  </span>
                </div>
              </div>

              {/* Warning message */}
              <p className="text-[10px] text-slate-400 leading-relaxed border-l-2 border-amber-500 pl-2 mt-1">
                {l.bulkVoucherConfirmMsg}
              </p>

              {/* Bulk Voucher Number input */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">
                  {t.voucherNo} *
                </label>
                <input
                  type="text"
                  placeholder={l.bulkVoucherPlaceholder}
                  value={bulkVoucherNo}
                  onChange={(e) => {
                    setBulkVoucherNo(e.target.value);
                    if (bulkSettleError) setBulkSettleError('');
                  }}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200'
                  } ${bulkSettleError ? 'border-rose-500 ring-1 ring-rose-500/10' : ''}`}
                  required
                />
                {bulkSettleError && <span className="text-rose-500 text-[10px] mt-1 block font-bold">{bulkSettleError}</span>}
              </div>

              {/* Bulk Voucher Date */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">
                  {l.bulkVoucherDate}
                </label>
                <input
                  type="date"
                  value={bulkVoucherDate}
                  onChange={(e) => setBulkVoucherDate(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none font-mono font-bold ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200'
                  }`}
                />
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsBulkSettleOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleBulkSettleSubmit}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-600 text-white shadow-md"
                >
                  {l.bulkSettleBtn}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm p-5 rounded-2xl border shadow-xl ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 text-rose-500 mb-3">
              <AlertTriangle className="h-6 w-6 shrink-0 animate-bounce" />
              <h3 className="font-bold text-base">{isRtl ? 'تأكيد الحذف' : 'Confirm Delete'}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
              {t.confirmDelete}
              {user?.role !== 'Admin' && user?.role !== 'SystemAdmin' && (
                <span className="block text-rose-500 font-bold mt-2">
                  * {isRtl ? 'تنبيه: يتطلب صلاحية أدمن عام أو أدمن الشركة لإتمام الحذف.' : 'Note: Requires System Admin or Company Admin credentials.'}
                </span>
              )}
            </p>
            <div className="mb-4">
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isRtl ? 'سبب الحذف (إجباري) *' : 'Reason for Deletion (Mandatory) *'}
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder={isRtl ? 'أدخل سبب مقنع للحذف...' : 'Enter a valid reason for deletion...'}
                className="w-full p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500 resize-none h-16"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeletingId(null);
                  setDeleteReason('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100 ${theme === 'dark' ? 'hover:bg-slate-800' : ''}`}
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                disabled={!deleteReason.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isRtl ? 'حذف نهائي' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-xl animate-fade-in ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex justify-between items-center mb-4 border-b pb-2 border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm">
                {isRtl ? `تعديل الحركة المعلقة ${editingTx.transaction_no}` : `Edit Pending ${editingTx.transaction_no}`}
              </h3>
              <button 
                onClick={() => setEditingTx(null)}
                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Description */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">{t.description}</label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200'
                  }`}
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">{t.amount}</label>
                <input
                  type="number"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold focus:outline-none ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200'
                  }`}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">{t.notes}</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200'
                  }`}
                />
              </div>

              {/* Action row */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setEditingTx(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={saveEdit}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {isRtl ? 'حفظ التغييرات' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK INLINE SETTLE DIALOG */}
      {settlingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm p-5 rounded-2xl border shadow-xl animate-fade-in ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-sm text-emerald-600">
                {isRtl ? 'تسوية حركة مصروف معلق' : 'Settle Pending Expense'}
              </h3>
              <button 
                onClick={() => setSettlingTx(null)}
                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Loaded description and amount summary card */}
              <div className={`p-3 rounded-lg text-xs space-y-1 ${
                theme === 'dark' ? 'bg-slate-800/80 font-bold' : 'bg-slate-50'
              }`}>
                <div className="font-bold text-slate-500 uppercase text-[10px]">
                  {isRtl ? 'تفاصيل الحركة معلقة' : 'Pending Details'}
                </div>
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  {settlingTx.transaction_no} - {settlingTx.description}
                </div>
                <div className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {settlingTx.amount.toLocaleString()} EGP
                </div>
              </div>

              {/* Voucher Number input */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  {t.voucherNo} *
                </label>
                <input
                  type="text"
                  placeholder="e.g. CPV-2026-098"
                  value={voucherNo}
                  onChange={(e) => setVoucherNo(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200'
                  }`}
                  required
                />
                {settleError && <span className="text-rose-500 text-[10px] mt-0.5 block">{settleError}</span>}
              </div>

              {/* Voucher Date */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  {t.voucherDate}
                </label>
                <input
                  type="date"
                  value={voucherDate}
                  onChange={(e) => setVoucherDate(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none font-mono font-semibold ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200'
                  }`}
                />
              </div>

              {/* Settle Action Button */}
              <button
                onClick={saveSettle}
                className="w-full mt-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md"
              >
                {isRtl ? 'تأكيد وحفظ السند' : 'Confirm Voucher Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Cash Payment Voucher Print Modal */}
      <VoucherModal
        transaction={printingTx}
        isOpen={!!printingTx}
        onClose={() => setPrintingTx(null)}
        theme={theme}
      />
    </div>
  );
}
