import { Company } from '../types';
import { CompaniesModule } from './companies';
import { UsersModule } from './users';
import { LogsModule } from './logs';

export interface ERPModule {
  id: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  screens: string[];
}

export interface CompanyModuleSettings {
  enabled: boolean;
  plan: 'Basic' | 'Professional' | 'Enterprise';
  status: 'active' | 'inactive';
  activation_date: string;
  expiry_date: string;
  notes?: string;
}

export const ERP_MODULES_REGISTRY: ERPModule[] = [
  {
    id: 'custody',
    name_en: 'Cash Custody Management',
    name_ar: 'إدارة العهد النقدية',
    description_en: 'Core custody system, expense requests, vouchers, and cash reconciliation.',
    description_ar: 'النظام الأساسي لإدارة العهد النقدية، طلبات الصرف، السندات، وجرد وتسوية النقدية.',
    screens: ['custody', 'new-expense', 'voucher', 'reconciliation']
  },
  {
    id: 'inventory',
    name_en: 'Inventory & Warehouses',
    name_ar: 'إدارة المخازن والمستودعات',
    description_en: 'Warehouse control, products, items catalog, and inventory documentation.',
    description_ar: 'إدارة المخازن والفروع، مستندات الإدخال والصرف المخزني، كتالوج المنتجات ومطابقتها.',
    screens: ['inventory']
  },
  {
    id: 'reports',
    name_en: 'Advanced Reports & BI',
    name_ar: 'التقارير المالية المتقدمة',
    description_en: 'Consolidated reporting, daily, monthly, and regional cash movement analytics.',
    description_ar: 'تقارير مالية مجمعة، تحليلات تفصيلية يومية وشهرية، وحركة النقدية عبر الفروع.',
    screens: ['reports']
  },
  {
    id: 'audit',
    name_en: 'Audit & Compliance Log',
    name_ar: 'سجل الرقابة والامتثال',
    description_en: 'Full multi-tenant activity logging, security monitoring, and transaction tracking.',
    description_ar: 'سجل تدقيق كامل للأنشطة والعمليات الإدارية، مراقبة أمنية، ومراجعة تفصيلية للقيود.',
    screens: ['audit-log']
  },
  {
    id: 'purchasing',
    name_en: 'Procurement & Supply Chain',
    name_ar: 'إدارة المشتريات والتموين',
    description_en: 'Supplier register, purchase requests with lifecycle workflows, and binding purchase orders.',
    description_ar: 'دليل الموردين، طلبات الشراء الداخلية، وأوامر الشراء المباشرة الصادرة.',
    screens: ['purchasing']
  },
  {
    id: 'accounting',
    name_en: 'Double-Entry General Ledger',
    name_ar: 'الاستحقاق والقيود المزدوجة',
    description_en: 'Chart of accounts, real-time double-entry posting rules, journal entries, and Trial Balance.',
    description_ar: 'شجرة الحسابات، قيود اليومية المزدوجة التلقائية واليدوية، ميزان المراجعة وقائمة الأرباح والخسائر.',
    screens: ['accounting']
  },
  {
    id: 'sales_ar',
    name_en: 'Sales & Accounts Receivable',
    name_ar: 'إدارة المبيعات وحسابات العملاء',
    description_en: 'Customer directory, sales invoices with automatic tax (VAT), and accounts receivable balances tracking.',
    description_ar: 'إدارة سجل العملاء، فواتير المبيعات، حساب ضريبة القيمة المضافة، ومتابعة أرصدة المدينين والتحصيل.',
    screens: ['sales_ar']
  },
  {
    id: 'pos',
    name_en: 'Point of Sale (POS) Terminal',
    name_ar: 'نظام نقاط البيع السريع',
    description_en: 'Touch-optimized cashier interface, quick invoice processing, thermal receipt generator, and inventory link.',
    description_ar: 'واجهة كاشير تفاعلية، إصدار فواتير بيع سريعة، طباعة إيصالات حرارية، وتحديث فوري للمخزون.',
    screens: ['pos']
  },
  {
    id: 'crm',
    name_en: 'Customer Relationship (CRM)',
    name_ar: 'إدارة علاقات العملاء CRM',
    description_en: 'Leads pipeline, prospect status, interaction logs (meetings/calls), and communication scheduler.',
    description_ar: 'متابعة الفرص البيعية والعملاء المحتملين، سجل التفاعلات والاتصالات، وجدولة المتابعات.',
    screens: ['crm']
  },
  {
    id: 'fixed_assets',
    name_en: 'Fixed Assets & Depreciation',
    name_ar: 'إدارة الأصول الثابتة والاستهلاكات',
    description_en: 'Fixed assets registry, cost models, and straight-line depreciation posting to general ledger.',
    description_ar: 'سجل الأصول الثابتة، تصنيفات الأصول، واحتساب الاستهلاك والترحيل التلقائي لدفتر الأستاذ.',
    screens: ['fixed_assets']
  },
  {
    id: 'hr_payroll',
    name_en: 'Human Resources & Payroll',
    name_ar: 'الموارد البشرية ومسيرات الرواتب',
    description_en: 'Employee files, department assignments, salary models, allowances, deductions, and monthly payroll processing.',
    description_ar: 'ملفات الموظفين، شؤون العاملين، احتساب البدلات والاستقطاعات، وإصدار مسيرات الرواتب الشهرية.',
    screens: ['hr_payroll']
  },
  {
    id: 'contracting',
    name_en: 'Construction & Contracting',
    name_ar: 'إدارة المقاولات والمستخلصات',
    description_en: 'Projects & sites management, subcontractor contracts, client/subcontractor payment certificates, and daily labor tracking.',
    description_ar: 'إدارة المشاريع والمواقع، عقود مقاولي الباطن، المستخلصات (المالك ومقاولي الباطن)، وتتبع حضور ويوميات العمالة.',
    screens: ['contracting']
  },
  {
    id: 'restaurant',
    name_en: 'Restaurant & POS Management',
    name_ar: 'إدارة المطاعم ونقاط البيع',
    description_en: 'Dishes menu, recipe cost calculations (BOM), POS order management, dine-in tables, and auto inventory stock deduction.',
    description_ar: 'إدارة قائمة الأطعمة وتكاليف الوجبات (BOM)، نقطة البيع للمطاعم، إشغال الطاولات، والتخصيم التلقائي للمخزون.',
    screens: ['restaurant-menu', 'restaurant-orders']
  },
  {
    id: 'fleet',
    name_en: 'Fleet & Trip Management',
    name_ar: 'إدارة الأسطول والمشاوير',
    description_en: 'Fleet vehicles catalog, driver assignments, trip logs, fuel & maintenance expenses tracking.',
    description_ar: 'إدارة أسطول المركبات، تعيين السائقين، سجل المشاوير، وتتبع تكاليف الوقود والصيانة.',
    screens: ['fleet']
  }
];

