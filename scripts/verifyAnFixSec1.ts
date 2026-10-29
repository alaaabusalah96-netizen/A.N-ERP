import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import argon2 from 'argon2';
import { TokenService } from '../src/an-core/auth/TokenService';
import { InMemoryAdapter } from '../src/an-core/storage/adapters/InMemoryAdapter';
import { anStyleLogin } from '../src/lib/anAuthLogin';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}`); }
}
const read = (p: string): string => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
const SECRET = 'unit-test-secret-not-a-real-secret';
const sign = (h: string, p: string): string => crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
// If PRECHECK-b showed resolveAnLoginFlag needs a different value than '1', change it here.
const LOGIN_ENV: any = { AN_ENABLE_AN_LOGIN: '1', JWT_SECRET: SECRET };
const mkRouter = (adapter: any): any => ({ getPrimaryAdapter: () => adapter });

async function main(): Promise<void> {
  const prevSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;

  // ---- TokenService (functional) ----
  const tokens = new TokenService(new InMemoryAdapter() as any);
  const fam = await tokens.createRefreshTokenFamily('u1', 't1', 's1');
  const access = tokens.generateAccessToken({ userId: 'u1', tenantId: 't1', role: 'auditor', sessionId: 's1', familyId: fam.familyId });
  const [h, p, s] = access.split('.');

  check('01 valid access token verifies', (await tokens.verifyAccessToken(access)).valid === true);
  const flipped = s.slice(0, -1) + (s.endsWith('A') ? 'B' : 'A');
  check('02 tampered signature rejected', (await tokens.verifyAccessToken(`${h}.${p}.${flipped}`)).valid === false);
  check('03 alg=none rejected', (await tokens.verifyAccessToken(`${b64({ alg: 'none', typ: 'JWT' })}.${p}.`)).valid === false);
  const h512 = b64({ alg: 'HS512', typ: 'JWT' });
  check('04 wrong alg header rejected even if HMAC matches', (await tokens.verifyAccessToken(`${h512}.${p}.${sign(h512, p)}`)).valid === false);
  const expPayload = b64({ sub: 'u1', tenantId: 't1', role: 'x', sessionId: 's1', familyId: fam.familyId, iat: 1, exp: Math.floor(Date.now() / 1000) - 10 });
  check('05 expired token rejected', (await tokens.verifyAccessToken(`${h}.${expPayload}.${sign(h, expPayload)}`)).valid === false);

  const rot1: any = await tokens.rotateRefreshToken(fam.refreshToken);
  check('06 rotate for missing user fails and issues no tokens', rot1.success === false && !rot1.newAccessToken && !rot1.newRefreshToken);
  const rot2: any = await tokens.rotateRefreshToken(fam.refreshToken);
  check('07 replay after failed rotate stays rejected', rot2.success === false);

  // ---- anStyleLogin (functional, stub adapters) ----
  const goodHash = await argon2.hash('Correct#Pass1');
  let calls = 0;
  const unknownAdapter = { getUserByUsername: async () => { calls++; return { success: true, data: null }; } };
  const t0 = Date.now();
  const r1: any = await anStyleLogin(mkRouter(unknownAdapter), { username: 'ghost', password: 'whatever1', tenantId: 'default' }, LOGIN_ENV);
  const elapsed = Date.now() - t0;
  check('08 unknown user -> invalid_credentials 401', r1.ok === false && r1.code === 'invalid_credentials' && r1.httpStatus === 401);
  check('09 unknown user still spends verification time (>=3ms)', elapsed >= 3);

  const inactiveAdapter = { getUserByUsername: async () => ({ success: true, data: { id: 'u9', username: 'bob', status: 'INACTIVE', passwordHash: goodHash, tenantId: 'default', role: 'x' } }) };
  const r2: any = await anStyleLogin(mkRouter(inactiveAdapter), { username: 'bob', password: 'Wrong#Pass9', tenantId: 'default' }, LOGIN_ENV);
  check('10 inactive user + wrong password -> invalid_credentials (no state leak)', r2.ok === false && r2.code === 'invalid_credentials');
  const r3: any = await anStyleLogin(mkRouter(inactiveAdapter), { username: 'bob', password: 'Correct#Pass1', tenantId: 'default' }, LOGIN_ENV);
  check('11 inactive user + correct password -> user_inactive 403', r3.ok === false && r3.code === 'user_inactive' && r3.httpStatus === 403);

  const boomAdapter = { getUserByUsername: async () => { throw new Error('secret-conn-string-xyz'); } };
  const r4: any = await anStyleLogin(mkRouter(boomAdapter), { username: 'bob', password: 'Correct#Pass1', tenantId: 'default' }, LOGIN_ENV);
  check('12 storage error is sanitized (503, no internal text)', r4.httpStatus === 503 && !JSON.stringify(r4).includes('secret-conn-string-xyz'));

  calls = 0;
  const r5: any = await anStyleLogin(mkRouter(unknownAdapter), { username: 'bob', password: 'x'.repeat(2000), tenantId: 'default' }, LOGIN_ENV);
  check('13 oversized password rejected before any storage call', r5.ok === false && r5.httpStatus === 401 && calls === 0);

  // ---- static source checks ----
  const ts = read('src/an-core/auth/TokenService.ts');
  const al = read('src/lib/anAuthLogin.ts');
  const sv = read('server.ts');
  check('14 TokenService uses timingSafeEqual and no plain signature compare', ts.includes('timingSafeEqual') && !ts.includes('signature !== expectedSig'));
  check('15 TokenService has no auditor fallback role', !ts.includes("'auditor'"));
  check('16 anAuthLogin has burnVerify + input caps and no raw e.message in responses',
    al.includes('burnVerify') && al.includes('MAX_PASSWORD_LEN') && !/message:\s*\(e\?\.message/.test(al));
  const idx = sv.indexOf('app.post("/api/an/auth/login"');
  const routeHead = idx >= 0 ? sv.slice(idx, idx + 220) : '';
  const routeBody = idx >= 0 ? sv.slice(idx, idx + 1100) : '';
  check('17 login route uses authRateLimiter + anLoginUserLimiter', routeHead.includes('authRateLimiter') && routeHead.includes('anLoginUserLimiter'));
  check('18 login route does not echo err.message', idx >= 0 && !routeBody.includes('err?.message'));

  if (prevSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = prevSecret;
  console.log(`\nPassed: ${passed} | Failed: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('verifyAnFixSec1 crashed:', e?.message || e); process.exit(1); });
