export type UserRole = 'SystemAdmin' | 'Admin' | 'RegionalManager' | 'StationAdmin';

export interface Company {
  id: string;
  name: string;
  code?: string;
  custody_value?: number;
  is_active?: boolean;
  subscription_status?: 'active' | 'suspended' | 'trial' | 'expired';
  subscription_expiry?: string;
  subscription_plan?: 'Basic' | 'Professional' | 'Enterprise';
  industry?: 'poultry' | 'restaurant' | 'general' | string;
  tenantId?: string;
  organizationId?: string;
  org_unit_id?: string;
  modules?: Record<string, any>;
  group_id?: string;
  status_merge?: 'ACTIVE' | 'MERGED';
  merged_into_company_id?: string;
  use_custom_template?: boolean;
  currency?: string;
  max_accounts_allowed?: number;
  /** A.N merge: storage adapter for this company */
  db_backend?: 'postgresql' | 'mysql' | 'mongodb' | 'firebase' | 'inmemory';
  /** A.N merge: auth driver for this company */
  auth_driver?: 'firebase' | 'an-jwt';
  /** A.N merge: isolation level for this company */
  isolation_level?: 'Shared' | 'Dedicated';
  /** A.N merge: connection reference for this company (env var name only) */
  connection_ref?: string;
}

export interface UserPermissions {
  create_expense?: boolean;
  edit_expense?: boolean;
  delete_expense?: boolean;
  create_voucher?: boolean;
  approve_voucher?: boolean;
  reject_voucher?: boolean;
  create_custody?: boolean;
  edit_custody?: boolean;
  replace_custody?: boolean;
  view_reports?: boolean;
  manage_users?: boolean;
  manage_companies?: boolean;
  manage_regions?: boolean;
  manage_stations?: boolean;
  manage_roles?: boolean;
  manage_settings?: boolean;
  // Backward compatibility
  settle_voucher?: boolean;
  manage_fleet?: boolean;
  create_trip?: boolean;
  approve_trip?: boolean;
  dispatch_trip?: boolean;
  reassign_vehicle?: boolean;
  execute_breakdown_decision?: boolean;
  create_emergency_trip?: boolean;
  manage_vehicle_constraints?: boolean;
  execute_trip_tasks?: boolean;
}

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  name?: string;
  role: UserRole;
  userRoles?: string[];
  assigned_roles?: string[];
  permissions: UserPermissions;
  station_id?: string;
  region_id?: string;
  company_id?: string;
  is_active?: boolean;
  is_platform_owner?: boolean;
  must_change_password?: boolean;
  password?: string;
  salt?: string;
  security_pin?: string;
  impersonator?: AppUser;
  tenantId?: string;
  organizationId?: string;
  org_unit_id?: string;
  assigned_org_unit_ids?: string[];
}

export interface Region {
  id: string;
  name: string;
  region_name?: string;
  code?: string;
  company_id?: string;
  org_unit_id?: string;
  tenantId?: string;
  organizationId?: string;
}

export interface Station {
  id: string;
  region_id?: string;
  station_name: string;
  station_code: string;
  custody_amount: number;
  is_active: boolean;
  company_id?: string;
  org_unit_id?: string;
  tenantId?: string;
  organizationId?: string;
}

export interface ExpenseCategory {
  id: string;
  name_en: string;
  name_ar: string;
}

export type TransactionStatus = 'Draft' | 'Pending' | 'Under Settlement' | 'Settled' | 'Rejected' | 'Deleted';

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string; // Stored as base64 or temporary object URL
  uploaded_at: string;
}

export interface TransactionItem {
  description: string;
  amount: number;
}

export interface Transaction {
  id: string;
  transaction_no: string;
  date: string;
  description: string;
  category_id?: string;
  category?: string;
  cost_center_id?: string;
  amount: number;
  items?: TransactionItem[];
  amount_in_words?: {
    ar: string;
    en: string;
  };
  notes?: string;
  status: TransactionStatus;
  voucher_no?: string;
  voucher_date?: string;
  invoice_no?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  station_id?: string; // Every transaction belongs to ONE station
  company_id?: string;
  org_unit_id?: string;
  attachments?: Attachment[];
  tenantId?: string;
  organizationId?: string;
  metadata?: {
    version: number;
  };
}

