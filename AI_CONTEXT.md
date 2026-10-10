# A.N ERP AI Context

Authoritative codebase **A.N ERP (v7.2.0)**.

Consult `docs/AI_PROJECT_STATE.md` and `docs/AI_PROJECT_STATE.json`.

**Rule:** Code + `evidence/` supersede stale prose. Last update: **FIX-J1** on **2026-10-10**.

## Verdict
| Field | Value |
|---|---|
| **Authoritative verdict** | **CONDITIONAL GO** |
| **Last fix** | FIX-J1 (count/return journals → StockAccountingConfig + COA 1105/5101/5209/4203/2101) |
| **Open defect** | DEF-P2-002 (migration engine) |
| **F2Decisions** | PASS 51/0 |
| **F-07** | PASS |

Do not treat hard-coded legacy account codes 520101/110301 as current — removed by FIX-J1.
