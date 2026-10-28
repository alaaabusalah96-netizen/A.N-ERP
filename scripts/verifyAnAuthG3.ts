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
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');

check('S1 login-target fetch in Login', login.includes('/api/an/auth/login-target'));
check('S2 an auth login POST in Login', login.includes('/api/an/auth/login'));
check('S3 verify-credentials retained', login.includes('/api/auth/verify-credentials'));
check('S4 loginMode an|firebase', login.includes("'an'") && login.includes('firebase'));
check('S5 anLoginFlag check', login.includes('anLoginFlag'));
check('S6 sessionStorage an_access_token', login.includes('an_access_token'));
check('S7 server an login route', server.includes('/api/an/auth/login'));
check('S8 server verify-credentials', server.includes('/api/auth/verify-credentials'));
check('S9 MERGE G3', statusDoc.includes('G3'));
check('S10 no cutoverApproved true in Login', !login.includes('cutoverApproved: true'));
check('S11 onLoginSuccess still used', login.includes('onLoginSuccess'));
check('S12 tenantId for an path', login.includes('tenantId'));
check('S13 G2 module still present', fs.existsSync(path.join(root, 'src/lib/anAuthLogin.ts')));
check('S14 Firebase customToken path still in file', login.includes('signInWithCustomToken') || login.includes('customToken'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
