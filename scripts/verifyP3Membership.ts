/**
 * @file verifyP3Membership.ts
 * @description Phase 4 (IDENT-001) — real verification of the membership / role / scope layer.
 *
 * Requirements: PostgreSQL via DATABASE_URL (.env) + the env passwords the server already needs
 * (SEED_ADMIN_PASSWORD, INITIAL_USER_PASSWORD, RESET_USER_PASSWORD). The script starts its own live
 * server on PORT=3101 (npx tsx server.ts), restarts it twice, and stops it at the end.
 * Run:  npx tsx scripts/verifyP3Membership.ts
 *
 * - Creates only temporary users / one temporary wizard company and removes everything it created in `finally`.
 * - Never prints passwords or secrets.
 * - Writes real evidence to evidence/phase-3/identity-scope-matrix-v2.md (never touches the old matrix).
 */
import dotenv from 'dotenv';
dotenv.config();
import fs from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { CompanyWizardService } from '../src/core/wizard/CompanyWizardService';
import { accessTokenFromResponse } from './lib/httpAuth';

const PORT = 3101;
const BASE = `http://127.0.0.1:${PORT}`;
const TENANT = 'tenant-main';
const RUN = Date.now().toString(36);
const EVIDENCE_PATH = path.join(process.cwd(), 'evidence', 'phase-3', 'identity-scope-matrix-v2.md');

const outLines: string[] = [];
let pass = 0;
let fail = 0;
function log(s: string) { outLines.push(s); console.log(s); }
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++; else fail++;
  log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' | ' + detail : ''}`);
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ DB helpers (always tenant-scoped, so RLS never hides rows)
let adapter: any;
let pool: any;

async function inTenant<T = any>(tenantId: string, fn: (c: any) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    c.release();
  }
}
async function sql(text: string, params: any[] = [], tenantId = TENANT): Promise<any> {
  return inTenant(tenantId, (c) => c.query(text, params));
}
async function allTenantIds(): Promise<string[]> {
  return (await pool.query('SELECT id FROM an_tenants')).rows.map((r: any) => r.id);
}
async function counts() {
  const tenants = await allTenantIds();
  const t = { users: 0, memberships: 0, roles: 0, scopes: 0, usersWithoutMembership: 0 };
  for (const id of tenants) {
    const r = await sql(
      `SELECT
         (SELECT count(*)::int FROM an_users) AS users,
         (SELECT count(*)::int FROM an_memberships) AS memberships,
         (SELECT count(*)::int FROM an_role_assignments) AS roles,
         (SELECT count(*)::int FROM an_membership_scopes) AS scopes,
         (SELECT count(*)::int FROM an_users u WHERE NOT EXISTS (SELECT 1 FROM an_memberships m WHERE m.tenant_id = u.tenant_id AND m.user_id = u.id)) AS missing`,
      [], id);
    const x = r.rows[0];
    t.users += x.users; t.memberships += x.memberships; t.roles += x.roles; t.scopes += x.scopes; t.usersWithoutMembership += x.missing;
  }
  return t;
}
async function userMembershipRows(userId: string, tenantId = TENANT) {
  const r = await sql(
    `SELECT
       (SELECT count(*)::int FROM an_memberships WHERE user_id = $1) AS m,
       (SELECT count(*)::int FROM an_role_assignments ra JOIN an_memberships m ON m.id = ra.membership_id WHERE m.user_id = $1 AND ra.status = 'ACTIVE') AS r,
       (SELECT count(*)::int FROM an_membership_scopes s JOIN an_memberships m ON m.id = s.membership_id WHERE m.user_id = $1) AS s`,
    [userId], tenantId);
  return r.rows[0] as { m: number; r: number; s: number };
}
async function activeRole(userId: string, tenantId = TENANT): Promise<string | null> {
  const r = await sql(
    `SELECT ra.role FROM an_role_assignments ra JOIN an_memberships m ON m.id = ra.membership_id
     WHERE m.user_id = $1 AND ra.status = 'ACTIVE'`, [userId], tenantId);
  return r.rows[0]?.role ?? null;
}

// ------------------------------------------------------------------ server control
let server: ChildProcess | null = null;
async function startServer() {
  server = spawn('npx', ['tsx', 'server.ts'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
    detached: true,
    shell: process.platform === 'win32',
  });
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.status === 200) return;
    } catch { /* not up yet */ }
    await sleep(1000);
  }
  throw new Error('Server did not become healthy on port ' + PORT);
}
async function stopServer() {
  if (!server || !server.pid) return;
  try { process.kill(-server.pid, 'SIGTERM'); } catch { try { server.kill('SIGTERM'); } catch { /* ignore */ } }
  for (let i = 0; i < 20; i++) {
    try { await fetch(`${BASE}/api/health`); await sleep(500); } catch { break; }
  }
  server = null;
}

// ------------------------------------------------------------------ HTTP helpers
async function call(method: string, p: string, token?: string, body?: any, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'x-tenant-code': 'MAIN', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${BASE}${p}`, { method, headers: h, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
    if (res.status === 429) { await sleep(3000); continue; }
    let json: any = null;
    try { json = await res.json(); } catch { /* empty */ }
    return { status: res.status, json, cookieToken: accessTokenFromResponse(res) };
  }
  return { status: 429, json: null };
}
async function login(username: string, password: string | undefined, tenantCode = 'MAIN'): Promise<string> {
  if (!password) throw new Error(`password env missing for ${username}`);
  const r = await call('POST', '/api/auth/login', undefined, { tenantCode, username, password }, { 'x-tenant-code': tenantCode });
  if (r.status !== 200 || !r.cookieToken) throw new Error(`login failed for ${username}: ${r.status}`);
  return r.cookieToken;
}

