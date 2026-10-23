import React, { useMemo } from 'react';
import { AppUser, Company, Region, Station } from '../types';
import { OrganizationEngine } from '../db/organizationEngine';
import { OrganizationUnit } from '../types/organization';
import { Info, Search, UserCheck, Building2, Users } from 'lucide-react';

interface SuperAdminImpersonateTabProps {
  supportUsersList: AppUser[];
  companies: Company[];
  regions: Region[];
  stations: Station[];
  supportUserSearch: string;
  setSupportUserSearch: (val: string) => void;
  impersonateError: string | null;
  handleStartImpersonation: (user: AppUser) => void;
  isRtl: boolean;
}

export const SuperAdminImpersonateTab: React.FC<SuperAdminImpersonateTabProps> = ({
  supportUsersList,
  companies,
  regions,
  stations,
  supportUserSearch,
  setSupportUserSearch,
  impersonateError,
  handleStartImpersonation,
  isRtl,
}) => {
  // Consolidate users grouped by their Organization Unit
  const groupedUnits = useMemo(() => {
    const groups = new Map<string, {
      unit: OrganizationUnit | null;
      id: string;
      titleAr: string;
      titleEn: string;
      code: string;
      companyName?: string;
      users: AppUser[];
    }>();

    for (const u of supportUsersList) {
      const unit = OrganizationEngine.resolveOrgUnitForEntity(u, u.company_id);
      const comp = companies.find(c => c.id === u.company_id);
      const groupId = unit ? unit.id : 'global-platform';
      const code = unit ? unit.code : 'PLATFORM';
      const titleAr = unit ? (unit.nameAr || unit.name) : 'إدارة المنصة العامة (بدون وحدة محددة)';
      const titleEn = unit ? (unit.nameEn || unit.name) : 'Global Platform Administration (Unassigned)';

      if (!groups.has(groupId)) {
        groups.set(groupId, {
          unit,
          id: groupId,
          titleAr,
          titleEn,
          code,
          companyName: comp?.name,
          users: []
        });
      }
      groups.get(groupId)!.users.push(u);
    }

    return Array.from(groups.values());
  }, [supportUsersList, companies]);

  return (
    <div className="space-y-6">
      <div className="p-4.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-800 dark:text-indigo-300 flex items-start gap-3">
        <Info size={20} className="text-indigo-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wider">{isRtl ? 'بوابة الدعم الفني المباشر للمنصة' : 'Direct Technical Support Access'}</h4>
          <p className="text-[11px] leading-relaxed">
            {isRtl 
              ? 'تتيح لك البوابة الولوج السريع لأي مستخدم لمباشرة المشاكل الفنية وتصحيح العهد بدون إدخال كلمة مرورهم. سيحتفظ النظام بجلستك الأساسية كـ Super Admin، ويمكنك إنهاء الدعم والعودة بضغطة زر واحدة. يتم تسجيل كل جلسة في سجل الامتثال.'
              : 'Gain direct read/write context to any user account to troubleshoot bugs, adjust balances or guide cashiers. This session runs on temporary authentication under audit. You can resume your Super Admin dashboard instantly with one click.'}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-4 shadow-sm w-full">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-2 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isRtl ? 'الوحدات التنظيمية والحسابات المرتبطة للدعم' : 'Organization Units & Support Accounts'}
            </h3>
            <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded font-bold">
              {isRtl ? `عدد الوحدات: ${groupedUnits.length} | الحسابات: ${supportUsersList.length}` : `Total Units: ${groupedUnits.length} | Accounts: ${supportUsersList.length}`}
            </span>
          </div>
          
          {/* Support User Search Filter */}
          <div className="relative w-full">
            <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder={isRtl ? 'بحث باسم المستخدم، البريد، أو الصلاحية...' : 'Search target name, email or role...'}
              value={supportUserSearch}
              onChange={(e) => setSupportUserSearch(e.target.value)}
              className="w-full pl-4 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white dark:bg-slate-900"
            />
          </div>
        </div>

        {impersonateError && (
          <div className="p-3 rounded-lg bg-rose-500/10 text-rose-500 font-semibold border border-rose-500/20 text-[11px]">
            {impersonateError}
          </div>
        )}

        <div className="space-y-4 max-h-[500px] overflow-y-auto px-1">
          {groupedUnits.map(grp => {
            const maxAllowed = grp.unit?.max_accounts_allowed ?? 1;
            const currentCount = grp.users.length;

            return (
              <div
                key={grp.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3"
              >
                {/* Consolidated Unit Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Building2 size={16} className="text-indigo-600 dark:text-indigo-400" />
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {isRtl ? grp.titleAr : grp.titleEn}
                    </h4>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-300">
                      {grp.code}
                    </span>
                    {grp.companyName && (
                      <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded font-bold">
                        🏢 {grp.companyName}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      {isRtl ? 'الحسابات التابعة:' : 'Associated Accounts:'}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50">
                      {isRtl ? `${currentCount} / ${maxAllowed} حسابات` : `${currentCount}/${maxAllowed} accounts`}
                    </span>
                  </div>
                </div>

                {/* Grouped Accounts Under This Unit */}
                <div className="space-y-2 pl-2 rtl:pl-0 rtl:pr-2 border-l-2 rtl:border-l-0 rtl:border-r-2 border-indigo-200 dark:border-indigo-900/50">
                  {grp.users.map(u => {
                    let friendlyRole: string = u.role;
                    if (u.role === 'Admin') friendlyRole = isRtl ? 'ادمن الشركة' : 'Company Admin';
                    else if (u.role === 'RegionalManager') friendlyRole = isRtl ? 'مدير منطقة' : 'Regional Manager';
                    else if (u.role === 'StationAdmin') friendlyRole = isRtl ? 'مدير محطة' : 'Station Manager';
                    else if (u.role === 'SystemAdmin') friendlyRole = isRtl ? 'مدير عام المنصة' : 'System Admin';

                    return (
                      <div 
                        key={u.id}
                        className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-800/40 transition-all text-xs"
                      >
                        <div className="space-y-1 w-full sm:w-auto">
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                            <span>{u.full_name}</span>
                            <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded font-black tracking-wide">
                              {friendlyRole}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono flex flex-wrap gap-x-3 gap-y-1 items-center">
                            <span>{u.email}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleStartImpersonation(u)}
                          className="w-full sm:w-auto justify-center px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-[10px] transition-all flex items-center gap-1 cursor-pointer shrink-0"
                          title={isRtl ? 'الدخول كمسرف للدعم (Impersonation session via activeUser.impersonator)' : 'Impersonate Account (uses activeUser.impersonator mechanism)'}
                        >
                          <UserCheck size={12} />
                          <span>{isRtl ? 'الدخول للدعم الفني' : 'Impersonate Account'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SuperAdminImpersonateTab;
