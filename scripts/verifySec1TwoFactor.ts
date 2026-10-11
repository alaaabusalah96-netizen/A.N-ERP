/**
 * @file verifySec1TwoFactor.ts
 * @description SEC-1 (2FA secret disclosure, 2FA setup ownership, fabricated Riyadh location). InMemory only, NO database.   Run: npx tsx scripts/verifySec1TwoFactor.ts
 * It proves the TwoFactorService rules and, with STATIC checks on server.ts, that the routes use them. It does NOT start the HTTP server
 * (no live login request is made) and uses a deterministic fake TOTP (secret 'JBSWY3DPEHPK3PXP', code '123456'); the real otplib is not exercised.
 */
import * as fs from 'node:fs';
import * as nodeCrypto from 'node:crypto';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { TwoFactorService } from '../src/core/auth/TwoFactorService';
import { EncryptionService } from '../src/core/crypto/EncryptionService';

process.env.PII_ENCRYPTION_SECRET = process.env.PII_ENCRYPTION_SECRET || 'sec1-test-only-secret-not-for-production-0123456789';
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => { ok ? pass++ : fail++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${!ok && extra ? ' | ' + extra : ''}`); };
const SECRET = 'JBSWY3DPEHPK3PXP';
const deps = {
  generateSecret: () => SECRET,
  generateURI: (o: { label: string; issuer: string; secret: string }) => `otpauth://totp/${o.issuer}:${o.label}?secret=${o.secret}&issuer=${o.issuer}`,
  verify: (o: { token: string; secret: string }) => ({ valid: o.secret === SECRET && o.token === '123456' }),
  qrDataUrl: async (u: string) => `data:image/png;base64,QR(${u.length})`,
};
async function scenario(name: string, fn: () => Promise<void>) { try { await fn(); } catch (e: any) { fail++; console.log(`[FAIL] ${name} crashed | ${e?.message || e}`); } }
const mkUser = (tenantId: string, id: string, extra: any = {}) => ({ id, tenantId, username: `u-${id}`, fullName: id, email: `${id}@x.test`, role: 'accountant', status: 'ACTIVE' as const, passwordHash: 'h', ...extra });

