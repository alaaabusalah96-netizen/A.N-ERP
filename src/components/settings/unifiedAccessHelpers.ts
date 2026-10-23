import React from 'react';
import { 
  Receipt, 
  FileText, 
  Car, 
  BarChart3, 
  Sliders, 
  Layers, 
  ShoppingCart, 
  Landmark, 
  ShieldCheck 
} from 'lucide-react';
import { 
  AppUser, 
  UserPermissions, 
  SystemPermission,
  OrganizationUnit,
  Station,
  Region
} from '../../types';
import { DEFAULT_PERMISSIONS } from '../../db/defaults';
import { CustodyDB } from '../../db';

export interface DynamicModuleCategory {
  id: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  badgeBg: string;
  badgeText: string;
  permissions: {
    key: keyof UserPermissions;
    nameAr: string;
    nameEn: string;
    descAr: string;
    descEn: string;
    systemAdminOnly?: boolean;
  }[];
}

export interface ActiveModuleBadge {
  id: string;
  nameAr: string;
  nameEn: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  badgeBg: string;
}

export interface CategoryPermissionStatus {
  allEnabled: boolean;
  noneEnabled: boolean;
  partiallyEnabled: boolean;
  enabledCount: number;
  totalCount: number;
}

// Category visual metadata dictionary with fallbacks for dynamically discovered categories
export const CATEGORY_METADATA_MAP: Record<string, {
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  badgeBg: string;
  badgeText: string;
}> = {
  custody: {
    nameAr: 'العهد النقدية والمصروفات',
    nameEn: 'Cash Custody & Expenses',
    descAr: 'إدارة وتخصيص حدود العهد النقدية للمحطات واستعاضتها وتعديل قيمها المالية',
    descEn: 'Manage custody limits, process replenishments, and set financial thresholds',
    icon: Receipt,
    color: 'emerald',
    badgeBg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
    badgeText: 'text-emerald-600 dark:text-emerald-400'
  },
  expenses: {
    nameAr: 'المصروفات اليومية والفواتير',
    nameEn: 'Daily Expenses & Bills',
    descAr: 'تسجيل وتعديل وحذف طلبات المصروفات اليومية وإرفاق الفواتير والإيصالات',
    descEn: 'Record, edit, and delete daily expense requests and receipts',
    icon: Receipt,
    color: 'emerald',
    badgeBg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
    badgeText: 'text-emerald-600 dark:text-emerald-400'
  },
  vouchers: {
    nameAr: 'سندات الصرف والتسويات',
    nameEn: 'Cash Vouchers & Settlements',
    descAr: 'إنشاء ومراجعة واعتماد سندات الصرف النقدي وإقفال وتسوية المطالبات المالية',
    descEn: 'Create, review, approve cash vouchers and close financial settlements',
    icon: FileText,
    color: 'blue',
    badgeBg: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20',
    badgeText: 'text-blue-600 dark:text-blue-400'
  },
  fleet: {
    nameAr: 'الأسطول وحركة المركبات',
    nameEn: 'Fleet & Logistics Management',
    descAr: 'إدارة أسطول المركبات، السائقين، المشاوير، خطوط السير، الأعطال، وبوابة السائق',
    descEn: 'Manage vehicle inventory, drivers, trip dispatching, breakdowns, and driver portal',
    icon: Car,
    color: 'amber',
    badgeBg: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20',
    badgeText: 'text-amber-600 dark:text-amber-400'
  },
  reports: {
    nameAr: 'التقارير والتحليلات',
    nameEn: 'Reports & Business Analytics',
    descAr: 'الاطلاع على المؤشرات المالية والتشغيلية، كشوفات الحسابات، وتصدير الملفات',
    descEn: 'Access operational dashboards, financial summaries, and export data',
    icon: BarChart3,
    color: 'purple',
    badgeBg: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/20',
    badgeText: 'text-purple-600 dark:text-purple-400'
  },
  admin: {
    nameAr: 'إدارة النظام والتحكم',
    nameEn: 'System Administration & Governance',
    descAr: 'إدارة حسابات الموظفين، الفروع والمحطات، السياسات، الإعدادات العامة والأمان',
    descEn: 'Manage user profiles, organizational units, general settings, and governance',
    icon: Sliders,
    color: 'slate',
    badgeBg: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/20',
    badgeText: 'text-slate-600 dark:text-slate-400'
  },
  inventory: {
    nameAr: 'المخازن والمستودعات',
    nameEn: 'Inventory & Warehouses',
    descAr: 'إدارة المخازن، سندات الإدخال والإخراج، والتسويات الجردية للأصناف',
    descEn: 'Manage warehouses, stock movements, and inventory adjustments',
    icon: Layers,
    color: 'teal',
    badgeBg: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/20',
    badgeText: 'text-teal-600 dark:text-teal-400'
  },
  purchasing: {
    nameAr: 'المشتريات والتموين',
    nameEn: 'Procurement & Purchasing',
    descAr: 'إدارة طلبات الشراء، سجل الموردين، وأوامر الشراء المعتمدة',
    descEn: 'Manage purchase requests, vendor directory, and purchase orders',
    icon: ShoppingCart,
    color: 'cyan',
    badgeBg: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/20',
    badgeText: 'text-cyan-600 dark:text-cyan-400'
  },
  accounting: {
    nameAr: 'المحاسبة ودفتر الأستاذ',
    nameEn: 'General Ledger & Accounting',
    descAr: 'شجرة الحسابات، قيود اليومية المزدوجة، وموازين المراجعة والقوائم المالية',
    descEn: 'Chart of accounts, journal entries, and financial statements',
    icon: Landmark,
    color: 'violet',
    badgeBg: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/20',
    badgeText: 'text-violet-600 dark:text-violet-400'
  }
};

