import os

os.makedirs('.phase_tmp', exist_ok=True)

sums_content = """907e3caed5c32d4d892c1db8d05dcb29c793b139c815b66cb051f7d856ddaf2a  .phase_tmp/ORDER.txt
7196227811e434baa45d5dcc66325f1cd4b0e700168dec7b620c3a4272542f32  .phase_tmp/JOIN.txt
08b3e1ff144de8c8af8bd92c6f1e390b2ded72a852ba7520a405074f7a9cdc27  .phase_tmp/FINAL.txt
4a78a7ea93e85e6d9560f3407f85a936363e3d27e546e14d4f2f11cf001dd407  .phase_tmp/sec1_server.ts__1.patch
2bfcef466672044e18c36d6dafd6ae094be096fa73d20ca5135c50d78bb1e8d0  .phase_tmp/sec1_server.ts__2.patch
a7cdc4e2d05678d3618402c6b063356dad3e45dfc16534c8075d00ccafbb5ef7  .phase_tmp/sec1_new1_01.part
02b68e0d84f89667df74ce54279326e78bedabf0156fd69a05ba5f8e945ed206  .phase_tmp/sec1_new2_01.part
0fecad1bd93f472d29ac811034a50c9bca356d7a7b315a3fbd4f7ecf9dba1779  .phase_tmp/sec1_new3_01.part
290dc5e0bef9a479f7f086dbe1f679caec5f80b8b6b9996d9bd9bc1a083b0949  .phase_tmp/sec1_new3_02.part
82bce0bb3a83dff1ce71d0b2fbe95e19d1c93671660e555c91c28ca67f65b1ec  .phase_tmp/sec1_new4_01.part
"""

order_content = """sec1_server.ts__1.patch
sec1_server.ts__2.patch
"""

join_content = """evidence/security/acceptance-rows-sec1.md|sec1_new1
evidence/security/usability-sec1.md|sec1_new2
scripts/verifySec1TwoFactor.ts|sec1_new3
src/core/auth/TwoFactorService.ts|sec1_new4
"""

final_content = """a7cdc4e2d05678d3618402c6b063356dad3e45dfc16534c8075d00ccafbb5ef7  evidence/security/acceptance-rows-sec1.md
02b68e0d84f89667df74ce54279326e78bedabf0156fd69a05ba5f8e945ed206  evidence/security/usability-sec1.md
237e96c4c6668044d4bce2e2322861e00a0465a3e80c5af33abb7d68f075ba09  scripts/verifySec1TwoFactor.ts
be40b092a9ca1b394f5d419d55d56fc6e50a1be3069d3d835d360e015dbb8d7a  server.ts
82bce0bb3a83dff1ce71d0b2fbe95e19d1c93671660e555c91c28ca67f65b1ec  src/core/auth/TwoFactorService.ts
"""

