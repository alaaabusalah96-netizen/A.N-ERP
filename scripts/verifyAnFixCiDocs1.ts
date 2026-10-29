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
  
  const ciPath = '.github/workflows/ci.yml';
  check('01 CI workflow exists', fs.existsSync(path.join(root, ciPath)));
  const ci = read(ciPath);
  check('02 CI runs build', ci.includes('npm run build'));
  check('03 CI runs verify scripts', ci.includes('scripts/verifyMergeAll.ts') || ci.includes('verify:merge'));
  check('04 CI runs bridge verify', ci.includes('verifyAnAuthBridge1.ts') || ci.includes('verify:auth-bridge'));

  const gitignore = read('.gitignore');
  check('05 .gitignore has report folders', gitignore.includes('playwright-report') || gitignore.includes('test-results'));
  check('06 .gitignore has tar.gz or legacy', gitignore.includes('*.tar.gz') || gitignore.includes('_an_erp_legacy'));

  const flagsPath = 'docs/ops/AN-DEPLOY-FLAGS.md';
  check('07 Deploy flags doc exists', fs.existsSync(path.join(root, flagsPath)));
  const flags = read(flagsPath);
  check('08 AN_ENABLE_AN_LOGIN in flags', flags.includes('AN_ENABLE_AN_LOGIN'));

  const deployment = read('DEPLOYMENT.md');
  check('09 DEPLOYMENT mentions A.N or flags', deployment.includes('A.N') || deployment.includes('AN-DEPLOY-FLAGS'));

  const status = read('docs/MERGE_STATUS.md');
  check('10 FIX-CIDOCS1 exists', status.includes('FIX-CIDOCS1'));
  check('11 FIX-PGROLE1 still in MERGE', status.includes('FIX-PGROLE1'));
  check('12 AUTH-ROLEMAP1 still in MERGE', status.includes('AUTH-ROLEMAP1'));

  const envEx = read('.env.example');
  check('13 .env.example mentions JWT or DB', envEx.includes('JWT_SECRET') || envEx.includes('DATABASE_URL'));
  
  check('14 ci.yml no secrets', !ci.includes('password') || ci.includes('dummy'));

  console.log(`\nPassed: ${passed} | Failed: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('verifyAnFixCiDocs1 crashed:', e?.message || e); process.exit(1); });
