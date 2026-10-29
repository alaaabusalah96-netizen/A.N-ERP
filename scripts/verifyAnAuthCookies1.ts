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
  check('01 anAuthCookies.ts exists', fs.existsSync(path.join(root, 'src/lib/anAuthCookies.ts')));
  
  const cookies = read('src/lib/anAuthCookies.ts');
  check('02 AN_ACCESS_COOKIE/AN_REFRESH_COOKIE defined', cookies.includes('AN_ACCESS_COOKIE') && cookies.includes('AN_REFRESH_COOKIE'));
  check('03 accessCookieOptions httpOnly', cookies.includes('httpOnly: true'));
  
  const server = read('server.ts');
  check('04 server sets cookie an_access', server.includes('res.cookie(AN_ACCESS_COOKIE'));
  check('05 authenticateSessionOrBearer reads an_access cookie', server.includes('req.cookies?.an_access'));
  check('06 logout clears cookies', server.includes('res.clearCookie(AN_ACCESS_COOKIE'));
  
  const loginTsx = read('src/pages/Login.tsx');
  check('07 Login.tsx no sessionStorage writes', !loginTsx.includes('sessionStorage.setItem(\'an_access_token\''));
  
  const status = read('docs/MERGE_STATUS.md');
  check('08 AUTH-BRIDGE1 exists', status.includes('AUTH-BRIDGE1'));
  check('09 AUTH-COOKIES1 exists', status.includes('AUTH-COOKIES1'));
  
  check('10 cookie-parser still used', server.includes('cookieParser'));
  check('11 signInWithCustomToken still in Login', loginTsx.includes('signInWithCustomToken'));
  check('12 requireAnMigrateOperator present', server.includes('requireAnMigrateOperator'));
  check('13 assertUserCanAccessCompany present', server.includes('assertUserCanAccessCompany'));
  check('14 FIX-SEC1 exists', status.includes('FIX-SEC1'));

  console.log(`\nPassed: ${passed} | Failed: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('verifyAnAuthCookies1 crashed:', e?.message || e); process.exit(1); });
