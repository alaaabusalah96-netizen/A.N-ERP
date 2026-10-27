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

check('S1 probeCompanyPlane exported', plane.includes('probeCompanyPlane'));
check('S2 companyRecordToPartial exported', plane.includes('companyRecordToPartial'));
check('S3 server has data-plane/company route', server.includes('/api/an/data-plane/company/'));
check('S4 server still has data-plane/status', server.includes('/api/an/data-plane/status'));
check('S5 company-backend still present', server.includes('/api/an/company-backend'));
check('S6 catalog has company plane path', api.includes('/api/an/data-plane/company/:companyId'));
check('S7 MERGE_STATUS mentions A2', statusDoc.includes('A2'));
check('S8 Login unchanged path', login.includes('/api/auth/verify-credentials'));
check('S9 no secret URI logging helpers', !plane.includes('password='));
check('S10 A1 functions still present', plane.includes('probeDefaultProcessPlane'));
check('S11 adminDb company read referenced', server.includes('collection("companies")') && server.includes('data-plane/company'));
check('S12 verify A1 script still exists', fs.existsSync(path.join(root, 'scripts/verifyAnDataPlaneA1.ts')));
check('S13 anBridge present', fs.existsSync(path.join(root, 'src/lib/anBridge.ts')));
check('S14 firestoreOperationalPath string in server response path', server.includes('firestoreOperationalPath'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
