/**
 * verifyAnPlaneAll.ts — AN-GATE-E1 structural gate for A1–D3 plane packages.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`[PASS] ${name}`);
    passed++;
  } else {
    console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

const root = process.cwd();
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');

const requiredFiles = [
  'src/lib/anDataPlane.ts',
  'src/lib/anSessionPlane.ts',
  'src/lib/anInventoryRead.ts',
  'src/lib/anAccountingRead.ts',
  'src/lib/anPurchasingRead.ts',
  'src/lib/anModulesOverview.ts',
  'src/lib/anShadowStatus.ts',
  'src/lib/anEntityMap.ts',
  'src/lib/anMigrationReadiness.ts',
];
for (const rel of requiredFiles) {
  check(`file:${rel}`, fs.existsSync(path.join(root, rel)));
}

const routes = [
  '/api/an/data-plane/status',
  '/api/an/data-plane/company/',
  '/api/an/data-plane/live-check',
  '/api/an/session-plane',
  '/api/an/inventory/summary',
  '/api/an/accounting/summary',
  '/api/an/purchasing/summary',
  '/api/an/modules/overview',
  '/api/an/shadow/status',
  '/api/an/map/entities',
  '/api/an/migration/readiness',
];
for (const r of routes) {
  check(`route:${r}`, server.includes(r));
  check(`catalog:${r}`, api.includes(r));
}

check('login-intact', login.includes('/api/auth/verify-credentials'));
check('no-an-login-page', !fs.existsSync(path.join(root, 'src/pages/AnLogin.tsx')));

const inv = fs.readFileSync(path.join(root, 'src/pages/Inventory.tsx'), 'utf8');
const acc = fs.readFileSync(path.join(root, 'src/pages/Accounting.tsx'), 'utf8');
const pur = fs.readFileSync(path.join(root, 'src/pages/Purchasing.tsx'), 'utf8');
check('kemit-inv-custody', inv.includes('CustodyDB'));
check('kemit-acc-custody', acc.includes('CustodyDB'));
check('kemit-pur-custody', pur.includes('CustodyDB'));

const ready = fs.readFileSync(path.join(root, 'src/lib/anMigrationReadiness.ts'), 'utf8');
const shadow = fs.readFileSync(path.join(root, 'src/lib/anShadowStatus.ts'), 'utf8');
check('ready-no-migrate-auth', ready.includes('migrateAuthorized: false'));
check('ready-no-cutover', ready.includes('cutoverApproved: false'));
check('shadow-no-cutover', shadow.includes('cutoverApproved: false'));
check('status-doc-d3', statusDoc.includes('D3'));
check('status-doc-c5', statusDoc.includes('C5'));

const subs = [
  'scripts/verifyAnDataPlaneA1.ts',
  'scripts/verifyAnDataPlaneA4.ts',
  'scripts/verifyAnAuthPlaneB3.ts',
  'scripts/verifyAnModuleOverviewC5.ts',
  'scripts/verifyAnShadowD1.ts',
  'scripts/verifyAnMapD2.ts',
  'scripts/verifyAnReadyD3.ts',
];
for (const script of subs) {
  const exists = fs.existsSync(path.join(root, script));
  check(`sub-exists:${path.basename(script)}`, exists);
  if (!exists) continue;
  const r = spawnSync('npx', ['tsx', script], { cwd: root, encoding: 'utf8', shell: false });
  check(`sub-run:${path.basename(script)}`, r.status === 0, `exit=${r.status}`);
}

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
