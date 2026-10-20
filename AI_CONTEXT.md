# A.N ERP AI Context

**A.N ERP (v7.2.0)**. Code + live `evidence/` supersede stale prose.

**Canonical files:** `AI_CONTEXT.md` · `docs/AI_PROJECT_STATE.md` · `docs/AI_PROJECT_STATE.json` — rendered from `docs/STATE_REGISTER.json` (edit that file by hand, then run `npm test`).

Last update: **2026-10-19** — UI-TRANSFERS-HUB-1: unified transfers UI internal vs xcompany backends (after UI-WAREHOUSE-CREATE-1, UI-LEDGER-DEPTH-1, UI-GROUP-REPORTS-1, UI-XCOMPANY-1, UI-ORG-GROUPS-1, UI-INV-CONFIG-1, UI-GOVERNANCE-1, UI-COMPANY-WIZARD-1, UI-COMPANY-SETTINGS-FIX)

## Verdict
| Field | Value |
|---|---|
| **Authoritative verdict** | **CONDITIONAL GO** |
| **Rule** | NO GO = a critical gate failed or an OPEN P1 defect exists · CONDITIONAL GO = only open P2/P3 or configuration conditions · GO = none |
| **Gates this render** | not run (docs-only) |

## Open items
- **PROD-ROLE-BYPASSRLS** (P2, CONFIG) — The application database role may bypass RLS

Full register: `docs/AI_PROJECT_STATE.md`.
