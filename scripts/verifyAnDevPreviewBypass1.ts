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
  
  check('01 anPreviewBypass.ts exists', fs.existsSync(path.join(root, 'src/lib/anPreviewBypass.ts')));
  const bypassSource = read('src/lib/anPreviewBypass.ts');
  check('02 buildPreviewAdminUser role SystemAdmin', bypassSource.includes("role: 'SystemAdmin'"));
  check('03 is_platform_owner true', bypassSource.includes('is_platform_owner: true'));
  check('04 isPreviewBypassEnvEnabled present', bypassSource.includes('export function isPreviewBypassEnvEnabled'));

  const loginTsx = read('src/pages/Login.tsx');
  check('05 Login fetches preview-bypass-status', loginTsx.includes('preview-bypass-status'));
  check('06 Login contains buildPreviewAdminUser', loginTsx.includes('buildPreviewAdminUser'));
  check('07 Login has bypass button click handler', loginTsx.includes('onLoginSuccess(user)'));

  const server = read('server.ts');
  check('08 server route preview-bypass-status', server.includes('/api/an/auth/preview-bypass-status'));
  check('09 requireAnMigrateOperator present', server.includes('requireAnMigrateOperator'));

  check('10 STRICT_PROD_SECURITY in bypass source', bypassSource.includes('STRICT_PROD_SECURITY'));
  
  const envEx = read('.env.example');
  check('11 .env.example AN_PREVIEW_BYPASS', envEx.includes('AN_PREVIEW_BYPASS'));

  const status = read('docs/MERGE_STATUS.md');
  check('12 MERGE DEV-PREVIEW1', status.includes('DEV-PREVIEW1'));
  
  check('13 bypass disabled by default in logic', bypassSource.includes('if (!on) return false'));
  
  const roleMapSource = read('src/lib/anRoleMap.ts');
  check('14 AUTH-ROLEMAP map present', roleMapSource.includes('ROLE_MAP'));

  console.log(`\nPassed: ${passed} | Failed: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('verifyAnDevPreviewBypass1 crashed:', e?.message || e); process.exit(1); });
