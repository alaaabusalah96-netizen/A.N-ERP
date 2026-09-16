import React from 'react';
import {
  Layers,
  User,
  Building2,
  Users,
  Sliders,
  History,
  FileText,
  CheckSquare,
  BarChart3,
  X,
} from 'lucide-react';

export type ActiveSection =
  | 'overview'
  | 'profile'
  | 'company'
  | 'users_sod'
  | 'custom_fields'
  | 'audit_trail'
  | 'accounting'
  | 'approvals'
  | 'reports';

interface SidebarProps {
  activeSection: ActiveSection;
  onSelectSection: (section: ActiveSection) => void;
  pendingApprovalsCount: number;
  isOpenOnMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  pendingApprovalsCount,
  isOpenOnMobile = false,
  onCloseMobile,
}) => {
  const primaryMenuItems = [
    { id: 'overview' as ActiveSection, label: 'لوحة العمليات التشغيلية', icon: Layers },
    { id: 'accounting' as ActiveSection, label: 'القيود والسندات المالية', icon: FileText },
    {
      id: 'approvals' as ActiveSection,
      label: 'مركز الاعتمادات والرقابة',
      icon: CheckSquare,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
    },
    { id: 'reports' as ActiveSection, label: 'التقارير المالية والختامية', icon: BarChart3 },
  ];

  const adminMenuItems = [
    { id: 'profile' as ActiveSection, label: 'الملف الشخصي والجلسات', icon: User },
    { id: 'company' as ActiveSection, label: 'إعدادات المنشأة والنظام', icon: Building2 },
    { id: 'users_sod' as ActiveSection, label: 'المستخدمون وفصل المهام', icon: Users },
    { id: 'custom_fields' as ActiveSection, label: 'التخصيص بدون كود', icon: Sliders },
    { id: 'audit_trail' as ActiveSection, label: 'سجل التدقيق التشغيلي', icon: History },
  ];

  return (
    <aside
      className={`
        ${isOpenOnMobile ? 'fixed inset-0 z-40 bg-white flex flex-col justify-between p-6 overflow-y-auto' : 'hidden'}
        md:flex md:static md:w-64 md:border-l md:border-slate-200 md:min-h-[calc(100vh-4rem)] md:p-4 md:shrink-0 md:z-auto md:overflow-y-visible
      `}
    >
      <div className="space-y-6">
        {/* Mobile-only header with title and close button */}
        {isOpenOnMobile && (
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 md:hidden">
            <span className="text-sm font-bold text-slate-800">قائمة التنقل</span>
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1 text-slate-500 hover:text-slate-800 rounded-lg transition-colors"
              aria-label="إغلاق القائمة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Core Operations */}
        <div>
          <p className="text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-2 px-3">
            العمليات اليومية
          </p>
          <nav className="space-y-1">
            {primaryMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectSection(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-right ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-700' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Administration & Governance */}
        <div>
          <p className="text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-2 px-3">
            الحوكمة وإعدادات المنصة
          </p>
          <nav className="space-y-1">
            {adminMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectSection(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-right ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-700' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Fiscal Year Badge */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-600">السنة المالية النشطة</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">2026</span>
          </div>
          <p className="text-[11px] text-slate-500">دفاتر الأستاذ العام مفتوحة للقيد والترحيل</p>
        </div>
      </div>

      {/* System Identity Footer */}
      <div className="pt-4 border-t border-slate-100 text-center">
        <div className="text-xs font-bold text-slate-800">A.N ERP v7.1</div>
        <div className="text-[10px] text-slate-400 mt-0.5">منصة تخطيط الموارد المؤسسية الموحدة</div>
      </div>
    </aside>
  );
};