/**
 * Builds dynamic categories and fine-grained permissions dynamically from DEFAULT_PERMISSIONS
 * ensuring that any new permission added to the source of truth automatically appears in the UI.
 */
export function buildDynamicPermissionCategories(sourcePermissions: SystemPermission[] = DEFAULT_PERMISSIONS): DynamicModuleCategory[] {
  const categoryMap = new Map<string, DynamicModuleCategory>();

  sourcePermissions.forEach((perm) => {
    const rawCategory = perm.category || 'general';
    
    if (!categoryMap.has(rawCategory)) {
      const meta = CATEGORY_METADATA_MAP[rawCategory] || {
        nameAr: `صلاحيات ${rawCategory}`,
        nameEn: `${rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1)} Permissions`,
        descAr: `التحكم في وظائف وعمليات موديول ${rawCategory}`,
        descEn: `Manage authority and operations for ${rawCategory} module`,
        icon: ShieldCheck,
        color: 'indigo',
        badgeBg: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
        badgeText: 'text-indigo-600 dark:text-indigo-400'
      };

      categoryMap.set(rawCategory, {
        id: rawCategory,
        nameAr: meta.nameAr,
        nameEn: meta.nameEn,
        descAr: meta.descAr,
        descEn: meta.descEn,
        icon: meta.icon,
        color: meta.color,
        badgeBg: meta.badgeBg,
        badgeText: meta.badgeText,
        permissions: []
      });
    }

    const cat = categoryMap.get(rawCategory)!;
    cat.permissions.push({
      key: perm.id as keyof UserPermissions,
      nameAr: perm.name_ar,
      nameEn: perm.name_en,
      descAr: perm.description_ar,
      descEn: perm.description_en,
      systemAdminOnly: perm.id === 'manage_companies'
    });
  });

  return Array.from(categoryMap.values());
}

/**
 * Generates a secure temporary random password for user onboarding / provisioning (14 characters)
 */
