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
  
  const server = read('server.ts');
  check('01 routes present', server.includes('/api/an/auth/refresh') && server.includes('/api/an/auth/logout') && server.includes('/api/an/auth/me'));
  
  check('02 rotateRefreshToken referenced', server.includes('rotateRefreshToken'));
  check('03 anAuthCookies used on refresh', server.includes('accessCookieOptions') && server.includes('refreshCookieOptions'));
  
  check('04 clearCookie on logout', server.includes('clearAnAuthCookieOptions'));
  
  check('05 me uses authenticateSessionOrBearer', server.includes('/api/an/auth/me') && server.includes('authenticateSessionOrBearer'));
  
  // check('06 no passwordHash in me', !server.includes('passwordHash')); // False positive: verify-credentials uses it.
  check('06 no passwordHash in me route', !server.slice(server.indexOf('/api/an/auth/me'), server.indexOf('/api/an/auth/me') + 1000).includes('passwordHash'));
  
  const status = read('docs/MERGE_STATUS.md');
  check('07 AUTH-COOKIES1 exists', status.includes('AUTH-COOKIES1'));
  check('08 AUTH-REFRESH1 exists', status.includes('AUTH-REFRESH1'));
  
  check('09 TokenService used', server.includes('TokenService'));
  check('10 FIX-SEC1 exists', status.includes('FIX-SEC1'));
  
  check('11 plane an-auth-refresh-me-1 present', server.includes('an-auth-refresh-me-1'));
  check('12 requireAnMigrateOperator present', server.includes('requireAnMigrateOperator'));
  
  console.log(`\nPassed: ${passed} | Failed: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('verifyAnAuthRefreshMe1 crashed:', e?.message || e); process.exit(1); });
