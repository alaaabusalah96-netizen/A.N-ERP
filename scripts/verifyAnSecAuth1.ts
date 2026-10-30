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

/** minimal Firestore double: collection('users').where().where().limit().get(), .doc(id).get()/.set() */
function fakeDb(seed: Record<string, any>) {
  const docs: Record<string, any> = { ...seed };
  const sets: Array<{ id: string; data: any }> = [];
  const mkQuery = (filters: Array<[string, any]>) => ({
    where(f: string, _op: string, v: any) { return mkQuery([...filters, [f, v]]); },
    limit() { return this; },
    async get() {
      const hit = Object.entries(docs).filter(([, d]) => filters.every(([f, v]) => d[f] === v));
      return { empty: hit.length === 0, docs: hit.slice(0, 1).map(([id, d]) => ({ id, data: () => d })) };
    },
  });
  return {
    docs, sets,
    collection() {
      return {
        where: (f: string, op: string, v: any) => mkQuery([[f, v]]).where.length ? mkQuery([[f, v]]) : mkQuery([]),
        doc: (id: string) => ({
          async get() { return { exists: id in docs, data: () => docs[id] }; },
          async set(data: any) { docs[id] = { ...(docs[id] || {}), ...data }; sets.push({ id, data }); },
        }),
      };
    },
  };
}