p1 = """--- a/server.ts
+++ b/server.ts
@@ -20,6 +20,7 @@
 import argon2 from 'argon2';
 import { generateSecret, verify, generateURI } from 'otplib';
 import QRCode from 'qrcode';
+import { TwoFactorService } from './src/core/auth/TwoFactorService';
 import { createServer as createViteServer } from 'vite';
 import { Phase0TestRunner } from './src/core/tests/Phase0TestRunner';
 import { executePrimaryBattery } from './src/core/tests/runPrimaryBattery';
@@ -798,6 +799,9 @@
 
   // 1A & 1D & 1I & 1J & 1K — Enterprise Authentication (Login)
   // 4.6C & 4.6F: Pre-auth tenant resolution and scoped credential lookup
+  // SEC-1: the single owner of TOTP secrets / backup codes (the TOTP library and QR renderer are injected)
+  const twoFactorService = new TwoFactorService({ generateSecret, generateURI, verify: (o) => verify(o) as any, qrDataUrl: (u: string) => QRCode.toDataURL(u) });
+
   app.post('/api/auth/login', authRateLimiter, async (req: Request, res: Response) => {
     // 4.6C & 4.6F: Resolve target tenant before accessing storage or credentials
     const tenantResolution = await TenantResolutionService.resolveTenantFromRequest(masterStorage, req);
@@ -904,16 +908,13 @@
       return res.status(401).json(problem);
     }
 
-    // 1J: Deterministic Impossible Travel Geo-Velocity Check
-    const location: GeoLocation = clientGeo || {
-      city: 'Riyadh',
-      country: 'SA',
-      lat: 24.7136,
-      lon: 46.6753,
-    };
-
-    const travelCheck = await anomalyDetector.checkImpossibleTravel(user.id, location);
-    const mustEnforce2fa = user.twoFactorEnabled || travelCheck.isAnomaly;
+    // 1J: Impossible-travel check. SEC-1: only with a REAL location; an omitted clientGeo is "unknown", never a made-up city
+    const location: GeoLocation | null = clientGeo || null;
+    const travelCheck: Awaited<ReturnType<typeof anomalyDetector.checkImpossibleTravel>> = location
+      ? await anomalyDetector.checkImpossibleTravel(user.id, location)
+      : { isAnomaly: false, message: 'الموقع الجغرافي غير متوفر؛ لم يُجرَ فحص الانتقال المستحيل.' };
+    // SEC-1: a second factor is demanded only from users who actually HAVE one (an anomaly raises an alert; it cannot create a factor)
+    const mustEnforce2fa = !!user.twoFactorEnabled;
 
     if (travelCheck.isAnomaly) {
       DomainEventBus.publish({
@@ -943,85 +944,28 @@
     // 1D: Verify 2FA via real TOTP (otplib) or Emergency Backup Code, with zero lockout mechanism
     if (mustEnforce2fa) {
       if (!twoFactorCode && !backupCode) {
-        let plainSecret = '';
-        if (user.twoFactorSecret) {
-          try {
-            const dec = EncryptionService.decryptPII<string>(user.twoFactorSecret);
-            if (typeof dec === 'string' && dec.length > 0) {
-              plainSecret = dec;
-            }
-          } catch (e) {
-            console.error(JSON.stringify({ level: 'CRITICAL', op: 'two_factor_secret_decrypt', trace: crypto.randomUUID(), err: String(e) }));
-          }
-        }
-        if (!plainSecret || typeof plainSecret !== 'string') {
-          plainSecret = generateSecret();
-          const encryptedSecret = EncryptionService.encryptPII(plainSecret);
-          await targetStorage.updateUser(user.id, { twoFactorSecret: encryptedSecret });
-        }
-
-        const otpauthUrl = generateURI({
-          label: `${username}@company.sa`,
-          issuer: 'A.N ERP',
-          secret: plainSecret,
-        });
-        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
-
-        return res.status(200).json({
-          requires2FA: true,
-          setupRequired: !user.twoFactorEnabled,
-          secret: plainSecret,
-          qrCodeDataUrl,
-          anomalyDetected: travelCheck.isAnomaly,
-          securityNote: travelCheck.message || (!user.twoFactorEnabled ? 'يرجى مسح رمز الاستجابة السريعة أو إدخال المفتاح لتأكيد التحقق بخطوتين' : 'يلزم التحقق الثنائي لإتمام الدخول'),
-        });
+        // SEC-1: an enrolled user gets a plain challenge. NEVER a secret, QR code or otpauth URI; nothing is generated or saved here.
+        return res.status(200).json(TwoFactorService.loginChallenge(travelCheck.isAnomaly, travelCheck.message));
       }
 
-      let twoFactorValid = false;
-      if (twoFactorCode) {
-        if (user.twoFactorSecret) {
-          let plainSecret = '';
-          try {
-            const dec = EncryptionService.decryptPII<string>(user.twoFactorSecret);
-            if (typeof dec === 'string' && dec.length > 0) {
-              plainSecret = dec;
-            }
-          } catch (e) {
-            console.error(JSON.stringify({ level: 'CRITICAL', op: 'two_factor_verify_decrypt', trace: crypto.randomUUID(), err: String(e) }));
-          }
-          if (plainSecret) {
-            const verifyResult = await verify({ token: twoFactorCode, secret: plainSecret });
-            twoFactorValid = !!verifyResult.valid;
-            if (twoFactorValid && !user.twoFactorEnabled) {
-              await targetStorage.updateUser(user.id, { twoFactorEnabled: true });
-            }
-          }
-        }
-      } else if (backupCode) {
-        // Verify and consume 1 of 8 one-time emergency backup codes
-        const userCodes = user.backupCodes || user.hashedBackupCodes || [];
-        const consumeRes = EncryptionService.verifyAndConsumeBackupCode(
-          backupCode,
-          userCodes
-        );
-        if (consumeRes.valid) {
-          twoFactorValid = true;
-          await targetStorage.updateUser(user.id, {
-            backupCodes: consumeRes.remainingHashedCodes,
-            hashedBackupCodes: consumeRes.remainingHashedCodes,
-          });
-          await recordAudit(
-            user.id,
-            user.fullName,
-            'EMERGENCY_BACKUP_CODE_CONSUMED',
-            'AUTH',
-            user.id,
-            { remainingCodes: consumeRes.remainingHashedCodes.length },
-            req.ip || '127.0.0.1',
-            user.tenantId,
-            targetStorage
-          );
-        }
-      }
+      const second = await twoFactorService.verifyLoginSecondFactor(targetStorage, user, { twoFactorCode, backupCode });
+      if (second.usedBackupCode) {
+        await recordAudit(
+          user.id,
+          user.fullName,
+          'EMERGENCY_BACKUP_CODE_CONSUMED',
+          'AUTH',
+          user.id,
+          { remainingCodes: second.remainingBackupCodes },
+          req.ip || '127.0.0.1',
+          user.tenantId,
+          targetStorage
+        );
+      }
+      const twoFactorValid = second.valid;
+      if (!twoFactorValid) {
+        // SEC-1: wrong codes feed the SAME progressive lockout as wrong passwords (no brute-force path through the 2FA branch)
+        await anomalyDetector.recordFailedAttempt(username);
       }
 
       if (!twoFactorValid) {
@@ -1084,7 +1028,7 @@
       role: user.role,
       deviceType: req.headers['user-agent']?.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser',
       ipAddress: req.ip || '127.0.0.1',
-      location,
+      location: location || { city: 'غير معروف', country: '', lat: 0, lon: 0 },
       familyId,
       createdAt: Date.now(),
       lastActiveAt: Date.now(),
@@ -1092,7 +1036,7 @@
 
     await targetStorage.saveActiveSession(sessionRecord);
     await anomalyDetector.registerActiveSession(sessionRecord);
-    await anomalyDetector.recordSuccessfulLogin(user.id, location, req.ip || '127.0.0.1', userTenantId);
+    if (location) await anomalyDetector.recordSuccessfulLogin(user.id, location, req.ip || '127.0.0.1', userTenantId);   // SEC-1: an unknown location is never stored as a position
 
     // 1A: Set HttpOnly, Secure, SameSite Cookies — Zero tokens in localStorage!
     const isProd = process.env.NODE_ENV === 'production';
"""

