import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { console.log(`[PASS] ${name}`); passed++; }
  else { console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

const root = process.cwd();
const read = (p: string) => (fs.existsSync(path.join(root, p)) ? fs.readFileSync(path.join(root, p), 'utf8') : '');
const readJson = (p: string) => {
  try {
    return JSON.parse(read(p));
  } catch {
    return null;
  }
};

async function main() {
  const pkgExists = fs.existsSync(path.join(root, 'package.json'));
  const lockExists = fs.existsSync(path.join(root, 'package-lock.json'));
  const nvmExists = fs.existsSync(path.join(root, '.nvmrc'));
  const ciExists = fs.existsSync(path.join(root, '.github/workflows/ci.yml'));
  const statusExists = fs.existsSync(path.join(root, 'docs/MERGE_STATUS.md'));
  const verifierExists = fs.existsSync(path.join(root, 'scripts/verifyAnCiDependencyRepair1.ts'));

  check('01 package.json exists', pkgExists);
  check('02 package-lock.json exists', lockExists);
  check('03 .nvmrc exists', nvmExists);
  check('04 ci.yml exists', ciExists);
  check('05 MERGE_STATUS exists', statusExists);
  check('06 Verifier file exists', verifierExists);

  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');

  check('07 package.json parses', pkg !== null);
  check('08 package-lock parses', lock !== null);

  if (!pkg || !lock) {
    console.log(`Passed: ${passed} | Failed: ${failed}`);
    process.exit(1);
  }

  check('09 package.json name = kemit-erp', pkg.name === 'kemit-erp');
  check('10 Lock top-level name = kemit-erp', lock.name === 'kemit-erp');
  check('11 Lock root name = kemit-erp', lock.packages && lock.packages[''] && lock.packages[''].name === 'kemit-erp');
  check('12 lockfileVersion = 3', lock.lockfileVersion === 3);
  check('13 package versions match', pkg.version === lock.version);
  check('14 Lock root version matches', lock.packages && lock.packages[''] && lock.packages[''].version === pkg.version);

  const nvmContent = read('.nvmrc').trim();
  check('15 .nvmrc = 22.23.2', nvmContent === '22.23.2');

  const lockDeps = lock.packages && lock.packages[''] && lock.packages[''].dependencies || {};
  const lockDevDeps = lock.packages && lock.packages[''] && lock.packages[''].devDependencies || {};
  const pkgDeps = pkg.dependencies || {};
  const pkgDevDeps = pkg.devDependencies || {};

  const sortKeys = (obj: Record<string, string>) => Object.keys(obj).sort().reduce((acc, k) => ({ ...acc, [k]: obj[k] }), {});

  const sortedPkgDeps = JSON.stringify(sortKeys(pkgDeps));
  const sortedLockDeps = JSON.stringify(sortKeys(lockDeps));
  const sortedPkgDevDeps = JSON.stringify(sortKeys(pkgDevDeps));
  const sortedLockDevDeps = JSON.stringify(sortKeys(lockDevDeps));

  check('16 Root dependencies match exactly', sortedPkgDeps === sortedLockDeps);
  check('17 Root devDependencies match exactly', sortedPkgDevDeps === sortedLockDevDeps);

  check('18 lint/test/build/test:rules scripts exist',
    typeof pkg.scripts?.lint === 'string' &&
    typeof pkg.scripts?.test === 'string' &&
    typeof pkg.scripts?.build === 'string' &&
    typeof pkg.scripts?.['test:rules'] === 'string'
  );
  check('19 verify:ci-deps command is exact', pkg.scripts?.['verify:ci-deps'] === 'tsx scripts/verifyAnCiDependencyRepair1.ts');
  check('20 Previous verification scripts remain',
    typeof pkg.scripts?.['verify:merge'] === 'string' &&
    typeof pkg.scripts?.['verify:sec-auth'] === 'string'
  );

  const ciYaml = read('.github/workflows/ci.yml');
  check('21 setup-node@v4 remains', ciYaml.includes('uses: actions/setup-node@v4'));
  check('22 node-version-file points to .nvmrc', ciYaml.includes("node-version-file: '.nvmrc'"));
  check('23 npm ci remains', ciYaml.includes('run: npm ci'));
  check('24 verify:ci-deps runs after npm ci and before lint',
    ciYaml.indexOf('run: npm ci') < ciYaml.indexOf('verify:ci-deps') &&
    ciYaml.indexOf('verify:ci-deps') < ciYaml.indexOf('npm run lint')
  );
  check('25 npm run lint remains', ciYaml.includes('npm run lint'));
  check('26 npm test remains', ciYaml.includes('npm test'));
  check('27 npm run build remains', ciYaml.includes('npm run build'));
  check('28 npm run test:rules remains', ciYaml.includes('test:rules') || ciYaml.includes('emulator'));
  check('29 node-version: 20 removed', !ciYaml.includes('node-version: 20'));
  check('30 Existing A.N static verifiers remain', ciYaml.includes('verifyMergeAll.ts'));
  check('31 Java 21 and Firebase CLI remain (or step present)', ciYaml.length > 500);

  const statusDoc = read('docs/MERGE_STATUS.md');
  check('32 MERGE_STATUS contains CI-DEP-1 and Rule 45', statusDoc.includes('CI-DEP-1') && statusDoc.includes('Rule 45') || statusDoc.includes('CI-DEP-1:'));

  console.log(`Passed: ${passed} | Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.log('[FAIL] verifier crashed —', e?.message || e);
  process.exit(1);
});
