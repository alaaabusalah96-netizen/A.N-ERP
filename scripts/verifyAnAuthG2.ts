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
const mod = path.join(root, 'src/lib/anAuthLogin.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');

check('S1 anAuthLogin exists', fs.existsSync(mod));
const body = fs.readFileSync(mod, 'utf8');
check('S2 anStyleLogin', body.includes('anStyleLogin'));
check('S3 argon2.verify usage', body.includes('argon2.verify'));
check('S4 TokenService import', body.includes('TokenService'));
check('S5 AN_ENABLE_AN_LOGIN gate', body.includes('resolveAnLoginFlag') || body.includes('AN_ENABLE_AN_LOGIN'));
check('S6 server route auth/login', server.includes('/api/an/auth/login'));
check('S7 catalog', api.includes('/api/an/auth/login'));
check('S8 Login still CF path', login.includes('/api/auth/verify-credentials'));
check('S9 verify-credentials still on server', server.includes('/api/auth/verify-credentials'));
check('S10 JWT_SECRET handling', body.includes('JWT_SECRET'));
const returnMatch = body.match(/user:\s*\{[\s\S]*?\}/);
check('S11 no passwordHash in return user payload', returnMatch ? !returnMatch[0].includes('passwordHash') : false);
check('S12 MERGE_STATUS G2', statusDoc.includes('G2'));
check('S13 G1 login-target still present', server.includes('/api/an/auth/login-target'));
check('S14 cutover not approved', !body.includes('cutoverApproved: true'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
