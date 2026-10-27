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
const sp = path.join(root, 'src/lib/anSessionPlane.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');

check('S1 anSessionPlane.ts exists', fs.existsSync(sp));
const body = fs.readFileSync(sp, 'utf8');
check('S2 buildSessionPlane exported', body.includes('buildSessionPlane'));
check('S3 uses resolveAuthPolicyServer', body.includes('resolveAuthPolicyServer'));
check('S4 uses probeCompanyPlane', body.includes('probeCompanyPlane'));
check('S5 server has /api/an/session-plane', server.includes('/api/an/session-plane'));
check('S6 catalog entry', api.includes('/api/an/session-plane'));
check('S7 MERGE_STATUS B1', statusDoc.includes('B1'));
check('S8 Login still verify-credentials', login.includes('/api/auth/verify-credentials'));
check('S9 A4 persist still present', server.includes('an_backend_version'));
check('S10 live-check still present', server.includes('/api/an/data-plane/live-check'));
check('S11 optional live via query', server.includes('runLive') || server.includes('live === "1"'));
check('S12 loginPath constant in module', body.includes('/api/auth/verify-credentials'));
check('S13 firestoreOperationalPath unchanged', body.includes("firestoreOperationalPath: 'unchanged'") || body.includes('firestoreOperationalPath: "unchanged"'));
check('S14 no AnLogin page', !fs.existsSync(path.join(root, 'src/pages/AnLogin.tsx')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
