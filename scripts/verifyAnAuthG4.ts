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
const targetMod = path.join(root, 'src/lib/anAuthLoginTarget.ts');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

check('S1 anAuthLoginTarget exists', fs.existsSync(targetMod));
const targetBody = fs.readFileSync(targetMod, 'utf8');

check('S1 allowFirebaseLogin in anAuthLoginTarget', targetBody.includes('allowFirebaseLogin'));
check('S2 AN_ALLOW_FIREBASE_LOGIN string in target', targetBody.includes('AN_ALLOW_FIREBASE_LOGIN'));
check('S3 Login references allowFirebaseLogin or firebaseEscapeAllowed', login.includes('allowFirebaseLogin') || login.includes('firebaseEscapeAllowed'));
check('S4 Login still has verify-credentials', login.includes('/api/auth/verify-credentials'));
check('S5 Login still has /api/an/auth/login', login.includes('/api/an/auth/login'));
check('S6 MERGE G4', statusDoc.includes('G4'));
check('S7 .env.example mentions AN_ALLOW_FIREBASE_LOGIN', envExample.includes('AN_ALLOW_FIREBASE_LOGIN'));
check('S8 server verify-credentials', server.includes('/api/auth/verify-credentials'));
check('S9 server an auth login', server.includes('/api/an/auth/login'));
check('S10 G3 dual paths still in Login source', login.includes("'an'") && login.includes("'firebase'"));
check('S11 cutover false in target', targetBody.includes('cutoverApproved: false'));
check('S12 nextPackage G5 or notes G4', targetBody.includes('G5') || targetBody.includes('G4'));
check('S13 anLoginFlag still used', login.includes('anLoginFlag'));
check('S14 Login does not delete signInWithCustomToken branch', login.includes('signInWithCustomToken'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
