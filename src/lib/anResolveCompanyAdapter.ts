/**
 * AN-ADAPTER-COMPANY-1 — map company backend settings → StoragePort via StorageRouter.resolveAdapter
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import type { StoragePort, TenantCompany } from '../an-core/storage/StoragePort';
import { companyToBackendConfig, type CompanyLike } from './anBridge';

export interface CompanyAdapterResolution {
  adapter: StoragePort;
  companyId: string;
  source: 'company_doc' | 'body_override' | 'process_primary';
  adapterType: string;
  isolationLevel: string;
  connectionRef: string;
}

export async function loadCompanyLikeFromFirestore(
  adminDb: any,
  companyId: string
): Promise<CompanyLike | null> {
  if (!adminDb || !companyId) return null;
  try {
    const snap = await adminDb.collection('companies').doc(companyId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return {
      id: companyId,
      auth_driver: data.auth_driver,
      db_backend: data.db_backend,
      isolation_level: data.isolation_level,
      connection_ref: data.connection_ref,
    } as CompanyLike;
  } catch {
    return null;
  }
}

/**
 * bodyBackend: optional partial from trusted admin migrate request (env ref names only).
 */
export function resolveCompanyStorageAdapter(
  router: StorageRouter,
  companyId: string,
  company: CompanyLike | null,
  bodyBackend?: Partial<CompanyLike> | null
): CompanyAdapterResolution {
  const cid = companyId.trim() || 'default';
  const merged: CompanyLike = {
    id: cid,
    auth_driver: bodyBackend?.auth_driver || company?.auth_driver,
    db_backend: bodyBackend?.db_backend || company?.db_backend,
    isolation_level: bodyBackend?.isolation_level || company?.isolation_level,
    connection_ref: bodyBackend?.connection_ref || company?.connection_ref,
  };

  const hasExplicit =
    !!(merged.db_backend || merged.isolation_level || merged.connection_ref);

  if (!hasExplicit) {
    const adapter = router.getPrimaryAdapter();
    return {
      adapter,
      companyId: cid,
      source: 'process_primary',
      adapterType: 'postgresql',
      isolationLevel: 'Shared',
      connectionRef: 'DATABASE_URL',
    };
  }

  const backendConfig = companyToBackendConfig(merged);
  const tenant: TenantCompany = {
    id: cid,
    code: cid,
    nameAr: cid,
    status: 'ACTIVE',
    backendConfig,
  };

  const adapter = router.resolveAdapter(tenant);
  return {
    adapter,
    companyId: cid,
    source: bodyBackend?.db_backend ? 'body_override' : 'company_doc',
    adapterType: backendConfig.adapterType,
    isolationLevel: backendConfig.isolationLevel,
    connectionRef: backendConfig.connectionRef || '',
  };
}
