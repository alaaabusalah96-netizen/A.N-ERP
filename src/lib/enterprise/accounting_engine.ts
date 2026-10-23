import { Firestore } from 'firebase/firestore';
import { EventEnvelope } from '../../types/enterprise';
import { BusinessEngineContract, EngineExecutionResult } from './warehouse_contracts';
import { SequenceEngine } from './sequence';
import { AuditLogEngine } from './audit';
import { createBaseMetadata, updateBaseMetadata } from './metadata';
import { GLAccount, JournalEntry, LedgerLine, AccountType, AccountingDimensions, JournalEntryFilterOptions, CoaTemplateId, CoaTemplateMetadata } from '../../types/accounting';
import { StorageEngine } from '../../db/storage';
import { db } from '../../firebase';
import { syncWriteWithOfflineFallback } from '../../db/offlineQueue';
import { WarehouseHierarchyEngine } from '../../db/warehouseHierarchyEngine';
import { CostCenterEngine } from '../../db/costCenterEngine';

/**
 * Enterprise Accounting & Double-Entry Ledger Engine
 * محرك الحسابات المزدوجة ودفتر القيود الموحد للمؤسسات
 * 
 * Manages standard Chart of Accounts (COA) and ensures robust, balanced Journal Entries.
 * Employs SequenceEngine and AuditLogEngine to track all ledger activities.
 */
export class AccountingBusinessEngine implements BusinessEngineContract {
  engineId = 'accounting_business_engine';
  supportedEvents = [
    'JOURNAL_ENTRY_POSTED',
    'CHART_OF_ACCOUNTS_INITIALIZED'
  ];

  private auditEngine = new AuditLogEngine();

  // Available COA Templates Metadata
  static COA_TEMPLATES_METADATA: CoaTemplateMetadata[] = [
    {
      id: 'standard',
      nameAr: 'الدليل القياسي العام (General / Standard)',
      nameEn: 'General Standard Template',
      descriptionAr: 'دليل حسابات تجاري وإداري متكامل مناسب للخدمات والأنشطة العامة والمقاولات',
      descriptionEn: 'Comprehensive commercial & administrative chart suitable for general business & services',
      industry: 'general'
    },
    {
      id: 'poultry',
      nameAr: 'دليل قطاع الإنتاج الداجني والزراعي (Poultry & Agriculture)',
      nameEn: 'Poultry & Agriculture Template',
      descriptionAr: 'مهيأ بمخزون العلف، قطعان الأمهات واللاحم، مصروفات التحصينات والبيطرة، ومجازر الدواجن',
      descriptionEn: 'Tailored with feed stock, flock assets, veterinary vaccination expenses, and processing accounts',
      industry: 'poultry'
    },
    {
      id: 'retail',
      nameAr: 'دليل قطاع التجزئة والسوبر ماركت (Retail Supermarkets)',
      nameEn: 'Retail Supermarkets Template',
      descriptionAr: 'مهيأ بحسابات نقاط البيع (POS)، مخزون بضاعة التجزئة، خصومات المبيعات، ومصروفات الفروع',
      descriptionEn: 'Configured for POS settlement, retail merchandise inventory, sales allowances, and store expenses',
      industry: 'retail'
    },
    {
      id: 'manufacturing',
      nameAr: 'دليل قطاع التصنيع والإنتاج الصناعي (Manufacturing & Industry)',
      nameEn: 'Manufacturing & Industrial Template',
      descriptionAr: 'مهيأ بمخزون المواد الخام، الإنتاج تحت التشغيل، تكلفة التصنيع المباشرة ومصروفات المصانع',
      descriptionEn: 'Configured for raw materials, work in progress (WIP), direct manufacturing, and factory overheads',
      industry: 'manufacturing'
    },
    {
      id: 'transport',
      nameAr: 'دليل قطاع النقل والخدمات اللوجستية (Logistics & Fleet)',
      nameEn: 'Logistics & Fleet Transport Template',
      descriptionAr: 'مهيأ بحسابات أسطول الشاحنات، مصروفات الوقود والزيوت، الكارتات والرسوم، وصيانة المركبات',
      descriptionEn: 'Configured for vehicle assets, fuel/lubricants, road tolls, and fleet maintenance expenses',
      industry: 'transport'
    }
  ];

