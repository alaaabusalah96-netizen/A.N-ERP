import React from 'react';
import { 
  Building, 
  Wallet, 
  Clock, 
  FileCheck, 
  TrendingUp, 
  ArrowRight,
  ArrowLeft,
  Search,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { CustodyDB } from '../db';
import { translations, Language, Theme, Transaction, Station } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

interface RegionalDashboardProps {
  language: Language;
  theme: Theme;
  setCurrentTab: (tab: string) => void;
  setSelectedStationId: (id: string | null) => void;
}

export default function RegionalDashboard({
  language,
  theme,
  setCurrentTab,
  setSelectedStationId
}: RegionalDashboardProps) {
  const t = translations[language];
  const isRtl = language === 'ar';
  const activeUser = CustodyDB.getActiveUser();
  
  // Scoped to manager's region
  const regions = CustodyDB.getScopedRegions();
  const regionId = activeUser?.region_id || regions[0]?.id || 'reg-1-1';
  const currentRegion = regions.find(r => r.id === regionId);
  const stations = CustodyDB.getScopedStations().filter(s => s.region_id === regionId);
  
  // Aggregate Metrics
  const metrics = CustodyDB.getReconciliation(undefined, regionId);
  
  // Get all transactions for stations in this region
  const stationIds = stations.map(s => s.id);
  const allTransactions = CustodyDB.getScopedTransactions();
  const regionalTransactions = allTransactions.filter(t => t.station_id && stationIds.includes(t.station_id));
  
  // Sort transactions by date/time (newest first)
  const sortedTransactions = [...regionalTransactions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  // Prepare chart data (Custody breakdown per station)
  const chartData = stations.map(s => {
    const stMetrics = CustodyDB.getReconciliation(s.id);
    return {
      name: s.station_name,
      custody: stMetrics.custodyValue,
      available: stMetrics.cashAvailable,
      pending: stMetrics.pendingTotal,
      settled: stMetrics.underSettlementTotal
    };
  });

  const pieData = [
    { name: t.totalPending, value: metrics.pendingTotal, color: '#f59e0b' },
    { name: t.totalUnderSettlement, value: metrics.underSettlementTotal, color: '#10b981' },
    { name: t.totalCashAvailable, value: metrics.cashAvailable, color: '#3b82f6' }
  ].filter(item => item.value > 0);

  const viewStationDetails = (stationId: string) => {
    setSelectedStationId(stationId);
    setCurrentTab('station-details');
  };

  return (
    <div className="space-y-6" id="regional-dashboard-container">
      {/* Upper Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {t.regionalDashboard} - <span className="text-emerald-600 dark:text-emerald-400">{currentRegion?.name || 'Cairo'}</span>
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isRtl 
              ? 'متابعة الأداء المالي، أرصدة العهد، والتسويات الجارية لجميع المحطات التابعة إقليمياً.'
              : 'Supervise custody parameters, cash balances, and pending settlements across all stations.'
            }
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentTab('stations')}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-sm"
          >
            <span>{isRtl ? 'عرض قائمة المحطات' : 'View Stations Directory'}</span>
            {isRtl ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
          </button>
        </div>
      </div>

      {/* Aggregate Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="regional-metrics-grid">
        {/* Total Stations */}
        <div className={`p-5 rounded-2xl border transition-all ${
          theme === 'dark' ? 'bg-[#1e293b]/50 border-[#334155]' : 'bg-white border-slate-200'
        }`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.totalStations}</p>
              <h3 className="text-3xl font-extrabold font-mono mt-2 text-slate-800 dark:text-white">
                {stations.length}
              </h3>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
              <Building size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-indigo-500 font-medium">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500" />
            <span>{isRtl ? 'جميع المحطات نشطة ومفعلة' : 'All regional stations are active'}</span>
          </div>
        </div>

        {/* Total Custody */}
        <div className={`p-5 rounded-2xl border transition-all ${
          theme === 'dark' ? 'bg-[#1e293b]/50 border-[#334155]' : 'bg-white border-slate-200'
        }`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.totalCustody}</p>
              <h3 className="text-2xl font-extrabold font-mono mt-2 text-emerald-600 dark:text-emerald-400">
                {metrics.custodyValue.toLocaleString()} <span className="text-xs font-normal">EGP</span>
              </h3>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
              <Wallet size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <span>{isRtl ? 'إجمالي العهد المرصودة للمحطات' : 'Aggregate capital allocated'}</span>
          </div>
        </div>

        {/* Pending & Under Settlement Summary */}
        <div className={`p-5 rounded-2xl border transition-all ${
          theme === 'dark' ? 'bg-[#1e293b]/50 border-[#334155]' : 'bg-white border-slate-200'
        }`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {isRtl ? 'المصاريف المعلقة (معلقة / تحت التسوية)' : 'Outlay In Process'}
              </p>
              <h3 className="text-2xl font-extrabold font-mono mt-2 text-amber-500">
                {(metrics.pendingTotal + metrics.underSettlementTotal).toLocaleString()} <span className="text-xs font-normal">EGP</span>
              </h3>
            </div>
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
              <Clock size={20} />
            </div>
          </div>
          <div className="mt-3 flex justify-between text-xs font-medium text-slate-400">
            <span className="text-amber-500 font-mono">{metrics.pendingCount} {t.statusPending}</span>
            <span>|</span>
            <span className="text-emerald-500 font-mono">{metrics.underSettlementCount} {t.statusSettled}</span>
          </div>
        </div>

        {/* Total Cash Available */}
        <div className={`p-5 rounded-2xl border transition-all ${
          theme === 'dark' ? 'bg-[#1e293b]/50 border-[#334155]' : 'bg-white border-slate-200'
        }`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.totalCashAvailable}</p>
              <h3 className="text-2xl font-extrabold font-mono mt-2 text-blue-500">
                {metrics.cashAvailable.toLocaleString()} <span className="text-xs font-normal">EGP</span>
              </h3>
            </div>
            <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-blue-500 font-medium">
            <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500" />
            <span>
              {isRtl 
                ? `نسبة السيولة المتاحة: ${((metrics.cashAvailable / (metrics.custodyValue || 1)) * 100).toFixed(1)}%`
                : `Liquidity ratio: ${((metrics.cashAvailable / (metrics.custodyValue || 1)) * 100).toFixed(1)}%`
              }
            </span>
          </div>
        </div>
      </div>

      {/* Visual Analytics Block */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Custody Share Bar Chart */}
        <div className={`lg:col-span-2 p-6 rounded-2xl border min-w-0 overflow-hidden ${
          theme === 'dark' ? 'bg-[#1e293b]/40 border-[#334155]' : 'bg-white border-slate-200'
        }`} id="station-custody-breakdown-chart">
          <h4 className="text-sm font-bold tracking-tight text-slate-400 uppercase mb-4">
            {isRtl ? 'توزيع أرصدة العهد والسيولة للمحطات (ج.م)' : 'Custody Allocation & Liquidity Per Station (EGP)'}
          </h4>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#f1f5f9'} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                    borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
                    color: theme === 'dark' ? '#f8fafc' : '#0f172a'
                  }}
                />
                <Bar dataKey="custody" name={t.totalCustody} fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="available" name={t.cashAvailable} fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* State Breakdown Pie Chart */}
        <div className={`p-6 rounded-2xl border min-w-0 overflow-hidden ${
          theme === 'dark' ? 'bg-[#1e293b]/40 border-[#334155]' : 'bg-white border-slate-200'
        }`} id="regional-status-breakdown-pie">
          <h4 className="text-sm font-bold tracking-tight text-slate-400 uppercase mb-4">
            {isRtl ? 'تحليل الحالة الإجمالية للسيولة النقدية' : 'Overall Cash Liquidity Breakdown'}
          </h4>
          <div className="h-56 w-full flex items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toLocaleString()} EGP`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400">{isRtl ? 'لا توجد بيانات' : 'No transactional data available'}</div>
            )}
          </div>
          <div className="space-y-2 mt-2">
            {pieData.map((item, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-500 dark:text-slate-400">{item.name}</span>
                </div>
                <span className="font-mono font-bold">{item.value.toLocaleString()} EGP</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Latest regional transactions list */}
      <div className={`p-6 rounded-2xl border ${
        theme === 'dark' ? 'bg-[#1e293b]/40 border-[#334155]' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-100 dark:border-slate-800">
          <div>
            <h4 className="font-bold text-base">{t.latestTransactionsRegion}</h4>
            <p className="text-xs text-slate-400">{isRtl ? 'آخر العمليات المدخلة على مستوى كافة المحطات بالإقليم' : 'Real-time timeline of expenses across stations'}</p>
          </div>
          <button 
            onClick={() => setCurrentTab('search')}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
          >
            <Search size={14} />
            <span>{isRtl ? 'البحث المتقدم والمطابقة' : 'Advanced Search & Verify'}</span>
          </button>
        </div>

        {sortedTransactions.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            <AlertCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
            <p>{isRtl ? 'لا توجد معاملات بعد في هذا الإقليم.' : 'No transactions found in this region.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-500 dark:text-slate-400 min-w-[700px]" dir={isRtl ? 'rtl' : 'ltr'}>
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                <tr>
                  <th className="p-3 rounded-l-lg">{t.transactionNo}</th>
                  <th className="p-3">{t.station}</th>
                  <th className="p-3">{t.date}</th>
                  <th className="p-3">{t.description}</th>
                  <th className="p-3">{t.amount}</th>
                  <th className="p-3">{t.status}</th>
                  <th className="p-3 rounded-r-lg text-center">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortedTransactions.slice(0, 10).map((tx) => {
                  const station = stations.find(s => s.id === tx.station_id);
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                        {tx.transaction_no || (isRtl ? 'قيد الانتظار' : 'Pending')}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                          {station?.station_name || 'Maadi Branch'}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={12} className="text-slate-400" />
                          <span>{tx.date}</span>
                        </div>
                      </td>
                      <td className="p-3 font-medium max-w-xs truncate text-slate-700 dark:text-slate-300" title={tx.description}>
                        {tx.description}
                      </td>
                      <td className="p-3 font-bold font-mono text-slate-900 dark:text-white whitespace-nowrap">
                        {tx.amount.toLocaleString()} EGP
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                          tx.status === 'Pending' 
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                            : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${tx.status === 'Pending' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                          {tx.status === 'Pending' ? t.statusPending : t.underSettlement}
                        </span>
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => viewStationDetails(tx.station_id || 'stn-1-1-1')}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded text-[10px] font-bold transition-colors"
                        >
                          {t.viewDashboard}
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
    </div>
  );
}
