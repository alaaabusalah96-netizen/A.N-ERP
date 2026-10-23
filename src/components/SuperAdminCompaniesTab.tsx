import React from 'react';
import { Company, AppUser, Region, Station, Theme } from '../types';
import { 
  Building2, ArrowRight, ArrowLeft, ShieldCheck,
  FolderTree, Users2, Boxes, Sparkles, ExternalLink
} from 'lucide-react';

export interface SuperAdminCompaniesTabProps {
  isRtl: boolean;
  theme: Theme;
  companies: Company[];
  users: AppUser[];
  regions?: Region[];
  stations?: Station[];
  companySearch?: string;
  setCompanySearch?: (val: string) => void;
  sortField?: 'name' | 'status' | 'userCount' | 'expiry';
  handleSort?: (field: 'name' | 'status' | 'userCount' | 'expiry') => void;
  sortedAndFilteredCompanies?: Company[];
  filteredCompanies?: Company[];
  isStructureOpen?: boolean;
  setIsStructureOpen?: (val: boolean) => void;
  structureView?: 'tree' | 'tables';
  setStructureView?: (val: 'tree' | 'tables') => void;
  structToastMsg?: string;
  startStructAddCompany?: () => void;
  startStructEditCompany?: (c: Company) => void;
  handleStructDeleteCompany?: (id: string) => void;
  startStructAddRegionForCompany?: (companyId: string) => void;
  startStructAddStationDirectForCompany?: (companyId: string) => void;
  startStructEditRegion?: (r: Region) => void;
  handleStructDeleteRegion?: (id: string) => void;
  startStructAddStationForRegion?: (regionId: string, companyId?: string) => void;
  startStructEditStation?: (s: Station) => void;
  handleStructDeleteStation?: (id: string) => void;
  handleToggleCompanyActive?: (companyId: string, currentStatus: boolean) => void;
  setEditingCompany?: (c: Company | null) => void;
  setSubPlan?: (plan: Company['subscription_plan']) => void;
  setSubStatus?: (status: Company['subscription_status']) => void;
  setSubExpiry?: (expiry: string) => void;
  setCompanyModules?: (mods: Record<string, any>) => void;
  setActiveModalTab?: (tab: 'subscription' | 'modules') => void;
  handleSaveCompanyAdmin?: (companyId: string, email: string, pass: string, permissions?: any) => Promise<void>;
  handleSaveRegionManager?: (regionId: string, companyId: string, email: string, pass: string, permissions?: any) => Promise<void>;
  handleSaveStationAdmin?: (stationId: string, regionId: string | undefined, companyId: string, email: string, pass: string, permissions?: any) => Promise<void>;
  structureTab?: 'companies' | 'regions' | 'stations';
  setStructureTab?: (tab: 'companies' | 'regions' | 'stations') => void;
  structSelectedCompanyId?: string;
}