export function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  let pass = 'Pass@2026';
  for (let i = 0; i < 6; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

/**
 * Evaluates what active modules a user has based on their fine-grained permissions
 */
export function getUserActiveModules(user: AppUser): ActiveModuleBadge[] {
  const p = user.permissions || CustodyDB.enrichUserPermissions(user.role);
  const activeMods: ActiveModuleBadge[] = [];

  const hasCustody = !!(p.create_expense || p.edit_expense || p.delete_expense || p.create_custody || p.edit_custody || p.replace_custody);
  if (hasCustody) {
    activeMods.push({ id: 'custody', nameAr: 'العهد والمصروفات', nameEn: 'Custody & Expenses', icon: Receipt, color: 'emerald', badgeBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20' });
  }

  const hasVouchers = !!(p.create_voucher || p.approve_voucher || p.reject_voucher || p.settle_voucher);
  if (hasVouchers) {
    activeMods.push({ id: 'vouchers', nameAr: 'سندات الصرف', nameEn: 'Vouchers', icon: FileText, color: 'blue', badgeBg: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20' });
  }

  const hasFleet = !!(p.manage_fleet || p.create_trip || p.approve_trip || p.dispatch_trip || p.reassign_vehicle || p.execute_breakdown_decision || p.create_emergency_trip || p.manage_vehicle_constraints || p.execute_trip_tasks);
  if (hasFleet) {
    activeMods.push({ id: 'fleet', nameAr: 'الأسطول والحركة', nameEn: 'Fleet', icon: Car, color: 'amber', badgeBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' });
  }

  const hasReports = !!p.view_reports;
  if (hasReports) {
    activeMods.push({ id: 'reports', nameAr: 'التقارير', nameEn: 'Reports', icon: BarChart3, color: 'purple', badgeBg: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20' });
  }

  const hasAdmin = !!(p.manage_users || p.manage_roles || p.manage_settings || p.manage_stations || p.manage_regions || p.manage_companies);
  if (hasAdmin) {
    activeMods.push({ id: 'admin', nameAr: 'الإدارة', nameEn: 'Admin', icon: Sliders, color: 'slate', badgeBg: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20' });
  }

  return activeMods;
}

/**
 * Checks if a category is fully, partially, or none enabled given current user permissions and admin role
 */
export function getCategoryPermissionStatus(
  category: DynamicModuleCategory,
  userPermissions: UserPermissions,
  isSystemAdmin: boolean = false
): CategoryPermissionStatus {
  const applicable = category.permissions.filter(p => !p.systemAdminOnly || isSystemAdmin);
  const enabledCount = applicable.filter(p => !!userPermissions[p.key]).length;
  const totalCount = applicable.length;

  return {
    allEnabled: enabledCount === totalCount && totalCount > 0,
    noneEnabled: enabledCount === 0,
    partiallyEnabled: enabledCount > 0 && enabledCount < totalCount,
    enabledCount,
    totalCount
  };
}

/**
 * Evaluates the human-readable branch/scope label for a user in the UI table
 */
export function getUserBranchLabel(
  user: AppUser,
  companyOrgUnits: OrganizationUnit[],
  isRtl: boolean,
  stations: Station[] = [],
  regions: Region[] = []
): { text: string; isAll: boolean; isWarning?: boolean } {
  if (user.role === 'SystemAdmin') {
    return { text: isRtl ? '🌐 كامل المنصة' : '🌐 Platform Scope', isAll: true };
  }
  if (user.role === 'Admin' && !user.org_unit_id) {
    return { text: isRtl ? '🏢 كامل نطاق الشركة' : '🏢 Company-wide Scope', isAll: true };
  }

  if (user.org_unit_id) {
    const matchUnit = companyOrgUnits.find(u => u.id === user.org_unit_id);
    if (matchUnit) {
      return { text: isRtl ? (matchUnit.nameAr || matchUnit.name) : (matchUnit.nameEn || matchUnit.name), isAll: false };
    }
  }

  if (user.assigned_org_unit_ids && user.assigned_org_unit_ids.length > 0) {
    const first = companyOrgUnits.find(u => u.id === user.assigned_org_unit_ids![0]);
    const count = user.assigned_org_unit_ids.length;
    if (count === 1 && first) {
      return { text: isRtl ? (first.nameAr || first.name) : (first.nameEn || first.name), isAll: false };
    }
    return { text: isRtl ? `${count} فروع مخصصة` : `${count} Assigned Branches`, isAll: false };
  }

  if (user.station_id) {
    const stn = stations.find(s => s.id === user.station_id);
    if (stn) return { text: stn.station_name, isAll: false };
  }

  if (user.region_id) {
    const reg = regions.find(r => r.id === user.region_id);
    if (reg) return { text: reg.name, isAll: false };
  }

  return { text: isRtl ? '⚠️ غير مخصص لفرع' : '⚠️ Unassigned Scope', isAll: false, isWarning: true };
}
