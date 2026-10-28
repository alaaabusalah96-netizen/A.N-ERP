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
const decPath = path.join(root, 'docs/MERGE_DECISIONS.md');
const statusPath = path.join(root, 'docs/MERGE_STATUS.md');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const mapPath = path.join(root, 'src/lib/anEntityMap.ts');

check('S1 MERGE_DECISIONS.md exists', fs.existsSync(decPath));
const dec = fs.readFileSync(decPath, 'utf8');
check('S2 D-INV present', dec.includes('D-INV'));
check('S3 D-CUSTODY present', dec.includes('D-CUSTODY'));
check('S4 D-AUTH present', dec.includes('D-AUTH'));
check('S5 A.N engine inventory', /A\.N engine|محرك/.test(dec) || dec.includes('A.N'));
check('S6 custody KEMIT', /KEMIT/i.test(dec) && /CUSTODY|Custody|عهدة/i.test(dec));
check('S7 auth target A.N', /A\.N-style auth|دخول بأسلوب A\.N|TokenService/i.test(dec));
check('S8 MERGE_STATUS DEC1 or DECISIONS', fs.readFileSync(statusPath, 'utf8').includes('DEC1') || fs.readFileSync(statusPath, 'utf8').includes('DECISIONS-1'));
check('S9 Login.tsx still verify-credentials', login.includes('/api/auth/verify-credentials'));
check('S10 no cutoverApproved true in decisions', !dec.includes('cutoverApproved: true'));
check('S11 implementation order G-series', /G-series|G series|حزم G/i.test(dec));
check('S12 entity map notes updated', fs.existsSync(mapPath) && /A\.N-style login|أسلوب A\.N/i.test(fs.readFileSync(mapPath, 'utf8')));
check('S13 decisions file says APPROVED', /APPROVED/i.test(dec));
check('S14 Firebase interim mentioned', /interim|مؤقت|Firebase/i.test(dec));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