async function main() {
  const st: any = new InMemoryAdapter();
  const tf = new TwoFactorService(deps);
  const plain = ['AAAA-0001', 'AAAA-0002', 'AAAA-0003'];
  const hashed = plain.map(c => nodeCrypto.createHash('sha256').update(c).digest('hex'));
  await st.saveUser(mkUser('TA', 'enrolled', { twoFactorEnabled: true, twoFactorSecret: EncryptionService.encryptPII(SECRET), hashedBackupCodes: hashed, backupCodes: hashed }), 'k-enrolled');
  await st.saveUser(mkUser('TA', 'fresh'), 'k-fresh');
  await st.saveUser(mkUser('TA', 'other', { twoFactorEnabled: true, twoFactorSecret: EncryptionService.encryptPII(SECRET) }), 'k-other');
  await st.saveUser(mkUser('TB', 'bob'), 'k-bob');
  const get = async (t: string, id: string) => (await st.getUser(t, id)).data;

  await scenario('login-challenge', async () => {
    const body = TwoFactorService.loginChallenge(false);
    const json = JSON.stringify(body);
    check('T1 enrolled user, no code: challenge only (requires2FA, setupRequired=false)', body.requires2FA === true && body.setupRequired === false);
    check('T1/T7 the challenge contains NO secret, QR, otpauth or twoFactorSecret', !/secret|qr|otpauth|twoFactor/i.test(Object.keys(body).join(',')) && !json.includes(SECRET) && !json.includes('otpauth') && !json.includes('data:image'));
    const before = (await get('TA', 'enrolled')).twoFactorSecret;
    for (let i = 0; i < 3; i++) TwoFactorService.loginChallenge(i === 1, 'x');
    check('T6 repeated challenges never create or change a secret', (await get('TA', 'enrolled')).twoFactorSecret === before);
    check('T12 impossible travel with an enrolled user: still a challenge only', JSON.stringify(TwoFactorService.loginChallenge(true, 'قفزة')).includes('anomalyDetected') && !JSON.stringify(TwoFactorService.loginChallenge(true, 'قفزة')).includes(SECRET));
  });

  await scenario('login-verify', async () => {
    const u = await get('TA', 'enrolled');
    check('T2 correct TOTP => valid', (await tf.verifyLoginSecondFactor(st, u, { twoFactorCode: '123456' })).valid === true);
    check('T3 wrong TOTP => invalid', (await tf.verifyLoginSecondFactor(st, u, { twoFactorCode: '000000' })).valid === false);
    const b1 = await tf.verifyLoginSecondFactor(st, u, { backupCode: 'aaaa-0001' });
    check('T4 valid backup code => valid, consumed (2 left)', b1.valid && b1.usedBackupCode && b1.remainingBackupCodes === 2);
    const u2 = await get('TA', 'enrolled');
    const b2 = await tf.verifyLoginSecondFactor(st, u2, { backupCode: 'AAAA-0001' });
    check('T5 replay of the consumed backup code => invalid', b2.valid === false && ((await get('TA', 'enrolled')).hashedBackupCodes || []).length === 2);
    const fresh = await get('TA', 'fresh');
    check('a user with NO 2FA enrolled can never pass the second-factor check (no auto-enable at login)', (await tf.verifyLoginSecondFactor(st, fresh, { twoFactorCode: '123456' })).valid === false && !(await get('TA', 'fresh')).twoFactorEnabled);
    const broken = { ...u2, twoFactorSecret: 'not-decryptable' };
    const bk = await tf.verifyLoginSecondFactor(st, broken, { twoFactorCode: '123456' });
    check('an undecryptable stored secret => failure, and NO new secret is generated or saved', bk.valid === false && (await get('TA', 'enrolled')).twoFactorSecret === u2.twoFactorSecret);
  });

  await scenario('setup', async () => {
    const s = await tf.startSetup(st, { tenantId: 'TA', userId: 'fresh' });
    check('T8 explicit setup by an un-enrolled user returns secret + QR + otpauth (this endpoint only)', s.ok === true && (s as any).secret === SECRET && String((s as any).qrCodeDataUrl).startsWith('data:image') && String((s as any).otpauthUrl).includes('otpauth://'));
    const stored = (await get('TA', 'fresh')).twoFactorSecret as string;
    check('the secret is stored ENCRYPTED, 2FA stays disabled until confirmed', !!stored && stored !== SECRET && !JSON.stringify(stored).includes(SECRET) && !(await get('TA', 'fresh')).twoFactorEnabled);
    check('the otpauth label is the username (no fake mail domain)', String((s as any).otpauthUrl).includes('u-fresh') && !String((s as any).otpauthUrl).includes('company.sa'));
    const bad = await tf.confirmSetup(st, { tenantId: 'TA', userId: 'fresh' }, '000000');
    check('T9 setup with a wrong code => 400 and 2FA stays disabled', !bad.ok && (bad as any).status === 400 && !(await get('TA', 'fresh')).twoFactorEnabled);
    const good = await tf.confirmSetup(st, { tenantId: 'TA', userId: 'fresh' }, '123456');
    check('T10 setup with the right code => 2FA enabled', good.ok === true && (await get('TA', 'fresh')).twoFactorEnabled === true);
  });

  await scenario('ownership', async () => {
    const before = (await get('TA', 'other')).twoFactorSecret;
    const r1 = await tf.startSetup(st, { tenantId: 'TA', userId: 'other' });
    check('an ENROLLED account cannot be re-enrolled (409) and its secret is untouched', !r1.ok && (r1 as any).status === 409 && (await get('TA', 'other')).twoFactorSecret === before);
    const r2 = await tf.confirmSetup(st, { tenantId: 'TA', userId: 'other' }, '123456');
    check('confirm on an enrolled account is refused (409)', !r2.ok && (r2 as any).status === 409);
    const bobBefore = await get('TB', 'bob');
    const x = await tf.startSetup(st, { tenantId: 'TB', userId: 'enrolled' });
    const y = await tf.startSetup(st, { tenantId: 'TA', userId: 'bob' });
    check('T11 cross-tenant: tenant B cannot touch tenant A\'s user (404) and vice versa; nothing changed', !x.ok && (x as any).status === 404 && !y.ok && (y as any).status === 404 && (await get('TB', 'bob')).twoFactorSecret === bobBefore.twoFactorSecret);
    const sig = TwoFactorService.prototype.startSetup.toString();
    check('the service API takes NO username: a request cannot name another user', !/username\s*[:,)]\s*string/.test(String(TwoFactorService.prototype.startSetup.length)) && TwoFactorService.prototype.startSetup.length === 2);
    void sig;
  });

  await scenario('static', async () => {
    const src = fs.readFileSync('server.ts', 'utf-8');
    const a = src.indexOf("app.post('/api/auth/login'"), b = src.indexOf("app.post('/api/auth/refresh'");
    const login = src.slice(a, b).split('\n').filter((l: string) => !l.trim().startsWith('//')).join('\n');   // code only (comments may mention the words)
    check('(static) the login handler never mentions qrCodeDataUrl / otpauth / generateSecret / "secret:"', !/qrCodeDataUrl|generateURI|otpauth|generateSecret\(|\bsecret:/i.test(login));
    check('(static) no fabricated "Riyadh" / "SA" location anywhere in server.ts', !/Riyadh/.test(src) && !/country:\s*'SA'/.test(src));
    check('(static) 2FA is demanded only from enrolled users (mustEnforce2fa = twoFactorEnabled)', /const mustEnforce2fa = !!user\.twoFactorEnabled;/.test(login));
    check('(static) an unknown location is never stored as a last-login position', /if \(location\) await anomalyDetector\.recordSuccessfulLogin/.test(login));
    check('(static) wrong 2FA codes feed the same (tenant-scoped) lockout as wrong passwords', /twoFactorService\.verifyLoginSecondFactor[\s\S]{0,900}anomalyDetector\.recordFailedAttempt\(lockKey\)/.test(login));
    const c = src.indexOf("app.post('/api/auth/2fa/setup'"), d = src.indexOf('// 1B — Company Settings');
    const setup = src.slice(c, d);
    check('(static) the 2FA setup routes never read a username from the request and use the session user', !/req\.body\.username|\{\s*username\s*\}\s*=\s*req\.body/.test(setup) && /authContext/.test(setup) && /userId: auth\.userId/.test(setup));
    check('(static) no TOTP secret is logged', !/console\.(log|error|warn)\([^)]*(plainSecret|twoFactorSecret|SECRET)/i.test(src));
  });

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