p2 = """--- a/server.ts
+++ b/server.ts
@@ -1245,7 +1245,7 @@
         sessionId: auth.sessionId,
         deviceType: session?.deviceType || 'Desktop Browser',
         ipAddress: session?.ipAddress || req.ip,
-        location: session?.location || { city: 'Riyadh', country: 'SA' },
+        location: session?.location || { city: 'غير معروف', country: '' },
         createdAt: session?.createdAt,
       },
       tenant,
@@ -1254,54 +1254,26 @@
   });
 
   // Section B.2: 2FA Setup with Real TOTP & QR Code (otplib + qrcode) via StoragePort
+  // SEC-1: enrollment works ONLY on the caller's own account (the user id comes from the session; a username in the body is ignored)
   app.post('/api/auth/2fa/setup', requireAuth, async (req: Request, res: Response) => {
-    const tenantId = (req as any).authContext.tenantId;
+    const auth = (req as any).authContext;
     const storage = getRequestStorage(req, res);
     if (!storage) return;
-    const { username } = req.body;
-    const userRes = await storage.getUserByUsername(tenantId, username);
-    if (!userRes.success || !userRes.data) {
-      return res.status(404).json({ error: 'المستخدم غير موجود' });
-    }
-    const user = userRes.data;
-
-    const plainSecret = generateSecret();
-    const encryptedSecret = EncryptionService.encryptPII(plainSecret);
-    await storage.updateUser(user.id, { twoFactorSecret: encryptedSecret });
-
-    const otpauthUrl = generateURI({
-      label: `${username}@company.sa`,
-      issuer: 'A.N ERP',
-      secret: plainSecret,
-    });
-
-    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
-    return res.json({
-      success: true,
-      secret: plainSecret,
-      qrCodeDataUrl,
-      otpauthUrl,
-    });
+    const r = await twoFactorService.startSetup(storage, { tenantId: auth.tenantId, userId: auth.userId });
+    if (!r.ok) return res.status(r.status).json({ type: r.type, title: r.title, status: r.status, detail: r.detail });
+    res.setHeader('Cache-Control', 'no-store');
+    return res.json({ success: true, secret: r.secret, qrCodeDataUrl: r.qrCodeDataUrl, otpauthUrl: r.otpauthUrl });
   });
 
   app.post('/api/auth/2fa/verify-setup', requireAuth, async (req: Request, res: Response) => {
-    const tenantId = (req as any).authContext.tenantId;
+    const auth = (req as any).authContext;
     const storage = getRequestStorage(req, res);
     if (!storage) return;
-    const { username, token } = req.body;
-    const userRes = await storage.getUserByUsername(tenantId, username);
-    if (!userRes.success || !userRes.data || !userRes.data.twoFactorSecret) {
-      return res.status(400).json({ error: 'لم يتم تهيئة 2FA لهذا الحساب' });
-    }
-    const user = userRes.data;
-
-    const plainSecret = EncryptionService.decryptPII<string>(user.twoFactorSecret);
-    const verifyResult = await verify({ token, secret: plainSecret });
-    if (!verifyResult.valid) {
-      return res.status(400).json({ success: false, error: 'رمز TOTP غير صحيح أو منتهي الصلاحية' });
+    const r = await twoFactorService.confirmSetup(storage, { tenantId: auth.tenantId, userId: auth.userId }, String((req.body || {}).token || ''));
+    if (!r.ok) {
+      if (r.code === 'invalid-2fa' && (r as any).username) await new AnomalyDetector(storage).recordFailedAttempt((r as any).username);
+      return res.status(r.status).json({ type: r.type, title: r.title, status: r.status, detail: r.detail });
     }
-
-    await storage.updateUser(user.id, { twoFactorEnabled: true });
     return res.json({ success: true, message: 'تم تفعيل التحقق بخطوتين بنجاح' });
   });
 
"""

