/**
 * verifyAnDataPlaneA1.ts
 */
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
const planePath = path.join(root, 'src/lib/anDataPlane.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const statusDoc = fs.existsSync(path.join(root, 'docs/MERGE_STATUS.md'))
  ? fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8')
  : '';

check('S1 anDataPlane.ts exists', fs.existsSync(planePath));
const plane = fs.readFileSync(planePath, 'utf8');
check('S2 probeBackendBinding exported', plane.includes('probeBackendBinding'));
check('S3 probeDefaultProcessPlane exported', plane.includes('probeDefaultProcessPlane'));
check('S4 never returns secret values', !plane.includes('env[ref]!') || plane.includes('envRefPresent'));
check('S5 server has /api/an/data-plane/status', server.includes('/api/an/data-plane/status'));
check('S6 server still has storage-status', server.includes('/api/an/storage-status'));
check('S7 storage-status mentions dataPlane or processPlane', server.includes('dataPlane') || server.includes('processPlane'));
check('S8 catalog lists data-plane route', api.includes('/api/an/data-plane/status'));
check('S9 Login still verify-credentials', login.includes('/api/auth/verify-credentials'));
check('S10 no AnLogin page', !fs.existsSync(path.join(root, 'src/pages/AnLogin.tsx')));
check('S11 MERGE_STATUS mentions DATAPLANE or A1', /DATAPLANE|Data plane|A1/i.test(statusDoc));
check('S12 company-backend route kept', server.includes('/api/an/company-backend'));
check('S13 auth-policy kept', server.includes('/api/an/auth-policy'));
check('S14 anBridge still present', fs.existsSync(path.join(root, 'src/lib/anBridge.ts')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
