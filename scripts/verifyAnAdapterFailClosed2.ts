import fs from 'fs';
import path from 'path';
import {
  resolveCompanyStorageAdapter,
  type CompanyLike,
} from '../src/lib/anResolveCompanyAdapter';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { console.log(`[PASS] ${name}`); passed++; }
  else { console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}
function attempt<T>(fn: () => T) {
  try { return { ok: true as const, res: fn(), msg: '' }; }
  catch (e: any) { return { ok: false as const, res: null as any, msg: String(e?.message || e) }; }
}

// Fake router: no database needed; markers prove WHICH path was taken.
const PRIMARY = { __marker: 'primary' };
const EXPLICIT = { __marker: 'explicit' };
const router: any = {
  getPrimaryAdapter: () => PRIMARY,
  resolveAdapter: () => EXPLICIT,
};
const SKIPPED = { status: 'skipped', reason: 'no_admin_db' } as const;

// --- Behavioral ---
let r = attempt(() => resolveCompanyStorageAdapter(router, 'c1', null, null,
  { loadStatus: SKIPPED, failClosed: true }));
check('B1 skipped + failClosed -> throws CONFIG_UNAVAILABLE',
  !r.ok && r.msg.includes('ADAPTER_COMPANY_CONFIG_UNAVAILABLE'), r.msg);

r = attempt(() => resolveCompanyStorageAdapter(router, 'c1', null, null,
  { loadStatus: SKIPPED, failClosed: false }));
check('B2 skipped + failClosed=false -> primary (dev mode preserved)',
  r.ok && r.res.source === 'process_primary' && (r.res.adapter as any) === PRIMARY && r.res.companyDoc === 'skipped');

const prevRef = process.env.COMPANY_FC2_PROBE_URL;
process.env.COMPANY_FC2_PROBE_URL = 'postgresql://127.0.0.1:5432/fc2_probe';
r = attempt(() => resolveCompanyStorageAdapter(router, 'c1', null,
  { db_backend: 'postgresql', isolation_level: 'Dedicated', connection_ref: 'COMPANY_FC2_PROBE_URL' },
  { loadStatus: SKIPPED, failClosed: true }));
check('B3 explicit body backend unaffected by skipped (routes via resolveAdapter)',
  r.ok && (r.res.adapter as any) === EXPLICIT && r.res.source === 'body_override', r.msg);

r = attempt(() => resolveCompanyStorageAdapter(router, 'c1', null, null,
  { loadStatus: 'not_found', failClosed: true, requireLoaded: true }));
check('B4 not_found + requireLoaded -> throws NOT_LOADED',
  !r.ok && r.msg.includes('ADAPTER_COMPANY_NOT_LOADED'), r.msg);

r = attempt(() => resolveCompanyStorageAdapter(router, 'c1', null, null,
  { loadStatus: 'not_found', failClosed: true }));
check('B5 not_found on read path -> primary with companyDoc missing',
  r.ok && r.res.source === 'process_primary' && r.res.companyDoc === 'missing');

const plain: CompanyLike = { id: 'c1' } as CompanyLike;
r = attempt(() => resolveCompanyStorageAdapter(router, 'c1', plain, null,
  { loadStatus: 'loaded', failClosed: true, requireLoaded: true }));
check('B6 loaded shared company + requireLoaded -> primary, companyDoc loaded',
  r.ok && (r.res.adapter as any) === PRIMARY && r.res.companyDoc === 'loaded');

r = attempt(() => resolveCompanyStorageAdapter(router, 'c1', null, null,
  { loadStatus: 'error', failClosed: true }));
check('B7 error + failClosed still throws LOAD_FAILED (regression)',
  !r.ok && r.msg.includes('ADAPTER_COMPANY_LOAD_FAILED'), r.msg);

r = attempt(() => resolveCompanyStorageAdapter(router, 'c1', null, null,
  { loadStatus: 'error', failClosed: false }));
check('B8 error + failClosed=false -> primary (dev mode preserved)',
  r.ok && r.res.source === 'process_primary');

const dedicated: CompanyLike = {
  id: 'c2', db_backend: 'postgresql', isolation_level: 'Dedicated',
  connection_ref: 'COMPANY_FC2_PROBE_URL',
} as CompanyLike;
r = attempt(() => resolveCompanyStorageAdapter(router, 'c2', dedicated, null,
  { loadStatus: 'loaded', failClosed: true, requireLoaded: true }));
check('B9 loaded Dedicated company routes via resolveAdapter, not primary',
  r.ok && (r.res.adapter as any) === EXPLICIT, r.msg);

if (prevRef === undefined) delete process.env.COMPANY_FC2_PROBE_URL;
else process.env.COMPANY_FC2_PROBE_URL = prevRef;

// --- Static (minimal; behavior is covered above) ---
const root = process.cwd();
const src = fs.readFileSync(path.join(root, 'src/lib/anResolveCompanyAdapter.ts'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');

check('S1 unreachable duplicate throw removed',
  !/throw new Error\('ADAPTER_COMPANY_LOAD_FAILED'\)/.test(src));
check('S2 requireLoaded option declared in resolver', src.includes('requireLoaded'));
check('S3 at least four write routes pass requireLoaded: true',
  (server.match(/requireLoaded:\s*true/g) || []).length >= 4,
  `found ${(server.match(/requireLoaded:\s*true/g) || []).length}`);
check('S4 MERGE_STATUS lists ADP-FC2', statusDoc.includes('ADP-FC2'));
check('S5 SEC scope + migrate auth still present',
  server.includes('assertUserCanAccessCompany') && server.includes('requireAnMigrateOperator'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
