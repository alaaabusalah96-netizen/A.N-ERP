/**
 * @file CompanyWizardService.ts
 * @description Company Creation Wizard Service for A.N ERP (v7.1 / Phase 2)
 * Strictly conforms to Section 10.1, Phase 2A, Phase 2B, & Phase 2H.
 * Flow: Country -> Activity Template -> backendConfig -> Chart of Accounts -> First Admin.
 * Automatically provisions country VAT rate, template modules, and enforces adapter governance.
 */

import {
  StoragePort,
  TenantCompany,
  BackendConfig,
  User,
  Account,
  TenantModuleManifest,
  StorageResult,
  SystemChangeLogEntry,
} from '../storage/StoragePort';
import { globalStorageRouter } from '../storage/StorageRouter';
import {
  ACTIVITY_TEMPLATES_DICT,
  MODULE_REGISTRY,
  COUNTRY_TAX_RULES,
  ActivityTemplate,
  getTemplateById,
} from '../templates/ActivityTemplates';
import { AuditChainService } from '../audit/AuditChainService';
import crypto from 'crypto';
import argon2 from 'argon2';
import { EncryptionService } from '../crypto/EncryptionService';
import { generateSecret } from 'otplib';

export interface CreateCompanyPayload {
  countryCode: string;
  companyNameAr: string;
  companyNameEn?: string;
  taxNumber?: string;
  activityTemplateId: string;
  backendConfig: BackendConfig;
  firstAdmin: {
    username: string;
    fullName: string;
    email: string;
    password: string;
  };
  customModulesOverride?: string[];
  customAccountsOverride?: Array<{
    code: string;
    nameAr: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
    nature: 'DEBIT' | 'CREDIT';
  }>;
  idempotencyKey: string;
}

export interface CompanyWizardResult {
  tenant: TenantCompany;
  activityTemplate: {
    id: string;
    nameAr: string;
    categoryAr: string;
  };
  taxRule: {
    countryCode: string;
    countryNameAr: string;
    standardVatRate: number;
    currencyCode: string;
    taxAuthorityName: string;
  };
  enabledModules: TenantModuleManifest[];
  seededAccountsCount: number;
  firstAdmin: {
    id: string;
    username: string;
    fullName: string;
    email: string;
    role: string;
  };
}

export class CompanyWizardService {
  private readonly port: StoragePort;

  constructor(port: StoragePort) {
    this.port = port;
  }

