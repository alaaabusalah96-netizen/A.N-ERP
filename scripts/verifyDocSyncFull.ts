/**
 * @file verifyDocSyncFull.ts
 * Ensures STATE_REGISTER matches code for DB-1, OPS-1, SEC-PROD-ROLE, SEC-1c before AI_* refresh.
 * Run: npx tsx scripts/verifyDocSyncFull.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));
const defects = Object.fromEntries((reg.defects || []).map((d: any) => [d.id, d]));

check('S1 DB-1 DONE', byId['DB-1']?.status === 'DONE');
check('S2 OPS-1 DONE', byId['OPS-1']?.status === 'DONE');
check('S3 SEC-PROD-ROLE DONE', byId['SEC-PROD-ROLE']?.status === 'DONE');
check('S4 SEC-1c package DONE', byId['SEC-1c']?.status === 'DONE');
check('S5 SEC-1c defect FIXED', defects['SEC-1c']?.status === 'FIXED');
check('S6 PROD-ROLE-BYPASSRLS still CONFIG', defects['PROD-ROLE-BYPASSRLS']?.status === 'CONFIG');
check('S7 lastChange is DOC-SYNC-FULL', /DOC-SYNC-FULL/.test(String(reg.lastChange || '')));

check('C1 migration 20261014_001 in registry', /20261014_001/.test(fs.readFileSync('src/core/migrations/registry.ts', 'utf8')));
check('C2 verifyDb1 exists', fs.existsSync('scripts/verifyDb1.ts'));
check('C3 verifyOps1 exists', fs.existsSync('scripts/verifyOps1.ts'));
check('C4 ops shutdown exists', fs.existsSync('src/core/ops/shutdown.ts'));
check('C5 ops health exists', fs.existsSync('src/core/ops/health.ts'));
check('C6 Dockerfile exists', fs.existsSync('Dockerfile'));
check('C7 pgAppRoleGuard exists', fs.existsSync('src/core/security/pgAppRoleGuard.ts'));
check('C8 server enforces AN_ENFORCE_PROD_ROLE', /AN_ENFORCE_PROD_ROLE/.test(fs.readFileSync('server.ts', 'utf8')) && /SEC-PROD-ROLE|Refusing to start/.test(fs.readFileSync('server.ts', 'utf8')));
const login = fs.readFileSync('src/components/LoginScreen.tsx', 'utf8');
check('C9 LoginScreen has no clientGeo payload', !/clientGeo/.test(login));
check('C10 LoginScreen has no fabricated Riyadh geo', !/Riyadh/.test(login));
check('C11 stockReturnGuard exists', fs.existsSync('src/core/inventory/stockReturnGuard.ts'));
check('C12 runFullSystemAudit exists', fs.existsSync('scripts/runFullSystemAudit.ts'));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