export class ModulesModule {
  static getCompanyModules(companyId: string): Record<string, CompanyModuleSettings> {
    const companies = CompaniesModule.getCompanies();
    const company = companies.find(c => c.id === companyId);
    if (!company) {
      return ModulesModule.getDefaultModulesForPlan('Enterprise');
    }
    
    // If modules are not set, return defaults based on subscription plan or standard default
    if (!company.modules) {
      return ModulesModule.getDefaultModulesForPlan(company.subscription_plan || 'Basic');
    }
    
    // Ensure all registry modules are represented
    const current = { ...company.modules };
    ERP_MODULES_REGISTRY.forEach(m => {
      if (!current[m.id]) {
        current[m.id] = {
          enabled: m.id === 'custody', // Default only custody enabled
          plan: 'Basic',
          status: 'active',
          activation_date: new Date().toISOString().split('T')[0],
          expiry_date: company.subscription_expiry || '2028-12-31',
          notes: 'Auto-initialized'
        };
      }
    });
    
    return current;
  }

  static getDefaultModulesForPlan(plan: Company['subscription_plan']): Record<string, CompanyModuleSettings> {
    const defaultExpiry = '2028-12-31';
    const activationDate = new Date().toISOString().split('T')[0];
    
    const modules: Record<string, CompanyModuleSettings> = {};
    
    ERP_MODULES_REGISTRY.forEach(m => {
      let enabled = false;
      let mPlan: 'Basic' | 'Professional' | 'Enterprise' = 'Basic';
      
      if (plan === 'Enterprise') {
        enabled = true;
        mPlan = 'Enterprise';
      } else if (plan === 'Professional') {
        enabled = m.id !== 'inventory'; // custody, reports, audit are enabled
        mPlan = 'Professional';
      } else {
        // Basic Plan
        enabled = m.id === 'custody'; // Only core custody
        mPlan = 'Basic';
      }
      
      modules[m.id] = {
        enabled,
        plan: mPlan,
        status: 'active',
        activation_date: activationDate,
        expiry_date: defaultExpiry,
        notes: `Default plan assignments for ${plan}`
      };
    });
    
    return modules;
  }

