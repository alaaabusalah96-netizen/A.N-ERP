/**
 * @file runFullSystemAudit.ts
 * Comprehensive system audit for A.N ERP:
 *   A) Typecheck + build
 *   B) Main battery (runReconcileAuditB)
 *   C) Extra safety scripts (P2P, stock return, custody, seca…)
 *   D) Optional PG strict probes when DATABASE_URL is set
 *   E) Optional live /api/health when FULL_AUDIT_HEALTH=1
 *
 * Run:
 *   npx tsx scripts/runFullSystemAudit.ts
 *   npx tsx scripts/runFullSystemAudit.ts --docs-only   # skip heavy runs; only refresh docs note
 *   DATABASE_URL=... AN_ENFORCE_PROD_ROLE=1 npx tsx scripts/runFullSystemAudit.ts
 *
 * Exit 0 only if no failed gates in required sets.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const docsOnly = process.argv.includes('--docs-only');
const evidenceDir = path.join('evidence', 'full-system-audit');
const reportPath = path.join(evidenceDir, 'REPORT.md');

type StepResult = {
  id: string;
  group: string;
  ok: boolean;
  detail: string;
  required: boolean;
};

function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): { code: number; out: string } {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  return { code: r.status ?? 1, out };
}

function extractPassFail(out: string): { passed: number | null; failed: number | null } {
  const m = out.match(/Passed:\s*(\d+)\s*\|\s*Failed:\s*(\d+)/);
  if (!m) return { passed: null, failed: null };
  return { passed: Number(m[1]), failed: Number(m[2]) };
}

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const results: StepResult[] = [];
  const push = (r: StepResult) => {
    results.push(r);
    console.log(`${r.ok ? '[OK]' : '[FAIL]'} [${r.group}] ${r.id} — ${r.detail}`);
  };

  if (docsOnly) {
    push({ id: 'docs-only', group: 'META', ok: true, detail: 'skipped live runs', required: false });
  } else {
    // A) Lint + build
    {
      const tsc = run('npx', ['tsc', '--noEmit']);
      fs.writeFileSync(path.join(evidenceDir, 'tsc.txt'), tsc.out);
      const errCount = (tsc.out.match(/error TS/g) || []).length;
      push({
        id: 'tsc',
        group: 'A-BUILD',
        ok: tsc.code === 0,
        detail: tsc.code === 0 ? '0 errors' : `exit=${tsc.code} errorTS≈${errCount}`,
        required: true,
      });
    }
    {
      const b = run('npm', ['run', 'build']);
      fs.writeFileSync(path.join(evidenceDir, 'build.txt'), b.out);
      push({
        id: 'build',
        group: 'A-BUILD',
        ok: b.code === 0,
        detail: b.code === 0 ? 'vite+server bundle ok' : `exit=${b.code}`,
        required: true,
      });
    }

    // B) Main battery
    {
      const bat = run('npx', ['tsx', 'scripts/runReconcileAuditB.ts']);
      fs.writeFileSync(path.join(evidenceDir, 'reconcile-audit-b.txt'), bat.out);
      const pf = extractPassFail(bat.out);
      // Also detect Verdict line
      const verdict = (bat.out.match(/Verdict:\s*(\S+)/) || [])[1] || 'UNKNOWN';
      push({
        id: 'reconcile-audit-b',
        group: 'B-BATTERY',
        ok: bat.code === 0,
        detail: `exit=${bat.code} Passed=${pf.passed} Failed=${pf.failed} Verdict=${verdict}`,
        required: true,
      });
    }

    // C) Extra domain safety (may already be inside battery — still re-run for explicit evidence)
    const extras: Array<{ id: string; script: string; required: boolean }> = [
      { id: 'FixP1Custody', script: 'scripts/verifyFixP1Custody.ts', required: true },
      { id: 'FixP1P2pAutopost', script: 'scripts/verifyFixP1P2pAutopost.ts', required: true },
      { id: 'FixStockReturnCumulative', script: 'scripts/verifyFixStockReturnCumulative.ts', required: true },
      { id: 'SecA', script: 'scripts/verifySecA.ts', required: true },
      { id: 'P15Purchasing', script: 'scripts/verifyP15Purchasing.ts', required: true },
      { id: 'P13Costing', script: 'scripts/verifyP13Costing.ts', required: false },
      { id: 'P14AutoJournals', script: 'scripts/verifyP14AutoJournals.ts', required: false },
      { id: 'P16Recon', script: 'scripts/verifyP16Recon.ts', required: false },
    ];
    if (fs.existsSync('scripts/verifySecProdRole.ts')) {
      extras.push({ id: 'SecProdRole', script: 'scripts/verifySecProdRole.ts', required: true });
    }
    for (const e of extras) {
      if (!fs.existsSync(e.script)) {
        push({ id: e.id, group: 'C-DOMAIN', ok: false, detail: 'script missing', required: e.required });
        continue;
      }
      const r = run('npx', ['tsx', e.script]);
      fs.writeFileSync(path.join(evidenceDir, `${e.id}.txt`), r.out);
      const pf = extractPassFail(r.out);
      const ok = r.code === 0 && (pf.failed === null || pf.failed === 0);
      push({
        id: e.id,
        group: 'C-DOMAIN',
        ok,
        detail: `exit=${r.code} Passed=${pf.passed} Failed=${pf.failed}`,
        required: e.required,
      });
    }

    // D) PG probes
    if (process.env.DATABASE_URL) {
      const pgScripts = [
        { id: 'Sec4ProdRole', script: 'scripts/verifySec4ProdRole.ts' },
        { id: 'Sec2bRls', script: 'scripts/verifySec2bRls.ts' },
        { id: 'SecAPg', script: 'scripts/verifySecAPg.ts' },
      ].filter((x) => fs.existsSync(x.script));
      for (const e of pgScripts) {
        const r = run('npx', ['tsx', e.script], {
          AN_ENFORCE_PROD_ROLE: process.env.AN_ENFORCE_PROD_ROLE || '0',
        });
        fs.writeFileSync(path.join(evidenceDir, `${e.id}.txt`), r.out);
        const pf = extractPassFail(r.out);
        push({
          id: e.id,
          group: 'D-PG',
          ok: r.code === 0 && (pf.failed === null || pf.failed === 0),
          detail: `exit=${r.code} Passed=${pf.passed} Failed=${pf.failed}`,
          required: process.env.AN_ENFORCE_PROD_ROLE === '1',
        });
      }
    } else {
      push({
        id: 'pg-suite',
        group: 'D-PG',
        ok: true,
        detail: 'DATABASE_URL unset — PG suite SKIPPED',
        required: false,
      });
    }

    // E) Health (optional)
    if (process.env.FULL_AUDIT_HEALTH === '1') {
      const health = run('curl', ['-s', '-o', path.join(evidenceDir, 'health.json'), '-w', '%{http_code}', 'http://127.0.0.1:3000/api/health']);
      const code = (health.out || '').trim();
      push({
        id: 'api-health',
        group: 'E-LIVE',
        ok: code === '200',
        detail: `HTTP ${code || 'none'} (start server first)`,
        required: false,
      });
    }
  }

  const requiredFailed = results.filter((r) => r.required && !r.ok);
  const optionalFailed = results.filter((r) => !r.required && !r.ok);
  const verdict =
    requiredFailed.length === 0 ? (optionalFailed.length ? 'CONDITIONAL_GO' : 'GO_AUDIT') : 'NO_GO';

  const lines: string[] = [];
  lines.push('# Full System Audit Report');
  lines.push('');
  lines.push(`- Date: ${new Date().toISOString()}`);
  lines.push(`- Verdict: **${verdict}**`);
  lines.push(`- Required failures: ${requiredFailed.length}`);
  lines.push(`- Optional failures: ${optionalFailed.length}`);
  lines.push(`- DATABASE_URL: ${process.env.DATABASE_URL ? 'set' : 'unset'}`);
  lines.push(`- AN_ENFORCE_PROD_ROLE: ${process.env.AN_ENFORCE_PROD_ROLE || '0'}`);
  lines.push('');
  lines.push('| Group | Id | OK | Required | Detail |');
  lines.push('|---|---|---|---|---|');
  for (const r of results) {
    lines.push(`| ${r.group} | ${r.id} | ${r.ok ? 'yes' : 'NO'} | ${r.required ? 'yes' : ''} | ${r.detail.replace(/\|/g, '/')} |`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('- Main battery = `scripts/runReconcileAuditB.ts` (same as `npm test`).');
  lines.push('- PG isolation is only proven when DATABASE_URL uses NOSUPERUSER NOBYPASSRLS and optionally AN_ENFORCE_PROD_ROLE=1.');
  lines.push('- This report does not replace STATE_REGISTER; run `npx tsx scripts/runReconcileAuditB.ts --docs-only` after fixing failures.');
  fs.writeFileSync(reportPath, lines.join('\n') + '\n');
  console.log(`\nReport: ${reportPath}`);
  console.log(`FULL_AUDIT_VERDICT: ${verdict}`);
  console.log(`Required failed: ${requiredFailed.length} | Optional failed: ${optionalFailed.length}`);
  process.exit(requiredFailed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
