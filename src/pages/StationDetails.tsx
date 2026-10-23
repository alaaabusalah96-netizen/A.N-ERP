import React, { useState, useEffect } from 'react';
import { 
  Building, 
  ArrowLeft, 
  ArrowRight,
  TrendingUp, 
  Wallet, 
  Clock, 
  FileCheck, 
  FileText, 
  Search, 
  Activity,
  Printer,
  Download,
  AlertCircle,
  Eye,
  Calendar,
  X
} from 'lucide-react';
import { CustodyDB } from '../db';
import { useScreenListeners } from '../firebase';
import { translations, Language, Theme, Transaction, Station, ExpenseCategory } from '../types';

interface StationDetailsProps {
  stationId: string;
  language: Language;
  theme: Theme;
  onBack: () => void;
}

// Arabic Tafqeet (number to words) helper function
function getArabicTafqeet(amount: number): string {
  const parts = amount.toFixed(2).split('.');
  const pounds = parseInt(parts[0], 10);
  const piastres = parseInt(parts[1], 10);

  const units = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
  const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function convertBelowHundred(n: number): string {
    if (n === 0) return '';
    if (n <= 10) return units[n];
    if (n < 20) return teens[n - 10];
    const u = n % 10;
    const t = Math.floor(n / 10);
    if (u > 0) {
      return units[u] + ' و' + tens[t];
    }
    return tens[t];
  }

  function convertBelowThousand(n: number): string {
    if (n === 0) return '';
    const h = Math.floor(n / 100);
    const rest = n % 100;
    let result = '';
    
    if (h > 0) {
      result += hundreds[h];
    }
    
    if (rest > 0) {
      if (h > 0) result += ' و';
      result += convertBelowHundred(rest);
    }
    return result;
  }

  function formatPounds(p: number): string {
    if (p === 0) return 'صفر';
    if (p === 1) return 'جنيه واحد';
    if (p === 2) return 'جنيهان';
    if (p >= 3 && p <= 10) return convertBelowThousand(p) + ' جنيهات';
    
    let result = '';
    const th = Math.floor(p / 1000);
    const rem = p % 1000;

    if (th > 0) {
      if (th === 1) result += 'ألف';
      else if (th === 2) result += 'ألفان';
      else if (th >= 3 && th <= 10) result += convertBelowThousand(th) + ' آلاف';
      else result += convertBelowThousand(th) + ' ألف';
    }

    if (rem > 0) {
      if (th > 0) result += ' و';
      result += convertBelowThousand(rem);
    }

    return result + ' جنيه';
  }

  let text = formatPounds(pounds);
  
  if (pounds > 10 && pounds % 100 !== 0) {
    text = text.replace(' جنيه', ' جنيهاً');
  }

  if (piastres > 0) {
    let piastreText = convertBelowHundred(piastres);
    if (piastres === 1) piastreText = 'قرش واحد';
    else if (piastres === 2) piastreText = 'قرشان';
    else if (piastres >= 3 && piastres <= 10) piastreText += ' قروش';
    else piastreText += ' قرشاً';
    text += ' و' + piastreText;
  }
  
  return 'فقط ' + text + ' لا غير';
}