  static saveCompanyModules(companyId: string, modules: Record<string, CompanyModuleSettings>): void {
    const companies = CompaniesModule.getCompanies();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx !== -1) {
      companies[idx] = { ...companies[idx], modules };
      CompaniesModule.saveCompanies(companies);
      
      // Dispatch an event to notify of state changes
      window.dispatchEvent(new Event('custody_db_updated'));
    }
  }

  static enableAll(companyId: string): void {
    const modules = ModulesModule.getCompanyModules(companyId);
    Object.keys(modules).forEach(k => {
      modules[k].enabled = true;
      modules[k].status = 'active';
    });
    ModulesModule.saveCompanyModules(companyId, modules);
    
    const user = UsersModule.getActiveUser();
    LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Enable All Modules', `Enabled all modules for company ID: ${companyId}`);
    LogsModule.logAudit('COMPANY_MODULES_ENABLE_ALL', `Enabled all modules for company ID: ${companyId}`, { companyId });
  }

  static disableAll(companyId: string): void {
    const modules = ModulesModule.getCompanyModules(companyId);
    Object.keys(modules).forEach(k => {
      modules[k].enabled = false;
      modules[k].status = 'inactive';
    });
    ModulesModule.saveCompanyModules(companyId, modules);
    
    const user = UsersModule.getActiveUser();
    LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Disable All Modules', `Disabled all modules for company ID: ${companyId}`);
    LogsModule.logAudit('COMPANY_MODULES_DISABLE_ALL', `Disabled all modules for company ID: ${companyId}`, { companyId });
  }

  static applyPackage(companyId: string, plan: Company['subscription_plan']): void {
    const modules = ModulesModule.getDefaultModulesForPlan(plan);
    ModulesModule.saveCompanyModules(companyId, modules);
    
    const user = UsersModule.getActiveUser();
    LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Apply Module Package', `Applied package: ${plan} to company ID: ${companyId}`);
    LogsModule.logAudit('COMPANY_MODULES_APPLY_PACKAGE', `Applied package: ${plan} to company ID: ${companyId}`, { companyId, plan });
  }

  static copyFromAnotherCompany(targetCompanyId: string, sourceCompanyId: string): void {
    const sourceModules = ModulesModule.getCompanyModules(sourceCompanyId);
    // deep clone
    const cloned = JSON.parse(JSON.stringify(sourceModules));
    ModulesModule.saveCompanyModules(targetCompanyId, cloned);
    
    const user = UsersModule.getActiveUser();
    LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Copy Modules Settings', `Copied module settings from company ID ${sourceCompanyId} to company ID ${targetCompanyId}`);
    LogsModule.logAudit('COMPANY_MODULES_COPY', `Copied module settings from ${sourceCompanyId} to ${targetCompanyId}`, { sourceCompanyId, targetCompanyId });
  }

  static isModuleEnabledForCompany(companyId: string, moduleId: string): boolean {
    const modules = ModulesModule.getCompanyModules(companyId);
    return !!modules[moduleId]?.enabled && modules[moduleId]?.status === 'active';
  }

  static isScreenEnabledForCompany(companyId: string, screenId: string): boolean {
    // Find module belonging to this screen
    const moduleMatch = ERP_MODULES_REGISTRY.find(m => m.screens.includes(screenId));
    if (!moduleMatch) return true; // Screen is not modular (e.g. settings/search/super-admin)
    
    return ModulesModule.isModuleEnabledForCompany(companyId, moduleMatch.id);
  }

  static isPermissionEnabledForCompany(companyId: string, permissionKey: string): boolean {
    // Map permission keys to modules
    const permToModuleMap: Record<string, string> = {
      create_expense: 'custody',
      edit_expense: 'custody',
      delete_expense: 'custody',
      create_voucher: 'custody',
      approve_voucher: 'custody',
      reject_voucher: 'custody',
      create_custody: 'custody',
      edit_custody: 'custody',
      replace_custody: 'custody',
      settle_voucher: 'custody',
      view_reports: 'reports',
    };

    const targetModule = permToModuleMap[permissionKey];
    if (!targetModule) return true; // Non-modular permissions are always visible/enabled (e.g. manage_users, manage_regions)

    return ModulesModule.isModuleEnabledForCompany(companyId, targetModule);
  }
}
