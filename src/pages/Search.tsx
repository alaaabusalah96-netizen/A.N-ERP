import React, { useState, useEffect } from 'react';
import { CustodyDB } from '../db';
import { useScreenListeners } from '../firebase';
import { translations, Language, Theme, Transaction, Station } from '../types';
import { Search as SearchIcon, Filter, X, Sliders, DollarSign, Calendar, Eye, FileCheck, Clock, Printer } from 'lucide-react';
import VoucherModal from '../components/VoucherModal';

interface SearchProps {
  language: Language;
  theme: Theme;
  onNavigate: (tab: string) => void;
  onSelectTransactionForSettle?: (tx: Transaction) => void;
}

export default function Search({ 
  language, 
  theme, 
  onNavigate,
  onSelectTransactionForSettle 
}: SearchProps) {
  useScreenListeners(['transactions']);

  const t = translations[language];
  const isRtl = language === 'ar';

  const activeUser = CustodyDB.getActiveUser();
  const allStations = CustodyDB.getScopedStations();

  // Determine allowed stations for active user
  let allowedStations: Station[] = [];
  if (activeUser) {
    if (activeUser.role === 'Admin' || activeUser.role === 'SystemAdmin') {
      allowedStations = allStations;
    } else if (activeUser.role === 'RegionalManager') {
      allowedStations = allStations.filter(s => s.region_id === activeUser.region_id);
    } else {
      allowedStations = allStations.filter(s => s.id === activeUser.station_id);
    }
  }

  const allowedIds = allowedStations.map(s => s.id);
  
  const [dbVersion, setDbVersion] = useState(0);
  useEffect(() => {
    const handleUpdate = () => setDbVersion(prev => prev + 1);
    window.addEventListener('custody_db_updated', handleUpdate);
    return () => window.removeEventListener('custody_db_updated', handleUpdate);
  }, []);

  const allTransactions = CustodyDB.getScopedTransactions().filter(tx => tx.station_id && allowedIds.includes(tx.station_id));

  // Search & Filter states
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'Under Settlement'>('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [printingTx, setPrintingTx] = useState<Transaction | null>(null);

  // Results state
  const [results, setResults] = useState<Transaction[]>(allTransactions);
  const [searchLimit, setSearchLimit] = useState(20);

  // Instant Search calculation logic on input changes
  useEffect(() => {
    let filtered = [...allTransactions];

    // 1. Filter by Search Query (Description, Tx No, Voucher No, Notes)
    if (query.trim() !== '') {
      const q = query.toLowerCase().trim();
      filtered = filtered.filter(tx => {
        return (
          tx.transaction_no.toLowerCase().includes(q) ||
          tx.description.toLowerCase().includes(q) ||
          (tx.voucher_no && tx.voucher_no.toLowerCase().includes(q)) ||
          tx.date.includes(q) ||
          (tx.notes && tx.notes.toLowerCase().includes(q))
        );
      });
    }

    // 2. Filter by Status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(tx => tx.status === statusFilter);
    }

    // 4. Filter by Min/Max Amount
    if (minAmount !== '') {
      const min = parseFloat(minAmount);
      if (!isNaN(min)) {
        filtered = filtered.filter(tx => tx.amount >= min);
      }
    }
    if (maxAmount !== '') {
      const max = parseFloat(maxAmount);
      if (!isNaN(max)) {
        filtered = filtered.filter(tx => tx.amount <= max);
      }
    }

    // Sort by date descending
    filtered.sort((a, b) => b.date.localeCompare(a.date));

    setResults(filtered);
  }, [query, statusFilter, minAmount, maxAmount, allTransactions]);

  const handleClearFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setMinAmount('');
    setMaxAmount('');
  };

  const handleSettleAction = (tx: Transaction) => {
    if (onSelectTransactionForSettle) {
      onSelectTransactionForSettle(tx);
      onNavigate('voucher');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl flex items-center gap-2">
          <SearchIcon className="text-emerald-500" />
          <span>{t.search}</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {isRtl 
            ? 'البحث الفوري المتكامل والمتقدم في سجلات وجداول المصروفات والمستندات.' 
            : 'Fuzzy instant search across custody ledgers, transactions, vouchers, dates, and amounts.'
          }
        </p>
      </div>

      {/* Main Search Panel */}
      <div className="grid gap-6 lg:grid-cols-4">
        {/* Left Hand: Filter parameters sidebar */}
        <div className={`p-5 rounded-2xl border h-fit space-y-4 ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between border-b pb-2.5 border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <Sliders size={14} className="text-emerald-500" />
              <span>{t.filters}</span>
            </div>
            <button
              onClick={handleClearFilters}
              className="text-[10px] text-rose-500 hover:underline font-semibold"
            >
              {t.clearFilters}
            </button>
          </div>

          {/* Status filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">{t.status}</label>
            <div className="flex flex-col gap-1.5 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  checked={statusFilter === 'all'}
                  onChange={() => setStatusFilter('all')}
                  className="accent-emerald-600"
                />
                <span>{isRtl ? 'الكل' : 'All Statuses'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-amber-600">
                <input
                  type="radio"
                  name="status"
                  checked={statusFilter === 'Pending'}
                  onChange={() => setStatusFilter('Pending')}
                  className="accent-emerald-600"
                />
                <span>{t.statusPending}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-emerald-600">
                <input
                  type="radio"
                  name="status"
                  checked={statusFilter === 'Under Settlement'}
                  onChange={() => setStatusFilter('Under Settlement')}
                  className="accent-emerald-600"
                />
                <span>{t.statusSettled}</span>
              </label>
            </div>
          </div>

          {/* Amount range */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">{isRtl ? 'نطاق المبلغ (جنيه)' : 'Amount Range (EGP)'}</label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                placeholder={isRtl ? 'الأدنى' : 'Min'}
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className={`w-1/2 px-2.5 py-1.5 rounded-lg border text-xs font-mono text-center focus:outline-none ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
                }`}
              />
              <span className="text-slate-400 text-xs">-</span>
              <input
                type="number"
                placeholder={isRtl ? 'الأقصى' : 'Max'}
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className={`w-1/2 px-2.5 py-1.5 rounded-lg border text-xs font-mono text-center focus:outline-none ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Right Hand: Search box input + Results Grid */}
        <div className="lg:col-span-3 space-y-4">
          {/* Main search text input */}
          <div className={`p-4 rounded-xl border flex items-center gap-3 ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex-1 relative">
              <SearchIcon className="absolute top-2.5 left-3 text-slate-400 h-4 w-4" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className={`w-full text-xs py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${
                  isRtl ? 'pr-3 pl-10' : 'pl-10 pr-3'
                } ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
                }`}
                autoFocus
              />
            </div>
          </div>

          {/* Results summary bar */}
          <div className="text-xs font-semibold text-slate-500 flex justify-between px-1">
            <span>
              {isRtl 
                ? `تم العثور على ${results.length} حركة مطابقة للبحث` 
                : `Found ${results.length} matching transactions`
              }
            </span>
            <span>{t.instantSearch}: ON</span>
          </div>

          {/* Table list of matching items */}
          <div className={`rounded-2xl border overflow-hidden ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold bg-slate-50/50 dark:bg-slate-800/10">
                    <th className="py-2.5 px-3 font-semibold text-slate-500">{t.transactionNo}</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-500">{t.date}</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-500">{t.status}</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-500">{t.description}</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-500">{isRtl ? 'رقم السند' : 'Voucher No'}</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-500 text-right">{t.amount}</th>
                    <th className="py-2.5 px-3 font-semibold text-slate-500 text-center">{isRtl ? 'إجراء' : 'Workflow'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {results.slice(0, searchLimit).map((tx) => {
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                        <td className="py-3 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">{tx.transaction_no}</td>
                        <td className="py-3 px-3 font-mono text-slate-500 dark:text-slate-400">{tx.date}</td>
                        <td className="py-3 px-3">
                          {tx.status === 'Pending' ? (
                            <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/10">
                              {t.statusPending}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/10">
                              {t.statusSettled}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300 max-w-xs truncate" title={tx.description}>
                          <div>{tx.description}</div>
                          {tx.notes && <div className="text-[10px] text-slate-400 font-mono mt-0.5">Note: {tx.notes}</div>}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-indigo-500">{tx.voucher_no || '-'}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                          {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Print Button */}
                            <button
                              onClick={() => setPrintingTx(tx)}
                              className="p-1 rounded bg-blue-500/10 hover:bg-blue-500 text-blue-600 hover:text-white transition-all"
                              title={isRtl ? 'معاينة وطباعة مستند الصرف' : 'Print Voucher'}
                            >
                              <Printer size={12} />
                            </button>

                            {tx.status === 'Pending' ? (
                              <button
                                onClick={() => handleSettleAction(tx)}
                                className="px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white transition-all text-[10px] font-bold shrink-0"
                              >
                                {isRtl ? 'تسوية' : 'Settle'}
                              </button>
                            ) : (
                              <span className="text-slate-400 text-[10px] font-mono shrink-0 font-bold">
                                {tx.voucher_date}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {results.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-medium">
                        {t.noData}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {results.length > searchLimit && (
              <div className="flex justify-center p-4 border-t border-slate-100 dark:border-slate-800/40">
                <button
                  onClick={() => setSearchLimit(prev => prev + 20)}
                  className="px-4 py-2 text-xs font-bold bg-emerald-500/10 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <span>{isRtl ? 'عرض المزيد من نتائج البحث' : 'Load More Results'}</span>
                  <span className="text-[10px] opacity-75">({results.length - searchLimit} {isRtl ? 'متبقي' : 'remaining'})</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

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