// ------------------------------------------------------------------ temp-user bookkeeping
const tempUserIds: { id: string; tenantId: string }[] = [];
let validHash = '';
async function makeUser(role: string, key: string) {
  const username = `p4m_${key}_${RUN}`.toLowerCase();
  const user: any = {
    id: `usr-${username}`, tenantId: TENANT, username, fullName: `P4 Membership ${key}`,
    email: `${username}@an-erp.local`, role, status: 'ACTIVE', passwordHash: validHash,
    twoFactorEnabled: false, requiresPasswordChange: false, createdAt: new Date().toISOString(),
  };
  tempUserIds.push({ id: user.id, tenantId: TENANT });
  const r = await adapter.saveUser(user, `p4m-${RUN}-${key}`, true);
  if (!r.success) throw new Error(`saveUser failed for ${key}: ${JSON.stringify(r.error)}`);
  return { id: user.id as string, username, role };
}

async function deleteUserRows(userId: string, tenantId: string) {
  await inTenant(tenantId, async (c) => {
    await c.query('DELETE FROM an_membership_scopes WHERE membership_id IN (SELECT id FROM an_memberships WHERE user_id = $1)', [userId]);
    await c.query('DELETE FROM an_role_assignments WHERE membership_id IN (SELECT id FROM an_memberships WHERE user_id = $1)', [userId]);
    await c.query('DELETE FROM an_memberships WHERE user_id = $1', [userId]);
    const fam = await c.query('SELECT family_id FROM an_token_families WHERE user_id = $1', [userId]);
    const famIds = fam.rows.map((r: any) => r.family_id);
    if (famIds.length) {
      await c.query('DELETE FROM an_refresh_tokens WHERE family_id = ANY($1::text[])', [famIds]);
      await c.query('DELETE FROM an_token_families WHERE family_id = ANY($1::text[])', [famIds]);
    }
    await c.query('DELETE FROM an_refresh_tokens WHERE user_id = $1', [userId]);
    for (const t of ['an_active_sessions', 'an_last_successful_logins', 'an_failed_login_attempts']) {
      try {
        await c.query('SAVEPOINT s1');
        await c.query(`DELETE FROM ${t} WHERE user_id = $1`, [userId]);
        await c.query('RELEASE SAVEPOINT s1');
      } catch { await c.query('ROLLBACK TO SAVEPOINT s1'); }
    }
    await c.query('DELETE FROM an_users WHERE id = $1', [userId]);
  });
}

