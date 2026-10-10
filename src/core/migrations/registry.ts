/**
 * Ordered, version-tracked migrations (DEF-P2-002).
 * Keep SQL idempotent. Do not reorder applied versions.
 */
import type { MigrationDefinition } from './MigrationEngine';

export const SCHEMA_MIGRATIONS: MigrationDefinition[] = [
  {
    version: '20261010_001',
    name: 'journal_entries_unique_tenant_code',
    sql: `
CREATE UNIQUE INDEX IF NOT EXISTS uq_an_journal_entries_tenant_code
  ON an_journal_entries (tenant_id, code);
`.trim(),
  },
  {
    version: '20261010_002',
    name: 'schema_migrations_bootstrap_comment',
    sql: `
COMMENT ON TABLE an_schema_migrations IS 'DEF-P2-002 version-tracked schema migrations';
`.trim(),
  },
];
