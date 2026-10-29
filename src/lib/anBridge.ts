/**
 * @file anBridge.ts
 * @description Bridge between CustodyFlow UI and A.N core (src/an-core).
 * Client-safe: imports ONLY types from an-core (no server adapters in the browser).
 * MERGE-M2: company backend binding (db_backend / isolation / connectionRef).
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

export const ALLOWED_DB_BACKENDS: AdapterType[] = [
  'firebase',
  'postgresql',
  'mysql',
  'mongodb',
  'inmemory',
];

export const ALLOWED_ISOLATION: IsolationLevel[] = ['Shared', 'Dedicated'];

export interface CompanyBackendSettings {
  auth_driver: AuthDriver;
  db_backend: AdapterType;
  isolation_level: IsolationLevel;
  /** Name of env/secret reference only — never raw credentials */
  connection_ref: string;
}

export type CompanyLike = {
  id?: string;
  auth_driver?: AuthDriver;
  db_backend?: AdapterType;
  isolation_level?: IsolationLevel;
  connection_ref?: string;
} | null | undefined;

/** Defaults keep existing Firebase path — A.N SQL backends are opt-in per company. */
export function getCompanyBackendSettings(company: CompanyLike): CompanyBackendSettings {
  const db = company?.db_backend && ALLOWED_DB_BACKENDS.includes(company.db_backend)
    ? company.db_backend
    : 'firebase';
  const isolation =
    company?.isolation_level && ALLOWED_ISOLATION.includes(company.isolation_level)
      ? company.isolation_level
      : 'Shared';
  let connection_ref = (company?.connection_ref || '').trim();
  if (!connection_ref) {
    if (db === 'postgresql') connection_ref = 'DATABASE_URL';
    else if (db === 'mysql') connection_ref = 'MYSQL_URL';
    else if (db === 'mongodb') connection_ref = 'MONGODB_URL';
    else connection_ref = '';
  }
  return {
    auth_driver: company?.auth_driver === 'an-jwt' ? 'an-jwt' : 'firebase',
    db_backend: db,
    isolation_level: isolation,
    connection_ref,
  };
}

export function validateCompanyBackendSettings(
  settings: CompanyBackendSettings
): { valid: boolean; errorAr?: string; errorEn?: string } {
  if (!ALLOWED_DB_BACKENDS.includes(settings.db_backend)) {
    return {
      valid: false,
      errorAr: 'نوع قاعدة البيانات غير مدعوم',
      errorEn: 'Unsupported db_backend',
    };
  }
  if (!ALLOWED_ISOLATION.includes(settings.isolation_level)) {
    return {
      valid: false,
      errorAr: 'مستوى العزل غير صالح',
      errorEn: 'Invalid isolation_level',
    };
  }
  if (settings.auth_driver !== 'firebase' && settings.auth_driver !== 'an-jwt') {
    return {
      valid: false,
      errorAr: 'محرك المصادقة غير صالح',
      errorEn: 'Invalid auth_driver',
    };
  }
  const needsRef =
    settings.db_backend === 'postgresql' ||
    settings.db_backend === 'mysql' ||
    settings.db_backend === 'mongodb';
  if (needsRef) {
    const ref = (settings.connection_ref || '').trim();
    if (!ref) {
      return {
        valid: false,
        errorAr: 'يجب تحديد اسم مرجع الاتصال (مثل DATABASE_URL) وليس كلمة السر نفسها',
        errorEn: 'connection_ref (env name) is required for SQL/document backends',
      };
    }
    if (ref.includes('://') || ref.includes('password') || ref.length > 128) {
      return {
        valid: false,
        errorAr: 'connection_ref يجب أن يكون اسم متغير بيئة فقط وليس سلسلة اتصال كاملة',
        errorEn: 'connection_ref must be an env var name, not a raw connection string',
      };
    }
  }
  return { valid: true };
}

