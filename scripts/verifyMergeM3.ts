/**
 * verifyMergeM3.ts — single auth path policy
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
const policyPath = path.join(root, 'src/lib/authPolicy.ts');
const notePath = path.join(root, 'src/components/settings/AuthPolicyNote.tsx');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const general = fs.readFileSync(path.join(root, 'src/components/settings/SettingsGeneralTab.tsx'), 'utf8');
const envEx = fs.existsSync(path.join(root, '.env.example'))
  ? fs.readFileSync(path.join(root, '.env.example'), 'utf8')
  : '';

check('S1 authPolicy.ts exists', fs.existsSync(policyPath));
const policy = fs.readFileSync(policyPath, 'utf8');
check('S2 resolveAuthPolicyServer exported', policy.includes('resolveAuthPolicyServer'));
check('S3 resolveAuthPolicyClient exported', policy.includes('resolveAuthPolicyClient'));
check('S4 AN_ENABLE_AN_JWT gate', policy.includes('AN_ENABLE_AN_JWT'));
check('S5 AuthPolicyNote exists', fs.existsSync(notePath));
check('S6 SettingsGeneralTab imports AuthPolicyNote', general.includes('AuthPolicyNote'));
check('S7 SettingsGeneralTab renders AuthPolicyNote', general.includes('<AuthPolicyNote'));
check('S8 Login still uses verify-credentials', login.includes('/api/auth/verify-credentials'));
check('S9 Login does not call an-jwt login URL', !/\/api\/an\/auth\/login/.test(login));
check('S10 server has /api/an/auth-policy', server.includes('/api/an/auth-policy'));
check('S11 server still has verify-credentials', server.includes('/api/auth/verify-credentials'));
check('S12 company-backend route kept', server.includes('/api/an/company-backend'));
check('S13 .env.example documents AN_ENABLE_AN_JWT', envEx.includes('AN_ENABLE_AN_JWT'));
check('S14 Login.tsx still present', fs.existsSync(path.join(root, 'src/pages/Login.tsx')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
