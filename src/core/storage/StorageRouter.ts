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

interface DedicatedAdapterEntry {
  adapter: StoragePort;
  lastAccessedAt: number;
  initialized: boolean;
  initPromise?: Promise<any>;
}

export class StorageRouter {
  public static readonly MAX_DEDICATED_POOLS = 20;
  public static readonly DEFAULT_IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

  private primaryAdapter: PostgresPrimaryAdapter;
  private devInMemoryAdapter: InMemoryAdapter;
  private dedicatedAdapters = new Map<string, DedicatedAdapterEntry>();
  private migrations = new Map<string, BackendConfigMigrationContract[]>();
  private evictionTimer: NodeJS.Timeout | null = null;

  // Only adapters that have passed the Full Battery Test can be selected for real companies
  // Postgres passed Phase 0 / Phase 1 full battery with 100% PASS
  private certifiedAdapters = new Set<string>(['postgresql']);

  constructor() {
    this.primaryAdapter = new PostgresPrimaryAdapter();
    this.devInMemoryAdapter = new InMemoryAdapter();

    // 4.6E: Start periodic eviction check every 15 minutes (unreferenced to allow clean exit)
    this.evictionTimer = setInterval(() => {
      this.evictIdleAdapters().catch(() => {});
    }, 15 * 60 * 1000);
    if (this.evictionTimer && typeof this.evictionTimer.unref === 'function') {
      this.evictionTimer.unref();
    }
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
      if (!process.env.DATABASE_URL) {
        return this.devInMemoryAdapter;
      }
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
      if (!process.env.DATABASE_URL) {
        return this.devInMemoryAdapter;
      }
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
   * 4.6D: Auto-triggers schema initialization on creation.
   * 4.6E: Enforces maximum connection pool capacity (20) with LRU eviction.
   */
  private getOrCreateDedicatedAdapter(tenantId: string, adapterType: string, connectionRef: string): StoragePort {
    if (!connectionRef || !process.env[connectionRef]) {
      throw new Error(
        `مرجع اتصال المخزن المخصص لهذه الشركة (${connectionRef || 'غير محدد'}) غير مُهيأ في متغيرات البيئة — تعذّر تنفيذ العملية.`
      );
    }
    const key = `${tenantId}:${connectionRef}`;
    let entry = this.dedicatedAdapters.get(key);
    if (!entry) {
      // 4.6E: Enforce max dedicated pools cap by evicting LRU if at or over limit
      if (this.dedicatedAdapters.size >= StorageRouter.MAX_DEDICATED_POOLS) {
        this.evictOldestAdapterSync();
      }

      const connectionString = process.env[connectionRef];
      const adapter = this.createAdapterByType(adapterType, connectionString);

      // 4.6D: Auto-trigger initializeSchema upon first resolution
      let initPromise: Promise<any> | undefined;
      if (typeof (adapter as any).initializeSchema === 'function') {
        initPromise = (adapter as any).initializeSchema().then(() => {
          if (entry) entry.initialized = true;
        }).catch((err: any) => {
          this.dedicatedAdapters.delete(key);
          console.error(`[StorageRouter] Error initializing schema for dedicated tenant ${tenantId}: ${err?.message || err}`);
          throw err;
        });
        initPromise.catch(() => {}); // intentional: يمنع unhandledRejection؛ المنتظرون على initPromise يستلمون الرفض
      }

      entry = {
        adapter,
        lastAccessedAt: Date.now(),
        initialized: false,
        initPromise,
      };
      this.dedicatedAdapters.set(key, entry);
    } else {
      entry.lastAccessedAt = Date.now();
    }
    return entry.adapter;
  }

  /**
   * 4.6D: Asynchronous resolution that guarantees schema is initialized before returning.
   */
  public async resolveAdapterAsync(tenant?: TenantCompany): Promise<StoragePort> {
    const adapter = this.resolveAdapter(tenant);
    if (tenant?.backendConfig?.isolationLevel === 'Dedicated') {
      const key = `${tenant.id}:${tenant.backendConfig.connectionRef}`;
      const entry = this.dedicatedAdapters.get(key);
      if (entry) {
        if (entry.initPromise && !entry.initialized) {
          await entry.initPromise;
        } else if (!entry.initialized && typeof (adapter as any).initializeSchema === 'function') {
          try {
            await (adapter as any).initializeSchema();
            entry.initialized = true;
          } catch (err: any) {
            this.dedicatedAdapters.delete(key);
            throw err;
          }
        }
      }
    }
    return adapter;
  }

  /**
   * 4.6E: Evicts idle dedicated adapters not accessed within maxIdleMs (default 1 hour).
   * Gracefully ends database pool connections to prevent connection leaks.
   */
  public async evictIdleAdapters(maxIdleMs: number = StorageRouter.DEFAULT_IDLE_TIMEOUT_MS): Promise<number> {
    const now = Date.now();
    let evictedCount = 0;
    for (const [key, entry] of this.dedicatedAdapters.entries()) {
      if (now - entry.lastAccessedAt >= maxIdleMs) {
        if (typeof (entry.adapter as any).close === 'function') {
          try {
            await (entry.adapter as any).close();
          } catch (e) {}
        }
        this.dedicatedAdapters.delete(key);
        evictedCount++;
      }
    }
    return evictedCount;
  }

  /**
   * 4.6E: Synchronous helper to evict the oldest (LRU) dedicated adapter when cap is hit.
   */
  private evictOldestAdapterSync(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.dedicatedAdapters.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const entry = this.dedicatedAdapters.get(oldestKey);
      if (entry && typeof (entry.adapter as any).close === 'function') {
        try {
          (entry.adapter as any).close().catch(() => {});
        } catch (e) {}
      }
      this.dedicatedAdapters.delete(oldestKey);
    }
  }

  public getActiveDedicatedPoolsCount(): number {
    return this.dedicatedAdapters.size;
  }

  public getActiveDedicatedPoolCount(): number {
    return this.dedicatedAdapters.size;
  }

  public getMaxDedicatedPoolsLimit(): number {
    return StorageRouter.MAX_DEDICATED_POOLS;
  }

  public async closeAllDedicatedAdapters(): Promise<void> {
    for (const [key, entry] of this.dedicatedAdapters.entries()) {
      if (typeof (entry.adapter as any).close === 'function') {
        try {
          await (entry.adapter as any).close();
        } catch (e) {}
      }
    }
    this.dedicatedAdapters.clear();
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
