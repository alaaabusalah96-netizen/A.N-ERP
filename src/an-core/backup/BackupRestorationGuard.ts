/**
 * @file BackupRestorationGuard.ts
 * @description Phase 3H: Cross-Tenant Backup Restoration Isolation Guard
 * Structurally prevents restoring a tenant's backup into another tenant's environment.
 * Validates backendConfig compatibility (Shared vs Dedicated isolation, AdapterType).
 */

import crypto from 'crypto';
import { TenantCompany, BackendConfig, RFC7807Problem } from '../storage/StoragePort';

export interface BackupManifest {
  backupId: string;
  sourceTenantId: string;
  sourceTenantCode: string;
  backendConfig: BackendConfig;
  schemaVersion: string;
  exportedAt: string;
  checksum: string;
}

export interface TenantBackupBundle {
  manifest: BackupManifest;
  payload: {
    accounts: any[];
    journalEntries: any[];
    masterItems?: any[];
    masterPartners?: any[];
  };
}

export interface BackupValidationResult {
  valid: boolean;
  canRestore: boolean;
  sourceTenantId: string;
  targetTenantId: string;
  isolationMatch: boolean;
  adapterMatch: boolean;
  checksumValid: boolean;
  problem?: RFC7807Problem;
  messageAr: string;
}

export class BackupRestorationGuard {
  /**
   * Generates a signed backup bundle with cryptographic checksum.
   */
  public static createSignedBundle(
    tenant: TenantCompany,
    payload: TenantBackupBundle['payload']
  ): TenantBackupBundle {
    const payloadStr = JSON.stringify(payload);
    const checksum = crypto.createHash('sha256').update(payloadStr).digest('hex');

    return {
      manifest: {
        backupId: `BKP-${tenant.code}-${Date.now()}`,
        sourceTenantId: tenant.id,
        sourceTenantCode: tenant.code,
        backendConfig: { ...tenant.backendConfig },
        schemaVersion: 'v7.2',
        exportedAt: new Date().toISOString(),
        checksum,
      },
      payload,
    };
  }

  /**
   * Validates structural and security constraints before allowing a backup to be restored.
   */
  public static validateRestoration(
    targetTenant: TenantCompany,
    bundle: TenantBackupBundle
  ): BackupValidationResult {
    const { manifest, payload } = bundle;

    // Check 1: Cross-tenant restoration prohibition
    if (manifest.sourceTenantId !== targetTenant.id) {
      return {
        valid: false,
        canRestore: false,
        sourceTenantId: manifest.sourceTenantId,
        targetTenantId: targetTenant.id,
        isolationMatch: false,
        adapterMatch: false,
        checksumValid: false,
        problem: {
          type: 'https://api.an-erp.local/errors/cross-tenant-restore-forbidden',
          title: 'حظر استعادة النسخ الاحتياطي عبر حدود المستأجرين (Cross-Tenant Breach)',
          status: 403,
          detail: `محظور أمنياً: محاولة استعادة نسخة احتياطية تخص المستأجر (${manifest.sourceTenantId}) داخل بيئة المستأجر (${targetTenant.id}).`,
          invalidParams: [
            { name: 'sourceTenantId', reason: manifest.sourceTenantId },
            { name: 'targetTenantId', reason: targetTenant.id },
          ],
        },
        messageAr: 'فشل الفحص الأمني: لا يجوز استعادة نسخة مستأجر داخل مستأجر آخر قطيعاً.',
      };
    }

    // Check 2: Isolation level match (Shared vs Dedicated)
    const targetIso = targetTenant.backendConfig.isolationLevel;
    const backupIso = manifest.backendConfig.isolationLevel;
    const isolationMatch = targetIso === backupIso;

    if (!isolationMatch) {
      return {
        valid: false,
        canRestore: false,
        sourceTenantId: manifest.sourceTenantId,
        targetTenantId: targetTenant.id,
        isolationMatch: false,
        adapterMatch: manifest.backendConfig.adapterType === targetTenant.backendConfig.adapterType,
        checksumValid: false,
        problem: {
          type: 'https://api.an-erp.local/errors/isolation-level-mismatch',
          title: 'عدم تطابق مستوى العزل البنيوي للنسخة الاحتياطية',
          status: 409,
          detail: `لا يمكن استعادة نسخة احتياطية بمستوى عزل (${backupIso}) داخل بيئة مستأجر بمستوى عزل (${targetIso}).`,
          invalidParams: [
            { name: 'backupIsolation', reason: backupIso },
            { name: 'targetIsolation', reason: targetIso },
          ],
        },
        messageAr: 'فشل الفحص البنيوي: تعارض بين مستوى عزل النسخة ومستوى عزل بيئة التشغيل المستهدفة.',
      };
    }

    // Check 3: Adapter type match
    const targetAdapter = targetTenant.backendConfig.adapterType;
    const backupAdapter = manifest.backendConfig.adapterType;
    const adapterMatch = targetAdapter === backupAdapter;

    if (!adapterMatch) {
      return {
        valid: false,
        canRestore: false,
        sourceTenantId: manifest.sourceTenantId,
        targetTenantId: targetTenant.id,
        isolationMatch: true,
        adapterMatch: false,
        checksumValid: false,
        problem: {
          type: 'https://api.an-erp.local/errors/adapter-type-mismatch',
          title: 'عدم تطابق محرك التخزين للنسخة الاحتياطية',
          status: 409,
          detail: `النسخة الاحتياطية مصممة لمحرك (${backupAdapter}) بينما بيئة المستأجر تعمل بمحرك (${targetAdapter}).`,
          invalidParams: [
            { name: 'backupAdapter', reason: backupAdapter },
            { name: 'targetAdapter', reason: targetAdapter },
          ],
        },
        messageAr: 'فشل الفحص: عدم تطابق محرك التخزين بين النسخة والبيئة المستهدفة.',
      };
    }

    // Check 4: Checksum integrity
    const payloadStr = JSON.stringify(payload);
    const calculatedChecksum = crypto.createHash('sha256').update(payloadStr).digest('hex');
    const checksumValid = calculatedChecksum === manifest.checksum;

    if (!checksumValid) {
      return {
        valid: false,
        canRestore: false,
        sourceTenantId: manifest.sourceTenantId,
        targetTenantId: targetTenant.id,
        isolationMatch: true,
        adapterMatch: true,
        checksumValid: false,
        problem: {
          type: 'https://api.an-erp.local/errors/backup-checksum-invalid',
          title: 'فشل التحقق من سلامة البصمة الرقمية للنسخة الاحتياطية',
          status: 400,
          detail: 'ملف النسخة الاحتياطية تالف أو تم التلاعب به؛ بصمة SHA256 لا تطابق البصمة المسجلة في البيان.',
        },
        messageAr: 'فشل سلامة البيانات: البصمة الرقمية للنسخة الاحتياطية غير مطابقة.',
      };
    }

    return {
      valid: true,
      canRestore: true,
      sourceTenantId: manifest.sourceTenantId,
      targetTenantId: targetTenant.id,
      isolationMatch: true,
      adapterMatch: true,
      checksumValid: true,
      messageAr: 'تم اجتياز جميع الفحوصات الأمنية والبنيوية بنجاح: النسخة متوافقة ومعزولة وجاهزة للاستعادة.',
    };
  }
}
