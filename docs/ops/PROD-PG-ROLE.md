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

## Boot enforcement

When `AN_ENFORCE_PROD_ROLE=1` and `DATABASE_URL` is set, the server **refuses to start** if the connection role is `SUPERUSER` or `BYPASSRLS`.

```bash
# production / CI
export AN_ENFORCE_PROD_ROLE=1
export DATABASE_URL=postgresql://an_erp_app:...@.../an_erp
node server.cjs   # or npm start
```

Dev Studio with the default `postgres` superuser should leave `AN_ENFORCE_PROD_ROLE` unset (probe stays WARN-only).

## Pre-launch package (OPS-PROD-LAUNCH-1)

| Artifact | Purpose |
|---|---|
| `scripts/ops/create_an_erp_app_role.sql` | Create/alter `an_erp_app` with `NOSUPERUSER NOBYPASSRLS` |
| `scripts/ops/backup_before_launch.sh` | Manual `pg_dump -Fc` before launch |
| `docs/ops/PRE_LAUNCH_CHECKLIST.md` | Operator checklist |

These scripts **do not** change live roles by themselves; an operator must run them against the target database.
