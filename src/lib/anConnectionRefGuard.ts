/**
 * AN-SEC-SURFACE-1 — connection_ref must be the NAME of a DB connection env var, never a secret/app env var.
 */
const NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
const DENY_EXACT = new Set([
  'SESSION_SECRET', 'JWT_SECRET', 'APP_PEPPER', 'GEMINI_API_KEY', 'PLATFORM_ADMIN_PASSWORD',
  'PLATFORM_ADMIN_EMAIL', 'GOOGLE_APPLICATION_CREDENTIALS', 'NODE_ENV', 'PATH', 'HOME',
]);
const DENY_PREFIX = ['FIREBASE_', 'VITE_', 'GOOGLE_', 'AWS_', 'ANTHROPIC_', 'OPENAI_', 'GEMINI_'];

export function isSafeConnectionRef(ref: unknown): boolean {
  if (typeof ref !== 'string') return false;
  const r = ref.trim();
  if (!NAME_RE.test(r)) return false;
  if (DENY_EXACT.has(r)) return false;
  if (DENY_PREFIX.some((p) => r.startsWith(p))) return false;
  if (/(SECRET|PASSWORD|PEPPER|TOKEN|PRIVATE_KEY|API_KEY)/.test(r)) return false;
  return true;
}
