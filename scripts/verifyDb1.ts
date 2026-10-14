/**
 * DB-1 — live schema completeness + tenant-led indexes (no database needed).
 * Run: npx tsx scripts/verifyDb1.ts
 * Static checks read the adapter DDL as text; the migration engine is exercised against an in-memory fake `query`.
 */
import fs from 'fs';
import { MigrationEngine } from '../src/core/migrations/MigrationEngine';
import { SCHEMA_MIGRATIONS } from '../src/core/migrations/registry';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const ADAPTER = 'src/core/storage/adapters/PostgresPrimaryAdapter.ts';
const adapter = fs.readFileSync(ADAPTER, 'utf8');
// the test-only DDL (getDdlScript) is NOT the live schema: cut it out
const a0 = adapter.indexOf('public getDdlScript');
const a1 = adapter.indexOf('`;\n  }\n', a0) + 6;
const testOnly = adapter.slice(a0, a1);
const live = adapter.slice(0, a0) + adapter.slice(a1);

const tablesOf = (text: string) => {
  const m = new Map<string, string>();
  for (const x of text.matchAll(/CREATE TABLE IF NOT EXISTS\s+(an_[a-z0-9_]+)\s*\(([\s\S]*?)\n\s*\)\s*;/g)) m.set(x[1], x[2]);
  return m;
};
const liveTables = tablesOf(live);
const columnsOf = (table: string) => {
  const cols = new Set<string>();
  for (const l of (liveTables.get(table) || '').split('\n')) {
    const w = l.trim().split(/\s+/)[0];
    if (w && !/^(--|PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|CHECK)/i.test(w)) cols.add(w.replace(/"/g, ''));
  }
  for (const x of live.matchAll(new RegExp(`ALTER TABLE\\s+${table}\\s+ADD COLUMN IF NOT EXISTS\\s+(\\w+)`, 'g'))) cols.add(x[1]);
  return cols;
};

const mig = SCHEMA_MIGRATIONS.find(m => m.version === '20261014_001');
const stmts = (mig?.sql || '').split('\n').map(s => s.trim()).filter(Boolean);
const parsed = stmts.map(s => {
  const m = /^CREATE INDEX IF NOT EXISTS (ix_[a-z0-9_]+) ON (an_[a-z0-9_]+) \((.+)\);$/.exec(s);
  return m ? { name: m[1], table: m[2], cols: m[3].split(',').map(c => c.trim()) } : null;
});

async function main() {
  // --- registry
  const versions = SCHEMA_MIGRATIONS.map(m => m.version);
  check('D1 registry versions unique and ascending', new Set(versions).size === versions.length && [...versions].sort().join('|') === versions.join('|'));
  check('D2 migration 20261014_001 present', !!mig);
  check('D3 exactly 21 statements', stmts.length === 21, `got ${stmts.length}`);
  check('D4 every statement is CREATE INDEX IF NOT EXISTS ix_… ON an_…', parsed.every(p => p !== null));
  const ok = parsed.filter(Boolean) as { name: string; table: string; cols: string[] }[];
  check('D5 index names unique and <= 63 chars', new Set(ok.map(p => p.name)).size === ok.length && ok.every(p => p.name.length <= 63));
  check('D6 every index leads with tenant_id', ok.every(p => p.cols[0] === 'tenant_id'));
  check('D7 every index table is created in the LIVE schema', ok.every(p => liveTables.has(p.table)), ok.filter(p => !liveTables.has(p.table)).map(p => p.table).join(','));
  const missingCols: string[] = [];
  for (const p of ok) {
    const cols = columnsOf(p.table);
    for (const c of p.cols) {
      const name = c.replace(/\s+(ASC|DESC)$/i, '').replace(/^lower\((\w+)\)$/i, '$1').replace(/"/g, '').trim();
      if (!cols.has(name)) missingCols.push(`${p.table}.${name}`);
    }
  }
  check('D8 every indexed column exists in its live table', missingCols.length === 0, missingCols.join(','));
  const engineAt = adapter.indexOf('new MigrationEngine(SCHEMA_MIGRATIONS)');
  const lateTables = ok.filter(p => { const i = live.search(new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${p.table}\\b`)); return i < 0 || i > engineAt; });
  check('D9 every index table is created BEFORE the migrations run', lateTables.length === 0, lateTables.map(p => p.table).join(','));

  // --- the two tables that used to exist only in the test-only DDL
  check('D10 an_audit_trail is created in the live schema', liveTables.has('an_audit_trail'));
  check('D11 an_custom_fields is created in the live schema', liveTables.has('an_custom_fields'));
  const rlsList = (live.match(/tables text\[\] := ARRAY\[([\s\S]*?)\];/) || [, ''])[1];
  check('D12 an_audit_trail is in the RLS table list', /'an_audit_trail'/.test(rlsList));
  check('D13 an_custom_fields is in the RLS table list', /'an_custom_fields'/.test(rlsList));
  const onlyTest = [...tablesOf(testOnly).keys()].filter(t => !liveTables.has(t));
  const usedLive = onlyTest.filter(t => new RegExp(`\\b${t}\\b`).test(live));
  check('D14 no table used by live code exists only in the test-only DDL', usedLive.length === 0, usedLive.join(','));
  check('D15 live an_audit_trail has the columns saveAuditRecord writes', ['id', 'tenant_id', 'actor_id', 'actor_name', 'action', 'entity_type', 'entity_id', 'details', 'ip_address', 'timestamp'].every(c => columnsOf('an_audit_trail').has(c)));

  // --- engine with a fake query
  const applied = new Map<string, string>();
  const ran: string[] = [];
  const q = async (sql: string, params?: unknown[]) => {
    const s = sql.trim();
    if (/^SELECT version FROM an_schema_migrations/i.test(s)) return { rows: [...applied.keys()].map(version => ({ version })) };
    if (/^INSERT INTO an_schema_migrations/i.test(s)) { applied.set(String(params?.[0]), String(params?.[1])); return { rowCount: 1, rows: [] }; }
    if (/^CREATE INDEX/i.test(s)) ran.push(s);
    return { rowCount: 0, rows: [] };
  };
  const eng = new MigrationEngine(SCHEMA_MIGRATIONS);
  const r1 = await eng.applyPending(q);
  check('D16 first apply runs every migration', r1.applied.length === SCHEMA_MIGRATIONS.length && r1.already.length === 0);
  check('D17 the index script ran as one batch containing 21 CREATE INDEX statements', ran.some(s => (s.match(/CREATE INDEX IF NOT EXISTS/g) || []).length === 21));
  const r2 = await eng.applyPending(q);
  check('D18 second apply is a no-op', r2.applied.length === 0 && r2.already.length === SCHEMA_MIGRATIONS.length);

  // --- operational audit trail through the in-memory adapter (behaviour unchanged)
  const mem = new InMemoryAdapter();
  const rec = (id: string, tenantId: string) => ({ id, tenantId, actorId: 'u', actorName: 'U', action: 'X', entityType: 'T', entityId: 'e', timestamp: new Date().toISOString() });
  await mem.saveAuditRecord(rec('a1', 't1')); await mem.saveAuditRecord(rec('a2', 't1')); await mem.saveAuditRecord(rec('a3', 't2'));
  const g1 = await mem.getAuditRecords('t1');
  check('D19 audit records are tenant-scoped', g1.success === true && (g1.data || []).length === 2 && (g1.data || []).every(r => r.tenantId === 't1'));
  const g2 = await mem.getAuditRecords('t1', 1);
  check('D20 audit limit is honoured', (g2.data || []).length === 1);

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
