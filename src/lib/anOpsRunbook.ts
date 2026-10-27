/**
 * AN-OPS-E2 — machine-readable dual-path runbook metadata.
 */
export function getDualPathRunbook() {
  return {
    ok: true,
    plane: 'an-ops-e2' as const,
    dualPath: true,
    cutoverApproved: false,
    migrateAuthorized: false,
    operational: {
      loginPath: '/api/auth/verify-credentials',
      dataStore: 'firestore',
      uiShell: 'kemit-custodyflow',
    },
    checks: [
      { id: 'verify-merge', command: 'npm run verify:merge' },
      { id: 'verify-an-plane', command: 'npm run verify:an-plane' },
      { id: 'shadow', path: '/api/an/shadow/status' },
      { id: 'readiness', path: '/api/an/migration/readiness' },
      { id: 'live-check', path: '/api/an/data-plane/live-check' },
    ],
    docPath: 'docs/ops/DUAL_PATH_RUNBOOK.md',
  };
}
