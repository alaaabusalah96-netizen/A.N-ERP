import { AppUser, ExpenseCategory, Transaction, ActivityLog, CustodyConfig, Region, Station, Company, Expense, CashVoucher, TransactionHistory, Notification, AuditLog, SystemPermission, SystemRole, OrganizationUnit } from '../types';

// Pre-seeded Companies (5 Egyptian Industries)
export const DEFAULT_COMPANIES: Company[] = [
  { id: 'comp-sewedy-mfg', name: 'El-Sewedy Industrial Group (السويدي للصناعات الهندسية)', custody_value: 1500000.00, is_active: true, subscription_status: 'active', subscription_plan: 'Enterprise', subscription_expiry: '2028-12-31' },
  { id: 'comp-futtaim-trade', name: 'Al-Futtaim Commercial Trading (الفطيم للتجارة والتوزيع)', custody_value: 800000.00, is_active: true, subscription_status: 'active', subscription_plan: 'Enterprise', subscription_expiry: '2028-12-31' },
  { id: 'comp-cairo-poultry', name: 'Cairo Poultry Group (القاهرة للإنتاج الداجني والزراعي)', custody_value: 500000.00, is_active: true, subscription_status: 'active', subscription_plan: 'Enterprise', subscription_expiry: '2028-12-31' },
  { id: 'comp-daltex-holding', name: 'Daltex Agricultural Holding Group (مجموعة دلتاكس القابضة للتنمية الزراعية)', custody_value: 2000000.00, is_active: true, subscription_status: 'active', subscription_plan: 'Enterprise', subscription_expiry: '2028-12-31' },
  { id: 'comp-carrefour-retail', name: 'Carrefour Egypt Retail Supermarkets (كارفور مصر لتجارة التجزئة)', custody_value: 1200000.00, is_active: true, subscription_status: 'active', subscription_plan: 'Enterprise', subscription_expiry: '2028-12-31' }
];

export const DEFAULT_REGIONS: Region[] = [
  { id: 'reg-cairo-east', name: 'Eastern Region (المنطقة الشرقية)', code: 'REG-CP-EAST', company_id: 'comp-cairo-poultry' },
  { id: 'reg-sewedy-10th', name: '10th of Ramadan Industrial Zone (منطقة العاشر من رمضان الصناعية)', code: 'REG-SEW-10TH', company_id: 'comp-sewedy-mfg' },
  { id: 'reg-futtaim-cairo', name: 'Greater Cairo Region (منطقة القاهرة الكبرى)', code: 'REG-FUT-CAI', company_id: 'comp-futtaim-trade' },
  { id: 'reg-daltex-delta', name: 'Delta Agricultural Zone (منطقة الدلتا الزراعية)', code: 'REG-DLT-DLT', company_id: 'comp-daltex-holding' },
  { id: 'reg-carrefour-north', name: 'Northern Retail Zone (منطقة التجزئة الشمالية)', code: 'REG-CRF-N', company_id: 'comp-carrefour-retail' }
];

export const DEFAULT_STATIONS: Station[] = [
  { id: 'stn-cairo-1', region_id: 'reg-cairo-east', station_name: 'Sina 2000 Station (محطة سينا 2000)', station_code: 'STN-CP-SINA', custody_amount: 250000.00, is_active: true, company_id: 'comp-cairo-poultry' },
  { id: 'stn-cairo-2', region_id: 'reg-cairo-east', station_name: 'Al-Qadisiya Station (محطة القادسية)', station_code: 'STN-CP-QAD', custody_amount: 250000.00, is_active: true, company_id: 'comp-cairo-poultry' },
  { id: 'stn-sewedy-fac-1', region_id: 'reg-sewedy-10th', station_name: 'Main Cables Factory (مصنع الكابلات الرئيسي)', station_code: 'FAC-SEW-01', custody_amount: 500000.00, is_active: true, company_id: 'comp-sewedy-mfg' },
  { id: 'stn-futtaim-cai-1', region_id: 'reg-futtaim-cairo', station_name: 'Cairo Main Distribution Branch (فرع القاهرة الرئيسي للتوزيع)', station_code: 'BR-FUT-01', custody_amount: 150000.00, is_active: true, company_id: 'comp-futtaim-trade' },
  { id: 'stn-daltex-agri-1', region_id: 'reg-daltex-delta', station_name: 'Nubaria Agricultural Sector (قطاع النوبارية الزراعي)', station_code: 'STN-DLT-01', custody_amount: 400000.00, is_active: true, company_id: 'comp-daltex-holding' },
  { id: 'stn-carrefour-store-1', region_id: 'reg-carrefour-north', station_name: 'Maadi Hypermarket Store (فرع هايبر ماركت المعادي)', station_code: 'STORE-CRF-01', custody_amount: 300000.00, is_active: true, company_id: 'comp-carrefour-retail' }
];

