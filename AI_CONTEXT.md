# A.N ERP AI Context

**A.N ERP (v7.2.0)**. Code + live `evidence/` supersede stale prose.

**Canonical files:** `AI_CONTEXT.md` · `docs/AI_PROJECT_STATE.md` · `docs/AI_PROJECT_STATE.json` — rendered from `docs/STATE_REGISTER.json` (edit that file by hand, then run `npm test`).

Last update: **2026-10-12** — FIX-P1-CUSTODY: expense voucher reversal restores custody balance exactly once

## Verdict
| Field | Value |
|---|---|
| **Authoritative verdict** | **NO GO** |
| **Rule** | NO GO = a critical gate failed or an OPEN P1 defect exists · CONDITIONAL GO = only open P2/P3 or configuration conditions · GO = none |
| **Gates this render** | not run (docs-only) |

## Open items
- **DEF-P2P-AUTOPOST-OFF** (P1, OPEN) — Supplier invoice approval is wrong under the default stock-accounting config (autoPostEnabled=false)
- **PROD-ROLE-BYPASSRLS** (P2, CONFIG) — The application database role may bypass RLS

Full register: `docs/AI_PROJECT_STATE.md`.
