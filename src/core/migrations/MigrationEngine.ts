/**
 * DEF-P2-002: version-tracked schema migration engine for PostgreSQL.
 * Records applied versions in an_schema_migrations and runs pending ups in order.
 */
import { createHash } from 'node:crypto';

export interface MigrationDefinition {
  version: string;
  name: string;
  sql: string;
}

export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rowCount?: number | null; rows?: any[] }>;

export interface MigrationApplyResult {
  applied: string[];
  skipped: string[];
  already: string[];
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

export class MigrationEngine {
  constructor(private readonly migrations: MigrationDefinition[]) {
    const versions = migrations.map((m) => m.version);
    if (new Set(versions).size !== versions.length) {
      throw new Error('MigrationEngine: duplicate migration version ids');
    }
    const sorted = [...versions].sort();
    if (sorted.join('|') !== versions.join('|')) {
      throw new Error('MigrationEngine: migrations must be ordered by version ascending');
    }
  }

  public async ensureRegistry(query: QueryFn): Promise<void> {
    await query(`
      CREATE TABLE IF NOT EXISTS an_schema_migrations (
        version VARCHAR(64) PRIMARY KEY,
        name VARCHAR(256) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async listApplied(query: QueryFn): Promise<Set<string>> {
    await this.ensureRegistry(query);
    const r = await query(`SELECT version FROM an_schema_migrations ORDER BY version`);
    return new Set((r.rows || []).map((row: any) => String(row.version)));
  }

  public async applyPending(query: QueryFn): Promise<MigrationApplyResult> {
    await this.ensureRegistry(query);
    const applied = await this.listApplied(query);
    const result: MigrationApplyResult = { applied: [], skipped: [], already: [] };

    for (const m of this.migrations) {
      if (applied.has(m.version)) {
        result.already.push(m.version);
        continue;
      }
      const sum = checksum(m.sql);
      await query('BEGIN');
      try {
        await query(m.sql);
        await query(
          `INSERT INTO an_schema_migrations (version, name, checksum, applied_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (version) DO NOTHING`,
          [m.version, m.name, sum]
        );
        await query('COMMIT');
        result.applied.push(m.version);
      } catch (e) {
        try { await query('ROLLBACK'); } catch { /* ignore */ }
        throw e;
      }
    }
    return result;
  }
}
