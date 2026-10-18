/**
 * Reconcile Audit B — run every non-PostgreSQL gate (with EXPECTED counts), write evidence, render the canonical state docs.
 * Run:  npx tsx scripts/runReconcileAuditB.ts            (this is `npm test`)
 *       npx tsx scripts/runReconcileAuditB.ts --docs-only (render docs from docs/STATE_REGISTER.json, run nothing)
 * REPO-B: the docs are RENDERED from docs/STATE_REGISTER.json (edited by hand). This script never replaces the defect register with a template.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { classifyGate, decideVerdict } from './lib/gateClassify';

const root = process.cwd();
const docsOnly = process.argv.includes('--docs-only');
const evidenceDir = path.join(root, 'evidence', 'reconcile-audit-b');

type Gate = { name: string; script: string; expected?: number; passed: number | null; failed: number | null; raw: string; status: 'PASS' | 'FAIL' | 'SKIP' | 'ERROR' };
type Defect = { id: string; severity: 'P1' | 'P2' | 'P3'; status: 'OPEN' | 'FIXED' | 'MITIGATED' | 'CONFIG'; title: string; evidence?: string; fix?: string };
type Register = { project: { name: string; version: string }; lastUpdated: string; lastChange: string; packages: Array<{ id: string; status: string; scope: string; evidence?: string }>; defects: Defect[]; knownRisks: string[]; ops: { tests: string; pgGates: string[]; env: Record<string, string> }; policy: string };
const reg: Register = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'STATE_REGISTER.json'), 'utf8'));

function runTsx(scriptRel: string): { code: number; out: string } {
  const scriptPath = path.join(root, scriptRel);
  if (!fs.existsSync(scriptPath) || fs.statSync(scriptPath).size === 0) return { code: 127, out: `SKIP missing-or-empty ${scriptRel}\n` };
  const r = spawnSync('npx', ['tsx', scriptRel], { cwd: root, encoding: 'utf8', env: process.env, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}
function parsePassed(out: string): { passed: number | null; failed: number | null } {
  const m = out.match(/Passed:\s*(\d+)\s*\|\s*Failed:\s*(\d+)/g);
  if (m) { const last = m[m.length - 1].match(/(\d+)\D+(\d+)/)!; return { passed: Number(last[1]), failed: Number(last[2]) }; }
  const s = out.match(/SUMMARY:\s*PASS=(\d+)\s*FAIL=(\d+)/);
  return s ? { passed: Number(s[1]), failed: Number(s[2]) } : { passed: null, failed: null };
}

const isPg = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);

// Expected counts come from the last verified run. A count that changes is a FAIL (silent test loss is a regression).
const BATTERIES: { name: string; script: string; expected?: number }[] = [
  { name: 'Sec1TwoFactor', script: 'scripts/verifySec1TwoFactor.ts', expected: 26 },
  { name: 'Sec2Rls', script: 'scripts/verifySec2Rls.ts', expected: 39 },
  { name: 'Sec2bRls', script: 'scripts/verifySec2bRls.ts', expected: isPg ? 16 : 14 },
  { name: 'Sec3Ids', script: 'scripts/verifySec3Ids.ts', expected: 7 },
  { name: 'Sec4ProdRole', script: 'scripts/verifySec4ProdRole.ts', expected: isPg ? 6 : 5 },
  { name: 'SecProdRole', script: 'scripts/verifySecProdRole.ts', expected: isPg ? 13 : 11 },
  { name: 'SecA', script: 'scripts/verifySecA.ts', expected: 27 },
  { name: 'FixC', script: 'scripts/verifyFixC.ts', expected: 14 },
  { name: 'FixP1Custody', script: 'scripts/verifyFixP1Custody.ts', expected: 9 },
  { name: 'RepairBatch1', script: 'scripts/verifyRepairBatch1.ts', expected: 37 },
  { name: 'P8aProcurement', script: 'scripts/verifyP8aProcurement.ts', expected: 24 },
  { name: 'P8cThreeWay', script: 'scripts/verifyP8cThreeWay.ts', expected: 14 },
  { name: 'P8cFix', script: 'scripts/verifyP8cFix.ts', expected: 22 },
  { name: 'P15Purchasing', script: 'scripts/verifyP15Purchasing.ts', expected: 25 },
  { name: 'P10StockAtomicMem', script: 'scripts/verifyP10StockAtomicMem.ts', expected: 12 },
  { name: 'P11TransfersMem', script: 'scripts/verifyP11TransfersMem.ts', expected: 12 },
  { name: 'P12ApprovalsMem', script: 'scripts/verifyP12ApprovalsMem.ts', expected: 35 },
  { name: 'P13Costing', script: 'scripts/verifyP13Costing.ts', expected: 50 },
  { name: 'P14AutoJournals', script: 'scripts/verifyP14AutoJournals.ts', expected: 24 },
  { name: 'P16Recon', script: 'scripts/verifyP16Recon.ts', expected: 14 },
  { name: 'P17Attachments', script: 'scripts/verifyP17Attachments.ts', expected: 29 },
  { name: 'P18WarehouseScope', script: 'scripts/verifyP18WarehouseScope.ts', expected: 19 },
  { name: 'P2002Migrations', script: 'scripts/verifyP2002Migrations.ts', expected: 8 },
  { name: 'F1Standards', script: 'scripts/verifyF1Standards.ts', expected: 71 },
  { name: 'F2Decisions', script: 'scripts/verifyF2Decisions.ts', expected: 51 },
  { name: 'F3Acceptance', script: 'scripts/verifyF3Acceptance.ts', expected: 19 },
  { name: 'F4StockShadow', script: 'scripts/verifyF4StockShadow.ts', expected: 14 },
  { name: 'FixJ1Accounts', script: 'scripts/verifyFixJ1Accounts.ts', expected: 24 },
  { name: 'FixStockReturnCumulative', script: 'scripts/verifyFixStockReturnCumulative.ts', expected: 18 },
  { name: 'PgDateMapping', script: 'scripts/verifyPgDateMapping.ts', expected: 14 },
  { name: 'PgMovementLogic', script: 'scripts/verifyPgMovementLogic.ts', expected: 4 },
  // PH8-CLOSE-1: gates that existed but were outside `npm test` (counts verified in memory; a PG run may add PG branches, so those two keep the count only without a database)
  { name: 'FixP1P2pAutopost', script: 'scripts/verifyFixP1P2pAutopost.ts', expected: 8 },
  { name: 'Ph8InvTab', script: 'scripts/verifyPh8InvTab.ts', expected: 14 },
  { name: 'Ph8Return', script: 'scripts/verifyPh8Return.ts', expected: 18 },
  { name: 'Ph8Reorder', script: 'scripts/verifyPh8Reorder.ts', expected: 14 },
  { name: 'InvItemCard', script: 'scripts/verifyInvItemCard.ts', expected: 13 },
  { name: 'InvUiTabs', script: 'scripts/verifyInvUiTabs.ts', expected: 12 },
  { name: 'InvItemCreate', script: 'scripts/verifyInvItemCreate.ts', expected: 15 },
  { name: 'InvIntransit', script: 'scripts/verifyInvIntransit.ts', expected: 14 },
  { name: 'InvMovementsFilter', script: 'scripts/verifyInvMovementsFilter.ts', expected: isPg ? undefined : 14 },
  { name: 'Db1', script: 'scripts/verifyDb1.ts', expected: isPg ? undefined : 20 },
  { name: 'Ops1', script: 'scripts/verifyOps1.ts', expected: 28 },
  { name: 'DocSyncFull', script: 'scripts/verifyDocSyncFull.ts', expected: 19 },
  { name: 'BatteryCoverage', script: 'scripts/verifyBatteryCoverage.ts', expected: 19 },
  { name: 'AuditWire', script: 'scripts/verifyAuditWire.ts', expected: 28 },
  { name: 'SecRoleCeiling', script: 'scripts/verifySecRoleCeiling.ts', expected: 24 },
  { name: 'BaselineMap', script: 'scripts/verifyBaselineMap.ts', expected: 12 },
  { name: 'SecAuthMatrix', script: 'scripts/verifySecAuthMatrix.ts', expected: 18 },
  { name: 'SecSessionPassword', script: 'scripts/verifySecSessionPassword.ts', expected: 15 },
  { name: 'SecUserAdmin', script: 'scripts/verifySecUserAdmin.ts', expected: 15 },
  { name: 'OrgCompany1', script: 'scripts/verifyOrgCompany1.ts', expected: 14 },
  { name: 'SecPasswordUx', script: 'scripts/verifySecPasswordUx.ts', expected: 15 },
  { name: 'SecPermOverride', script: 'scripts/verifySecPermOverride.ts', expected: 16 },
  { name: 'UiUsers1', script: 'scripts/verifyUiUsers1.ts', expected: 15 },
  { name: 'UiOps1', script: 'scripts/verifyUiOps1.ts', expected: 14 },
  { name: 'UiP2p1', script: 'scripts/verifyUiP2p1.ts', expected: 13 },
  { name: 'Ui2faSetup1', script: 'scripts/verifyUi2faSetup1.ts', expected: 13 },
  { name: 'UiAuditPrint1', script: 'scripts/verifyUiAuditPrint1.ts', expected: 14 },
  { name: 'DemoLoginRoles1', script: 'scripts/verifyDemoLoginRoles1.ts', expected: 16 },
  { name: 'OrgMembership1', script: 'scripts/verifyOrgMembership1.ts', expected: 13 },
  { name: 'OrgGroup1', script: 'scripts/verifyOrgGroup1.ts', expected: 14 },
  { name: 'MasterItemGroup1', script: 'scripts/verifyMasterItemGroup1.ts', expected: 14 },
  { name: 'StkXcompany1', script: 'scripts/verifyStkXcompany1.ts', expected: 14 },
  { name: 'AccEntityClose1', script: 'scripts/verifyAccEntityClose1.ts', expected: 14 },
  { name: 'RptGroup1', script: 'scripts/verifyRptGroup1.ts', expected: 14 },
  { name: 'P9Validation', script: 'scripts/verifyP9Validation.ts' },
];
// AUDIT-UNIFY-1: the financial / integrity gates and the two guards that protect the audit itself are CRITICAL too (a regression there is NO_GO)
const CRITICAL = ['Sec1TwoFactor', 'Sec2Rls', 'Sec2bRls', 'Sec3Ids', 'Sec4ProdRole', 'SecA', 'RepairBatch1', 'P8aProcurement', 'P8cThreeWay', 'F2Decisions', 'FixP1P2pAutopost', 'Ph8Return', 'FixJ1Accounts', 'FixStockReturnCumulative', 'BatteryCoverage', 'AuditWire', 'SecRoleCeiling'];

const gates: Gate[] = [];
let f07Verdict = 'NOT_RUN', f07Parse: { passed: number | null; failed: number | null } = { passed: null, failed: null };
if (!docsOnly) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  for (const b of BATTERIES) {
    process.stdout.write(`Running ${b.name}...\n`);
    const { code, out } = runTsx(b.script);
    const { passed, failed } = parsePassed(out);
    const status: Gate['status'] = classifyGate({ code, out, passed, failed, expected: b.expected });
    gates.push({ name: b.name, script: b.script, expected: b.expected, passed, failed, raw: out, status });
    fs.writeFileSync(path.join(evidenceDir, `${b.name}.txt`), out, 'utf8');
  }
  process.stdout.write('Running F07StorageRouter...\n');
  const f07 = runTsx('scripts/verifyF07StorageRouter.ts');
  f07Parse = parsePassed(f07.out);
  fs.writeFileSync(path.join(evidenceDir, 'F07.txt'), f07.out, 'utf8');
  f07Verdict = f07.code === 127 || f07.out.startsWith('SKIP') || f07.out.includes('SKIPPED') ? 'SKIP' : (f07Parse.failed === 0 || f07.out.includes('PASS') ? 'PASS' : 'FAIL');
}

const hardFails = gates.filter(g => g.status === 'FAIL' || g.status === 'ERROR');
const criticalFail = gates.some(g => CRITICAL.includes(g.name) && g.status !== 'PASS' && g.status !== 'SKIP');
const openP1 = reg.defects.filter(d => d.status === 'OPEN' && d.severity === 'P1');
const openOther = reg.defects.filter(d => (d.status === 'OPEN' && d.severity !== 'P1') || d.status === 'CONFIG');
// NO_GO: a critical gate failed or an OPEN P1 defect exists. CONDITIONAL_GO: only open P2/P3 or configuration conditions. GO: none.
const skippedCritical = gates.filter(g => CRITICAL.includes(g.name) && g.status === 'SKIP').length;
const verdict = decideVerdict({ criticalFail, openP1: openP1.length, openOther: openOther.length, skippedCritical });
const when = new Date().toISOString().slice(0, 10);
const label = verdict.replace('_', ' ');
const gateTable = gates.length
  ? ['| Gate | Status | Passed | Failed | Expected |', '|---|---|---|---|---|', ...gates.map(g => `| ${g.name} | ${g.status} | ${g.passed ?? '—'} | ${g.failed ?? '—'} | ${g.expected ?? '—'} |`)].join('\n')
  : '_Gates were not run in this render. Run `npm test` to execute them and refresh this file._';
const defectTable = ['| ID | Severity | Status | What | Evidence |', '|---|---|---|---|---|', ...reg.defects.map(d => `| ${d.id} | ${d.severity} | **${d.status}** | ${d.title} | ${d.evidence ?? ''}${d.status === 'OPEN' && d.fix ? ` — Fix: ${d.fix}` : ''} |`)].join('\n');

if (!docsOnly) {
  fs.writeFileSync(path.join(evidenceDir, 'REPORT.md'), [`# Reconcile Audit B — ${when}`, `Verdict: ${verdict}`, `F07: ${f07Verdict}`, `DATABASE_URL: ${process.env.DATABASE_URL ? 'set' : 'unset'}`, '', gateTable, '', `F07: ${f07Verdict} (passed=${f07Parse.passed} failed=${f07Parse.failed})`, '', '> Live snapshot of this run. Canonical state: AI_CONTEXT.md + docs/AI_PROJECT_STATE.* (rendered from docs/STATE_REGISTER.json).'].join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(evidenceDir, 'console.txt'), gates.map(g => `=== ${g.name} ===\n${g.raw}`).join('\n'), 'utf8');
}

const openList = [...openP1, ...openOther].map(d => `- **${d.id}** (${d.severity}, ${d.status}) — ${d.title}`).join('\n') || '- none';
const aiContext = `# A.N ERP AI Context

**A.N ERP (v${reg.project.version})**. Code + live \`evidence/\` supersede stale prose.

**Canonical files:** \`AI_CONTEXT.md\` · \`docs/AI_PROJECT_STATE.md\` · \`docs/AI_PROJECT_STATE.json\` — rendered from \`docs/STATE_REGISTER.json\` (edit that file by hand, then run \`npm test\`).

Last update: **${reg.lastUpdated}** — ${reg.lastChange}

## Verdict
| Field | Value |
|---|---|
| **Authoritative verdict** | **${label}** |
| **Rule** | NO GO = a critical gate failed or an OPEN P1 defect exists · CONDITIONAL GO = only open P2/P3 or configuration conditions · GO = none |
| **Gates this render** | ${gates.length ? `${gates.filter(g => g.status === 'PASS').length}/${gates.length} PASS, F07 ${f07Verdict}` : 'not run (docs-only)'} |

## Open items
${openList}

Full register: \`docs/AI_PROJECT_STATE.md\`.
`;
const stateMd = `# A.N ERP — PROJECT STATE (v${reg.project.version})

**Last update**: ${reg.lastUpdated} — ${reg.lastChange}
**Verdict**: **${label}** (rendered ${when})

## Gates
${gateTable}

## Packages
${reg.packages.map(p => `- **${p.id}** — ${p.status} — ${p.scope}${p.evidence ? ` _(evidence: ${p.evidence})_` : ''}`).join('\n')}

## Defect register
${defectTable}

## Known risks
${reg.knownRisks.map(r => `- ${r}`).join('\n')}

## How to run
- Tests: ${reg.ops.tests}
- PostgreSQL gates: ${reg.ops.pgGates.join(', ')} (print \`PG_NOT_RUN\` without \`DATABASE_URL\`; that proves nothing)
- Environment: ${Object.entries(reg.ops.env).map(([k, v]) => `\`${k}\` (${v})`).join('; ')}

## Policy
${reg.policy}
`;
const stateJson = { ...reg, renderedAt: `${when}T00:00:00Z`, authoritativeVerdict: verdict, f07: { verdict: f07Verdict, passed: f07Parse.passed, failed: f07Parse.failed }, gates: gates.map(g => ({ name: g.name, status: g.status, passed: g.passed, failed: g.failed, expected: g.expected ?? null })), testExecutionMetrics: { status: docsOnly ? 'NOT_RUN' : hardFails.length ? 'HAS_FAILURES' : 'GATES_EXECUTED', evidenceDir: 'evidence/reconcile-audit-b' }, canonicalAuditFiles: ['AI_CONTEXT.md', 'docs/AI_PROJECT_STATE.md', 'docs/AI_PROJECT_STATE.json', 'docs/STATE_REGISTER.json'] };

fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'AI_CONTEXT.md'), aiContext.trim() + '\n', 'utf8');
fs.writeFileSync(path.join(root, 'docs/AI_PROJECT_STATE.md'), stateMd.trim() + '\n', 'utf8');
fs.writeFileSync(path.join(root, 'docs/AI_PROJECT_STATE.json'), JSON.stringify(stateJson, null, 2) + '\n', 'utf8');
console.log(`\n=== AUDIT B SUMMARY ===\nVerdict: ${verdict}\nGates: ${gates.length ? `${gates.filter(g => g.status === 'PASS').length}/${gates.length} PASS, ${hardFails.length} failing` : 'not run (docs-only)'}\nOpen P1: ${openP1.length} | other open/config: ${openOther.length}\nDocs refreshed: AI_CONTEXT.md, docs/AI_PROJECT_STATE.md, docs/AI_PROJECT_STATE.json`);
process.exit(criticalFail || hardFails.length ? 1 : 0);
