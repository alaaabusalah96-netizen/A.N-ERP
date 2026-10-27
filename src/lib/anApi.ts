/**
 * @file anApi.ts
 * @description MERGE-M4 — single namespace for A.N core HTTP surface.
 * All A.N endpoints MUST live under /api/an/*.
 * CustodyFlow endpoints stay under /api/auth, /api/admin, etc. — never duplicated under /api/an.
 */
export const AN_API_PREFIX = '/api/an' as const;

/** Catalog of mounted A.N routes (documentation + runtime discovery). */
export const AN_ROUTE_CATALOG = [
  {
    method: 'GET',
    path: '/api/an/storage-status',
    phase: 'M1',
    purpose: 'Probe StorageRouter / in-memory adapter health',
  },
  {
    method: 'POST',
    path: '/api/an/company-backend/:companyId',
    phase: 'M2',
    purpose: 'Validate and echo per-company BackendConfig binding',
  },
  {
    method: 'GET',
    path: '/api/an/auth-policy',
    phase: 'M3',
    purpose: 'Single login-path policy (firebase-session vs gated an-jwt)',
  },
  {
    method: 'GET',
    path: '/api/an/routes',
    phase: 'M4',
    purpose: 'List A.N API catalog (this registry)',
  },
  {
    method: 'GET',
    path: '/api/an/data-plane/status',
    phase: 'A1',
    purpose: 'Process-level A.N data plane probe (env ref presence, no secrets)',
  },
  {
    method: 'GET',
    path: '/api/an/data-plane/company/:companyId',
    phase: 'A2',
    purpose: 'Probe data plane using saved company backend fields (no secrets returned)',
  },
] as const;

export type AnRouteEntry = (typeof AN_ROUTE_CATALOG)[number];

/** Build a path under the A.N namespace (rejects escaping the prefix). */
export function anUrl(subPath: string): string {
  const cleaned = subPath.startsWith('/') ? subPath : `/${subPath}`;
  if (cleaned.startsWith('/api/') && !cleaned.startsWith(AN_API_PREFIX)) {
    throw new Error(`A.N client must not call non-AN prefix: ${cleaned}`);
  }
  if (cleaned.startsWith(AN_API_PREFIX)) return cleaned;
  return `${AN_API_PREFIX}${cleaned}`;
}

/** CustodyFlow auth/admin prefixes that must remain outside /api/an. */
export const CF_RESERVED_PREFIXES = [
  '/api/auth',
  '/api/admin',
  '/api/migrations',
  '/api/seed',
] as const;

export function isAnNamespace(path: string): boolean {
  return path === AN_API_PREFIX || path.startsWith(`${AN_API_PREFIX}/`);
}

export function assertAnNamespace(path: string): void {
  if (!isAnNamespace(path)) {
    throw new Error(`Path is outside A.N namespace: ${path}`);
  }
}
