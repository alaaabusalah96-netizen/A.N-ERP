import fs from 'fs';
import path from 'path';
import os from 'os';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { console.log(`[PASS] ${name}`); passed++; }
  else { console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

const root = process.cwd();
const read = (p: string) => (fs.existsSync(path.join(root, p)) ? fs.readFileSync(path.join(root, p), 'utf8') : '');
const readJson = (p: string) => { try { return JSON.parse(read(p)); } catch { return null; } };

function runChecks(context: { root: string, nodeVersion: string }) {
  const localRead = (p: string) => (fs.existsSync(path.join(context.root, p)) ? fs.readFileSync(path.join(context.root, p), 'utf8') : '');
  const localReadJson = (p: string) => { try { return JSON.parse(localRead(p)); } catch { return null; } };

  const pkg = localReadJson('package.json');
  const lock = localReadJson('package-lock.json');
  const nvmContent = localRead('.nvmrc').trim();
  const ciYaml = localRead('.github/workflows/ci.yml');
  const statusDoc = localRead('docs/MERGE_STATUS.md');

  let localPassed = 0;
  let localFailed = 0;
  const results: { name: string, pass: boolean, detail?: string }[] = [];

  function lCheck(name: string, cond: boolean, detail = '') {
    results.push({ name, pass: cond, detail });
    if (cond) localPassed++; else localFailed++;
  }

  lCheck('01 package.json exists', fs.existsSync(path.join(context.root, 'package.json')));
  lCheck('02 package-lock.json exists', fs.existsSync(path.join(context.root, 'package-lock.json')));
  lCheck('03 .nvmrc exists', fs.existsSync(path.join(context.root, '.nvmrc')));
  lCheck('04 ci.yml exists', fs.existsSync(path.join(context.root, '.github/workflows/ci.yml')));
  lCheck('05 MERGE_STATUS exists', fs.existsSync(path.join(context.root, 'docs/MERGE_STATUS.md')));

  if (pkg && lock) {
    lCheck('09 package.json name = kemit-erp', pkg.name === 'kemit-erp');
    lCheck('12 lockfileVersion = 3', lock.lockfileVersion === 3);
    lCheck('13 package versions match', pkg.version === lock.version);
    lCheck('15 .nvmrc = 22.23.2', nvmContent === '22.23.2');
    lCheck('15.1 Actual Node version is 22.23.2', context.nodeVersion === `v22.23.2`, `Expected v22.23.2, got ${context.nodeVersion}`);
    
    lCheck('19 verify:ci-deps command is exact', pkg.scripts?.['verify:ci-deps'] === 'tsx scripts/verifyAnCiDependencyRepair1.ts');
  }

  if (ciYaml) {
    lCheck('21 setup-node@v4 remains', ciYaml.includes('uses: actions/setup-node@v4'));
    lCheck('22 node-version-file points to .nvmrc', ciYaml.includes("node-version-file: '.nvmrc'"));
    lCheck('23 npm ci remains', ciYaml.includes('run: npm ci'));
    lCheck('30 Java setup-java@v4 exists', ciYaml.includes('uses: actions/setup-java@v4'));
    lCheck('31 Java distribution is temurin', ciYaml.includes("distribution: 'temurin'"));
    lCheck('32 Java version is 21', ciYaml.includes("java-version: '21'"));
    lCheck('33 Firebase CLI installation exists', ciYaml.includes('run: npm install -g firebase-tools'));
    lCheck('34 test:rules in CI exists', ciYaml.includes('npm run test:rules'));

    const verifiers = [
      'verifyMergeAll.ts', 'verifyAnAdapterFailClosed2.ts', 'verifyAnAdapterRouteTest1.ts',
      'verifyAnMigIdem1.ts', 'verifyAnFixStore1.ts', 'verifyAnFixSec1.ts',
      'verifyAnAuthBridge1.ts', 'verifyAnAuthCookies1.ts', 'verifyAnAuthRefreshMe1.ts',
      'verifyAnAuthRoleMap1.ts', 'verifyAnFixPgRole1.ts'
    ];
    for (const v of verifiers) {
      lCheck(`35 Static verifier coverage: ${v}`, ciYaml.includes(v));
    }
  }

  if (statusDoc) {
    const rule45Exists = statusDoc.includes('45. **CI-DEP-1:**') && 
                         statusDoc.includes('.nvmrc pins the project/CI runtime to Node 22.23.2') &&
                         statusDoc.includes('actions/setup-node') &&
                         statusDoc.includes('npm ci') &&
                         statusDoc.includes('verify:ci-deps');
    lCheck('36 Rule 45 exists and is correct', rule45Exists);
  }

  return { passed: localPassed, failed: localFailed, results };
}

function runSelfTests() {
  console.log('\n--- SELF-TEST MODE ---');
  let selfPassed = 0;
  let selfFailed = 0;
  function sCheck(name: string, cond: boolean) {
    if (cond) { console.log(`[PASS] ${name}`); selfPassed++; }
    else { console.log(`[FAIL] ${name}`); selfFailed++; }
  }

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'an-ci-harden-'));

  const createFixture = (overrides: any = {}) => {
    const dir = fs.mkdtempSync(path.join(tmpBase, 'fixture-'));
    fs.mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });

    const pkg = { name: 'kemit-erp', version: '1.0.0', scripts: { 'verify:ci-deps': 'tsx scripts/verifyAnCiDependencyRepair1.ts' } };
    const lock = { name: 'kemit-erp', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'kemit-erp', version: '1.0.0' } } };
    const nvm = '22.23.2';
    const ci = `
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
      - run: npm ci
      - run: npm run verify:ci-deps
      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '21'
      - run: npm install -g firebase-tools
      - run: npm run test:rules
      - run: npx tsx scripts/verifyMergeAll.ts
      - run: npx tsx scripts/verifyAnAdapterFailClosed2.ts
      - run: npx tsx scripts/verifyAnAdapterRouteTest1.ts
      - run: npx tsx scripts/verifyAnMigIdem1.ts
      - run: npx tsx scripts/verifyAnFixStore1.ts
      - run: npx tsx scripts/verifyAnFixSec1.ts
      - run: npx tsx scripts/verifyAnAuthBridge1.ts
      - run: npx tsx scripts/verifyAnAuthCookies1.ts
      - run: npx tsx scripts/verifyAnAuthRefreshMe1.ts
      - run: npx tsx scripts/verifyAnAuthRoleMap1.ts
      - run: npx tsx scripts/verifyAnFixPgRole1.ts
    `;
    const status = '45. **CI-DEP-1:** .nvmrc pins Node 22.23.2.';

    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(overrides.pkg || pkg));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify(overrides.lock || lock));
    fs.writeFileSync(path.join(dir, '.nvmrc'), overrides.nvm || nvm);
    fs.writeFileSync(path.join(dir, '.github/workflows/ci.yml'), overrides.ci || ci);
    fs.writeFileSync(path.join(dir, 'docs/MERGE_STATUS.md'), overrides.status || status);

    return dir;
  };

  // TEST 1: Valid Baseline
  const f1 = createFixture();
  const r1 = runChecks({ root: f1, nodeVersion: 'v22.23.2' });
  sCheck('TEST 1 — VALID BASELINE (Expect PASS)', r1.failed === 0);

  // TEST 2: Wrong Node Runtime
  const f2 = createFixture();
  const r2 = runChecks({ root: f2, nodeVersion: 'v22.23.4' });
  sCheck('TEST 2 — WRONG NODE RUNTIME (Expect FAIL)', r2.results.some(r => r.name.includes('15.1') && !r.pass));

  // TEST 3: Missing Java Setup
  const f3 = createFixture({ ci: 'no java here' });
  const r3 = runChecks({ root: f3, nodeVersion: 'v22.23.2' });
  sCheck('TEST 3 — MISSING JAVA SETUP (Expect FAIL)', r3.results.some(r => r.name.includes('30') && !r.pass));

  // TEST 4: Missing Firebase CLI
  const f4 = createFixture({ ci: 'uses: actions/setup-java@v4\n' }); // missing npm install -g
  const r4 = runChecks({ root: f4, nodeVersion: 'v22.23.2' });
  sCheck('TEST 4 — MISSING FIREBASE CLI (Expect FAIL)', r4.results.some(r => r.name.includes('33') && !r.pass));

  // TEST 5: Missing A.N Static Verifier
  const f5 = createFixture({ ci: 'npx tsx scripts/verifyMergeAll.ts' }); // only one
  const r5 = runChecks({ root: f5, nodeVersion: 'v22.23.2' });
  sCheck('TEST 5 — MISSING A.N STATIC VERIFIER (Expect FAIL)', r5.results.some(r => r.name.includes('35 Static verifier coverage: verifyAnAuthCookies1.ts') && !r.pass));

  // TEST 6: Invalid Rule 45
  const f6 = createFixture({ status: 'Rule 45 is broken CI-DEP-1' });
  const r6 = runChecks({ root: f6, nodeVersion: 'v22.23.2' });
  sCheck('TEST 6 — INVALID RULE 45 (Expect FAIL)', r6.results.some(r => r.name.includes('36') && !r.pass));

  // TEST 7: Wrong Rule Number
  const f7 = createFixture({ status: '46. **CI-DEP-1:** .nvmrc pins Node 22.23.2.' });
  const r7 = runChecks({ root: f7, nodeVersion: 'v22.23.2' });
  sCheck('TEST 7 — WRONG RULE NUMBER (Expect FAIL)', r7.results.some(r => r.name.includes('36') && !r.pass));

  console.log(`\nSELF-TEST RESULTS\nPassed: ${selfPassed} | Failed: ${selfFailed}`);
  fs.rmSync(tmpBase, { recursive: true, force: true });
  process.exit(selfFailed > 0 ? 1 : 0);
}

async function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTests();
    return;
  }

  const result = runChecks({ root, nodeVersion: process.version });
  result.results.forEach(r => {
    if (r.pass) console.log(`[PASS] ${r.name}`);
    else console.log(`[FAIL] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  });

  console.log(`Passed: ${result.passed} | Failed: ${result.failed}`);
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.log('[FAIL] verifier crashed —', e?.message || e);
  process.exit(1);
});