export interface ActivityLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  details: string;
  timestamp: string;
  station_id?: string;
  company_id?: string;
  amount?: number;
  notes?: string;
  tenantId?: string;
  organizationId?: string;
}

export interface CustodyConfig {
  company_name: string;
  custody_value: number;
  use_custom_template?: boolean;
  custom_template_image?: string;
}

export type Language = 'en' | 'ar';
export type Theme = 'light' | 'dark';

// Translation dictionaries
export const translations = {
  en: {
    title: 'KEMIT ERP',
    dashboard: 'Dashboard',
    newExpense: 'New Expense',
    pendingTransactions: 'Pending Transactions',
    cashPaymentVoucher: 'Cash Payment Voucher',
    underSettlement: 'Under Settlement',
    cashReconciliation: 'Cash Reconciliation',
    reports: 'Reports',
    search: 'Advanced Search',
    settings: 'Settings',
    logout: 'Logout',
    
    // Dashboard metric cards
    custodyValue: 'Custody Value',
    cashAvailable: 'Cash Available',
    pendingTotal: 'Pending Total',
    underSettlementTotal: 'Under Settlement Total',
    pendingCount: 'Pending Count',
    underSettlementCount: 'Settled Count',
    latestTransactions: 'Latest Activity',
    recentLogs: 'Recent Audit Logs',
    
    // Status
    statusDraft: 'Draft',
    statusPending: 'Pending',
    statusSettled: 'Under Settlement',
    statusFullySettled: 'Fully Settled (Approved)',
    status: 'Status',
    
    // Form fields
    date: 'Date',
    description: 'Description',
    amount: 'Amount (EGP)',
    category: 'Category',
    notes: 'Notes',
    voucherNo: 'Voucher Number',
    voucherDate: 'Voucher Date',
    transactionNo: 'Transaction No',
    actions: 'Actions',
    
    // Validation
    required: 'This field is required',
    positiveNumber: 'Amount must be a positive number',
    successCreated: 'Expense created successfully!',
    successSettled: 'Voucher registered. Transaction is now Under Settlement.',
    successDeleted: 'Transaction deleted successfully.',
    successUpdated: 'Transaction updated successfully.',
    successSettings: 'Settings updated successfully.',
    confirmDelete: 'Are you sure you want to delete this transaction?',
    confirmSettle: 'Are you sure you want to settle this transaction?',
    
    // Reports
    generateReport: 'Generate Report',
    reportType: 'Report Type',
    pendingReport: 'Pending Report',
    settledReport: 'Under Settlement Report',
    dailyReport: 'Daily Report',
    monthlyReport: 'Monthly Report',
    cashMovementReport: 'Cash Movement Report',
    exportExcel: 'Export Excel',
    exportPDF: 'Export PDF',
    print: 'Print',
    noData: 'No transactions found for this query',
    
    // Search
    searchPlaceholder: 'Search description, voucher #, transaction #, category...',
    instantSearch: 'Instant Search',
    filters: 'Filters',
    clearFilters: 'Clear Filters',
    
    // Settings
    companySettings: 'Company Settings',
    companyName: 'Company Name',
    custodyAmount: 'Custody Amount (EGP)',
    categoriesList: 'Expense Categories',
    addCategory: 'Add Category',
    catNameEn: 'Category Name (EN)',
    catNameAr: 'Category Name (AR)',
    userManagement: 'User Management',
    role: 'Role',
    permissions: 'Permissions',
    saveChanges: 'Save Changes',
    
    // Language & styling
    langSwitch: 'العربية',
    rtl: 'LTR',
    login: 'Login',
    email: 'Email',
    password: 'Password',
    loginTitle: 'Secure Portal Login',
    loginSubtitle: 'KEMIT ERP Module',
    adminLabel: 'Admin Account',
    regularLabel: 'Regular User Account',
    mockAuthTip: 'Select a pre-configured account below to log in immediately:',
    accessDenied: 'Access Denied: You do not have permissions to view this screen.',
    allRightsReserved: 'All rights reserved.',
    regionalDashboard: 'Regional Dashboard',
    stations: 'Stations',
    totalStations: 'Total Stations',
    totalCustody: 'Total Custody',
    totalPending: 'Total Pending',
    totalUnderSettlement: 'Total Under Settlement',
    totalCashAvailable: 'Total Cash Available',
    numPendingTransactions: 'Pending Transactions Count',
    numSettledTransactions: 'Settled Transactions Count',
    latestTransactionsRegion: 'Latest Transactions Across Region',
    stationName: 'Station Name',
    stationCode: 'Station Code',
    is_active: 'Status',
    lastActivity: 'Last Activity',
    viewDashboard: 'View Dashboard',
    regionalReports: 'Regional Reports',
    regionalSearch: 'Regional Search',
    station: 'Station',
    allStations: 'All Stations',
    region: 'Region',
    dateRange: 'Date Range',
    minAmount: 'Min Amount',
    maxAmount: 'Max Amount',
    roleSystemAdmin: 'Platform Admin',
    roleAdmin: 'Company Admin',
    roleRegionalManager: 'Regional Manager',
    roleStationAdmin: 'Station Manager',
    stationDetails: 'Station Details',
    timelineOfActivities: 'Timeline of Activities',
    singleStation: 'Single Station',
    multipleStations: 'Multiple Stations',
    entireRegion: 'Entire Region',
    generateRegionalReport: 'Generate Regional Report',
    stationsList: 'Stations List',
    active: 'Active',
    inactive: 'Inactive'
  },
  ar: {
    title: 'نظام KEMIT ERP',
    dashboard: 'لوحة التحكم',
    newExpense: 'تسجيل مصروف جديد',
    pendingTransactions: 'المعاملات المعلقة',
    cashPaymentVoucher: 'سند صرف نقدية',
    underSettlement: 'تحت التسوية',
    cashReconciliation: 'مطابقة العهدة',
    reports: 'التقارير المالية',
    search: 'البحث المتقدم',
    settings: 'الإعدادات العامة',
    logout: 'تسجيل الخروج',
    
    // Dashboard metric cards
    custodyValue: 'قيمة العهدة',
    cashAvailable: 'النقدية المتاحة',
    pendingTotal: 'إجمالي المعلق',
    underSettlementTotal: 'إجمالي تحت التسوية',
    pendingCount: 'عدد المعلق',
    underSettlementCount: 'عدد تحت التسوية',
    latestTransactions: 'آخر العمليات',
    recentLogs: 'سجل التدقيق والمراجعة',
    
    // Status
    statusDraft: 'مسودة',
    statusPending: 'معلقة',
    statusSettled: 'تحت التسوية',
    statusFullySettled: 'معتمدة ومسواة نهائياً',
    status: 'الحالة',
    
    // Form fields
    date: 'التاريخ',
    description: 'البيان / الوصف',
    amount: 'المبلغ (جنيه)',
    category: 'التصنيف',
    notes: 'ملاحظات',
    voucherNo: 'رقم مستند الصرف',
    voucherDate: 'تاريخ مستند الصرف',
    transactionNo: 'رقم الحركة',
    actions: 'الإجراءات',
    
    // Validation
    required: 'هذا الحقل مطلوب',
    positiveNumber: 'يجب أن يكون المبلغ رقماً موجباً',
    successCreated: 'تم تسجيل المصروف المعلق بنجاح!',
    successSettled: 'تم تسجيل السند بنجاح وتحويل الحركة إلى تحت التسوية.',
    successDeleted: 'تم حذف الحركة بنجاح.',
    successUpdated: 'تم تعديل الحركة بنجاح.',
    successSettings: 'تم حفظ الإعدادات بنجاح.',
    confirmDelete: 'هل أنت متأكد من رغبتك في حذف هذه الحركة؟',
    confirmSettle: 'هل أنت متأكد من رغبتك في تسوية هذه الحركة؟',
    
    // Reports
    generateReport: 'عرض التقرير',
    reportType: 'نوع التقرير',
    pendingReport: 'تقرير المصاريف المعلقة',
    settledReport: 'تقرير المصاريف تحت التسوية',
    dailyReport: 'التقرير اليومي',
    monthlyReport: 'التقرير الشهري',
    cashMovementReport: 'تقرير حركة النقدية التفصيلي',
    exportExcel: 'تصدير إكسل',
    exportPDF: 'تصدير PDF',
    print: 'طباعة التقرير',
    noData: 'لا توجد حركات مطابقة لهذا التصفية',
    
    // Search
    searchPlaceholder: 'ابحث بالبيان، رقم السند، رقم الحركة، التصنيف...',
    instantSearch: 'بحث فوري',
    filters: 'مرشحات إضافية',
    clearFilters: 'إعادة تعيين الفلاتر',
    
    // Settings
    companySettings: 'إعدادات الشركة والعهدة',
    companyName: 'اسم الشركة',
    custodyAmount: 'قيمة عهدة النقدية (جنيه)',
    categoriesList: 'تصنيفات المصروفات المعتمدة',
    addCategory: 'إضافة تصنيف جديد',
    catNameEn: 'اسم التصنيف (إنجليزي)',
    catNameAr: 'اسم التصنيف (عربي)',
    userManagement: 'إدارة المستخدمين والصلاحيات',
    role: 'الدور / الصلاحية',
    permissions: 'الصلاحيات الممنوحة',
    saveChanges: 'حفظ التعديلات',
    
    // Language & styling
    langSwitch: 'English',
    rtl: 'RTL',
    login: 'تسجيل الدخول',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    loginTitle: 'بوابة تسجيل الدخول الآمن',
    loginSubtitle: 'وحدة نظام KEMIT ERP',
    adminLabel: 'حساب مدير النظام (كامل الصلاحيات)',
    regularLabel: 'حساب مستخدم عادي (محدود)',
    mockAuthTip: 'اختر أحد الحسابات المهيأة مسبقاً للولوج فوراً إلى النظام:',
    accessDenied: 'عذراً، لا تمتلك الصلاحيات الكافية للوصول إلى هذه الشاشة.',
    allRightsReserved: 'جميع الحقوق محفوظة.',
    regionalDashboard: 'لوحة التحكم الإقليمية',
    stations: 'المحطات',
    totalStations: 'إجمالي المحطات',
    totalCustody: 'إجمالي قيمة العهد',
    totalPending: 'إجمالي المصاريف المعلقة',
    totalUnderSettlement: 'إجمالي تحت التسوية الإقليمي',
    totalCashAvailable: 'إجمالي النقدية المتاحة إقليمياً',
    numPendingTransactions: 'عدد المعلق للإقليم',
    numSettledTransactions: 'عدد تحت التسوية للإقليم',
    latestTransactionsRegion: 'آخر العمليات عبر المحطات والإقليم',
    stationName: 'اسم المحطة',
    stationCode: 'كود المحطة',
    is_active: 'الحالة',
    lastActivity: 'آخر حركة نشطة',
    viewDashboard: 'عرض لوحة التحكم',
    regionalReports: 'التقارير الإقليمية الشاملة',
    regionalSearch: 'البحث الإقليمي الشامل',
    station: 'المحطة',
    allStations: 'جميع المحطات',
    region: 'الإقليم',
    dateRange: 'النطاق الزمني',
    minAmount: 'الحد الأدنى للمبلغ',
    maxAmount: 'الحد الأقصى للمبلغ',
    roleSystemAdmin: 'أدمن منصة',
    roleAdmin: 'ادمن الشركة',
    roleRegionalManager: 'مدير منطقة',
    roleStationAdmin: 'مدير محطة (أمين عهدة)',
    stationDetails: 'تفاصيل المحطة وعرض المستندات',
    timelineOfActivities: 'سجل الأنشطة والتدقيق الزمني',
    singleStation: 'محطة فردية',
    multipleStations: 'محطات متعددة',
    entireRegion: 'الإقليم بالكامل',
    generateRegionalReport: 'توليد التقرير الإقليمي المدمج',
    stationsList: 'قائمة المحطات النشطة',
    active: 'نشط',
    inactive: 'غير نشط'
  }
};

