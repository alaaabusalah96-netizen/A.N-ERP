/**
 * @file auditPhases.ts — read-only audit of the A.N ERP repo after phases 3..12.
 * Static mode (default, no DB):   npx tsx scripts/auditPhases.ts
 * Runtime mode (needs .env + DB):  npx tsx scripts/auditPhases.ts --runtime
 * It never edits files. Exit code 1 if any FAIL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const RUNTIME = process.argv.includes('--runtime');
let fails = 0, warns = 0;
const detail: string[] = [];
const out = (tag: 'PASS' | 'FAIL' | 'WARN' | 'INFO', name: string, extra = '') => {
  if (tag === 'FAIL') fails++; if (tag === 'WARN') warns++;
  console.log(`[${tag}] ${name}${extra ? ' | ' + extra : ''}`);
};
const read = (p: string) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf-8'); } catch { return ''; } };
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));
const count = (p: string, re: RegExp) => (read(p).match(re) || []).length;
function walk(dir: string, exts: string[], acc: string[] = []): string[] {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return acc;
  for (const e of fs.readdirSync(full, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'evidence'].includes(e.name)) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, exts, acc);
    else if (exts.some(x => e.name.endsWith(x))) acc.push(rel);
  }
  return acc;
}
const ADAPTERS = ['PostgresPrimaryAdapter', 'InMemoryAdapter', 'MongoDBSmokeAdapter', 'FirebaseSmokeAdapter', 'MySQLSmokeAdapter'].map(n => `src/core/storage/adapters/${n}.ts`);
const PG = ADAPTERS[0];

// ============================================================ A. phase signatures
console.log('\n=== A. phase signatures ===');
const sig = (phase: string, name: string, ok: boolean) => out(ok ? 'PASS' : 'FAIL', `${phase} ${name}`);
const adaptersAll = (needle: string) => ADAPTERS.every(a => read(a).includes(needle));
sig('P3', 'protected routes + attachment maps', read('server.ts').includes('ATTACHMENT_WRITE_PERMISSION') && read('server.ts').includes("requirePermission('CUSTODY_VIEW')"));
sig('P3', 'route matrix has no DEFER_P4 rows', exists('evidence/phase-4/route-matrix.md') && !/\|\s*DEFER_P4\s*\|/.test(read('evidence/phase-4/route-matrix.md')));
sig('P4', 'membership tables + requireAuth uses them', read(PG).includes('CREATE TABLE IF NOT EXISTS an_memberships') && read('server.ts').includes('getMembershipContext') && read('src/core/storage/StoragePort.ts').includes('getMembershipContext'));
sig('P5', 'persistent invitations (table, port, route, adapters)', read(PG).includes('an_invitations') && read('server.ts').includes('/api/invitations/accept') && adaptersAll('consumeInvitation'));
const oldInv = [...walk('src', ['.ts', '.tsx']), 'server.ts', ...walk('scripts', ['.ts'])].filter(f => !f.endsWith('auditPhases.ts') && /generateInvitationToken|verifyInvitationToken/.test(read(f)));
sig('P5', 'old stateless invitation functions are gone', oldInv.length === 0);
sig('P6', 'logSystemChange helper + 5 call sites', read('server.ts').includes('const logSystemChange') && count('server.ts', /logSystemChange\(/g) >= 5);
sig('P7', 'App.tsx does not read accessToken/authToken', !/accessToken|authToken/.test(read('src/App.tsx')));
sig('P7', 'login/refresh JSON no longer returns accessToken', !/^\s+accessToken,\s*$/m.test(read('server.ts')) && !/accessToken:\s*rotation\.newAccessToken/.test(read('server.ts')));
sig('P7', 'scripts/lib/httpAuth.ts exists', exists('scripts/lib/httpAuth.ts'));
sig('P8', 'integrity measurement files exist', exists('scripts/verifyIntegrity.ts') && exists('scripts/lib/testTenant.ts') && exists('evidence/integrity/baseline-report.md'));
sig('P9', 'validation.ts exists and is used by InventoryService + server', exists('src/core/utils/validation.ts') && read('src/core/inventory/InventoryService.ts').includes('parsePositiveQuantity') && read('server.ts').includes('parseIsoDate'));
sig('P10', 'postStockDocumentAtomic in port + 5 adapters + service', read('src/core/storage/StoragePort.ts').includes('postStockDocumentAtomic') && adaptersAll('postStockDocumentAtomic') && read('src/core/inventory/InventoryService.ts').includes('postStockDocumentAtomic'));
sig('P10', 'PostgreSQL applyMovementInTx really enforces the guards (insufficient-stock 422 + opts.rejectNegative + opts.lockedOutgoingCost)', read(PG).includes('insufficient-stock') && /opts\?\.rejectNegative/.test(read(PG)) && /opts\?\.lockedOutgoingCost/.test(read(PG)));
sig('P10', 'no fake-success pattern (finalDoc fallback) left', !read('src/core/inventory/InventoryService.ts').includes('finalDoc = (saveRes.success'));
const rsm = count('src/core/inventory/InventoryService.ts', /recordStockMovement\(/g);
out(rsm === 1 ? 'PASS' : 'WARN', 'P10/P11 remaining recordStockMovement calls in service (expected 1: stock-count adjustment)', `found ${rsm}`);
sig('P11', 'postStockTransferAtomic in port + 5 adapters + service', read('src/core/storage/StoragePort.ts').includes('postStockTransferAtomic') && adaptersAll('postStockTransferAtomic') && read('src/core/inventory/InventoryService.ts').includes('postStockTransferAtomic'));
sig('P12', 'approval methods in port + 5 adapters', ['rejectApprovalStep', 'getApprovalPolicy', 'saveApprovalPolicy', 'listApprovalRequests'].every(m => read('src/core/storage/StoragePort.ts').includes(m) && adaptersAll(m)));
sig('P12', 'ApprovalEngine.submitWithPolicy + 5 routes + permission', read('src/core/engines/ApprovalEngine.ts').includes('submitWithPolicy') && ['/api/approvals/policies', '/api/approvals/inbox', '/api/approvals/:id/approve', '/api/approvals/:id/reject'].every(r => read('server.ts').includes(r)) && read('src/core/auth/PermissionMatrix.ts').includes('APPROVAL_POLICY_MANAGE'));

// ============================================================ B. interface parity
console.log('\n=== B. StoragePort <-> adapters parity ===');
{
  const port = read('src/core/storage/StoragePort.ts');
  const start = port.indexOf('export interface StoragePort');
  let depth = 0, end = start, seen = false;
  for (let i = port.indexOf('{', start); i < port.length; i++) { if (port[i] === '{') { depth++; seen = true; } else if (port[i] === '}') depth--; if (seen && depth === 0) { end = i; break; } }
  const body = port.slice(start, end);
  const methods = Array.from(new Set(Array.from(body.matchAll(/^  (\w+)\s*[(<]/gm)).map(m => m[1])));
  out('INFO', `StoragePort declares ${methods.length} methods`);
  for (const a of ADAPTERS) {
    const src = read(a);
    const missing = methods.filter(m => !new RegExp(`^  (?:public\\s+|async\\s+|private\\s+)*${m}\\s*[(<]`, 'm').test(src));
    out(missing.length === 0 ? 'PASS' : 'FAIL', `${path.basename(a, '.ts')} implements every port method`, missing.slice(0, 6).join(', '));
  }
}

// ============================================================ C. imports
console.log('\n=== C. imports resolve / packages declared ===');
const SRC = [...walk('src', ['.ts', '.tsx']), 'server.ts', ...walk('scripts', ['.ts'])];
const resolveRel = (from: string, spec: string): string | null => {
  const base = path.normalize(path.join(path.dirname(from), spec));
  for (const c of [base, base + '.ts', base + '.tsx', base + '.js', base + '.json', path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(path.join(ROOT, c)) && fs.statSync(path.join(ROOT, c)).isFile()) return c;
  }
  return null;
};
const graph = new Map<string, string[]>();
const unresolved: string[] = []; const bare = new Set<string>();
for (const f of SRC) {
  const text = read(f);
  const edges: string[] = [];
  for (const m of text.matchAll(/^\s*(import|export)\s+(type\s+)?[^;'"]*?from\s+['"]([^'"]+)['"]/gm)) {
    const spec = m[3]; const isType = !!m[2];
    if (spec.startsWith('.')) {
      if (/\.(css|svg|png|json)$/.test(spec)) continue;
      const r = resolveRel(f, spec);
      if (!r) unresolved.push(`${f} -> ${spec}`); else if (!isType) edges.push(r);
    } else if (!spec.startsWith('node:') && !spec.startsWith('@/')) {
      bare.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
    }
  }
  for (const m of text.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) { const r = resolveRel(f, m[1]); if (!r) unresolved.push(`${f} -> ${m[1]}`); }
  graph.set(f, edges);
}
out(unresolved.length === 0 ? 'PASS' : 'FAIL', `every relative import resolves (${SRC.length} files)`, unresolved.slice(0, 5).join(' ; '));
{
  const pkg = JSON.parse(read('package.json') || '{}');
  const declared = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
  const builtins = new Set(['fs', 'path', 'crypto', 'http', 'https', 'os', 'url', 'util', 'stream', 'events', 'child_process', 'zlib', 'net', 'tls', 'assert', 'buffer', 'readline', 'module', 'worker_threads', 'perf_hooks', 'async_hooks']);
  const missingPkgs = [...bare].filter(p => !declared.has(p) && !builtins.has(p));
  out(missingPkgs.length === 0 ? 'PASS' : 'FAIL', 'every imported package is declared in package.json', missingPkgs.join(', '));
  out(pkg.scripts?.build ? 'PASS' : 'FAIL', 'package.json has a build script');
}
{ // cycles among src (value imports only)
  const idx = new Map<string, number>(), low = new Map<string, number>(), onStack = new Set<string>(), stack: string[] = [];
  let i = 0; const sccs: string[][] = [];
  const strong = (v: string) => {
    idx.set(v, i); low.set(v, i); i++; stack.push(v); onStack.add(v);
    for (const w of graph.get(v) || []) {
      if (!graph.has(w)) continue;
      if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) { const comp: string[] = []; let w: string; do { w = stack.pop()!; onStack.delete(w); comp.push(w); } while (w !== v); if (comp.length > 1) sccs.push(comp); }
  };
  for (const v of graph.keys()) if (!idx.has(v)) strong(v);
  out(sccs.length === 0 ? 'PASS' : 'WARN', 'no circular imports among source files', sccs.slice(0, 2).map(c => c.slice(0, 3).join(' <-> ')).join(' ; '));
}

// ============================================================ D. SQL <-> DDL
console.log('\n=== D. SQL references vs DDL (PostgresPrimaryAdapter) ===');
{
  const sql = read(PG);
  const created = new Map<string, { cols: Set<string>; tenant: boolean }>();
  const dupDiffer: string[] = [];
  for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (an_\w+)\s*\(([\s\S]*?)\n\s*\);/g)) {
    const cols = new Set<string>();
    for (const ln of m[2].split('\n')) { const c = ln.trim().match(/^(\w+)\s+[A-Za-z]/); if (c && !/^(PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)$/i.test(c[1])) cols.add(c[1]); }
    const prev = created.get(m[1]);
    if (prev) { if ([...cols].sort().join() !== [...prev.cols].sort().join() && !dupDiffer.includes(m[1])) dupDiffer.push(m[1]); continue; }  // IF NOT EXISTS: the FIRST definition wins at runtime
    created.set(m[1], { cols, tenant: cols.has('tenant_id') });
  }
  out(dupDiffer.length === 0 ? 'PASS' : 'WARN', 'no table is defined twice with different columns (the first CREATE wins)', dupDiffer.join(', '));
  for (const m of sql.matchAll(/ALTER TABLE (an_\w+)\s+ADD COLUMN IF NOT EXISTS (\w+)/g)) created.get(m[1])?.cols.add(m[2]);
  const referenced = new Set(Array.from(sql.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+(an_\w+)/g)).map(m => m[1]));
  const undefinedTables = [...referenced].filter(t => !created.has(t));
  out(undefinedTables.length === 0 ? 'PASS' : 'FAIL', `every table used in SQL is created in the DDL (${created.size} tables)`, undefinedTables.join(', '));
  const anchor = sql.indexOf("'an_item_prices'");
  let rls = new Set<string>();
  if (anchor > 0) { const a = sql.lastIndexOf('[', anchor), b = sql.indexOf(']', anchor); rls = new Set(Array.from(sql.slice(a, b).matchAll(/'(an_\w+)'/g)).map(m => m[1])); }
  for (const m of sql.matchAll(/ALTER TABLE (an_\w+) ENABLE ROW LEVEL SECURITY/g)) rls.add(m[1]);   // tables protected by an explicit statement
  const noRls = [...created.entries()].filter(([t, v]) => v.tenant && t !== 'an_tenants' && !rls.has(t)).map(([t]) => t);
  out(noRls.length === 0 ? 'PASS' : 'WARN', `every tenant_id table has RLS (array list + explicit ALTER; ${rls.size} covered)`, noRls.join(', '));
  const badInserts: string[] = [];
  for (const n of sql.matchAll(/INSERT INTO (an_\w+)\s*\(([^)]*)\)/g)) {
    const t = created.get(n[1]); if (!t) continue;
    const unknown = n[2].split(',').map(s => s.trim()).filter(c => /^\w+$/.test(c) && !t.cols.has(c));
    if (unknown.length) badInserts.push(`${n[1]}(${unknown.join(',')})`);
  }
  out(badInserts.length === 0 ? 'PASS' : 'FAIL', 'every INSERT column exists in its table', badInserts.slice(0, 4).join(' ; '));
}

// ============================================================ E. routes
console.log('\n=== E. route guards (server.ts) ===');
{
  const lines = read('server.ts').split('\n');
  const PUBLIC = new Set(['/api/health', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout', '/api/invitations/accept', '/api/calendar', '/api/wizard/tax-rules', '/api/wizard/activity-templates', '*']);
  const open: string[] = []; let total = 0;
  for (const ln of lines) {
    const m = ln.match(/^\s*app\.(get|post|put|delete|patch)\(\s*(?:'([^']+)'|\[([^\]]+)\])/);
    if (!m) continue; total++;
    const p = m[2] || m[3];
    if (!/requireAuth|requireDeveloperOrAuditor|requirePlatformAdmin|authRateLimiter/.test(ln) && !PUBLIC.has(p)) open.push(`${m[1].toUpperCase()} ${p}`);
  }
  out(open.length === 0 ? 'PASS' : 'WARN', `routes without an auth guard on the declaration line (of ${total})`, open.slice(0, 8).join(' ; '));
}

// ============================================================ F. hygiene
console.log('\n=== F. hygiene ===');
{
  const all = [...walk('src', ['.ts', '.tsx']), 'server.ts'];
  const emptyCatch = all.filter(f => /catch\s*(\([^)]*\))?\s*\{\s*\}/.test(read(f)));
  out(emptyCatch.length === 0 ? 'PASS' : 'FAIL', 'no empty catch blocks', emptyCatch.join(', '));
  const dbg = all.filter(f => /\bdebugger\b/.test(read(f)));
  out(dbg.length === 0 ? 'PASS' : 'FAIL', 'no debugger statements', dbg.join(', '));
  const stray: string[] = [];
  for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (['tmp', '.phase_tmp'].includes(e.name) || /^screenshot.*\.(png|jpg)$/i.test(e.name) || /\.(patch|rej|orig|bak)$/.test(e.name)) stray.push(e.name);
  }
  for (const f of walk('src', ['.patch', '.rej', '.orig', '.bak'])) stray.push(f);
  out(stray.length === 0 ? 'PASS' : 'WARN', 'no stray temp/patch files in the repo root or src', stray.join(', '));
  out(exists('.env') && (() => { try { return execSync('git ls-files .env', { cwd: ROOT }).toString().trim() === '.env'; } catch { return false; } })() ? 'FAIL' : 'PASS', '.env is not tracked by git');
  const todo = all.reduce((n, f) => n + (read(f).match(/\b(TODO|FIXME|HACK|XXX)\b/g) || []).length, 0);
  out('INFO', `TODO/FIXME markers in src+server: ${todo}`);
  const anyCount = all.reduce((n, f) => n + (read(f).match(/\bas any\b/g) || []).length, 0);
  out('INFO', `"as any" casts in src+server: ${anyCount}`);
}

// ============================================================ G. runtime (optional)
async function runtime() {
  console.log('\n=== G. runtime (DB + live server) ===');
  const { PostgresPrimaryAdapter } = await import(path.join(ROOT, 'src/core/storage/adapters/PostgresPrimaryAdapter.ts'));
  const adapter: any = new PostgresPrimaryAdapter();
  const r1 = await adapter.initializeSchema(); const r2 = await adapter.initializeSchema();
  out(r1.success && r2.success ? 'PASS' : 'FAIL', 'initializeSchema runs twice without error (DDL is idempotent)');
  const pool = adapter.pool;
  const rls = await pool.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=current_schema() AND c.relkind='r' AND c.relname LIKE 'an\\_%' AND NOT c.relrowsecurity
       AND EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema=current_schema() AND k.table_name=c.relname AND k.column_name='tenant_id') AND c.relname <> 'an_tenants'`);
  out(rls.rows.length === 0 ? 'PASS' : 'WARN', 'every tenant_id table has row-level security enabled', rls.rows.map((r: any) => r.relname).join(', '));
  const fkNoIdx = await pool.query(`SELECT conrelid::regclass::text AS t, a.attname AS col FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
     WHERE c.contype='f' AND array_length(c.conkey,1)=1 AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid AND i.indkey[0]=c.conkey[1])`);
  out(fkNoIdx.rows.length === 0 ? 'PASS' : 'INFO', `foreign-key columns without an index: ${fkNoIdx.rows.length}`, fkNoIdx.rows.slice(0, 6).map((r: any) => `${r.t}.${r.col}`).join(', '));
  const noMem = await pool.query(`SELECT count(*)::int n FROM an_users u WHERE NOT EXISTS (SELECT 1 FROM an_memberships m WHERE m.tenant_id=u.tenant_id AND m.user_id=u.id)`).catch(() => ({ rows: [{ n: -1 }] }));
  out(noMem.rows[0].n === 0 ? 'PASS' : 'WARN', 'every user has a membership', `without=${noMem.rows[0].n} (RLS may hide rows if the DB role does not bypass it)`);
  await adapter.close();
  const { spawn } = await import('node:child_process');
  const srv = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: '3102' }, stdio: 'ignore', detached: true });
  const t0 = Date.now(); let up = false;
  for (let i = 0; i < 90 && !up; i++) { try { up = (await fetch('http://127.0.0.1:3102/api/health')).status === 200; } catch { await new Promise(r => setTimeout(r, 1000)); } }
  out(up ? 'PASS' : 'FAIL', 'server starts and /api/health answers 200', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (up) {
    const times: number[] = []; let bad5 = 0;
    for (let i = 0; i < 40; i++) { const t = Date.now(); const r = await fetch('http://127.0.0.1:3102/api/health'); if (r.status >= 500) bad5++; times.push(Date.now() - t); }
    times.sort((a, b) => a - b);
    out(bad5 === 0 && times[Math.floor(times.length * 0.95)] < 500 ? 'PASS' : 'WARN', '/api/health 40 calls', `p50=${times[20]}ms p95=${times[38]}ms 5xx=${bad5}`);
  }
  try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* ignore */ }
}

(async () => {
  if (RUNTIME) { try { await runtime(); } catch (e: any) { out('FAIL', 'runtime audit crashed', e?.message); } }
  console.log(`\nAUDIT RESULT: ${fails} FAIL | ${warns} WARN${RUNTIME ? '' : ' (static mode — run with --runtime for DB/server checks)'}`);
  void detail; process.exit(fails ? 1 : 0);
})();
