# Production PostgreSQL role (SEC-4)

RLS in A.N ERP is only effective when the **application connection role** does **not** bypass it.

## Requirements
| Setting | Required |
|---|---|
| `NOSUPERUSER` | yes |
| `NOBYPASSRLS` (`rolbypassrls = false`) | yes |
| `LOGIN` | yes |
| Own DDL privileges | optional; prefer migrations run by a separate migrator role |

## Example (run as admin once)

```sql
CREATE ROLE an_erp_app WITH LOGIN PASSWORD 'CHANGE_ME' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT CONNECT ON DATABASE an_erp TO an_erp_app;
GRANT USAGE ON SCHEMA public TO an_erp_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO an_erp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO an_erp_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO an_erp_app;
```

Point `DATABASE_URL` at this role (not `postgres`).

## Verify

```bash
# informational (Studio/dev with superuser → WARN, still PASS)
npx tsx scripts/verifySec4ProdRole.ts

# strict (CI/production gate)
AN_ENFORCE_PROD_ROLE=1 npx tsx scripts/verifySec4ProdRole.ts
```

Expected strict result: `SEC4_PG: ROLE_SUBJECT_TO_RLS` and `Failed: 0`.

## Notes
- Policies use `current_setting('app.current_tenant_id', true)` via `withTenantScope`.
- A superuser or `BYPASSRLS` role will see all tenants' rows even when GUC is set.