new1 = """# SEC-1 — acceptance rows (2FA secret disclosure / setup ownership / fabricated location)

Adapter: InMemory only (no database). The HTTP server is NOT started by the test; route behaviour is covered by static checks on `server.ts`.

| # | Requirement | Evidence | Status |
|---|---|---|---|
| T1 | Enrolled user, no code: challenge only, no secret / QR / token | `verifySec1TwoFactor.ts` T1/T7 | covered (service) |
| T2 | Correct TOTP authenticates | T2 (fake TOTP, not otplib) | covered (service) |
| T3 | Wrong TOTP fails | T3 | covered (service) |
| T4/T5 | Backup code works once, replay fails | T4, T5 | covered (service) |
| T6 | Repeated logins never create / change a secret | T6 | covered (service) |
| T8–T10 | Secret/QR only from explicit setup; wrong code keeps 2FA off; right code enables | T8, T9, T10 | covered (service) |
| T11 | Cross-tenant 2FA isolation | T11 | covered (InMemory tenant scoping) |
| T12 | Impossible travel + enrolled user: challenge only | T12 | covered (service) |
| — | Setup routes act only on the caller (no username from the body) | static checks + service API | covered (static) |
| — | Wrong 2FA codes count toward the progressive lockout | static check on `login` | covered (static, not executed) |
| — | No fabricated "Riyadh" location; unknown location never stored | static checks | covered (static) |

Not proven here (needs a running server / real PostgreSQL): a live HTTP login with a real otplib code; the lockout counter incrementing end to end; behaviour of `LoginScreen` for an enrolled user.

Behaviour changes: users without 2FA are no longer challenged on impossible travel (an alert and audit event are still raised); there is no UI yet to enrol in 2FA (the authenticated API `/api/auth/2fa/setup` + `/verify-setup` works on the caller's own account).
"""

