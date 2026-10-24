/**
 * @file anBridge.ts
 * @description Starter bridge between CustodyFlow UI and A.N core (src/an-core).
 * Client-safe: imports ONLY types from an-core (no server code in the browser).
 * Later phases wire dbSetDoc / login through here. Phase 1 = probe only.
 */
import type {
  AdapterType,
  BackendConfig,
  IsolationLevel,
  StorageResult,
  TenantCompany,
} from '../an-core/storage/StoragePort';

export type { AdapterType, BackendConfig, IsolationLevel, StorageResult, TenantCompany };

export type AuthDriver = 'firebase' | 'an-jwt';

export const AN_CORE_VERSION = '7.2.0';

export interface CompanyBackendSettings {
  auth_driver: AuthDriver;
  db_backend: AdapterType;
}

/** Defaults keep existing Firebase path — A.N core is opt-in per company. */
export function getCompanyBackendSettings(
  company: { auth_driver?: AuthDriver; db_backend?: AdapterType } | null | undefined
): CompanyBackendSettings {
  return {
    auth_driver: company?.auth_driver ?? 'firebase',
    db_backend: company?.db_backend ?? 'firebase',
  };
}

/** Probes A.N core mounted on the server (GET /api/an/storage-status). */
export async function getAnStorageStatus(): Promise<{
  ok: boolean;
  adapterName?: string;
  tenants?: number;
  version?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/an/storage-status');
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, ...data };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'network error' };
  }
}
