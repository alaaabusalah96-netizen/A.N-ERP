import hashlib

target = 'be40b092a9ca1b394f5d419d55d56fc6e50a1be3069d3d835d360e015dbb8d7a'

with open('server.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. import
text = text.replace(
    "import QRCode from 'qrcode';",
    "import QRCode from 'qrcode';\nimport { TwoFactorService } from './src/core/auth/TwoFactorService';"
)

# 2. twoFactorService initialization
text = text.replace(
    "  // 1A & 1D & 1I & 1J & 1K — Enterprise Authentication (Login)\n  // 4.6C & 4.6F: Pre-auth tenant resolution and scoped credential lookup\n  app.post('/api/auth/login'",
    "  // 1A & 1D & 1I & 1J & 1K — Enterprise Authentication (Login)\n  // 4.6C & 4.6F: Pre-auth tenant resolution and scoped credential lookup\n  // SEC-1: the single owner of TOTP secrets / backup codes (the TOTP library and QR renderer are injected)\n  const twoFactorService = new TwoFactorService({ generateSecret, generateURI, verify: (o) => verify(o) as any, qrDataUrl: (u: string) => QRCode.toDataURL(u) });\n\n  app.post('/api/auth/login'"
)

# 3. travel check block
old_travel = """    // 1J: Deterministic Impossible Travel Geo-Velocity Check
    const location: GeoLocation = clientGeo || {
      city: 'Riyadh',
      country: 'SA',
      lat: 24.7136,
      lon: 46.6753,
    };

    const travelCheck = await anomalyDetector.checkImpossibleTravel(user.id, location);
    const mustEnforce2fa = user.twoFactorEnabled || travelCheck.isAnomaly;"""

new_travel = """    // 1J: Impossible-travel check. SEC-1: only with a REAL location; an omitted clientGeo is "unknown", never a made-up city
    const location: GeoLocation | null = clientGeo || null;
    const travelCheck: Awaited<ReturnType<typeof anomalyDetector.checkImpossibleTravel>> = location
      ? await anomalyDetector.checkImpossibleTravel(user.id, location)
      : { isAnomaly: false, message: 'الموقع الجغرافي غير متوفر؛ لم يُجرَ فحص الانتقال المستحيل.' };
    // SEC-1: a second factor is demanded only from users who actually HAVE one (an anomaly raises an alert; it cannot create a factor)
    const mustEnforce2fa = !!user.twoFactorEnabled;"""

text = text.replace(old_travel, new_travel)

# 4. 2FA block in login
old_2fa = """      if (!twoFactorCode && !backupCode) {
        let plainSecret = '';
        if (user.twoFactorSecret) {
          try {
            const dec = EncryptionService.decryptPII<string>(user.twoFactorSecret);
            if (typeof dec === 'string' && dec.length > 0) {
              plainSecret = dec;
            }
          } catch (e) {
            console.error(JSON.stringify({ level: 'CRITICAL', op: 'two_factor_secret_decrypt', trace: crypto.randomUUID(), err: String(e) }));
          }
        }
        if (!plainSecret || typeof plainSecret !== 'string') {
          plainSecret = generateSecret();
          const encryptedSecret = EncryptionService.encryptPII(plainSecret);
          await targetStorage.updateUser(user.id, { twoFactorSecret: encryptedSecret });
        }

        const otpauthUrl = generateURI({
          label: `${username}@company.sa`,
          issuer: 'A.N ERP',
          secret: plainSecret,
        });
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

        return res.status(200).json({
          requires2FA: true,
          setupRequired: !user.twoFactorEnabled,
          secret: plainSecret,
          qrCodeDataUrl,
          anomalyDetected: travelCheck.isAnomaly,
          securityNote: travelCheck.message || (!user.twoFactorEnabled ? 'يرجى مسح رمز الاستجابة السريعة أو إدخال المفتاح لتأكيد التحقق بخطوتين' : 'يلزم التحقق الثنائي لإتمام الدخول'),
        });
      }

      let twoFactorValid = false;
      if (twoFactorCode) {
        if (user.twoFactorSecret) {
          let plainSecret = '';
          try {
            const dec = EncryptionService.decryptPII<string>(user.twoFactorSecret);
            if (typeof dec === 'string' && dec.length > 0) {
              plainSecret = dec;
            }
          } catch (e) {
            console.error(JSON.stringify({ level: 'CRITICAL', op: 'two_factor_verify_decrypt', trace: crypto.randomUUID(), err: String(e) }));
          }
          if (plainSecret) {
            const verifyResult = await verify({ token: twoFactorCode, secret: plainSecret });
            twoFactorValid = !!verifyResult.valid;
            if (twoFactorValid && !user.twoFactorEnabled) {
              await targetStorage.updateUser(user.id, { twoFactorEnabled: true });
            }
          }
        }
      } else if (backupCode) {
        // Verify and consume 1 of 8 one-time emergency backup codes
        const userCodes = user.backupCodes || user.hashedBackupCodes || [];
        const consumeRes = EncryptionService.verifyAndConsumeBackupCode(
          backupCode,
          userCodes
        );
        if (consumeRes.valid) {
          twoFactorValid = true;
          await targetStorage.updateUser(user.id, {
            backupCodes: consumeRes.remainingHashedCodes,
            hashedBackupCodes: consumeRes.remainingHashedCodes,
          });
          await recordAudit(
            user.id,
            user.fullName,
            'EMERGENCY_BACKUP_CODE_CONSUMED',
            'AUTH',
            user.id,
            { remainingCodes: consumeRes.remainingHashedCodes.length },
            req.ip || '127.0.0.1',
            user.tenantId,
            targetStorage
          );
        }
      }"""

new_2fa = """      if (!twoFactorCode && !backupCode) {
        // SEC-1: an enrolled user gets a plain challenge. NEVER a secret, QR code or otpauth URI; nothing is generated or saved here.
        return res.status(200).json(TwoFactorService.loginChallenge(travelCheck.isAnomaly, travelCheck.message));
      }

      const second = await twoFactorService.verifyLoginSecondFactor(targetStorage, user, { twoFactorCode, backupCode });
      if (second.usedBackupCode) {
        await recordAudit(
          user.id,
          user.fullName,
          'EMERGENCY_BACKUP_CODE_CONSUMED',
          'AUTH',
          user.id,
          { remainingCodes: second.remainingBackupCodes },
          req.ip || '127.0.0.1',
          user.tenantId,
          targetStorage
        );
      }
      const twoFactorValid = second.valid;
      if (!twoFactorValid) {
        // SEC-1: wrong codes feed the SAME progressive lockout as wrong passwords (no brute-force path through the 2FA branch)
        await anomalyDetector.recordFailedAttempt(username);
      }"""

text = text.replace(old_2fa, new_2fa)

# 5. session location
text = text.replace(
    "      location,\n      familyId,",
    "      location: location || { city: 'غير معروف', country: '', lat: 0, lon: 0 },\n      familyId,"
)
text = text.replace(
    "    await anomalyDetector.recordSuccessfulLogin(user.id, location, req.ip || '127.0.0.1', userTenantId);",
    "    if (location) await anomalyDetector.recordSuccessfulLogin(user.id, location, req.ip || '127.0.0.1', userTenantId);   // SEC-1: an unknown location is never stored as a position"
)

# 6. /api/me location
text = text.replace(
    "        location: session?.location || { city: 'Riyadh', country: 'SA' },",
    "        location: session?.location || { city: 'غير معروف', country: '' },"
)

# 7. setup and verify-setup routes
old_setup = """  app.post('/api/auth/2fa/setup', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const { username } = req.body;
    const userRes = await storage.getUserByUsername(tenantId, username);
    if (!userRes.success || !userRes.data) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    const user = userRes.data;

    const plainSecret = generateSecret();
    const encryptedSecret = EncryptionService.encryptPII(plainSecret);
    await storage.updateUser(user.id, { twoFactorSecret: encryptedSecret });

    const otpauthUrl = generateURI({
      label: `${username}@company.sa`,
      issuer: 'A.N ERP',
      secret: plainSecret,
    });

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return res.json({
      success: true,
      secret: plainSecret,
      qrCodeDataUrl,
      otpauthUrl,
    });
  });

  app.post('/api/auth/2fa/verify-setup', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const { username, token } = req.body;
    const userRes = await storage.getUserByUsername(tenantId, username);
    if (!userRes.success || !userRes.data || !userRes.data.twoFactorSecret) {
      return res.status(400).json({ error: 'لم يتم تهيئة 2FA لهذا الحساب' });
    }
    const user = userRes.data;

    const plainSecret = EncryptionService.decryptPII<string>(user.twoFactorSecret);
    const verifyResult = await verify({ token, secret: plainSecret });
    if (!verifyResult.valid) {
      return res.status(400).json({ success: false, error: 'رمز TOTP غير صحيح أو منتهي الصلاحية' });
    }

    await storage.updateUser(user.id, { twoFactorEnabled: true });
    return res.json({ success: true, message: 'تم تفعيل التحقق بخطوتين بنجاح' });
  });"""

new_setup = """  app.post('/api/auth/2fa/setup', requireAuth, async (req: Request, res: Response) => {
    const auth = (req as any).authContext;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const r = await twoFactorService.startSetup(storage, { tenantId: auth.tenantId, userId: auth.userId });
    if (!r.ok) return res.status(r.status).json({ type: r.type, title: r.title, status: r.status, detail: r.detail });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, secret: r.secret, qrCodeDataUrl: r.qrCodeDataUrl, otpauthUrl: r.otpauthUrl });
  });

  app.post('/api/auth/2fa/verify-setup', requireAuth, async (req: Request, res: Response) => {
    const auth = (req as any).authContext;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const r = await twoFactorService.confirmSetup(storage, { tenantId: auth.tenantId, userId: auth.userId }, String((req.body || {}).token || ''));
    if (!r.ok) {
      if (r.code === 'invalid-2fa' && (r as any).username) await new AnomalyDetector(storage).recordFailedAttempt((r as any).username);
      return res.status(r.status).json({ type: r.type, title: r.title, status: r.status, detail: r.detail });
    }
    return res.json({ success: true, message: 'تم تفعيل التحقق بخطوتين بنجاح' });
  });"""

text = text.replace(old_setup, new_setup)

h = hashlib.sha256(text.encode('utf-8')).hexdigest()
print('Result hash:', h)
print('Target hash:', target)
print('Match:', h == target)
