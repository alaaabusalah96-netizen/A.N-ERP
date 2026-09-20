import React from 'react';
import { Building2, Bell, CheckCircle2, ChevronDown, LogOut, Menu } from 'lucide-react';
import { UserProfile, UserRole } from '../types/erp';

interface HeaderProps {
  currentUser: UserProfile;
  onRoleChange: (role: UserRole) => void;
  pendingApprovalsCount: number;
  onLogout?: () => void;
  onToggleMobileNav?: () => void;
}

const availableRoles: { role: UserRole; titleAr: string }[] = [
  { role: 'admin', titleAr: 'مدير النظام (Admin)' },
  { role: 'accountant', titleAr: 'محاسب عام' },
  { role: 'financial_approver', titleAr: 'معتمد مالي' },
  { role: 'warehouse_keeper', titleAr: 'أمين مستودع' },
  { role: 'sales_officer', titleAr: 'مسؤول مبيعات' },
  { role: 'branch_manager', titleAr: 'مدير الفرع' },
  { role: 'fleet_supervisor', titleAr: 'مشرف أسطول' },
];

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onRoleChange,
  pendingApprovalsCount,
  onLogout,
  onToggleMobileNav,
}) => {
  const currentRoleExists = availableRoles.some((r) => r.role === currentUser.role);
  const displayRoles = currentRoleExists
    ? availableRoles
    : [{ role: currentUser.role, titleAr: currentUser.roleTitleAr || currentUser.role }, ...availableRoles];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Branch Info */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Hamburger Toggle Button for Mobile */}
            <button
              type="button"
              onClick={onToggleMobileNav}
              className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors focus:outline-hidden shrink-0"
              aria-label="القائمة الجانبية"
              id="mobile-menu-toggle-btn"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-blue-700 text-white flex items-center justify-center font-bold text-base sm:text-lg tracking-wider shadow-sm shrink-0">
                A.N
              </div>
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-base sm:text-xl font-bold text-slate-900 tracking-tight">A.N ERP</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 ml-1 inline text-emerald-600" />
                    متصل
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-500 font-medium hidden sm:block">نظام تخطيط وإدارة الموارد المؤسسية</p>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2 mr-6 pr-6 border-r border-slate-200">
              <Building2 className="w-4 h-4 text-slate-500" />
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-800">شركة الأعمال الموحدة القابضة</p>
                <p className="text-[11px] text-slate-500">الفرع الرئيسي - الرياض (الفترة المالية 2026)</p>
              </div>
            </div>
          </div>

          {/* User profile & Role switcher */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Approvals Alert Notification */}
            <div className="relative">
              <button 
                type="button"
                className="p-1.5 sm:p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors relative"
                title="الإشعارات التشغيلية"
              >
                <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                {pendingApprovalsCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {pendingApprovalsCount}
                  </span>
                )}
              </button>
            </div>

            {/* Role Switcher for simulation of operational personnel */}
            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
              <label htmlFor="role-select" className="text-xs text-slate-600 font-medium px-2 hidden md:inline">
                الدور التشغيلي:
              </label>
              <div className="relative">
                <select
                  id="role-select"
                  value={currentUser.role}
                  onChange={(e) => onRoleChange(e.target.value as UserRole)}
                  className="bg-white text-xs font-semibold text-slate-800 py-1.5 px-3 pr-2 pl-7 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 appearance-none cursor-pointer"
                >
                  {displayRoles.map((r) => (
                    <option key={r.role} value={r.role}>
                      {r.titleAr}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2.5 pointer-events-none" />
              </div>
            </div>

            {/* User Badge */}
            <div className="flex items-center gap-2 pr-1 sm:pr-2">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs border border-blue-200 shrink-0">
                {currentUser.avatarInitials}
              </div>
              <div className="hidden lg:block text-right">
                <p className="text-xs font-bold text-slate-800 leading-tight">{currentUser.name}</p>
                <p className="text-[11px] text-slate-500">{currentUser.roleTitleAr}</p>
              </div>

              {onLogout && (
                <button
                  id="header-logout-btn"
                  type="button"
                  onClick={onLogout}
                  className="mr-2 p-2 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors"
                  title="تسجيل الخروج"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