// Sprint 2 - New Database Collections Interfaces
export interface Expense {
  id: string;
  station_id: string;
  company_id: string;
  category_id: string;
  amount: number;
  description: string;
  date: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Settled';
  created_by: string;
  created_at: string;
  updated_at: string;
  receipt_url?: string;
  invoice_no?: string;
  tenantId?: string;
  organizationId?: string;
}

export interface CashVoucher {
  id: string;
  voucher_no: string;
  date: string;
  station_id: string;
  company_id: string;
  amount: number;
  total_amount?: number;
  notes?: string;
  amount_in_words: {
    ar: string;
    en: string;
  };
  recipient_name: string;
  received_by?: string;
  approved_by?: string;
  status: 'Draft' | 'Pending_Approval' | 'Approved' | 'Rejected' | 'Settled';
  expense_ids: string[];
  created_at: string;
  updated_at: string;
  tenantId?: string;
  organizationId?: string;
}

export interface TransactionHistory {
  id: string;
  transaction_id: string;
  action: string;
  performed_by: string;
  performed_by_name: string;
  timestamp: string;
  previous_status?: string;
  new_status?: string;
  notes?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title_ar: string;
  title_en: string;
  message_ar: string;
  message_en: string;
  is_read: boolean;
  type: 'info' | 'warning' | 'success' | 'error';
  related_id?: string;
  created_at: string;
  tenantId?: string;
  organizationId?: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  ip_address?: string;
  device?: string;
  action_type: string;
  description: string;
  timestamp: string;
  details?: Record<string, any>;
  tenantId?: string;
  organizationId?: string;
  company_id?: string;
  impersonator_id?: string;
  impersonator_name?: string;
  target_user_id?: string;
  target_user_name?: string;
  is_impersonation?: boolean;
}

