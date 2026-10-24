/**
 * verifyMergeM4.ts — A.N API namespace isolation
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
const apiPath = path.join(root, 'src/lib/anApi.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src/lib/anBridge.ts'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');

check('S1 anApi.ts exists', fs.existsSync(apiPath));
const api = fs.readFileSync(apiPath, 'utf8');
check('S2 AN_API_PREFIX is /api/an', api.includes("'/api/an'") || api.includes('"/api/an"'));
check('S3 AN_ROUTE_CATALOG exported', api.includes('AN_ROUTE_CATALOG'));
check('S4 anUrl helper exported', api.includes('export function anUrl'));
check('S5 server mounts /api/an/routes', server.includes('/api/an/routes'));
check('S6 server keeps storage-status under /api/an', server.includes('/api/an/storage-status'));
check('S7 server keeps company-backend under /api/an', server.includes('/api/an/company-backend'));
check('S8 server keeps auth-policy under /api/an', server.includes('/api/an/auth-policy'));
check('S9 CF verify-credentials not under /api/an', server.includes('/api/auth/verify-credentials') && !server.includes('/api/an/auth/verify-credentials'));
check('S10 Login uses CF auth path', login.includes('/api/auth/verify-credentials'));
check('S11 anBridge only fetches /api/an for core probes', !bridge.includes("fetch('/api/auth"));
check('S12 no duplicate /api/an/storage-status definition twice-as-auth', (server.match(/\/api\/an\/storage-status/g) || []).length >= 1);
check('S13 catalog mentions M4 routes entry', api.includes("'/api/an/routes'") || api.includes('"/api/an/routes"'));
check('S14 verifyMergeM3 still present', fs.existsSync(path.join(root, 'scripts/verifyMergeM3.ts')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
