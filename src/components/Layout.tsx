import React from 'react';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Clock, 
  FileCheck, 
  TrendingUp, 
  FileText, 
  Search as SearchIcon, 
  Settings as SettingsIcon, 
  LogOut, 
  Sun, 
  Moon, 
  Languages, 
  Coins, 
  User as UserIcon,
  Building,
  Layers,
  Menu,
  X,
  ShieldCheck,
  Sparkles,
  ChevronUp,
  UserCheck,
  Trash2,
  ShoppingCart,
  BookOpen,
  Briefcase,
  Users as UsersIcon,
  Laptop as AssetIcon,
  Receipt as PosIcon,
  DollarSign as SalesIcon,
  Truck as FleetIcon,
  HardHat,
  Inbox,
  Utensils,
  ChefHat
} from 'lucide-react';
import { CustodyDB, ModulesModule } from '../db';
import { translations, Language, Theme, AppUser } from '../types';
import kemitLogo from '../assets/images/kemit_logo_1784280480891.jpg';
import { OfflineSyncIndicator } from './OfflineSyncIndicator';

interface LayoutProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  activeUser: AppUser | null;
  onLogout: () => void;
  children: React.ReactNode;
}

export function getFilteredMenuItems(activeUser: AppUser | null, language: Language = 'ar') {
  const t = translations[language];
  const isRtl = language === 'ar';

  const menuItems = [
    { id: 'super-admin', label: isRtl ? 'لوحة تحكم الساس SaaS' : 'SaaS Super Admin', icon: ShieldCheck, roleAllowed: ['SystemAdmin'] },
    { id: 'company-admin', label: isRtl ? 'لوحة تحكم الشركة' : 'Company Dashboard', icon: Building, roleAllowed: ['Admin'] },
    { id: 'region-admin', label: isRtl ? 'لوحة تحكم المنطقة' : 'Region Dashboard', icon: Layers, roleAllowed: ['RegionalManager'] },
    // Documented permission flag: 'replace_custody' (deny-by-default: only roles/users with replace_custody permission can view/access)
    { id: 'custody', label: isRtl ? 'العهدة / Custody' : 'Custody / العهدة', icon: Coins, permission: 'replace_custody', roleAllowed: ['Admin', 'RegionalManager', 'StationAdmin'] },
    { id: 'new-expense', label: t.newExpense, icon: PlusCircle, permission: 'create_expense' },
    { id: 'voucher', label: t.cashPaymentVoucher, icon: FileCheck, permission: 'settle_voucher' },
    { id: 'reconciliation', label: isRtl ? 'جرد ومطابقة العهدة' : 'Custody Reconciliation & Inventory', icon: TrendingUp, roleAllowed: ['Admin', 'StationAdmin', 'RegionalManager'] },
    { id: 'approvals', label: isRtl ? 'صندوق الاعتمادات والموافقات' : 'My Approvals Inbox', icon: Inbox },
    { id: 'inventory', label: isRtl ? 'إدارة المخازن والمستودعات' : 'Inventory & Warehouses', icon: Layers, roleAllowed: ['SystemAdmin', 'Admin', 'RegionalManager', 'StationAdmin'] },
    { id: 'purchasing', label: isRtl ? 'إدارة المشتريات والتموين' : 'Procurement & Supply Chain', icon: ShoppingCart, roleAllowed: ['SystemAdmin', 'Admin', 'RegionalManager'] },
    { id: 'accounting', label: isRtl ? 'الاستحقاق والقيود المزدوجة' : 'Double-Entry Accounting', icon: BookOpen, roleAllowed: ['SystemAdmin', 'Admin'] },
    { id: 'sales_ar', label: isRtl ? 'المبيعات وحسابات العملاء' : 'Sales & Accounts Receivable', icon: SalesIcon, roleAllowed: ['SystemAdmin', 'Admin', 'RegionalManager', 'StationAdmin'] },
    { id: 'pos', label: isRtl ? 'نقاط البيع السريع (POS)' : 'Point of Sale (POS)', icon: PosIcon, roleAllowed: ['SystemAdmin', 'Admin', 'RegionalManager', 'StationAdmin'] },
    { id: 'crm', label: isRtl ? 'علاقات العملاء CRM' : 'Customer Relations (CRM)', icon: UsersIcon, roleAllowed: ['SystemAdmin', 'Admin', 'RegionalManager', 'StationAdmin'] },
    { id: 'fixed_assets', label: isRtl ? 'الأصول الثابتة والاستهلاكات' : 'Fixed Assets & Depreciation', icon: AssetIcon, roleAllowed: ['SystemAdmin', 'Admin'] },
    { 
      id: 'fleet', 
      label: isRtl ? 'إدارة الأسطول والحركة' : 'Fleet & Transportation', 
      icon: FleetIcon, 
      permission: [
        'manage_fleet',
        'create_trip',
        'approve_trip',
        'dispatch_trip',
        'reassign_vehicle',
        'execute_breakdown_decision',
        'create_emergency_trip',
        'manage_vehicle_constraints',
        'execute_trip_tasks'
      ] 
    },
    { id: 'hr_payroll', label: isRtl ? 'الموارد البشرية والرواتب' : 'HR & Payroll Ledger', icon: Briefcase, roleAllowed: ['SystemAdmin', 'Admin'] },
    { id: 'contracting', label: isRtl ? 'إدارة المقاولات والمستخلصات' : 'Construction & Contracting', icon: HardHat, roleAllowed: ['SystemAdmin', 'Admin', 'RegionalManager', 'StationAdmin'] },
    { id: 'restaurant-menu', label: isRtl ? 'قائمة الطعام والتكاليف' : 'Restaurant Menu & Costs', icon: Utensils, roleAllowed: ['SystemAdmin', 'Admin', 'RegionalManager', 'StationAdmin'] },
    { id: 'restaurant-orders', label: isRtl ? 'طلبات المطعم ونقطة البيع (POS)' : 'Restaurant Orders & POS', icon: ChefHat, roleAllowed: ['SystemAdmin', 'Admin', 'RegionalManager', 'StationAdmin'] },
    { id: 'reports', label: t.reports, icon: FileText, permission: 'view_reports' },
    { id: 'search', label: t.search, icon: SearchIcon },
    { id: 'audit-log', label: isRtl ? 'سجل الرقابة والامتثال' : 'Security & Audit Log', icon: ShieldCheck, roleAllowed: ['Admin', 'SystemAdmin'] },
    { id: 'settings', label: t.settings, icon: SettingsIcon, permission: 'manage_settings' },
  ];

  return menuItems.filter(item => {
    if (!activeUser) return false;
    
    // Check if the screen/item belongs to an enabled module for the user's company
    if (activeUser.company_id && !ModulesModule.isScreenEnabledForCompany(activeUser.company_id, item.id)) {
      return false;
    }
    
    // Explicitly hide operational module entries from SystemAdmin (SaaS / Platform Tools only)
    if (activeUser.role === 'SystemAdmin') {
      const operationalModuleIds = [
        'custody',
        'new-expense',
        'voucher',
        'reconciliation',
        'approvals',
        'inventory',
        'purchasing',
        'accounting',
        'sales_ar',
        'pos',
        'crm',
        'fixed_assets',
        'fleet',
        'hr_payroll',
        'contracting',
        'reports'
      ];
      if (operationalModuleIds.includes(item.id)) {
        return false;
      }
    }
    if (activeUser.role === 'Admin') {
      if (item.id === 'new-expense' || item.id === 'voucher') {
        return false;
      }
    }
    
    if (item.roleAllowed && !item.roleAllowed.includes(activeUser.role)) {
      return false;
    }
    
    if (item.permission) {
      const perms = {
        ...CustodyDB.enrichUserPermissions(activeUser.role),
        ...(activeUser.permissions || {})
      };
      if (Array.isArray(item.permission)) {
        return item.permission.some(p => Boolean(perms[p as keyof typeof perms]));
      }
      return Boolean(perms[item.permission as keyof typeof perms]);
    }
    return true;
  });
}

