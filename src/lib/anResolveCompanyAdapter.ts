/**
 * AN-ADAPTER-FAIL-CLOSED-1 — map company backend settings → StoragePort via StorageRouter.resolveAdapter
 * Refuses silent primary fallback on company load errors when fail-closed is enabled.
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import type { StoragePort, TenantCompany } from '../an-core/storage/StoragePort';
import { companyToBackendConfig, type CompanyLike } from './anBridge';
export type { CompanyLike };

export type CompanyLoadResult =
  | { status: 'loaded'; company: CompanyLike }
  | { status: 'not_found' }
  | { status: 'error'; message: string }
  | { status: 'skipped'; reason: 'no_admin_db' | 'empty_company_id' };

export interface CompanyAdapterResolution {
  adapter: StoragePort;
  companyId: string;
  source: 'company_doc' | 'body_override' | 'process_primary';
  adapterType: string;
  isolationLevel: string;
  connectionRef: string;
  companyDoc?: 'loaded' | 'missing' | 'error' | 'skipped';
  failClosed?: boolean;
}

export async function loadCompanyLikeFromFirestore(
  adminDb: any,
  companyId: string
): Promise<CompanyLoadResult> {
  if (!companyId?.trim()) return { status: 'skipped', reason: 'empty_company_id' };
  if (!adminDb) return { status: 'skipped', reason: 'no_admin_db' };
  try {
    const snap = await adminDb.collection('companies').doc(companyId).get();
    if (!snap.exists) return { status: 'not_found' };
    const data = snap.data() || {};
    return {
      status: 'loaded',
      company: {
        id: companyId,
        auth_driver: data.auth_driver,
        db_backend: data.db_backend,
        isolation_level: data.isolation_level,
        connection_ref: data.connection_ref,
      } as CompanyLike,
    };
  } catch (e: any) {
    return {
      status: 'error',
      message: (e?.message || String(e)).slice(0, 200),
    };
  }
}

export function isAdapterFailClosedEnv(env = process.env): boolean {
  return env.AN_ADAPTER_FAIL_CLOSED !== '0' && env.AN_ADAPTER_FAIL_CLOSED !== 'false';
}

/**
 * bodyBackend: optional partial from trusted admin migrate request (env ref names only).
 */
export function resolveCompanyStorageAdapter(
  router: StorageRouter,
  companyId: string,
  company: CompanyLike | null,
  bodyBackend?: Partial<CompanyLike> | null,
  options?: {
    loadStatus?: CompanyLoadResult['status'] | CompanyLoadResult;
    failClosed?: boolean;
    /** Write paths: company config must be 'loaded' unless an explicit backend is present. */
    requireLoaded?: boolean;
  }
): CompanyAdapterResolution {
  const failClosed =
    options?.failClosed === true ||
    (options?.failClosed !== false && isAdapterFailClosedEnv(process.env));

  const loadStatus =
    typeof options?.loadStatus === 'object'
      ? options.loadStatus.status
      : options?.loadStatus;

  if (loadStatus === 'error' && failClosed) {
    throw new Error(
      'ADAPTER_COMPANY_LOAD_FAILED: cannot resolve storage; refusing silent primary'
    );
  }

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
    // Gap (a): company config could not even be read (no admin db) -> unknown, not "shared".
    if (failClosed && loadStatus === 'skipped') {
      throw new Error(
        'ADAPTER_COMPANY_CONFIG_UNAVAILABLE: company config cannot be read; refusing silent primary'
      );
    }
    // Gap (b): write paths need a real company document (or an explicit backend).
    if (options?.requireLoaded === true && loadStatus !== 'loaded') {
      throw new Error(
        'ADAPTER_COMPANY_NOT_LOADED: write path requires an existing company config; refusing silent primary'
      );
    }
    const adapter = router.getPrimaryAdapter();
    const docMeta =
      loadStatus === 'not_found'
        ? 'missing'
        : loadStatus === 'skipped'
          ? 'skipped'
          : loadStatus === 'loaded'
            ? 'loaded'
            : 'missing';
    return {
      adapter,
      companyId: cid,
      source: 'process_primary',
      adapterType: 'postgresql',
      isolationLevel: 'Shared',
      connectionRef: 'DATABASE_URL',
      companyDoc: docMeta,
      failClosed,
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
    companyDoc: loadStatus === 'loaded' ? 'loaded' : 'missing',
    failClosed,
  };
}