/** Maps company settings to A.N StoragePort BackendConfig (server-side use). */
export function companyToBackendConfig(company: CompanyLike): BackendConfig {
  const s = getCompanyBackendSettings(company);
  return {
    adapterType: s.db_backend,
    connectionRef: s.connection_ref || 'DATABASE_URL',
    isolationLevel: s.isolation_level,
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

/** Resolve backend binding for a company id (server validates + echoes config). */
export async function resolveCompanyBackend(
  companyId: string,
  partial?: Partial<CompanyBackendSettings>
): Promise<{
  ok: boolean;
  settings?: CompanyBackendSettings;
  backendConfig?: BackendConfig;
  persisted?: boolean;
  persistError?: string | null;
  probe?: any;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/an/company-backend/${encodeURIComponent(companyId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(partial || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return {
      ok: true,
      ...data,
      persisted: data.persisted,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'network error' };
  }
}

export interface SessionPlaneClientResult {
  ok: boolean;
  companyId?: string;
  settings?: CompanyBackendSettings;
  probe?: {
    ok?: boolean;
    adapterType?: string;
    isolationLevel?: string;
    connectionRef?: string;
    envRefPresent?: boolean;
    certifiedNote?: string;
    errorEn?: string;
  };
  auth?: { activePath?: string; auth_driver?: string; reasonAr?: string };
  live?: { ok?: boolean; detail?: string; latencyMs?: number; skipped?: boolean } | null;
  loginPath?: string;
  error?: string;
}

/** B1 client: GET /api/an/session-plane */
export async function fetchSessionPlane(
  companyId?: string,
  opts?: { live?: boolean }
): Promise<SessionPlaneClientResult> {
  try {
    const q = new URLSearchParams();
    if (companyId) q.set('companyId', companyId);
    if (opts?.live) q.set('live', '1');
    const qs = q.toString();
    const res = await fetch(`/api/an/session-plane${qs ? `?${qs}` : ''}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error || res.statusText };
    }
    return {
      ok: !!data.ok,
      companyId: data.companyId,
      settings: data.settings,
      probe: data.probe,
      auth: data.auth,
      live: data.live ?? null,
      loginPath: data.loginPath,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export interface InventorySummaryClient {
  ok: boolean;
  source?: string;
  warehouseCount?: number | null;
  itemCount?: number | null;
  detail?: string;
  detailAr?: string;
  error?: string;
}

export async function fetchInventorySummary(companyId?: string): Promise<InventorySummaryClient> {
  try {
    const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    const res = await fetch(`/api/an/inventory/summary${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || res.statusText };
    return {
      ok: !!data.ok,
      source: data.source,
      warehouseCount: data.warehouseCount,
      itemCount: data.itemCount,
      detail: data.detail,
      detailAr: data.detailAr,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export interface AccountingSummaryClient {
  ok: boolean;
  source?: string;
  accountCount?: number | null;
  journalCount?: number | null;
  detail?: string;
  detailAr?: string;
  error?: string;
}

export async function fetchAccountingSummary(companyId?: string): Promise<AccountingSummaryClient> {
  try {
    const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    const res = await fetch(`/api/an/accounting/summary${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || res.statusText };
    return {
      ok: !!data.ok,
      source: data.source,
      accountCount: data.accountCount,
      journalCount: data.journalCount,
      detail: data.detail,
      detailAr: data.detailAr,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export interface PurchasingSummaryClient {
  ok: boolean;
  source?: string;
  purchaseOrderCount?: number | null;
  goodsReceiptCount?: number | null;
  purchaseRequestCount?: number | null;
  detail?: string;
  detailAr?: string;
  error?: string;
}

export async function fetchPurchasingSummary(companyId?: string): Promise<PurchasingSummaryClient> {
  try {
    const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    const res = await fetch(`/api/an/purchasing/summary${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || res.statusText };
    return {
      ok: !!data.ok,
      source: data.source,
      purchaseOrderCount: data.purchaseOrderCount,
      goodsReceiptCount: data.goodsReceiptCount,
      purchaseRequestCount: data.purchaseRequestCount,
      detail: data.detail,
      detailAr: data.detailAr,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function fetchModulesOverview(companyId?: string): Promise<any> {
  try {
    const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    const res = await fetch(`/api/an/modules/overview${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || res.statusText };
    return data;
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function fetchShadowStatus(companyId?: string): Promise<any> {
  try {
    const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    const res = await fetch(`/api/an/shadow/status${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || res.statusText };
    return data;
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function fetchEntityMap(): Promise<any> {
  try {
    const res = await fetch('/api/an/map/entities');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || res.statusText };
    return data;
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function fetchMigrationReadiness(companyId?: string): Promise<any> {
  try {
    const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    const res = await fetch(`/api/an/migration/readiness${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || res.statusText };
    return data;
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function fetchOpsRunbook(): Promise<any> {
  try {
    const res = await fetch('/api/an/ops/runbook');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || res.statusText };
    return data;
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function fetchInventoryMigrateDryRun(companyId?: string): Promise<any> {
  try {
    const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    const res = await fetch(`/api/an/migrate/inventory/dry-run${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || res.statusText };
    return data;
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}



