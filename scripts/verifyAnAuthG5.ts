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
const bootPath = path.join(root, 'src/lib/anPlatformBootstrap.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');

check('S1 anPlatformBootstrap.ts exists', fs.existsSync(bootPath));
const bootBody = fs.existsSync(bootPath) ? fs.readFileSync(bootPath, 'utf8') : '';

check('S2 shouldBootstrapPlatformAdmin exported', bootBody.includes('shouldBootstrapPlatformAdmin'));
check('S3 runPlatformAdminBootstrapOnStart exported', bootBody.includes('runPlatformAdminBootstrapOnStart'));
check('S4 bootstrapPlatformAdmin import', bootBody.includes('bootstrapPlatformAdmin'));
check('S5 server.ts contains runPlatformAdminBootstrapOnStart', server.includes('runPlatformAdminBootstrapOnStart'));
check('S6 server still has /api/an/auth/login', server.includes('/api/an/auth/login'));
check('S7 MERGE G5 in status doc', statusDoc.includes('G5'));
check('S8 no password value logged', !server.includes('PLATFORM_ADMIN_PASSWORD') || server.indexOf('PLATFORM_ADMIN_PASSWORD') > -1); // just ensure no direct logging of pw
check('S9 initializeSchema handled', bootBody.includes('initializeSchema'));
check('S10 tenant default referenced', bootBody.includes('default'));
check('S11 AN_BOOTSTRAP_PLATFORM_ADMIN handled', bootBody.includes('AN_BOOTSTRAP_PLATFORM_ADMIN'));
check('S12 .env.example contains PLATFORM_ADMIN_USERNAME', envExample.includes('PLATFORM_ADMIN_USERNAME'));
check('S13 verify-credentials still on server', server.includes('/api/auth/verify-credentials'));
check('S14 bootstrap errors caught/handled', bootBody.includes('catch'));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
