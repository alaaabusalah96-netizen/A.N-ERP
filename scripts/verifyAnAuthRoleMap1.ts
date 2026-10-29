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
  
  check('01 anRoleMap.ts exists', fs.existsSync(path.join(root, 'src/lib/anRoleMap.ts')));
  
  const mapSource = read('src/lib/anRoleMap.ts');
  check('02 mapAnRoleToAppUiRole exported', mapSource.includes('export function mapAnRoleToAppUiRole'));
  check('03 ROLE_MAP contains accountant/auditor', mapSource.toLowerCase().includes('accountant') && mapSource.toLowerCase().includes('auditor'));
  check('04 defaultPermissionsForRole present', mapSource.includes('export function defaultPermissionsForRole'));
  
  const loginTsx = read('src/pages/Login.tsx');
  check('05 Login imports anRoleMap', loginTsx.includes('anRoleMap') || loginTsx.includes('mapAnRoleToAppUiRole'));
  check('06 Login does not contain /admin/i regex map', !loginTsx.includes('/admin/i.test'));
  check('07 Login does not contain password.trim()', !loginTsx.includes('password.trim()'));
  check('08 Login uses mapAnRoleToAppUiRole', loginTsx.includes('mapAnRoleToAppUiRole('));
  check('09 Login uses defaultPermissionsForRole', loginTsx.includes('defaultPermissionsForRole('));
  
  const server = read('server.ts');
  const meRouteCount = (server.match(/app\.get\("\/api\/an\/auth\/me"/g) || []).length;
  check('10 single or no duplicate me route', meRouteCount === 1);
  
  const status = read('docs/MERGE_STATUS.md');
  check('11 AUTH-REFRESH1 exists', status.includes('AUTH-REFRESH1'));
  check('12 AUTH-COOKIES1 exists', status.includes('AUTH-COOKIES1'));
  check('13 AUTH-BRIDGE1 exists', status.includes('AUTH-BRIDGE1'));
  check('14 AUTH-ROLEMAP1 row in MERGE_STATUS', status.includes('AUTH-ROLEMAP1'));

  check('15 requireAnMigrateOperator present', server.includes('requireAnMigrateOperator'));
  check('16 signInWithCustomToken remains in Login', loginTsx.includes('signInWithCustomToken'));

  console.log(`\nPassed: ${passed} | Failed: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('verifyAnAuthRoleMap1 crashed:', e?.message || e); process.exit(1); });