async function main() {
  const server = read('server.ts');
  const fnStart = server.indexOf('async function authenticateSessionOrBearer');
  const fnEnd = server.indexOf('// API Route - Unified Secure User Provisioning', fnStart);
  const authFn = server.slice(fnStart, fnEnd);

  check('A1 no hard-coded Admin for A.N JWT users', !/role:\s*"Admin",\s*\n\s*company_id:\s*\(req as any\)\.anTenantId/.test(authFn) && authFn.includes('anRole'));
  check('A2 no per-request StorageRouter in auth', !authFn.includes('new StorageRouter()') && server.includes('verifyAnAccessTokenShared'));
  check('A3 both bearer and cookie paths use shared verifier', (authFn.match(/verifyAnAccessTokenShared\(/g) || []).length === 2);
  check('A4 elevated A.N roles only on platform tenant', authFn.includes('tenant !== "default"') && authFn.includes('"Admin" : rawRole'));
  const logout = server.slice(server.indexOf('app.post("/api/an/auth/logout"'), server.indexOf('app.get("/api/an/auth/me"'));
  check('A5 logout revokes family (no rotation)', logout.includes('revokeFamilyByRefreshToken') && !logout.includes('rotateRefreshToken'));
  const i0 = server.indexOf('app.post("/api/an/company-backend/:companyId"');
  const cb = server.slice(i0, server.indexOf('\n    app.', i0 + 40));
  check('A6 company-backend POST is platform/system-admin only', cb.includes('backend_change_forbidden') && cb.includes('isPlatformAdminUser'));

  const bridge: any = await import(path.join(root, 'src/lib/anAuthBridge.ts'));
  // B1: attacker A.N user whose username equals a KEMIT SystemAdmin email must NOT be linked to it
  const victim = { email: 'boss@corp.com', role: 'SystemAdmin', is_active: true };
  const db1 = fakeDb({ 'kemit-uid-1': victim });
  let mintedFor = '';
  const auth1 = { createCustomToken: async (uid: string) => { mintedFor = uid; return 'tok'; } };
  const r1 = await bridge.issueFirebaseCustomTokenForAnUser({ adminDb: db1, getAdminAuth: () => auth1, anUser: { id: 'u-evil', username: 'boss@corp.com', role: 'Admin', tenantId: 'acme' } });
  check('A7 bridge: email-matching A.N user is NOT linked to the KEMIT account',
    r1.ok && mintedFor !== 'kemit-uid-1' && mintedFor.startsWith('an_') && !db1.docs['kemit-uid-1'].an_user_id && db1.docs[mintedFor].email !== 'boss@corp.com');
  // B2: role mapping
  const db2 = fakeDb({});
  await bridge.issueFirebaseCustomTokenForAnUser({ adminDb: db2, getAdminAuth: () => auth1, anUser: { id: 'u2', username: 'bob', role: 'SystemAdmin', tenantId: 'acme' } });
  const db3 = fakeDb({});
  await bridge.issueFirebaseCustomTokenForAnUser({ adminDb: db3, getAdminAuth: () => auth1, anUser: { id: 'u3', username: 'carol', tenantId: 'acme' } });
  const db4 = fakeDb({});
  await bridge.issueFirebaseCustomTokenForAnUser({ adminDb: db4, getAdminAuth: () => auth1, anUser: { id: 'u4', username: 'root', role: 'SystemAdmin', tenantId: 'default' } });
  const roleOf = (db: any) => (Object.values(db.docs)[0] as any).role;
  check('A8 bridge role mapping: tenant SystemAdmin->Admin, missing->User, platform SystemAdmin kept',
    roleOf(db2) === 'Admin' && roleOf(db3) === 'User' && roleOf(db4) === 'SystemAdmin');
  // B3: already linked pair -> same uid, role untouched
  const db5 = fakeDb({ an_linked: { an_user_id: 'u5', an_tenant_id: 'acme', role: 'Viewer', email: 'x@y.z' } });
  const r5 = await bridge.issueFirebaseCustomTokenForAnUser({ adminDb: db5, getAdminAuth: () => auth1, anUser: { id: 'u5', username: 'dave', role: 'SystemAdmin', tenantId: 'acme' } });
  check('A9 bridge: linked (id+tenant) reuses uid and never rewrites role', r5.firebaseUid === 'an_linked' && db5.docs['an_linked'].role === 'Viewer');
  // B4: same an_user_id in ANOTHER tenant must not link
  const r6 = await bridge.issueFirebaseCustomTokenForAnUser({ adminDb: db5, getAdminAuth: () => auth1, anUser: { id: 'u5', username: 'dave', role: 'Admin', tenantId: 'other' } });
  check('A10 bridge: same user id in another tenant is a different identity', r6.ok === true && r6.firebaseUid !== 'an_linked');

  const rv: any = await import(path.join(root, 'src/an-core/auth/anTokenRevoke.ts'));
  const calls: string[] = [];
  const storage: any = {
    withTenantScope: async (_t: string, fn: any) => fn(),
    getRefreshToken: async () => ({ success: true, data: { familyId: 'fam-1' } }),
    invalidateTokenFamily: async (f: string, why: string) => { calls.push(`${f}:${why}`); },
  };
  const tok = 'rt.' + Buffer.from(JSON.stringify({ tenantId: 'acme', familyId: 'fam-1' })).toString('base64url') + '.abcd';
  const ok1 = await rv.revokeFamilyByRefreshToken(storage, tok, 'LOGOUT');
  const bad1 = await rv.revokeFamilyByRefreshToken(storage, 'garbage', 'LOGOUT');
  const bad2 = await rv.revokeFamilyByRefreshToken({ ...storage, getRefreshToken: async () => ({ success: true, data: null }) }, tok, 'LOGOUT');
  check('A11 revoke: valid refresh token invalidates its family; garbage/unknown do nothing', ok1 === true && calls.length === 1 && calls[0] === 'fam-1:LOGOUT' && bad1 === false && bad2 === false);

  const pb: any = await import(path.join(root, 'src/lib/anPreviewBypass.ts'));
  check('A12 preview bypass: off in production unless FORCE; on in dev',
    pb.isPreviewBypassEnvEnabled({ AN_PREVIEW_BYPASS: '1', NODE_ENV: 'production' }) === false &&
    pb.isPreviewBypassEnvEnabled({ AN_PREVIEW_BYPASS: '1', NODE_ENV: 'production', AN_PREVIEW_BYPASS_FORCE: '1' }) === true &&
    pb.isPreviewBypassEnvEnabled({ AN_PREVIEW_BYPASS: '1', NODE_ENV: 'development' }) === true &&
    pb.isPreviewBypassEnvEnabled({ NODE_ENV: 'development' }) === false);

  const g: any = await import(path.join(root, 'src/lib/anConnectionRefGuard.ts'));
  const routerSrc = read('src/an-core/storage/StorageRouter.ts');
  check('A13 connection_ref guard = StorageRouter pattern (DATABASE_URL[_NAME] only)',
    routerSrc.includes('/^DATABASE_URL(_[A-Z0-9_]{1,40})?$/') &&
    ['DATABASE_URL', 'DATABASE_URL_TENANT_A'].every((r) => g.isSafeConnectionRef(r)) &&
    ['MYSQL_URL', 'SESSION_SECRET', 'JWT_SECRET', 'postgres://u:p@h/db', 'DATABASE_URL_', 'database_url', ''].every((r) => !g.isSafeConnectionRef(r)));
  check('A14 MERGE_STATUS records SEC-AUTH1', read('docs/MERGE_STATUS.md').includes('SEC-AUTH1'));

  console.log(`Passed: ${passed} | Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.log('[FAIL] verify crashed —', e?.message || e); process.exit(1); });
