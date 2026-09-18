/**
 * @file StorageRouter.ts
 * @description Storage Router & Tenant BackendConfig Resolver for A.N ERP (v7.1 / Phase 2)
 * Strictly conforms to Section 2B, 4.3, 4.6, & 5.3.
 * Enforces adapter certification, secret reference protection, and isolation level routing (Shared vs Dedicated).
 */

import { StoragePort, TenantCompany, BackendConfig, StorageResult } from './StoragePort';
import { PostgresPrimaryAdapter } from './adapters/PostgresPrimaryAdapter';
import { InMemoryAdapter } from './adapters/InMemoryAdapter';
import { MySQLSmokeAdapter } from './adapters/MySQLSmokeAdapter';
import { MongoDBSmokeAdapter } from './adapters/MongoDBSmokeAdapter';
import { FirebaseSmokeAdapter } from './adapters/FirebaseSmokeAdapter';

export interface BackendConfigMigrationContract {
  id: string;
  tenantId: string;
  sourceConfig: BackendConfig;
  targetConfig: BackendConfig;
  status: 'PROPOSED' | 'SCHEMA_PREPARED' | 'DATA_TRANSFERRING' | 'VALIDATING' | 'COMMITTED' | 'ROLLED_BACK';
  requestedBy: string;
  justificationAr: string;
  createdAt: string;
  committedAt?: string;
  evidenceRef?: string;
}

export class StorageRouter {
  private primaryAdapter: PostgresPrimaryAdapter;
  private devInMemoryAdapter: InMemoryAdapter;
  private dedicatedAdapters = new Map<string, StoragePort>();
  private migrations = new Map<string, BackendConfigMigrationContract[]>();

  // Only adapters that have passed the Full Battery Test can be selected for real companies
  // Postgres passed Phase 0 / Phase 1 full battery with 100% PASS
  private certifiedAdapters = new Set<string>(['postgresql']);

  constructor() {
    this.primaryAdapter = new PostgresPrimaryAdapter();
    this.devInMemoryAdapter = new InMemoryAdapter();
  }

  public getPrimaryAdapter(): PostgresPrimaryAdapter {
    return this.primaryAdapter;
  }

  public getDevInMemoryAdapter(): InMemoryAdapter {
    return this.devInMemoryAdapter;
  }

  /**
   * Checks if an adapterType is certified via Full Battery execution.
   */
  public isAdapterCertified(adapterType: string): boolean {
    return this.certifiedAdapters.has(adapterType.toLowerCase());
  }

  /**
   * Validates tenant backendConfig according to Phase 2B rules:
   * 1. adapterType must be certified (rejects MySQL / MongoDB / Firebase if only Smoke tested)
   * 2. connectionRef must be a secret reference (env var or secret manager key), NEVER an exposed connection string
   * 3. isolationLevel must be 'Shared' or 'Dedicated'
   */
  public validateBackendConfig(config: BackendConfig): { valid: boolean; errorDetailAr?: string } {
    if (!config) {
      return { valid: false, errorDetailAr: 'إعدادات التخزين backendConfig إلزامية.' };
    }

    const { adapterType, connectionRef, isolationLevel } = config;

    // Rule 1: Adapter certification
    if (adapterType !== 'inmemory' && !this.isAdapterCertified(adapterType)) {
      return {
        valid: false,
        errorDetailAr: `الـ Adapter المختار (${adapterType}) ما زال في وضع فحص الاتصال الأولي (Smoke Test) فقط من المرحلة 0 ولم يستوفِ البطارية الكاملة للاعتماد الإنتاجي. الـ Adapter المعتمد حالياً فقط: PostgreSQL (Primary).`,
      };
    }

    // Rule 2: connectionRef secrecy — must NOT be a raw connection string
    if (!connectionRef || connectionRef.trim() === '') {
      return {
        valid: false,
        errorDetailAr: 'مرجع الاتصال connectionRef إلزامي.',
      };
    }

    const rawLower = connectionRef.toLowerCase().trim();
    if (
      rawLower.includes('://') ||
      rawLower.includes('password=') ||
      rawLower.includes('mongodb+srv') ||
      rawLower.includes('postgres:') ||
      rawLower.includes('@')
    ) {
      return {
        valid: false,
        errorDetailAr: 'ممنوع إدراج نص اتصال صريح (Connection String) في backendConfig.connectionRef منعاً لتسريب الأسرار. يجب تمرير اسم المتغير فقط (مثل: DATABASE_URL أو DATABASE_URL_CUSTOM).',
      };
    }

    // Rule 3: Isolation level
    if (isolationLevel !== 'Shared' && isolationLevel !== 'Dedicated') {
      return {
        valid: false,
        errorDetailAr: 'مستوى العزل يجب أن يكون إما Shared (مشترك مع عزل تقني RLS) أو Dedicated (مخصص باتصال منفصل).',
      };
    }

    return { valid: true };
  }

