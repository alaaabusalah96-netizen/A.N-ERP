/**
 * @file StorageRouter.ts
 * @description Storage Router & Tenant BackendConfig Resolver for A.N ERP (Phase 0)
 * Evaluates tenant.backendConfig and maps to appropriate StoragePort adapter.
 * In Phase 0, operational execution routes to Primary (PostgreSQL/Supabase).
 */

import { StoragePort, TenantCompany, BackendConfig } from './StoragePort';
import { PostgresPrimaryAdapter } from './adapters/PostgresPrimaryAdapter';
import { InMemoryAdapter } from './adapters/InMemoryAdapter';

export class StorageRouter {
  private primaryAdapter: PostgresPrimaryAdapter;
  private devInMemoryAdapter: InMemoryAdapter;

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
   * Resolves storage adapter based on tenant backendConfig:
   * { adapterType, connectionRef, isolationLevel }
   * Note: connectionRef points to the secret name in environment (e.g. 'DATABASE_URL').
   */
  public resolveAdapter(tenant?: TenantCompany): StoragePort {
    if (!tenant || !tenant.backendConfig) {
      return this.primaryAdapter;
    }

    const { adapterType } = tenant.backendConfig;

    switch (adapterType) {
      case 'postgresql':
        return this.primaryAdapter;
      case 'inmemory':
        return this.devInMemoryAdapter;
      case 'mysql':
      case 'mongodb':
      case 'firebase':
        // Per Phase 0 rules: Secondary adapters require Full Battery certification before running tenant production
        throw new Error(
          `الـ Adapter المختار (${adapterType}) اجتاز مرحلة Smoke Test فقط ولم يستوفِ البطارية الكاملة للتشغيل الإنتاجي بعد.`
        );
      default:
        return this.primaryAdapter;
    }
  }
}

export const globalStorageRouter = new StorageRouter();
