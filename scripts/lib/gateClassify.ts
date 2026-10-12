/**
 * Pure helpers for scripts/runReconcileAuditB.ts (so they can be unit-tested).
 * A gate that failed ONLY because the database could not be reached/authenticated is SKIP (not run), never a code failure.
 * A gate with any other failing line stays FAIL, even if it also mentions a database problem elsewhere.
 */
export type GateStatus = 'PASS' | 'FAIL' | 'SKIP' | 'ERROR';
export const DB_UNAVAILABLE_RX = /password authentication failed|PG_NOT_RUN|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo|no pg_hba\.conf|connection (refused|terminated)|timeout expired|database "[^"]*" does not exist/i;

export function failsOnlyOnDb(out: string): boolean {
  const fails = out.split('\n').filter(l => /\[FAIL\]/.test(l));
  return fails.length > 0 && fails.every(l => DB_UNAVAILABLE_RX.test(l));
}

export function classifyGate(i: { code: number; out: string; passed: number | null; failed: number | null; expected?: number }): GateStatus {
  if (i.code === 127 || i.out.startsWith('SKIP')) return 'SKIP';
  if (i.failed !== null && i.failed > 0) return failsOnlyOnDb(i.out) ? 'SKIP' : 'FAIL';
  if (i.out.includes('PG_NOT_RUN') && i.passed === null) return 'SKIP';
  if (i.failed === 0 && i.passed !== null) return i.expected !== undefined && i.passed !== i.expected ? 'FAIL' : 'PASS';
  return i.code === 0 ? 'PASS' : 'ERROR';
}

/** NO_GO: a critical gate failed or an OPEN P1 exists. CONDITIONAL_GO: open P2/P3/config OR a critical gate was skipped. GO: none. */
export function decideVerdict(i: { criticalFail: boolean; openP1: number; openOther: number; skippedCritical: number }): 'NO_GO' | 'CONDITIONAL_GO' | 'GO' {
  if (i.criticalFail || i.openP1 > 0) return 'NO_GO';
  return i.openOther > 0 || i.skippedCritical > 0 ? 'CONDITIONAL_GO' : 'GO';
}
