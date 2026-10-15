/**
 * @file verifySecAuthMatrix.ts
 * SEC-AUTH-MATRIX — static: hardened routes carry requirePermission; inventory doc present.
 * Run: npx tsx scripts/verifySecAuthMatrix.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const srv = fs.readFileSync('server.ts', 'utf8');
const doc = fs.readFileSync('docs/SEC_AUTH_MATRIX.md', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

function routeChunk(pathLiteral: string): string {
  const token = `'${pathLiteral}'`;
  const i = srv.indexOf(token);
  if (i < 0) return '';
  return srv.slice(i, i + 260);
}

const hardened: Array<[string, string]> = [
  ['/api/approvals/policies', 'APPROVAL_POLICY_MANAGE'],
  ['/api/approvals/inbox', 'ENTRY_APPROVE'],
  ['/api/approvals/:id/approve', 'ENTRY_APPROVE'],
  ['/api/approvals/:id/reject', 'ENTRY_APPROVE'],
  ['/api/accounting/units', 'ENTRY_VIEW'],
  ['/api/accounting/migration/templates', 'COMPANY_SETTINGS_MANAGE'],
  ['/api/expenses/categories', 'EXPENSE_SUBMIT'],
  ['/api/expenses/requests', 'EXPENSE_SUBMIT'],
  ['/api/expenses/requests/:id', 'EXPENSE_SUBMIT'],
  ['/api/attachments', 'ENTRY_VIEW'],
  ['/api/master-data/partners', 'PURCHASE_VIEW'],
  ['/api/tenant-modules', 'COMPANY_SETTINGS_MANAGE'],
  ['/api/custom-fields', 'COMPANY_SETTINGS_MANAGE'],
  ['/api/print/:docType/:docId', 'ENTRY_VIEW'],
];

for (const [path, perm] of hardened) {
  const chunk = routeChunk(path);
  const ok = chunk.includes('requirePermission') && chunk.includes(`'${perm}'`);
  check(`R ${path} requires ${perm}`, ok, chunk.slice(0, 90).replace(/\n/g, ' '));
}

const postAtt = (() => {
  const token = "'/api/attachments'";
  let from = 0;
  let found = '';
  while (true) {
    const i = srv.indexOf(token, from);
    if (i < 0) break;
    const chunk = srv.slice(Math.max(0, i - 30), i + 200);
    if (chunk.includes('app.post')) { found = chunk; break; }
    from = i + 1;
  }
  return found;
})();
check('R POST /api/attachments requires ENTRY_CREATE', postAtt.includes("requirePermission('ENTRY_CREATE')"), postAtt.slice(0, 80).replace(/\n/g, ' '));

check('D matrix doc names SEC-AUTH-MATRIX', /SEC-AUTH-MATRIX/.test(doc));
check('D matrix lists intentional public routes', /wizard\/create-company/.test(doc) && /api\/internal/.test(doc));
check('P package SEC-AUTH-MATRIX DONE', byId['SEC-AUTH-MATRIX']?.status === 'DONE');
check('P lastChange mentions SEC-USER-ADMIN', String(reg.lastChange || '').includes('SEC-USER-ADMIN'));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
