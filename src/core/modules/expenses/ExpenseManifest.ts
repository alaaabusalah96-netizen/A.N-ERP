/**
 * @file ExpenseManifest.ts
 * @description Formal Module Manifest for Expenses Module (Phase 6 - Module 2 of 15)
 * Strictly conforms to Section 11.1, 11.2, 10.3, and Section 3F of A.N ERP Architecture.
 */

import { SystemPermission } from '../../sod/SoDMatrixService';
import { DomainEventType } from '../../events/DomainEventBus';
import { ModuleManifestDefinition } from '../custody/CashCustodyManifest';

export const ExpenseModuleManifest: ModuleManifestDefinition = {
  moduleId: 'expenses',
  moduleNameAr: 'المصروفات العامة والتشغيلية',
  moduleNameEn: 'General & Operating Expenses',
  version: '1.0.0',
  category: 'CORE_FINANCE',
  tables: [
    {
      name: 'an_expense_requests',
      entityName: 'ExpenseRequest',
      descriptionAr: 'طلبات الصرف المباشر والاسترداد ومسارات اعتمادها وترحيلها',
      hasTenantId: true,
      hasCompanyId: true,
    },
    {
      name: 'an_expense_lines',
      entityName: 'ExpenseLine',
      descriptionAr: 'بنود المصروفات المفصلة وتوجيهها المحاسبي ومراكز التكلفة والمشاريع',
      hasTenantId: true,
      hasCompanyId: true,
    },
    {
      name: 'an_expense_attachments',
      entityName: 'ExpenseAttachment',
      descriptionAr: 'مرفقات الإثبات والفواتير والمستندات الثبوتية المؤيدة للصرف',
      hasTenantId: true,
      hasCompanyId: true,
    },
    {
      name: 'an_expense_categories',
      entityName: 'ExpenseCategory',
      descriptionAr: 'تصنيفات وفئات المصروفات وربطها التلقائي بالحسابات وحدود إرفاق المستندات',
      hasTenantId: true,
      hasCompanyId: true,
    },
  ],
  domainEvents: [
    'EXPENSE_REQUESTED',
    'EXPENSE_APPROVED',
    'EXPENSE_REJECTED',
    'EXPENSE_POSTED',
  ],
  permissions: [
    'EXPENSE_SUBMIT',
    'EXPENSE_APPROVE_L1',
    'EXPENSE_APPROVE_L2',
  ],
  sodRules: [
    {
      ruleCode: 'SOD-EXP-001',
      titleAr: 'منع مقدم طلب الصرف من اعتماد طلبه',
      descriptionAr: 'لا يجوز للموظف الذي أنشأ أو قدم طلب الصرف أن يعتمد أياً من مستويات الموافقة (L1 أو L2) لنفس الطلب (بند 7.1).',
      enforcementPoint: 'ADAPTER_STORAGE_LAYER',
    },
    {
      ruleCode: 'SOD-EXP-002',
      titleAr: 'الفصل الصارم عن العهدة النقدية',
      descriptionAr: 'المصروفات الممولة من عهد نقدية تدار وتسوى في موديول العهدة (5) حصرًا وتُمنع في هذا الموديول.',
      enforcementPoint: 'ADAPTER_STORAGE_LAYER',
    },
  ],
  engineIntegrations: [
    {
      engine: 'ApprovalEngine',
      purposeAr: 'إدارة دورة اعتماد طلبات الصرف المستقلة وتصعيد الموافقات تلقائيًا بناءً على سقف المبلغ المحدد لكل شركة (10.3).',
    },
    {
      engine: 'PostingEngine',
      purposeAr: 'الربط المحاسبي التلقائي وترحيل القيود اليومية المتوازنة فور الاعتماد النهائي المالي دون تدخل يدوي (6C).',
    },
    {
      engine: 'NumberingEngine',
      purposeAr: 'توليد أرقام متسلسلة غير متكررة لطلبات الصرف (مثل EXP-202609-0001) بدقة ذرية.',
    },
  ],
  defaultRoleLimits: {
    direct_manager: 5000,
    department_head: 15000,
    cfo: 500000,
  },
  supportedActivityTemplates: [
    'TRADING_GENERAL',
    'CONTRACTING_PROJECTS',
    'MANUFACTURING',
    'RETAIL_CHAINS',
    'SERVICES_CONSULTING',
    'LOGISTICS_FLEET',
  ],
};
