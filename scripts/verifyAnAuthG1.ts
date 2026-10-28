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
const mod = path.join(root, 'src/lib/anAuthLoginTarget.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const dec = fs.readFileSync(path.join(root, 'docs/MERGE_DECISIONS.md'), 'utf8');

check('S1 anAuthLoginTarget exists', fs.existsSync(mod));
const body = fs.readFileSync(mod, 'utf8');
check('S2 buildAnLoginTargetStatus', body.includes('buildAnLoginTargetStatus'));
check('S3 target an-style-session', body.includes('an-style-session'));
check('S4 interim firebase-session', body.includes('firebase-session'));
check('S5 AN_ENABLE_AN_LOGIN flag helper', body.includes('AN_ENABLE_AN_LOGIN'));
check('S6 server route login-target', server.includes('/api/an/auth/login-target'));
check('S7 catalog entry', api.includes('/api/an/auth/login-target'));
check('S8 Login still CF path', login.includes('/api/auth/verify-credentials'));
check('S9 MERGE_STATUS G1', statusDoc.includes('G1'));
check('S10 decisions D-AUTH still present', dec.includes('D-AUTH'));
check('S11 cutoverApproved false in module', body.includes('cutoverApproved: false'));
check('S12 TokenService still on disk', fs.existsSync(path.join(root, 'src/an-core/auth/TokenService.ts')));
check('S13 no Login.tsx import of anAuthLoginTarget', !login.includes('anAuthLoginTarget'));
check('S14 verify-credentials route still on server', server.includes('/api/auth/verify-credentials'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
