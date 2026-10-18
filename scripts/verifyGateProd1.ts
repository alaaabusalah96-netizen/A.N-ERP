/**
 * @file verifyGateProd1.ts
 * GATE-PROD-1 — production readiness gate.
 * Run: npx tsx scripts/verifyGateProd1.ts
 */
import fs from 'fs';
import { evaluateGateProd, GATE_REQUIRED_PACKAGES } from '../src/core/platform/GateProdService';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const server = fs.readFileSync('server.ts', 'utf8');
const svc = fs.readFileSync('src/core/platform/GateProdService.ts', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));
const packagesDone = (reg.packages || []).filter((p: any) => p.status === 'DONE').map((p: any) => p.id);
const openP1 = (reg.defects || []).filter((d: any) => d.status === 'OPEN' && String(d.severity || '').toUpperCase() === 'P1').length;
const configIds = (reg.defects || []).filter((d: any) => d.status === 'CONFIG').map((d: any) => d.id);

const report = evaluateGateProd({
  packagesDone,
  requiredPackages: GATE_REQUIRED_PACKAGES,
  openP1Count: openP1,
  configDefectIds: configIds,
  hasHealthRoute: true,
  hasConsolRoute: packagesDone.includes('CONSOL-1'),
  hasGroupReportRoute: packagesDone.includes('RPT-GROUP-1'),
  hasXcompanyRoutes: packagesDone.includes('STK-XCOMPANY-1'),
  hasEntityCloseRoutes: packagesDone.includes('ACC-ENTITY-CLOSE-1'),
});

check('S1 evaluateGateProd exported', /export function evaluateGateProd/.test(svc));
check('S2 GATE_REQUIRED_PACKAGES non-empty', GATE_REQUIRED_PACKAGES.length >= 6);
check('S3 no open P1 in register', openP1 === 0);
check('S4 required packages mostly DONE', GATE_REQUIRED_PACKAGES.filter((id) => packagesDone.includes(id)).length >= 6);
check('S5 verdict is GO or CONDITIONAL_GO', report.verdict === 'GO' || report.verdict === 'CONDITIONAL_GO');
check('S6 failCount is 0', report.failCount === 0);
check('S7 CONFIG yields WARN when present', configIds.length === 0 || report.warnCount >= 1);
check('S8 route platform', /app\.get\('\/api\/platform\/gate-prod',\s*requirePlatformAdmin/.test(server));
check('S9 route uses evaluateGateProd', /gate-prod[\s\S]{0,1200}evaluateGateProd/.test(server));
check('S10 GateProdService file', fs.existsSync('src/core/platform/GateProdService.ts'));
check('S11 docs exist', fs.existsSync('docs/GATE_PROD_1.md'));
check('S12 CONSOL-1 still DONE', byId['CONSOL-1']?.status === 'DONE');
check('R1 GATE-PROD-1 DONE', byId['GATE-PROD-1']?.status === 'DONE');
check('R2 waves core packages present', ['ORG-GROUP-1', 'STK-XCOMPANY-1', 'CONSOL-1'].every((id) => byId[id]?.status === 'DONE'));

console.log(`
Passed: ${pass} | Failed: ${fail}`);
console.log(`Gate verdict (from register): ${report.verdict}`);
process.exit(fail ? 1 : 0);
