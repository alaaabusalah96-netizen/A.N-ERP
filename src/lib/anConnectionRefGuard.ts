/**
 * connection_ref must be the NAME of a DB connection env var.
 * Keep in sync with CONNECTION_REF_PATTERN in src/an-core/storage/StorageRouter.ts (verifyAnSecAuth1 checks this).
 */
const PATTERN = /^DATABASE_URL(_[A-Z0-9_]{1,40})?$/;

export function isSafeConnectionRef(ref: unknown): boolean {
  return typeof ref === 'string' && PATTERN.test(ref.trim());
}
