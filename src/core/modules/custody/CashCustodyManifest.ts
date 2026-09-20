/**
 * @file CashCustodyManifest.ts
 * @description Formal Module Manifest for Cash Custody Module (Phase 5 - Module 1 of 15)
 * Strictly conforms to Section 11.1, 11.2, and Section 3F of A.N ERP Architecture.
 */

import { SystemPermission } from '../../sod/SoDMatrixService';
import { DomainEventType } from '../../events/DomainEventBus';

export interface ModuleManifestDefinition {
  moduleId: string;
  moduleNameAr: string;
  moduleNameEn: string;
  version: string;
  category: 'CORE_FINANCE' | 'OPERATIONS' | 'COMMERCIAL' | 'SUPPORT';
  tables: Array<{
    name: string;
    entityName: string;
    descriptionAr: string;
    hasTenantId: boolean;
    hasCompanyId: boolean;
  }>;
  domainEvents: DomainEventType[];
  permissions: SystemPermission[];
  sodRules: Array<{
    ruleCode: string;
    titleAr: string;
    descriptionAr: string;
    enforcementPoint: 'ADAPTER_STORAGE_LAYER';
  }>;
  engineIntegrations: Array<{
    engine: 'PostingEngine' | 'NumberingEngine' | 'ApprovalEngine';
    purposeAr: string;
  }>;
  defaultRoleLimits: Record<string, number>;
  supportedActivityTemplates: string[];
}

export const CashCustodyModuleManifest: ModuleManifestDefinition = {
  moduleId: 'custody',
  moduleNameAr: 'العهدة النقدية والمصروفات النثرية',
  moduleNameEn: 'Cash Custody & Petty Cash',
  version: '1.0.0',
  category: 'CORE_FINANCE',
  tables: [
    {
      name: 'an_cash_custodies',
      entityName: 'CashCustody',
      descriptionAr: 'سجلات العهد النقدية المفتوحة للموظفين أو الفروع والمراكز التكلفية',
      hasTenantId: true,
      hasCompanyId: true,
    },
    {
      name: 'an_cash_custody_transactions',
      entityName: 'CashCustodyTransaction',
      descriptionAr: 'حركات الصرف الفعلي من العهدة النقدية مدعمة بالمستندات والفواتير',
      hasTenantId: true,
      hasCompanyId: true,
    },
    {
      name: 'an_cash_custody_settlements',
      entityName: 'CashCustodySettlement',
      descriptionAr: 'التسويات الدورية ومطابقة المصروفات وترحيل قيود الإقفال والتجديد',
      hasTenantId: true,
      hasCompanyId: true,
    },
  ],
  domainEvents: [
    'CUSTODY_OPENED',
    'CUSTODY_TRANSACTION_RECORDED',
    'CUSTODY_SETTLED',
    'CUSTODY_CLOSED',
  ],
  permissions: [
    'CUSTODY_OPEN',
    'CUSTODY_RECORD_EXPENSE',
    'CUSTODY_SETTLE',
  ],
  sodRules: [
    {
      ruleCode: 'SOD_CUSTODY_NO_SELF_SETTLEMENT',
      titleAr: 'منع اعتماد تسوية العهدة الذاتية',
      descriptionAr: 'لا يجوز لنفس المستخدم الذي فتح العهدة النقدية أو خصصها اعتماد تسويتها النهائية (بند 7.1)',
      enforcementPoint: 'ADAPTER_STORAGE_LAYER',
    },
  ],
  engineIntegrations: [
    {
      engine: 'PostingEngine',
      purposeAr: 'ترحيل قيود التسوية الدورية للعهدة وإثبات المصروفات وتجديد الرصيد دون تعديل مباشر للأرصدة',
    },
    {
      engine: 'NumberingEngine',
      purposeAr: 'توليد أرقام متسلسلة للعهد (CST)، حركات الصرف (CTX)، والتسويات (CST-SET)',
    },
  ],
  defaultRoleLimits: {
    accountant: 15000,
    branch_manager: 25000,
    warehouse: 7500,
    operational_staff: 5000,
    financial_approver: 50000,
  },
  supportedActivityTemplates: [
    'retail_supermarket',
    'restaurant_cafe',
    'contracting_construction',
    'services_consulting',
    'transport_logistics',
    'manufacturing_general',
    'real_estate_management',
    'automotive_workshop',
    'hotel_hospitality',
    'medical_clinic',
  ],
};