export default function SuperAdminCompaniesTab({
  isRtl,
  theme,
  companies = [],
  users = [],
  structToastMsg
}: SuperAdminCompaniesTabProps) {
  const navigateToUnifiedCenter = (centerTab: 'companies' | 'org_structure' | 'users' | 'modules' = 'companies') => {
    window.dispatchEvent(new CustomEvent('navigate_tab', { 
      detail: { 
        tab: 'settings', 
        settingsTab: 'permissions',
        centerTab 
      } 
    }));
  };

  const activeCompaniesCount = companies.filter(c => c.subscription_status === 'active' && c.is_active !== false).length;
  const totalUsersCount = users.filter(u => u.is_active !== false).length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {structToastMsg && (
        <div className="fixed bottom-5 right-5 z-[110] flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-2xl animate-fade-in text-xs font-bold">
          <span>{structToastMsg}</span>
        </div>
      )}

      {/* Primary Migration / Official UI Redirect Banner */}
      <div 
        id="unified-access-control-redirect-banner"
        className="p-5 rounded-3xl bg-gradient-to-r from-blue-900/10 via-indigo-900/5 to-sky-900/10 border border-blue-200/80 dark:border-blue-800/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm"
      >
        <div className="flex items-start gap-3.5">
          <div className="p-3 rounded-2xl bg-blue-600 text-white shadow-md shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h4 className="font-black text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>{isRtl ? 'مركز التحكم الموحد في الصلاحيات والشركات' : 'Unified Access Control & Multi-Tenant Center'}</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                {isRtl ? 'الواجهة الرسمية المعتمدة' : 'Official Single Source'}
              </span>
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed max-w-2xl">
              {isRtl 
                ? 'تم توحيد كافة عمليات إدارة الشركات، التراخيص، الهيكل الإداري والمستخدمين والموديلات في مركز تحكم شامل موحد تحت الإعدادات.'
                : 'All multi-tenant company management, licenses, organizational hierarchy, users, and module toggles are unified under the Settings Access Control Center.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigateToUnifiedCenter('companies')}
          className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-md shrink-0 cursor-pointer"
        >
          <span>{isRtl ? 'فتح مركز التحكم الموحد' : 'Open Unified Access Control'}</span>
          {isRtl ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        </button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`p-4 rounded-2xl border ${
          theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">{isRtl ? 'إجمالي الشركات المسجلة' : 'Total Companies'}</span>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
              <Building2 size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-2">{companies.length}</p>
          <span className="text-[11px] text-slate-400">{isRtl ? 'مؤسسات متعددة المستأجرين' : 'Multi-tenant organizations'}</span>
        </div>

        <div className={`p-4 rounded-2xl border ${
          theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">{isRtl ? 'الشركات النشطة' : 'Active Tenants'}</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
              <Sparkles size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{activeCompaniesCount}</p>
          <span className="text-[11px] text-emerald-500 font-bold">{isRtl ? 'تراخيص سارية المفعول' : 'Active subscriptions'}</span>
        </div>

        <div className={`p-4 rounded-2xl border ${
          theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">{isRtl ? 'إجمالي مستخدمي النظام' : 'Total SaaS Users'}</span>
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400">
              <Users2 size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-2">{totalUsersCount}</p>
          <span className="text-[11px] text-slate-400">{isRtl ? 'حسابات مستخدمين نشطة' : 'Active system accounts'}</span>
        </div>
      </div>

      {/* Quick Launchpad to Unified Access Control Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => navigateToUnifiedCenter('companies')}
          className={`p-5 rounded-2xl border text-start transition-all hover:scale-[1.02] cursor-pointer ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-indigo-500' : 'bg-white border-slate-200 shadow-sm hover:border-indigo-400'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
              <Building2 size={20} />
            </div>
            <ExternalLink size={14} className="text-slate-400" />
          </div>
          <h5 className="font-bold text-sm text-slate-800 dark:text-slate-100">{isRtl ? 'إدارة الشركات والاشتراكات' : 'Companies & Plans'}</h5>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{isRtl ? 'إضافة شركات وتعديل الباقات والتراخيص' : 'Create companies, assign plans & renewal dates'}</p>
        </button>

        <button
          type="button"
          onClick={() => navigateToUnifiedCenter('org_structure')}
          className={`p-5 rounded-2xl border text-start transition-all hover:scale-[1.02] cursor-pointer ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-emerald-500' : 'bg-white border-slate-200 shadow-sm hover:border-emerald-400'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400">
              <FolderTree size={20} />
            </div>
            <ExternalLink size={14} className="text-slate-400" />
          </div>
          <h5 className="font-bold text-sm text-slate-800 dark:text-slate-100">{isRtl ? 'الهيكل التنظيمي والفروع' : 'Organization Tree'}</h5>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{isRtl ? 'شجرة الوحدات التنظيمية والمناطق والمحطات' : 'Manage organizational units, branches & stations'}</p>
        </button>

        <button
          type="button"
          onClick={() => navigateToUnifiedCenter('users')}
          className={`p-5 rounded-2xl border text-start transition-all hover:scale-[1.02] cursor-pointer ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-sky-500' : 'bg-white border-slate-200 shadow-sm hover:border-sky-400'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400">
              <Users2 size={20} />
            </div>
            <ExternalLink size={14} className="text-slate-400" />
          </div>
          <h5 className="font-bold text-sm text-slate-800 dark:text-slate-100">{isRtl ? 'المستخدمين ومصفوفة الصلاحيات' : 'Users & Permissions'}</h5>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{isRtl ? 'إدارة الحسابات وكلمات المرور والصلاحيات' : 'Assign roles, custom matrix permissions & passwords'}</p>
        </button>

        <button
          type="button"
          onClick={() => navigateToUnifiedCenter('modules')}
          className={`p-5 rounded-2xl border text-start transition-all hover:scale-[1.02] cursor-pointer ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-amber-500' : 'bg-white border-slate-200 shadow-sm hover:border-amber-400'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400">
              <Boxes size={20} />
            </div>
            <ExternalLink size={14} className="text-slate-400" />
          </div>
          <h5 className="font-bold text-sm text-slate-800 dark:text-slate-100">{isRtl ? 'موديلات النظام المفعلة' : 'ERP Modules Registry'}</h5>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{isRtl ? 'تفعيل وإيقاف موديولات ERP لكل شركة' : 'Configure and enable active modules per company'}</p>
        </button>
      </div>
    </div>
  );
}