// Remove a whole temporary wizard company (multi-pass so FK ordering does not matter)
async function deleteTenant(tenantId: string) {
  const colRes = await pool.query(
    `SELECT DISTINCT table_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND column_name = 'tenant_id' AND table_name <> 'an_tenants'`);
  const tables: string[] = colRes.rows.map((r: any) => r.table_name);
  await inTenant(tenantId, async (c) => {
    // membership layer first, explicitly
    await c.query('DELETE FROM an_membership_scopes WHERE tenant_id = $1', [tenantId]);
    await c.query('DELETE FROM an_role_assignments WHERE tenant_id = $1', [tenantId]);
    await c.query('DELETE FROM an_memberships WHERE tenant_id = $1', [tenantId]);
    let remaining = tables.filter(t => !['an_membership_scopes', 'an_role_assignments', 'an_memberships'].includes(t));
    for (let pass = 0; pass < 8 && remaining.length; pass++) {
      const next: string[] = [];
      for (const t of remaining) {
        try {
          await c.query('SAVEPOINT d');
          await c.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [tenantId]);
          await c.query('RELEASE SAVEPOINT d');
        } catch { await c.query('ROLLBACK TO SAVEPOINT d'); next.push(t); }
      }
      if (next.length === remaining.length) break;
      remaining = next;
    }
  });
  await pool.query('DELETE FROM an_tenants WHERE id = $1', [tenantId]);
}

