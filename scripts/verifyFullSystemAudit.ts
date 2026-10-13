/**
 * @file verifyFullSystemAudit.ts
 * Ensures full-audit runner is present and wired.
 * Run: npx tsx scripts/verifyFullSystemAudit.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}${extra ? ' | ' + extra : ''}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const src = fs.readFileSync('scripts/runFullSystemAudit.ts', 'utf8');
check('S1 runner exists', fs.existsSync('scripts/runFullSystemAudit.ts'));
check('S2 has build gate', /npm.*build|run\('npm'/.test(src));
check('S3 runs reconcile battery', /runReconcileAuditB/.test(src));
check('S4 domain extras custody\/p2p\/stock return', /verifyFixP1Custody/.test(src) && /verifyFixP1P2pAutopost/.test(src) && /verifyFixStockReturnCumulative/.test(src));
check('S5 writes evidence report', /full-system-audit/.test(src) && /REPORT\.md/.test(src));
check('S6 package script', /runFullSystemAudit/.test(fs.readFileSync('package.json', 'utf8')));
check('S7 docs-only flag supported', /docs-only/.test(src));
check('S8 PG section present', /DATABASE_URL/.test(src) && /Sec4ProdRole/.test(src));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
