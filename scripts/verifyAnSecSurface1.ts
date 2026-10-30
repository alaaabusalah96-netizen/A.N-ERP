import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { console.log(`[PASS] ${name}`); passed++; }
  else { console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}
const root = process.cwd();
const read = (p: string) => (fs.existsSync(path.join(root, p)) ? fs.readFileSync(path.join(root, p), 'utf8') : '');

/** text of one route: from its app.<verb>("<path>" up to the next "\n    app." registration */
function routeBlock(src: string, marker: string): string {
  const i = src.indexOf(marker);
  if (i < 0) return '';
  const j = src.indexOf('\n    app.', i + marker.length);
  return src.slice(i, j < 0 ? i + 6000 : j);
}

async function main() {
  const server = read('server.ts');
  const pkg = read('package.json');
  const envEx = read('.env.example');

  check('S1 hard-coded session secret fallback removed', !server.includes('kemit_server_session_secret_fallback_key_2026'));
  check('S2 SESSION_SECRET refuses start in production/strict', /SESSION_SECRET[\s\S]{0,400}isProductionOrStrict[\s\S]{0,300}process\.exit\(1\)/.test(server));
  check('S3 .env.example documents SESSION_SECRET (name only)', /^SESSION_SECRET=\s*$/m.test(envEx));

  const cb = routeBlock(server, 'app.post("/api/an/company-backend/:companyId"');
  check('S4 company-backend POST: operator + company scope + safe connection_ref',
    cb.includes('requireAnMigrateOperator') && cb.includes('assertUserCanAccessCompany') && cb.includes('isSafeConnectionRef'));

  const migrate = [
    'app.get("/api/an/migrate/inventory/dry-run"',
    'app.post("/api/an/migrate/inventory/warehouses"',
    'app.post("/api/an/migrate/inventory/items"',
    'app.post("/api/an/migrate/inventory/balances"',
    'app.post("/api/an/migrate/accounting/accounts"',
  ];
  const missing = migrate.filter((m) => !routeBlock(server, m).includes('assertUserCanAccessCompany'));
  check('S5 all 5 migrate routes enforce company scope', missing.length === 0, missing.join(', '));

  const live = routeBlock(server, 'app.get("/api/an/data-plane/live-check"');
  check('S6 live-check requires operator + safe connection_ref', live.includes('requireAnMigrateOperator') && live.includes('isSafeConnectionRef'));

  const dp = routeBlock(server, 'app.get("/api/an/data-plane/company/:companyId"');
  check('S7 data-plane/company requires auth + company scope', dp.includes('authenticateSessionOrBearer') && dp.includes('assertUserCanAccessCompany'));

  const sp = routeBlock(server, 'app.get("/api/an/session-plane"');
  check('S8 session-plane live probe requires operator', sp.includes('runLive') && sp.includes('requireAnMigrateOperator'));

  const iGuard = server.indexOf('"/assets/aistudio"');
  const iStatic = server.indexOf('express.static(distPath)');
  check('S9 /assets/aistudio blocked before static serving', iGuard > 0 && iStatic > 0 && iGuard < iStatic);
  check('S10 build prunes dist/assets/aistudio', /"build"\s*:\s*"(?:[^"\\]|\\.)*aistudio/.test(pkg));

  const g: any = await import(path.join(root, 'src/lib/anConnectionRefGuard.ts'));
  const okRefs = ['DATABASE_URL', 'MYSQL_URL', 'MONGODB_URL', 'TENANT_A_DB_URL'];
  const badRefs = ['SESSION_SECRET', 'JWT_SECRET', 'APP_PEPPER', 'FIREBASE_API_KEY', 'GEMINI_API_KEY', 'postgres://u:p@h/db', 'lower_case', '', 'A', 'MY_API_KEY', 'ADMIN_PASSWORD', 'PATH'];
  check('S11 isSafeConnectionRef accepts DB env names', okRefs.every((r) => g.isSafeConnectionRef(r)));
  check('S12 isSafeConnectionRef rejects secrets/URLs/invalid', badRefs.every((r) => !g.isSafeConnectionRef(r)), badRefs.filter((r) => g.isSafeConnectionRef(r)).join(','));
  check('S13 existing gates intact (migrate operator, AN_MIGRATE_WRITES, pilot mount)',
    server.includes('async function requireAnMigrateOperator') && read('src/lib/anMigrateInventoryWrite.ts').includes('AN_MIGRATE_WRITES') && server.includes('mountAnInventoryPilotRoute'));

  console.log(`Passed: ${passed} | Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.log('[FAIL] verify crashed —', e?.message || e); process.exit(1); });
