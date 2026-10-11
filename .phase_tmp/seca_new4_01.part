/**
 * @file runtimeSecurity.ts
 * @description Pure, testable runtime-security decisions used by server.ts (SEC-A).
 *  - CSP profile: strict by default in production (NODE_ENV=production) unless explicitly overridden.
 *  - trust proxy: never "trust everything"; explicit TRUST_PROXY, or exactly 1 hop on Cloud Run / AI Studio (K_SERVICE).
 *  - fuzz iterations: bounded.
 */
type Env = Record<string, string | undefined>;

export type CspProfile = 'production' | 'development';

/** Explicit CSP_PROFILE wins. Otherwise NODE_ENV=production => strict; anything else => development (Vite needs inline/eval). */
export function resolveCspProfile(env: Env): { profile: CspProfile; source: 'CSP_PROFILE' | 'NODE_ENV' | 'default'; warning?: string } {
  const isProd = (env.NODE_ENV || '').toLowerCase().trim() === 'production';
  const raw = (env.CSP_PROFILE || '').toLowerCase().trim();
  if (raw === 'production') return { profile: 'production', source: 'CSP_PROFILE' };
  if (raw === 'development') {
    return { profile: 'development', source: 'CSP_PROFILE', warning: isProd ? 'CSP_PROFILE=development in a NODE_ENV=production deployment: unsafe-inline/unsafe-eval are enabled and framing is allowed.' : undefined };
  }
  if (isProd) return { profile: 'production', source: 'NODE_ENV' };
  return { profile: 'development', source: 'default' };
}

/**
 * Express "trust proxy" value, or undefined (leave Express default = do not trust X-Forwarded-*).
 * TRUST_PROXY: "false"/"0" => off; digits => that many hops; "true" => 1 hop (never an unbounded chain); otherwise
 * passed through as an Express subnet list (e.g. "loopback, 10.0.0.0/8"). Without TRUST_PROXY, Cloud Run / AI Studio (K_SERVICE) => 1 hop.
 */
export function resolveTrustProxy(env: Env): { value: number | boolean | string | undefined; source: string } {
  const raw = (env.TRUST_PROXY ?? '').trim();
  if (env.TRUST_PROXY !== undefined && raw !== '') {
    const low = raw.toLowerCase();
    if (low === 'false' || low === '0') return { value: false, source: 'TRUST_PROXY' };
    if (/^\d+$/.test(raw)) return { value: Number(raw), source: 'TRUST_PROXY' };
    if (low === 'true') return { value: 1, source: 'TRUST_PROXY(true->1 hop)' };
    return { value: raw, source: 'TRUST_PROXY' };
  }
  if (env.K_SERVICE) return { value: 1, source: 'K_SERVICE(Cloud Run)' };
  return { value: undefined, source: 'default(off)' };
}

export const FUZZ_MAX_ITERATIONS = 5000;
export function parseFuzzIterations(raw: unknown): { ok: true; value: number } | { ok: false; max: number } {
  const n = raw === undefined || raw === null || raw === '' ? 1000 : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > FUZZ_MAX_ITERATIONS) return { ok: false, max: FUZZ_MAX_ITERATIONS };
  return { ok: true, value: n };
}
