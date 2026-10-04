/**
 * @file verifyP4Authorization.ts
 * @description Phase 3 (AUTHZ-002) — real HTTP + PostgreSQL verification of the remaining authorization routes.
 *
 * Requirements: PostgreSQL-backed app running on http://localhost:3000 (restart it after applying the server.ts changes).
 * Run: npx tsx scripts/verifyP4Authorization.ts
 *
 * - Roles are derived from ROLE_PERMISSION_MATRIX + hasPermission (no hard-coded allowed/denied role names).
 * - Temporary users / expense requests / attachments are removed in `finally`.
 */
import dotenv from 'dotenv';
dotenv.config();
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { ROLE_PERMISSION_MATRIX, hasPermission, PermissionGroup } from '../src/core/auth/PermissionMatrix';

const BASE_URL = 'http://localhost:3000';
const TENANT_ID = 'tenant-main';
const RUN = Date.now().toString(36);
const ALL_ROLES = Object.keys(ROLE_PERMISSION_MATRIX);

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ' | ' + detail : ''}`); }
  else { fail++; console.error(`[FAIL] ${name}${detail ? ' | ' + detail : ''}`); }
}

// ---------- role selection (dynamic, from the real matrix) ----------
function roleWith(perm: PermissionGroup): string {
  const r = ALL_ROLES.find(x => hasPermission(x, perm));
  if (!r) throw new Error(`No role in matrix has ${perm}`);
  return r;
}
function roleWithout(perm: PermissionGroup): string {
  const r = ALL_ROLES.find(x => !hasPermission(x, perm));
  if (!r) throw new Error(`Every role in matrix has ${perm}`);
  return r;
}
const isViewAll = (r: string) => hasPermission(r, 'EXPENSE_APPROVE') || hasPermission(r, 'FINANCIAL_REPORTS');
const isSubmitterOnly = (r: string) => hasPermission(r, 'EXPENSE_SUBMIT') && !isViewAll(r);
const hasNoExpenseAccess = (r: string) => !hasPermission(r, 'EXPENSE_SUBMIT') && !isViewAll(r);

// ---------- temp users ----------
interface TempUser { key: string; id: string; username: string; role: string; token: string; }
const tempUsers: TempUser[] = [];
const createdRequestIds: string[] = [];
const attachmentDocIds: string[] = [];

async function createUser(pool: any, validHash: string, key: string, role: string): Promise<TempUser> {
  const username = `p4t_${key}_${RUN}`.toLowerCase();
  const id = `usr-${username}`;
  await pool.query(
    `INSERT INTO an_users (id, tenant_id, username, full_name, email, role, status, password_hash, two_factor_enabled, requires_password_change, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, false, false, NOW())`,
    [id, TENANT_ID, username, `P4 Test ${key}`, `${username}@an-erp.local`, role, validHash]
  );
  const u: TempUser = { key, id, username, role, token: '' };
  tempUsers.push(u);
  return u;
}

async function login(username: string): Promise<string> {
  const password = process.env.INITIAL_USER_PASSWORD;
  if (!password) throw new Error('INITIAL_USER_PASSWORD is not set');
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-code': 'MAIN' },
    body: JSON.stringify({ tenantCode: 'MAIN', username, password }),
  });
  const data: any = await res.json();
  if (res.status !== 200 || !data.accessToken) throw new Error(`Login failed for ${username}: ${res.status} ${JSON.stringify(data)}`);
  return data.accessToken;
}

async function call(method: string, path: string, token?: string, body?: any, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-tenant-code': 'MAIN', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  let json: any = null;
  try { json = await res.json(); } catch { /* html / empty body */ }
  return { status: res.status, json };
}

async function main() {
  console.log('==============================================================');
  console.log('  A.N ERP — PHASE 3 (AUTHZ-002) AUTHORIZATION VERIFICATION');
  console.log('==============================================================');

  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const pool = (adapter as any).pool;

  try {
    const base = await pool.query("SELECT password_hash FROM an_users WHERE tenant_id = $1 AND username = 'warehouse'", [TENANT_ID]);
    if (!base.rows.length || !base.rows[0].password_hash) throw new Error('Base user "warehouse" with password_hash not found');
    const validHash = base.rows[0].password_hash;

    // ---- affected-role report (computed from hasPermission) ----
    const lacks = (p: PermissionGroup) => ALL_ROLES.filter(r => !hasPermission(r, p));
    console.log(`\nRoles in matrix (${ALL_ROLES.length}): ${ALL_ROLES.join(', ')}`);
    console.log(`Roles lacking CUSTODY_VIEW: ${lacks('CUSTODY_VIEW').join(', ') || '—'}`);
    console.log(`Roles lacking ENTRY_VIEW:   ${lacks('ENTRY_VIEW').join(', ') || '—'}`);
    console.log(`Roles lacking STOCK_VIEW:   ${lacks('STOCK_VIEW').join(', ') || '—'}`);
    console.log(`Submitter-only roles (see own expense requests only): ${ALL_ROLES.filter(isSubmitterOnly).join(', ') || '—'}`);
    console.log(`View-all expense roles: ${ALL_ROLES.filter(isViewAll).join(', ') || '—'}`);
    console.log(`No-expense-access roles: ${ALL_ROLES.filter(hasNoExpenseAccess).join(', ') || '—'}\n`);

    // ---- create one temp user per role, plus a second submitter-only user (isolation test) ----
    const byRole: Record<string, TempUser> = {};
    for (const role of ALL_ROLES) byRole[role] = await createUser(pool, validHash, role, role);
    const submitterRole = ALL_ROLES.find(isSubmitterOnly);
    if (!submitterRole) throw new Error('No submitter-only role in matrix');
    const submitterB = await createUser(pool, validHash, `${submitterRole}_b`, submitterRole);
    // Users above are inserted with raw SQL. When the membership layer (phase-4 / IDENT-001) is present,
    // initializeSchema() idempotently backfills their membership/role/scope rows; before it, this is a harmless re-run.
    await adapter.initializeSchema();
    for (const u of tempUsers) u.token = await login(u.username);
    console.log(`✓ Logged in ${tempUsers.length} temporary users\n`);

    const tok = (role: string) => byRole[role].token;

    // ---- 1) 16 routes: denied -> exactly 403, allowed -> not 401/403 ----
    interface RouteCase { method: string; path: string; perm: PermissionGroup; body?: any; }
    const routeCases: RouteCase[] = [
      // 7 newly closed (permission-middleware ones; expense/attachment/print are covered in dedicated sections)
      { method: 'GET', path: '/api/custody/vouchers', perm: 'CUSTODY_VIEW' },
      { method: 'GET', path: '/api/custody/vouchers/p4-nonexistent', perm: 'CUSTODY_VIEW' },
      // 9 previously closed — regression
      { method: 'GET', path: '/api/accounting/accounts', perm: 'ENTRY_VIEW' },
      { method: 'GET', path: '/api/accounting/periods', perm: 'ENTRY_VIEW' },
      { method: 'GET', path: '/api/accounting/dimensions', perm: 'ENTRY_VIEW' },
      { method: 'GET', path: '/api/accounting/items', perm: 'ENTRY_VIEW' },
      { method: 'GET', path: '/api/custody/custodies', perm: 'CUSTODY_VIEW' },
      { method: 'GET', path: '/api/custody/custodies/p4-nonexistent', perm: 'CUSTODY_VIEW' },
      { method: 'GET', path: '/api/custody/expenses', perm: 'CUSTODY_VIEW' },
      { method: 'GET', path: '/api/custody/settlements', perm: 'CUSTODY_VIEW' },
      { method: 'GET', path: '/api/custody/hr-clearance/p4-nonexistent', perm: 'CUSTODY_VIEW' },
    ];
    console.log('--- permission-guarded routes ---');
    for (const c of routeCases) {
      const allowedRole = roleWith(c.perm);
      const deniedRole = roleWithout(c.perm);
      const d = await call(c.method, c.path, tok(deniedRole), c.body);
      const a = await call(c.method, c.path, tok(allowedRole), c.body);
      check(`${c.method} ${c.path}`, d.status === 403 && a.status !== 401 && a.status !== 403,
        `denied(${deniedRole})=${d.status} allowed(${allowedRole})=${a.status}`);
    }

    // ---- 2) R-EXP: expense requests ----
    console.log('\n--- R-EXP: expense requests ---');
    const viewAllRole = ALL_ROLES.find(isViewAll)!;
    const noAccessRole = ALL_ROLES.find(hasNoExpenseAccess);
    const A = byRole[submitterRole];
    const B = submitterB;

    const mkBody = (title: string) => ({
      titleAr: `${title} ${RUN}`,
      employeeId: 'EMP-P4',
      employeeName: 'P4 Test Employee',
      paymentMethod: 'DIRECT_BANK_TRANSFER',
      fundingSource: 'DIRECT_PAYMENT',
      disbursementAccountCode: '1020',
      lines: [{ categoryId: 'cat-office', description: 'P4 test line', amount: 100 }],
    });
    const submit = async (u: TempUser, title: string) => {
      const r = await call('POST', '/api/expenses/requests', u.token, mkBody(title), { 'Idempotency-Key': `p4-${RUN}-${u.key}-${title}` });
      const id = r.json?.data?.request?.id;
      if (id) createdRequestIds.push(id);
      return { status: r.status, id: id as string | undefined };
    };
    const ra = await submit(A, 'A');
    const rb = await submit(B, 'B');
    check('Submitter A created a request', ra.status === 200 && !!ra.id, `status=${ra.status}`);
    check('Submitter B created a request', rb.status === 200 && !!rb.id, `status=${rb.status}`);

    if (ra.id && rb.id) {
      const listA = await call('GET', '/api/expenses/requests', A.token);
      const idsA: string[] = (listA.json?.data || []).map((x: any) => x.id);
      check('A sees A\'s request in the list', listA.status === 200 && idsA.includes(ra.id));
      check('A does NOT see B\'s request in the list', !idsA.includes(rb.id));
      check('A sees only own records', (listA.json?.data || []).every((x: any) => x.submittedBy === A.id));

      const aOwn = await call('GET', `/api/expenses/requests/${ra.id}`, A.token);
      check('A can open A\'s request detail', aOwn.status === 200, `status=${aOwn.status}`);
      const aOfB = await call('GET', `/api/expenses/requests/${rb.id}`, A.token);
      check('A requesting B\'s ID gets 404', aOfB.status === 404, `status=${aOfB.status}`);

      const allTok = tok(viewAllRole);
      const listAll = await call('GET', '/api/expenses/requests', allTok);
      const idsAll: string[] = (listAll.json?.data || []).map((x: any) => x.id);
      check(`View-all role (${viewAllRole}) sees both`, listAll.status === 200 && idsAll.includes(ra.id) && idsAll.includes(rb.id));
      const allOfB = await call('GET', `/api/expenses/requests/${rb.id}`, allTok);
      check(`View-all role (${viewAllRole}) opens B's detail`, allOfB.status === 200, `status=${allOfB.status}`);
    }
    if (noAccessRole) {
      const l = await call('GET', '/api/expenses/requests', tok(noAccessRole));
      const dtl = await call('GET', '/api/expenses/requests/p4-nonexistent', tok(noAccessRole));
      check(`No-expense-access role (${noAccessRole}) list -> 403`, l.status === 403, `status=${l.status}`);
      check(`No-expense-access role (${noAccessRole}) detail -> 403`, dtl.status === 403, `status=${dtl.status}`);
    } else {
      console.log('[SKIP] no role without expense access in matrix');
    }

    // ---- 3) attachments ----
    console.log('\n--- attachments ---');
    const ATT_WRITE: Record<string, PermissionGroup> = {
      EXPENSE_CLAIM: 'EXPENSE_SUBMIT', EXPENSE_REQUEST: 'EXPENSE_SUBMIT',
      STOCK_RECEIPT: 'STOCK_RECEIVE', RECEIPT: 'STOCK_RECEIVE',
      STOCK_ISSUE: 'STOCK_ISSUE', ISSUE: 'STOCK_ISSUE',
      STOCK_TRANSFER: 'STOCK_TRANSFER', STOCK_COUNT: 'STOCK_COUNT_APPROVE', STOCK_RETURN: 'STOCK_RETURN',
      JOURNAL_ENTRY: 'ENTRY_CREATE', CUSTODY_VOUCHER: 'CUSTODY_EXPENSE_RECORD', CUSTODY_SETTLEMENT: 'CUSTODY_SETTLE',
    };
    const ATT_READ: Record<string, PermissionGroup | 'R-EXP'> = {
      EXPENSE_CLAIM: 'R-EXP', EXPENSE_REQUEST: 'R-EXP',
      STOCK_RECEIPT: 'STOCK_VIEW', RECEIPT: 'STOCK_VIEW', STOCK_ISSUE: 'STOCK_VIEW', ISSUE: 'STOCK_VIEW',
      STOCK_TRANSFER: 'STOCK_VIEW', STOCK_COUNT: 'STOCK_VIEW', STOCK_RETURN: 'STOCK_VIEW',
      JOURNAL_ENTRY: 'ENTRY_VIEW', CUSTODY_VOUCHER: 'CUSTODY_VIEW', CUSTODY_SETTLEMENT: 'CUSTODY_VIEW',
    };
    for (const docType of Object.keys(ATT_WRITE)) {
      const perm = ATT_WRITE[docType];
      const okRole = roleWith(perm);
      const noRole = roleWithout(perm);
      const docId = `p4-doc-${RUN}-${docType}`;
      attachmentDocIds.push(docId);
      const body = { documentType: docType, documentId: docId, documentNumber: 'P4-1', fileName: 'p4.pdf', fileUrl: 'https://example.invalid/p4.pdf' };
      const dn = await call('POST', '/api/attachments', tok(noRole), body, { 'Idempotency-Key': `p4-att-d-${RUN}-${docType}` });
      const ok = await call('POST', '/api/attachments', tok(okRole), body, { 'Idempotency-Key': `p4-att-a-${RUN}-${docType}` });
      check(`POST /api/attachments ${docType}`, dn.status === 403 && ok.status !== 403 && ok.status !== 401,
        `denied(${noRole})=${dn.status} allowed(${okRole})=${ok.status}`);

      const readReq = ATT_READ[docType];
      const q = `?documentType=${docType}&documentId=${docId}`;
      let okR: string, noR: string;
      if (readReq === 'R-EXP') { okR = ALL_ROLES.find(isViewAll)!; noR = ALL_ROLES.find(hasNoExpenseAccess) || ''; }
      else { okR = roleWith(readReq); noR = roleWithout(readReq); }
      if (!noR) { console.log(`[SKIP] GET ${docType}: no denied role in matrix`); continue; }
      const gd = await call('GET', `/api/attachments${q}`, tok(noR));
      const ga = await call('GET', `/api/attachments${q}`, tok(okR));
      check(`GET /api/attachments ${docType}`, gd.status === 403 && ga.status !== 403 && ga.status !== 401,
        `denied(${noR})=${gd.status} allowed(${okR})=${ga.status}`);
    }
    const anyTok = tok(roleWith('ENTRY_VIEW'));
    const uGet = await call('GET', '/api/attachments?documentType=NOT_A_TYPE&documentId=x', anyTok);
    check('GET /api/attachments unknown type -> 400', uGet.status === 400, `status=${uGet.status}`);
    const uPost = await call('POST', '/api/attachments', anyTok, { documentType: 'NOT_A_TYPE', documentId: 'x', fileName: 'x.pdf', fileUrl: 'https://example.invalid/x' }, { 'Idempotency-Key': `p4-att-u-${RUN}` });
    check('POST /api/attachments unknown type -> 400', uPost.status === 400, `status=${uPost.status}`);

    // ---- 4) print ----
    console.log('\n--- print ---');
    const PRINT: Record<string, PermissionGroup> = {
      'journal-entry': 'ENTRY_VIEW', 'custody-voucher': 'CUSTODY_VIEW', 'custody-settlement': 'CUSTODY_VIEW',
      'stock-receipt': 'STOCK_VIEW', 'stock-issue': 'STOCK_VIEW', 'stock-transfer': 'STOCK_VIEW',
      'stock-count': 'STOCK_VIEW', 'stock-card': 'STOCK_VIEW', 'item-ledger': 'STOCK_VIEW',
    };
    for (const [docType, perm] of Object.entries(PRINT)) {
      const noRole = roleWithout(perm);
      const okRole = roleWith(perm);
      const d = await call('GET', `/api/print/${docType}/p4-nonexistent`, tok(noRole));
      const a = await call('GET', `/api/print/${docType}/p4-nonexistent`, tok(okRole));
      check(`GET /api/print/${docType}`, d.status === 403 && a.status !== 403 && a.status !== 401,
        `denied(${noRole})=${d.status} allowed(${okRole})=${a.status}`);
    }
    if (noAccessRole) {
      const d = await call('GET', '/api/print/expense-request/p4-nonexistent', tok(noAccessRole));
      check(`GET /api/print/expense-request no-access (${noAccessRole}) -> 403`, d.status === 403, `status=${d.status}`);
    }
    const aExp = await call('GET', '/api/print/expense-request/p4-nonexistent', tok(viewAllRole));
    check(`GET /api/print/expense-request view-all (${viewAllRole}) not 401/403`, aExp.status !== 401 && aExp.status !== 403, `status=${aExp.status}`);
    const pUnknown = await call('GET', '/api/print/not-a-doc-type/x', anyTok);
    check('GET /api/print unknown docType -> 400 (existing behavior)', pUnknown.status === 400, `status=${pUnknown.status}`);

    // ---- 5) public routes ----
    console.log('\n--- public routes (no token) ---');
    for (const p of ['/api/calendar', '/api/wizard/tax-rules', '/api/wizard/activity-templates']) {
      const r = await call('GET', p);
      check(`GET ${p} without token -> 200`, r.status === 200, `status=${r.status}`);
    }
  } finally {
    // ---- cleanup ----
    try {
      const userIds = tempUsers.map(u => u.id);
      if (createdRequestIds.length) await pool.query('DELETE FROM an_expense_requests WHERE id = ANY($1::text[])', [createdRequestIds]);
      if (attachmentDocIds.length) await pool.query('DELETE FROM an_document_attachments WHERE document_id = ANY($1::text[])', [attachmentDocIds]);
      if (userIds.length) {
        const fam = await pool.query('SELECT family_id FROM an_token_families WHERE user_id = ANY($1::text[])', [userIds]);
        const famIds = fam.rows.map((r: any) => r.family_id);
        if (famIds.length) {
          await pool.query('DELETE FROM an_refresh_tokens WHERE family_id = ANY($1::text[])', [famIds]);
          await pool.query('DELETE FROM an_token_families WHERE family_id = ANY($1::text[])', [famIds]);
        }
        await pool.query('DELETE FROM an_refresh_tokens WHERE user_id = ANY($1::text[])', [userIds]);
        await pool.query('DELETE FROM an_users WHERE id = ANY($1::text[])', [userIds]);
      }
      console.log(`\n✓ Cleaned up ${tempUsers.length} temp users, ${createdRequestIds.length} expense requests, ${attachmentDocIds.length} attachment doc ids`);
    } catch (e: any) {
      console.error('Cleanup error:', e.message);
      fail++;
    }
  }

  console.log('\n--------------------------------------------------------------');
  console.log(`Passed: ${pass} | Failed: ${fail}`);
  console.log('--------------------------------------------------------------');
  if (fail > 0) { console.error('PHASE 3 AUTHORIZATION VERIFICATION FAILED'); process.exit(1); }
  console.log('ALL PHASE 3 AUTHORIZATION TESTS PASSED');
  process.exit(0);
}

main().catch(err => { console.error('Fatal test error:', err); process.exit(1); });
