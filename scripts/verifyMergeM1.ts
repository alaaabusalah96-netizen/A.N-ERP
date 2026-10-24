/**
 * verifyMergeM1.ts — MERGE phase 1 gates (core inject only)
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
const anCore = path.join(root, 'src/an-core');
const port = path.join(anCore, 'storage/StoragePort.ts');
const router = path.join(anCore, 'storage/StorageRouter.ts');
const bridge = path.join(root, 'src/lib/anBridge.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const types = fs.readFileSync(path.join(root, 'src/types.ts'), 'utf8');

check('S1 src/an-core exists', fs.existsSync(anCore));
check('S2 StoragePort.ts exists', fs.existsSync(port));
check('S3 StorageRouter.ts exists', fs.existsSync(router));
check('S4 anBridge.ts exists', fs.existsSync(bridge));
check('S5 anBridge exports getAnStorageStatus', fs.readFileSync(bridge, 'utf8').includes('getAnStorageStatus'));
check('S6 anBridge exports getCompanyBackendSettings', fs.readFileSync(bridge, 'utf8').includes('getCompanyBackendSettings'));
check('S7 server mounts /api/an/storage-status', server.includes("/api/an/storage-status"));
check('S8 server imports StorageRouter from an-core', /an-core\/storage\/StorageRouter/.test(server));
check('S9 package has pg', !!pkg.dependencies?.pg);
check('S10 package has argon2', !!pkg.dependencies?.argon2);
check('S11 types has db_backend', types.includes('db_backend'));
check('S12 types has auth_driver', types.includes('auth_driver'));
check('S13 firebase dependency kept', !!pkg.dependencies?.firebase);
check('S14 Login.tsx still present', fs.existsSync(path.join(root, 'src/pages/Login.tsx')));

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
