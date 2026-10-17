/**
 * @file verifyUiOps1.ts
 * UI-OPS-1 — static: quick tx posts to /api/transactions/post; approvals inbox wired.
 * Run: npx tsx scripts/verifyUiOps1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const app = fs.readFileSync('src/App.tsx', 'utf8');
const tm = fs.readFileSync('src/components/TransactionModal.tsx', 'utf8');
const ow = fs.readFileSync('src/components/OperationalWorkspace.tsx', 'utf8');
const srv = fs.readFileSync('server.ts', 'utf8');
const doc = fs.readFileSync('docs/UI_OPS_1.md', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 save uses /api/transactions/post', /\/api\/transactions\/post/.test(app));
check('S2 no POST bare /api/transactions in save', !/fetch\('\/api\/transactions',\s*\{\s*method:\s*'POST'/.test(app));
check('S3 entry+idempotencyKey body', /idempotencyKey/.test(app) && /entry,/.test(app));
check('S4 modal passes lines', /onSave\(newTx,\s*lines\)/.test(tm));
check('S5 inbox fetch', /\/api\/approvals\/inbox/.test(ow));
check('S6 approve/reject routes in UI', /\/api\/approvals\/\$\{/.test(ow) || /\/api\/approvals\//.test(ow));
check('S7 server inbox route exists', /app\.get\('\/api\/approvals\/inbox'/.test(srv));
check('S8 server transactions/post exists', /app\.post\('\/api\/transactions\/post'/.test(srv));
check('S9 approvals section panel', /activeSection === 'approvals'/.test(ow) && /صندوق الاعتمادات الموحد/.test(ow));
check('S10 doc', /UI-OPS-1/.test(doc));
check('P package DONE', byId['UI-OPS-1']?.status === 'DONE');
check('P lastChange', String(reg.lastChange || '').includes('UI-AUDIT-PRINT-1'));
check('R UI-USERS-1 DONE', byId['UI-USERS-1']?.status === 'DONE');
check('R SEC-PERM-OVERRIDE-1 DONE', byId['SEC-PERM-OVERRIDE-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
