import React, { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, KeyRound, AlertTriangle, CheckCircle2, Lock, Clock } from 'lucide-react';
import { PaginationToolbar, usePaginatedList } from './PaginationToolbar';

interface SuperAdminSecurityTabProps {
  isRtl: boolean;
}

interface CredentialDetail {
  userId: string;
  pepperVersion: number;
  format: string;
}

interface HashMigrationData {
  success: boolean;
  totalCredentials: number;
  legacyCount: number;
  transientV2Count: number;
  pbkdf2Count: number;
  details: CredentialDetail[];
  deprecationPolicy: {
    deprecatedHashFunctions: string[];
    announcementDate: string;
    sunsetDate: string;
    gracePeriodAutoMigrateOnLogin: boolean;
    sunsetEnforcementAction: string;
  };
  messageAr?: string;
  messageEn?: string;
}

export const SuperAdminSecurityTab: React.FC<SuperAdminSecurityTabProps> = ({ isRtl }) => {
  const [data, setData] = useState<HashMigrationData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/hash-migration-status');
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.message || 'Failed to retrieve hash migration status');
      }
    } catch (err: any) {
      setError(isRtl ? 'تعذر الاتصال بالخادم لجلب حالة التشفير' : 'Failed to connect to server for encryption status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const {
    items: paginatedDetails,
    totalItems,
    totalPages,
    currentPage,
    pageSize,
    setCurrentPage,
    setPageSize,
  } = usePaginatedList(data?.details || [], 10);

  const total = data?.totalCredentials || 0;
  const upgraded = data?.pbkdf2Count || 0;
  const legacy = (data?.legacyCount || 0) + (data?.transientV2Count || 0);
  const percentUpgraded = total > 0 ? Math.round((upgraded / total) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {isRtl ? 'إدارة التشفير وأمان حسابات المنصة (المرحلة 4.1)' : 'Platform Security & Encryption Audit (Phase 4.1)'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isRtl
                  ? 'متابعة ترقية تشفير كلمات المرور إلى معيار PBKDF2 (210,000 دورة) والجدول الزمني لإلغاء التشفير القديم'
                  : 'Monitor PBKDF2 (210,000 iterations) password upgrades and legacy sunset policy timeline'}
              </p>
            </div>
          </div>

          <button
            onClick={fetchStatus}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>{isRtl ? 'تحديث الحالة الآن' : 'Refresh Status'}</span>
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Progress KPI Cards */}
        {data && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                <span>{isRtl ? 'إجمالي الحسابات المسجلة' : 'Total Credentials'}</span>
                <KeyRound size={16} className="text-slate-400" />
              </div>
              <div className="text-xl font-black text-slate-900 dark:text-white">{total}</div>
              <div className="text-[11px] text-slate-500 mt-1">
                {isRtl ? 'كافة مستخدمي النظام' : 'All users in authentication database'}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                <span>{isRtl ? 'محدث بالكامل (PBKDF2 210k)' : 'Upgraded to PBKDF2'}</span>
                <CheckCircle2 size={16} />
              </div>
              <div className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                {upgraded} <span className="text-xs font-bold">({percentUpgraded}%)</span>
              </div>
              <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1">
                {isRtl ? 'تشفير قوي متعدد الدورات مع Pepper' : 'Authoritative multi-round server hashing'}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center justify-between text-xs font-bold text-amber-600 dark:text-amber-400 mb-1">
                <span>{isRtl ? 'قيد الهجرة التلقائية (Legacy)' : 'Pending Auto-Migration'}</span>
                <Clock size={16} />
              </div>
              <div className="text-xl font-black text-amber-700 dark:text-amber-300">
                {legacy} <span className="text-xs font-bold">({100 - percentUpgraded}%)</span>
              </div>
              <div className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-1">
                {isRtl ? 'يتم الترقية تلقائياً فور أول تسجيل دخول' : 'Upgrades smoothly upon next successful login'}
              </div>
            </div>
          </div>
        )}

        {/* Upgrade Progress Bar */}
        {data && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              <span>{isRtl ? 'نسبة إنجاز هجرة التشفير نحو PBKDF2' : 'PBKDF2 Migration Progress'}</span>
              <span>{percentUpgraded}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${percentUpgraded}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Policy Timeline Card */}
      {data?.deprecationPolicy && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 text-slate-900 dark:text-white font-bold text-sm">
            <Lock size={18} className="text-indigo-500" />
            <span>{isRtl ? 'السياسة الزمنية لإلغاء التشفير القديم (Sunset Policy)' : 'Legacy Hash Deprecation & Sunset Timeline'}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="font-bold text-slate-800 dark:text-slate-200 mb-1">
                {isRtl ? 'فترة الهجرة التلقائية السلسة (Grace Period)' : 'Grace Period Auto-Migration Mode'}
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                {isRtl
                  ? `بدأت من تاريخ (${data.deprecationPolicy.announcementDate}) وحتى موعد الإيقاف النهائى (${data.deprecationPolicy.sunsetDate}). خلال هذه الفترة، عند تسجيل دخول أي مستخدم بكلمة المرور الصحيحة، يقوم النظام تلقائياً بتحديث تشفيره إلى PBKDF2 دون أي إزعاج.`
                  : `Active from ${data.deprecationPolicy.announcementDate} to ${data.deprecationPolicy.sunsetDate}. During this period, whenever a user logs in with their correct password, the system automatically migrates their hash to PBKDF2 without interruption.`}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
              <div className="font-bold text-amber-800 dark:text-amber-300 mb-1">
                {isRtl ? 'الإيقاف النهائي بعد انتهاء المهلة (Sunset Enforcement)' : 'Post-Sunset Enforcement Action'}
              </div>
              <p className="text-amber-700/90 dark:text-amber-400/90 leading-relaxed">
                {isRtl
                  ? `بعد تاريخ (${data.deprecationPolicy.sunsetDate})، يتم إيقاف دعم التشفير القديم (SHA-256). أي حساب لم يسجل دخوله خلال فترة المهلة سيطلب منه النظام استخدام "نسيت كلمة المرور" لإعادة التعيين بتشفير حديث.`
                  : `After ${data.deprecationPolicy.sunsetDate}, legacy SHA-256 authentication will be disabled. Any account that has not logged in during the grace period will be guided to reset their password via Forgot Password OTP.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Accounts Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {isRtl ? 'تفاصيل حالة التشفير للحسابات' : 'Credential Hash Formats Table'}
          </h3>
          <span className="text-xs text-slate-400 font-semibold">
            {isRtl ? `إجمالي: ${totalItems} حساب` : `Total: ${totalItems} accounts`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                <th className="p-4">{isRtl ? 'معرّف الحساب (User ID)' : 'User ID'}</th>
                <th className="p-4">{isRtl ? 'نوع التشفير (Format)' : 'Hash Format'}</th>
                <th className="p-4">{isRtl ? 'إصدار المفتاح (Pepper)' : 'Pepper Version'}</th>
                <th className="p-4">{isRtl ? 'الحالة (Status)' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {paginatedDetails.map((item) => (
                <tr key={item.userId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                    {item.userId}
                  </td>
                  <td className="p-4 font-mono text-slate-600 dark:text-slate-400">
                    {item.format}
                  </td>
                  <td className="p-4 font-semibold text-slate-700 dark:text-slate-300">
                    v{item.pepperVersion}
                  </td>
                  <td className="p-4">
                    {item.pepperVersion === 2 ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold inline-flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        <span>{isRtl ? 'محدّث PBKDF2' : 'Upgraded PBKDF2'}</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 text-[11px] font-bold inline-flex items-center gap-1">
                        <Clock size={12} />
                        <span>{isRtl ? 'يحتاج هجرة تلقائية' : 'Pending Migration'}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {paginatedDetails.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400 text-xs font-semibold">
                    {loading ? (isRtl ? 'جاري التحميل...' : 'Loading...') : (isRtl ? 'لا توجد بيانات' : 'No credential records found')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalItems > 0 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800">
            <PaginationToolbar
              totalItems={totalItems}
              totalPages={totalPages}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              isRtl={isRtl}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAdminSecurityTab;
