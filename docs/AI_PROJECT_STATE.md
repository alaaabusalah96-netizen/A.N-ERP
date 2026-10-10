# A.N ERP — PROJECT STATE (v7.2.0)

**Last update**: 2026-10-10 (SEC-2b)  
**Verdict**: **CONDITIONAL GO**

## SEC-2b
- RLS ENABLE+FORCE for: `an_stock_accounting_config`, `an_last_successful_logins`, `an_active_sessions`
- `get/saveStockAccountingConfig` → `withTenantScope` + `this.query`
- `recordSuccessfulLogin` scopes when `tenantId` present
- `listActiveSessions(tenantId)` scoped
- Probe: `scripts/verifySec2bRls.ts` (static + optional PG BYPASSRLS)

## Defects
| ID | Status |
|---|---|
| SEC-2 purchasing RLS | DONE |
| SEC-2b remaining tenant tables | **DONE** |
| Role BYPASSRLS in production | **CHECK** (see SEC2B_PG warning if any) |
| DEF-P2-002 | OPEN |
| FIX-J1 hardcodes | FIXED |

