import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}`); }
}
const read = (p: string): string => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

async function main(): Promise<void> {
  const root = process.cwd();
  check('01 anAuthBridge.ts exists', fs.existsSync(path.join(root, 'src/lib/anAuthBridge.ts')));
  
  const bridge = read('src/lib/anAuthBridge.ts');
  check('02 issueFirebaseCustomTokenForAnUser exported', bridge.includes('export async function issueFirebaseCustomTokenForAnUser'));
  
  const login = read('src/lib/anAuthLogin.ts');
  check('03 AnLoginOk extended', login.includes('firebaseCustomToken') && login.includes('firebaseBridge'));
  
  const server = read('server.ts');
  check('04 login route integrates anAuthBridge', server.includes('issueFirebaseCustomTokenForAnUser') && server.includes('payload.firebaseCustomToken'));
  check('05 authenticateSessionOrBearer accepts A.N JWT', server.includes('verifyAccessToken') && server.includes('anAuthJwt'));
  
  const loginTsx = read('src/pages/Login.tsx');
  check('06 Login.tsx handles firebaseCustomToken', loginTsx.includes('signInWithCustomToken') && loginTsx.includes('firebaseCustomToken'));
  
  const status = read('docs/MERGE_STATUS.md');
  check('07 FIX-SEC1 exists', status.includes('FIX-SEC1'));
  check('08 FIX-STORE1 exists', status.includes('FIX-STORE1'));
  check('09 AUTH-BRIDGE1 exists', status.includes('AUTH-BRIDGE1'));
  
  check('10 requireAnMigrateOperator present', server.includes('requireAnMigrateOperator'));
  check('11 assertUserCanAccessCompany present', server.includes('assertUserCanAccessCompany'));
  check('12 verify-credentials route present', server.includes('/api/auth/verify-credentials'));
  
  const envEx = read('.env.example');
  check('13 AN_ENABLE_AN_LOGIN not forced to 1', !envEx.match(/AN_ENABLE_AN_LOGIN=1/));
  check('14 plane an-auth present', server.includes('plane: "an-auth-g2"'));

  console.log(`\nPassed: ${passed} | Failed: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('verifyAnAuthBridge1 crashed:', e?.message || e); process.exit(1); });