export interface SystemPermission {
  id: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  category: 'expenses' | 'vouchers' | 'custody' | 'admin' | 'reports' | 'fleet';
}

export interface SystemRole {
  id: string;
  name_en: string;
  name_ar: string;
  permissions: Record<string, boolean>;
  created_at?: string;
  updated_at?: string;
}

export interface DeletedTransaction {
  id: string;
  transaction_id: string;
  transaction_no: string;
  transaction_data: Transaction;
  transaction_type: string; // "Expense" or "CashVoucher" or generic "Transaction"
  amount: number;
  created_by_name: string; // Original creator
  deleted_by_name: string;
  deleted_by_role: string;
  deleted_at: string;
  delete_reason: string;
  station_name: string;
  region_name: string;
  branch?: string; // For additional matching
  company_id: string;
  description?: string;
  original_status?: string;
  tenantId?: string;
  organizationId?: string;
}

export interface SignupRequest {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  company_id: string;
  region_id?: string;
  station_id?: string;
  org_unit_id?: string;
  password?: string;
  created_at: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  rejection_reason?: string;
  tenantId?: string;
  organizationId?: string;
}

export interface AccountCorrectionRequest {
  id: string;
  targetEmail: string;
  targetUserId: string;
  targetUserName: string;
  targetRole: UserRole;
  company_id: string;
  region_id?: string;
  station_id?: string;
  org_unit_id?: string;
  correctionType: 'password_reset' | 'email_change' | 'username_change' | 'other';
  reason: string;
  created_at: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  rejection_reason?: string;
  approved_at?: string;
  approved_by?: string;
  tenantId?: string;
  organizationId?: string;
}

export type CustodyMovementType = 
  | 'replenish' 
  | 'reverse_replenish' 
  | 'count_adjust' 
  | 'consume' 
  | 'rollback_consume' 
  | 'opening_balance' 
  | 'transfer_in' 
  | 'transfer_out' 
  | string;

export interface CustodyMovement {
  id: string;
  station_id: string;
  company_id: string;
  region_id?: string;
  type: CustodyMovementType;
  amount: number;
  at: string;
  actor_id: string;
  actor_name?: string;
  ref?: string;
  notes?: string;
  balance_after?: number;
  metadata?: Record<string, any>;
}

export interface CustodyBalances {
  nominal: number;
  deducted: number;
  available: number;
}

export interface PeriodReportFilter {
  from: Date | string;
  to: Date | string;
  companyId?: string;
  regionId?: string;
  stationId?: string;
  type?: CustodyMovementType | 'all';
}

export interface CustodyPeriodReport {
  from: string;
  to: string;
  opening: number;
  total_in: number;
  total_out: number;
  closing: number;
  movements: CustodyMovement[];
}

export * from './types/enterprise';
export * from './types/organization';




