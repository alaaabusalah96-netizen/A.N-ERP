/**
 * @file seedOnly.ts
 * @description Isolated Startup Seeding Module (Wave 7.5A & Section 5.4)
 * 
 * CRITICAL RULE (Section 5.4 & Phase 7.5A):
 * All legitimate startup/boot bootstrapping using the initial default tenant
 * is strictly isolated in this file and marked seedOnly.
 * Zero occurrences of 'tenant-main' are permitted anywhere outside this seed file.
 */

import { StoragePort, TenantCompany, ExpenseCategory, Account } from '../storage/StoragePort';

export const SEED_TENANT_ID = 'tenant-main';

export const SEED_COMPANY_PROFILE: TenantCompany = {
  id: SEED_TENANT_ID,
  code: 'MAIN',
  nameAr: 'شركة الأعمال الموحدة القابضة',
  nameEn: 'Unified Business Holding Co.',
  crNumber: '1010482910',
  taxNumber: '300128472900003',
  baseCurrency: 'ر.س',
  country: 'المملكة العربية السعودية',
  auditRetentionPolicyYears: 10,
  status: 'ACTIVE',
  backendConfig: {
    adapterType: 'postgresql',
    connectionRef: 'DATABASE_URL',
    isolationLevel: 'Shared',
  },
};

export const SEED_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  {
    id: 'cat-travel',
    tenantId: SEED_TENANT_ID,
    companyId: SEED_TENANT_ID,
    code: 'TRAVEL',
    nameAr: 'سفر وانتقالات',
    nameEn: 'Travel & Transportation',
    defaultAccountCode: '5010',
    requiresAttachment: true,
    attachmentThresholdAmount: 300,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-hosp',
    tenantId: SEED_TENANT_ID,
    companyId: SEED_TENANT_ID,
    code: 'HOSPITALITY',
    nameAr: 'ضيافة واستقبال وفود',
    nameEn: 'Hospitality & Entertainment',
    defaultAccountCode: '5020',
    requiresAttachment: true,
    attachmentThresholdAmount: 500,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-maint',
    tenantId: SEED_TENANT_ID,
    companyId: SEED_TENANT_ID,
    code: 'MAINTENANCE',
    nameAr: 'صيانة وتشغيل وتجهيزات',
    nameEn: 'Repairs & Maintenance',
    defaultAccountCode: '5030',
    requiresAttachment: true,
    attachmentThresholdAmount: 1000,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-office',
    tenantId: SEED_TENANT_ID,
    companyId: SEED_TENANT_ID,
    code: 'OFFICE_SUPPLIES',
    nameAr: 'أدوات ومستلزمات مكتبية',
    nameEn: 'Office Supplies',
    defaultAccountCode: '5040',
    requiresAttachment: true,
    attachmentThresholdAmount: 400,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-util',
    tenantId: SEED_TENANT_ID,
    companyId: SEED_TENANT_ID,
    code: 'COMMUNICATIONS',
    nameAr: 'اتصالات وبرمجيات وسحابة',
    nameEn: 'Telecommunications & Cloud',
    defaultAccountCode: '5050',
    requiresAttachment: true,
    attachmentThresholdAmount: 500,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export const SEED_CHART_OF_ACCOUNTS: Account[] = [
  { code: '1010', tenantId: SEED_TENANT_ID, nameAr: 'الصندوق الرئيسي', nameEn: 'Main Cash', type: 'ASSET', balance: 100000, isActive: true },
  { code: '1020', tenantId: SEED_TENANT_ID, nameAr: 'البنك الأهلي التجاري', nameEn: 'SNB Bank Account', type: 'ASSET', balance: 500000, isActive: true },
  { code: '1030', tenantId: SEED_TENANT_ID, nameAr: 'حساب العهد النقدية المؤقتة', nameEn: 'Cash Custody Advances', type: 'ASSET', balance: 0, isActive: true },
  { code: '1040', tenantId: SEED_TENANT_ID, nameAr: 'مخزون البضائع والمستودعات', nameEn: 'Inventory Asset', type: 'ASSET', balance: 250000, isActive: true },
  { code: '2010', tenantId: SEED_TENANT_ID, nameAr: 'الموردون والدائنون', nameEn: 'Accounts Payable', type: 'LIABILITY', balance: 0, isActive: true },
  { code: '2020', tenantId: SEED_TENANT_ID, nameAr: 'مستحقات ضريبة القيمة المضافة', nameEn: 'VAT Output Liability', type: 'LIABILITY', balance: 0, isActive: true },
  { code: '3010', tenantId: SEED_TENANT_ID, nameAr: 'رأس المال المدفوع', nameEn: 'Share Capital', type: 'EQUITY', balance: 850000, isActive: true },
  { code: '4010', tenantId: SEED_TENANT_ID, nameAr: 'إيرادات المبيعات والخدمات', nameEn: 'Sales Revenue', type: 'REVENUE', balance: 0, isActive: true },
  { code: '5010', tenantId: SEED_TENANT_ID, nameAr: 'مصروفات السفر والانتقالات', nameEn: 'Travel Expense', type: 'EXPENSE', balance: 0, isActive: true },
  { code: '5020', tenantId: SEED_TENANT_ID, nameAr: 'مصروفات الضيافة والاستقبال', nameEn: 'Hospitality Expense', type: 'EXPENSE', balance: 0, isActive: true },
  { code: '5030', tenantId: SEED_TENANT_ID, nameAr: 'مصروفات الصيانة والتشغيل', nameEn: 'Maintenance Expense', type: 'EXPENSE', balance: 0, isActive: true },
  { code: '5040', tenantId: SEED_TENANT_ID, nameAr: 'مصروفات الأدوات المكتبية', nameEn: 'Office Supplies Expense', type: 'EXPENSE', balance: 0, isActive: true },
  { code: '5050', tenantId: SEED_TENANT_ID, nameAr: 'مصروفات الاتصالات والتقنية', nameEn: 'Telecom & Cloud Expense', type: 'EXPENSE', balance: 0, isActive: true },
  { code: '5090', tenantId: SEED_TENANT_ID, nameAr: 'مصروفات عمومية وإدارية أخرى', nameEn: 'General & Admin Expense', type: 'EXPENSE', balance: 0, isActive: true },
];

/**
 * seedOnlyInitialBootstrap:
 * Invoked STRICTLY ONCE during server startup before any HTTP requests are served.
 */
export async function seedOnlyInitialBootstrap(storage: StoragePort): Promise<void> {
  const tenantId = SEED_TENANT_ID;

  // 1. Save company profile
  await storage.saveTenant(SEED_COMPANY_PROFILE, 'seed-company-init');

  // 2. Seed chart of accounts
  for (const acc of SEED_CHART_OF_ACCOUNTS) {
    await storage.saveAccount(tenantId, acc, `seed-acc-${acc.code}`);
  }

  // 3. Seed expense categories
  for (const cat of SEED_EXPENSE_CATEGORIES) {
    await storage.saveExpenseCategory(tenantId, cat, `seed-cat-${cat.code}`);
  }
}
