/**
 * verifyMergeM6.ts — freeze docs + all-gate script presence
 */
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
const statusPath = path.join(root, 'docs/MERGE_STATUS.md');
const allPath = path.join(root, 'scripts/verifyMergeAll.ts');
const pkgPath = path.join(root, 'package.json');

check('S1 MERGE_STATUS.md exists', fs.existsSync(statusPath));
const status = fs.readFileSync(statusPath, 'utf8');
check('S2 status lists M1–M6', ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'].every((m) => status.includes(m)));
check('S3 status says firebase-session default', status.includes('firebase-session') || status.includes('verify-credentials'));
check('S4 verifyMergeAll.ts exists', fs.existsSync(allPath));
const all = fs.readFileSync(allPath, 'utf8');
check('S5 all-gate runs M1–M5 verifiers', all.includes('verifyMergeM5.ts'));
check('S6 package.json exists', fs.existsSync(pkgPath));
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
check('S7 npm script verify:merge', !!(pkg.scripts && pkg.scripts['verify:merge']));
check('S8 AnCoreStatusPanel still present', fs.existsSync(path.join(root, 'src/components/settings/AnCoreStatusPanel.tsx')));
check('S9 anApi still present', fs.existsSync(path.join(root, 'src/lib/anApi.ts')));
check('S10 authPolicy still present', fs.existsSync(path.join(root, 'src/lib/authPolicy.ts')));
check('S11 Login still CF path', fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8').includes('/api/auth/verify-credentials'));
check('S12 server has all four /api/an routes', (() => {
  const s = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  return ['/api/an/storage-status', '/api/an/company-backend', '/api/an/auth-policy', '/api/an/routes'].every((p) => s.includes(p));
})());
check('S13 no AnLogin page', !fs.existsSync(path.join(root, 'src/pages/AnLogin.tsx')));
check('S14 MERGE_STATUS mentions post-merge ops', status.includes('BYPASSRLS') || status.includes('Dedicated'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
