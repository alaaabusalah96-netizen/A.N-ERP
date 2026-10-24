/**
 * verifyMergeAll.ts — MERGE-M6 final gate (structural)
 * Confirms M1–M5 artifacts without starting the full app.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

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

const requiredFiles = [
  'src/an-core/storage/StoragePort.ts',
  'src/lib/anBridge.ts',
  'src/lib/authPolicy.ts',
  'src/lib/anApi.ts',
  'src/components/settings/CompanyBackendPanel.tsx',
  'src/components/settings/AuthPolicyNote.tsx',
  'src/components/settings/AnCoreStatusPanel.tsx',
  'scripts/verifyMergeM1.ts',
  'scripts/verifyMergeM2.ts',
  'scripts/verifyMergeM3.ts',
  'scripts/verifyMergeM4.ts',
  'scripts/verifyMergeM5.ts',
  'docs/MERGE_STATUS.md',
];

for (const rel of requiredFiles) {
  check(`file:${rel}`, fs.existsSync(path.join(root, rel)));
}

const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
check('route:storage-status', server.includes('/api/an/storage-status'));
check('route:company-backend', server.includes('/api/an/company-backend'));
check('route:auth-policy', server.includes('/api/an/auth-policy'));
check('route:routes', server.includes('/api/an/routes'));
check('cf-login-intact', server.includes('/api/auth/verify-credentials'));

const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
check('login-uses-cf', login.includes('/api/auth/verify-credentials'));
check('no-an-login-page', !fs.existsSync(path.join(root, 'src/pages/AnLogin.tsx')));

const general = fs.readFileSync(
  path.join(root, 'src/components/settings/SettingsGeneralTab.tsx'),
  'utf8'
);
check('settings:backend', general.includes('CompanyBackendPanel'));
check('settings:auth', general.includes('AuthPolicyNote'));
check('settings:status', general.includes('AnCoreStatusPanel'));

// Sub-verifiers (must exit 0)
const subs = [
  'scripts/verifyMergeM1.ts',
  'scripts/verifyMergeM2.ts',
  'scripts/verifyMergeM3.ts',
  'scripts/verifyMergeM4.ts',
  'scripts/verifyMergeM5.ts',
];
for (const script of subs) {
  const r = spawnSync('npx', ['tsx', script], { cwd: root, encoding: 'utf8', shell: false });
  const ok = r.status === 0;
  check(`sub:${path.basename(script)}`, ok, (r.stdout || r.stderr || '').split('\n').filter(l => l.includes('Failed')).pop() || `exit=${r.status}`);
}

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