new2 = """# SEC-1 — usability

No screen is added or changed in this package. `LoginScreen` already shows a code input when the server answers `requires2FA` without a QR code (enrolled users); it no longer receives a secret or QR from the login endpoint. No usability measurement was taken.
"""

new3_1 = '''/**
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
'''

new3_2 = '''    const r2 = await tf.confirmSetup(st, { tenantId: 'TA', userId: 'other' }, '123456');
    check('confirm on an enrolled account is refused (409)', !r2.ok && (r2 as any).status === 409);
    const bobBefore = await get('TB', 'bob');
    const x = await tf.startSetup(st, { tenantId: 'TB', userId: 'enrolled' });
    const y = await tf.startSetup(st, { tenantId: 'TA', userId: 'bob' });
    check('T11 cross-tenant: tenant B cannot touch tenant A\\'s user (404) and vice versa; nothing changed', !x.ok && (x as any).status === 404 && !y.ok && (y as any).status === 404 && (await get('TB', 'bob')).twoFactorSecret === bobBefore.twoFactorSecret);
    const sig = TwoFactorService.prototype.startSetup.toString();
    check('the service API takes NO username: a request cannot name another user', !/username\\s*[:,)]\\s*string/.test(String(TwoFactorService.prototype.startSetup.length)) && TwoFactorService.prototype.startSetup.length === 2);
    void sig;
  });

  await scenario('static', async () => {
    const src = fs.readFileSync('server.ts', 'utf-8');
    const a = src.indexOf("app.post('/api/auth/login'"), b = src.indexOf("app.post('/api/auth/refresh'");
    const login = src.slice(a, b).split('\\n').filter((l: string) => !l.trim().startsWith('//')).join('\\n');   // code only (comments may mention the words)
    check('(static) the login handler never mentions qrCodeDataUrl / otpauth / generateSecret / "secret:"', !/qrCodeDataUrl|generateURI|otpauth|generateSecret\\(|\\bsecret:/i.test(login));
    check('(static) no fabricated "Riyadh" / "SA" location anywhere in server.ts', !/Riyadh/.test(src) && !/country:\\s*'SA'/.test(src));
    check('(static) 2FA is demanded only from enrolled users (mustEnforce2fa = twoFactorEnabled)', /const mustEnforce2fa = !!user\\.twoFactorEnabled;/.test(login));
    check('(static) an unknown location is never stored as a last-login position', /if \\(location\\) await anomalyDetector\\.recordSuccessfulLogin/.test(login));
    check('(static) wrong 2FA codes feed the same lockout as wrong passwords', /twoFactorService\\.verifyLoginSecondFactor[\\s\\S]{0,900}anomalyDetector\\.recordFailedAttempt\\(username\\)/.test(login));
    const c = src.indexOf("app.post('/api/auth/2fa/setup'"), d = src.indexOf('// 1B — Company Settings');
    const setup = src.slice(c, d);
    check('(static) the 2FA setup routes never read a username from the request and use the session user', !/req\\.body\\.username|\\{\\s*username\\s*\\}\\s*=\\s*req\\.body/.test(setup) && /authContext/.test(setup) && /userId: auth\\.userId/.test(setup));
    check('(static) no TOTP secret is logged', !/console\\.(log|error|warn)\\([^)]*(plainSecret|twoFactorSecret|SECRET)/i.test(src));
  });

  console.log(`\\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
'''

