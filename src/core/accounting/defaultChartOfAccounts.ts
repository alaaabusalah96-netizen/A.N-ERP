/**
 * @file defaultChartOfAccounts.ts
 * @description Standard Arab Chart of Accounts (دليل الحسابات القياسي الموحد)
 * Compliant with Saudi SOCPA, Egyptian, and Arab general accounting standards.
 */

import { ChartAccount } from './accountingTypes';

export const STANDARD_CHART_OF_ACCOUNTS: Omit<ChartAccount, 'tenantId' | 'debitBalance' | 'creditBalance' | 'balance'>[] = [
  // 1: الأصول (ASSETS)
  { code: '1', parentCode: null, nameAr: 'الأصول', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: true, level: 1 },
  { code: '11', parentCode: '1', nameAr: 'الأصول المتداولة', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: true, level: 2 },
  { code: '1101', parentCode: '11', nameAr: 'النقدية وما في حكمها - الصندوق الرئيسي', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '1102', parentCode: '11', nameAr: 'البنك الأهلي التجاري - الحساب الجاري', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '1103', parentCode: '11', nameAr: 'مصرف الراجحي - الحساب التشغيلي', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '1104', parentCode: '11', nameAr: 'العملاء والذمم المدينة التجارية', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '1105', parentCode: '11', nameAr: 'المخزون السلعي والبضاعة', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '1109', parentCode: '11', nameAr: 'مخزون في الطريق (تحويلات بين المستودعات)', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '1106', parentCode: '11', nameAr: 'العهد المالية المؤقتة للموظفين', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '1107', parentCode: '11', nameAr: 'المصروفات المدفوعة مقدماً', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '1108', parentCode: '11', nameAr: 'ضريبة القيمة المضافة المدفوعة على المشتريات', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },

  { code: '12', parentCode: '1', nameAr: 'الأصول غير المتداولة (الثابتة)', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: true, level: 2 },
  { code: '1201', parentCode: '12', nameAr: 'الأجهزة والمعدات التقنية', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '1202', parentCode: '12', nameAr: 'الأثاث والتجهيزات المكتبية', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '1203', parentCode: '12', nameAr: 'السيارات ووسائل النقل', type: 'ASSET', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '1204', parentCode: '12', nameAr: 'مجمع استهلاك الأصول الثابتة', type: 'ASSET', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },

  // 2: الالتزامات (LIABILITIES)
  { code: '2', parentCode: null, nameAr: 'الالتزامات', type: 'LIABILITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: true, level: 1 },
  { code: '21', parentCode: '2', nameAr: 'الالتزامات المتداولة', type: 'LIABILITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: true, level: 2 },
  { code: '2101', parentCode: '21', nameAr: 'الموردون والذمم الدائنة التجارية', type: 'LIABILITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '2106', parentCode: '21', nameAr: 'بضاعة مستلمة لم تُفوتر (GR/IR)', type: 'LIABILITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '2102', parentCode: '21', nameAr: 'ضريبة القيمة المضافة المستحقة (المبيعات)', type: 'LIABILITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '2103', parentCode: '21', nameAr: 'الرواتب والأجور المستحقة', type: 'LIABILITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '2104', parentCode: '21', nameAr: 'المصروفات المستحقة غير المسددة', type: 'LIABILITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '2105', parentCode: '21', nameAr: 'تأمينات اجتماعية مستحقة (GOSI)', type: 'LIABILITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },

  { code: '22', parentCode: '2', nameAr: 'الالتزامات غير المتداولة (طويلة الأجل)', type: 'LIABILITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: true, level: 2 },
  { code: '2201', parentCode: '22', nameAr: 'قروض وتسهيلات بنكية طويلة الأجل', type: 'LIABILITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '2202', parentCode: '22', nameAr: 'مخصص مكافأة نهاية الخدمة للموظفين', type: 'LIABILITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },

  // 3: حقوق الملكية (EQUITY)
  { code: '3', parentCode: null, nameAr: 'حقوق الملكية', type: 'EQUITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: true, level: 1 },
  { code: '3101', parentCode: '3', nameAr: 'رأس المال المدفوع', type: 'EQUITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 2 },
  { code: '3201', parentCode: '3', nameAr: 'الاحتياطي النظامي', type: 'EQUITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 2 },
  { code: '3301', parentCode: '3', nameAr: 'الأرباح المبقاة (المحتجزة المدورة)', type: 'EQUITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 2 },
  { code: '3401', parentCode: '3', nameAr: 'أرباح وخسائر العام المالي الحالي', type: 'EQUITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 2 },
  { code: '3501', parentCode: '3', nameAr: 'جاري الشركاء / المالك', type: 'EQUITY', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 2 },

  // 4: الإيرادات (REVENUES)
  { code: '4', parentCode: null, nameAr: 'الإيرادات', type: 'REVENUE', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: true, level: 1 },
  { code: '41', parentCode: '4', nameAr: 'إيرادات النشاط التشغيلي الرئيسي', type: 'REVENUE', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: true, level: 2 },
  { code: '4101', parentCode: '41', nameAr: 'إيرادات المبيعات التجارية', type: 'REVENUE', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '4102', parentCode: '41', nameAr: 'إيرادات تقديم الخدمات المهنية والتقنية', type: 'REVENUE', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '4103', parentCode: '41', nameAr: 'خصم مسموح به (مدين تخفيض إيراد)', type: 'REVENUE', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '42', parentCode: '4', nameAr: 'إيرادات وأرباح أخرى', type: 'REVENUE', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: true, level: 2 },
  { code: '4201', parentCode: '42', nameAr: 'إيرادات عوائد ودائع واستثمارات', type: 'REVENUE', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '4202', parentCode: '42', nameAr: 'إيرادات متنوعة غير تشغيلية', type: 'REVENUE', nature: 'CREDIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },

  // 5: المصروفات والتكاليف (EXPENSES)
  { code: '5', parentCode: null, nameAr: 'المصروفات والتكاليف', type: 'EXPENSE', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: true, level: 1 },
  { code: '51', parentCode: '5', nameAr: 'تكلفة الإيرادات والنشاط', type: 'EXPENSE', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: true, level: 2 },
  { code: '5101', parentCode: '51', nameAr: 'تكلفة البضاعة والخدمات المباعة', type: 'EXPENSE', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '5102', parentCode: '51', nameAr: 'تكاليف الشحن والمناولة اللوجستية', type: 'EXPENSE', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },

  { code: '52', parentCode: '5', nameAr: 'المصروفات العمومية والإدارية والتشغيلية', type: 'EXPENSE', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: true, level: 2 },
  { code: '5201', parentCode: '52', nameAr: 'الرواتب والأجور الأساسية والبدلات', type: 'EXPENSE', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '5202', parentCode: '52', nameAr: 'إيجار المقرات والفروع التشغيلية', type: 'EXPENSE', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '5203', parentCode: '52', nameAr: 'فواتير الكهرباء والمياه والاتصالات', type: 'EXPENSE', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '5204', parentCode: '52', nameAr: 'مصروفات الصيانة والنظافة والدعم الفني', type: 'EXPENSE', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '5205', parentCode: '52', nameAr: 'استهلاك الأجهزة والأصول الثابتة', type: 'EXPENSE', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '5206', parentCode: '52', nameAr: 'مصاريف التسويق والإعلانات والعلاقات العامة', type: 'EXPENSE', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '5207', parentCode: '52', nameAr: 'رسوم بنكية ومصرفية', type: 'EXPENSE', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
  { code: '5208', parentCode: '52', nameAr: 'مصروفات الضيافة والنثريات', type: 'EXPENSE', nature: 'DEBIT', currency: 'SAR', isActive: true, isParent: false, level: 3 },
];
