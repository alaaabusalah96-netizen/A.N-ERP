import React, { useState, useEffect, useMemo } from 'react';
import { 
  Coins, 
  Search, 
  Filter, 
  ArrowUpRight, 
  ArrowDownRight, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Plus, 
  RotateCcw, 
  Scale, 
  Building2, 
  Wallet, 
  ArrowRightLeft,
  Calendar,
  User as UserIcon,
  Printer,
  Download,
  BarChart3
} from 'lucide-react';
import { CustodyDB, CustodyEngine } from '../db';
import { AppUser, Station, CustodyMovement, CustodyBalances, Region } from '../types';

interface CustodyProps {
  language: 'ar' | 'en';
  theme: 'light' | 'dark';
  onNavigate?: (tab: string) => void;
}

type TabType = 'balances' | 'replenish' | 'count_adjust' | 'movements' | 'reports';

export default function CustodyPage({ language, theme, onNavigate }: CustodyProps) {
  const isRtl = language === 'ar';
  const activeUser = CustodyDB.getActiveUser();

  const [activeTab, setActiveTab] = useState<TabType>('balances');
  const [stations, setStations] = useState<Station[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [movements, setMovements] = useState<CustodyMovement[]>([]);

  // Reports Tab State
  const [reportFrom, setReportFrom] = useState<string>(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  });
  const [reportTo, setReportTo] = useState<string>(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
  const [reportStationId, setReportStationId] = useState<string>('all');
  const [reportRegionId, setReportRegionId] = useState<string>('all');
  const [reportTypeFilter, setReportTypeFilter] = useState<string>('all');

  // Replenish Form State
  const [replenishTargetId, setReplenishTargetId] = useState<string>('');
  const [replenishAmount, setReplenishAmount] = useState<string>('');
  const [replenishRef, setReplenishRef] = useState<string>('');
  const [replenishNotes, setReplenishNotes] = useState<string>('');
  const [isSubmittingReplenish, setIsSubmittingReplenish] = useState(false);

  // Count / Audit Form State
  const [countStationId, setCountStationId] = useState<string>('');
  const [physicalCount, setPhysicalCount] = useState<string>('');
  const [countNotes, setCountNotes] = useState<string>('');
  const [isSubmittingCount, setIsSubmittingCount] = useState(false);

  // Reversal Modal State
  const [reversingMovement, setReversingMovement] = useState<CustodyMovement | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');
  const [isSubmittingReversal, setIsSubmittingReversal] = useState(false);

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const loadData = () => {
    if (!activeUser) return;
    // Strictly scoped: Stations from getStationsForUser only
    const scopedStations = CustodyDB.getStationsForUser(activeUser);
    setStations(scopedStations);

    const allRegions = CustodyDB.getRegions();
    setRegions(allRegions);

    if (scopedStations.length > 0) {
      if (!replenishTargetId || !scopedStations.some(s => s.id === replenishTargetId)) {
        setReplenishTargetId(scopedStations[0].id);
      }
      if (!countStationId || !scopedStations.some(s => s.id === countStationId)) {
        setCountStationId(scopedStations[0].id);
      }
    }

    const allMovements = CustodyEngine.getMovements(
      selectedStationId === 'all' ? undefined : selectedStationId,
      activeUser.company_id
    );
    setMovements(allMovements);
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener('custody_db_updated', handleUpdate);
    return () => window.removeEventListener('custody_db_updated', handleUpdate);
  }, [selectedStationId, activeUser?.id]);

  // Compute station balances
  const stationBalancesMap = useMemo(() => {
    const map = new Map<string, CustodyBalances>();
    for (const station of stations) {
      map.set(station.id, CustodyEngine.getBalances(station.id));
    }
    return map;
  }, [stations]);

  // Aggregated KPI numbers
  const kpis = useMemo(() => {
    let totalNominal = 0;
    let totalDeducted = 0;
    let totalAvailable = 0;

    for (const s of stations) {
      const b = stationBalancesMap.get(s.id);
      if (b) {
        totalNominal += b.nominal;
        totalDeducted += b.deducted;
        totalAvailable += b.available;
      }
    }

    return { totalNominal, totalDeducted, totalAvailable };
  }, [stations, stationBalancesMap]);

  // Filtered stations for Balances tab
  const filteredStations = useMemo(() => {
    return stations.filter(s => {
      if (selectedStationId !== 'all' && s.id !== selectedStationId) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        s.station_name.toLowerCase().includes(term) ||
        (s.station_code && s.station_code.toLowerCase().includes(term))
      );
    });
  }, [stations, selectedStationId, searchTerm]);

  // Handle Replenish Submit
  const handleReplenishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) return;
    const amountNum = parseFloat(replenishAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showToast(isRtl ? 'يرجى إدخال مبلغ صحيح أكبر من الصفر' : 'Please enter a valid amount greater than zero', 'error');
      return;
    }

    if (!replenishTargetId) {
      showToast(isRtl ? 'يرجى اختيار المحطة' : 'Please select a station', 'error');
      return;
    }

    setIsSubmittingReplenish(true);
    try {
      const res = await CustodyEngine.replenish({
        stationId: replenishTargetId,
        amount: amountNum,
        ref: replenishRef.trim() || undefined,
        notes: replenishNotes.trim() || undefined,
        actorId: activeUser.id,
        actorName: activeUser.full_name
      });

      if (res.success) {
        showToast(isRtl ? 'تمت عملية تغذية العهدة بنجاح وتحديث الرصيد' : 'Custody replenished successfully');
        setReplenishAmount('');
        setReplenishRef('');
        setReplenishNotes('');
        loadData();
      } else {
        showToast(res.error || (isRtl ? 'فشلت العملية' : 'Operation failed'), 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error executing replenishment', 'error');
    } finally {
      setIsSubmittingReplenish(false);
    }
  };

  // Handle Count Adjust Submit
  const handleCountAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) return;
    if (!countStationId) {
      showToast(isRtl ? 'يرجى اختيار المحطة' : 'Please select a station', 'error');
      return;
    }

    const countedNum = parseFloat(physicalCount);
    if (isNaN(countedNum) || countedNum < 0) {
      showToast(isRtl ? 'يرجى إدخال قيمة الجرد الفعلي للنقدية' : 'Please enter valid counted physical cash', 'error');
      return;
    }

    const currentBalances = stationBalancesMap.get(countStationId) || CustodyEngine.getBalances(countStationId);
    const expected = currentBalances.available;
    const variance = countedNum - expected;

    setIsSubmittingCount(true);
    try {
      const res = await CustodyEngine.count_adjust({
        stationId: countStationId,
        variance,
        countedAmount: countedNum,
        expectedAmount: expected,
        notes: countNotes.trim() || undefined,
        actorId: activeUser.id,
        actorName: activeUser.full_name
      });

      if (res.success) {
        showToast(
          isRtl 
            ? `تم اعتماد تسوية الجرد بنجاح (الفارق: ${variance >= 0 ? '+' : ''}${variance.toLocaleString()} ج.م)` 
            : `Count adjustment recorded (Variance: ${variance >= 0 ? '+' : ''}${variance.toLocaleString()} EGP)`
        );
        setPhysicalCount('');
        setCountNotes('');
        loadData();
      } else {
        showToast(res.error || (isRtl ? 'فشلت عملية التسوية' : 'Adjustment failed'), 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error executing count adjustment', 'error');
    } finally {
      setIsSubmittingCount(false);
    }
  };

  // Handle Reversal Submit
  const handleReversalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser || !reversingMovement) return;
    if (!reversalReason.trim()) {
      showToast(isRtl ? 'يرجى إدخال سبب الإلغاء/العكس' : 'Please enter reversal reason', 'error');
      return;
    }

    setIsSubmittingReversal(true);
    try {
      const res = await CustodyEngine.reverseReplenishment({
        stationId: reversingMovement.station_id,
        amount: Math.abs(reversingMovement.amount),
        reason: reversalReason.trim(),
        movementId: reversingMovement.id,
        actorId: activeUser.id,
        actorName: activeUser.full_name
      });

      if (res.success) {
        showToast(isRtl ? 'تم عكس عملية التغذية بنجاح واستعادة الرصيد' : 'Replenishment reversed successfully');
        setReversingMovement(null);
        setReversalReason('');
        loadData();
      } else {
        showToast(res.error || (isRtl ? 'فشل عكس العملية' : 'Reversal failed'), 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error reversing replenishment', 'error');
    } finally {
      setIsSubmittingReversal(false);
    }
  };

  const selectedCountStationBalance = stationBalancesMap.get(countStationId) || { nominal: 0, deducted: 0, available: 0 };
  const calculatedCountVariance = physicalCount !== '' && !isNaN(parseFloat(physicalCount))
    ? parseFloat(physicalCount) - selectedCountStationBalance.available
    : null;

  // Compute period report data
  const reportData = useMemo(() => {
    return CustodyEngine.getPeriodReport({
      from: reportFrom,
      to: reportTo,
      companyId: activeUser?.company_id,
      regionId: reportRegionId !== 'all' ? reportRegionId : undefined,
      stationId: reportStationId !== 'all' ? reportStationId : undefined,
      type: reportTypeFilter !== 'all' ? (reportTypeFilter as any) : undefined
    });
  }, [reportFrom, reportTo, reportStationId, reportRegionId, reportTypeFilter, movements, stations, activeUser?.company_id]);

  const setDateShortcut = (shortcut: 'today' | 'last_7_days' | 'this_month' | 'last_month' | 'this_year') => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (shortcut === 'today') {
      const todayStr = toYMD(now);
      setReportFrom(todayStr);
      setReportTo(todayStr);
    } else if (shortcut === 'last_7_days') {
      const past = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      setReportFrom(toYMD(past));
      setReportTo(toYMD(now));
    } else if (shortcut === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setReportFrom(toYMD(start));
      setReportTo(toYMD(end));
    } else if (shortcut === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setReportFrom(toYMD(start));
      setReportTo(toYMD(end));
    } else if (shortcut === 'this_year') {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      setReportFrom(toYMD(start));
      setReportTo(toYMD(end));
    }
  };

  const exportReportToCSV = () => {
    const headers = ['Date', 'Station', 'Type', 'Amount (EGP)', 'Actor', 'Reference', 'Notes'];
    const rows = reportData.movements.map(m => {
      const stn = stations.find(s => s.id === m.station_id);
      return [
        `"${new Date(m.at).toLocaleString('en-US')}"`,
        `"${(stn?.station_name || m.station_id).replace(/"/g, '""')}"`,
        `"${m.type}"`,
        m.amount,
        `"${(m.actor_name || m.actor_id).replace(/"/g, '""')}"`,
        `"${(m.ref || '').replace(/"/g, '""')}"`,
        `"${(m.notes || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = [
      `"Custody Period Report: ${reportFrom} to ${reportTo}"`,
      `"Opening Balance: ${reportData.opening.toLocaleString()} EGP, Total In: ${reportData.total_in.toLocaleString()} EGP, Total Out: ${reportData.total_out.toLocaleString()} EGP, Closing Balance: ${reportData.closing.toLocaleString()} EGP"`,
      '',
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `custody_report_${reportFrom}_to_${reportTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`space-y-6 font-sans ${theme === 'dark' ? 'text-slate-100' : 'text-slate-800'}`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div 
          className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl border flex items-center gap-3 transition-all ${
            toastType === 'success' 
              ? 'bg-emerald-600 text-white border-emerald-500' 
              : 'bg-rose-600 text-white border-rose-500'
          }`}
        >
          {toastType === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Wallet size={24} />
            </span>
            <div>
              <h1 className="text-xl font-black tracking-tight">
                {isRtl ? 'إدارة العهد النقدية' : 'Cash Custody Management'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {isRtl 
                  ? 'المحرك المركزي لإدارة وتغذية وجرد العهد التشغيلية عبر الفروع والمحطات' 
                  : 'Centralized engine for custody balances, replenishment, and audits'}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 overflow-x-auto">
          <button
            onClick={() => setActiveTab('balances')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'balances'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {isRtl ? 'الأرصدة' : 'Balances'}
          </button>
          <button
            onClick={() => setActiveTab('replenish')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'replenish'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {isRtl ? 'تغذية' : 'Replenish'}
          </button>
          <button
            onClick={() => setActiveTab('count_adjust')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'count_adjust'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {isRtl ? 'جرد/مطابقة' : 'Count & Audit'}
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'movements'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {isRtl ? 'الحركات' : 'Movements'}
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'reports'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {isRtl ? 'تقارير الفترة' : 'Period Reports'}
          </button>
        </div>
      </div>

      {/* KPI Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold">{isRtl ? 'إجمالي القيمة الاسمية للعهد' : 'Total Nominal Custody'}</span>
            <Coins size={16} className="text-indigo-500" />
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white">
            {kpis.totalNominal.toLocaleString()} <span className="text-xs font-normal text-slate-400">EGP</span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
            {isRtl ? `عبر ${stations.length} محطة مصرح بها` : `Across ${stations.length} scoped stations`}
          </span>
        </div>

        <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold">{isRtl ? 'إجمالي المخصوم والمصروف' : 'Total Deducted / Spent'}</span>
            <ArrowUpRight size={16} className="text-amber-500" />
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400">
            {kpis.totalDeducted.toLocaleString()} <span className="text-xs font-normal text-slate-400">EGP</span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
            {isRtl ? 'مصروفات معلقة وتحت التسوية' : 'Pending & under-settlement expenses'}
          </span>
        </div>

        <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold">{isRtl ? 'إجمالي النقدية المتاحة' : 'Total Available Cash'}</span>
            <ArrowDownRight size={16} className="text-emerald-500" />
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
            {kpis.totalAvailable.toLocaleString()} <span className="text-xs font-normal text-slate-400">EGP</span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
            {isRtl ? 'الرصيد الفعلي الجاهز للصرف' : 'Liquid cash ready for disbursement'}
          </span>
        </div>
      </div>

      {/* TAB 1: BALANCES (الأرصدة) */}
      {activeTab === 'balances' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-400 shrink-0">
                {isRtl ? 'المحطة/الفرع:' : 'Station:'}
              </span>
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className={`py-1.5 px-3 rounded-xl border text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="all">{isRtl ? 'جميع المحطات المصرح بها' : 'All Scoped Stations'}</option>
                {stations.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.station_name} {s.station_code ? `(${s.station_code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative w-full sm:w-64">
              <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 pointer-events-none">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder={isRtl ? 'بحث بالاسم أو الكود...' : 'Search by name or code...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`py-1.5 pl-3 pr-9 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'
                }`}
              />
            </div>
          </div>

          {/* Stations Table */}
          <div className={`rounded-2xl border overflow-hidden ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className={`border-b font-extrabold text-slate-500 dark:text-slate-400 uppercase ${
                  theme === 'dark' ? 'bg-slate-800/50 border-slate-800' : 'bg-slate-50/70 border-slate-200'
                }`}>
                  <tr>
                    <th className="py-3 px-4 text-start">{isRtl ? 'المحطة / الفرع' : 'Station / Branch'}</th>
                    <th className="py-3 px-4 text-start">{isRtl ? 'الكود' : 'Code'}</th>
                    <th className="py-3 px-4 text-end">{isRtl ? 'القيمة الاسمية' : 'Nominal Custody'}</th>
                    <th className="py-3 px-4 text-end">{isRtl ? 'المخصوم (مصروفات)' : 'Deducted'}</th>
                    <th className="py-3 px-4 text-end">{isRtl ? 'النقدية المتاحة' : 'Available Cash'}</th>
                    <th className="py-3 px-4 text-center">{isRtl ? 'إجراءات سريعة' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredStations.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        {isRtl ? 'لا توجد محطات مطابقة للبحث' : 'No stations matching filter'}
                      </td>
                    </tr>
                  ) : (
                    filteredStations.map(station => {
                      const balances = stationBalancesMap.get(station.id) || { nominal: 0, deducted: 0, available: 0 };
                      return (
                        <tr key={station.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-start">
                            <div className="flex items-center gap-2">
                              <Building2 size={15} className="text-indigo-500" />
                              <span>{station.station_name}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-medium text-slate-500 text-start">
                            {station.station_code || '-'}
                          </td>
                          <td className="py-3.5 px-4 font-black font-mono text-end">
                            {balances.nominal.toLocaleString()} <span className="text-[10px] text-slate-400">EGP</span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-amber-600 dark:text-amber-400 text-end">
                            {balances.deducted.toLocaleString()} <span className="text-[10px] text-slate-400">EGP</span>
                          </td>
                          <td className="py-3.5 px-4 font-black font-mono text-emerald-600 dark:text-emerald-400 text-end">
                            {balances.available.toLocaleString()} <span className="text-[10px] text-slate-400">EGP</span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => {
                                  setReplenishTargetId(station.id);
                                  setActiveTab('replenish');
                                }}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors cursor-pointer"
                              >
                                {isRtl ? 'تغذية' : 'Replenish'}
                              </button>
                              <button
                                onClick={() => {
                                  setCountStationId(station.id);
                                  setActiveTab('count_adjust');
                                }}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition-colors cursor-pointer"
                              >
                                {isRtl ? 'جرد' : 'Count'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: REPLENISH (تغذية) */}
      {activeTab === 'replenish' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Replenish Form */}
          <div className={`lg:col-span-2 p-5 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Coins size={18} />
              </span>
              <h2 className="text-sm font-black">
                {isRtl ? 'تسجيل استعاضة / تغذية عهدة' : 'Record Custody Replenishment'}
              </h2>
            </div>

            <form onSubmit={handleReplenishSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    {isRtl ? 'المحطة المستهدفة *' : 'Target Station *'}
                  </label>
                  <select
                    value={replenishTargetId}
                    onChange={(e) => setReplenishTargetId(e.target.value)}
                    className={`w-full py-2 px-3 rounded-xl border text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                    required
                  >
                    {stations.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.station_name} {s.station_code ? `(${s.station_code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    {isRtl ? 'مبلغ التغذية (ج.م) *' : 'Replenishment Amount (EGP) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="5000"
                    value={replenishAmount}
                    onChange={(e) => setReplenishAmount(e.target.value)}
                    className={`w-full py-2 px-3 rounded-xl border text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    {isRtl ? 'رقم الإشعار / الشيك / الإيصال (اختياري)' : 'Reference / Receipt No (Optional)'}
                  </label>
                  <input
                    type="text"
                    placeholder="CHK-98234"
                    value={replenishRef}
                    onChange={(e) => setReplenishRef(e.target.value)}
                    className={`w-full py-2 px-3 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    {isRtl ? 'ملاحظات وتفاصيل التغذية' : 'Notes & Remarks'}
                  </label>
                  <input
                    type="text"
                    placeholder={isRtl ? 'استعاضة عهدة دورية...' : 'Periodic replenishment...'}
                    value={replenishNotes}
                    onChange={(e) => setReplenishNotes(e.target.value)}
                    className={`w-full py-2 px-3 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingReplenish}
                  className="px-5 py-2 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/10 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingReplenish ? (isRtl ? 'جارٍ الحفظ...' : 'Saving...') : (isRtl ? 'تغذية العهدة وتحديث الرصيد' : 'Replenish Custody')}
                </button>
              </div>
            </form>
          </div>

          {/* Selected Station Current Balances Info */}
          <div className={`p-5 rounded-2xl border flex flex-col justify-between ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase mb-3">
                {isRtl ? 'أرصدة المحطة المحددة حالياً' : 'Selected Station Balance'}
              </h3>
              {(() => {
                const targetStation = stations.find(s => s.id === replenishTargetId);
                const b = stationBalancesMap.get(replenishTargetId) || { nominal: 0, deducted: 0, available: 0 };
                return (
                  <div className="space-y-3">
                    <div className="font-bold text-sm text-slate-800 dark:text-slate-100">
                      {targetStation?.station_name || '-'}
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">{isRtl ? 'الرصيد الاسمي الحالي:' : 'Current Nominal:'}</span>
                        <span className="font-bold font-mono">{b.nominal.toLocaleString()} EGP</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">{isRtl ? 'المصروفات المعلقة:' : 'Deducted:'}</span>
                        <span className="font-bold font-mono text-amber-500">{b.deducted.toLocaleString()} EGP</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                        <span className="font-bold text-slate-700 dark:text-slate-300">{isRtl ? 'النقدية المتاحة حالياً:' : 'Available Cash:'}</span>
                        <span className="font-black font-mono text-emerald-600 dark:text-emerald-400">{b.available.toLocaleString()} EGP</span>
                      </div>
                    </div>
                    {replenishAmount && !isNaN(parseFloat(replenishAmount)) && parseFloat(replenishAmount) > 0 && (
                      <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-xs">
                        <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold mb-1">
                          {isRtl ? 'الرصيد الاسمي المتوقع بعد التغذية:' : 'Projected Nominal After Replenish:'}
                        </div>
                        <div className="text-base font-black font-mono text-indigo-700 dark:text-indigo-300">
                          {(b.nominal + parseFloat(replenishAmount)).toLocaleString()} EGP
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="text-[11px] text-slate-400 border-t pt-3 border-slate-100 dark:border-slate-800">
              {isRtl 
                ? 'يتم تسجيل كل تغذية كحركة عهدة معتمدة وتحديث حد المحطة تلقائياً.' 
                : 'Every replenishment writes a verified custody movement and updates limits automatically.'}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: COUNT & AUDIT (جرد/مطابقة) */}
      {activeTab === 'count_adjust' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`lg:col-span-2 p-5 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Scale size={18} />
              </span>
              <h2 className="text-sm font-black">
                {isRtl ? 'تسجيل جرد ومطابقة نقدية الخزينة' : 'Physical Cash Count & Audit'}
              </h2>
            </div>

            <form onSubmit={handleCountAdjustSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    {isRtl ? 'المحطة / الخزينة المراد جردها *' : 'Target Station / Branch *'}
                  </label>
                  <select
                    value={countStationId}
                    onChange={(e) => setCountStationId(e.target.value)}
                    className={`w-full py-2 px-3 rounded-xl border text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                    required
                  >
                    {stations.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.station_name} {s.station_code ? `(${s.station_code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    {isRtl ? 'النقدية الفعلية الموجودة بالخزينة (ج.م) *' : 'Physical Cash Counted (EGP) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={physicalCount}
                    onChange={(e) => setPhysicalCount(e.target.value)}
                    className={`w-full py-2 px-3 rounded-xl border text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  {isRtl ? 'ملاحظات وتوصيات الجرد' : 'Count Notes & Recommendations'}
                </label>
                <textarea
                  rows={3}
                  placeholder={isRtl ? 'اكتب ملاحظات الجرد الفعلي، أسباب العجز أو الزيادة إن وجدت...' : 'Enter audit notes, variance causes if any...'}
                  value={countNotes}
                  onChange={(e) => setCountNotes(e.target.value)}
                  className={`w-full p-2.5 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingCount}
                  className="px-5 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/10 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingCount ? (isRtl ? 'جارٍ الاعتماد...' : 'Submitting...') : (isRtl ? 'اعتماد تسوية الجرد' : 'Confirm Count Adjustment')}
                </button>
              </div>
            </form>
          </div>

          {/* Real-time Variance Box */}
          <div className={`p-5 rounded-2xl border flex flex-col justify-between ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase mb-3">
                {isRtl ? 'نتيجة المطابقة التلقائية' : 'Audit Variance Status'}
              </h3>
              
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">{isRtl ? 'النقدية الدفترية المتوقعة:' : 'Expected Available Cash:'}</span>
                  <span className="font-bold font-mono">{selectedCountStationBalance.available.toLocaleString()} EGP</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">{isRtl ? 'الجرد الفعلي المُدخل:' : 'Entered Physical Count:'}</span>
                  <span className="font-bold font-mono">
                    {physicalCount !== '' ? parseFloat(physicalCount).toLocaleString() : '-'} EGP
                  </span>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                  {calculatedCountVariance === null ? (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-slate-400 text-center text-[11px]">
                      {isRtl ? 'أدخل الجرد الفعلي لحساب الفارق' : 'Enter count to compute variance'}
                    </div>
                  ) : calculatedCountVariance === 0 ? (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center">
                      <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5">
                        <CheckCircle2 size={16} />
                        {isRtl ? 'مطابق تماماً (لا يوجد عجز أو زيادة)' : 'Perfect Match (Zero Variance)'}
                      </span>
                    </div>
                  ) : calculatedCountVariance < 0 ? (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-center">
                      <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 mb-1 flex items-center justify-center gap-1">
                        <AlertTriangle size={14} />
                        {isRtl ? 'يوجد عجز نقدية بالخزينة:' : 'Cash Deficit Detected:'}
                      </div>
                      <div className="text-base font-black font-mono text-rose-700 dark:text-rose-300">
                        {calculatedCountVariance.toLocaleString()} EGP
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center">
                      <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center justify-center gap-1">
                        <CheckCircle2 size={14} />
                        {isRtl ? 'توجد زيادة نقدية بالخزينة:' : 'Cash Surplus Detected:'}
                      </div>
                      <div className="text-base font-black font-mono text-emerald-700 dark:text-emerald-300">
                        +{calculatedCountVariance.toLocaleString()} EGP
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 border-t pt-3 border-slate-100 dark:border-slate-800">
              {isRtl 
                ? 'اعتماد التسوية يكتب حركة جرد تلقائياً ويعدل الرصيد الاسمي بمقدار الفارق.' 
                : 'Confirming adjustment logs count_adjust and reconciles custody balance.'}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MOVEMENTS (الحركات) */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          {/* Movement Filter Toolbar */}
          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-400 shrink-0">
                {isRtl ? 'المحطة:' : 'Station:'}
              </span>
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className={`py-1.5 px-3 rounded-xl border text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="all">{isRtl ? 'جميع المحطات المصرح بها' : 'All Scoped Stations'}</option>
                {stations.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.station_name} {s.station_code ? `(${s.station_code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-xs text-slate-400 font-bold">
              {isRtl ? `إجمالي الحركات: ${movements.length}` : `Total Movements: ${movements.length}`}
            </span>
          </div>

          {/* Movements Table */}
          <div className={`rounded-2xl border overflow-hidden ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className={`border-b font-extrabold text-slate-500 dark:text-slate-400 uppercase ${
                  theme === 'dark' ? 'bg-slate-800/50 border-slate-800' : 'bg-slate-50/70 border-slate-200'
                }`}>
                  <tr>
                    <th className="py-3 px-4 text-start">{isRtl ? 'التاريخ / الوقت' : 'Date / Time'}</th>
                    <th className="py-3 px-4 text-start">{isRtl ? 'المحطة' : 'Station'}</th>
                    <th className="py-3 px-4 text-center">{isRtl ? 'نوع الحركة' : 'Type'}</th>
                    <th className="py-3 px-4 text-end">{isRtl ? 'المبلغ' : 'Amount'}</th>
                    <th className="py-3 px-4 text-end">{isRtl ? 'الرصيد بعدها' : 'Balance After'}</th>
                    <th className="py-3 px-4 text-start">{isRtl ? 'القائم بالعملية' : 'Actor'}</th>
                    <th className="py-3 px-4 text-start">{isRtl ? 'المرجع / الملاحظات' : 'Ref / Notes'}</th>
                    <th className="py-3 px-4 text-center">{isRtl ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {movements.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        {isRtl ? 'لا توجد حركات مسجلة حتى الآن' : 'No custody movements recorded yet'}
                      </td>
                    </tr>
                  ) : (
                    movements.map(m => {
                      const stn = stations.find(s => s.id === m.station_id);
                      const isReplenish = m.type === 'replenish';
                      const isReverse = m.type === 'reverse_replenish';
                      const isCount = m.type === 'count_adjust';

                      return (
                        <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-3.5 px-4 font-mono text-slate-500 text-start whitespace-nowrap">
                            {new Date(m.at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-start">
                            {stn?.station_name || m.station_id}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                              isReplenish 
                                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800' 
                                : isReverse 
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800' 
                                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                            }`}>
                              {isReplenish && (isRtl ? 'استعاضة/تغذية' : 'Replenish')}
                              {isReverse && (isRtl ? 'عكس استعاضة' : 'Reversal')}
                              {isCount && (isRtl ? 'تسوية جرد' : 'Count Adjust')}
                              {!isReplenish && !isReverse && !isCount && m.type}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-end">
                            <span className={m.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                              {m.amount >= 0 ? `+${m.amount.toLocaleString()}` : m.amount.toLocaleString()} EGP
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-end text-slate-700 dark:text-slate-200">
                            {m.balance_after !== undefined ? `${m.balance_after.toLocaleString()} EGP` : '-'}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 text-start">
                            <div className="flex items-center gap-1.5">
                              <UserIcon size={12} className="text-slate-400" />
                              <span>{m.actor_name || m.actor_id}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-start max-w-xs truncate text-slate-500">
                            {m.ref && <span className="font-mono text-slate-600 dark:text-slate-400 font-bold ml-1">[{m.ref}]</span>}
                            {m.notes || '-'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {isReplenish && (activeUser?.role === 'Admin' || activeUser?.role === 'RegionalManager') && (
                              <button
                                onClick={() => setReversingMovement(m)}
                                title={isRtl ? 'عكس الاستعاضة' : 'Reverse Replenishment'}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 transition-colors cursor-pointer"
                              >
                                <RotateCcw size={12} className="inline ml-0.5" />
                                {isRtl ? 'عكس' : 'Reverse'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reports Tab Content */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Controls & Filter Bar */}
          <div className={`p-4 rounded-2xl border space-y-4 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Date Shortcuts */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                <span className="text-xs font-bold text-slate-500 shrink-0 ml-1">
                  {isRtl ? 'الفترة:' : 'Period:'}
                </span>
                <button
                  type="button"
                  onClick={() => setDateShortcut('today')}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                >
                  {isRtl ? 'اليوم' : 'Today'}
                </button>
                <button
                  type="button"
                  onClick={() => setDateShortcut('last_7_days')}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                >
                  {isRtl ? 'آخر 7 أيام' : 'Last 7 Days'}
                </button>
                <button
                  type="button"
                  onClick={() => setDateShortcut('this_month')}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 transition-colors shrink-0 cursor-pointer"
                >
                  {isRtl ? 'هذا الشهر' : 'This Month'}
                </button>
                <button
                  type="button"
                  onClick={() => setDateShortcut('last_month')}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                >
                  {isRtl ? 'الشهر السابق' : 'Last Month'}
                </button>
                <button
                  type="button"
                  onClick={() => setDateShortcut('this_year')}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                >
                  {isRtl ? 'هذا العام' : 'This Year'}
                </button>
              </div>

              {/* Action Buttons: Export & Print */}
              <div className="flex items-center gap-2 self-end lg:self-auto">
                <button
                  type="button"
                  onClick={exportReportToCSV}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-xs"
                >
                  <Download size={14} />
                  <span>{isRtl ? 'تصدير CSV' : 'Export CSV'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Printer size={14} />
                  <span>{isRtl ? 'طباعة' : 'Print'}</span>
                </button>
              </div>
            </div>

            {/* Filter Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              {/* Date From */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  {isRtl ? 'من تاريخ' : 'From Date'}
                </label>
                <input
                  type="date"
                  value={reportFrom}
                  onChange={(e) => setReportFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  {isRtl ? 'إلى تاريخ' : 'To Date'}
                </label>
                <input
                  type="date"
                  value={reportTo}
                  onChange={(e) => setReportTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Region Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  {isRtl ? 'المنطقة' : 'Region'}
                </label>
                <select
                  value={reportRegionId}
                  onChange={(e) => setReportRegionId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">{isRtl ? 'جميع المناطق' : 'All Regions'}</option>
                  {regions.map(r => (
                    <option key={r.id} value={r.id}>{r.region_name || r.name}</option>
                  ))}
                </select>
              </div>

              {/* Station Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  {isRtl ? 'المحطة / الفرع' : 'Station / Branch'}
                </label>
                <select
                  value={reportStationId}
                  onChange={(e) => setReportStationId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">{isRtl ? 'جميع المحطات' : 'All Stations'}</option>
                  {stations.map(s => (
                    <option key={s.id} value={s.id}>{s.station_name}</option>
                  ))}
                </select>
              </div>

              {/* Type Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  {isRtl ? 'نوع الحركة' : 'Movement Type'}
                </label>
                <select
                  value={reportTypeFilter}
                  onChange={(e) => setReportTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">{isRtl ? 'جميع الأنواع' : 'All Types'}</option>
                  <option value="replenish">{isRtl ? 'استعاضة / تغذية' : 'Replenish'}</option>
                  <option value="reverse_replenish">{isRtl ? 'عكس استعاضة' : 'Reversal'}</option>
                  <option value="count_adjust">{isRtl ? 'تسوية جرد' : 'Count Adjust'}</option>
                  <option value="consume">{isRtl ? 'استهلاك تسوية' : 'Settlement'}</option>
                  <option value="opening_balance">{isRtl ? 'رصيد افتتاحي' : 'Opening Balance'}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Period Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Opening Balance */}
            <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                <span className="text-xs font-bold">{isRtl ? 'رصيد بداية الفترة' : 'Opening Balance'}</span>
                <Calendar size={16} className="text-slate-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black font-mono">
                  {reportData.opening.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-slate-400">EGP</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 font-medium">
                {isRtl ? `الرصيد عند ${reportFrom}` : `Balance at ${reportFrom}`}
              </p>
            </div>

            {/* 2. Total Inflows */}
            <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                <span className="text-xs font-bold">{isRtl ? 'إجمالي التغذية والإيداعات (+)' : 'Total Inflows (+)'}</span>
                <ArrowUpRight size={16} className="text-emerald-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  +{reportData.total_in.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-emerald-600/70">EGP</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 font-medium">
                {isRtl ? 'تغذية العهد وفروقات الجرد الموجبة' : 'Replenishments & positive adjustments'}
              </p>
            </div>

            {/* 3. Total Outflows */}
            <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                <span className="text-xs font-bold">{isRtl ? 'إجمالي المصروف والمسحوبات (-)' : 'Total Outflows (-)'}</span>
                <ArrowDownRight size={16} className="text-rose-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black font-mono text-rose-600 dark:text-rose-400">
                  -{reportData.total_out.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-rose-600/70">EGP</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 font-medium">
                {isRtl ? 'عكس الاستعاضة وتسوية المصروفات' : 'Reversals & settled expenses'}
              </p>
            </div>

            {/* 4. Closing Balance */}
            <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                <span className="text-xs font-bold">{isRtl ? 'رصيد نهاية الفترة' : 'Closing Balance'}</span>
                <Wallet size={16} className="text-indigo-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400">
                  {reportData.closing.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-indigo-400">EGP</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 font-medium">
                {isRtl ? `الرصيد عند نهاية ${reportTo}` : `Balance at end of ${reportTo}`}
              </p>
            </div>
          </div>

          {/* Report Ledger Table: date | station | type | amount | actor | notes/ref */}
          <div className={`rounded-2xl border overflow-hidden ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-indigo-500" />
                <h3 className="font-black text-sm">
                  {isRtl ? 'سجل حركات العهدة التفصيلي للفترة' : 'Detailed Custody Ledger for Period'}
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-400">
                {reportData.movements.length} {isRtl ? 'حركة مسجلة' : 'movements recorded'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 font-bold">
                    <th className="py-3 px-4 text-start">{isRtl ? 'التاريخ والوقت' : 'Date & Time'}</th>
                    <th className="py-3 px-4 text-start">{isRtl ? 'المحطة / الفرع' : 'Station / Branch'}</th>
                    <th className="py-3 px-4 text-center">{isRtl ? 'نوع الحركة' : 'Type'}</th>
                    <th className="py-3 px-4 text-end">{isRtl ? 'المبلغ' : 'Amount'}</th>
                    <th className="py-3 px-4 text-start">{isRtl ? 'القائم بالعملية' : 'Actor'}</th>
                    <th className="py-3 px-4 text-start">{isRtl ? 'المرجع / الملاحظات' : 'Ref / Notes'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {reportData.movements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <FileText size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="font-bold">
                          {isRtl ? 'لا توجد حركات عهد مسجلة في هذه الفترة المحددة' : 'No custody movements recorded in this period'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    reportData.movements.map((m) => {
                      const stn = stations.find(s => s.id === m.station_id);
                      const isReplenish = m.type === 'replenish';
                      const isReverse = m.type === 'reverse_replenish';
                      const isCount = m.type === 'count_adjust';
                      const isConsume = m.type === 'consume';
                      const isOpening = m.type === 'opening_balance';

                      return (
                        <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-3.5 px-4 font-mono text-slate-500 text-start whitespace-nowrap">
                            {new Date(m.at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-start">
                            {stn?.station_name || m.station_id}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                              isReplenish 
                                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800' 
                                : isReverse 
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800' 
                                  : isCount
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                    : isConsume
                                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                            }`}>
                              {isReplenish && (isRtl ? 'استعاضة / تغذية' : 'Replenish')}
                              {isReverse && (isRtl ? 'عكس استعاضة' : 'Reversal')}
                              {isCount && (isRtl ? 'تسوية جرد' : 'Count Adjust')}
                              {isConsume && (isRtl ? 'استهلاك تسوية' : 'Settlement')}
                              {isOpening && (isRtl ? 'رصيد افتتاحي' : 'Opening')}
                              {!isReplenish && !isReverse && !isCount && !isConsume && !isOpening && m.type}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-end">
                            <span className={m.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                              {m.amount >= 0 ? `+${m.amount.toLocaleString()}` : m.amount.toLocaleString()} EGP
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 text-start">
                            <div className="flex items-center gap-1.5">
                              <UserIcon size={12} className="text-slate-400" />
                              <span>{m.actor_name || m.actor_id}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-start max-w-xs truncate text-slate-500">
                            {m.ref && <span className="font-mono text-slate-600 dark:text-slate-400 font-bold ml-1">[{m.ref}]</span>}
                            {m.notes || '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reversal Confirmation Modal */}
      {reversingMovement && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center gap-2 mb-4 text-amber-600 dark:text-amber-400">
              <RotateCcw size={20} />
              <h3 className="text-sm font-black">
                {isRtl ? 'تأكيد عكس عملية التغذية' : 'Confirm Replenishment Reversal'}
              </h3>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {isRtl 
                ? `سيتم خصم مبلغ ${Math.abs(reversingMovement.amount).toLocaleString()} ج.م من رصيد المحطة وتوثيق حركة عكسية معتمدة.` 
                : `This will deduct ${Math.abs(reversingMovement.amount).toLocaleString()} EGP from the station custody and log a reversal movement.`}
            </p>

            <form onSubmit={handleReversalSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1.5">
                  {isRtl ? 'سبب العكس أو الإلغاء *' : 'Reversal Reason *'}
                </label>
                <input
                  type="text"
                  placeholder={isRtl ? 'خطأ في القيمة، تكرار الإيداع...' : 'Value mistake, duplicate deposit...'}
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className={`w-full py-2 px-3 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setReversingMovement(null);
                    setReversalReason('');
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReversal}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingReversal ? (isRtl ? 'جارٍ العكس...' : 'Reversing...') : (isRtl ? 'تأكيد العكس' : 'Confirm Reversal')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
