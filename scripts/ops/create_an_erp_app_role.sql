-- AN-FIX-PG-ROLE-1
-- Run as a superuser on the TARGET database once.
-- Replace passwords out-of-band; do not commit secrets.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'an_erp_app') THEN
    CREATE ROLE an_erp_app LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS
      CONNECTION LIMIT 50;
  ELSE
    ALTER ROLE an_erp_app WITH
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOBYPASSRLS;
  END IF;
END
$$;

-- Grant connect on current DB (run while connected to the app database):
-- GRANT CONNECT ON DATABASE current_database() TO an_erp_app;
GRANT USAGE ON SCHEMA public TO an_erp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO an_erp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO an_erp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO an_erp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO an_erp_app;

-- Force RLS awareness reminder (policies must already exist for tenant columns):
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY;

COMMENT ON ROLE an_erp_app IS 'AN-FIX-PG-ROLE-1: app role without BYPASSRLS for multi-tenant Shared isolation';