export default function Layout({
  currentTab,
  setCurrentTab,
  language,
  setLanguage,
  theme,
  setTheme,
  activeUser,
  onLogout,
  children
}: LayoutProps) {
  const t = translations[language];
  const isRtl = language === 'ar';
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  // User Affiliations for clear display
  const companiesList = React.useMemo(() => CustodyDB.getCompanies(), []);
  const regionsList = React.useMemo(() => CustodyDB.getRegions(), []);
  const stationsList = React.useMemo(() => CustodyDB.getStations(), []);

  const userComp = activeUser ? companiesList.find(c => c.id === activeUser.company_id) : null;
  const userStation = activeUser ? stationsList.find(s => s.id === activeUser.station_id) : null;
  const userRegionId = activeUser?.region_id || userStation?.region_id;
  const userRegion = userRegionId ? regionsList.find(r => r.id === userRegionId) : null;
  const homeTab = activeUser?.role === 'SystemAdmin' ? 'super-admin' : (activeUser?.role === 'Admin' ? 'company-admin' : (activeUser?.role === 'RegionalManager' ? 'region-admin' : 'reconciliation'));

  // Auto-close sidebar on mobile/tablet screen sizes on initial mount
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);

  // Get live available cash metrics for header badge
  const metrics = CustodyDB.getReconciliation();
  const config = CustodyDB.getConfig();

  const filteredMenuItems = React.useMemo(() => {
    return getFilteredMenuItems(activeUser, language);
  }, [activeUser, language]);

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <div 
      id="app-root-container"
      className={`min-h-screen w-full max-w-full overflow-x-hidden font-sans transition-colors duration-200 ${
        theme === 'dark' ? 'bg-[#0f172a] text-slate-100' : 'bg-slate-50 text-slate-800'
      }`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Top Navigation Bar */}
      <header 
        id="app-header"
        className={`sticky top-0 z-30 flex h-16 items-center justify-between border-b px-4 md:px-6 transition-colors duration-200 ${
          theme === 'dark' ? 'bg-[#1e293b]/95 border-[#334155] backdrop-blur-md' : 'bg-white/95 border-slate-200 backdrop-blur-md'
        }`}
      >
        <div className="flex items-center gap-3">
          <button 
            id="toggle-sidebar-mobile"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-2 rounded-lg hover:bg-slate-100 ${theme === 'dark' ? 'hover:bg-slate-800' : ''}`}
            aria-label="Toggle Sidebar"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden bg-white shadow-md border border-slate-100 dark:border-slate-800">
              <img src={kemitLogo} alt="KEMIT ERP Logo" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div>
              {activeUser?.role === 'SystemAdmin' && !activeUser?.impersonator ? (
                <div className="flex items-center gap-1.5">
                  <h1 className="text-xs sm:text-sm md:text-lg font-bold tracking-tight truncate max-w-[130px] xs:max-w-[180px] sm:max-w-[240px] md:max-w-none">
                    {isRtl ? 'تحكم المنصة (SaaS)' : 'KEMIT Platform Control'}
                  </h1>
                  <span className="hidden xs:inline-block bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0">
                    {isRtl ? 'مشرف عام المنصة' : 'Platform Admin'}
                  </span>
                </div>
              ) : activeUser?.role === 'SystemAdmin' ? (
                <div className="flex items-center gap-1.5">
                  <h1 className="text-xs sm:text-sm md:text-lg font-bold tracking-tight truncate max-w-[130px] xs:max-w-[180px] sm:max-w-[240px] md:max-w-none">
                    {config.company_name || 'KEMIT ERP'}
                  </h1>
                  <span className="hidden xs:inline-block bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0">
                    {isRtl ? 'مشرف عام المنصة' : 'Platform Admin'}
                  </span>
                </div>
              ) : (
                <h1 className="text-xs sm:text-sm md:text-lg font-bold tracking-tight truncate max-w-[130px] xs:max-w-[180px] sm:max-w-[240px] md:max-w-none">
                  {config.company_name || 'KEMIT ERP'}
                </h1>
              )}
              <p className="hidden md:block text-[8px] sm:text-[10px] font-mono uppercase tracking-wider text-emerald-500 font-semibold mt-0.5 truncate max-w-[130px] xs:max-w-[180px] sm:max-w-[240px] md:max-w-none">
                {t.loginSubtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Header Stats & Utilities */}
        <div className="flex items-center gap-1.5 md:gap-4">
          {/* Cloud Sync Status Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold font-mono bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-duration-1000"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span>{isRtl ? 'سحابي نشط' : 'LIVE CLOUD'}</span>
          </div>

          {/* Quick Cash available info - Hidden for standalone SystemAdmin */}
          {(!activeUser || activeUser.role !== 'SystemAdmin' || activeUser.impersonator) && (
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
              theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-slate-500 dark:text-slate-400">{t.cashAvailable}:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono">
                {metrics.cashAvailable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP
              </span>
            </div>
          )}

          {/* Theme Switcher */}
          <button
            id="btn-toggle-theme"
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-colors border ${
              theme === 'dark' 
                ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-amber-400' 
                : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-500'
            }`}
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Language Switcher hidden to keep app Arabic only */}

          {/* User Profile Info */}
          {activeUser && (
            <div className={`flex items-center gap-2 border-l pl-2 md:pl-4 ${isRtl ? 'border-r pr-2 md:pr-4 border-l-0' : 'border-l pl-2 md:pl-4'} border-slate-200 dark:border-slate-700`}>
              <div className="hidden sm:block text-right">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-[140px]">
                  {activeUser.full_name || 'المستخدم'}
                </div>
                <div className="flex flex-col items-end gap-0.5 mt-0.5">
                  <div className={`text-[9px] inline-block px-1.5 py-0.5 rounded font-mono font-bold leading-none ${
                    activeUser.role === 'SystemAdmin'
                      ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                      : activeUser.role === 'Admin'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20' 
                        : activeUser.role === 'RegionalManager'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  }`}>
                    {activeUser.role === 'SystemAdmin'
                      ? (isRtl ? 'أدمن منصة' : 'Platform Admin')
                      : activeUser.role === 'Admin'
                        ? (isRtl ? 'أدمن الشركة' : 'Company Admin')
                        : activeUser.role === 'RegionalManager'
                          ? (isRtl ? 'مدير منطقة' : 'Regional Manager')
                          : (isRtl ? 'أمين عهدة' : 'Station Manager')
                    }
                  </div>
                  
                  {/* Affiliation info next to role */}
                  {activeUser.role === 'Admin' && (userComp || activeUser.company_id) && (
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold truncate max-w-[120px]">
                      🏢 {userComp?.name || activeUser.company_id}
                    </span>
                  )}
                  {activeUser.role === 'RegionalManager' && (userRegion || userComp || activeUser.region_id) && (
                    <span className="text-[9px] text-amber-600 dark:text-amber-400 font-bold truncate max-w-[150px]">
                      🌍 {[userRegion?.name || activeUser.region_id, userComp?.name].filter(Boolean).join(' | ')}
                    </span>
                  )}
                  {activeUser.role === 'StationAdmin' && (userStation || userComp || activeUser.station_id) && (
                    <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold truncate max-w-[150px]">
                      📍 {[userStation?.station_name || activeUser.station_id, userComp?.name].filter(Boolean).join(' | ')}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                id="btn-logout"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onLogout();
                }}
                className={`p-2 rounded-lg border transition-all duration-150 text-rose-500 active:scale-95 select-none touch-manipulation cursor-pointer flex items-center justify-center shrink-0 ${
                  theme === 'dark' 
                    ? 'bg-slate-800 border-slate-700 hover:bg-rose-500/10 active:bg-rose-500/20' 
                    : 'bg-white border-slate-200 hover:bg-rose-50 active:bg-rose-100'
                }`}
                title={t.logout}
                aria-label={t.logout}
              >
                <LogOut size={18} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Body */}
      <div className="flex w-full max-w-full overflow-x-hidden">
        {/* Mobile Sidebar Backdrop Overlay */}
        {sidebarOpen && (
          <div 
            id="sidebar-mobile-backdrop"
            className="fixed inset-0 top-16 bg-slate-900/40 backdrop-blur-[1px] z-10 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar Navigation */}
        <aside
          id="app-sidebar"
          className={`fixed inset-y-16 bottom-0 z-20 flex w-64 flex-col border-r transition-all duration-300 ${
            isRtl ? 'right-0 border-l border-r-0' : 'left-0 border-r'
          } ${
            sidebarOpen ? 'translate-x-0' : isRtl ? 'translate-x-full' : '-translate-x-full'
          } ${
            theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-200'
          }`}
        >
          {/* Main Menu Links */}
          <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
            {filteredMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  id={`nav-item-${item.id}`}
                  key={item.id}
                  onClick={() => {
                    setCurrentTab(item.id);
                    setSidebarOpen(false); // Auto-close sidebar on mobile/desktop after selection
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/10'
                      : theme === 'dark'
                        ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon size={18} className={isActive ? 'text-white' : 'text-slate-400'} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Quick Info Footer */}
          <div className={`p-4 border-t text-[11px] font-mono text-slate-400 text-center ${
            theme === 'dark' ? 'border-[#1e293b]' : 'border-slate-100'
          }`}>
            <div className="font-semibold text-emerald-500 uppercase tracking-wider mb-1">
              {t.title}
            </div>
            <div>
              KEMIT ERP v2.6
            </div>
            <div className="mt-1">
              &copy; 2026 {t.allRightsReserved}
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main
          id="app-main-content-wrapper"
          className={`flex-1 min-w-0 max-w-full overflow-hidden p-4 md:p-6 min-h-[calc(100vh-4rem)] transition-all duration-300 ${
            sidebarOpen 
              ? isRtl ? 'lg:mr-64 mr-0' : 'lg:ml-64 ml-0' 
              : 'm-0'
          }`}
        >
          <div className="mb-4">
            <OfflineSyncIndicator language={language} />
          </div>

          {/* Support Session Impersonation Banner */}
          {activeUser?.impersonator && (
            <div className="mb-4 p-3 sm:p-4 rounded-xl bg-gradient-to-r from-amber-900 via-rose-900 to-amber-900 border border-amber-500/50 text-white shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
                <div className="text-xs min-w-0">
                  <div className="font-extrabold text-xs sm:text-sm text-amber-200 truncate">
                    {isRtl 
                      ? `⚠️ جلسة دعم فني نشطة: منتحل هوية [${activeUser.full_name || 'المستخدم'}]`
                      : `⚠️ Support Mode: Impersonating [${activeUser.full_name || 'User'}]`
                    }
                  </div>
                  <div className="text-[10px] text-slate-300 font-mono truncate mt-0.5">
                    {isRtl
                      ? `المشرف الأصلي: ${activeUser.impersonator.full_name || 'Super Admin'} | الإجراءات موثقة بسجل الامتثال`
                      : `Admin: ${activeUser.impersonator.full_name || 'Super Admin'} | Actions logged for audit`
                    }
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  CustodyDB.exitImpersonation();
                  window.location.reload();
                }}
                className="w-full sm:w-auto px-3.5 py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-lg transition-all text-xs shrink-0 cursor-pointer shadow-md active:scale-95 flex items-center justify-center gap-1.5"
              >
                <LogOut size={13} />
                <span>{isRtl ? 'إنهاء جلسة الدعم والعودة للوحة SaaS' : 'Exit & Return to SaaS'}</span>
              </button>
            </div>
          )}

          {/* Quick Alert if custody gets low - Hidden for standalone SystemAdmin */}
          {(!activeUser || activeUser.role !== 'SystemAdmin' || activeUser.impersonator) && metrics.cashAvailable < 5000 && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span>
                {isRtl 
                  ? `تحذير: رصيد العهدة المتوفر منخفض حالياً (${metrics.cashAvailable.toLocaleString()} ج.م). يرجى تقديم طلب تسوية قريباً.`
                  : `Alert: Low custody balance available (${metrics.cashAvailable.toLocaleString()} EGP). Please process outstanding settlements soon.`
                }
              </span>
            </div>
          )}

          {/* Children container */}
          <div className="max-w-7xl mx-auto">
            {currentTab !== homeTab && (
              <button
                id="btn-back-to-home-global"
                onClick={() => setCurrentTab(homeTab)}
                className={`mb-6 inline-flex items-center gap-2 px-4 py-2 text-xs md:text-sm font-black rounded-xl border transition-all duration-200 cursor-pointer shadow-sm ${
                  theme === 'dark'
                    ? 'bg-[#1e293b] border-[#334155] hover:bg-slate-800 text-slate-200 hover:text-white'
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-slate-950'
                }`}
              >
                <LayoutDashboard size={16} className="text-emerald-500" />
                <span>{isRtl ? 'العودة إلى الصفحة الرئيسية' : 'Back to Home'}</span>
              </button>
            )}
            {children}
          </div>
        </main>
      </div>

    </div>
  );
}
