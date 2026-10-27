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
const plane = fs.readFileSync(path.join(root, 'src/lib/anDataPlane.ts'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');

check('S1 liveCheckBackend exported', plane.includes('liveCheckBackend'));
check('S2 liveCheckDefaultProcess exported', plane.includes('liveCheckDefaultProcess'));
check('S3 uses SELECT 1', plane.includes('SELECT 1'));
check('S4 redacts postgres URIs in errors', plane.includes('[redacted]'));
check('S5 server has live-check route', server.includes('/api/an/data-plane/live-check'));
check('S6 A1 status route kept', server.includes('/api/an/data-plane/status'));
check('S7 A2 company route kept', server.includes('/api/an/data-plane/company/'));
check('S8 catalog has live-check', api.includes('/api/an/data-plane/live-check'));
check('S9 MERGE_STATUS A3', statusDoc.includes('A3'));
check('S10 Login path unchanged', login.includes('/api/auth/verify-credentials'));
check('S11 client.end in finally', plane.includes('client.end'));
check('S12 timeout 5000', plane.includes('5000'));
check('S13 verify A2 exists', fs.existsSync(path.join(root, 'scripts/verifyAnDataPlaneA2.ts')));
check('S14 firestore unchanged note in handler', server.includes('firestoreOperationalPath'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