  /**
   * Executes the 5-step company creation wizard with strict validations.
   */
  public async createCompany(payload: CreateCompanyPayload): Promise<StorageResult<CompanyWizardResult>> {
    // STEP 1: Country Validation & Tax Rule
    const countryCode = (payload.countryCode || '').trim().toUpperCase();
    if (!countryCode) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/wizard-country-required',
          title: 'اختيار الدولة إلزامي',
          status: 400,
          detail: 'يجب اختيار دولة صالحة لتطبيق اللائحة الضريبية المعتمدة (مثل SA أو EG).',
        },
      };
    }

    let taxRuleRes = await this.port.getCountryTaxRule(countryCode);
    if (!taxRuleRes.success || !taxRuleRes.data) {
      // Fallback to static catalog if DB rule not yet seeded
      const staticRule = COUNTRY_TAX_RULES[countryCode];
      if (!staticRule) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/unsupported-country',
            title: 'دولة غير مدعومة حالياً',
            status: 400,
            detail: `الدولة المحددة (${countryCode}) غير مسجلة في جدول الضرائب المعتمد.`,
          },
        };
      }
      taxRuleRes = { success: true, data: staticRule };
    }

    const taxRule = taxRuleRes.data!;

    // Validate Tax ID format if provided
    if (payload.taxNumber && payload.taxNumber.trim() !== '') {
      const regex = new RegExp(taxRule.taxIdFormatRegex);
      if (!regex.test(payload.taxNumber.trim())) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/invalid-tax-number',
            title: 'الرقم الضريبي غير مطابق للمعايير الوطنية',
            status: 422,
            detail: `الرقم الضريبي المدخل لا يطابق اشتراطات ${taxRule.taxAuthorityName} لدولة (${taxRule.countryNameAr}).`,
          },
        };
      }
    }

    // STEP 2: Activity Template Selection
    const template: ActivityTemplate | undefined = getTemplateById(payload.activityTemplateId) || ACTIVITY_TEMPLATES_DICT[payload.activityTemplateId];
    if (!template) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-activity-template',
          title: 'قالب النشاط غير موجود',
          status: 400,
          detail: `قالب النشاط برقم (${payload.activityTemplateId}) غير متوفر في قائمة الـ 50 قالباً المعتمدة.`,
        },
      };
    }

    // STEP 3: backendConfig Validation (Adapter Governance - Phase 2B)
    const backendValidation = globalStorageRouter.validateBackendConfig(payload.backendConfig);
    if (!backendValidation.valid) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-backend-config',
          title: 'إعدادات التخزين backendConfig مرفوضة',
          status: 400,
          detail: backendValidation.errorDetailAr || 'فشل التحقق من إعدادات المخزن.',
        },
      };
    }

    // Validate company name
    if (!payload.companyNameAr || payload.companyNameAr.trim().length < 3) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/company-name-required',
          title: 'اسم الشركة إلزامي',
          status: 400,
          detail: 'يجب إدخال اسم عربي رسمي للشركة لا يقل عن 3 أحرف.',
        },
      };
    }

    // Validate First Admin payload
    if (!payload.firstAdmin?.username || !payload.firstAdmin?.email || !payload.firstAdmin?.password) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/admin-user-required',
          title: 'بيانات المدير الأول غير مكتملة',
          status: 400,
          detail: 'يجب توفير اسم مستخدم وبريد إلكتروني وكلمة مرور للمدير الأول المسؤول عن النظام.',
        },
      };
    }

    // Generate Tenant ID & Code
    const tenantId = `tenant-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const tenantCode = `CMP-${Math.floor(1000 + Math.random() * 9000)}`;

    const newTenant: TenantCompany = {
      id: tenantId,
      code: tenantCode,
      nameAr: payload.companyNameAr.trim(),
      nameEn: payload.companyNameEn?.trim(),
      taxNumber: payload.taxNumber?.trim(),
      backendConfig: payload.backendConfig,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    // Save Tenant
    const saveTenantRes = await this.port.saveTenant(newTenant, `${payload.idempotencyKey}-tenant`);
    if (!saveTenantRes.success) {
      return { success: false, error: saveTenantRes.error };
    }

    // STEP 4: Initialize Chart of Accounts (COA) based on template
    const accountsToSeed = payload.customAccountsOverride || template.initialChartOfAccounts;
    let seededAccountsCount = 0;

    for (const acc of accountsToSeed) {
      const accountRecord: Account = {
        code: acc.code,
        tenantId,
        nameAr: acc.nameAr,
        nameEn: acc.code,
        type: acc.type,
        nature: 'nature' in acc ? (acc as any).nature : (acc.type === 'ASSET' || acc.type === 'EXPENSE' ? 'DEBIT' : 'CREDIT'),
        currency: taxRule.currencyCode,
        debitBalance: 0,
        creditBalance: 0,
        balance: 0,
        isActive: true,
        status: 'ACTIVE',
        isParent: false,
      };
      const accRes = await this.port.saveAccount(tenantId, accountRecord, `${payload.idempotencyKey}-acc-${acc.code}`);
      if (accRes.success) {
        seededAccountsCount++;
      }
    }

    // STEP 5: Enable Template Modules (Phase 2H)
    const modulesToEnable = payload.customModulesOverride || template.defaultModules;
    const moduleManifests: TenantModuleManifest[] = modulesToEnable.map((modId) => {
      const reg = MODULE_REGISTRY[modId];
      return {
        tenantId,
        moduleId: modId,
        moduleNameAr: reg ? reg.nameAr : modId,
        isEnabled: true,
        activatedAt: new Date().toISOString(),
      };
    });

    await this.port.enableTenantModules(tenantId, moduleManifests, `${payload.idempotencyKey}-modules`);

    // STEP 6: Provision First Admin User
    const adminId = `usr-admin-${Date.now()}`;
    const passwordHash = await argon2.hash(payload.firstAdmin.password, { type: argon2.argon2id });
    const totpSecret = generateSecret();
    const encryptedTotp = EncryptionService.encryptPII(totpSecret);
    const backupCodes = EncryptionService.generateEmergencyBackupCodes();

    const firstAdminUser: User = {
      id: adminId,
      tenantId,
      username: payload.firstAdmin.username.trim().toLowerCase(),
      fullName: payload.firstAdmin.fullName.trim(),
      email: payload.firstAdmin.email.trim().toLowerCase(),
      role: 'SUPER_ADMIN',
      permissions: ['*'],
      status: 'ACTIVE',
      passwordHash,
      twoFactorSecret: encryptedTotp,
      twoFactorEnabled: false,
      backupCodes: backupCodes.hashedCodes,
      hashedBackupCodes: backupCodes.hashedCodes,
      requiresPasswordChange: true,
      createdAt: new Date().toISOString(),
    };

    await this.port.saveUser(firstAdminUser, `${payload.idempotencyKey}-admin`);

    // STEP 7: Cryptographic Audit & SystemChangeLog
    const auditService = new AuditChainService(this.port);
    await auditService.recordAuditEvent({
      tenantId,
      actorId: adminId,
      actorName: firstAdminUser.fullName,
      action: 'COMPANY_PROVISIONED',
      entityType: 'TENANT',
      entityId: tenantId,
      beforeState: null,
      afterState: {
        tenantCode,
        nameAr: newTenant.nameAr,
        countryCode: taxRule.countryCode,
        vatRate: taxRule.standardVatRate,
        templateId: template.id,
        modulesCount: moduleManifests.length,
        accountsCount: seededAccountsCount,
      },
    });

    const systemLog: SystemChangeLogEntry = {
      id: `SCL-WIZARD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: firstAdminUser.username,
      changeType: 'MIGRATION',
      module: 'TENANT_WIZARD',
      entitiesAffected: [`tenant:${tenantId}`, `user:${adminId}`],
      summaryAr: `تم بنجاح إنشاء وتفعيل شركة جديدة (${newTenant.nameAr}) بقالب (${template.nameAr}) وضريبة (${taxRule.standardVatRate * 100}%)`,
      beforeState: null,
      afterState: { tenantId, backendConfig: payload.backendConfig },
      evidenceRef: payload.idempotencyKey,
      version: '7.1',
    };
    await this.port.appendSystemChangeLog(systemLog);

    return {
      success: true,
      data: {
        tenant: newTenant,
        activityTemplate: {
          id: template.id,
          nameAr: template.nameAr,
          categoryAr: template.categoryAr,
        },
        taxRule: {
          countryCode: taxRule.countryCode,
          countryNameAr: taxRule.countryNameAr,
          standardVatRate: taxRule.standardVatRate,
          currencyCode: taxRule.currencyCode,
          taxAuthorityName: taxRule.taxAuthorityName,
        },
        enabledModules: moduleManifests,
        seededAccountsCount,
        firstAdmin: {
          id: firstAdminUser.id,
          username: firstAdminUser.username,
          fullName: firstAdminUser.fullName,
          email: firstAdminUser.email,
          role: firstAdminUser.role,
        },
      },
    };
  }
}
