import fs from 'fs';
import path from 'path';

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
const dryPath = path.join(root, 'src/lib/anMigrateInventoryDry.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src/lib/anBridge.ts'), 'utf8');
const invPage = fs.readFileSync(path.join(root, 'src/pages/Inventory.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');

check('S1 anMigrateInventoryDry exists', fs.existsSync(dryPath));
const body = fs.readFileSync(dryPath, 'utf8');
check('S2 buildInventoryMigrateDryRun exported', body.includes('buildInventoryMigrateDryRun'));
check('S3 dryRun true', body.includes('dryRun: true'));
check('S4 writesPerformed false', body.includes('writesPerformed: false'));
check('S5 server route migrate/inventory/dry-run', server.includes('/api/an/migrate/inventory/dry-run'));
check('S6 catalog F1', api.includes('/api/an/migrate/inventory/dry-run'));
check('S7 fetchInventoryMigrateDryRun in bridge', bridge.includes('fetchInventoryMigrateDryRun'));
check('S8 MERGE_STATUS F1', statusDoc.includes('F1'));
check('S9 no data write or migration in dry module', !body.includes('docSet') && !body.includes('dbSetDoc') && !body.includes('COPY'));
check('S10 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S11 Inventory.tsx CustodyDB', invPage.includes('CustodyDB'));
check('S12 readiness still exists', fs.existsSync(path.join(root, 'src/lib/anMigrationReadiness.ts')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
