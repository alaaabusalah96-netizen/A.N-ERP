import React from 'react';
import { Language, Theme } from '../types';
import { 
  Coins, 
  Minus, 
  Scale, 
  ShieldCheck, 
  TrendingDown, 
  Wallet, 
  FileCheck,
  Clock,
  AlertCircle
} from 'lucide-react';

interface ReconciliationDashboardProps {
  language: Language;
  theme: Theme;
  custodyBase: number;
  settledTotal: number;
  totalUnderSettlement: number;
  totalPending: number;
  netCashAvailable: number;
  pendingCount: number;
  underSettlementCount: number;
}

export default function ReconciliationDashboard({
  language,
  theme,
  custodyBase,
  settledTotal,
  totalUnderSettlement,
  totalPending,
  netCashAvailable,
  pendingCount,
  underSettlementCount
}: ReconciliationDashboardProps) {
  const isRtl = language === 'ar';

  const formatVal = (val: number) => {
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EGP';
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
      
      {/* CARD 1: NOMINAL CUSTODY BASE */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden group hover:-translate-y-1 ${
        theme === 'dark' 
          ? 'bg-slate-900/95 border-slate-800 text-slate-100 hover:border-slate-700 shadow-[0_4px_20px_rgba(0,0,0,0.3)]' 
          : 'bg-white border-slate-200/80 text-slate-800 hover:shadow-lg hover:border-slate-300 shadow-[0_2px_12px_rgba(15,23,42,0.04)]'
      }`}>
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-2xl -mr-6 -mt-6 group-hover:scale-125 transition-transform" />
        <div className="flex items-center justify-between mb-3.5 relative z-10">
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {isRtl ? 'العهدة الأساسية الإسمية' : 'Nominal Base Custody'}
          </span>
          <span className={`p-1.5 sm:p-2 rounded-xl shrink-0 ${
            theme === 'dark' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-55 bg-indigo-50 text-indigo-600'
          }`}>
            <Wallet size={16} />
          </span>
        </div>
        <div className="relative z-10">
          <div className="text-base sm:text-lg md:text-xl font-black font-mono tracking-tight text-indigo-600 dark:text-indigo-400 break-all">
            {formatVal(custodyBase)}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-sans leading-relaxed">
            {isRtl 
              ? 'القيمة المالية الأصلية المخصصة للمحطة لإدارة المصروفات التشغيلية.' 
              : 'Original operational fund allocation registered in KEMIT ERP.'}
          </p>
        </div>
      </div>

      {/* CARD 2: APPROVED & SETTLED */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden group hover:-translate-y-1 ${
        theme === 'dark' 
          ? 'bg-slate-900/95 border-slate-800 text-slate-100 hover:border-slate-700 shadow-[0_4px_20px_rgba(0,0,0,0.3)]' 
          : 'bg-white border-slate-200/80 text-slate-800 hover:shadow-lg hover:border-slate-300 shadow-[0_2px_12px_rgba(15,23,42,0.04)]'
      }`}>
        <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 dark:bg-rose-500/10 rounded-full blur-2xl -mr-6 -mt-6 group-hover:scale-125 transition-transform" />
        <div className="flex items-center justify-between mb-3.5 relative z-10">
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {isRtl ? 'المنصرف المعتمد المخصوم' : 'Settled & Deducted'}
          </span>
          <span className={`p-1.5 sm:p-2 rounded-xl shrink-0 ${
            theme === 'dark' ? 'bg-rose-500/10 text-rose-400' : 'bg-rose-50 text-rose-600'
          }`}>
            <FileCheck size={16} />
          </span>
        </div>
        <div className="relative z-10">
          <div className="text-base sm:text-lg md:text-xl font-black font-mono tracking-tight text-rose-600 dark:text-rose-400 break-all">
            ({formatVal(settledTotal)})
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-sans leading-relaxed">
            {isRtl 
              ? 'إجمالي المصروفات التي تم تسويتها واعتمادها نهائياً وخصمها من العهدة.' 
              : 'Expenses fully reconciled, audited, and subtracted from operational custody.'}
          </p>
        </div>
      </div>

      {/* CARD 3: IN-FLIGHT FUNDS (PENDING & UNDER SETTLEMENT) */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden group hover:-translate-y-1 ${
        theme === 'dark' 
          ? 'bg-slate-900/95 border-slate-800 text-slate-100 hover:border-slate-700 shadow-[0_4px_20px_rgba(0,0,0,0.3)]' 
          : 'bg-white border-slate-200/80 text-slate-800 hover:shadow-lg hover:border-slate-300 shadow-[0_2px_12px_rgba(15,23,42,0.04)]'
      }`}>
        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 dark:bg-amber-500/10 rounded-full blur-2xl -mr-6 -mt-6 group-hover:scale-125 transition-transform" />
        <div className="flex items-center justify-between mb-3 relative z-10">
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {isRtl ? 'العمليات والمستندات الجارية' : 'In-Flight Operations'}
          </span>
          <span className={`p-1.5 sm:p-2 rounded-xl shrink-0 ${
            theme === 'dark' ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600'
          }`}>
            <Clock size={16} />
          </span>
        </div>
        <div className="relative z-10 space-y-2">
          <div className="flex items-center justify-between text-[11px] sm:text-xs border-b border-slate-100 dark:border-slate-800/80 pb-1.5 flex-wrap gap-1">
            <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              {isRtl ? 'تحت التسوية:' : 'Vouchers:'}
              <span className="text-[9px] text-slate-400 font-mono">({underSettlementCount})</span>
            </span>
            <span className="font-mono font-bold text-blue-600 dark:text-blue-400 break-all">{formatVal(totalUnderSettlement)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] sm:text-xs pt-0.5 flex-wrap gap-1">
            <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {isRtl ? 'معلق بالخزينة:' : 'Pending:'}
              <span className="text-[9px] text-slate-400 font-mono">({pendingCount})</span>
            </span>
            <span className="font-mono font-bold text-amber-600 dark:text-amber-500 break-all">{formatVal(totalPending)}</span>
          </div>
        </div>
      </div>

      {/* CARD 4: LIQUID CASH AVAILABLE */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden group hover:-translate-y-1 ${
        theme === 'dark' 
          ? 'bg-slate-900/95 border-emerald-950/40 text-slate-100 hover:border-emerald-800 shadow-[0_4px_25px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20' 
          : 'bg-emerald-50/20 border-emerald-200/80 text-slate-800 hover:shadow-xl hover:border-emerald-300 shadow-[0_4px_15px_rgba(16,185,129,0.06)] ring-1 ring-emerald-500/5'
      }`}>
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full blur-2xl -mr-6 -mt-6 group-hover:scale-125 transition-transform" />
        <div className="flex items-center justify-between mb-3.5 relative z-10">
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            {isRtl ? 'السيولة المتبقية بالخزينة' : 'Available Liquid Cash'}
          </span>
          <span className={`p-1.5 sm:p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0`}>
            <Coins size={16} />
          </span>
        </div>
        <div className="relative z-10">
          <div className="text-base sm:text-lg md:text-xl font-black font-mono tracking-tight text-emerald-600 dark:text-emerald-400 break-all">
            {formatVal(netCashAvailable)}
          </div>
          
          <div className="mt-2.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full w-fit">
            <ShieldCheck size={11} />
            <span>{isRtl ? 'مطابق وجاهز للجرد' : 'Reconciled & Audited'}</span>
          </div>
        </div>
      </div>

    </div>
  );
}
