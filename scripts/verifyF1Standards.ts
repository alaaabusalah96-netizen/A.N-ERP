/**
 * @file verifyF1Standards.ts
 * @description Standards Intelligence F1 — no-database suite.
 * Part 1: shared suite on InMemoryAdapter (proves service/registry LOGIC and the adapter contract only).
 * Part 2: real PostgresPrimaryAdapter code against a scripted fake client (proves statement ORDER and fail paths).
 * Part 3: static checks on the DDL/RLS text.
 * It does NOT prove SQL syntax, DB CHECK constraints, row locking or RLS — run scripts/verifyF1StandardsPg.ts for that.
 * Run:  npx tsx scripts/verifyF1Standards.ts   (prints the final "Passed: N | Failed: M" line)
 */
import fs from 'fs';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { runF1Suite, Tally } from './lib/f1StandardsSuite';

const tally: Tally = { pass: 0, fail: 0 };
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { tally.pass++; console.log(`[PASS] ${label}`); } else { tally.fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

function fakePool(script: (sql: string, params: any[]) => any) {
  const log: Array<{ sql: string; params: any[] }> = [];
  const client = {
    async query(sql: string, params: any[] = []) { const s = sql.replace(/\s+/g, ' ').trim(); log.push({ sql: s, params }); return script(s, params) ?? { rows: [], rowCount: 0 }; },
    release() { /* no-op */ },
  };
  return { log, pool: { query: client.query, connect: async () => client } };
}
const idx = (log: Array<{ sql: string }>, re: RegExp) => log.findIndex(l => re.test(l.sql));
const polRow = (o: any = {}) => ({ id: 'pX', policy_key: 'inventory_valuation_method', value: 'FIFO', version: 2, effective_from: '2026-07-01', effective_to: null, reason: null, created_by: 'u', created_at: new Date(), ...o });
const INPUT = { id: 'pol-new', tenantId: 'T', policyKey: 'inventory_valuation_method', value: 'FIFO', effectiveFrom: '2026-07-01', reason: 'r', createdBy: 'u' };

async function main() {
  console.log('--- Part 1: shared suite on InMemoryAdapter ---');
  await runF1Suite(new InMemoryAdapter(), `f1-A-${Date.now()}`, `f1-B-${Date.now()}`, tally);

  console.log('--- Part 2: real PostgresPrimaryAdapter code vs scripted fake client ---');
  const pg: any = new PostgresPrimaryAdapter();
  {
    const f = fakePool((s) => {
      if (/SELECT id, version, to_char/.test(s)) return { rows: [{ id: 'p1', version: 1, effective_from: '2026-01-01' }] };
      if (/INSERT INTO an_accounting_policies/.test(s)) return { rows: [polRow({ id: 'pol-new', version: 2 })] };
      return null;
    });
    pg.pool = f.pool;
    const r = await pg.appendAccountingPolicyVersion('T', INPUT, 'u', 'k1');
    const L = f.log, iLock = idx(L, /pg_advisory_xact_lock/), iFor = idx(L, /FOR UPDATE/), iUpd = idx(L, /^UPDATE an_accounting_policies SET effective_to/), iIns = idx(L, /^INSERT INTO an_accounting_policies/), iCommit = idx(L, /^COMMIT/);
    check('P1 policy append (PG code): BEGIN -> tenant scope -> advisory lock -> FOR UPDATE read -> close previous -> INSERT -> COMMIT', r.success && idx(L, /^BEGIN/) === 0 && idx(L, /set_config\('app.current_tenant_id'/) === 1 && iLock > 1 && iFor > iLock && iUpd > iFor && iIns > iUpd && iCommit === L.length - 1, JSON.stringify(L.map(x => x.sql.slice(0, 25))));
    const upd = L[iUpd]; const ins = L[iIns];
    check('P2 previous version is closed with the NEW effectiveFrom (minus one day in SQL), new row gets version 2', upd.params[1] === 'p1' && upd.params[2] === '2026-07-01' && /\$3::date - 1/.test(upd.sql) && ins.params[4] === 2 && ins.params[1] === 'T');
  }
  {
    const f = fakePool((s) => (/SELECT id, version, to_char/.test(s) ? { rows: [{ id: 'p1', version: 2, effective_from: '2026-07-01' }] } : null));
    pg.pool = f.pool;
    const r = await pg.appendAccountingPolicyVersion('T', { ...INPUT, effectiveFrom: '2026-05-01' }, 'u', 'k2');
    check('P3 backdating: 409, ROLLBACK, nothing written (no INSERT, no UPDATE, no COMMIT)', r.success === false && r.error?.status === 409 && r.error?.title === 'POLICY_BACKDATE_REJECTED' && idx(f.log, /^ROLLBACK/) > 0 && idx(f.log, /^INSERT/) === -1 && idx(f.log, /^UPDATE/) === -1 && idx(f.log, /^COMMIT/) === -1);
  }
  {
    const f = fakePool((s) => (/WHERE tenant_id=\$1 AND id=\$2/.test(s) ? { rows: [polRow({ id: 'pol-new' })] } : null));
    pg.pool = f.pool;
    const r = await pg.appendAccountingPolicyVersion('T', INPUT, 'u', 'k3');
    check('P4 idempotent replay (same derived id): success, ROLLBACK, no INSERT/UPDATE', r.success && r.data?.id === 'pol-new' && idx(f.log, /^INSERT/) === -1 && idx(f.log, /^UPDATE/) === -1 && idx(f.log, /^ROLLBACK/) > 0);
  }
  {
    const f = fakePool((s) => {
      if (/^INSERT INTO an_standards/.test(s)) return { rows: [] };            // ON CONFLICT DO NOTHING -> no row returned
      if (/^SELECT created_idem_key FROM an_standards/.test(s)) return { rows: [{ created_idem_key: 'kA' }] };
      return null;
    });
    pg.pool = f.pool;
    const std: any = { standardId: 'S', framework: 'IFRS', version: 1, titleEn: 't', coverageStatus: 'NOT_IMPLEMENTED', effectiveFrom: '0001-01-01', sourceVerified: false };
    const same = await pg.saveStandard(std, 'u', 'kA'), diff = await pg.saveStandard(std, 'u', 'kB');
    const ins = f.log.find(l => /^INSERT INTO an_standards/.test(l.sql))!;
    check('P5 saveStandard (PG code): insert is ON CONFLICT DO NOTHING; same key replays OK, different key -> 409', /ON CONFLICT \(framework,standard_id,version\) DO NOTHING/.test(ins.sql) && same.success && diff.success === false && diff.error?.status === 409);
    check('P6 mapping column is cast to jsonb and jsonb params are not double-encoded', /\$17::jsonb/.test(ins.sql) && ins.params[16] === null);
  }
  {
    const f = fakePool((s) => (/^INSERT INTO an_accounting_rules/.test(s) ? { rows: [{ '?column?': 1 }] } : null));
    pg.pool = f.pool;
    const rule: any = { ruleId: 'R', version: 1, standardId: 'S', framework: 'IFRS', jurisdictionId: 'J', eventType: 'GOODS_RECEIPT', priority: 1, tier: 2, conditions: { a: 1 }, treatment: { debit: { role: 'X' } }, requiredData: ['a'], exceptions: [], effectiveFrom: '2024-01-01', sourceReference: 's', sourceVerified: true, status: 'ACTIVE' };
    const r = await pg.saveAccountingRule(rule, 'u', 'k');
    const ins = f.log[0];
    check('P7 rule JSON columns are sent as JSON strings with ::jsonb casts (conditions/treatment/required_data/exceptions)', r.success && (ins.sql.match(/::jsonb/g) || []).length === 4 && ins.params[8] === '{"a":1}' && ins.params[10] === '["a"]');
  }
  {
    pg.pool = null;
    const r = await pg.listStandards();
    check('P8 no DB connection -> fail-closed error, no throw', r.success === false);
  }

  console.log('--- Part 3: static checks on the real adapter source (DDL / RLS text) ---');
  const src = fs.readFileSync('src/core/storage/adapters/PostgresPrimaryAdapter.ts', 'utf8');
  check('S1 an_accounting_policies is in the FORCE-RLS tenant table list', /'an_inventory_settings',\s*'an_accounting_policies'\s*[,\]]/.test(src));
  check('S2 DB-level guard: ACTIVE rules (accounting + tax) need verified source and a real date', (src.match(/status <> 'ACTIVE' OR \(source_verified AND source_reference IS NOT NULL/g) || []).length === 2);
  check('S3 DB-level guard: IMPLEMENTED/PARTIAL standards need evidence and a verified source; tax rate needs verified source', /coverage_status NOT IN \('IMPLEMENTED','PARTIAL'\) OR \(coverage_evidence_ref IS NOT NULL/.test(src) && /CHECK \(rate IS NULL OR \(rate >= 0 AND rate <= 1 AND source_verified\)\)/.test(src));
  check('S4 policies table: tenant FK + unique (tenant, key, version); global tables have composite primary keys per version', /an_accounting_policies \([\s\S]*REFERENCES an_tenants\(id\)[\s\S]*UNIQUE \(tenant_id, policy_key, version\)/.test(src) && /PRIMARY KEY \(rule_id, version\)/.test(src) && /PRIMARY KEY \(framework, standard_id, version\)/.test(src));
  const mem = fs.readFileSync('src/core/storage/adapters/InMemoryAdapter.ts', 'utf8');
  const smokes = ['MySQLSmokeAdapter', 'MongoDBSmokeAdapter', 'FirebaseSmokeAdapter'].map(n => fs.readFileSync(`src/core/storage/adapters/${n}.ts`, 'utf8'));
  const names = ['saveStandard', 'listStandards', 'updateStandardCoverage', 'saveJurisdiction', 'listJurisdictions', 'saveAccountingRule', 'listAccountingRules', 'saveStdTaxRule', 'listStdTaxRules', 'appendAccountingPolicyVersion', 'listAccountingPolicies'];
  check('S5 adapter parity: all 11 new methods exist on Postgres, InMemory and the 3 Smoke adapters (smokeOnlyError)', names.every(nm => new RegExp(`${nm}\\(`).test(src) && new RegExp(`${nm}\\(`).test(mem) && smokes.every(s => new RegExp(`${nm}\\([^)]*\\)\\s*\\{\\s*return this\\.smokeOnlyError`).test(s))));

  console.log(`\nPassed: ${tally.pass} | Failed: ${tally.fail}`);
  process.exit(tally.fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