// ------------------------------------------------------------------ main
async function main() {
  log('==============================================================');
  log('  A.N ERP — PHASE 4 (IDENT-001) MEMBERSHIP / ROLE / SCOPE VERIFICATION');
  log('==============================================================');

  adapter = new PostgresPrimaryAdapter();
  const init = await adapter.initializeSchema();
  if (!init.success) throw new Error('initializeSchema failed: ' + JSON.stringify(init.error));
  pool = adapter.pool;

  const wizardCreated: { tenantId: string; adminId: string }[] = [];
  let beforeCounts: any = null;
  let bypass: any = null;
  let restartCounts: any[] = [];
  let tableCols: any[] = [];

  try {
    const bp = await pool.query('SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user');
    bypass = bp.rows[0];
    log(`DB role: rolbypassrls=${bypass?.rolbypassrls} rolsuper=${bypass?.rolsuper}`);

    const base = await sql("SELECT password_hash FROM an_users WHERE tenant_id = $1 AND username = 'warehouse'", [TENANT]);
    if (!base.rows[0]?.password_hash) throw new Error('Base user "warehouse" with password_hash not found');
    validHash = base.rows[0].password_hash;

    const cols = await pool.query(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name IN ('an_memberships','an_role_assignments','an_membership_scopes')
       ORDER BY table_name, ordinal_position`);
    tableCols = cols.rows;
    check('the three membership tables exist', new Set(cols.rows.map((r: any) => r.table_name)).size === 3);

    // (post-migration snapshot, before any temp rows)
    beforeCounts = await counts();
    log(`Post-migration counts: users=${beforeCounts.users} memberships=${beforeCounts.memberships} roles=${beforeCounts.roles} scopes=${beforeCounts.scopes} usersWithoutMembership=${beforeCounts.usersWithoutMembership}`);
    check('every existing user has a membership (users without membership = 0)', beforeCounts.usersWithoutMembership === 0);

    await startServer();
    log(`✓ live server started on PORT=${PORT}`);

    // ---------- (أ) seeded users ----------
    log('\n--- (أ) seeded users ---');
    const seeded: { u: string; pw?: string }[] = [
      { u: 'admin', pw: process.env.SEED_ADMIN_PASSWORD },
      { u: 'accountant', pw: process.env.INITIAL_USER_PASSWORD },
      { u: 'warehouse', pw: process.env.INITIAL_USER_PASSWORD },
    ];
    let adminToken = '';
    for (const s of seeded) {
      const row = await sql('SELECT id FROM an_users WHERE tenant_id = $1 AND username = $2', [TENANT, s.u]);
      if (!row.rows[0]) { check(`seeded user ${s.u} exists`, false); continue; }
      const mr = await userMembershipRows(row.rows[0].id);
      check(`seeded ${s.u}: membership + active role + scope rows`, mr.m === 1 && mr.r === 1 && mr.s >= 1, `m=${mr.m} r=${mr.r} s=${mr.s}`);
      try {
        const tk = await login(s.u, s.pw);
        if (s.u === 'admin') adminToken = tk;
        const me = await call('GET', '/api/auth/me', tk);
        check(`seeded ${s.u}: login + /api/auth/me`, me.status === 200, `status=${me.status}`);
      } catch (e: any) { check(`seeded ${s.u}: login + /api/auth/me`, false, e.message); }
    }

    // ---------- (ب) saveUser creates membership; deleting it -> 403 ----------
    log('\n--- (ب) saveUser auto-membership / inactive membership ---');
    const ub = await makeUser('accountant', 'b');
    const mrb = await userMembershipRows(ub.id);
    check('saveUser created membership + role + scope automatically', mrb.m === 1 && mrb.r === 1 && mrb.s === 1, `m=${mrb.m} r=${mrb.r} s=${mrb.s}`);
    const tb = await login(ub.username, process.env.INITIAL_USER_PASSWORD);
    const meb = await call('GET', '/api/auth/me', tb);
    check('new saveUser user can call /api/auth/me', meb.status === 200, `status=${meb.status}`);
    await sql(`DELETE FROM an_membership_scopes WHERE membership_id IN (SELECT id FROM an_memberships WHERE user_id = $1)`, [ub.id]);
    await sql(`DELETE FROM an_role_assignments WHERE membership_id IN (SELECT id FROM an_memberships WHERE user_id = $1)`, [ub.id]);
    await sql(`DELETE FROM an_memberships WHERE user_id = $1`, [ub.id]);
    const stb = await sql('SELECT status FROM an_users WHERE id = $1', [ub.id]);
    const gone = await call('GET', '/api/auth/me', tb);
    check('membership deleted -> 403 inactive-membership (an_users.status still ACTIVE)',
      gone.status === 403 && String(gone.json?.type || '').includes('inactive-membership') && stb.rows[0]?.status === 'ACTIVE',
      `status=${gone.status} an_users.status=${stb.rows[0]?.status}`);

    // ---------- (ج) setMembershipStatus ----------
    log('\n--- (ج) setMembershipStatus ---');
    const uc = await makeUser('accountant', 'c');
    const tc = await login(uc.username, process.env.INITIAL_USER_PASSWORD);
    const s1 = await adapter.setMembershipStatus(TENANT, uc.id, 'SUSPENDED');
    const c1 = await call('GET', '/api/auth/me', tc);
    check('SUSPENDED -> 403', s1.success && s1.data === true && c1.status === 403, `status=${c1.status}`);
    const s2 = await adapter.setMembershipStatus(TENANT, uc.id, 'ACTIVE');
    const c2 = await call('GET', '/api/auth/me', tc);
    check('back to ACTIVE -> works', s2.success && s2.data === true && c2.status === 200, `status=${c2.status}`);
    const s3 = await adapter.setMembershipStatus(TENANT, `no-such-user-${RUN}`, 'ACTIVE');
    check('setMembershipStatus for unknown user returns false', s3.success && s3.data === false);

    // ---------- (د) DB role authority ----------
    log('\n--- (د) DB is the role authority ---');
    const ud = await makeUser('accountant', 'd');
    const td = await login(ud.username, process.env.INITIAL_USER_PASSWORD);
    const d0 = await call('GET', '/api/accounting/accounts', td);
    check('accountant: ENTRY_VIEW route allowed', d0.status !== 401 && d0.status !== 403, `status=${d0.status}`);
    await sql(`UPDATE an_role_assignments SET role = 'warehouse_keeper' WHERE status = 'ACTIVE' AND membership_id = 'mbr-' || $1`, [ud.id]);
    const d1 = await call('GET', '/api/accounting/accounts', td);
    check('role switched to warehouse_keeper in DB -> 403 with the OLD token', d1.status === 403, `status=${d1.status}`);
    await sql(`UPDATE an_role_assignments SET role = 'accountant' WHERE status = 'ACTIVE' AND membership_id = 'mbr-' || $1`, [ud.id]);
    const d2 = await call('GET', '/api/accounting/accounts', td);
    check('role restored -> allowed again', d2.status !== 401 && d2.status !== 403, `status=${d2.status}`);

    // ---------- (د2) role sync on updateUser ----------
    log('\n--- (د2) updateUser role synchronization ---');
    const ue = await makeUser('accountant', 'e');
    const u1 = await adapter.updateUser(ue.id, { role: 'auditor' });
    check('updateUser(role=auditor) succeeded', u1.success === true);
    check('active role assignment is now auditor', (await activeRole(ue.id)) === 'auditor');
    await sql(`UPDATE an_role_assignments SET role = 'warehouse_keeper' WHERE status = 'ACTIVE' AND membership_id = 'mbr-' || $1`, [ue.id]);
    const u2 = await adapter.updateUser(ue.id, { role: 'auditor' });
    check('updateUser with the SAME role leaves the directly-managed assignment untouched',
      u2.success === true && (await activeRole(ue.id)) === 'warehouse_keeper');
    const mre = await userMembershipRows(ue.id);
    check('no duplicate rows after updateUser', mre.m === 1 && mre.r === 1 && mre.s === 1, `m=${mre.m} r=${mre.r} s=${mre.s}`);

    // ---------- (هـ) POST /api/users and CompanyWizard ----------
    log('\n--- (هـ) POST /api/users and CompanyWizard ---');
    if (!adminToken) {
      check('POST /api/users (admin token unavailable)', false);
    } else {
      const uname = `p4m_api_${RUN}`.toLowerCase();
      const cr = await call('POST', '/api/users', adminToken, { username: uname, fullName: 'P4 API User', role: 'accountant', email: `${uname}@an-erp.local` });
      const newId = cr.json?.data?.id as string | undefined;
      if (newId) tempUserIds.push({ id: newId, tenantId: TENANT });
      check('POST /api/users created a user', cr.status === 200 && !!newId, `status=${cr.status}`);
      if (newId) {
        const mr = await userMembershipRows(newId);
        check('API-created user has membership + role + scope', mr.m === 1 && mr.r === 1 && mr.s === 1, `m=${mr.m} r=${mr.r} s=${mr.s}`);
        try {
          // Phase 5 compatibility: after AUTH-003 the API returns a unique temporaryPassword; before it, RESET_USER_PASSWORD was used.
          const tk = await login(uname, cr.json?.data?.temporaryPassword || process.env.RESET_USER_PASSWORD);
          const me = await call('GET', '/api/auth/me', tk);
          check('API-created user works right after creation', me.status === 200, `status=${me.status}`);
        } catch (e: any) { check('API-created user works right after creation', false, e.message); }
      }
    }
    try {
      const wizard = new CompanyWizardService(adapter);
      const wuser = `p4m_wiz_${RUN}`.toLowerCase();
      const wpass = `Wz!${RUN}Aa9`;
      const wr = await wizard.createCompany({
        countryCode: 'SA', companyNameAr: `شركة اختبار العضوية ${RUN}`, companyNameEn: `Membership Test ${RUN}`,
        taxNumber: '300128472900003', activityTemplateId: 'tmpl-05',
        backendConfig: { adapterType: 'postgresql', connectionRef: 'DATABASE_URL', isolationLevel: 'Shared' },
        firstAdmin: { username: wuser, fullName: 'Wizard Admin', email: `${wuser}@company.sa`, password: wpass },
        idempotencyKey: `p4m-wiz-${RUN}`,
      } as any);
      if (!wr.success || !wr.data) throw new Error('wizard failed: ' + JSON.stringify(wr.error));
      wizardCreated.push({ tenantId: wr.data.tenant.id, adminId: wr.data.firstAdmin.id });
      const mr = await userMembershipRows(wr.data.firstAdmin.id, wr.data.tenant.id);
      check('CompanyWizard first admin has membership + role + scope', mr.m === 1 && mr.r === 1 && mr.s === 1, `m=${mr.m} r=${mr.r} s=${mr.s}`);
      const tk = await login(wuser, wpass, wr.data.tenant.code);
      const me = await call('GET', '/api/auth/me', tk, undefined, { 'x-tenant-code': wr.data.tenant.code });
      check('CompanyWizard first admin works right after creation', me.status === 200, `status=${me.status}`);
    } catch (e: any) { check('CompanyWizard flow', false, e.message); }

    // ---------- (و) restart idempotency ----------
    log('\n--- (و) restart idempotency ---');
    restartCounts.push(await counts());
    for (let i = 1; i <= 2; i++) {
      await stopServer();
      await startServer();
      restartCounts.push(await counts());
    }
    const same = restartCounts.every(c => c.memberships === restartCounts[0].memberships && c.roles === restartCounts[0].roles && c.scopes === restartCounts[0].scopes);
    check('table counts unchanged across two server restarts', same,
      restartCounts.map(c => `${c.memberships}/${c.roles}/${c.scopes}`).join(' -> '));
    check('users without membership = 0 after restarts', restartCounts[restartCounts.length - 1].usersWithoutMembership === 0);
  } catch (e: any) {
    check('fatal error during verification', false, e.message);
  } finally {
    log('\n--- cleanup ---');
    try { await stopServer(); } catch { /* ignore */ }
    for (const w of wizardCreated) {
      try { await deleteTenant(w.tenantId); log(`✓ removed temporary wizard company ${w.tenantId}`); }
      catch (e: any) { check(`cleanup wizard company ${w.tenantId}`, false, e.message); }
    }
    for (const u of tempUserIds) {
      try { await deleteUserRows(u.id, u.tenantId); }
      catch (e: any) { check(`cleanup user ${u.id}`, false, e.message); }
    }
    try {
      const after = await counts();
      const leftover = await sql(`SELECT count(*)::int AS n FROM an_users WHERE username LIKE $1`, [`p4m_%_${RUN}`]);
      check('no temporary users left', leftover.rows[0].n === 0);
      if (beforeCounts) {
        check('counts returned to the post-migration snapshot',
          after.users === beforeCounts.users && after.memberships === beforeCounts.memberships &&
          after.roles === beforeCounts.roles && after.scopes === beforeCounts.scopes,
          `before=${beforeCounts.users}/${beforeCounts.memberships}/${beforeCounts.roles}/${beforeCounts.scopes} after=${after.users}/${after.memberships}/${after.roles}/${after.scopes}`);
      }
    } catch (e: any) { check('post-cleanup verification', false, e.message); }

    // ---------- evidence (real data only) ----------
    try {
      const md: string[] = [];
      md.push('# Phase 4 (IDENT-001) — Identity Scope Matrix v2', '');
      md.push('## الجداول الثلاثة وأعمدتها', '');
      for (const t of ['an_memberships', 'an_role_assignments', 'an_membership_scopes']) {
        md.push(`### ${t}`);
        md.push(tableCols.filter(c => c.table_name === t).map(c => `- ${c.column_name} (${c.data_type})`).join('\n') || '- (not found)');
        md.push('');
      }
      md.push('## تدفق requireAuth الجديد', '',
        '1. فحص JWT وانتهاء الصلاحية، ثم تحميل المنشأة (tenant) — دون تغيير.',
        '2. `tokenService.verifyAccessToken` — دون تغيير.',
        '3. `userCheck = getUser(tenantId, sub)`؛ 403 إن لم يوجد المستخدم أو اختلف المستأجر أو حالته ≠ ACTIVE — دون تغيير.',
        '4. **جديد:** `getMembershipContext(tenantId, userId)`؛ 403 `inactive-membership` إن لم توجد عضوية أو حالتها ≠ ACTIVE أو لا دور نشط.',
        '5. `authContext.role` من جدول الأدوار (وليس من التوكن ولا `an_users.role`) + `authContext.scopes`.', '');
      md.push('## أرقام ما بعد الترحيل (استعلام فعلي)', '');
      if (beforeCounts) {
        md.push(`- DB role: rolbypassrls=${bypass?.rolbypassrls}, rolsuper=${bypass?.rolsuper}`);
        md.push(`- المستخدمون: ${beforeCounts.users}`, `- العضويات: ${beforeCounts.memberships}`, `- الأدوار: ${beforeCounts.roles}`, `- النطاقات: ${beforeCounts.scopes}`);
        md.push(`- مستخدمون بلا عضوية: ${beforeCounts.usersWithoutMembership}`);
      } else md.push('- (لم تُجمع الأرقام بسبب خطأ مبكر)');
      md.push('', '## مخرج الاختبارات', '', '```text', ...outLines, '```', '');
      md.push('## خارج النطاق', '',
        '- تصفية البيانات التشغيلية حسب النطاق (تحتاج أعمدة node في الجداول).',
        '- ربط OrgHierarchyService بالمسارات.',
        '- تغيير الدور عبر API (لا يوجد مسار لذلك اليوم).', '');
      fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
      fs.writeFileSync(EVIDENCE_PATH, md.join('\n'), 'utf-8');
      console.log(`evidence written: ${path.relative(process.cwd(), EVIDENCE_PATH)}`);
    } catch (e: any) { console.error('evidence write failed:', e.message); fail++; }

    try { await adapter.close(); } catch { /* ignore */ }
  }

  console.log('\n--------------------------------------------------------------');
  console.log(`Passed: ${pass} | Failed: ${fail}`);
  console.log('--------------------------------------------------------------');
  if (fail > 0) { console.error('PHASE 4 MEMBERSHIP VERIFICATION FAILED'); process.exit(1); }
  console.log('ALL PHASE 4 MEMBERSHIP TESTS PASSED');
  process.exit(0);
}

main().catch(err => { console.error('Fatal test error:', err); process.exit(1); });
