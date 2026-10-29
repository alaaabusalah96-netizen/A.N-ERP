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
const idemModPath = path.join(root, 'src/lib/anMigrateIdempotency.ts');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const statusDoc = fs.readFileSync(path.join(root, 'docs/MERGE_STATUS.md'), 'utf8');
const whWrite = fs.readFileSync(path.join(root, 'src/lib/anMigrateInventoryWrite.ts'), 'utf8');
const balWrite = fs.readFileSync(path.join(root, 'src/lib/anMigrateInventoryBalances.ts'), 'utf8');

check('S1 anMigrateIdempotency.ts exists', fs.existsSync(idemModPath));
const idemBody = fs.existsSync(idemModPath) ? fs.readFileSync(idemModPath, 'utf8') : '';

check(
  'S2 extractIdempotencyKey / requireIdempotencyKey / rowIdempotencyKey exported',
  idemBody.includes('extractIdempotencyKey') &&
    idemBody.includes('requireIdempotencyKey') &&
    idemBody.includes('rowIdempotencyKey')
);

check('S3 server includes idempotency_key_required', server.includes('idempotency_key_required'));

check(
  'S4 server extractIdempotencyKey or Idempotency-Key',
  server.includes('extractIdempotencyKey') || server.includes('Idempotency-Key')
);

check(
  'S5 warehouses POST path references batchIdempotencyKey or idempotency',
  server.includes('/api/an/migrate/inventory/warehouses') &&
    (server.includes('batchIdempotencyKey') || server.includes('idempotencyKey'))
);

const matches = server.match(/batchIdempotencyKey|idempotencyKey/g) || [];
check('S6 items/balances/accounts migrate POST routes reference idempotency key', matches.length >= 3);

check(
  'S7 existingIds or skip still in write module',
  whWrite.includes('existingIds') && whWrite.includes('skippedExisting')
);

check('S8 requireAnMigrateOperator still present', server.includes('requireAnMigrateOperator'));

check('S9 assertUserCanAccessCompany still present', server.includes('assertUserCanAccessCompany'));

check('S10 adapter_company_load_failed still present', server.includes('adapter_company_load_failed'));

check('S11 MERGE MIG-IDEM in status doc', statusDoc.includes('MIG-IDEM'));

check('S12 AN_MIGRATE_WRITES still gated', whWrite.includes('AN_MIGRATE_WRITES'));

const dryRunIdx = server.indexOf('/api/an/migrate/inventory/dry-run');
const dryRunNext1000 = dryRunIdx > -1 ? server.slice(dryRunIdx, dryRunIdx + 1000) : '';
check(
  'S13 dry-run GET does not require idempotency key',
  dryRunIdx === -1 || !dryRunNext1000.includes('requireIdempotencyKey')
);

check(
  'S14 pilot receipt balance migrate has row key',
  balWrite.includes('rowIdempotencyKey') || balWrite.includes('idempotencyKey')
);

console.log(`Passed: ${passed} | Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
