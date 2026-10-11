# A.N ERP AI Context

**A.N ERP (v7.2.0)**. Code + live `evidence/` supersede stale prose.

**Canonical files:** `AI_CONTEXT.md` · `docs/AI_PROJECT_STATE.md` · `docs/AI_PROJECT_STATE.json` — rendered from `docs/STATE_REGISTER.json` (edit that file by hand, then run `npm test`).

Last update: **2026-10-11** — SEC-A + REPO-B (CSP default, trust proxy, per-tenant lockout, error hygiene, fuzz cap, test drift, repo cleanup, state register)

## Verdict
| Field | Value |
|---|---|
| **Authoritative verdict** | **NO GO** |
| **Rule** | NO GO = a critical gate failed or an OPEN P1 defect exists · CONDITIONAL GO = only open P2/P3 or configuration conditions · GO = none |
| **Gates this render** | 26/28 PASS, F07 PASS |

## Open items
- **DEF-CUSTODY-REVERSAL-DOUBLE-REFUND** (P1, OPEN) — Reversing a custody expense voucher restores the custody balance twice
- **DEF-P2P-AUTOPOST-OFF** (P1, OPEN) — Supplier invoice approval is wrong under the default stock-accounting config (autoPostEnabled=false)
- **PROD-ROLE-BYPASSRLS** (P2, CONFIG) — The application database role may bypass RLS

Full register: `docs/AI_PROJECT_STATE.md`.