  // Standard accounts template for initialization (General / Commercial)
  static STANDARD_COA_TEMPLATE: Omit<GLAccount, 'id' | 'company_id' | 'createdAt'>[] = [
    // Assets (1)
    { code: '110101', nameAr: 'صندوق الخزينة الرئيسي (Cash in Hand)', nameEn: 'Cash in Hand (Main Box)', type: 'ASSET', balance: 50000, status: 'ACTIVE' },
    { code: '110201', nameAr: 'حساب بنك الشركة الجاري (Corporate Bank Account)', nameEn: 'Corporate Checking Account', type: 'ASSET', balance: 250000, status: 'ACTIVE' },
    { code: '110301', nameAr: 'حسابات العملاء والمدينين (Accounts Receivable)', nameEn: 'Accounts Receivable (Customers)', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '120101', nameAr: 'مخزون مستودع قطع الغيار والوقود (Inventory)', nameEn: 'Warehouse Parts & Fuel Inventory', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '130101', nameAr: 'الأصول الثابتة (Fixed Assets)', nameEn: 'Fixed Assets', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '130201', nameAr: 'مجمع إهلاك الأصول الثابتة (Accumulated Depreciation)', nameEn: 'Accumulated Depreciation', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    // Liabilities (2)
    { code: '210101', nameAr: 'حسابات الموردين والدائنين (Accounts Payable)', nameEn: 'Accounts Payable (Vendors)', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210201', nameAr: 'مستحقات ضريبة القيمة المضافة (VAT Payable)', nameEn: 'VAT Payable (State Tax)', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210301', nameAr: 'ضريبة الخصم والتحصيل تحت حساب الضريبة (Withholding Tax Payable)', nameEn: 'Withholding Tax Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210401', nameAr: 'مستحقات الهيئة القومية للتأمين الاجتماعي (Social Insurance Payable)', nameEn: 'Social Insurance Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210501', nameAr: 'ضريبة كسب العمل المستحقة (Payroll Tax Payable)', nameEn: 'Payroll Taxes Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    // Equity (3)
    { code: '310101', nameAr: 'رأس مال الشركة المدفوع (Share Capital)', nameEn: 'Corporate Paid-in Capital', type: 'EQUITY', balance: 300000, status: 'ACTIVE' },
    // Revenue (4)
    { code: '410101', nameAr: 'إيرادات مبيعات الوقود والخدمات (Sales Revenue)', nameEn: 'Sales & Services Revenue', type: 'REVENUE', balance: 0, status: 'ACTIVE' },
    // Expenses (5)
    { code: '510101', nameAr: 'مصروفات المحطات والمواقع التشغيلية (Site Expenses)', nameEn: 'Site Operational Expenses', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510201', nameAr: 'مصروفات وقود الديزل والبنزين (Fuel Expenses)', nameEn: 'Diesel & Fuel Expenses', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510301', nameAr: 'مصروفات الصيانة الفنية وقطع الغيار (Maintenance)', nameEn: 'Maintenance & Repairs Expenses', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510401', nameAr: 'مصروفات عمومية وإدارية (G&A Expenses)', nameEn: 'General & Administrative Expenses', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510501', nameAr: 'مصروف إهلاك الأصول الثابتة (Depreciation Expense)', nameEn: 'Depreciation Expense', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510601', nameAr: 'مصروف رواتب وأجور الموظفين (Salaries & Wages Expense)', nameEn: 'Salaries & Wages Expense', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510701', nameAr: 'مصروف حصة الشركة في التأمينات (Employer Social Insurance Expense)', nameEn: 'Employer Social Insurance Expense', type: 'EXPENSE', balance: 0, status: 'ACTIVE' }
  ];

  // Industry Template: Poultry & Agricultural Production (قطاع الدواجن والإنتاج الزراعي)
  static POULTRY_COA_TEMPLATE: Omit<GLAccount, 'id' | 'company_id' | 'createdAt'>[] = [
    // Assets (1)
    { code: '110101', nameAr: 'صندوق الخزينة الرئيسي (Cash in Hand)', nameEn: 'Cash in Hand (Main Box)', type: 'ASSET', balance: 50000, status: 'ACTIVE' },
    { code: '110201', nameAr: 'حساب بنك الشركة الجاري (Corporate Bank Account)', nameEn: 'Corporate Checking Account', type: 'ASSET', balance: 250000, status: 'ACTIVE' },
    { code: '110301', nameAr: 'حسابات العملاء وموزعي الدواجن (Accounts Receivable)', nameEn: 'Accounts Receivable (Poultry Distributors)', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '120101', nameAr: 'مخزون الأعلاف ومكونات التغذية (Feed Stock Inventory)', nameEn: 'Poultry Feed & Raw Feed Inventory', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '120201', nameAr: 'مخزون الأدوية واللقاحات البيطرية (Veterinary Supplies)', nameEn: 'Veterinary Medicines & Vaccines Stock', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '120301', nameAr: 'أصول حيوية - قطعان الدواجن والتربية (Biological Assets - Flocks)', nameEn: 'Biological Assets (Live Broiler & Breeder Flocks)', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '130101', nameAr: 'الأصول الثابتة - عنابر ومعدات المزارع (Farm Fixed Assets)', nameEn: 'Farm Buildings & Poultry Equipment', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '130201', nameAr: 'مجمع إهلاك أصول المزارع (Accumulated Depreciation - Farms)', nameEn: 'Accumulated Depreciation - Farms', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    // Liabilities (2)
    { code: '210101', nameAr: 'حسابات موردي الأعلاف والكتاكيت (Accounts Payable)', nameEn: 'Accounts Payable (Feed & Hatchery Suppliers)', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210201', nameAr: 'مستحقات ضريبة القيمة المضافة (VAT Payable)', nameEn: 'VAT Payable (State Tax)', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210301', nameAr: 'ضريبة الخصم والتحصيل تحت حساب الضريبة (Withholding Tax Payable)', nameEn: 'Withholding Tax Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210401', nameAr: 'مستحقات التأمينات الاجتماعية (Social Insurance Payable)', nameEn: 'Social Insurance Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210501', nameAr: 'ضريبة كسب العمل المستحقة (Payroll Tax Payable)', nameEn: 'Payroll Taxes Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    // Equity (3)
    { code: '310101', nameAr: 'رأس مال الشركة المدفوع (Share Capital)', nameEn: 'Corporate Paid-in Capital', type: 'EQUITY', balance: 300000, status: 'ACTIVE' },
    // Revenue (4)
    { code: '410101', nameAr: 'إيرادات مبيعات الدواجن الحية والمصنعة (Poultry Sales)', nameEn: 'Live Birds & Processed Poultry Sales Revenue', type: 'REVENUE', balance: 0, status: 'ACTIVE' },
    { code: '410201', nameAr: 'إيرادات مبيعات السماد العضوي ومخلفات المزارع (Organic Fertilizer Sales)', nameEn: 'Organic Fertilizer & By-products Sales', type: 'REVENUE', balance: 0, status: 'ACTIVE' },
    // Expenses (5)
    { code: '510101', nameAr: 'تكلفة استهلاك الأعلاف المباشرة (Feed Consumption Cost)', nameEn: 'Direct Poultry Feed Cost', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510201', nameAr: 'مصروفات التحصين والرعاية البيطرية (Veterinary Expenses)', nameEn: 'Veterinary & Vaccination Expenses', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510301', nameAr: 'مصروفات التدفئة والطاقة للعنابر (Farm Energy & Heating)', nameEn: 'Farm Heating & Energy Expenses', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510401', nameAr: 'مصروفات الصيانة الفنية لمعدات المزارع (Farm Equipment Maintenance)', nameEn: 'Farm Maintenance & Repairs', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510501', nameAr: 'مصروفات عمومية وإدارية (G&A Expenses)', nameEn: 'General & Administrative Expenses', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510601', nameAr: 'مصروف رواتب وأجور عمال المزارع (Farm Labor & Staff Salaries)', nameEn: 'Farm Staff & Labor Salaries Expense', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510701', nameAr: 'مصروف حصة الشركة في التأمينات (Employer Social Insurance Expense)', nameEn: 'Employer Social Insurance Expense', type: 'EXPENSE', balance: 0, status: 'ACTIVE' }
  ];

  // Industry Template: Retail Supermarkets & Stores (قطاع تجارة التجزئة والسوبر ماركت)
  static RETAIL_COA_TEMPLATE: Omit<GLAccount, 'id' | 'company_id' | 'createdAt'>[] = [
    // Assets (1)
    { code: '110101', nameAr: 'صندوق الخزينة الرئيسي ونقاط البيع (Cash & POS Registers)', nameEn: 'Main Cash & POS Register Tills', type: 'ASSET', balance: 50000, status: 'ACTIVE' },
    { code: '110201', nameAr: 'حساب بنك الشركة الجاري وحساب التسويات (Bank & POS Clearing)', nameEn: 'Corporate Bank & Card Settlement Account', type: 'ASSET', balance: 250000, status: 'ACTIVE' },
    { code: '110301', nameAr: 'حسابات عملاء الشركات والآجل (Accounts Receivable - Corporate)', nameEn: 'Accounts Receivable (Credit & Corporate)', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '120101', nameAr: 'مخزون بضاعة التجزئة بالأرفف والمستودع (Merchandise Inventory)', nameEn: 'Retail Merchandise & Store Inventory', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '130101', nameAr: 'الأصول الثابتة - ثلاجات وتجهيزات الفروع (Store Equipment & Fixtures)', nameEn: 'Refrigeration, Fixtures & Store Equipment', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '130201', nameAr: 'مجمع إهلاك تجهيزات الفروع (Accumulated Depreciation - Store Equipment)', nameEn: 'Accumulated Depreciation - Fixtures', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    // Liabilities (2)
    { code: '210101', nameAr: 'حسابات موردي السلع الاستهلاكية (Accounts Payable - FMCG Vendors)', nameEn: 'Accounts Payable (Merchandise Vendors)', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210201', nameAr: 'مستحقات ضريبة القيمة المضافة (VAT Payable)', nameEn: 'VAT Payable (State Tax)', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210301', nameAr: 'ضريبة الخصم والتحصيل تحت حساب الضريبة (Withholding Tax Payable)', nameEn: 'Withholding Tax Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210401', nameAr: 'مستحقات التأمينات الاجتماعية (Social Insurance Payable)', nameEn: 'Social Insurance Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210501', nameAr: 'ضريبة كسب العمل المستحقة (Payroll Tax Payable)', nameEn: 'Payroll Taxes Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    // Equity (3)
    { code: '310101', nameAr: 'رأس مال الشركة المدفوع (Share Capital)', nameEn: 'Corporate Paid-in Capital', type: 'EQUITY', balance: 300000, status: 'ACTIVE' },
    // Revenue (4)
    { code: '410101', nameAr: 'إيرادات مبيعات التجزئة بالفروع (Retail Store Sales Revenue)', nameEn: 'Retail Store Sales Revenue', type: 'REVENUE', balance: 0, status: 'ACTIVE' },
    { code: '410201', nameAr: 'إيرادات مساحات العرض وتأجير الأرفف (Shelf Renting & Promo Revenue)', nameEn: 'Slotting Fees & Gondola Promo Revenue', type: 'REVENUE', balance: 0, status: 'ACTIVE' },
    // Expenses (5)
    { code: '510101', nameAr: 'تكلفة البضاعة المباعة (Cost of Goods Sold - COGS)', nameEn: 'Cost of Goods Sold (COGS)', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510201', nameAr: 'مصروفات التالف والهالك وفروق الجرد (Shrinkage & Waste Expense)', nameEn: 'Inventory Shrinkage & Spoilage Expense', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510301', nameAr: 'إيجارات الفروع والمخازن (Store & Warehouse Rents)', nameEn: 'Store & Warehouse Lease Expenses', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510401', nameAr: 'مصروفات التغليف والتعبئة (Packaging Supplies Expense)', nameEn: 'Packaging & Bagging Supplies', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510501', nameAr: 'مصروفات عمومية وإدارية (G&A Expenses)', nameEn: 'General & Administrative Expenses', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510601', nameAr: 'مصروف رواتب وأجور موظفي الكاشير والفروع (Store Staff & Cashier Salaries)', nameEn: 'Store Staff & Cashier Salaries Expense', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510701', nameAr: 'مصروف حصة الشركة في التأمينات (Employer Social Insurance Expense)', nameEn: 'Employer Social Insurance Expense', type: 'EXPENSE', balance: 0, status: 'ACTIVE' }
  ];

  // Industry Template: Manufacturing & Industrial Production (قطاع التصنيع والإنتاج)
  static MANUFACTURING_COA_TEMPLATE: Omit<GLAccount, 'id' | 'company_id' | 'createdAt'>[] = [
    // Assets (1)
    { code: '110101', nameAr: 'صندوق الخزينة الرئيسي (Cash in Hand)', nameEn: 'Cash in Hand (Main Box)', type: 'ASSET', balance: 50000, status: 'ACTIVE' },
    { code: '110201', nameAr: 'حساب بنك الشركة الجاري (Corporate Bank Account)', nameEn: 'Corporate Checking Account', type: 'ASSET', balance: 250000, status: 'ACTIVE' },
    { code: '110301', nameAr: 'حسابات العملاء والمدينين (Accounts Receivable)', nameEn: 'Accounts Receivable (Customers)', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '120101', nameAr: 'مخزون المواد الخام ومستلزمات الإنتاج (Raw Materials Inventory)', nameEn: 'Raw Materials Inventory', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '120201', nameAr: 'مخزون الإنتاج تحت التشغيل (Work In Progress - WIP)', nameEn: 'Work in Progress (WIP) Inventory', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '120301', nameAr: 'مخزون الإنتاج التام والمنتجات الجاهزة (Finished Goods Inventory)', nameEn: 'Finished Goods Inventory', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '130101', nameAr: 'الأصول الثابتة - خطوط الإنتاج والآلات (Machinery & Production Lines)', nameEn: 'Industrial Machinery & Production Lines', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '130201', nameAr: 'مجمع إهلاك آلات المصنع (Accumulated Depreciation - Machinery)', nameEn: 'Accumulated Depreciation - Plant Machinery', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    // Liabilities (2)
    { code: '210101', nameAr: 'حسابات موردي المواد الخام وموردي المصنع (Accounts Payable)', nameEn: 'Accounts Payable (Raw Material Vendors)', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210201', nameAr: 'مستحقات ضريبة القيمة المضافة (VAT Payable)', nameEn: 'VAT Payable (State Tax)', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210301', nameAr: 'ضريبة الخصم والتحصيل تحت حساب الضريبة (Withholding Tax Payable)', nameEn: 'Withholding Tax Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210401', nameAr: 'مستحقات التأمينات الاجتماعية (Social Insurance Payable)', nameEn: 'Social Insurance Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210501', nameAr: 'ضريبة كسب العمل المستحقة (Payroll Tax Payable)', nameEn: 'Payroll Taxes Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    // Equity (3)
    { code: '310101', nameAr: 'رأس مال الشركة المدفوع (Share Capital)', nameEn: 'Corporate Paid-in Capital', type: 'EQUITY', balance: 300000, status: 'ACTIVE' },
    // Revenue (4)
    { code: '410101', nameAr: 'إيرادات مبيعات المنتجات المصنعة (Manufactured Goods Sales)', nameEn: 'Manufactured Goods Sales Revenue', type: 'REVENUE', balance: 0, status: 'ACTIVE' },
    // Expenses (5)
    { code: '510101', nameAr: 'تكلفة المواد الخام المباشرة المستهلكة (Direct Raw Materials Cost)', nameEn: 'Direct Raw Materials Used', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510201', nameAr: 'أجور العمالة الصناعية المباشرة (Direct Manufacturing Labor)', nameEn: 'Direct Manufacturing Labor Cost', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510301', nameAr: 'مصروفات التشغيل الصناعي غير المباشر (Factory Overhead Expenses)', nameEn: 'Manufacturing Overhead & Utilities', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510401', nameAr: 'مصروفات صيانة خطوط الإنتاج والقطع (Plant Maintenance)', nameEn: 'Production Line Maintenance & Spare Parts', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510501', nameAr: 'مصروفات عمومية وإدارية (G&A Expenses)', nameEn: 'General & Administrative Expenses', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510601', nameAr: 'مصروف رواتب الإدارة والمهندسين (Management & Engineering Salaries)', nameEn: 'Administrative & Engineering Salaries', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510701', nameAr: 'مصروف حصة الشركة في التأمينات (Employer Social Insurance Expense)', nameEn: 'Employer Social Insurance Expense', type: 'EXPENSE', balance: 0, status: 'ACTIVE' }
  ];

  // Industry Template: Transport & Logistics (قطاع النقل والخدمات اللوجستية)
  static TRANSPORT_COA_TEMPLATE: Omit<GLAccount, 'id' | 'company_id' | 'createdAt'>[] = [
    // Assets (1)
    { code: '110101', nameAr: 'صندوق الخزينة وعهد السائقين (Cash in Hand & Driver Advances)', nameEn: 'Cash in Hand & Driver Road Custody', type: 'ASSET', balance: 50000, status: 'ACTIVE' },
    { code: '110201', nameAr: 'حساب بنك الشركة الجاري (Corporate Bank Account)', nameEn: 'Corporate Checking Account', type: 'ASSET', balance: 250000, status: 'ACTIVE' },
    { code: '110301', nameAr: 'حسابات عملاء الشحن والخدمات اللوجستية (Accounts Receivable)', nameEn: 'Accounts Receivable (Freight & Logistics Clients)', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '120101', nameAr: 'مخزون قطع غيار الشاحنات والإطارات (Fleet Spare Parts & Tyres Stock)', nameEn: 'Truck Spare Parts, Tyres & Oil Stock', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '130101', nameAr: 'الأصول الثابتة - أسطول الشاحنات والمركبات (Fleet Vehicles & Trucks)', nameEn: 'Fleet Trucks, Trailers & Vehicles', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    { code: '130201', nameAr: 'مجمع إهلاك أسطول السيارات (Accumulated Depreciation - Fleet)', nameEn: 'Accumulated Depreciation - Fleet', type: 'ASSET', balance: 0, status: 'ACTIVE' },
    // Liabilities (2)
    { code: '210101', nameAr: 'حسابات موردي قطع الغيار والوقود والورش (Accounts Payable)', nameEn: 'Accounts Payable (Fuel & Workshop Vendors)', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210201', nameAr: 'مستحقات ضريبة القيمة المضافة (VAT Payable)', nameEn: 'VAT Payable (State Tax)', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210301', nameAr: 'ضريبة الخصم والتحصيل تحت حساب الضريبة (Withholding Tax Payable)', nameEn: 'Withholding Tax Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210401', nameAr: 'مستحقات التأمينات الاجتماعية (Social Insurance Payable)', nameEn: 'Social Insurance Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    { code: '210501', nameAr: 'ضريبة كسب العمل المستحقة (Payroll Tax Payable)', nameEn: 'Payroll Taxes Payable', type: 'LIABILITY', balance: 0, status: 'ACTIVE' },
    // Equity (3)
    { code: '310101', nameAr: 'رأس مال الشركة المدفوع (Share Capital)', nameEn: 'Corporate Paid-in Capital', type: 'EQUITY', balance: 300000, status: 'ACTIVE' },
    // Revenue (4)
    { code: '410101', nameAr: 'إيرادات خدمات النقل والشحن البري (Freight & Logistics Revenue)', nameEn: 'Freight & Road Logistics Revenue', type: 'REVENUE', balance: 0, status: 'ACTIVE' },
    // Expenses (5)
    { code: '510101', nameAr: 'مصروفات وقود الديزل والزيوت للأسطول (Fleet Diesel & Oil Expense)', nameEn: 'Fleet Fuel & Lubricants Expenses', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510201', nameAr: 'رسوم الطرق والكارتات والموازين (Road Tolls & Weigh-bridge Fees)', nameEn: 'Highway Tolls & Weighing Fees', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510301', nameAr: 'مصروفات صيانة وتجديد الإطارات والسيارات (Vehicle Maintenance & Tyres)', nameEn: 'Vehicle Maintenance & Tyre Replacement', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510401', nameAr: 'مصروفات ترخيص وتأمين أسطول المركبات (Vehicle Insurance & Licensing)', nameEn: 'Fleet Insurance & Licensing Fees', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510501', nameAr: 'مصروفات عمومية وإدارية (G&A Expenses)', nameEn: 'General & Administrative Expenses', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510601', nameAr: 'مصروف رواتب السائقين وبدلات السفر (Drivers Salaries & Trip Allowances)', nameEn: 'Driver Salaries & Trip Allowances', type: 'EXPENSE', balance: 0, status: 'ACTIVE' },
    { code: '510701', nameAr: 'مصروف حصة الشركة في التأمينات (Employer Social Insurance Expense)', nameEn: 'Employer Social Insurance Expense', type: 'EXPENSE', balance: 0, status: 'ACTIVE' }
  ];

  /**
   * Retrieve accounts template by template ID.
   */
  static getTemplateAccounts(templateId?: CoaTemplateId | string): Omit<GLAccount, 'id' | 'company_id' | 'createdAt'>[] {
    switch (templateId) {
      case 'poultry':
        return AccountingBusinessEngine.POULTRY_COA_TEMPLATE;
      case 'retail':
        return AccountingBusinessEngine.RETAIL_COA_TEMPLATE;
      case 'manufacturing':
        return AccountingBusinessEngine.MANUFACTURING_COA_TEMPLATE;
      case 'transport':
        return AccountingBusinessEngine.TRANSPORT_COA_TEMPLATE;
      case 'standard':
      default:
        return AccountingBusinessEngine.STANDARD_COA_TEMPLATE;
    }
  }

  /**
   * Get all registered template metadata
   */
  static getAvailableTemplates(): CoaTemplateMetadata[] {
    return AccountingBusinessEngine.COA_TEMPLATES_METADATA;
  }

  /**
   * Determine active or recommended template ID for a company.
   */
  static getCompanyTemplateId(companyId: string): CoaTemplateId {
    const company = StorageEngine.getStored<any[]>('companies', []).find(c => c.id === companyId);
    if (company?.industry) {
      const ind = String(company.industry).toLowerCase();
      if (ind === 'poultry') return 'poultry';
      if (ind === 'retail') return 'retail';
      if (ind === 'manufacturing') return 'manufacturing';
      if (ind === 'transport') return 'transport';
    }
    // Check company ID conventions
    if (companyId.includes('poultry')) return 'poultry';
    if (companyId.includes('carrefour') || companyId.includes('retail')) return 'retail';
    if (companyId.includes('sewedy') || companyId.includes('mfg')) return 'manufacturing';
    if (companyId.includes('futtaim') || companyId.includes('transport') || companyId.includes('fleet')) return 'transport';

    return 'standard';
  }

  /**
   * Initialize or re-seed Chart of Accounts for a company using the specified or auto-detected template.
   */
  static async initializeChartOfAccountsAsync(companyId: string, templateId?: CoaTemplateId | string): Promise<GLAccount[]> {
    const effectiveTemplateId = templateId || AccountingBusinessEngine.getCompanyTemplateId(companyId);
    const templateItems = AccountingBusinessEngine.getTemplateAccounts(effectiveTemplateId);

    const initialized: GLAccount[] = templateItems.map(tpl => ({
      ...tpl,
      id: `acc-${companyId}-${tpl.code}`,
      company_id: companyId,
      createdAt: new Date().toISOString()
    }));

    for (const newAcc of initialized) {
      const syncRes = await syncWriteWithOfflineFallback('gl_accounts', newAcc.id, newAcc);
      if (!syncRes.success) {
        throw new Error(syncRes.error || `فشل تهيئة الحساب ${newAcc.code} في قاعدة البيانات.`);
      }
    }

    const list = StorageEngine.getStored<GLAccount[]>('gl_accounts', []);
    const existingFiltered = list.filter(a => a.company_id !== companyId);
    StorageEngine.setStored('gl_accounts', [...existingFiltered, ...initialized]);
    return initialized;
  }

  static initializeChartOfAccounts(companyId: string, templateId?: CoaTemplateId | string): GLAccount[] {
    const effectiveTemplateId = templateId || AccountingBusinessEngine.getCompanyTemplateId(companyId);
    const templateItems = AccountingBusinessEngine.getTemplateAccounts(effectiveTemplateId);

    const list = StorageEngine.getStored<GLAccount[]>('gl_accounts', []);
    const existingFiltered = list.filter(a => a.company_id !== companyId);

    const initialized: GLAccount[] = templateItems.map(tpl => ({
      ...tpl,
      id: `acc-${companyId}-${tpl.code}`,
      company_id: companyId,
      createdAt: new Date().toISOString()
    }));

    StorageEngine.setStored('gl_accounts', [...existingFiltered, ...initialized]);
    return initialized;
  }

  static async getAccounts(companyId: string, templateId?: CoaTemplateId | string): Promise<GLAccount[]> {
    const list = StorageEngine.getStored<GLAccount[]>('gl_accounts', []);
    const companyAccounts = list.filter(a => a.company_id === companyId);
    
    if (companyAccounts.length === 0) {
      return await AccountingBusinessEngine.initializeChartOfAccountsAsync(companyId, templateId);
    }
    
    return companyAccounts;
  }

  static getJournalEntries(companyId: string): JournalEntry[] {
    const list = StorageEngine.getStored<JournalEntry[]>('journal_entries', []);
    return list.filter(je => je.company_id === companyId);
  }

  static async saveAccounts(companyId: string, companyAccounts: GLAccount[]): Promise<boolean> {
    for (const a of companyAccounts) {
      const syncRes = await syncWriteWithOfflineFallback('gl_accounts', a.id, a);
      if (!syncRes.success) {
        throw new Error(syncRes.error || `فشل حفظ الحساب ${a.code} في قاعدة البيانات.`);
      }
    }
    const all = StorageEngine.getStored<GLAccount[]>('gl_accounts', []);
    const filteredOut = all.filter(a => a.company_id !== companyId);
    const combined = [...filteredOut, ...companyAccounts];
    StorageEngine.setStored('gl_accounts', combined);
    return true;
  }

  static async saveJournalEntries(list: JournalEntry[], expectedVersions?: Record<string, number>): Promise<boolean> {
    const existingList = StorageEngine.getStored<JournalEntry[]>('journal_entries', []);
    const existingMap = new Map(existingList.map(e => [e.id, e]));

    for (const je of list) {
      const existing = existingMap.get(je.id);
      if (existing) {
        const currentVer = existing.metadata?.version ?? (existing as any).version ?? 1;
        const requestedVer = expectedVersions?.[je.id] ?? je.metadata?.version ?? (je as any).version;

        if (requestedVer !== undefined && requestedVer !== currentVer) {
          throw new Error(`⚠️ عذراً، تم تعديل قيد اليومية رقم ${je.entryNumber || je.id} بواسطة مستخدم آخر. يرجى تحديث الصفحة والمحاولة مجدداً. / Journal entry ${je.entryNumber || je.id} has been modified by another user. Please refresh and try again (concurrency conflict).`);
        }

        const newVer = currentVer + 1;
        if (je.metadata) {
          je.metadata = updateBaseMetadata(existing.metadata || createBaseMetadata(je.company_id, 'system'), 'system');
          je.metadata.version = newVer;
        } else {
          je.metadata = {
            tenantId: je.company_id,
            organizationId: je.company_id,
            created_at: existing.metadata?.created_at || new Date().toISOString(),
            created_by: 'system',
            updated_at: new Date().toISOString(),
            updated_by: 'system',
            version: newVer
          };
        }
      } else {
        if (!je.metadata) {
          je.metadata = createBaseMetadata(je.company_id, 'system');
        }
      }

      const syncRes = await syncWriteWithOfflineFallback('journal_entries', je.id, je);
      if (!syncRes.success) {
        throw new Error(syncRes.error || `فشل حفظ قيد اليومية رقم ${je.entryNumber} في قاعدة البيانات.`);
      }

      existingMap.set(je.id, je);
    }

    StorageEngine.setStored('journal_entries', Array.from(existingMap.values()));
    return true;
  }

  /**
   * Helper to resolve and standardize accounting dimensions (Org Unit, Warehouse, Project, Cost Center)
   */
  static async resolveDimensions(
    companyId: string,
    provided?: AccountingDimensions,
    lineSpecific?: AccountingDimensions
  ): Promise<AccountingDimensions> {
    const merged = { ...provided, ...lineSpecific };

    let org_unit_id = merged.org_unit_id;
    let warehouseId = (merged as any).warehouseId || merged.warehouse_id;
    const projectId = (merged as any).projectId || merged.project_id;
    let costCenterId = (merged as any).costCenterId || merged.cost_center_id;

    // 1. Auto-derive Org Unit from Warehouse if missing
    if (!org_unit_id && warehouseId) {
      try {
        const whs = WarehouseHierarchyEngine.getWarehouses(companyId);
        const targetWh = whs.find(w => w.id === warehouseId);
        if (targetWh?.org_unit_id) {
          org_unit_id = targetWh.org_unit_id;
        }
      } catch {
        // Safe fallback if warehouse lookup fails
      }
    }

    // 2. Auto-derive Cost Center from Org Unit if missing
    if (!costCenterId && org_unit_id) {
      try {
        const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(org_unit_id, companyId);
        if (cc) {
          costCenterId = cc.id;
        }
      } catch {
        // Safe fallback
      }
    }

    // 3. Auto-derive Org Unit from Cost Center if missing
    if (!org_unit_id && costCenterId) {
      try {
        const cc = CostCenterEngine.getCostCenter(costCenterId);
        if (cc?.org_unit_id) {
          org_unit_id = cc.org_unit_id;
        }
      } catch {
        // Safe fallback
      }
    }

    return {
      org_unit_id,
      warehouse_id: warehouseId,
      warehouseId: warehouseId,
      project_id: projectId,
      projectId: projectId,
      cost_center_id: costCenterId,
      costCenterId: costCenterId
    };
  }

  /**
   * Helper to trigger automated double-entry postings for standard operations with full organization awareness.
   */
  static async postOperationalDoubleEntry(
    companyId: string,
    operatorId: string,
    sourceRef: string,
    statementAr: string,
    statementEn: string,
    lines: { 
      accountCode: string; 
      debit: number; 
      credit: number; 
      notes?: string;
      org_unit_id?: string;
      warehouseId?: string;
      warehouse_id?: string;
      projectId?: string;
      project_id?: string;
      costCenterId?: string;
      cost_center_id?: string;
    }[],
    dimensions?: AccountingDimensions
  ): Promise<JournalEntry> {
    const accounts = await AccountingBusinessEngine.getAccounts(companyId);

    // Validate non-negative values (BUG-05)
    for (const ln of lines) {
      if (ln.debit < 0 || ln.credit < 0) {
        throw new Error(`Accounting entries cannot contain negative values. Found debit: ${ln.debit}, credit: ${ln.credit}`);
      }
    }

    // Resolve header-level dimensions
    const headerDims = await AccountingBusinessEngine.resolveDimensions(companyId, dimensions);

    // Resolve line-level dimensions
    const lineDimsList = await Promise.all(lines.map(ln => AccountingBusinessEngine.resolveDimensions(companyId, headerDims, ln)));

    // Form complete Ledger Lines with line-level & header-level dimension fallbacks
    const ledgerLines: LedgerLine[] = lines.map((ln, idx) => {
      const acc = accounts.find(a => a.code === ln.accountCode);
      if (!acc) throw new Error(`GL Account code ${ln.accountCode} not found in corporate COA.`);
      
      const lineDims = lineDimsList[idx];

      return {
        accountId: acc.id,
        accountCode: acc.code,
        accountNameAr: acc.nameAr,
        accountNameEn: acc.nameEn,
        debit: ln.debit,
        credit: ln.credit,
        notes: ln.notes,
        ...lineDims
      };
    });

    const dbInstance = db as Firestore;
    const entryNumber = await SequenceEngine.generateNextSequence(
      dbInstance,
      companyId,
      'last_journal_entry_no',
      { prefix: 'JE', padding: 4, includeYear: true }
    );

    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);

    // Validate double-entry balance
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`Balanced Journal Entry check failed: Debits (${totalDebit}) must equal Credits (${totalCredit}).`);
    }

    const je: JournalEntry = {
      id: `je-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      company_id: companyId,
      entryNumber,
      date: new Date().toISOString().split('T')[0],
      sourceType: 'OPERATIONAL',
      sourceReference: sourceRef,
      statementAr,
      statementEn,
      lines: ledgerLines,
      totalDebit,
      totalCredit,
      metadata: createBaseMetadata(companyId, operatorId),
      ...headerDims
    };

    // Commit Journal Entry
    const allJEs = StorageEngine.getStored<JournalEntry[]>('journal_entries', []);
    allJEs.push(je);
    await AccountingBusinessEngine.saveJournalEntries(allJEs);

    // Update balances on GL accounts
    const updatedAccounts = accounts.map(acc => {
      const line = ledgerLines.find(l => l.accountId === acc.id);
      if (line) {
        let diff = 0;
        if (acc.type === 'ASSET' || acc.type === 'EXPENSE') {
          // Asset/Expense: debit increases, credit decreases
          diff = line.debit - line.credit;
        } else {
          // Liability/Equity/Revenue: credit increases, debit decreases
          diff = line.credit - line.debit;
        }
        return {
          ...acc,
          balance: acc.balance + diff
        };
      }
      return acc;
    });
    await AccountingBusinessEngine.saveAccounts(companyId, updatedAccounts);

    return je;
  }

  /**
   * Filters journal entries dynamically across company, org unit, warehouse, project, cost center, and date range.
   */
  static getJournalEntriesFiltered(options: JournalEntryFilterOptions): JournalEntry[] {
    const all = AccountingBusinessEngine.getJournalEntries(options.companyId);

    return all.filter(je => {
      if (options.sourceType && je.sourceType !== options.sourceType) return false;
      if (options.startDate && je.date < options.startDate) return false;
      if (options.endDate && je.date > options.endDate) return false;

      // Filter by Org Unit (matches header or line)
      if (options.org_unit_id) {
        const target = options.org_unit_id;
        const matchesHeader = je.org_unit_id === target;
        const matchesLine = je.lines.some(l => l.org_unit_id === target);
        if (!matchesHeader && !matchesLine) return false;
      }

      // Filter by Warehouse (matches header or line)
      if (options.warehouseId) {
        const matchesHeader = je.warehouseId === options.warehouseId || je.warehouse_id === options.warehouseId;
        const matchesLine = je.lines.some(l => l.warehouseId === options.warehouseId || l.warehouse_id === options.warehouseId);
        if (!matchesHeader && !matchesLine) return false;
      }

      // Filter by Project (matches header or line)
      if (options.projectId) {
        const matchesHeader = je.projectId === options.projectId || je.project_id === options.projectId;
        const matchesLine = je.lines.some(l => l.projectId === options.projectId || l.project_id === options.projectId);
        if (!matchesHeader && !matchesLine) return false;
      }

      // Filter by Cost Center (matches header or line)
      if (options.costCenterId) {
        const matchesHeader = je.costCenterId === options.costCenterId || je.cost_center_id === options.costCenterId;
        const matchesLine = je.lines.some(l => l.costCenterId === options.costCenterId || l.cost_center_id === options.costCenterId);
        if (!matchesHeader && !matchesLine) return false;
      }

      return true;
    });
  }

  // --- central event processor ---
  async processEvent(event: EventEnvelope<any>): Promise<EngineExecutionResult<any>> {
    if (!this.supportedEvents.includes(event.eventType)) {
      return {
        success: false,
        engineId: this.engineId,
        eventId: event.eventId,
        processedAt: new Date().toISOString(),
        statusCode: 'UNSUPPORTED_EVENT',
        messageEn: `Accounting engine does not support event: ${event.eventType}`,
        messageAr: `محرك الحسابات لا يدعم الحدث: ${event.eventType}`
      };
    }

    try {
      // Log to append-only audit trail
      await this.auditEngine.appendAuditRecord(event);

      const dbInstance = db as Firestore;

      switch (event.eventType) {
        case 'CHART_OF_ACCOUNTS_INITIALIZED': {
          const companyId = event.tenantId;
          const templateId = event.payload?.templateId || event.payload?.template;
          const accounts = await AccountingBusinessEngine.initializeChartOfAccountsAsync(companyId, templateId);
          return {
            success: true,
            engineId: this.engineId,
            eventId: event.eventId,
            processedAt: new Date().toISOString(),
            statusCode: 'SUCCESS',
            messageEn: `Chart of accounts initialized for company ${companyId}${templateId ? ` using template: ${templateId}` : ''}`,
            messageAr: `تم تهيئة شجرة الحسابات بنجاح للشركة ${companyId}${templateId ? ` باستخدام نموذج: ${templateId}` : ''}`,
            outputData: accounts
          };
        }

        case 'JOURNAL_ENTRY_POSTED': {
          const { statementAr, statementEn, lines, sourceRef, dimensions, org_unit_id, warehouseId, projectId, costCenterId } = event.payload;
          const companyId = event.tenantId;

          const je = await AccountingBusinessEngine.postOperationalDoubleEntry(
            companyId,
            event.user_id,
            sourceRef,
            statementAr,
            statementEn,
            lines,
            dimensions || { org_unit_id, warehouseId, projectId, costCenterId }
          );

          return {
            success: true,
            engineId: this.engineId,
            eventId: event.eventId,
            processedAt: new Date().toISOString(),
            statusCode: 'SUCCESS',
            messageEn: `Manual/Operational journal entry ${je.entryNumber} posted successfully.`,
            messageAr: `تم ترحيل قيد اليومية المحاسبي ${je.entryNumber} بنجاح.`,
            outputData: je
          };
        }

        default:
          throw new Error(`Unhandled event: ${event.eventType}`);
      }

    } catch (error: any) {
      return {
        success: false,
        engineId: this.engineId,
        eventId: event.eventId,
        processedAt: new Date().toISOString(),
        statusCode: 'EXECUTION_ERROR',
        messageEn: error.message || 'Unknown accounting processing error',
        messageAr: error.message || 'حدث خطأ مجهول أثناء معالجة القيود'
      };
    }
  }
}