export default function StationDetails({
  stationId,
  language,
  theme,
  onBack
}: StationDetailsProps) {
  useScreenListeners(['transactions', 'logs']);

  const t = translations[language];
  const isRtl = language === 'ar';

  const [dbVersion, setDbVersion] = useState(0);
  useEffect(() => {
    const handleUpdate = () => setDbVersion(prev => prev + 1);
    window.addEventListener('custody_db_updated', handleUpdate);
    return () => window.removeEventListener('custody_db_updated', handleUpdate);
  }, []);
  
  const stations = CustodyDB.getStations();
  const station = stations.find(s => s.id === stationId);
  const regions = CustodyDB.getRegions();
  const region = regions.find(r => r.id === station?.region_id);

  const renderVoucherSheet = (tx: Transaction) => {
    if (!station) return null;
    const catLabel = isRtl ? 'مصروفات عامة' : 'General Expenses';
    
    // Split amount into Pounds and Piastres
    const pounds = Math.floor(tx.amount);
    const piastres = Math.round((tx.amount % 1) * 100);

    return (
      <div className="w-full max-w-2xl mx-auto p-5 border-4 border-slate-900 bg-white text-slate-900 text-xs font-bold leading-relaxed rounded-xl shadow-lg relative print:shadow-none print:border-slate-900 print:rounded-none" dir="rtl" id="voucher-sheet-printable">
        {/* Header section identical to the excel format */}
        <div className="flex justify-between items-center border-b border-slate-400 pb-3 mb-4">
          <div className="text-right space-y-1">
            <h1 className="text-sm font-black text-slate-900">شركة / القاهرة الجديدة للدواجن</h1>
            <p className="text-xs text-slate-700 font-semibold">مزرعة / {station.station_name}</p>
          </div>

          <div className="text-center">
            <span className="text-[8px] font-mono font-bold tracking-widest text-slate-400 block mb-0.5">CASH PAYMENT VOUCHER</span>
            <h2 className="text-base font-black border-2 border-slate-900 px-5 py-1 bg-slate-50 text-slate-900">
              مستند صرف نقدى رقم {tx.voucher_no || tx.transaction_no}
            </h2>
          </div>

          <div>
            <div className="border-[3px] border-slate-900 rounded-[50%/50%] px-4 py-1 font-bold text-xl text-slate-900 font-sans tracking-wide bg-white flex flex-col items-center justify-center leading-none">
              <span className="text-lg font-black leading-none">كوكي</span>
              <span className="text-[8px] font-bold font-mono tracking-widest mt-0.5 leading-none">Koki</span>
            </div>
          </div>
        </div>

        {/* Top meta specifications block */}
        <div className="grid grid-cols-2 gap-4 border border-slate-900 p-3 rounded-lg mb-4 text-xs">
          <div className="space-y-2">
            <div>
              <span className="text-slate-500 font-medium">التاريخ: </span>
              <span className="font-mono text-slate-900 font-black">{tx.date}</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium">الإسم: </span>
              <span className="text-slate-900 font-black">{station.station_name}</span>
            </div>
          </div>
          <div className="text-left space-y-2">
            <div>
              <span className="text-slate-500 font-medium">الجهة : </span>
              <span className="text-slate-900 font-black">الإدارة المالية</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium">رقم القيد: </span>
              <span className="font-mono text-slate-900 font-black">{tx.transaction_no}</span>
            </div>
          </div>
        </div>

        {/* Main Grid Table matching column-by-column the Excel snapshot */}
        <div className="border border-slate-900 rounded-lg overflow-x-auto overflow-y-hidden mb-4">
          <table className="w-full text-center border-collapse text-xs min-w-[600px]">
            <thead>
              <tr className="bg-slate-100 text-slate-900 border-b border-slate-900 font-bold">
                <th className="border-l border-slate-900 py-1.5 w-28" colSpan={2}>المبلغ</th>
                <th className="border-l border-slate-900 py-1.5" rowSpan={2}>البيـــــــــــــــــــــــــــــــــــان</th>
                <th className="border-l border-slate-900 py-1.5 w-20" rowSpan={2}>المرفقات</th>
                <th className="py-1.5 w-32" rowSpan={2}>التوجيــــــــه</th>
              </tr>
              <tr className="bg-slate-50 text-slate-900 border-b-2 border-slate-900 text-[10px]">
                <th className="border-l border-slate-900 py-1 w-12">قرش</th>
                <th className="border-l border-slate-900 py-1 w-16">جنيه</th>
              </tr>
            </thead>
            <tbody>
              {/* Transaction active row */}
              <tr className="h-9 border-b border-slate-900 hover:bg-slate-50/50">
                <td className="border-l border-slate-900 font-mono text-[11px] font-bold text-slate-700">
                  {piastres === 0 ? '0' : piastres}
                </td>
                <td className="border-l border-slate-900 font-mono text-xs font-black text-slate-900">
                  {pounds.toLocaleString('en-US')}
                </td>
                <td className="border-l border-slate-900 px-3 text-right font-semibold text-slate-900 leading-relaxed">
                  {tx.description}
                </td>
                <td className="border-l border-slate-900 text-slate-700 font-medium text-[10px]">
                  {tx.notes && tx.notes.toLowerCase().includes('مرفق') ? 'مرفق' : '-'}
                </td>
                <td className="font-bold text-slate-700 px-1 text-[11px] truncate max-w-[120px]" title={catLabel || ''}>
                  {catLabel || '-'}
                </td>
              </tr>

              {/* Dotted empty spacing rows mirroring Excel canvas */}
              {Array.from({ length: 11 }).map((_, idx) => (
                <tr key={idx} className="h-6 border-b border-slate-900">
                  <td className="border-l border-slate-900">&nbsp;</td>
                  <td className="border-l border-slate-900">&nbsp;</td>
                  <td className="border-l border-slate-900">&nbsp;</td>
                  <td className="border-l border-slate-900">&nbsp;</td>
                  <td>&nbsp;</td>
                </tr>
              ))}

              {/* Total Row with Tafqeet wording matching the sheet footer */}
              <tr className="h-9 bg-slate-50/60 font-black border-t-2 border-slate-900">
                <td className="border-l border-slate-900 font-mono text-[11px] text-slate-700">
                  {piastres === 0 ? '0' : piastres}
                </td>
                <td className="border-l border-slate-900 font-mono text-xs text-slate-900">
                  {pounds.toLocaleString('en-US')}
                </td>
                <td className="border-l border-slate-900 px-3 text-right text-[11px] text-slate-900 flex justify-between items-center h-9">
                  <span>الجمالى فقط</span>
                  <span className="font-bold text-slate-800">{getArabicTafqeet(tx.amount)}</span>
                </td>
                <td className="border-l border-slate-900">&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Double-row signature boxes */}
        <div className="grid grid-cols-3 gap-y-6 gap-x-4 pt-4 text-center text-[10px] font-black border-t border-slate-300">
          <div>
            <p className="text-slate-900 font-bold mb-1">المدير المسئول</p>
            <div className="text-slate-400 font-mono text-xs select-none">................................................</div>
          </div>
          <div>
            <p className="text-slate-900 font-bold mb-1">المحاسب</p>
            <div className="text-slate-400 font-mono text-xs select-none">................................................</div>
          </div>
          <div>
            <p className="text-slate-900 font-bold mb-1">المراجع</p>
            <div className="text-slate-400 font-mono text-xs select-none">................................................</div>
          </div>
          <div className="mt-2">
            <p className="text-slate-900 font-bold mb-1">الإدارة المختصة</p>
            <div className="text-slate-400 font-mono text-xs select-none">................................................</div>
          </div>
          <div className="mt-2">
            <p className="text-slate-900 font-bold mb-1">مدير عام القطاع</p>
            <div className="text-slate-400 font-mono text-xs select-none">................................................</div>
          </div>
          <div className="mt-2">
            <p className="text-slate-900 font-bold mb-1">مدير عام المنطقة</p>
            <div className="text-slate-400 font-mono text-xs select-none">................................................</div>
          </div>
        </div>
      </div>
    );
  };

  // Selected tab
  const [activeSubTab, setActiveSubTab] = React.useState('overview');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedVoucherNo, setSelectedVoucherNo] = React.useState<string | null>(null);

  // Print voucher popup state
  const [selectedTxForVoucher, setSelectedTxForVoucher] = React.useState<Transaction | null>(null);

  if (!station) {
    return (
      <div className="p-8 text-center" id="station-not-found">
        <AlertCircle className="mx-auto h-12 w-12 text-rose-500 mb-2 animate-bounce" />
        <h3 className="text-lg font-bold">{isRtl ? 'لم يتم العثور على المحطة' : 'Station Not Found'}</h3>
        <button onClick={onBack} className="mt-4 text-emerald-600 hover:underline">
          {isRtl ? 'العودة للمحطات' : 'Back to Directory'}
        </button>
      </div>
    );
  }

  // Dynamic calculations for this station
  const metrics = CustodyDB.getReconciliation(stationId);
  const allTxs = CustodyDB.getTransactions();
  const stationTxs = allTxs.filter(tx => tx.station_id === stationId);

  // Filter transactions for specific searches
  const filteredTxs = stationTxs.filter(tx => {
    if (!searchQuery) return true;
    return (
      tx.transaction_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tx.voucher_no || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.amount.toString().includes(searchQuery)
    );
  });

  const pendingTxs = filteredTxs.filter(tx => tx.status === 'Pending');
  const settledTxs = filteredTxs.filter(tx => tx.status === 'Under Settlement');

  // Group by vouchers for Vouchers tab
  const vouchers = Array.from(new Set(stationTxs.filter(tx => tx.voucher_no).map(tx => tx.voucher_no))) as string[];

  // Get audit logs for this station's users
  const users = CustodyDB.getUsers().filter(u => u.station_id === stationId);
  const userIds = users.map(u => u.id);
  const stationLogs = CustodyDB.getLogs().filter(log => userIds.includes(log.user_id) || log.details.includes(station.station_name));

  // Export to simple CSV helper
  const handleExportCSV = (statusFilter?: 'Pending' | 'Under Settlement') => {
    let target = stationTxs;
    if (statusFilter) target = target.filter(tx => tx.status === statusFilter);

    const headers = ['TX No', 'Date', 'Description', 'Amount (EGP)', 'Status', 'Voucher No'];
    const rows = target.map(tx => {
      return [
        tx.transaction_no,
        tx.date,
        `"${tx.description.replace(/"/g, '""')}"`,
        tx.amount,
        tx.status,
        tx.voucher_no || '-'
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Report_${station.station_code}_${statusFilter || 'All'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const triggerPrintSection = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:p-0" id="station-details-drill-down">
      {/* Printable Voucher Section (Only displays during print) */}
      {selectedTxForVoucher && (
        <div className="hidden print:block p-8 bg-white text-slate-900 min-h-screen" dir="rtl">
          {renderVoucherSheet(selectedTxForVoucher)}
        </div>
      )}

      {/* Screen Interactive Header (Hidden on print) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className={`p-2 rounded-lg border transition-colors ${
              theme === 'dark' ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
            title="Back to Stations"
          >
            {isRtl ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight">
                {station.station_name}
              </h2>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                station.is_active 
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
              }`}>
                {station.is_active ? t.active : t.inactive}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              {station.station_code} &bull; {region?.name} &bull; {isRtl ? 'عرض رقابة المدير المالي الإقليمي' : 'Regional Finance Manager Workspace (Read-Only)'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={triggerPrintSection}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Printer size={14} />
            <span>{isRtl ? 'طباعة الصفحة الحالية' : 'Print Current Screen'}</span>
          </button>
          <button
            onClick={() => handleExportCSV()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm"
          >
            <Download size={14} />
            <span>{isRtl ? 'تصدير البيانات CSV' : 'Export station data (CSV)'}</span>
          </button>
        </div>
      </div>

      {/* Custody Balance Equation Card (Hidden on print) */}
      <div className="print:hidden">
        <div className={`p-6 rounded-2xl border ${
          theme === 'dark' ? 'bg-[#1e293b]/50 border-[#334155]' : 'bg-white border-slate-200'
        }`}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
            {isRtl ? 'معادلة السيولة ومطابقة العهدة للمحطة' : 'Station Custody Balance & Liquidity Matching'}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            {/* Custody value */}
            <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10">
              <p className="text-xs text-slate-400 mb-1">{t.totalCustody}</p>
              <p className="text-xl font-bold font-mono text-indigo-500">
                {metrics.custodyValue.toLocaleString()} EGP
              </p>
            </div>

            {/* Minus sign */}
            <div className="hidden md:flex items-center justify-center font-bold text-slate-400 text-lg">
              &minus;
            </div>

            {/* In-process Outlay */}
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
              <p className="text-xs text-slate-400 mb-1">
                {isRtl ? 'المصروفات الجارية للعهد' : 'In-Process Expenses'}
              </p>
              <p className="text-xl font-bold font-mono text-amber-500">
                {(metrics.pendingTotal + metrics.underSettlementTotal).toLocaleString()} EGP
              </p>
              <p className="text-[10px] text-slate-400 font-semibold mt-1">
                {metrics.pendingCount} معلق &bull; {metrics.underSettlementCount} تحت التسوية
              </p>
            </div>

            {/* Equal sign */}
            <div className="hidden md:flex items-center justify-center font-bold text-slate-400 text-lg">
              =
            </div>

            {/* Available cash */}
            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 col-span-1 md:col-span-2">
              <p className="text-xs text-slate-400 mb-1">{t.cashAvailable}</p>
              <p className="text-2xl font-black font-mono text-emerald-500">
                {metrics.cashAvailable.toLocaleString()} EGP
              </p>
              <p className="text-[10px] text-slate-400 mt-1 font-semibold">
                {isRtl ? 'سيولة نقدية فورية متاحة بالخزينة' : 'Immediate physical cash in safe'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs (Hidden on print) */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto print:hidden" id="station-details-tabs">
        {[
          { id: 'overview', label: isRtl ? 'الملخص المالي' : 'Financial Summary', icon: Wallet },
          { id: 'pending', label: `${t.pendingTransactions} (${pendingTxs.length})`, icon: Clock },
          { id: 'settled', label: `${t.underSettlement} (${settledTxs.length})`, icon: FileCheck },
          { id: 'reconciliation', label: t.cashReconciliation, icon: FileText },
          { id: 'vouchers', label: isRtl ? 'سندات الدفع المعتمدة' : 'Payment Vouchers', icon: FileCheck },
          { id: 'logs', label: isRtl ? 'سجل التدقيق والأنشطة' : 'Activity Audit Trail', icon: Activity },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              id={`subtab-${tab.id}`}
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
                isActive 
                  ? 'border-emerald-600 text-emerald-600' 
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SEARCH / FILTER SECTION inside Tab (Hidden on print) */}
      {activeSubTab !== 'overview' && activeSubTab !== 'reconciliation' && activeSubTab !== 'logs' && (
        <div className="relative print:hidden">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder={isRtl ? 'البحث بالبيان، رقم السند، كود الحركة...' : 'Filter statement list...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-4 py-2 text-xs rounded-lg border outline-none ${
              theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
            }`}
          />
        </div>
      )}

      {/* TAB CONTENT PANELS */}
      <div className="print:hidden">
        {/* OVERVIEW PANEL */}
        {activeSubTab === 'overview' && (
          <div className="space-y-6" id="panel-overview">
            {/* Low Balance Alert */}
            {metrics.cashAvailable < 5000 && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="animate-bounce" size={16} />
                <span>
                  {isRtl 
                    ? `تنبيه: السيولة المتاحة منخفضة جداً (${metrics.cashAvailable.toLocaleString()} ج.م). يجب اتخاذ إجراءات التسوية وتصفية العهدة.`
                    : `Warning: This station has low liquid cash available (${metrics.cashAvailable.toLocaleString()} EGP). Settlement needs conversion.`
                  }
                </span>
              </div>
            )}

            {/* Quick stats & summary charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Recent activity card */}
              <div className={`p-6 rounded-2xl border ${
                theme === 'dark' ? 'bg-[#1e293b]/40 border-[#334155]' : 'bg-white border-slate-200'
              }`}>
                <h4 className="font-bold text-sm text-slate-400 uppercase mb-4">{isRtl ? 'ملخص نشاط العمليات' : 'Transactional Activity summary'}</h4>
                <div className="space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{isRtl ? 'إجمالي الحركات المسجلة' : 'Total transactions logged'}</span>
                    <span className="font-bold">{stationTxs.length}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t pt-2">
                    <span className="text-slate-500">{isRtl ? 'العمليات المعلقة (Pending)' : 'Pending (معلقة)'}</span>
                    <span className="font-mono font-bold text-amber-500">{pendingTxs.length} ({metrics.pendingTotal.toLocaleString()} EGP)</span>
                  </div>
                  <div className="flex justify-between text-xs border-t pt-2">
                    <span className="text-slate-500">{isRtl ? 'تحت التسوية (Settlement)' : 'Under Settlement (تحت التسوية)'}</span>
                    <span className="font-mono font-bold text-emerald-500">{settledTxs.length} ({metrics.underSettlementTotal.toLocaleString()} EGP)</span>
                  </div>
                  <div className="flex justify-between text-xs border-t pt-2">
                    <span className="text-slate-500">{isRtl ? 'سندات صرف دفع نقدية مخرجة' : 'Cash payment vouchers (CPV) issued'}</span>
                    <span className="font-bold text-indigo-500">{vouchers.length}</span>
                  </div>
                </div>
              </div>

              {/* Station information and managers */}
              <div className={`p-6 rounded-2xl border ${
                theme === 'dark' ? 'bg-[#1e293b]/40 border-[#334155]' : 'bg-white border-slate-200'
              }`}>
                <h4 className="font-bold text-sm text-slate-400 uppercase mb-4">{isRtl ? 'هيكل الإشراف والموظفين' : 'Structure & Accountable Personnel'}</h4>
                <div className="space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{isRtl ? 'الإقليم المشرف:' : 'Supervising Region:'}</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{region?.name}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t pt-2">
                    <span className="text-slate-500">{isRtl ? 'مستوى الوصول المتاح:' : 'Station Access Scope:'}</span>
                    <span className="font-bold text-emerald-500">{isRtl ? 'أمين عهدة محطة مفردة' : 'Single Station Custodian'}</span>
                  </div>
                  <div className="border-t pt-2">
                    <p className="text-xs text-slate-500 mb-1">{isRtl ? 'أمناء العهدة ومستخدمي المحطة المسجلين:' : 'Authorized Station Custodians:'}</p>
                    <div className="space-y-1 mt-1">
                      {users.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">{isRtl ? 'لا يوجد مستخدمين مخصصين لهذه المحطة بعد.' : 'No users assigned yet.'}</p>
                      ) : (
                        users.map(u => (
                          <div key={u.id} className="flex justify-between text-[11px] font-medium bg-slate-50 dark:bg-slate-800 p-1 rounded">
                            <span>{u.full_name}</span>
                            <span className="text-slate-400">{u.email}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PENDING LIST PANEL */}
        {activeSubTab === 'pending' && (
          <div className="space-y-4" id="panel-pending">
            {pendingTxs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <AlertCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                <p>{isRtl ? 'لا توجد مصاريف معلقة مطابقة للمواصفات.' : 'No pending expenses found for this station.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-left text-xs text-slate-500 dark:text-slate-400 min-w-[650px]" dir={isRtl ? 'rtl' : 'ltr'}>
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                    <tr>
                      <th className="p-3">TX No</th>
                      <th className="p-3">{t.date}</th>
                      <th className="p-3">{t.description}</th>
                      <th className="p-3">{t.amount}</th>
                      <th className="p-3 text-center">{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pendingTxs.map((tx) => {
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/10">
                          <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">{tx.transaction_no}</td>
                          <td className="p-3 whitespace-nowrap">{tx.date}</td>
                          <td className="p-3 font-medium max-w-sm truncate" title={tx.description}>{tx.description}</td>
                          <td className="p-3 font-bold text-slate-900 dark:text-white font-mono">{tx.amount.toLocaleString()} EGP</td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => setSelectedTxForVoucher(tx)}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded text-[10px] font-bold"
                            >
                              {isRtl ? 'عرض وطباعة السند' : 'Print Voucher'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* UNDER SETTLEMENT PANEL */}
        {activeSubTab === 'settled' && (
          <div className="space-y-4" id="panel-settled">
            {settledTxs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <AlertCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                <p>{isRtl ? 'لا توجد مصاريف تحت التسوية حالياً.' : 'No under-settlement expenses found.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-left text-xs text-slate-500 dark:text-slate-400 min-w-[650px]" dir={isRtl ? 'rtl' : 'ltr'}>
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                    <tr>
                      <th className="p-3">TX No</th>
                      <th className="p-3">{isRtl ? 'رقم سند الصرف' : 'Voucher No'}</th>
                      <th className="p-3">{t.date}</th>
                      <th className="p-3">{t.description}</th>
                      <th className="p-3">{t.amount}</th>
                      <th className="p-3 text-center">{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {settledTxs.map((tx) => {
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/10">
                          <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">{tx.transaction_no}</td>
                          <td className="p-3 font-mono text-emerald-600 dark:text-emerald-400 font-bold">{tx.voucher_no}</td>
                          <td className="p-3 whitespace-nowrap">{tx.date}</td>
                          <td className="p-3 font-medium max-w-sm truncate" title={tx.description}>{tx.description}</td>
                          <td className="p-3 font-bold text-slate-900 dark:text-white font-mono">{tx.amount.toLocaleString()} EGP</td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => setSelectedTxForVoucher(tx)}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded text-[10px] font-bold"
                            >
                              {isRtl ? 'عرض السند' : 'View Voucher'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* RECONCILIATION PANEL */}
        {activeSubTab === 'reconciliation' && (
          <div className="space-y-4" id="panel-reconciliation">
            <div className={`p-6 rounded-2xl border ${
              theme === 'dark' ? 'bg-[#1e293b]/30 border-[#334155]' : 'bg-white border-slate-200'
            }`}>
              <div className="flex justify-between items-center mb-4 pb-2 border-b">
                <h4 className="font-bold text-sm text-slate-400 uppercase">{isRtl ? 'بيان التسوية والمطابقة الكلي' : 'Cash Reconciliation Balance Statement'}</h4>
                <button
                  onClick={triggerPrintSection}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border rounded text-[10px] font-bold"
                >
                  <Printer size={12} />
                  <span>{isRtl ? 'طباعة البيان المالي' : 'Print Statement'}</span>
                </button>
              </div>

              <div className="space-y-4 text-xs font-medium">
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">{isRtl ? '1. رصيد العهدة الكلية للمحطة (A):' : '1. Total Station Custody Limit (A):'}</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">{metrics.custodyValue.toLocaleString()} EGP</span>
                </div>
                
                <div className="flex justify-between py-2 border-t text-amber-600">
                  <span className="font-semibold">{isRtl ? '2. إجمالي المصروفات المعلقة حالياً (B):' : '2. Total Outstanding Pending Outlays (B):'}</span>
                  <span className="font-mono font-bold">- {metrics.pendingTotal.toLocaleString()} EGP</span>
                </div>

                <div className="flex justify-between py-2 border-t text-indigo-500">
                  <span className="font-semibold">{isRtl ? '3. إجمالي السندات تحت التسوية (C):' : '3. Total Pending Reconciliation Vouchers (C):'}</span>
                  <span className="font-mono font-bold">- {metrics.underSettlementTotal.toLocaleString()} EGP</span>
                </div>

                <div className="flex justify-between py-3 border-t-2 border-emerald-600/30 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                  <span>{isRtl ? '4. الرصيد النقدي المتوفر فعلياً بالخزينة (A - B - C):' : '4. Net Available Safe Cash (A - B - C):'}</span>
                  <span className="font-mono">{metrics.cashAvailable.toLocaleString()} EGP</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VOUCHERS PANEL */}
        {activeSubTab === 'vouchers' && (
          <div className="space-y-4" id="panel-vouchers">
            {vouchers.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <AlertCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                <p>{isRtl ? 'لم يتم العثور على أي سندات دفع معتمدة.' : 'No cash payment vouchers issued yet.'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {vouchers.map((vNo) => {
                  const txs = stationTxs.filter(tx => tx.voucher_no === vNo);
                  const totalAmount = txs.reduce((sum, tx) => sum + tx.amount, 0);
                  const firstTx = txs[0];

                  return (
                    <div 
                      key={vNo}
                      className={`p-5 rounded-2xl border ${
                        theme === 'dark' ? 'bg-[#1e293b]/40 border-[#334155]' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-[10px] font-bold font-mono text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            {vNo}
                          </span>
                          <p className="text-xs text-slate-400 font-semibold mt-1">
                            {isRtl ? 'تاريخ السند:' : 'Issued:'} {firstTx?.voucher_date || firstTx?.date}
                          </p>
                        </div>
                        <p className="text-xs font-black text-slate-900 dark:text-white font-mono">
                          {totalAmount.toLocaleString()} EGP
                        </p>
                      </div>

                      <div className="text-[11px] text-slate-500 line-clamp-2 min-h-[2.5rem] mb-4">
                        {txs.map(t => t.description).join(', ')}
                      </div>

                      <button
                        onClick={() => setSelectedTxForVoucher(firstTx)}
                        className="w-full flex items-center justify-center gap-1 py-1.5 border border-emerald-600/30 text-emerald-600 hover:text-white hover:bg-emerald-600 text-xs font-bold rounded-lg transition-all"
                      >
                        <Printer size={12} />
                        <span>{isRtl ? 'طباعة سند الدفع' : 'Print Voucher Doc'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* AUDIT LOGS PANEL */}
        {activeSubTab === 'logs' && (
          <div className="space-y-4" id="panel-logs">
            <h4 className="font-bold text-xs uppercase text-slate-400">{isRtl ? 'سجل الرقابة والتدقيق التاريخي للنشاط' : 'Historical Station Audit Trail'}</h4>
            
            {stationLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <AlertCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                <p>{isRtl ? 'لا توجد حركات تدقيق مسجلة لهذه المحطة.' : 'No audit logs found.'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stationLogs.slice(0, 50).map((log) => (
                  <div 
                    key={log.id} 
                    className={`p-3.5 rounded-xl border text-xs flex gap-3 items-start ${
                      theme === 'dark' ? 'bg-[#1e293b]/30 border-[#334155]' : 'bg-slate-50/50 border-slate-200'
                    }`}
                  >
                    <div className="p-2 bg-slate-200 dark:bg-slate-800 rounded-lg text-slate-500 font-mono text-[9px] font-bold">
                      {log.action.substring(0, 3).toUpperCase()}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-slate-800 dark:text-slate-100">{log.user_name}</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(log.timestamp).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                        </span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 font-medium">{log.details}</p>
                      <div className="inline-block text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                        {log.action}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* PRINT DIALOG OVERLAY (Interactive preview popup modal) */}
      {selectedTxForVoucher && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden" id="voucher-preview-modal">
          <div className={`w-full max-w-3xl rounded-2xl shadow-xl overflow-hidden border ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
              <h3 className="font-bold text-sm">
                {isRtl ? 'معاينة سند الصرف النقدي للمحطة' : 'Payment Voucher Print Preview'}
              </h3>
              <button 
                onClick={() => setSelectedTxForVoucher(null)}
                className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 md:p-6 overflow-auto max-h-[75vh] bg-slate-100 dark:bg-slate-900/40">
              {/* Actual interactive preview box */}
              {renderVoucherSheet(selectedTxForVoucher)}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
              <button
                onClick={() => setSelectedTxForVoucher(null)}
                className="px-4 py-2 border rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {isRtl ? 'إغلاق' : 'Close Preview'}
              </button>
              <button
                onClick={triggerPrintSection}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm"
              >
                <Printer size={14} />
                <span>{isRtl ? 'طباعة المستند فوراً' : 'Print Voucher Document'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
