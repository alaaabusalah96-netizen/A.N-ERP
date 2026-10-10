# A.N ERP AI Context

**A.N ERP (v7.2.0)**. Code + live `evidence/` supersede stale prose.

**Canonical audit files:** `AI_CONTEXT.md` · `docs/AI_PROJECT_STATE.md` · `docs/AI_PROJECT_STATE.json`

Last update: **EVID-1** on **2026-10-10** (restored audit runner; after P9).

## Verdict
| Field | Value |
|---|---|
| **Authoritative verdict** | **CONDITIONAL GO** |
| **Last fix** | EVID-1 — restore `runReconcileAuditB.ts` + `verifyF07StorageRouter.ts` (were 0 bytes) |
| **Security** | SEC-1 · SEC-2 · SEC-2b DONE |
| **Open** | DEF-P2-002 · production BYPASSRLS check |

Re-run live gates: `npx tsx scripts/runReconcileAuditB.ts` (refreshes REPORT + the three canonical files).