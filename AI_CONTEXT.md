# A.N ERP AI Context

**A.N ERP (v7.2.0)**. Code + live `evidence/` supersede stale prose.

**Canonical files:** `AI_CONTEXT.md` · `docs/AI_PROJECT_STATE.md` · `docs/AI_PROJECT_STATE.json` — rendered from `docs/STATE_REGISTER.json` (edit that file by hand, then run `npm test`).

Last update: **2026-10-14** — DOC-SYNC-FULL: align STATE_REGISTER + AI_* with code — DB-1, OPS-1, SEC-PROD-ROLE, SEC-1c (LoginScreen no fake clientGeo), stock-return guards already DONE; PROD-ROLE stays CONFIG

## Verdict
| Field | Value |
|---|---|
| **Authoritative verdict** | **CONDITIONAL GO** |
| **Rule** | NO GO = a critical gate failed or an OPEN P1 defect exists · CONDITIONAL GO = only open P2/P3 or configuration conditions · GO = none |
| **Gates this render** | not run (docs-only) |

## Open items
- **PROD-ROLE-BYPASSRLS** (P2, CONFIG) — The application database role may bypass RLS

Full register: `docs/AI_PROJECT_STATE.md`.
