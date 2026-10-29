# PostgreSQL app role without BYPASSRLS

## Why
If `DATABASE_URL` connects as a role with `rolbypassrls=true`, Row Level Security never applies and Shared multi-tenant isolation is ineffective.

## One-time setup
1. Connect as superuser to the application database.
2. Run `scripts/ops/create_an_erp_app_role.sql`.
3. Set a strong password for `an_erp_app` (psql `\password an_erp_app`).
4. Point application `DATABASE_URL` at:
   `postgresql://an_erp_app:***@host:5432/dbname`
5. Verify:
```sql
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname = current_user;
```
Expected: `rolsuper=false`, `rolbypassrls=false`.

## Optional probe
```bash
AN_PG_ROLE_PROBE=1 npx tsx scripts/ops/probePgRole.ts
```

## Studio / Google AI Studio
You cannot complete production DB grants from the app container alone. Run SQL on your managed Postgres (Neon/Supabase/Cloud SQL/etc.), then update the secret `DATABASE_URL`.
