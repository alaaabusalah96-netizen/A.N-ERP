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
const runbookPath = path.join(root, 'docs/ops/DUAL_PATH_RUNBOOK.md');
const opsPath = path.join(root, 'src/lib/anOpsRunbook.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src/lib/anBridge.ts'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');

check('S1 DUAL_PATH_RUNBOOK.md exists', fs.existsSync(runbookPath));
const md = fs.readFileSync(runbookPath, 'utf8');
check('S2 runbook cutover false', md.includes('cutoverApproved: false'));
check('S3 runbook migrate false', md.includes('migrateAuthorized: false'));

check('S4 anOpsRunbook exists', fs.existsSync(opsPath));
const body = fs.readFileSync(opsPath, 'utf8');
check('S5 getDualPathRunbook exported', body.includes('getDualPathRunbook'));

check('S6 server route ops/runbook', server.includes('/api/an/ops/runbook'));
check('S7 catalog E2', api.includes('/api/an/ops/runbook'));
check('S8 fetchOpsRunbook in bridge', bridge.includes('fetchOpsRunbook'));
check('S9 MERGE_STATUS E2', statusDoc.includes('E2'));
check('S10 no write/migrate function in anOpsRunbook', !body.includes('docSet') && !body.includes('dbSetDoc') && !body.includes('COPY'));
check('S11 E1 verify exists', fs.existsSync(path.join(root, 'scripts/verifyAnPlaneAll.ts')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
