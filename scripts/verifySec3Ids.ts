/**
 * SEC-3 — journal code uniqueness, stable reverse ids, production DATABASE_URL guard.
 * Run: npx tsx scripts/verifySec3Ids.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const pg = fs.readFileSync('src/core/storage/adapters/PostgresPrimaryAdapter.ts', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');

check('S1 unique index tenant_id+code on journal entries', /uq_an_journal_entries_tenant_code/.test(pg) && /UNIQUE INDEX IF NOT EXISTS uq_an_journal_entries_tenant_code/.test(pg));
check('S2 reverse entry id not Date.now()', !/id:\s*`REV-\$\{Date\.now\(\)\}`/.test(pg));
check('S3 reverse entry id derives from original entryId', /id:\s*`REV-\$\{entryId\}`/.test(pg));
check('S4 reverse code includes entryId for uniqueness', /code:\s*`REV-\$\{original\.code\}-\$\{entryId\}`/.test(pg));
check('S5 production guard AN_REQUIRE_DATABASE or NODE_ENV=production', /AN_REQUIRE_DATABASE/.test(server) && /NODE_ENV/.test(server) && /DATABASE_URL is required/.test(server));
check('S6 guard calls process.exit(1) when missing DATABASE_URL', /requireDatabase && !process\.env\.DATABASE_URL[\s\S]{0,200}process\.exit\(1\)/.test(server));
check('S7 InMemory still allowed when not production and no AN_REQUIRE_DATABASE', /getDevInMemoryAdapter/.test(server));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
