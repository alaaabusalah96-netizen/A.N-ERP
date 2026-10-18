-- OPS-PROD-LAUNCH-1: application role subject to RLS (run once as DB admin / migrator)
-- Replace CHANGE_ME and database name before production use.
-- Do NOT use the postgres superuser as DATABASE_URL for the app.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'an_erp_app') THEN
    CREATE ROLE an_erp_app WITH LOGIN PASSWORD 'CHANGE_ME'
      NOSUPERUSER
      NOBYPASSRLS
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION;
  ELSE
    ALTER ROLE an_erp_app WITH NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE LOGIN;
  END IF;
END
$$;

-- Adjust database name if different from an_erp
GRANT CONNECT ON DATABASE an_erp TO an_erp_app;
GRANT USAGE ON SCHEMA public TO an_erp_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO an_erp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO an_erp_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO an_erp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO an_erp_app;

-- Optional: confirm
-- SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'an_erp_app';
