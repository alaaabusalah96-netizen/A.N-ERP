# A.N ERP AI Context

**A.N ERP (v7.2.0)**. Code + `evidence/` are the source of truth.

Last update: **SEC-2b** on **2026-10-10** (after FIX-J1).

## Verdict
| Field | Value |
|---|---|
| **Authoritative verdict** | **CONDITIONAL GO** |
| **Last security** | SEC-2b — RLS on stock_accounting_config, last_successful_logins, active_sessions + GUC on config/session paths |
| **Prior** | SEC-1, SEC-2 (purchasing), FIX-J1 |
| **Open** | DEF-P2-002 · production role must not BYPASSRLS |

