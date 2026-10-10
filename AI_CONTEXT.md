# A.N ERP AI Context

**A.N ERP (v7.2.0)**. **Authoritative state sources (only these):**
1. `docs/AI_PROJECT_STATE.json` (machine)
2. `docs/AI_PROJECT_STATE.md` (human)
3. `AI_CONTEXT.md` (this file)
4. Live batteries under `evidence/` for the run that produced the numbers

**Stale / historical only (do not treat as current verdict):**
- `evidence/reconcile-audit-b/REPORT.md` — snapshot from Audit B **before** F2-S1-FIX / FIX-J1 / SEC-2b / P9
- `evidence/integrity/baseline-report.md` — older integrity baseline; many items superseded
- `evidence/repair/*` — historical repair logs

Last update: **Phase 9 (VAL-001)** on **2026-10-10** (after SEC-2b + FIX-J1).

## Verdict
| Field | Value |
|---|---|
| **Authoritative verdict** | **CONDITIONAL GO** |
| **Last fix** | P9 — `validateJournalInput` on `POST /api/transactions/post` before numbering/draft |
| **Security** | SEC-1 · SEC-2 · SEC-2b DONE |
| **Accounting/stock** | FIX-J1 DONE (hardcoded COA codes removed) |
| **Open** | DEF-P2-002 · production DB role must not BYPASSRLS |
