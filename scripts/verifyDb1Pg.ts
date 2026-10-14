/**
 * DB-1 — real PostgreSQL gate. Needs DATABASE_URL, otherwise PG_NOT_RUN (exit 3) and DB-1 is NOT proven.
 * Run: npx tsx scripts/verifyDb1Pg.ts
 * Uses a throw-away tenant (scripts/lib/testTenant.ts) that is removed at the end.
 */
import dotenv from 'dotenv';
dotenv.config();
import { SCHEMA_MIGRATIONS } from '../src/core/migrations/registry';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('PG_NOT_RUN: DATABASE_URL missing. DB-1 is NOT proven on PostgreSQL.');
    process.exit(3);
  }
  const { createTempTenant } = await import('./lib/testTenant');
  const t = await createTempTenant({ seedChart: false });
  try {
    const one = async (sql: string, params: any[] = []) => (await t.sql(sql, params)).rows;

    const reg = await one(`SELECT to_regclass('an_audit_trail') AS a, to_regclass('an_custom_fields') AS c`);
    check('G1 an_audit_trail exists in the live schema', !!reg[0]?.a);
    check('G2 an_custom_fields exists in the live schema', !!reg[0]?.c);

    const mig = SCHEMA_MIGRATIONS.find(m => m.version === '20261014_001');
    const names = (mig?.sql || '').match(/ix_[a-z0-9_]+/g) || [];
    const have = new Set((await one(`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()`)).map((r: any) => r.indexname));
    const missing = names.filter(n => !have.has(n));
    check('G3 all 21 DB-1 indexes exist', names.length === 21 && missing.length === 0, missing.join(','));
    const applied = await one(`SELECT 1 FROM an_schema_migrations WHERE version = '20261014_001'`);
    check('G4 migration 20261014_001 is recorded', applied.length === 1);

    const rls = await one(`SELECT relrowsecurity AS r, relforcerowsecurity AS f FROM pg_class WHERE relname = 'an_audit_trail'`);
    check('G5 RLS enabled and forced on an_audit_trail', rls[0]?.r === true && rls[0]?.f === true);

    const mk = (id: string, ts: string) => ({ id, tenantId: t.tenantId, actorId: 'u1', actorName: 'U', action: 'DB1', entityType: 'T', entityId: 'e', details: { k: 1 }, ipAddress: '127.0.0.1', timestamp: ts });
    const s1 = await t.storage.withTenantScope(t.tenantId, () => t.storage.saveAuditRecord(mk(t.uid('AUD'), '2026-10-14T10:00:00.000Z')));
    const s2 = await t.storage.withTenantScope(t.tenantId, () => t.storage.saveAuditRecord(mk(t.uid('AUD'), '2026-10-14T11:00:00.000Z')));
    check('G6 saveAuditRecord succeeds twice', s1.success === true && s2.success === true, JSON.stringify((s1 as any).error || (s2 as any).error || ''));
    const g = await t.storage.withTenantScope(t.tenantId, () => t.storage.getAuditRecords(t.tenantId, 10));
    const data = (g as any).data || [];
    check('G7 getAuditRecords returns both, newest first', g.success === true && data.length === 2 && data[0].timestamp > data[1].timestamp, `n=${data.length}`);
    const g1 = await t.storage.withTenantScope(t.tenantId, () => t.storage.getAuditRecords(t.tenantId, 1));
    check('G8 limit is honoured', ((g1 as any).data || []).length === 1);
  } finally {
    await t.cleanup();
  }
  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