new4 = '''/**
 * @file TwoFactorService.ts
 * @description SEC-1: the ONLY place that creates, reads or checks TOTP secrets and backup codes.
 *  - an ENROLLED user's login challenge is a plain "code required" answer: never a secret, QR or otpauth URI, and nothing is generated or saved;
 *  - enrollment (start / confirm) works strictly on the CALLER'S OWN account (the user id comes from the session, never from the request body);
 *  - an already-enrolled account cannot be re-enrolled through this service (409), so nobody can replace a live secret;
 *  - the secret stays encrypted at rest (EncryptionService) and is returned in plain text only by startSetup, once, to its owner.
 * The TOTP library and the QR renderer are injected, so the rules are testable without the real libraries.
 */
import type { StoragePort, User } from '../storage/StoragePort';
import { EncryptionService } from '../crypto/EncryptionService';

export interface TotpDeps {
  generateSecret(): string;
  generateURI(o: { label: string; issuer: string; secret: string }): string;
  verify(o: { token: string; secret: string }): Promise<{ valid: boolean }> | { valid: boolean };
  qrDataUrl(uri: string): Promise<string>;
}

export type TfFail = { ok: false; status: number; type: string; title: string; detail: string; code: string };
const fail = (status: number, code: string, title: string, detail: string): TfFail => ({ ok: false, status, code, type: `https://api.an-erp.local/errors/${code}`, title, detail });

export class TwoFactorService {
  constructor(private deps: TotpDeps) {}

  /** The ONLY body /api/auth/login may return when an enrolled user has not supplied a code. */
  static loginChallenge(anomalyDetected: boolean, anomalyMessage?: string) {
    return {
      requires2FA: true as const,
      setupRequired: false as const,
      anomalyDetected,
      securityNote: anomalyMessage || 'يلزم إدخال رمز التحقق الثنائي لإكمال تسجيل الدخول.',
    };
  }

  private decrypt(user: User): string | null {
    if (!user.twoFactorSecret) return null;
    try {
      const dec = EncryptionService.decryptPII<string>(user.twoFactorSecret);
      return typeof dec === 'string' && dec.length > 0 ? dec : null;
    } catch {
      return null;   // never log the secret or the error payload; never regenerate here
    }
  }

  /** Second factor at login. A TOTP code is accepted only from an ENROLLED user; a failed decrypt is a failure (never a new secret). */
  async verifyLoginSecondFactor(
    storage: StoragePort,
    user: User,
    input: { twoFactorCode?: string; backupCode?: string }
  ): Promise<{ valid: boolean; usedBackupCode: boolean; remainingBackupCodes?: number }> {
    if (!user.twoFactorEnabled) return { valid: false, usedBackupCode: false };
    if (input.twoFactorCode) {
      const secret = this.decrypt(user);
      if (!secret) return { valid: false, usedBackupCode: false };
      const r = await this.deps.verify({ token: String(input.twoFactorCode), secret });
      return { valid: !!r.valid, usedBackupCode: false };
    }
    if (input.backupCode) {
      const codes = user.backupCodes || user.hashedBackupCodes || [];
      const c = EncryptionService.verifyAndConsumeBackupCode(String(input.backupCode), codes);
      if (!c.valid) return { valid: false, usedBackupCode: false };
      await storage.updateUser(user.id, { backupCodes: c.remainingHashedCodes, hashedBackupCodes: c.remainingHashedCodes });
      return { valid: true, usedBackupCode: true, remainingBackupCodes: c.remainingHashedCodes.length };
    }
    return { valid: false, usedBackupCode: false };
  }

  private async owner(storage: StoragePort, actor: { tenantId: string; userId: string }): Promise<{ ok: true; user: User } | TfFail> {
    const r = await storage.getUser(actor.tenantId, actor.userId);   // tenant-scoped lookup of the CALLER
    if (!r.success || !r.data || r.data.tenantId !== actor.tenantId || r.data.id !== actor.userId) {
      return fail(404, 'user-not-found', 'المستخدم غير موجود', 'تعذّر العثور على حسابك.');
    }
    return { ok: true, user: r.data };
  }

  /** Explicit enrollment start: generates a secret for the CALLER only, stores it encrypted (2FA stays disabled until confirmed). */
  async startSetup(storage: StoragePort, actor: { tenantId: string; userId: string }) {
    const o = await this.owner(storage, actor);
    if (!o.ok) return o;
    if (o.user.twoFactorEnabled) return fail(409, 'two-factor-already-enrolled', 'التحقق الثنائي مفعّل بالفعل', 'لا يمكن إعادة التهيئة لحساب مفعّل؛ اطلب إعادة تعيين من مسؤول النظام.');
    const secret = this.deps.generateSecret();
    await storage.updateUser(o.user.id, { twoFactorSecret: EncryptionService.encryptPII(secret) });
    const otpauthUrl = this.deps.generateURI({ label: o.user.username, issuer: 'A.N ERP', secret });
    return { ok: true as const, secret, otpauthUrl, qrCodeDataUrl: await this.deps.qrDataUrl(otpauthUrl), username: o.user.username };
  }

  /** Confirms enrollment with a valid code; a wrong code leaves 2FA disabled. */
  async confirmSetup(storage: StoragePort, actor: { tenantId: string; userId: string }, token: string) {
    const o = await this.owner(storage, actor);
    if (!o.ok) return o;
    if (o.user.twoFactorEnabled) return fail(409, 'two-factor-already-enrolled', 'التحقق الثنائي مفعّل بالفعل', 'الحساب مفعّل مسبقًا.');
    const secret = this.decrypt(o.user);
    if (!secret) return fail(400, 'two-factor-not-initialised', 'لم تُبدأ التهيئة', 'ابدأ التهيئة أولًا.');
    const r = await this.deps.verify({ token: String(token || ''), secret });
    if (!r.valid) return { ...fail(400, 'invalid-2fa', 'رمز التحقق غير صحيح', 'رمز TOTP غير صحيح أو منتهي الصلاحية.'), username: o.user.username };
    await storage.updateUser(o.user.id, { twoFactorEnabled: true });
    return { ok: true as const, username: o.user.username };
  }
}
'''

files = {
    '.phase_tmp/SUMS.txt': sums_content,
    '.phase_tmp/ORDER.txt': order_content,
    '.phase_tmp/JOIN.txt': join_content,
    '.phase_tmp/FINAL.txt': final_content,
    '.phase_tmp/sec1_server.ts__1.patch': p1,
    '.phase_tmp/sec1_server.ts__2.patch': p2,
    '.phase_tmp/sec1_new1_01.part': new1,
    '.phase_tmp/sec1_new2_01.part': new2,
    '.phase_tmp/sec1_new3_01.part': new3_1,
    '.phase_tmp/sec1_new3_02.part': new3_2,
    '.phase_tmp/sec1_new4_01.part': new4,
}

for path, content in files.items():
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print('All 11 files written successfully')
