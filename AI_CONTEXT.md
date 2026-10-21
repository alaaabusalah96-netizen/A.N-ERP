# A.N ERP AI Context

**A.N ERP (v7.2.0)**. Code + live `evidence/` supersede stale prose.

**Canonical files:** `AI_CONTEXT.md` · `docs/AI_PROJECT_STATE.md` · `docs/AI_PROJECT_STATE.json` — rendered from `docs/STATE_REGISTER.json` (edit that file by hand, then run `npm test`).

Last update: **2026-10-19** — FIX-REPORT-ASOF-1: trial balance uses getAccountBalanceAsOf posted lines by date (after PG-ENTITY-CLOSE-PERSIST-1, PG-XCOMPANY-PERSIST-1, PG-GROUP-ITEM-PERSIST-1, PG-GROUP-PERSIST-1, FIX-TENANT-SUSPEND-1, FIX-SESSION-REVOKE-1, UI-PLATFORM-HUB-1, UI-2FA-SETUP-1)

## Verdict
| Field | Value |
|---|---|
| **Authoritative verdict** | **CONDITIONAL GO** |
| **Rule** | NO GO = a critical gate failed or an OPEN P1 defect exists · CONDITIONAL GO = only open P2/P3 or configuration conditions · GO = none |
| **Gates this render** | not run (docs-only) |

## Open items
- **PROD-ROLE-BYPASSRLS** (P2, CONFIG) — The application database role may bypass RLS

Full register: `docs/AI_PROJECT_STATE.md`.