// Pre-seeded Organization Units across 5 Egyptian Industry Templates (27 total units)
export const DEFAULT_ORGANIZATION_UNITS: OrganizationUnit[] = [
  // 1. Industrial/Manufacturing (comp-sewedy-mfg, tpl-manufacturing)
  { id: 'org-unit-sewedy-hq', companyId: 'comp-sewedy-mfg', parentId: null, typeId: 'out-company', code: 'SEW-CORP', name: 'الشركة الصناعية - السويدي', nameAr: 'الشركة الصناعية - السويدي', nameEn: 'El-Sewedy Industrial Group', path: '/org-unit-sewedy-hq', level: 0, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-sewedy-fac-01', companyId: 'comp-sewedy-mfg', parentId: 'org-unit-sewedy-hq', typeId: 'out-factory', code: 'FAC-SEW-01', name: 'مصنع الإنتاج الرئيسي', nameAr: 'مصنع الإنتاج الرئيسي', nameEn: 'Main Manufacturing Plant', path: '/org-unit-sewedy-hq/org-unit-sewedy-fac-01', level: 1, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-sewedy-dept-prod', companyId: 'comp-sewedy-mfg', parentId: 'org-unit-sewedy-fac-01', typeId: 'out-department', code: 'DEPT-PROD', name: 'إدارة خطوط الإنتاج', nameAr: 'إدارة خطوط الإنتاج', nameEn: 'Production Department', path: '/org-unit-sewedy-hq/org-unit-sewedy-fac-01/org-unit-sewedy-dept-prod', level: 2, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-sewedy-dept-qc', companyId: 'comp-sewedy-mfg', parentId: 'org-unit-sewedy-fac-01', typeId: 'out-department', code: 'DEPT-QC', name: 'إدارة الجودة والرقابة', nameAr: 'إدارة الجودة والرقابة', nameEn: 'Quality Control Department', path: '/org-unit-sewedy-hq/org-unit-sewedy-fac-01/org-unit-sewedy-dept-qc', level: 2, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-sewedy-line-a', companyId: 'comp-sewedy-mfg', parentId: 'org-unit-sewedy-dept-prod', typeId: 'out-unit', code: 'LINE-A', name: 'خط إنتاج أ', nameAr: 'خط إنتاج أ', nameEn: 'Production Line A', path: '/org-unit-sewedy-hq/org-unit-sewedy-fac-01/org-unit-sewedy-dept-prod/org-unit-sewedy-line-a', level: 3, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-sewedy-line-b', companyId: 'comp-sewedy-mfg', parentId: 'org-unit-sewedy-dept-prod', typeId: 'out-unit', code: 'LINE-B', name: 'خط إنتاج ب', nameAr: 'خط إنتاج ب', nameEn: 'Production Line B', path: '/org-unit-sewedy-hq/org-unit-sewedy-fac-01/org-unit-sewedy-dept-prod/org-unit-sewedy-line-b', level: 3, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },

  // 2. General Trade/Commercial (comp-futtaim-trade, tpl-trading)
  { id: 'org-unit-futtaim-hq', companyId: 'comp-futtaim-trade', parentId: null, typeId: 'out-company', code: 'FUT-HQ', name: 'المقر الرئيسي للشركة - الفطيم', nameAr: 'المقر الرئيسي للشركة - الفطيم', nameEn: 'Al-Futtaim Commercial HQ', path: '/org-unit-futtaim-hq', level: 0, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-futtaim-sec-sales', companyId: 'comp-futtaim-trade', parentId: 'org-unit-futtaim-hq', typeId: 'out-sector', code: 'SEC-SALES', name: 'قطاع المبيعات والتوزيع', nameAr: 'قطاع المبيعات والتوزيع', nameEn: 'Sales & Distribution Sector', path: '/org-unit-futtaim-hq/org-unit-futtaim-sec-sales', level: 1, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-futtaim-sec-ops', companyId: 'comp-futtaim-trade', parentId: 'org-unit-futtaim-hq', typeId: 'out-sector', code: 'SEC-OPS', name: 'قطاع العمليات واللوجستيات', nameAr: 'قطاع العمليات واللوجستيات', nameEn: 'Operations & Logistics Sector', path: '/org-unit-futtaim-hq/org-unit-futtaim-sec-ops', level: 1, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-futtaim-reg-cairo', companyId: 'comp-futtaim-trade', parentId: 'org-unit-futtaim-sec-sales', typeId: 'out-region', code: 'REG-CAIRO', name: 'منطقة القاهرة الكبرى', nameAr: 'منطقة القاهرة الكبرى', nameEn: 'Greater Cairo Region', path: '/org-unit-futtaim-hq/org-unit-futtaim-sec-sales/org-unit-futtaim-reg-cairo', level: 2, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-futtaim-reg-alex', companyId: 'comp-futtaim-trade', parentId: 'org-unit-futtaim-sec-sales', typeId: 'out-region', code: 'REG-ALEX', name: 'منطقة الإسكندرية والدلتا', nameAr: 'منطقة الإسكندرية والدلتا', nameEn: 'Alexandria & Delta Region', path: '/org-unit-futtaim-hq/org-unit-futtaim-sec-sales/org-unit-futtaim-reg-alex', level: 2, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-futtaim-br-cai', companyId: 'comp-futtaim-trade', parentId: 'org-unit-futtaim-reg-cairo', typeId: 'out-branch', code: 'BR-CAI-01', name: 'فرع القاهرة الرئيسي', nameAr: 'فرع القاهرة الرئيسي', nameEn: 'Cairo Main Branch', path: '/org-unit-futtaim-hq/org-unit-futtaim-sec-sales/org-unit-futtaim-reg-cairo/org-unit-futtaim-br-cai', level: 3, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-futtaim-br-alx', companyId: 'comp-futtaim-trade', parentId: 'org-unit-futtaim-reg-alex', typeId: 'out-branch', code: 'BR-ALX-01', name: 'فرع الإسكندرية الرئيسي', nameAr: 'فرع الإسكندرية الرئيسي', nameEn: 'Alexandria Main Branch', path: '/org-unit-futtaim-hq/org-unit-futtaim-sec-sales/org-unit-futtaim-reg-alex/org-unit-futtaim-br-alx', level: 3, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },

  // 3. Poultry (comp-cairo-poultry, tpl-poultry) - Includes Part 1 Escalation Demo Unit
  { id: 'org-unit-cairo-poultry-hq', companyId: 'comp-cairo-poultry', parentId: null, typeId: 'out-company', code: 'CPG-HQ', name: 'شركة الإنتاج الداجني - القاهرة للدواجن', nameAr: 'شركة الإنتاج الداجني - القاهرة للدواجن', nameEn: 'Cairo Poultry Group HQ', path: '/org-unit-cairo-poultry-hq', level: 0, isActive: true, max_accounts_allowed: 3, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-cp-sec-farms', companyId: 'comp-cairo-poultry', parentId: 'org-unit-cairo-poultry-hq', typeId: 'out-sector', code: 'SEC-FARMS', name: 'قطاع المزارع والتربية', nameAr: 'قطاع المزارع والتربية', nameEn: 'Farms & Breeding Sector', path: '/org-unit-cairo-poultry-hq/org-unit-cp-sec-farms', level: 1, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-cp-sec-proc', companyId: 'comp-cairo-poultry', parentId: 'org-unit-cairo-poultry-hq', typeId: 'out-sector', code: 'SEC-PROC', name: 'قطاع المجازر والتصنيع', nameAr: 'قطاع المجازر والتصنيع', nameEn: 'Processing & Slaughterhouse Sector', path: '/org-unit-cairo-poultry-hq/org-unit-cp-sec-proc', level: 1, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-cp-stn-salam', companyId: 'comp-cairo-poultry', parentId: 'org-unit-cp-sec-farms', typeId: 'out-station', code: 'STN-SALAM', name: 'محطة السلام الدواجن', nameAr: 'محطة السلام الدواجن', nameEn: 'El-Salam Station', path: '/org-unit-cairo-poultry-hq/org-unit-cp-sec-farms/org-unit-cp-stn-salam', level: 2, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-cp-farm-1', companyId: 'comp-cairo-poultry', parentId: 'org-unit-cp-stn-salam', typeId: 'out-farm', code: 'FRM-SLM-01', name: 'مزرعة تسمين السلام 1', nameAr: 'مزرعة تسمين السلام 1', nameEn: 'El-Salam Broiler Farm 1', path: '/org-unit-cairo-poultry-hq/org-unit-cp-sec-farms/org-unit-cp-stn-salam/org-unit-cp-farm-1', level: 3, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-cp-farm-2', companyId: 'comp-cairo-poultry', parentId: 'org-unit-cp-stn-salam', typeId: 'out-farm', code: 'FRM-SLM-02', name: 'مزرعة تسمين السلام 2', nameAr: 'مزرعة تسمين السلام 2', nameEn: 'El-Salam Broiler Farm 2', path: '/org-unit-cairo-poultry-hq/org-unit-cp-sec-farms/org-unit-cp-stn-salam/org-unit-cp-farm-2', level: 3, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },

  // 4. Agriculture / Diversified Conglomerate Holding (comp-daltex-holding, tpl-holding)
  { id: 'org-unit-daltex-holding', companyId: 'comp-daltex-holding', parentId: null, typeId: 'out-holding', code: 'DLT-HOLD', name: 'المجموعة القابضة - دلتاكس القابضة', nameAr: 'المجموعة القابضة - دلتاكس القابضة', nameEn: 'Daltex Holding Group', path: '/org-unit-daltex-holding', level: 0, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-daltex-sub-agri', companyId: 'comp-daltex-holding', parentId: 'org-unit-daltex-holding', typeId: 'out-company', code: 'COMP-AGRI', name: 'الشركة التابعة للتنمية الزراعية', nameAr: 'الشركة التابعة للتنمية الزراعية', nameEn: 'Agricultural Subsidiary Co', path: '/org-unit-daltex-holding/org-unit-daltex-sub-agri', level: 1, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-daltex-sub-trade', companyId: 'comp-daltex-holding', parentId: 'org-unit-daltex-holding', typeId: 'out-company', code: 'COMP-TRD', name: 'الشركة التابعة للتجارة والاستيراد', nameAr: 'الشركة التابعة للتجارة والاستيراد', nameEn: 'Trading Subsidiary Co', path: '/org-unit-daltex-holding/org-unit-daltex-sub-trade', level: 1, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-daltex-sec-farms', companyId: 'comp-daltex-holding', parentId: 'org-unit-daltex-sub-agri', typeId: 'out-sector', code: 'SEC-AGRI-F', name: 'قطاع الإنتاج الزراعي', nameAr: 'قطاع الإنتاج الزراعي', nameEn: 'Agricultural Sector', path: '/org-unit-daltex-holding/org-unit-daltex-sub-agri/org-unit-daltex-sec-farms', level: 2, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },

  // 5. Retail Supermarkets (comp-carrefour-retail, tpl-retail)
  { id: 'org-unit-carrefour-hq', companyId: 'comp-carrefour-retail', parentId: null, typeId: 'out-company', code: 'CRF-HQ', name: 'شركة تجارة التجزئة - كارفور مصر', nameAr: 'شركة تجارة التجزئة - كارفور مصر', nameEn: 'Carrefour Egypt Retail Supermarkets', path: '/org-unit-carrefour-hq', level: 0, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-crf-reg-north', companyId: 'comp-carrefour-retail', parentId: 'org-unit-carrefour-hq', typeId: 'out-region', code: 'REG-N', name: 'قطاع الفروع الشمالية', nameAr: 'قطاع الفروع الشمالية', nameEn: 'Northern Retail Zone', path: '/org-unit-carrefour-hq/org-unit-crf-reg-north', level: 1, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-crf-store-01', companyId: 'comp-carrefour-retail', parentId: 'org-unit-crf-reg-north', typeId: 'out-branch', code: 'STORE-01', name: 'فرع الهايبر ماركت 1', nameAr: 'فرع الهايبر ماركت 1', nameEn: 'Hypermarket Store 1', path: '/org-unit-carrefour-hq/org-unit-crf-reg-north/org-unit-crf-store-01', level: 2, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'org-unit-crf-store-02', companyId: 'comp-carrefour-retail', parentId: 'org-unit-crf-reg-north', typeId: 'out-branch', code: 'STORE-02', name: 'فرع الإكسبريس 2', nameAr: 'فرع الإكسبريس 2', nameEn: 'Express Outlet Store 2', path: '/org-unit-carrefour-hq/org-unit-crf-reg-north/org-unit-crf-store-02', level: 2, isActive: true, max_accounts_allowed: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
];

// Pre-seeded Categories
export const DEFAULT_CATEGORIES: ExpenseCategory[] = [
  { id: 'cat-1', name_en: 'Office Supplies', name_ar: 'أدوات مكتبية ومستلزمات' },
  { id: 'cat-2', name_en: 'Transport & Travel', name_ar: 'انتقالات ومصاريف سفر' },
  { id: 'cat-3', name_en: 'Hospitality & Food', name_ar: 'ضيافة ومأكولات' },
  { id: 'cat-4', name_en: 'Maintenance & Repairs', name_ar: 'صيانة وإصلاحات' },
  { id: 'cat-5', name_en: 'Utilities & Internet', name_ar: 'مرافق وإنترنت' },
  { id: 'cat-6', name_en: 'Miscellaneous', name_ar: 'مصاريف نثرية أخرى' }
];

// Pre-configured Users (Seeded accounts across 3 diverse Egyptian company structures)
export const DEFAULT_USERS: AppUser[] = [
  // 1. Industrial / Manufacturing Company Users (El-Sewedy)
  {
    id: 'user-sewedy-admin',
    email: 'sewedy.admin@local',
    full_name: 'أحمد السويدي (مدير الشركة)',
    role: 'Admin',
    is_active: true,
    company_id: 'comp-sewedy-mfg',
    permissions: {
      create_expense: false, edit_expense: true, delete_expense: true,
      create_voucher: false, approve_voucher: true, reject_voucher: true,
      create_custody: true, edit_custody: true, replace_custody: true,
      view_reports: true, manage_users: true, manage_companies: false,
      manage_regions: true, manage_stations: true, manage_roles: true,
      manage_settings: true, settle_voucher: false,
    },
  },
  {
    id: 'user-sewedy-cashier',
    email: 'sewedy.cashier@local',
    full_name: 'محمود حسن (أمين عهدة مصنع العاشر)',
    role: 'StationAdmin',
    is_active: true,
    company_id: 'comp-sewedy-mfg',
    region_id: 'reg-sewedy-10th',
    station_id: 'stn-sewedy-fac-1',
    permissions: {
      create_expense: true, edit_expense: true, delete_expense: false,
      create_voucher: true, approve_voucher: false, reject_voucher: false,
      create_custody: false, edit_custody: false, replace_custody: false,
      view_reports: true, manage_users: false, manage_companies: false,
      manage_regions: false, manage_stations: false, manage_roles: false,
      manage_settings: false, settle_voucher: true,
    },
  },
  // 2. Retail / Supermarket Chain Users (Carrefour)
  {
    id: 'user-carrefour-admin',
    email: 'carrefour.admin@local',
    full_name: 'طارق القاضي (مدير التجارة والتجزئة)',
    role: 'Admin',
    is_active: true,
    company_id: 'comp-carrefour-retail',
    permissions: {
      create_expense: false, edit_expense: true, delete_expense: true,
      create_voucher: false, approve_voucher: true, reject_voucher: true,
      create_custody: true, edit_custody: true, replace_custody: true,
      view_reports: true, manage_users: true, manage_companies: false,
      manage_regions: true, manage_stations: true, manage_roles: true,
      manage_settings: true, settle_voucher: false,
    },
  },
  {
    id: 'user-carrefour-cashier',
    email: 'carrefour.cashier@local',
    full_name: 'يوسف منصور (أمين عهدة فرع المعادي)',
    role: 'StationAdmin',
    is_active: true,
    company_id: 'comp-carrefour-retail',
    region_id: 'reg-carrefour-north',
    station_id: 'stn-carrefour-store-1',
    permissions: {
      create_expense: true, edit_expense: true, delete_expense: false,
      create_voucher: true, approve_voucher: false, reject_voucher: false,
      create_custody: false, edit_custody: false, replace_custody: false,
      view_reports: true, manage_users: false, manage_companies: false,
      manage_regions: false, manage_stations: false, manage_roles: false,
      manage_settings: false, settle_voucher: true,
    },
  },
  // 3. Poultry / Agricultural Company Users (Cairo Poultry)
  {
    id: 'user-admin',
    email: 'cairo.admin@local',
    full_name: 'أحمد السيد (مدير شركة القاهرة للدواجن)',
    role: 'Admin',
    is_active: true,
    company_id: 'comp-cairo-poultry',
    permissions: {
      create_expense: false, edit_expense: true, delete_expense: true,
      create_voucher: false, approve_voucher: true, reject_voucher: true,
      create_custody: true, edit_custody: true, replace_custody: true,
      view_reports: true, manage_users: true, manage_companies: false,
      manage_regions: true, manage_stations: true, manage_roles: true,
      manage_settings: true, settle_voucher: false,
    },
  },
  {
    id: 'user-regular',
    email: 'cairo.cashier@local',
    full_name: 'مريم علي (أمين عهدة محطة سينا 2000)',
    role: 'StationAdmin',
    is_active: true,
    company_id: 'comp-cairo-poultry',
    region_id: 'reg-cairo-east',
    station_id: 'stn-cairo-1',
    permissions: {
      create_expense: true, edit_expense: true, delete_expense: false,
      create_voucher: true, approve_voucher: false, reject_voucher: false,
      create_custody: false, edit_custody: false, replace_custody: false,
      view_reports: true, manage_users: false, manage_companies: false,
      manage_regions: false, manage_stations: false, manage_roles: false,
      manage_settings: false, settle_voucher: true,
    },
  },
];

// Pre-seeded Transactions
export const generateDefaultTransactions = (): Transaction[] => {
  return [
    // El-Sewedy Manufacturing Transactions
    {
      id: 'tx-sew-1',
      transaction_no: 'CPV-SEW-0001',
      date: '2026-07-02',
      description: 'شراء قطع غيار وزيوت صيانة لخط السحب بمصنع العاشر',
      category_id: 'cat-4',
      amount: 4850.00,
      notes: 'صيانة دورية عاجلة لخط السحب والتغليف',
      status: 'Under Settlement',
      voucher_no: 'VCH-SEW-0001',
      voucher_date: '2026-07-03',
      created_by: 'user-sewedy-cashier',
      created_at: '2026-07-02T08:30:00Z',
      updated_at: '2026-07-03T10:00:00Z',
      station_id: 'stn-sewedy-fac-1',
      company_id: 'comp-sewedy-mfg'
    },
    {
      id: 'tx-sew-2',
      transaction_no: 'CPV-SEW-0002',
      date: '2026-07-04',
      description: 'معدات أمان وسلامة وصحة مهنية لعمال المصنع',
      category_id: 'cat-1',
      amount: 2300.00,
      notes: 'معلق للتعميد والاعتماد النهائي',
      status: 'Pending',
      created_by: 'user-sewedy-cashier',
      created_at: '2026-07-04T09:15:00Z',
      updated_at: '2026-07-04T09:15:00Z',
      station_id: 'stn-sewedy-fac-1',
      company_id: 'comp-sewedy-mfg'
    },

    // Carrefour Retail Supermarket Transactions
    {
      id: 'tx-crf-1',
      transaction_no: 'CPV-CRF-0001',
      date: '2026-07-01',
      description: 'استعاضة فراش الكاشير وفكة النقدية لفرع المعادي',
      category_id: 'cat-6',
      amount: 5000.00,
      notes: 'تمت الاستعاضة والاعتماد نقداً',
      status: 'Settled',
      voucher_no: 'VCH-CRF-0001',
      voucher_date: '2026-07-01',
      created_by: 'user-carrefour-cashier',
      created_at: '2026-07-01T07:00:00Z',
      updated_at: '2026-07-01T08:30:00Z',
      station_id: 'stn-carrefour-store-1',
      company_id: 'comp-carrefour-retail'
    },
    {
      id: 'tx-crf-2',
      transaction_no: 'CPV-CRF-0002',
      date: '2026-07-03',
      description: 'إصلاح طارئ لثلاجة العرض بقسم الأغذية الطازجة',
      category_id: 'cat-4',
      amount: 3400.00,
      notes: 'صيانة فنية طارئة لمنع تلف البضائع',
      status: 'Under Settlement',
      voucher_no: 'VCH-CRF-0002',
      voucher_date: '2026-07-04',
      created_by: 'user-carrefour-cashier',
      created_at: '2026-07-03T11:20:00Z',
      updated_at: '2026-07-04T12:00:00Z',
      station_id: 'stn-carrefour-store-1',
      company_id: 'comp-carrefour-retail'
    },

    // Cairo Poultry Group Transactions
    {
      id: 'tx-sina-1',
      transaction_no: 'CPV-SINA-0001',
      date: '2026-07-01',
      description: 'شراء أدوات مكتبية ومستلزمات تصوير عاجلة للمحطة',
      category_id: 'cat-1',
      amount: 1450.00,
      notes: 'معلق لمراجعة الفواتير والاعتماد الكلي',
      status: 'Pending',
      created_by: 'user-regular',
      created_at: '2026-07-01T09:30:00Z',
      updated_at: '2026-07-01T09:30:00Z',
      station_id: 'stn-cairo-1',
      company_id: 'comp-cairo-poultry'
    },
    {
      id: 'tx-sina-2',
      transaction_no: 'CPV-SINA-0002',
      date: '2026-07-02',
      description: 'مصاريف انتقالات ومحروقات لسيارة المحطة',
      category_id: 'cat-2',
      amount: 850.00,
      notes: 'طلب استعاضة وقود عاجل',
      status: 'Pending',
      created_by: 'user-regular',
      created_at: '2026-07-02T10:15:00Z',
      updated_at: '2026-07-02T10:15:00Z',
      station_id: 'stn-cairo-1',
      company_id: 'comp-cairo-poultry'
    },
    {
      id: 'tx-sina-3',
      transaction_no: 'CPV-SINA-0003',
      date: '2026-07-03',
      description: 'صيانة طارئة لوحدات التكييف والمرافق بالمحطة',
      category_id: 'cat-4',
      amount: 3200.00,
      notes: 'تمت الصيانة واعتماد سند الصرف',
      status: 'Under Settlement',
      voucher_no: 'VCH-SINA-0003',
      voucher_date: '2026-07-04',
      created_by: 'user-regular',
      created_at: '2026-07-03T11:00:00Z',
      updated_at: '2026-07-04T12:00:00Z',
      station_id: 'stn-cairo-1',
      company_id: 'comp-cairo-poultry'
    },
    {
      id: 'tx-sina-4',
      transaction_no: 'CPV-SINA-0004',
      date: '2026-07-04',
      description: 'شراء مواد ضيافة ومأكولات للموظفين بالمحطة',
      category_id: 'cat-3',
      amount: 650.00,
      notes: 'وجبة غداء لفريق الصيانة الدورية',
      status: 'Under Settlement',
      voucher_no: 'VCH-SINA-0004',
      voucher_date: '2026-07-05',
      created_by: 'user-regular',
      created_at: '2026-07-04T13:30:00Z',
      updated_at: '2026-07-05T10:00:00Z',
      station_id: 'stn-cairo-1',
      company_id: 'comp-cairo-poultry'
    },
    {
      id: 'tx-sina-5',
      transaction_no: 'CPV-SINA-0005',
      date: '2026-07-05',
      description: 'سداد فواتير الإنترنت والمرافق الدورية للمحطة',
      category_id: 'cat-5',
      amount: 1100.00,
      notes: 'تم السداد نقداً وإرفاق إيصال الدفع الإلكتروني',
      status: 'Under Settlement',
      voucher_no: 'VCH-SINA-0005',
      voucher_date: '2026-07-05',
      created_by: 'user-regular',
      created_at: '2026-07-05T09:00:00Z',
      updated_at: '2026-07-05T14:30:00Z',
      station_id: 'stn-cairo-1',
      company_id: 'comp-cairo-poultry'
    },
    {
      id: 'tx-qad-1',
      transaction_no: 'CPV-QAD-0001',
      date: '2026-07-01',
      description: 'إصلاحات طارئة في مرافق الصرف الصحي بالمحطة',
      category_id: 'cat-4',
      amount: 1850.00,
      notes: 'طلب صيانة عاجل لتفادي الأضرار',
      status: 'Pending',
      created_by: 'user-regular-2',
      created_at: '2026-07-01T08:45:00Z',
      updated_at: '2026-07-01T08:45:00Z',
      station_id: 'stn-cairo-2',
      company_id: 'comp-cairo-poultry'
    },
    {
      id: 'tx-qad-2',
      transaction_no: 'CPV-QAD-0002',
      date: '2026-07-02',
      description: 'أدوات نظافة ومطهرات للمحطة والمكاتب',
      category_id: 'cat-1',
      amount: 450.00,
      notes: 'شراء مستلزمات نظافة دورية',
      status: 'Pending',
      created_by: 'user-regular-2',
      created_at: '2026-07-02T11:15:00Z',
      updated_at: '2026-07-02T11:15:00Z',
      station_id: 'stn-cairo-2',
      company_id: 'comp-cairo-poultry'
    },
    {
      id: 'tx-qad-3',
      transaction_no: 'CPV-QAD-0003',
      date: '2026-07-03',
      description: 'شراء وجبات ضيافة لوفد الإدارة العليا أثناء الزيارة',
      category_id: 'cat-3',
      amount: 1250.00,
      notes: 'ضيافة اجتماع مراجعة الأداء الدوري',
      status: 'Pending',
      created_by: 'user-regular-2',
      created_at: '2026-07-03T12:00:00Z',
      updated_at: '2026-07-03T12:00:00Z',
      station_id: 'stn-cairo-2',
      company_id: 'comp-cairo-poultry'
    },
    {
      id: 'tx-qad-4',
      transaction_no: 'CPV-QAD-0004',
      date: '2026-07-04',
      description: 'شراء مستلزمات وأحبار للطباعة بمكتب المحطة',
      category_id: 'cat-1',
      amount: 980.00,
      notes: 'معتمد وتحت التسوية والمراجعة الفنية',
      status: 'Under Settlement',
      voucher_no: 'VCH-QAD-0004',
      voucher_date: '2026-07-04',
      created_by: 'user-regular-2',
      created_at: '2026-07-04T10:00:00Z',
      updated_at: '2026-07-04T15:00:00Z',
      station_id: 'stn-cairo-2',
      company_id: 'comp-cairo-poultry'
    },
    {
      id: 'tx-qad-5',
      transaction_no: 'CPV-QAD-0005',
      date: '2026-07-05',
      description: 'إصلاح إطارات سيارة النقل الخاصة بالمحطة',
      category_id: 'cat-2',
      amount: 1500.00,
      notes: 'صيانة دورية عاجلة لسيارة نقل المياه',
      status: 'Under Settlement',
      voucher_no: 'VCH-QAD-0005',
      voucher_date: '2026-07-05',
      created_by: 'user-regular-2',
      created_at: '2026-07-05T09:30:00Z',
      updated_at: '2026-07-05T13:00:00Z',
      station_id: 'stn-cairo-2',
      company_id: 'comp-cairo-poultry'
    }
  ];
};

export const DEFAULT_TRANSACTIONS = generateDefaultTransactions();

export const DEFAULT_LOGS: ActivityLog[] = [
  {
    id: 'log-1',
    user_id: 'system',
    user_name: 'System Initializer',
    action: 'Database Initialized',
    details: 'Pre-seeded custody categories, regions, stations, users, and baseline transactions for Cairo Poultry.',
    timestamp: '2026-07-01T08:00:00Z'
  }
];

export const DEFAULT_CONFIG: CustodyConfig = {
  company_name: 'Cairo Poultry',
  custody_value: 500000.00
};

// Sprint 2 Default Collections Pre-seed Data
export const DEFAULT_EXPENSES: Expense[] = [
  {
    id: 'exp-1',
    station_id: 'stn-cairo-1',
    company_id: 'comp-cairo-poultry',
    category_id: 'cat-4',
    amount: 1540.00,
    description: 'إصلاح طلمبة المياه رقم 3 بمحطة سينا 2000',
    date: '2026-07-02',
    status: 'Approved',
    created_by: 'user-regular',
    created_at: '2026-07-02T10:30:00Z',
    updated_at: '2026-07-03T12:00:00Z',
    receipt_url: '',
    invoice_no: 'INV-2026-9901'
  }
];

export const DEFAULT_VOUCHERS: CashVoucher[] = [
  {
    id: 'vch-1',
    voucher_no: 'CPV-2026-0001',
    date: '2026-07-03',
    station_id: 'stn-cairo-1',
    company_id: 'comp-cairo-poultry',
    amount: 1540.00,
    amount_in_words: {
      ar: 'ألف وخمسمائة وأربعون جنيهاً مصرياً لا غير',
      en: 'One thousand five hundred and forty Egyptian Pounds only'
    },
    recipient_name: 'شركة مصر لأعمال الصيانة',
    received_by: 'user-regular',
    approved_by: 'user-admin',
    status: 'Approved',
    expense_ids: ['exp-1'],
    created_at: '2026-07-02T11:00:00Z',
    updated_at: '2026-07-03T12:00:00Z'
  }
];

export const DEFAULT_TX_HISTORY: TransactionHistory[] = [
  {
    id: 'txh-1',
    transaction_id: 'exp-1',
    action: 'Created',
    performed_by: 'user-regular',
    performed_by_name: 'Mariam Ali',
    timestamp: '2026-07-02T10:30:00Z',
    new_status: 'Pending',
    notes: 'تم تقديم طلب المصروف للصيانة الطارئة'
  },
  {
    id: 'txh-2',
    transaction_id: 'exp-1',
    action: 'Approved & Settled',
    performed_by: 'user-admin',
    performed_by_name: 'Ahmed El-Sayed',
    timestamp: '2026-07-03T12:00:00Z',
    previous_status: 'Pending',
    new_status: 'Approved',
    notes: 'تم المراجعة والاعتماد وصرف السند'
  }
];

export const DEFAULT_NOTIFICATIONS: Notification[] = [
  {
    id: 'ntf-1',
    user_id: 'user-admin',
    title_ar: 'طلب مصروف جديد معلق',
    title_en: 'New Pending Expense Request',
    message_ar: 'قامت مريم علي بتقديم طلب مصروف بمبلغ 1450.00 ج.م لمحطة سينا 2000',
    message_en: 'Mariam Ali submitted an expense of 1450.00 EGP for Sina 2000 Station.',
    is_read: false,
    type: 'info',
    related_id: 'tx-sina-1',
    created_at: '2026-07-01T09:31:00Z'
  }
];

export const DEFAULT_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'aud-1',
    user_id: 'user-admin',
    user_name: 'Ahmed El-Sayed',
    user_role: 'Admin',
    action_type: 'ROLE_MODIFICATION',
    description: 'تعديل صلاحيات دور مدير محطة لإضافة تسوية السندات تلقائياً',
    timestamp: '2026-06-28T14:20:00Z',
    details: { role_id: 'StationAdmin', updated_permissions: ['settle_voucher'] }
  }
];

export const DEFAULT_PERMISSIONS: SystemPermission[] = [
  { id: 'create_expense', name_en: 'Create Expense', name_ar: 'إنشاء مصروف', description_en: 'Allows creating new expense requests', description_ar: 'يسمح بإنشاء طلبات مصروفات جديدة', category: 'expenses' },
  { id: 'edit_expense', name_en: 'Edit Expense', name_ar: 'تعديل مصروف', description_en: 'Allows editing existing expense requests', description_ar: 'يسمح بتعديل طلبات المصروفات الحالية', category: 'expenses' },
  { id: 'delete_expense', name_en: 'Delete Expense', name_ar: 'حذف مصروف', description_en: 'Allows deleting expense requests', description_ar: 'يسمح بحذف طلبات المصروفات', category: 'expenses' },
  { id: 'create_voucher', name_en: 'Create Cash Voucher', name_ar: 'إنشاء سند صرف نقدي', description_en: 'Allows creating a cash payment voucher', description_ar: 'يسمح بإنشاء سند صرف نقدي', category: 'vouchers' },
  { id: 'approve_voucher', name_en: 'Approve Cash Voucher', name_ar: 'اعتماد سند صرف نقدي', description_en: 'Allows approving pending cash vouchers', description_ar: 'يسمح باعتماد سندات الصرف المعلقة', category: 'vouchers' },
  { id: 'reject_voucher', name_en: 'Reject Cash Voucher', name_ar: 'رفض سند صرف نقدي', description_en: 'Allows rejecting cash vouchers', description_ar: 'يسمح برفض سندات الصرف النقدي', category: 'vouchers' },
  { id: 'create_custody', name_en: 'Create Custody Setup', name_ar: 'إعداد عهدة جديدة', description_en: 'Allows creating new cash custody configuration', description_ar: 'يسمح بإعداد عهد جديدة لمرفق أو محطة', category: 'custody' },
  { id: 'edit_custody', name_en: 'Edit Custody Amount', name_ar: 'تعديل قيمة العهدة', description_en: 'Allows editing custody limits and details', description_ar: 'يسمح بتعديل حدود وتفاصيل العهد', category: 'custody' },
  { id: 'replace_custody', name_en: 'Replace/Replenish Custody', name_ar: 'استعاضة عهدة', description_en: 'Allows requesting/replenishing custody funds', description_ar: 'يسمح بطلب تعويض أو استعاضة العهدة', category: 'custody' },
  { id: 'view_reports', name_en: 'View Reports', name_ar: 'عرض التقارير والتحليلات', description_en: 'Allows access to reports and export metrics', description_ar: 'يسمح بالوصول إلى التقارير وتصدير البيانات', category: 'reports' },
  { id: 'manage_users', name_en: 'Manage Users', name_ar: 'إدارة المستخدمين', description_en: 'Allows managing user accounts and assignments', description_ar: 'يسمح بإدارة حسابات المستخدمين وتعييناتهم', category: 'admin' },
  { id: 'manage_companies', name_en: 'Manage Companies', name_ar: 'إدارة الشركات', description_en: 'Allows managing companies inside the ecosystem', description_ar: 'يسمح بإدارة الشركات في النظام', category: 'admin' },
  { id: 'manage_regions', name_en: 'Manage Regions', name_ar: 'إدارة الأقاليم والمناطق', description_en: 'Allows managing geographic region entities', description_ar: 'يسمح بإدارة أقاليم ومناطق العمل', category: 'admin' },
  { id: 'manage_stations', name_en: 'Manage Stations', name_ar: 'إدارة الفروع والمحطات', description_en: 'Allows managing station/branch entities', description_ar: 'يسمح بإدارة المحطات والفروع التابعة للشركة', category: 'admin' },
  { id: 'manage_roles', name_en: 'Manage Roles', name_ar: 'إدارة الأدوار والصلاحيات', description_en: 'Allows modifying roles and mapping custom permissions', description_ar: 'يسمح بتعديل الأدوار وربط الصلاحيات المخصصة لها', category: 'admin' },
  { id: 'manage_settings', name_en: 'Manage General Settings', name_ar: 'إدارة الإعدادات العامة', description_en: 'Allows changing system configurations', description_ar: 'يسمح بتعديل الإعدادات العامة للنظام', category: 'admin' },
  { id: 'manage_fleet', name_en: 'Manage Fleet & Vehicles', name_ar: 'إدارة الأسطول والمركبات', description_en: 'Allows managing fleet vehicles and drivers', description_ar: 'يسمح بإدارة أسطول المركبات والسائقين', category: 'fleet' },
  { id: 'create_trip', name_en: 'Create New Trip', name_ar: 'إنشاء مشوار جديد', description_en: 'Allows creating new trip requests', description_ar: 'يسمح بإنشاء طلبات مشاوير جديدة', category: 'fleet' },
  { id: 'approve_trip', name_en: 'Approve Trip', name_ar: 'اعتماد مشوار', description_en: 'Allows approving pending trip requests', description_ar: 'يسمح باعتماد طلبات المشاوير المعلقة', category: 'fleet' },
  { id: 'dispatch_trip', name_en: 'Dispatch / Execute Trip', name_ar: 'تحريك/تنفيذ مشوار', description_en: 'Allows dispatching and executing trips', description_ar: 'يسمح بتحريك وتنفيذ المشاوير', category: 'fleet' },
  { id: 'reassign_vehicle', name_en: 'Reassign Vehicle / Tasks', name_ar: 'إعادة إسناد مركبة متعطلة/مهام', description_en: 'Allows reassigning vehicles and tasks during breakdown', description_ar: 'يسمح بإعادة إسناد المركبات والمهام عند الأعطال', category: 'fleet' },
  { id: 'execute_breakdown_decision', name_en: 'Execute Breakdown Decision', name_ar: 'اتخاذ قرارات أعطال المركبات', description_en: 'Allows taking breakdown redistribution, postponement, or suspension decisions', description_ar: 'يسمح باتخاذ قرارات إعادة الإسناد والتأجيل والتعليق عند أعطال المركبات', category: 'fleet' },
  { id: 'create_emergency_trip', name_en: 'Create Emergency Trip', name_ar: 'إنشاء مشوار طارئ', description_en: 'Allows creating emergency dispatch trips directly', description_ar: 'يسمح بإنشاء مشاوير طارئة فورية', category: 'fleet' },
  { id: 'manage_vehicle_constraints', name_en: 'Manage Vehicle Access Constraints', name_ar: 'إدارة قيود وصول المركبات', description_en: 'Allows setting and managing vehicle location access constraints and geographical rules', description_ar: 'يسمح بإعداد وإدارة قيود وصول المركبات والمواقع المحظورة', category: 'fleet' },
  { id: 'execute_trip_tasks', name_en: 'Execute Field Trip Tasks', name_ar: 'تنفيذ مهام السائق الميدانية', description_en: 'Allows executing driver trip tasks in the field portal', description_ar: 'يسمح بتنفيذ مهام المشاوير الميدانية عبر بوابة السائق', category: 'fleet' }
];

export const DEFAULT_ROLES: SystemRole[] = [
  {
    id: 'SystemAdmin',
    name_en: 'System Administrator',
    name_ar: 'مدير النظام الشامل',
    permissions: {
      create_expense: true, edit_expense: true, delete_expense: true,
      create_voucher: true, approve_voucher: true, reject_voucher: true,
      create_custody: true, edit_custody: true, replace_custody: true,
      view_reports: true, manage_users: true, manage_companies: true,
      manage_regions: true, manage_stations: true, manage_roles: true,
      manage_settings: true, settle_voucher: true
    }
  },
  {
    id: 'Admin',
    name_en: 'Company Administrator',
    name_ar: 'مدير عهدة الشركة',
    permissions: {
      create_expense: true, edit_expense: true, delete_expense: true,
      create_voucher: true, approve_voucher: true, reject_voucher: true,
      create_custody: true, edit_custody: true, replace_custody: true,
      view_reports: true, manage_users: true, manage_companies: false,
      manage_regions: true, manage_stations: true, manage_roles: true,
      manage_settings: true, settle_voucher: true
    }
  },
  {
    id: 'RegionalManager',
    name_en: 'Regional Manager',
    name_ar: 'مدير منطقة / إقليم',
    permissions: {
      create_expense: false, edit_expense: false, delete_expense: false,
      create_voucher: false, approve_voucher: true, reject_voucher: true,
      create_custody: false, edit_custody: false, replace_custody: true,
      view_reports: true, manage_users: false, manage_companies: false,
      manage_regions: false, manage_stations: false, manage_roles: false,
      manage_settings: false, settle_voucher: false
    }
  },
  {
    id: 'StationAdmin',
    name_en: 'Station Cashier / Admin',
    name_ar: 'أمين عهدة المحطة',
    permissions: {
      create_expense: true, edit_expense: true, delete_expense: false,
      create_voucher: true, approve_voucher: false, reject_voucher: false,
      create_custody: false, edit_custody: false, replace_custody: false,
      view_reports: true, manage_users: false, manage_companies: false,
      manage_regions: false, manage_stations: false, manage_roles: false,
      manage_settings: false, settle_voucher: true
    }
  }
];
