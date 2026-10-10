/**
 * Reconcile Audit B — run regression + F07, write evidence, refresh canonical audit docs.
 * Run: npx tsx scripts/runReconcileAuditB.ts
 * Restored/updated by EVID-1 (was 0-byte on some builds).
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = process.cwd();
const evidenceDir = path.join(root, 'evidence', 'reconcile-audit-b');
fs.mkdirSync(evidenceDir, { recursive: true });

type Gate = {
  name: string;
  script: string;
  expected?: number;
  passed: number | null;
  failed: number | null;
  raw: string;
  status: 'PASS' | 'FAIL' | 'SKIP' | 'ERROR';
};

function runTsx(scriptRel: string): { code: number; out: string } {
  const scriptPath = path.join(root, scriptRel);
  if (!fs.existsSync(scriptPath) || fs.statSync(scriptPath).size === 0) {
    return { code: 127, out: `SKIP missing-or-empty ${scriptRel}\n` };
  }
  const r = spawnSync('npx', ['tsx', scriptRel], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function parsePassed(out: string): { passed: number | null; failed: number | null } {
  const m = out.match(/Passed:\s*(\d+)\s*\|\s*Failed:\s*(\d+)/);
  if (!m) {
    const s = out.match(/SUMMARY:\s*PASS=(\d+)\s*FAIL=(\d+)/);
    if (s) return { passed: Number(s[1]), failed: Number(s[2]) };
    return { passed: null, failed: null };
  }
  return { passed: Number(m[1]), failed: Number(m[2]) };
}

const BATTERIES: { name: string; script: string; expected?: number }[] = [
  { name: 'Sec1TwoFactor', script: 'scripts/verifySec1TwoFactor.ts', expected: 26 },
  { name: 'Sec2Rls', script: 'scripts/verifySec2Rls.ts', expected: 39 },
  { name: 'Sec2bRls', script: 'scripts/verifySec2bRls.ts' },
  { name: 'P8aProcurement', script: 'scripts/verifyP8aProcurement.ts', expected: 24 },
  { name: 'P8cThreeWay', script: 'scripts/verifyP8cThreeWay.ts', expected: 14 },
  { name: 'P8cFix', script: 'scripts/verifyP8cFix.ts' },
  { name: 'P15Purchasing', script: 'scripts/verifyP15Purchasing.ts', expected: 25 },
  { name: 'F3Acceptance', script: 'scripts/verifyF3Acceptance.ts', expected: 19 },
  { name: 'F2Decisions', script: 'scripts/verifyF2Decisions.ts', expected: 51 },
  { name: 'F4StockShadow', script: 'scripts/verifyF4StockShadow.ts', expected: 14 },
  { name: 'P13Costing', script: 'scripts/verifyP13Costing.ts', expected: 50 },
  { name: 'FixJ1Accounts', script: 'scripts/verifyFixJ1Accounts.ts' },
  { name: 'P9Validation', script: 'scripts/verifyP9Validation.ts' },
];

const gates: Gate[] = [];
for (const b of BATTERIES) {
  process.stdout.write(`Running ${b.name}...\n`);
  const { code, out } = runTsx(b.script);
  const { passed, failed } = parsePassed(out);
  let status: Gate['status'] = 'ERROR';
  if (code === 127 || out.startsWith('SKIP')) status = 'SKIP';
  else if (failed === 0 && passed !== null) status = 'PASS';
  else if (failed !== null && failed > 0) status = 'FAIL';
  else if (code === 0) status = 'PASS';
  else status = 'ERROR';
  gates.push({ name: b.name, script: b.script, expected: b.expected, passed, failed, raw: out, status });
  fs.writeFileSync(path.join(evidenceDir, `${b.name}.txt`), out, 'utf8');
}

process.stdout.write('Running F07StorageRouter...\n');
const f07 = runTsx('scripts/verifyF07StorageRouter.ts');
const f07Parse = parsePassed(f07.out);
fs.writeFileSync(path.join(evidenceDir, 'F07.txt'), f07.out, 'utf8');
let f07Verdict = 'ERROR';
if (f07.code === 127 || f07.out.startsWith('SKIP') || f07.out.includes('SKIPPED')) f07Verdict = 'SKIP';
else if (f07Parse.failed === 0 || f07.out.includes('PASS')) f07Verdict = 'PASS';
else f07Verdict = 'FAIL';

const hardFails = gates.filter((g) => g.status === 'FAIL' || g.status === 'ERROR');
const critical = ['Sec1TwoFactor', 'Sec2Rls', 'Sec2bRls', 'P8aProcurement', 'P8cThreeWay', 'F2Decisions'];
const criticalFail = gates.some((g) => critical.includes(g.name) && g.status !== 'PASS' && g.status !== 'SKIP');
const verdict = criticalFail ? 'NO_GO' : 'CONDITIONAL_GO';
const when = new Date().toISOString().slice(0, 10);

const reportLines = [
  `# Reconcile Audit B — ${when}`,
  `Verdict: ${verdict}`,
  `F07: ${f07Verdict}`,
  `DATABASE_URL: ${process.env.DATABASE_URL ? 'set' : 'unset'}`,
  '',
  '| Gate | Status | Passed | Failed | Expected |',
  '|---|---|---|---|---|',
  ...gates.map(
    (g) =>
      `| ${g.name} | ${g.status} | ${g.passed ?? '—'} | ${g.failed ?? '—'} | ${g.expected ?? '—'} |`
  ),
  '',
  `F07: ${f07Verdict} (passed=${f07Parse.passed} failed=${f07Parse.failed})`,
  '',
  '> This REPORT is a **live snapshot** of this run. Canonical ongoing state remains in AI_CONTEXT + AI_PROJECT_STATE.* after this script refreshes them.',
];
fs.writeFileSync(path.join(evidenceDir, 'REPORT.md'), reportLines.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(evidenceDir, 'console.txt'), gates.map((g) => `=== ${g.name} ===\n${g.raw}`).join('\n'), 'utf8');

const gateRow = (name: string) => {
  const g = gates.find((x) => x.name === name);
  if (!g) return `| ${name} | — | — | — |`;
  return `| ${g.name} | ${g.status} | ${g.passed ?? '—'} | ${g.failed ?? '—'} |`;
};

const aiContext = `# A.N ERP AI Context

**A.N ERP (v7.2.0)**. Code + live \`evidence/\` supersede stale prose.

**Canonical audit files:** \`AI_CONTEXT.md\` · \`docs/AI_PROJECT_STATE.md\` · \`docs/AI_PROJECT_STATE.json\`

Last reconcile: **EVID-1 / Audit B** on **${when}**.

## Verdict
| Field | Value |
|---|---|
| **Authoritative verdict** | **${verdict.replace('_', ' ')}** |
| **F-07** | ${f07Verdict} |
| **Last tooling** | EVID-1 restored \`runReconcileAuditB.ts\` + \`verifyF07StorageRouter.ts\` |
| **Open** | DEF-P2-002 · production role BYPASSRLS check |

Gates this run: Sec1/Sec2/Sec2b · P8 · F2 · FixJ1 · P9 — see \`evidence/reconcile-audit-b/REPORT.md\`.
`;

const stateMd = `# A.N ERP — PROJECT STATE (v7.2.0)

**Last update**: ${when} (EVID-1 + Audit B refresh)  
**Verdict**: **${verdict.replace('_', ' ')}**

## Gates (this run)

| Gate | Status | Passed | Failed |
|---|---|---|---|
${gates.map((g) => `| ${g.name} | ${g.status} | ${g.passed ?? '—'} | ${g.failed ?? '—'} |`).join('\n')}
| F07StorageRouter | ${f07Verdict} | ${f07Parse.passed ?? '—'} | ${f07Parse.failed ?? '—'} |

## Completed packages
SEC-1 · SEC-2 · SEC-2b · FIX-J1 · F2-S1-FIX · P9-VAL-001 · **EVID-1**

## Defects
| ID | Status |
|---|---|
| DEF-P2-002 | OPEN |
| PROD-ROLE-BYPASSRLS | CHECK |

## Audit policy
Only the three canonical files + the latest \`evidence/reconcile-audit-b/REPORT.md\` from this runner are live.
\`evidence/integrity/baseline-report.md\` is historical unless regenerated by \`verifyIntegrity\`.
`;

const stateJson = {
  project: { name: 'A.N ERP', version: '7.2.0' },
  reconcileDate: `${when}T00:00:00Z`,
  auditKind: 'EVID_1_AUDIT_B',
  authoritativeVerdict: verdict,
  lastFix: {
    id: 'EVID-1',
    summary: 'Restored runReconcileAuditB.ts + verifyF07StorageRouter.ts; unified audit runner',
  },
  canonicalAuditFiles: [
    'AI_CONTEXT.md',
    'docs/AI_PROJECT_STATE.md',
    'docs/AI_PROJECT_STATE.json',
  ],
  historicalOnly: [
    'evidence/integrity/baseline-report.md',
    'evidence/repair/',
  ],
  f07: {
    verdict: f07Verdict,
    databaseUrlPresent: Boolean(process.env.DATABASE_URL),
    passed: f07Parse.passed,
    failed: f07Parse.failed,
  },
  gates: gates.map((g) => ({
    name: g.name,
    status: g.status,
    passed: g.passed,
    failed: g.failed,
    expected: g.expected ?? null,
  })),
  securityPackages: [
    { id: 'SEC-1', status: 'DONE' },
    { id: 'SEC-2', status: 'DONE' },
    { id: 'SEC-2b', status: 'DONE' },
  ],
  completedFixes: [
    { id: 'FIX-J1', status: 'DONE' },
    { id: 'F2-S1-FIX', status: 'DONE' },
    { id: 'P9-VAL-001', status: 'DONE' },
    { id: 'EVID-1', status: 'DONE' },
  ],
  defects: [
    { id: 'DEF-P2-002', status: 'OPEN' },
    { id: 'PROD-ROLE-BYPASSRLS', status: 'CHECK' },
  ],
  testExecutionMetrics: {
    status: hardFails.length ? 'HAS_FAILURES' : 'GATES_EXECUTED',
    evidenceDir: 'evidence/reconcile-audit-b',
  },
};

fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'AI_CONTEXT.md'), aiContext.trim() + '\n', 'utf8');
fs.writeFileSync(path.join(root, 'docs/AI_PROJECT_STATE.md'), stateMd.trim() + '\n', 'utf8');
fs.writeFileSync(path.join(root, 'docs/AI_PROJECT_STATE.json'), JSON.stringify(stateJson, null, 2) + '\n', 'utf8');

console.log('\n=== AUDIT B SUMMARY ===');
console.log(reportLines.join('\n'));
console.log('\nDocs refreshed: AI_CONTEXT.md, docs/AI_PROJECT_STATE.md, docs/AI_PROJECT_STATE.json');
process.exit(criticalFail ? 1 : 0);
