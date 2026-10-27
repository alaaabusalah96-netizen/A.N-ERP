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
const mapPath = path.join(root, 'src/lib/anEntityMap.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/anApi.ts'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src/lib/anBridge.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/components/settings/AnCoreStatusPanel.tsx'), 'utf8');
const invPage = fs.readFileSync(path.join(root, 'src/pages/Inventory.tsx'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');

check('S1 anEntityMap exists', fs.existsSync(mapPath));
const body = fs.readFileSync(mapPath, 'utf8');
check('S2 AN_ENTITY_MAP exported', body.includes('AN_ENTITY_MAP'));
check('S3 listEntityMap exported', body.includes('listEntityMap'));
check('S4 server route map/entities', server.includes('/api/an/map/entities'));
check('S5 catalog D2', api.includes('/api/an/map/entities'));
check('S6 fetchEntityMap in bridge', bridge.includes('fetchEntityMap'));
check('S7 panel uses fetchEntityMap or map/entities', panel.includes('fetchEntityMap') || panel.includes('map/entities'));
check('S8 cutoverApproved false in map module', body.includes('cutoverApproved: false'));
check('S9 shadow status route still present', server.includes('/api/an/shadow/status'));
check('S10 Login unchanged', login.includes('/api/auth/verify-credentials'));
check('S11 Inventory.tsx CustodyDB', invPage.includes('CustodyDB'));
check('S12 MERGE_STATUS D2', statusDoc.includes('D2'));
check('S13 no data write or migration in anEntityMap', !body.includes('docSet') && !body.includes('dbSetDoc') && !body.includes('COPY'));
check('S14 verify D1 exists', fs.existsSync(path.join(root, 'scripts/verifyAnShadowD1.ts')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
