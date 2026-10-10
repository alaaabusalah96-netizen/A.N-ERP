/**
 * Reconcile Audit B — run regression + F07, write evidence, refresh AI_CONTEXT + AI_PROJECT_STATE.
 * Run from repo root: npx tsx scripts/runReconcileAuditB.ts
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = process.cwd();
const evidenceDir = path.join(root, 'evidence', 'reconcile-audit-b');
fs.mkdirSync(evidenceDir, { recursive: true });

type Gate = { name: string; script: string; expected?: number; passed: number | null; failed: number | null; raw: string; status: 'PASS' | 'FAIL' | 'SKIP' | 'ERROR' };

function runTsx(scriptRel: string): { code: number; out: string } {
  const scriptPath = path.join(root, scriptRel);
  if (!fs.existsSync(scriptPath)) {
    return { code: 127, out: `SKIP missing ${scriptRel}\n` };
  }
  const r = spawnSync('npx', ['tsx', scriptRel], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  return { code: r.status ?? 1, out };
}

function parsePassed(out: string): { passed: number | null; failed: number | null } {
  const m = out.match(/Passed:\s*(\d+)\s*\|\s*Failed:\s*(\d+)/);
  if (!m) return { passed: null, failed: null };
  return { passed: Number(m[1]), failed: Number(m[2]) };
}

const BATTERIES: { name: string; script: string; expected?: number }[] = [
  { name: 'Sec1TwoFactor', script: 'scripts/verifySec1TwoFactor.ts', expected: 26 },
  { name: 'Sec2Rls', script: 'scripts/verifySec2Rls.ts', expected: 39 },
  { name: 'P8aProcurement', script: 'scripts/verifyP8aProcurement.ts', expected: 24 },
  { name: 'P8cThreeWay', script: 'scripts/verifyP8cThreeWay.ts', expected: 14 },
  { name: 'P8cFix', script: 'scripts/verifyP8cFix.ts', expected: 19 },
  { name: 'P15Purchasing', script: 'scripts/verifyP15Purchasing.ts', expected: 25 },
  { name: 'F3Acceptance', script: 'scripts/verifyF3Acceptance.ts', expected: 19 },
  { name: 'F2Decisions', script: 'scripts/verifyF2Decisions.ts', expected: 51 },
  { name: 'F4StockShadow', script: 'scripts/verifyF4StockShadow.ts', expected: 14 },
  { name: 'P13Costing', script: 'scripts/verifyP13Costing.ts', expected: 50 },
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
  else status = code === 0 ? 'PASS' : 'FAIL';
  gates.push({ name: b.name, script: b.script, expected: b.expected, passed, failed, raw: out.slice(-2000), status });
  fs.writeFileSync(path.join(evidenceDir, `${b.name}.txt`), out, 'utf8');
}

// F07
process.stdout.write('Running F07...\n');
const f07 = runTsx('scripts/verifyF07StorageRouter.ts');
fs.writeFileSync(path.join(evidenceDir, 'F07.txt'), f07.out, 'utf8');
const f07Parse = parsePassed(f07.out);
const f07Verdict =
  /F07_VERDICT:\s*(\S+)/.exec(f07.out)?.[1] ||
  (f07.code === 0 ? 'PASS' : 'FAIL');
const f07Gate: Gate = {
  name: 'F07StorageRouter',
  script: 'scripts/verifyF07StorageRouter.ts',
  passed: f07Parse.passed,
  failed: f07Parse.failed,
  raw: f07.out.slice(-2000),
  status: f07.code === 0 ? 'PASS' : f07.out.includes('SKIP') ? 'SKIP' : 'FAIL',
};
gates.push(f07Gate);
const hardFails = gates.filter((g) => g.status === 'FAIL');
const allCriticalPass = ['Sec1TwoFactor', 'Sec2Rls', 'P8aProcurement', 'P8cThreeWay'].every((n) => {
  const g = gates.find((x) => x.name === n);
  return g && g.status === 'PASS';
});

let verdict: 'CONDITIONAL_GO' | 'NO_GO' | 'GO' = 'CONDITIONAL_GO';
if (hardFails.some((g) => ['Sec1TwoFactor', 'Sec2Rls', 'P8aProcurement', 'P8cThreeWay'].includes(g.name))) {
  verdict = 'NO_GO';
} else if (allCriticalPass && f07Gate.status === 'PASS' && hardFails.length === 0) {
  verdict = 'CONDITIONAL_GO'; // still conditional while P2-002 open
}

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
      `| ${g.name} | ${g.status} | ${g.passed ?? '-'} | ${g.failed ?? '-'} | ${g.expected ?? '-'} |`
  ),
  '',
  `Hard failures: ${hardFails.map((g) => g.name).join(', ') || 'none'}`,
];
fs.writeFileSync(path.join(evidenceDir, 'REPORT.md'), reportLines.join('\n') + '\n', 'utf8');

// --- rewrite docs ---
const gateLine = (n: string) => {
  const g = gates.find((x) => x.name === n);
  if (!g || g.status === 'SKIP') return `${n}: SKIP`;
  return `${n}: ${g.passed}/${(g.passed ?? 0) + (g.failed ?? 0)} (${g.status})`;
};

const aiContext = `# A.N ERP AI Context

This repository contains the authoritative codebase for **A.N ERP (v7.2.0)**, an enterprise financial and inventory management platform (Egyptian market orientation).

Before performing any architectural modifications, audits, or feature extensions, engineers and AI agents MUST consult:

- [docs/AI_PROJECT_STATE.md](docs/AI_PROJECT_STATE.md) — Technical state, defect register, and scorecard.
- [docs/AI_PROJECT_STATE.json](docs/AI_PROJECT_STATE.json) — Machine-readable state and test metrics.

**Rule:** Code + \`evidence/\` supersede stale prose. Reconciled by **Audit B** on **\${when}** (regression + F-07 probe).

---

## Core Operational Principles

1. **Evidence-Driven Reality** — batteries under \`evidence/reconcile-audit-b/\` are the latest run.
2. **PostgresPrimaryAdapter** — production engine (transactions, FOR UPDATE, RLS + GUC).
3. **InMemoryAdapter** — unit parity.
4. **Invariants** — atomic stock docs, PostingEngine paths for supplier invoices, idempotency keys, SEC-1 2FA, SEC-2 purchasing RLS.

---

## Current Verdict (Audit B)

| Field | Value |
|---|---|
| **Reconcile date** | ${when} |
| **package.json version** | 7.2.0 |
| **Authoritative verdict** | **${verdict.replace('_', ' ')}** |
| **F-07** | ${f07Verdict} |
| **Open defect** | DEF-P2-002 (version-tracked migration engine) |
| **Critical gates** | ${allCriticalPass ? 'PASS' : 'SEE REPORT'} |

Representative results: ${gateLine('Sec1TwoFactor')}; ${gateLine('Sec2Rls')}; ${gateLine('P8aProcurement')}; ${gateLine('P8cThreeWay')}; ${gateLine('F07StorageRouter')}.
`;

const stateMd = `# A.N ERP — RECONCILED MASTER PROJECT STATE (v7.2.0)

**Audit B date**: ${when}  
**package.json version**: \`7.2.0\`  
**Authoritative verdict**: **${verdict.replace('_', ' ')}**  
**F-07 probe**: **${f07Verdict}**  
**Mode**: Reconcile Audit B — batteries re-executed; docs refreshed from raw outputs.

---

## 1. Gate results (this run)

| Gate | Status | Passed | Failed |
|---|---|---|---|
${gates.map((g) => `| ${g.name} | ${g.status} | ${g.passed ?? '—'} | ${g.failed ?? '—'} |`).join('\n')}

Full logs: \`evidence/reconcile-audit-b/\`.

---

## 2. Defect register

| ID | Severity | Status | Notes |
|---|---|---|---|
| DEF-P1-001 | P1 | **FIXED** | Stock document post uses \`postStockDocumentAtomic\`; failure leaves no partial commit |
| DEF-P1-002 | P1 | **FIXED** | Return path checks \`postEntry\` / return journal result; pending retry on failure |
| DEF-P1-003 | P1 | **FIXED** | Cash custody: draft + post both checked; voucher only after successful post |
| DEF-P2-001 | P2 | **FIXED** | PO line qty: \`SELECT … FOR UPDATE\` + DB CHECK on remaining qty |
| DEF-P2-002 | P2 | **OPEN** | No dedicated **version-tracked migration engine** (MigrationLinterService is a linter only) |
| F-07 | ${f07Verdict.includes('PASS') ? 'PROBE_PASS' : f07Verdict.includes('SKIP') ? 'UNPROVEN_PG_SKIPPED' : 'PROBE_FAIL'} | StorageRouter concurrency probe this run |

---

## 3. Security packages

| ID | Status |
|---|---|
| SEC-1 | DONE (gate Sec1TwoFactor: ${gates.find((g) => g.name === 'Sec1TwoFactor')?.status}) |
| SEC-2 | DONE (gate Sec2Rls: ${gates.find((g) => g.name === 'Sec2Rls')?.status}) |

---

## 4. Release decision

**VERDICT: ${verdict.replace('_', ' ')}**

- DEF-P2-002 remains open (architectural).
- F-07 this run: ${f07Verdict}.
- Do not override failing critical gates with documentation claims.
`;

const stateJson = {
  project: {
    name: 'A.N ERP',
    version: '7.2.0',
    description: 'Reconcile Audit B — live battery results',
    stack: {
      backend: ['Node 22', 'Express 4', 'TypeScript'],
      database: 'PostgreSQL',
      frontend: ['React 19', 'Vite', 'Tailwind CSS'],
    },
  },
  reconcileDate: `${when}T00:00:00Z`,
  auditKind: 'RECONCILE_B',
  authoritativeVerdict: verdict,
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
  defects: [
    { id: 'DEF-P1-001', severity: 'P1', status: 'FIXED' },
    { id: 'DEF-P1-002', severity: 'P1', status: 'FIXED' },
    { id: 'DEF-P1-003', severity: 'P1', status: 'FIXED' },
    { id: 'DEF-P2-001', severity: 'P2', status: 'FIXED' },
    { id: 'DEF-P2-002', severity: 'P2', status: 'OPEN' },
  ],
  securityPackages: [
    { id: 'SEC-1', status: 'DONE' },
    { id: 'SEC-2', status: 'DONE' },
  ],
  testExecutionMetrics: {
    status: hardFails.length ? 'HAS_FAILURES' : 'GATES_EXECUTED',
    evidenceDir: 'evidence/reconcile-audit-b',
  },
};

fs.writeFileSync(path.join(root, 'AI_CONTEXT.md'), aiContext.trim() + '\n', 'utf8');
fs.writeFileSync(path.join(root, 'docs/AI_PROJECT_STATE.md'), stateMd.trim() + '\n', 'utf8');
fs.writeFileSync(path.join(root, 'docs/AI_PROJECT_STATE.json'), JSON.stringify(stateJson, null, 2) + '\n', 'utf8');

console.log('\n=== AUDIT B SUMMARY ===');
console.log(reportLines.join('\n'));
console.log('\nDocs refreshed: AI_CONTEXT.md, docs/AI_PROJECT_STATE.md, docs/AI_PROJECT_STATE.json');
process.exit(hardFails.some((g) => ['Sec1TwoFactor', 'Sec2Rls', 'P8aProcurement', 'P8cThreeWay'].includes(g.name)) ? 1 : 0);
