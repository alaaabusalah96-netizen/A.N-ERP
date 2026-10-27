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
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const plane = fs.readFileSync(path.join(root, 'src/lib/anDataPlane.ts'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');

// Extract company-backend handler region (loose)
const idx = server.indexOf('/api/an/company-backend/');
const region = idx >= 0 ? server.slice(idx, idx + 4500) : '';

check('S1 company-backend route exists', idx >= 0);
check('S2 merge set on companies collection', region.includes('collection("companies")') && region.includes('.set('));
check('S3 merge: true', region.includes('merge: true') || region.includes('merge:true'));
check('S4 writes db_backend field', region.includes('db_backend'));
check('S5 writes connection_ref field', region.includes('connection_ref'));
check('S6 writes isolation_level', region.includes('isolation_level'));
check('S7 persisted flag in response', region.includes('persisted'));
check('S8 A3 live-check still present', server.includes('/api/an/data-plane/live-check'));
check('S9 A2 company plane still present', server.includes('/api/an/data-plane/company/'));
check('S10 MERGE_STATUS A4', statusDoc.includes('A4'));
check('S11 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S12 anDataPlane still has liveCheck', plane.includes('liveCheckBackend'));
check('S13 no connection string write pattern :// in set payload region', !/set\(\s*\{[^}]*:\/\//.test(region));
check('S14 verify A3 script exists', fs.existsSync(path.join(root, 'scripts/verifyAnDataPlaneA3.ts')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
