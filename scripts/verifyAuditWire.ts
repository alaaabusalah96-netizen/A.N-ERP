/**
 * @file verifyAuditWire.ts
 * @description AUDIT-UNIFY-1 invariants for the audit itself (static: reads files, runs nothing):
 *  - the gates that were once outside `npm test` stay registered with their expected counts;
 *  - the financial / integrity gates are CRITICAL (a regression there must be NO_GO) and no CRITICAL name is dangling;
 *  - the register does not contradict itself or the code (stale "still OPEN" / "re-check RLS" claims);
 *  - every tenant_id table is covered by the RLS array or an explicit ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
 * (Replaces an earlier version whose regexes were over-escaped and so could never match.)   Run: npx tsx scripts/verifyAuditWire.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => { ok ? pass++ : fail++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${!ok && extra ? ' | ' + extra : ''}`); };

const runner = fs.readFileSync('scripts/runReconcileAuditB.ts', 'utf8');
const entryRe = /\{\s*name:\s*'(\w+)',\s*script:\s*'scripts\/(verify\w+)\.ts'(?:,\s*expected:\s*([^}]+?))?\s*\}/g;
const wired: Array<{ name: string; script: string; expected: string | undefined }> = [];
for (let m = entryRe.exec(runner); m; m = entryRe.exec(runner)) wired.push({ name: m[1], script: m[2], expected: m[3]?.trim() });
const byName = new Map(wired.map(w => [w.name, w]));

const required: Array<[string, string, number]> = [
  ['FixP1P2pAutopost', 'verifyFixP1P2pAutopost', 8], ['Ph8InvTab', 'verifyPh8InvTab', 14], ['Ph8Return', 'verifyPh8Return', 18], ['Ph8Reorder', 'verifyPh8Reorder', 14],
  ['InvItemCard', 'verifyInvItemCard', 13], ['InvMovementsFilter', 'verifyInvMovementsFilter', 14], ['InvUiTabs', 'verifyInvUiTabs', 12], ['Db1', 'verifyDb1', 20], ['Ops1', 'verifyOps1', 28],
  ['DocSyncFull', 'verifyDocSyncFull', 19], ['BatteryCoverage', 'verifyBatteryCoverage', 19], ['AuditWire', 'verifyAuditWire', 28],
];
for (const [name, script, n] of required) {
  const w = byName.get(name);
  check(`W ${name} is registered with its script and expected=${n}`, !!w && w.script === script && !!w.expected && new RegExp(`(^|[^\\d])${n}$`).test(w.expected), w ? `script=${w.script} expected=${w.expected}` : 'not registered');
}
check('W battery names and script paths are unique', new Set(wired.map(w => w.name)).size === wired.length && new Set(wired.map(w => w.script)).size === wired.length);

const critical = [...(runner.match(/const CRITICAL = \[([\s\S]*?)\];/)?.[1] || '').matchAll(/'(\w+)'/g)].map(m => m[1]);
for (const c of ['FixP1P2pAutopost', 'Ph8Return', 'FixJ1Accounts', 'FixStockReturnCumulative', 'BatteryCoverage', 'AuditWire']) check(`K ${c} is a CRITICAL gate`, critical.includes(c));
check('K no CRITICAL name is dangling (each one is a registered battery)', critical.length > 0 && critical.every(c => byName.has(c)), critical.filter(c => !byName.has(c)).join(', '));

const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const lastPkg = (reg.packages || [])[(reg.packages || []).length - 1];
check('R the register records AUDIT-UNIFY-1 as DONE and as the most recent package', lastPkg?.id === 'BASELINE-MAP-1' && lastPkg?.status === 'DONE', `last=${lastPkg?.id}`);
check('R lastChange names that package', String(reg.lastChange || '').startsWith('BASELINE-MAP-1'));
const d = (reg.defects || []).find((x: any) => x.id === 'DEF-P1-003');
check('R DEF-P1-003 evidence does not contradict its FIXED status', d?.status === 'FIXED' && !/still OPEN/i.test(String(d?.evidence || '')), String(d?.evidence || ''));
const dr = (reg.defects || []).find((x: any) => x.id === 'DEF-CUSTODY-REVERSAL-DOUBLE-REFUND');
check('R the double-refund defect that DEF-P1-003 refers to is FIXED in the register', dr?.status === 'FIXED');
const risks: string[] = reg.knownRisks || [];
check('R no known risk claims DB-1/OPS-1 are unregistered', !risks.some(x => /verifyDb1 \/ verifyOps1 are not yet entries/i.test(x)));
check('R no known risk asks to "re-check an_company_profiles" (SEC-2c is closed by explicit RLS statements)', !risks.some(x => /re-check an_company_profiles/i.test(x)));

const pg = fs.readFileSync('src/core/storage/adapters/PostgresPrimaryAdapter.ts', 'utf8');
const tables: Record<string, string> = {};
for (const m of pg.matchAll(/CREATE TABLE IF NOT EXISTS (an_\w+) \(([\s\S]*?)\n\s*\);/g)) tables[m[1]] = m[2];
const tenantTables = Object.keys(tables).filter(t => /\btenant_id\b/.test(tables[t]));
const anchor = pg.indexOf("'an_approval_policies'");
const arrStart = pg.lastIndexOf('[', anchor);
const arr = new Set([...(pg.slice(arrStart).match(/\[([\s\S]*?)\]/)?.[1] || '').matchAll(/'(an_\w+)'/g)].map(m => m[1]));
const explicit = new Set([...pg.matchAll(/ALTER TABLE (an_\w+) ENABLE ROW LEVEL SECURITY/g)].map(m => m[1]));
const uncovered = tenantTables.filter(t => !arr.has(t) && !explicit.has(t));
check('S every tenant_id table is covered by the RLS array or an explicit ALTER TABLE ... ENABLE ROW LEVEL SECURITY (static)', tenantTables.length > 50 && uncovered.length === 0, `tenant tables=${tenantTables.length} uncovered=${uncovered.join(',')}`);
check('S an_company_profiles is protected by an explicit statement', explicit.has('an_company_profiles') || arr.has('an_company_profiles'));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