  /**
   * Factory method to create or resolve a storage adapter instance by adapterType.
   */
  public createAdapterByType(adapterType: string, connectionString?: string): StoragePort {
    const type = adapterType.toLowerCase();
    switch (type) {
      case 'postgresql':
        return new PostgresPrimaryAdapter(connectionString);
      case 'inmemory':
        return this.devInMemoryAdapter;
      case 'mysql':
        return new MySQLSmokeAdapter(connectionString);
      case 'mongodb':
        return new MongoDBSmokeAdapter(connectionString);
      case 'firebase':
        return new FirebaseSmokeAdapter(connectionString);
      default:
        return new PostgresPrimaryAdapter(connectionString);
    }
  }

  /**
   * Resolves storage adapter based on tenant backendConfig:
   * { adapterType, connectionRef, isolationLevel }
   */
  public resolveAdapter(tenant?: TenantCompany): StoragePort {
    if (!tenant || !tenant.backendConfig) {
      return this.primaryAdapter;
    }

    const { adapterType, connectionRef, isolationLevel } = tenant.backendConfig;

    if (adapterType === 'inmemory') {
      return this.devInMemoryAdapter;
    }

    // If Dedicated isolation is requested:
    if (isolationLevel === 'Dedicated') {
      return this.getOrCreateDedicatedAdapter(tenant.id, adapterType, connectionRef);
    }

    // Shared isolation routes to Primary with tenant_id RLS
    if (adapterType === 'postgresql') {
      return this.primaryAdapter;
    }

    // Verify certification for Shared isolation
    if (!this.isAdapterCertified(adapterType)) {
      throw new Error(
        `الـ Adapter المختار (${adapterType}) غير معتمد إنتاجياً حتى الآن. يتطلب اجتياز البطارية الكاملة قبل تشغيل أي شركة حقيقية عليه.`
      );
    }

    return this.createAdapterByType(adapterType, process.env[connectionRef]);
  }

  /**
   * Retrieves or creates a dedicated adapter instance for Dedicated isolation tenants.
   */
  private getOrCreateDedicatedAdapter(tenantId: string, adapterType: string, connectionRef: string): StoragePort {
    if (!connectionRef || !process.env[connectionRef]) {
      throw new Error(
        `مرجع اتصال المخزن المخصص لهذه الشركة (${connectionRef || 'غير محدد'}) غير مُهيأ في متغيرات البيئة — تعذّر تنفيذ العملية.`
      );
    }
    const key = `${tenantId}:${connectionRef}`;
    let adapter = this.dedicatedAdapters.get(key);
    if (!adapter) {
      const connectionString = process.env[connectionRef];
      adapter = this.createAdapterByType(adapterType, connectionString);
      this.dedicatedAdapters.set(key, adapter);
    }
    return adapter;
  }

  /**
   * Registers that an adapter has passed the Full Battery Test and is certified.
   */
  public certifyAdapter(adapterType: string): void {
    this.certifiedAdapters.add(adapterType.toLowerCase());
  }

  /**
   * Proposes a formal migration contract when migrating tenant storage (Phase 2B / Phase 4).
   * No silent switching permitted!
   */
  public proposeMigration(
    tenantId: string,
    targetConfig: BackendConfig,
    requestedBy: string,
    justificationAr: string
  ): StorageResult<BackendConfigMigrationContract> {
    const validation = this.validateBackendConfig(targetConfig);
    if (!validation.valid) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-migration-config',
          title: 'إعدادات الهجرة غير صالحة',
          status: 400,
          detail: validation.errorDetailAr || 'فشل التحقق من إعدادات المخزن المستهدف.',
        },
      };
    }

    const contract: BackendConfigMigrationContract = {
      id: `MIG-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
      sourceConfig: {
        adapterType: 'postgresql',
        connectionRef: 'DATABASE_URL',
        isolationLevel: 'Shared',
      },
      targetConfig,
      status: 'PROPOSED',
      requestedBy,
      justificationAr,
      createdAt: new Date().toISOString(),
    };

    const list = this.migrations.get(tenantId) || [];
    list.push(contract);
    this.migrations.set(tenantId, list);

    return { success: true, data: contract };
  }

  public getPendingMigrations(tenantId: string): BackendConfigMigrationContract[] {
    return this.migrations.get(tenantId) || [];
  }
}

export const globalStorageRouter = new StorageRouter();
