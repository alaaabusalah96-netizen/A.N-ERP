import React from 'react';
import { 
  FileText, 
  Wallet, 
  Package, 
  ShoppingCart, 
  Receipt, 
  CheckSquare, 
  BarChart3, 
  Layers
} from 'lucide-react';

export type ActiveSection = 
  | 'overview' 
  | 'accounting' 
  | 'treasury' 
  | 'inventory' 
  | 'sales' 
  | 'procurement' 
  | 'approvals' 
  | 'reports';

interface SidebarProps {
  activeSection: ActiveSection;
  onSelectSection: (section: ActiveSection) => void;
  pendingApprovalsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  pendingApprovalsCount,
}) => {
  const menuItems = [
    { id: 'overview' as ActiveSection, label: 'لوحة العمليات اليومية', icon: Layers },
    { id: 'accounting' as ActiveSection, label: 'الحسابات والقيود', icon: FileText },
    { id: 'treasury' as ActiveSection, label: 'الخزينة وسندات الصرف', icon: Wallet },
    { id: 'inventory' as ActiveSection, label: 'المستودعات والمخزون', icon: Package },
    { id: 'sales' as ActiveSection, label: 'المبيعات والعملاء', icon: ShoppingCart },
    { id: 'procurement' as ActiveSection, label: 'المشتريات والموردين', icon: Receipt },
    { 
      id: 'approvals' as ActiveSection, 
      label: 'مركز الاعتمادات', 
      icon: CheckSquare,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined
    },
    { id: 'reports' as ActiveSection, label: 'التقارير المالية والختامية', icon: BarChart3 },
  ];

  return (
    <aside className="w-64 bg-white border-l border-slate-200 min-h-[calc(100vh-4rem)] flex flex-col justify-between p-4 shrink-0">
      <div className="space-y-6">
        <div>
          <p className="text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-3 px-3">
            الوحدات التشغيلية
          </p>
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectSection(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors text-right ${
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

        {/* Current Fiscal Year Status */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-600">السنة المالية النشطة</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">2026</span>
          </div>
          <p className="text-[11px] text-slate-500">حالة الدفاتر: مفتوحة للقيد والترحيل</p>
          <div className="mt-2 text-[10px] text-slate-400">
            تاريخ الإقفال الشهري القادم: 30 سبتمبر 2026
          </div>
        </div>
      </div>

      {/* System Brand Footer */}
      <div className="pt-4 border-t border-slate-100 text-center">
        <p className="text-[11px] font-bold text-slate-700">A.N ERP</p>
        <p className="text-[10px] text-slate-400 mt-0.5">الإصدار المؤسسي المتكامل</p>
      </div>
    </aside>
  );
};
