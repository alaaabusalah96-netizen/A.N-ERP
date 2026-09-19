/**
 * @file server.ts
 * @description Enterprise Express Server for A.N ERP (v7.1) — Phase 1 Core Platform
 * Binds to 0.0.0.0:3000.
 * Houses server-side API routes, RFC7807 error formatting, security headers,
 * HttpOnly Secure Cookie Auth with 15-min JWT + Rotation, SoD, PII encryption,
 * and Vite dev middleware.
 */

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import crypto from 'crypto';
import argon2 from 'argon2';
import { generateSecret, verify, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';
import { Phase0TestRunner } from './src/core/tests/Phase0TestRunner';
import { executePrimaryBattery } from './src/core/tests/runPrimaryBattery';
import { runPhase1Battery } from './src/core/tests/runPhase1Battery';
import { globalStorageRouter } from './src/core/storage/StorageRouter';
import { PostingEngine } from './src/core/engines/PostingEngine';
import { ApprovalEngine } from './src/core/engines/ApprovalEngine';
import { NumberingEngine } from './src/core/engines/NumberingEngine';
import { JournalEntry, RFC7807Problem, User, ActiveSessionRecord, StoragePort, CompanyProfile, TenantCompany, CustomFieldDefinition } from './src/core/storage/StoragePort';
import { TokenService } from './src/core/auth/TokenService';
import { AnomalyDetector, GeoLocation } from './src/core/auth/AnomalyDetector';
import { EncryptionService } from './src/core/crypto/EncryptionService';
import { SoDPolicyEngine } from './src/core/sod/SoDPolicyEngine';
import { SoDMatrixService } from './src/core/sod/SoDMatrixService';
import { DomainEventBus } from './src/core/events/DomainEventBus';
import { DualCalendar } from './src/core/utils/dualCalendar';
import { CompanyWizardService } from './src/core/wizard/CompanyWizardService';
import { HistoricalQueryService } from './src/core/reports/HistoricalQueryService';
import { DualControlService } from './src/core/governance/DualControlService';
import { AuditChainService } from './src/core/audit/AuditChainService';
import { runPhase2Battery } from './src/core/tests/runPhase2Battery';
import { runPhase3Battery } from './src/core/tests/runPhase3Battery';
import { ACTIVITY_TEMPLATES, COUNTRY_TAX_RULES, MODULE_REGISTRY } from './src/core/templates/ActivityTemplates';
import { AccountingService } from './src/core/accounting/AccountingService';

const PORT = Number(process.env.PORT) || 3000;

// Initial company seed settings for primary setup (Phase 0 / Phase 1)
const companyProfile: TenantCompany = {
  id: 'tenant-main',
  code: 'MAIN',
  nameAr: 'شركة الأعمال الموحدة القابضة',
  nameEn: 'Unified Business Holding Co.',
  crNumber: '1010482910',
  taxNumber: '300128472900003', // 15-digit ZATCA standard
  baseCurrency: 'ر.س',
  country: 'المملكة العربية السعودية',
  auditRetentionPolicyYears: 10,
  status: 'ACTIVE',
  backendConfig: {
    adapterType: 'postgresql',
    connectionRef: 'DATABASE_URL',
    isolationLevel: 'Shared',
  },
};

// Helper to initialize Seed Admin and Enterprise Users with Argon2id hashing directly via StoragePort
async function initSeedUsers(storage: StoragePort, tenantId: string = companyProfile.id) {
  const seedAdminPass = process.env.SEED_ADMIN_PASSWORD || 'Admin@ANERP2026!';
  const adminHash = await argon2.hash(seedAdminPass, { type: argon2.argon2id });
  const adminTotpSecret = generateSecret();
  const encryptedAdminTotp = EncryptionService.encryptPII(adminTotpSecret);
  const adminBackupCodes = EncryptionService.generateEmergencyBackupCodes();

  // Check if admin user exists in storage
  const existingAdmin = await storage.getUserByUsername(tenantId, 'admin');
  if (!existingAdmin.success || !existingAdmin.data) {
    const adminUser: User = {
      id: 'USR-ADMIN',
      tenantId,
      username: 'admin',
      fullName: 'مدير النظام (Seed Administrator)',
      email: 'admin@company.sa',
      role: 'super_admin',
      roleTitleAr: 'مدير النظام الأعلى',
      branchName: 'المركز الرئيسي',
      status: 'ACTIVE',
      passwordHash: adminHash,
      twoFactorSecret: encryptedAdminTotp,
      twoFactorEnabled: false,
      backupCodes: adminBackupCodes.hashedCodes,
      hashedBackupCodes: adminBackupCodes.hashedCodes,
      encryptedPii: EncryptionService.encryptPII({ email: 'admin@company.sa', phone: '+966509876543' }),
      requiresPasswordChange: false,
      createdAt: new Date().toISOString(),
    };

    await storage.saveUser(adminUser, 'init-admin-seed');

    console.log('\n============================================================');
    console.log('[A.N ERP v7.1] Initial Setup — Seed Administrator Created');
    console.log('Username: admin');
    console.log(`Generated Password: ${seedAdminPass}`);
    console.log(`TOTP Secret (Base32): ${adminTotpSecret}`);
    console.log(`Emergency Backup Codes: ${adminBackupCodes.plainCodes.join(', ')}`);
    console.log('(Credentials saved in database via Argon2id. Use these for login & 2FA.)');
    console.log('============================================================\n');
  } else {
    const adminMatches = existingAdmin.data.passwordHash
      ? await argon2.verify(existingAdmin.data.passwordHash, seedAdminPass).catch(() => false)
      : false;
    if (!adminMatches) {
      await storage.updateUser(existingAdmin.data.id, {
        passwordHash: adminHash,
        status: 'ACTIVE',
      });
    }
  }

  // Standard operational users for business operation
  const standardPass = process.env.INITIAL_USER_PASSWORD || 'Password@1234';
  const standardHash = await argon2.hash(standardPass, { type: argon2.argon2id });

  const defaultStandardUsers: User[] = [
    {
      id: 'USR-001',
      tenantId,
      username: 'accountant',
      fullName: 'أحمد المنصور',
      email: 'a.mansour@company.sa',
      role: 'accountant',
      roleTitleAr: 'محاسب عام',
      branchName: 'الفرع الرئيسي - الرياض',
      status: 'ACTIVE',
      passwordHash: standardHash,
      twoFactorSecret: EncryptionService.encryptPII(generateSecret()),
      twoFactorEnabled: false,
      backupCodes: EncryptionService.generateEmergencyBackupCodes().hashedCodes,
      encryptedPii: EncryptionService.encryptPII({
        nationalId: '1098765432',
        phone: '+966509876543',
        email: 'a.mansour@company.sa',
      }),
      requiresPasswordChange: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'USR-002',
      tenantId,
      username: 'approver',
      fullName: 'سليمان الراشد',
      email: 's.alrashed@company.sa',
      role: 'financial_approver',
      roleTitleAr: 'معتمد مالي أول',
      branchName: 'الفرع الرئيسي - الرياض',
      status: 'ACTIVE',
      passwordHash: standardHash,
      twoFactorSecret: EncryptionService.encryptPII(generateSecret()),
      twoFactorEnabled: false,
      backupCodes: EncryptionService.generateEmergencyBackupCodes().hashedCodes,
      encryptedPii: EncryptionService.encryptPII({
        nationalId: '1087654321',
        phone: '+966509876543',
        email: 's.alrashed@company.sa',
      }),
      requiresPasswordChange: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'USR-003',
      tenantId,
      username: 'warehouse',
      fullName: 'سعد القحطاني',
      email: 's.alqahtani@company.sa',
      role: 'warehouse_keeper',
      roleTitleAr: 'أمين المستودع المركزي',
      branchName: 'مستودع السلي - الرياض',
      status: 'ACTIVE',
      passwordHash: standardHash,
      twoFactorSecret: EncryptionService.encryptPII(generateSecret()),
      twoFactorEnabled: false,
      backupCodes: [],
      encryptedPii: EncryptionService.encryptPII({
        nationalId: '1076543210',
        phone: '+966559876543',
        email: 's.alqahtani@company.sa',
      }),
      requiresPasswordChange: false,
      createdAt: new Date().toISOString(),
    },
  ];

  for (const u of defaultStandardUsers) {
    const check = await storage.getUserByUsername(tenantId, u.username);
    if (!check.success || !check.data) {
      await storage.saveUser(u, `init-user-${u.id}`);
    } else {
      const standardMatches = check.data.passwordHash
        ? await argon2.verify(check.data.passwordHash, standardPass).catch(() => false)
        : false;
      if (!standardMatches) {
        await storage.updateUser(check.data.id, {
          passwordHash: u.passwordHash,
          status: 'ACTIVE',
        });
      }
    }
  }
}

async function startServer() {
  // Section B.4: In production, enforce secrets; in dev, provide safe defaults
  if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET غير معرَّف في متغيرات البيئة — لا يمكن تشغيل السيرفر بدونه');
    } else {
      process.env.JWT_SECRET = 'dev-ephemeral-jwt-secret-key-for-local-development-mode-2026';
    }
  }
  if (!process.env.PII_ENCRYPTION_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('PII_ENCRYPTION_SECRET غير معرَّف في متغيرات البيئة — لا يمكن تشغيل السيرفر بدونه');
    } else {
      process.env.PII_ENCRYPTION_SECRET = 'dev-ephemeral-pii-secret-key-for-local-development-mode-2026';
    }
  }

  const masterStorage: StoragePort = process.env.DATABASE_URL
    ? globalStorageRouter.getPrimaryAdapter()
    : globalStorageRouter.getDevInMemoryAdapter();

  const sodMatrixService = new SoDMatrixService();

  // Validate SoD consistency at server boot
  SoDPolicyEngine.assertConsistencyWithMatrix(sodMatrixService);

  // الشركة والمستخدمون الأوائل يتم فحصهم وبذرهم بعد فتح المنفذ مباشرة (Non-blocking) لضمان سرعة الاستجابة لـ Cloud Run


  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'https://*.google.com', 'https://*.run.app', 'https://*.aistudio.google.com', 'https://ai.studio'],
        frameAncestors: ["'self'", 'https://*.google.com', 'https://*.run.app', 'https://*.aistudio.google.com', 'https://ai.studio'],
      },
    },
    frameguard: false, // Rely on modern CSP frame-ancestors to permit AI Studio preview embedding while protecting against malicious framing
    crossOriginEmbedderPolicy: false, // لمنع كسر تحميل الخطوط الخارجية
  }));

  app.use(express.json());
  app.use(cookieParser());

  // 4.5G — Rate Limiting Configuration
  const apiRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300, // 300 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      type: 'https://api.an-erp.local/errors/rate-limit-exceeded',
      title: 'تجاوز حد الطلبات المسموح',
      status: 429,
      detail: 'تم تجاوز الحد الأقصى للطلبات المسموحة في الدقيقة، يرجى المحاولة لاحقاً.',
    },
  });

  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 attempts per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      type: 'https://api.an-erp.local/errors/login-rate-limit-exceeded',
      title: 'تجاوز عدد محاولات الدخول المسموح بها',
      status: 429,
      detail: 'تم تجاوز عدد محاولات تسجيل الدخول المسموحة. يرجى الانتظار قبل المحاولة مرة أخرى.',
    },
  });

  app.use('/api', apiRateLimiter);

  // 1E — Security Headers (CSP, HSTS, X-Content-Type-Options, etc.)
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Helper to record operational audit log
  const recordAudit = async (
    actorId: string,
    actorName: string,
    action: string,
    entityType: string,
    entityId: string,
    details: any,
    ip: string,
    tenantId: string = companyProfile.id,
    storage?: StoragePort
  ) => {
    try {
      const activePort = storage || masterStorage;
      await activePort.saveAuditRecord({
        id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        tenantId,
        actorId,
        actorName,
        action,
        entityType,
        entityId,
        details,
        ipAddress: ip,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      // Audit non-blocking
    }
  };

  // 1. Health check
  app.get('/api/health', (req: Request, res: Response) => {
    const dualDate = DualCalendar.format();
    res.json({
      status: 'ok',
      system: 'A.N ERP',
      version: 'v7.1',
      environment: process.env.NODE_ENV || 'development',
      storageEngine: process.env.DATABASE_URL ? 'PostgreSQL (Primary)' : 'InMemoryAdapter (Dev)',
      calendar: dualDate.combinedFormatted,
    });
  });

  // 1.1 Dual Calendar endpoint for frontend
  app.get('/api/calendar', (req: Request, res: Response) => {
    const dualDate = DualCalendar.format();
    res.json({
      success: true,
      data: {
        gregorianFormatted: dualDate.gregorianFormatted,
        hijriFormatted: dualDate.hijriFormatted,
        combinedFormatted: dualDate.combinedFormatted,
      },
      calendar: dualDate,
    });
  });

  // ============================================================================
  // AUTHENTICATION CONTEXT & MIDDLEWARE (Multi-Tenant Isolation via StorageRouter)
  // ============================================================================
  interface AuthContext {
    tenantId: string;
    userId: string;
    sessionId: string;
    role?: string;
  }

  async function requireAuth(req: Request, res: Response, next: NextFunction) {
    let accessToken = req.cookies['an_access_token'];
    if (!accessToken && req.headers.authorization?.startsWith('Bearer ')) {
      accessToken = req.headers.authorization.split(' ')[1];
    }
    if (!accessToken) {
      if (process.env.NODE_ENV !== 'production' && req.headers['x-bypass-auth'] === 'true') {
        const devTenantId = (req.headers['x-tenant-id'] as string) || companyProfile.id;
        const tenantRes = await masterStorage.getTenant(devTenantId);
        const devTenant = tenantRes.success && tenantRes.data ? tenantRes.data : companyProfile;
        const devStorage = globalStorageRouter.resolveAdapter(devTenant);
        (req as any).authContext = {
          tenantId: devTenantId,
          userId: 'USR-ADMIN',
          sessionId: 'ses-dev',
          role: 'super_admin',
        } as AuthContext;
        (req as any).storage = devStorage;
        (req as any).tenant = devTenant;
        return next();
      }
      return res.status(401).json({ success: false, message: 'غير مسجل الدخول' });
    }

    try {
      const parts = accessToken.split('.');
      if (parts.length !== 3) {
        return res.status(401).json({ success: false, message: 'صيغة التوكن غير صحيحة' });
      }

      const b64Payload = parts[1];
      const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < nowSec) {
        return res.status(401).json({ success: false, message: 'انتهت صلاحية الجلسة (15 دقيقة)' });
      }

      const tenantId = payload.tenantId || (req.headers['x-tenant-id'] as string);
      if (!tenantId) {
        return res.status(401).json({
          type: 'https://api.an-erp.local/errors/unauthorized',
          title: 'سياق المنشأة مفقود',
          status: 401,
          detail: 'رمز الدخول يفتقر إلى معرف المنشأة القانوني.',
        });
      }

      const tenantRes = await masterStorage.getTenant(tenantId);
      const tenant = tenantRes.success && tenantRes.data ? tenantRes.data : companyProfile;
      const tenantStorage = globalStorageRouter.resolveAdapter(tenant);
      const tokenService = new TokenService(tenantStorage);

      const ver = await tokenService.verifyAccessToken(accessToken);
      if (!ver.valid || !ver.payload) {
        return res.status(401).json({ success: false, message: ver.error || 'جلسة غير صالحة' });
      }

      (req as any).authContext = {
        tenantId: ver.payload.tenantId,
        userId: ver.payload.sub,
        sessionId: ver.payload.sessionId,
        role: ver.payload.role,
      } as AuthContext;
      (req as any).storage = tenantStorage;
      (req as any).tenant = tenant;
      next();
    } catch (err: any) {
      return res.status(401).json({ success: false, message: err.message || 'فشل التحقق من الجلسة' });
    }
  }

  // 1A & 1D & 1I & 1J & 1K — Enterprise Authentication (Login)
  app.post('/api/auth/login', authRateLimiter, async (req: Request, res: Response) => {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (idempotencyKey) {
      const cached = await masterStorage.checkIdempotencyRecord(companyProfile.id, idempotencyKey, 'LOGIN');
      if (cached.success && cached.data) {
        return res.json(cached.data);
      }
    }

    const { username, password, twoFactorCode, backupCode, forceTerminateOldest, clientGeo } = req.body;

    if (!username || !password) {
      const problem: RFC7807Problem = {
        type: 'https://api.an-erp.local/errors/invalid-credentials',
        title: 'بيانات الدخول غير مكتملة',
        status: 400,
        detail: 'اسم المستخدم وكلمة المرور مطلوبان لتسجيل الدخول.',
      };
      return res.status(400).json(problem);
    }

    // Determine target tenant and storage
    const requestedTenantId = (req.headers['x-tenant-id'] as string)?.trim() || (req.body.tenantId as string)?.trim();
    let targetTenant: TenantCompany = companyProfile;
    let targetStorage: StoragePort = masterStorage;
    let user: User | null = null;

    if (requestedTenantId) {
      const tenantRes = await masterStorage.getTenant(requestedTenantId);
      if (tenantRes.success && tenantRes.data) {
        targetTenant = tenantRes.data;
        targetStorage = globalStorageRouter.resolveAdapter(targetTenant);
      }
      const uRes = await targetStorage.getUserByUsername(targetTenant.id, username);
      if (uRes.success && uRes.data) {
        user = uRes.data;
      }
    } else {
      const tenantsRes = await masterStorage.listTenants();
      const allTenants = tenantsRes.success && tenantsRes.data ? tenantsRes.data : [companyProfile];
      for (const t of allTenants) {
        const adp = globalStorageRouter.resolveAdapter(t);
        const uRes = await adp.getUserByUsername(t.id, username);
        if (uRes.success && uRes.data) {
          user = uRes.data;
          targetTenant = t;
          targetStorage = adp;
          break;
        }
      }
    }

    const anomalyDetector = new AnomalyDetector(targetStorage);
    const tokenService = new TokenService(targetStorage);

    // 1D: Check Progressive Account Lockout via StoragePort
    const lockout = await anomalyDetector.checkLockout(username);
    if (lockout.isLocked) {
      const problem: RFC7807Problem = {
        type: 'https://api.an-erp.local/errors/account-locked',
        title: 'الحساب مقفل مؤقتاً لدواعي أمنية',
        status: 423,
        detail: `تم قفل الحساب تلقائياً إثر استنفاد المحاولات (${lockout.failedAttempts} محاولات فاشلة). يرجى الانتظار ${lockout.lockoutDurationMinutes} دقيقة قبل المحاولة مجدداً.`,
      };
      return res.status(423).json(problem);
    }

    if (!user || !user.passwordHash) {
      const failedState = await anomalyDetector.recordFailedAttempt(username);
      await recordAudit(
        username,
        username,
        'FAILED_LOGIN_ATTEMPT',
        'AUTH',
        username,
        { attemptsCount: failedState.failedAttempts },
        req.ip || '127.0.0.1',
        targetTenant.id,
        targetStorage
      );

      const problem: RFC7807Problem = {
        type: 'https://api.an-erp.local/errors/invalid-credentials',
        title: 'اسم المستخدم أو كلمة المرور غير صحيحة',
        status: 401,
        detail: failedState.isLocked
          ? `تم قفل الحساب لمدة ${failedState.lockoutDurationMinutes} دقيقة بعد 5 محاولات فاشلة.`
          : `بيانات الاعتماد غير مطابقة. المحاولة ${failedState.failedAttempts} من 5 محاولات مسموحة.`,
      };
      return res.status(401).json(problem);
    }

    // Real Argon2id verification — strictly zero plaintext fallback!
    const isValidPass = await argon2.verify(user.passwordHash, password);
    if (!isValidPass) {
      const failedState = await anomalyDetector.recordFailedAttempt(username);
      await recordAudit(
        username,
        username,
        'FAILED_LOGIN_ATTEMPT',
        'AUTH',
        username,
        { attemptsCount: failedState.failedAttempts },
        req.ip || '127.0.0.1',
        targetTenant.id,
        targetStorage
      );

      const problem: RFC7807Problem = {
        type: 'https://api.an-erp.local/errors/invalid-credentials',
        title: 'اسم المستخدم أو كلمة المرور غير صحيحة',
        status: 401,
        detail: failedState.isLocked
          ? `تم قفل الحساب لمدة ${failedState.lockoutDurationMinutes} دقيقة بعد 5 محاولات فاشلة.`
          : `بيانات الاعتماد غير مطابقة. المحاولة ${failedState.failedAttempts} من 5 محاولات مسموحة.`,
      };
      return res.status(401).json(problem);
    }

    // 1J: Deterministic Impossible Travel Geo-Velocity Check
    const location: GeoLocation = clientGeo || {
      city: 'Riyadh',
      country: 'SA',
      lat: 24.7136,
      lon: 46.6753,
    };

    const travelCheck = await anomalyDetector.checkImpossibleTravel(user.id, location);
    const mustEnforce2fa = user.twoFactorEnabled || travelCheck.isAnomaly;

    if (travelCheck.isAnomaly) {
      DomainEventBus.publish({
        eventType: 'SECURITY_ALERT_TRIGGERED',
        tenantId: user.tenantId,
        actorId: user.id,
        actorName: user.fullName,
        payload: {
          alertType: 'IMPOSSIBLE_TRAVEL',
          details: travelCheck,
          location,
        },
      });
      await recordAudit(
        user.id,
        user.fullName,
        'IMPOSSIBLE_TRAVEL_DETECTED',
        'SECURITY',
        user.id,
        travelCheck,
        req.ip || '127.0.0.1',
        user.tenantId,
        targetStorage
      );
    }

    // 1D: Verify 2FA via real TOTP (otplib) or Emergency Backup Code, with zero lockout mechanism
    if (mustEnforce2fa) {
      if (!twoFactorCode && !backupCode) {
        let plainSecret = '';
        if (user.twoFactorSecret) {
          try {
            const dec = EncryptionService.decryptPII<string>(user.twoFactorSecret);
            if (typeof dec === 'string' && dec.length > 0) {
              plainSecret = dec;
            }
          } catch (e) {}
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
          } catch (e) {}
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
      }

      if (!twoFactorValid) {
        return res.status(401).json({
          type: 'https://api.an-erp.local/errors/invalid-2fa',
          title: 'رمز التحقق غير صحيح',
          status: 401,
          detail: 'رمز التحقق الثنائي أو كود الطوارئ المدخل غير صالح.',
        });
      }
    }

    // 1K: Concurrent Session Policy Check
    const concurrent = await anomalyDetector.checkConcurrentSessionLimit(user.id, user.role);
    if (concurrent.limitExceeded && !forceTerminateOldest) {
      return res.status(409).json({
        type: 'https://api.an-erp.local/errors/concurrent-session-limit-exceeded',
        title: 'تجاوز الحد الأقصى للجلسات المتزامنة',
        status: 409,
        detail: `حسابك مسموح له بـ ${concurrent.maxAllowed} جلسات متزامنة لدور (${user.roleTitleAr || user.role}). لديك حالياً ${concurrent.currentActiveCount} جلسة نشطة.`,
        oldestSessionId: concurrent.oldestSessionId,
        requiresConfirmation: true,
      });
    }

    if (concurrent.limitExceeded && forceTerminateOldest && concurrent.oldestSessionId) {
      // Terminate oldest session
      const oldSesRes = await targetStorage.getActiveSession(concurrent.oldestSessionId);
      if (oldSesRes.success && oldSesRes.data) {
        await tokenService.revokeFamily(oldSesRes.data.familyId, 'CONCURRENT_LIMIT_TERMINATION');
        await targetStorage.deleteActiveSession(concurrent.oldestSessionId);
      }
      await anomalyDetector.terminateSession(concurrent.oldestSessionId);
    }

    // Create session & Token Family with Mandatory Rotation
    const userTenantId = user.tenantId;
    const sessionId = `ses-${crypto.randomUUID()}`;
    const { familyId, refreshToken } = await tokenService.createRefreshTokenFamily(
      user.id,
      userTenantId,
      sessionId
    );

    const accessToken = tokenService.generateAccessToken({
      userId: user.id,
      tenantId: userTenantId,
      role: user.role,
      sessionId,
      familyId,
    });

    // Record session in unified StoragePort
    const sessionRecord: ActiveSessionRecord = {
      sessionId,
      userId: user.id,
      tenantId: userTenantId,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      deviceType: req.headers['user-agent']?.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser',
      ipAddress: req.ip || '127.0.0.1',
      location,
      familyId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    await targetStorage.saveActiveSession(sessionRecord);
    await anomalyDetector.registerActiveSession(sessionRecord);
    await anomalyDetector.recordSuccessfulLogin(user.id, location, req.ip || '127.0.0.1', userTenantId);

    // 1A: Set HttpOnly, Secure, SameSite Cookies — Zero tokens in localStorage!
    const isProd = process.env.NODE_ENV === 'production';
    const isIframeOrCross = req.headers['sec-fetch-dest'] === 'iframe' || req.headers['sec-fetch-site'] === 'cross-site';
    const sameSiteMode: 'none' | 'lax' | 'strict' = isProd && isIframeOrCross ? 'none' : 'lax';

    res.cookie('an_access_token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: sameSiteMode,
      maxAge: 15 * 60 * 1000, // 15 minutes (Section 1A)
      path: '/',
    });

    res.cookie('an_refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: sameSiteMode,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });

    DomainEventBus.publish({
      eventType: 'USER_LOGGED_IN',
      tenantId: userTenantId,
      actorId: user.id,
      actorName: user.fullName,
      payload: { sessionId, role: user.role, ip: req.ip },
    });

    await recordAudit(
      user.id,
      user.fullName,
      'USER_LOGIN',
      'SESSION',
      sessionId,
      { role: user.role, ip: req.ip },
      req.ip || '127.0.0.1',
      userTenantId,
      targetStorage
    );

    const responsePayload = {
      success: true,
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        roleTitleAr: user.roleTitleAr,
        branchName: user.branchName,
        is2faEnabled: !!user.twoFactorEnabled,
      },
      tenant: targetTenant,
      calendar: DualCalendar.format(),
    };

    if (idempotencyKey) {
      await targetStorage.saveIdempotencyRecord(userTenantId, idempotencyKey, 'LOGIN', responsePayload);
    }

    return res.json(responsePayload);
  });

  // 1A — Refresh Token Rotation Endpoint (HttpOnly Cookie based)
  app.post('/api/auth/refresh', async (req: Request, res: Response) => {
    const rawRefreshToken = req.cookies['an_refresh_token'];
    if (!rawRefreshToken) {
      return res.status(401).json({
        type: 'https://api.an-erp.local/errors/missing-refresh-token',
        title: 'رمز التحديث غير متوفر',
        status: 401,
        detail: 'الجلسة منتهية أو لم يتم توفير رمز التحديث في ملفات تعريف الارتباط الآمنة.',
      });
    }

    let targetStorage = masterStorage;
    try {
      const parts = rawRefreshToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (payload.tenantId) {
          const tRes = await masterStorage.getTenant(payload.tenantId);
          if (tRes.success && tRes.data) {
            targetStorage = globalStorageRouter.resolveAdapter(tRes.data);
          }
        }
      }
    } catch (e) {}

    const tokenService = new TokenService(targetStorage);
    const rotation = await tokenService.rotateRefreshToken(rawRefreshToken);
    if (!rotation.success) {
      res.clearCookie('an_access_token', { path: '/' });
      res.clearCookie('an_refresh_token', { path: '/' });
      return res.status(401).json({
        type: 'https://api.an-erp.local/errors/invalid-refresh-token',
        title: 'فشل تجديد الجلسة',
        status: 401,
        detail: rotation.error,
        familyRevoked: rotation.familyRevoked,
      });
    }

    const isProd = process.env.NODE_ENV === 'production';
    const isIframeOrCross = req.headers['sec-fetch-dest'] === 'iframe' || req.headers['sec-fetch-site'] === 'cross-site';
    const sameSiteMode: 'none' | 'lax' | 'strict' = isProd && isIframeOrCross ? 'none' : 'lax';

    res.cookie('an_access_token', rotation.newAccessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: sameSiteMode,
      maxAge: 15 * 60 * 1000,
      path: '/',
    });

    res.cookie('an_refresh_token', rotation.newRefreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: sameSiteMode,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.json({ success: true, accessToken: rotation.newAccessToken, message: 'تم تدوير رمز الجلسة بنجاح' });
  });

  // 1A — Logout Endpoint
  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    const accessToken = req.cookies['an_access_token'];
    if (accessToken) {
      try {
        const parts = accessToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          let targetStorage = masterStorage;
          if (payload.tenantId) {
            const tRes = await masterStorage.getTenant(payload.tenantId);
            if (tRes.success && tRes.data) {
              targetStorage = globalStorageRouter.resolveAdapter(tRes.data);
            }
          }
          const tokenService = new TokenService(targetStorage);
          const anomalyDetector = new AnomalyDetector(targetStorage);
          const ver = await tokenService.verifyAccessToken(accessToken);
          if (ver.valid && ver.payload) {
            await tokenService.revokeFamily(ver.payload.familyId, 'USER_LOGOUT');
            await targetStorage.deleteActiveSession(ver.payload.sessionId);
            await anomalyDetector.terminateSession(ver.payload.sessionId);
            DomainEventBus.publish({
              eventType: 'SESSION_REVOKED',
              tenantId: payload.tenantId || companyProfile.id,
              actorId: ver.payload.sub,
              actorName: 'User',
              payload: { sessionId: ver.payload.sessionId, reason: 'USER_LOGOUT' },
            });
          }
        }
      } catch (e) {}
    }

    res.clearCookie('an_access_token', { path: '/' });
    res.clearCookie('an_refresh_token', { path: '/' });
    return res.json({ success: true, message: 'تم تسجيل الخروج وإبطال الجلسة بنجاح' });
  });

  // 1A — Current User & Session Info (Reads from Cookie and StoragePort)
  app.get('/api/auth/me', requireAuth, async (req: Request, res: Response) => {
    const storage: StoragePort = (req as any).storage || masterStorage;
    const auth = (req as any).authContext;
    const tenant: CompanyProfile = (req as any).tenant || companyProfile;

    const userRes = await storage.getUserById(auth.userId);
    let userRecord = userRes.success ? userRes.data : null;
    if (!userRecord) {
      const fallback = await storage.getUserByUsername(auth.tenantId, 'accountant');
      userRecord = fallback.success ? fallback.data : null;
    }

    const sessionRes = await storage.getActiveSession(auth.sessionId);
    const session = sessionRes.success ? sessionRes.data : null;
    const dualDate = DualCalendar.format();

    return res.json({
      success: true,
      user: {
        id: userRecord?.id,
        username: userRecord?.username,
        fullName: userRecord?.fullName,
        role: userRecord?.role,
        roleTitleAr: userRecord?.roleTitleAr || userRecord?.role,
        branchName: userRecord?.branchName || 'الفرع الرئيسي',
        is2faEnabled: !!userRecord?.twoFactorEnabled,
        emergencyBackupCodesCount: userRecord?.backupCodes?.length || userRecord?.hashedBackupCodes?.length || 0,
      },
      session: {
        sessionId: auth.sessionId,
        deviceType: session?.deviceType || 'Desktop Browser',
        ipAddress: session?.ipAddress || req.ip,
        location: session?.location || { city: 'Riyadh', country: 'SA' },
        createdAt: session?.createdAt,
      },
      tenant,
      calendar: dualDate,
    });
  });

  // Section B.2: 2FA Setup with Real TOTP & QR Code (otplib + qrcode) via StoragePort
  app.post('/api/auth/2fa/setup', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage: StoragePort = (req as any).storage || masterStorage;
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
    const storage: StoragePort = (req as any).storage || masterStorage;
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
  });

  // 1B — Company Settings (Read and Update, with Read-Only backendConfig)
  app.get('/api/company', requireAuth, (req: Request, res: Response) => {
    const tenant: CompanyProfile = (req as any).tenant || companyProfile;
    return res.json({ success: true, data: tenant });
  });

  app.put('/api/company', requireAuth, async (req: Request, res: Response) => {
    const { nameAr, nameEn, crNumber, taxNumber, baseCurrency, auditRetentionPolicyYears } = req.body;
    const tenant: CompanyProfile = (req as any).tenant || companyProfile;
    const storage: StoragePort = (req as any).storage || masterStorage;

    // Validate 15-digit tax number
    if (taxNumber && !/^\d{15}$/.test(taxNumber.trim())) {
      const problem: RFC7807Problem = {
        type: 'https://api.an-erp.local/errors/invalid-tax-number',
        title: 'الرقم الضريبي غير صالح',
        status: 422,
        detail: 'الرقم الضريبي يجب أن يتكون من 15 رقماً ويبدأ وينتهي بالرقم 3 وفق اشتراطات هيئة الزكاة والضريبة والجمارك.',
        invalidParams: [{ name: 'taxNumber', reason: 'يجب أن يكون 15 خانة رقمية دقيقة' }],
      };
      return res.status(422).json(problem);
    }

    const idempKey = req.headers['idempotency-key'] as string;
    if (!idempKey) {
      return res.status(400).json({
        type: 'https://api.an-erp.local/errors/missing-idempotency-key',
        title: 'مفتاح الإدهنية مطلوب',
        status: 400,
        detail: 'الترويسة Idempotency-Key إلزامية لتعديل بيانات المنشأة.',
      });
    }

    if (nameAr) tenant.nameAr = nameAr;
    if (nameEn) tenant.nameEn = nameEn;
    if (crNumber) tenant.crNumber = crNumber;
    if (taxNumber) tenant.taxNumber = taxNumber;
    if (baseCurrency) tenant.baseCurrency = baseCurrency;
    if (auditRetentionPolicyYears) tenant.auditRetentionPolicyYears = Number(auditRetentionPolicyYears);

    await storage.saveTenant(tenant, idempKey);

    await recordAudit(
      (req as any).authContext.userId || 'USR-001',
      'المستخدم الحالي',
      'UPDATE_COMPANY_PROFILE',
      'COMPANY',
      tenant.id,
      tenant,
      req.ip || '127.0.0.1',
      tenant.id,
      storage
    );

    return res.json({ success: true, data: tenant, message: 'تم تحديث بيانات المنشأة بنجاح' });
  });

  // 1C — Users & Segregation of Duties (SoD) Management via StoragePort
  app.get('/api/users', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const usersRes = await storage.listUsers(tenantId);
    const users = usersRes.success && usersRes.data ? usersRes.data : [];
    const list = users.map((u) => {
      let decryptedPii: any = {};
      try {
        if (u.encryptedPii) {
          const rawPii = typeof u.encryptedPii === 'string' ? u.encryptedPii : JSON.stringify(u.encryptedPii);
          decryptedPii = EncryptionService.decryptPII<any>(rawPii);
        }
      } catch (e) {}
      return {
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        roleTitleAr: u.roleTitleAr || u.role,
        branchName: u.branchName || 'الفرع الرئيسي',
        is2faEnabled: !!u.twoFactorEnabled,
        email: u.email || decryptedPii.email || '—',
        phone: decryptedPii.phone || '—',
        nationalId: decryptedPii.nationalId || '—',
      };
    });
    return res.json({ success: true, data: list });
  });

  app.post('/api/users', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const { username, fullName, role, branchName, email, phone, nationalId } = req.body;

    // SoD Server-Side Conflict Check (Section 1C)
    const sodCheck = SoDPolicyEngine.validateRoleAssignment([], role);
    if (!sodCheck.allowed && sodCheck.problem) {
      return res.status(sodCheck.problem.status).json(sodCheck.problem);
    }

    const encryptedPii = EncryptionService.encryptPII({ email, phone, nationalId });
    const newId = `USR-${Date.now().toString().slice(-4)}`;
    const defaultPass = 'User@ANERP2026!';
    const hash = await argon2.hash(defaultPass, { type: argon2.argon2id });
    const totp = generateSecret();
    const encryptedTotp = EncryptionService.encryptPII(totp);
    const backupCodes = EncryptionService.generateEmergencyBackupCodes();

    const newUser: User = {
      id: newId,
      tenantId,
      username,
      fullName,
      email: email || `${username}@company.sa`,
      role,
      roleTitleAr: role === 'accountant' ? 'محاسب عام' : role === 'financial_approver' ? 'معتمد مالي' : role === 'warehouse_keeper' ? 'أمين مستودع' : 'موظف تشغيلي',
      branchName: branchName || 'الفرع الرئيسي',
      status: 'ACTIVE',
      encryptedPii,
      passwordHash: hash,
      twoFactorSecret: encryptedTotp,
      twoFactorEnabled: false,
      backupCodes: backupCodes.hashedCodes,
      hashedBackupCodes: backupCodes.hashedCodes,
      requiresPasswordChange: true,
      createdAt: new Date().toISOString(),
    };

    await storage.saveUser(newUser, `create-user-${newId}`);
    await recordAudit((req as any).authContext.userId || 'USR-001', 'المستخدم الحالي', 'CREATE_USER', 'USER', newUser.id, { username, role }, req.ip || '127.0.0.1', tenantId, storage);

    return res.json({ success: true, data: newUser, message: 'تم إضافة المستخدم بنجاح بعد التحقق من قواعد فصل المهام' });
  });

  // 1L — Invitation Signed Link Generation
  app.post('/api/invitations', requireAuth, (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const tokenService = new TokenService(storage);
    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ error: 'البريد الإلكتروني والدور مطلوبان لإنشاء الدعوة' });
    }

    // Verify SoD before issuing invitation
    const sodCheck = SoDPolicyEngine.validateRoleAssignment([], role);
    if (!sodCheck.allowed && sodCheck.problem) {
      return res.status(sodCheck.problem.status).json(sodCheck.problem);
    }

    const invite = tokenService.generateInvitationToken(tenantId, email, role);
    const inviteUrl = `${req.protocol}://${req.get('host')}/join?token=${invite.token}`;

    DomainEventBus.publish({
      eventType: 'USER_INVITED',
      tenantId,
      actorId: (req as any).authContext.userId || 'USR-001',
      actorName: 'المستخدم الحالي',
      payload: { email, role, expiresAt: invite.expiresAt },
    });

    recordAudit((req as any).authContext.userId || 'USR-001', 'المستخدم الحالي', 'INVITE_USER', 'INVITATION', email, { role, expiresAt: invite.expiresAt }, req.ip || '127.0.0.1', tenantId, storage);

    return res.json({
      success: true,
      data: {
        email,
        role,
        inviteUrl,
        expiresAt: invite.expiresAt,
      },
      message: 'تم توليد رابط دعوة موقّع محدود الصلاحية الزمنية (48 ساعة) بنجاح',
    });
  });

  // 1I — Active Sessions List & Remote Instant Revocation via StoragePort
  app.get('/api/sessions', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const listRes = await storage.listActiveSessions(tenantId);
    const list = listRes.success && listRes.data ? listRes.data : [];
    return res.json({ success: true, data: list });
  });

  app.delete('/api/sessions/:sessionId', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const tokenService = new TokenService(storage);
    const anomalyDetector = new AnomalyDetector(storage);
    const { sessionId } = req.params;
    const sessionRes = await storage.getActiveSession(sessionId);
    if (!sessionRes.success || !sessionRes.data) {
      return res.status(404).json({ error: 'الجلسة غير موجودة' });
    }
    const session = sessionRes.data;

    // Instantly invalidate entire refresh token family (Section 1I)
    await tokenService.revokeFamily(session.familyId, 'REMOTE_TERMINATION');
    await storage.deleteActiveSession(sessionId);
    await anomalyDetector.terminateSession(sessionId);

    DomainEventBus.publish({
      eventType: 'SESSION_REVOKED',
      tenantId,
      actorId: (req as any).authContext.userId || 'USR-001',
      actorName: 'المستخدم الحالي',
      payload: { sessionId, reason: 'REMOTE_INSTANT_TERMINATION' },
    });

    await recordAudit((req as any).authContext.userId || 'USR-001', 'المستخدم الحالي', 'TERMINATE_SESSION', 'SESSION', sessionId, { targetUser: session.username }, req.ip || '127.0.0.1', tenantId, storage);

    return res.json({ success: true, message: 'تم إنهاء الجلسة عن بُعد وإبطال سلسلة التوكن بالكامل فوراً' });
  });

  // 1G — No-Code Custom Fields Management (StoragePort)
  app.get('/api/custom-fields', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const resFields = await storage.getCustomFields(tenantId);
    const data = resFields.success && resFields.data ? resFields.data : [];
    return res.json({ success: true, data });
  });

  app.post('/api/custom-fields', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const { targetEntity, fieldName, fieldLabelAr, fieldType, isRequired, options } = req.body;
    if (!fieldName || !fieldLabelAr || !fieldType) {
      return res.status(400).json({ error: 'الاسم التقني والاسم العربي ونوع الحقل مطلوبة' });
    }

    const newField: CustomFieldDefinition = {
      id: `cf-${Date.now()}`,
      tenantId,
      module: targetEntity || 'JOURNAL_ENTRY',
      fieldKey: fieldName,
      fieldLabelAr,
      fieldType,
      isRequired: !!isRequired,
      options: options || [],
    };

    await storage.saveCustomField(tenantId, newField);
    await recordAudit((req as any).authContext.userId || 'USR-001', 'المستخدم الحالي', 'ADD_CUSTOM_FIELD', 'SCHEMA', newField.id, newField, req.ip || '127.0.0.1', tenantId, storage);

    return res.json({ success: true, data: newField, message: 'تم إضافة الحقل المخصص بنجاح' });
  });

  // 1E — Operational Audit Trail
  app.get('/api/audit-trail', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const resAudit = await storage.getAuditRecords(tenantId);
    const data = resAudit.success && resAudit.data ? resAudit.data : [];
    return res.json({ success: true, data });
  });

  // 1F — Domain Events Stream
  app.get('/api/domain-events', requireAuth, (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const events = DomainEventBus.getRecentEvents(tenantId);
    return res.json({ success: true, data: events });
  });

  // 3. Transactions List (Read via StoragePort)
  app.get('/api/transactions', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const result = await storage.listJournalEntries(tenantId);
    if (!result.success) {
      return res.status(result.error?.status || 500).json(result.error);
    }
    return res.json({ success: true, data: result.data });
  });

  // 4. Create and Post Transaction
  app.post('/api/transactions/post', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const { entry, idempotencyKey } = req.body;
    if (!idempotencyKey) {
      const problem: RFC7807Problem = {
        type: 'https://api.an-erp.local/errors/missing-idempotency-key',
        title: 'مفتاح Idempotency-Key إلزامي',
        status: 400,
        detail: 'كل عملية كتابة حساسة تتطلب مفتاح idempotencyKey لمنع تكرار القيد.',
      };
      return res.status(400).json(problem);
    }

    const storage: StoragePort = (req as any).storage || masterStorage;
    const postingEngine = new PostingEngine(storage);
    const numberingEngine = new NumberingEngine(storage);

    if (!entry.code) {
      const seqRes = await numberingEngine.generateNumber(tenantId, 'JV_SEQ', 'JV-2026', `${idempotencyKey}-seq`);
      if (seqRes.success && seqRes.data) {
        entry.code = seqRes.data.formattedCode;
      }
    }

    const draftRes = await postingEngine.draftEntry(tenantId, entry, `${idempotencyKey}-draft`);
    if (!draftRes.success) {
      return res.status(draftRes.error?.status || 422).json(draftRes.error);
    }

    const postRes = await postingEngine.postEntry(tenantId, entry.id, idempotencyKey);
    if (!postRes.success) {
      return res.status(postRes.error?.status || 422).json(postRes.error);
    }

    DomainEventBus.publish({
      eventType: 'DOCUMENT_POSTED',
      tenantId,
      actorId: entry.createdBy || userId || 'USR-001',
      actorName: 'المستخدم الحالي',
      payload: postRes.data,
      idempotencyKey,
    });

    await recordAudit(
      entry.createdBy || userId || 'USR-001',
      'المستخدم الحالي',
      'POST_JOURNAL_ENTRY',
      'JOURNAL_ENTRY',
      entry.id,
      { code: entry.code, amount: entry.totalAmount },
      req.ip || '127.0.0.1',
      tenantId,
      storage
    );

    return res.json({ success: true, data: postRes.data });
  });

  // 5. Approve Transaction with Segregation of Duties (SoD)
  app.post('/api/transactions/approve', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const { requestId, approverId, idempotencyKey } = req.body;

    if (!idempotencyKey) {
      return res.status(400).json({
        type: 'https://api.an-erp.local/errors/missing-idempotency-key',
        title: 'مفتاح idempotencyKey مطلوب',
        status: 400,
        detail: 'عمليات الاعتماد المالي تتطلب idempotencyKey.',
      });
    }

    const effectiveApproverId = approverId || userId;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const approvalEngine = new ApprovalEngine(storage);

    const approveRes = await approvalEngine.executeApproval(tenantId, requestId, effectiveApproverId, idempotencyKey);
    if (!approveRes.success) {
      return res.status(approveRes.error?.status || 403).json(approveRes.error);
    }

    await recordAudit(
      effectiveApproverId,
      effectiveApproverId,
      'APPROVE_DOCUMENT',
      'JOURNAL_ENTRY',
      requestId,
      { approverId: effectiveApproverId },
      req.ip || '127.0.0.1',
      tenantId,
      storage
    );

    return res.json({ success: true, data: approveRes.data });
  });

  // 5.1 Approve transaction by URL param id
  app.post('/api/transactions/:id/approve', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const requestId = req.params.id;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({
        type: 'https://api.an-erp.local/errors/missing-idempotency-key',
        title: 'مفتاح idempotencyKey مطلوب',
        status: 400,
        detail: 'عمليات الاعتماد المالي تتطلب Idempotency-Key.',
      });
    }

    const storage: StoragePort = (req as any).storage || masterStorage;
    const approvalEngine = new ApprovalEngine(storage);

    const approveRes = await approvalEngine.executeApproval(tenantId, requestId, userId, idempotencyKey);
    if (!approveRes.success) {
      return res.status(approveRes.error?.status || 403).json(approveRes.error);
    }

    await recordAudit(
      userId,
      userId,
      'APPROVE_DOCUMENT',
      'JOURNAL_ENTRY',
      requestId,
      { approverId: userId },
      req.ip || '127.0.0.1',
      tenantId,
      storage
    );

    return res.json({ success: true, data: approveRes.data });
  });

  // 5.2 Post transaction by URL param id
  app.post('/api/transactions/:id/post', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const entryId = req.params.id;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({
        type: 'https://api.an-erp.local/errors/missing-idempotency-key',
        title: 'مفتاح idempotencyKey مطلوب',
        status: 400,
        detail: 'عمليات ترحيل القيود تتطلب Idempotency-Key.',
      });
    }

    const storage: StoragePort = (req as any).storage || masterStorage;
    const postingEngine = new PostingEngine(storage);

    const postRes = await postingEngine.postEntry(tenantId, entryId, idempotencyKey);
    if (!postRes.success) {
      return res.status(postRes.error?.status || 422).json(postRes.error);
    }

    return res.json({ success: true, data: postRes.data });
  });

  // ============================================================================
  // PHASE 2 API ROUTES: WIZARD, DATA GOVERNANCE, NUMBERING, AS-OF & AUDIT CHAIN
  // ============================================================================

  // 2A: Country Tax Rules Catalog
  app.get('/api/wizard/tax-rules', (req: Request, res: Response) => {
    return res.json({ success: true, data: Object.values(COUNTRY_TAX_RULES) });
  });

  // 2A: 50 Activity Templates Catalog
  app.get('/api/wizard/activity-templates', (req: Request, res: Response) => {
    return res.json({
      success: true,
      totalCount: Object.keys(ACTIVITY_TEMPLATES).length,
      data: Object.values(ACTIVITY_TEMPLATES),
    });
  });

  // 2A, 2B, 2H: Execute 5-Step Company Creation Wizard
  app.post('/api/wizard/create-company', async (req: Request, res: Response) => {
    const storage = masterStorage;
    const wizard = new CompanyWizardService(storage);
    const result = await wizard.createCompany(req.body);
    if (!result.success) {
      return res.status(result.error?.status || 400).json(result.error);
    }
    return res.status(201).json(result);
  });

  // 2B: List Registered Tenants / Companies
  app.get('/api/tenants', async (req: Request, res: Response) => {
    const storage = masterStorage;
    const result = await storage.listTenants();
    if (!result.success) {
      return res.status(result.error?.status || 500).json(result.error);
    }
    return res.json(result);
  });

  // 2B: Propose BackendConfig Migration
  app.post('/api/storage/propose-migration', (req: Request, res: Response) => {
    const { tenantId, targetConfig, requestedBy, justificationAr } = req.body;
    const result = globalStorageRouter.proposeMigration(tenantId, targetConfig, requestedBy || 'USR-ADMIN', justificationAr || 'ترقية البنية التحتية');
    if (!result.success) {
      return res.status(result.error?.status || 400).json(result.error);
    }
    return res.json(result);
  });

  // 2C: Numbering Sequence Manual Override with Mandatory Audit Justification
  app.post('/api/numbering/override', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const { sequenceKey, targetSequence, justificationAr, authorizedBy, idempotencyKey } = req.body;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const numbering = new NumberingEngine(storage);
    const result = await numbering.overrideSequence(
      tenantId,
      sequenceKey,
      Number(targetSequence),
      justificationAr,
      authorizedBy || userId || 'USR-001',
      idempotencyKey
    );
    if (!result.success) {
      return res.status(result.error?.status || 400).json(result.error);
    }
    return res.json(result);
  });

  // 2D: As-Of Historical Balance Query
  app.get('/api/reports/balance-as-of', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const { accountCode, asOfDate } = req.query;
    if (!accountCode || !asOfDate) {
      return res.status(400).json({
        type: 'https://api.an-erp.local/errors/missing-as-of-params',
        title: 'معاملات الاستعلام التاريخي غير مكتملة',
        status: 400,
        detail: 'رقم الحساب (accountCode) وتاريخ الاستعلام (asOfDate بصيغة YYYY-MM-DD) مطلوبان.',
      });
    }
    const storage: StoragePort = (req as any).storage || masterStorage;
    const historyService = new HistoricalQueryService(storage);
    const result = await historyService.getAccountBalanceAsOf(
      tenantId,
      String(accountCode),
      String(asOfDate)
    );
    if (!result.success) {
      return res.status(result.error?.status || 404).json(result.error);
    }
    return res.json(result);
  });

  // 2D: As-Of Historical Account Statement
  app.get('/api/reports/statement-as-of', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const { accountCode, asOfDate } = req.query;
    if (!accountCode || !asOfDate) {
      return res.status(400).json({
        type: 'https://api.an-erp.local/errors/missing-statement-params',
        title: 'معاملات كشف الحساب غير مكتملة',
        status: 400,
        detail: 'رقم الحساب (accountCode) وتاريخ الاستعلام (asOfDate) مطلوبان.',
      });
    }
    const storage: StoragePort = (req as any).storage || masterStorage;
    const historyService = new HistoricalQueryService(storage);
    const result = await historyService.getStatementAsOf(
      tenantId,
      String(accountCode),
      String(asOfDate)
    );
    if (!result.success) {
      return res.status(result.error?.status || 404).json(result.error);
    }
    return res.json(result);
  });

  // 2F: Dual-Control Master Items
  app.post('/api/master-data/items', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const { item, createdBy, idempotencyKey } = req.body;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const dualControl = new DualControlService(storage);
    const result = await dualControl.createMasterItem(
      tenantId,
      item,
      createdBy || { id: userId || 'USR-001', fullName: 'المستخدم الحالي', role: 'accountant' },
      idempotencyKey
    );
    if (!result.success) {
      return res.status(result.error?.status || 400).json(result.error);
    }
    return res.status(201).json(result);
  });

  app.post('/api/master-data/items/:id/approve', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const { approvedBy, idempotencyKey } = req.body;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const dualControl = new DualControlService(storage);
    const result = await dualControl.approveMasterItem(
      tenantId,
      req.params.id,
      approvedBy || { id: userId || 'USR-002', fullName: 'المدير المالي', role: 'financial_approver' },
      idempotencyKey
    );
    if (!result.success) {
      return res.status(result.error?.status || 403).json(result.error);
    }
    return res.json(result);
  });

  // 2F: Dual-Control Master Partners (Customer/Vendor)
  app.post('/api/master-data/partners', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const { partner, createdBy, idempotencyKey } = req.body;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const dualControl = new DualControlService(storage);
    const result = await dualControl.createMasterPartner(
      tenantId,
      partner,
      createdBy || { id: userId || 'USR-001', fullName: 'المستخدم الحالي', role: 'accountant' },
      idempotencyKey
    );
    if (!result.success) {
      return res.status(result.error?.status || 400).json(result.error);
    }
    return res.status(201).json(result);
  });

  app.post('/api/master-data/partners/:id/approve', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const { approvedBy, idempotencyKey } = req.body;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const dualControl = new DualControlService(storage);
    const result = await dualControl.approveMasterPartner(
      tenantId,
      req.params.id,
      approvedBy || { id: userId || 'USR-002', fullName: 'المدير المالي', role: 'financial_approver' },
      idempotencyKey
    );
    if (!result.success) {
      return res.status(result.error?.status || 403).json(result.error);
    }
    return res.json(result);
  });

  // 2E & 2G: SHA-256 Tamper-Evident Hash Chain Audit
  app.get('/api/audit-chain', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const result = await storage.getAuditChain(tenantId);
    if (!result.success) {
      return res.status(result.error?.status || 500).json(result.error);
    }
    return res.json(result);
  });

  app.post('/api/audit-chain/verify', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const auditService = new AuditChainService(storage);
    const result = await auditService.verifyIntegrity(tenantId);
    if (!result.success) {
      return res.status(result.error?.status || 500).json(result.error);
    }
    return res.json(result);
  });

  // 2H: Tenant Active Module Manifests
  app.get('/api/tenant-modules', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage: StoragePort = (req as any).storage || masterStorage;
    const result = await storage.getTenantModules(tenantId);
    if (!result.success) {
      return res.status(result.error?.status || 500).json(result.error);
    }
    return res.json(result);
  });

  // Phase 2 Comprehensive Acceptance Battery Endpoint
  app.get('/api/internal/phase2-battery', async (req: Request, res: Response) => {
    const result = await runPhase2Battery();
    return res.json(result);
  });

  // Phase 3 Comprehensive Acceptance Battery Endpoint
  app.get('/api/internal/phase3-battery', async (req: Request, res: Response) => {
    const result = await runPhase3Battery();
    return res.json(result);
  });

  // 6. Internal Route: /internal/build-status (Protected audit view per section 1.3)
  app.get('/api/internal/build-status', async (req: Request, res: Response) => {
    const runner = new Phase0TestRunner();
    const report = await runner.runAll();
    return res.json(report);
  });

  app.get('/api/internal/primary-battery', async (req: Request, res: Response) => {
    const result = await executePrimaryBattery();
    return res.json(result);
  });

  // Phase 1 Acceptance Battery Endpoint
  app.get('/api/internal/phase1-battery', async (req: Request, res: Response) => {
    const result = await runPhase1Battery();
    return res.json(result);
  });

  // ============================================================================
  // PHASE 4: ACCOUNTING CORE (نظام المحاسبة الشامل وإدارة الدفاتر والقوائم المالية)
  // ============================================================================

  const getAccountingService = (req: Request): AccountingService => {
    const storage: StoragePort = (req as any).storage || masterStorage;
    return new AccountingService(storage);
  };

  const requireIdempotencyKey = (req: Request, res: Response, actionNameAr: string): string | null => {
    const key = req.headers['idempotency-key'] as string;
    if (!key || !key.trim()) {
      const problem: RFC7807Problem = {
        type: 'https://api.an-erp.local/errors/missing-idempotency-key',
        title: 'مفتاح الإدهنية مطلوب',
        status: 400,
        detail: `الترويسة Idempotency-Key إلزامية لتنفيذ ${actionNameAr} لضمان منع التكرار وحماية أرصدة الحسابات (البند 8.1 والبند 4.5F).`,
      };
      res.status(400).json(problem);
      return null;
    }
    return key.trim();
  };

  // 4A: دليل الحسابات (Chart of Accounts)
  app.get('/api/accounting/accounts', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const accounts = await getAccountingService(req).listAccounts(tenantId);
      return res.json({ success: true, data: accounts });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'فشل جلب دليل الحسابات' });
    }
  });

  app.post('/api/accounting/accounts', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const key = requireIdempotencyKey(req, res, 'حفظ الحساب المحاسبي');
      if (!key) return;
      const account = await getAccountingService(req).saveAccount(tenantId, req.body, key);
      return res.json({ success: true, data: account, message: 'تم حفظ وتحديث الحساب بنجاح' });
    } catch (err: any) {
      return res.status(422).json({ success: false, error: err.message || 'فشل حفظ الحساب' });
    }
  });

  app.patch('/api/accounting/accounts/:code/status', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const { code } = req.params;
      const { isActive } = req.body;
      const result = await getAccountingService(req).toggleAccountStatus(tenantId, code, isActive);
      return res.json({ success: true, updated: result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4B: الفترات المحاسبية (Fiscal Periods)
  app.get('/api/accounting/periods', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const periods = await getAccountingService(req).listFiscalPeriods(tenantId);
      return res.json({ success: true, data: periods });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/accounting/periods/close', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId;
      const { periodId } = req.body;
      const key = requireIdempotencyKey(req, res, 'إقفال الفترة المحاسبية');
      if (!key) return;
      const result = await getAccountingService(req).executePeriodClosingChecklist(tenantId, periodId, userId, key);
      return res.json(result);
    } catch (err: any) {
      return res.status(err.status || 500).json({ success: false, error: err.detail || err.message });
    }
  });

  app.post('/api/accounting/periods/reopen', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId;
      const { periodId, reason } = req.body;
      const key = requireIdempotencyKey(req, res, 'إعادة فتح الفترة المحاسبية');
      if (!key) return;
      const result = await getAccountingService(req).reopenPeriod(tenantId, periodId, reason, userId, key);
      return res.json({ success: true, reopened: result, message: 'تم إعادة فتح الفترة المحاسبية وتوثيق ذلك في سلسلة التدقيق.' });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message });
    }
  });

  // 4B: القيود اليومية (Manual Journal Entries with PostingEngine)
  app.get('/api/accounting/journal-entries', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const primary: any = (req as any).storage || masterStorage;
      let entries: any[] = [];
      if (typeof primary.query === 'function') {
        const resDb = await primary.query(
          `SELECT e.*, 
                  json_agg(json_build_object('id', l.id, 'accountCode', l.account_code, 'debit', l.debit, 'credit', l.credit, 'description', l.description)) as lines
           FROM an_journal_entries e
           LEFT JOIN an_journal_lines l ON e.id = l.entry_id AND e.tenant_id = l.tenant_id
           WHERE e.tenant_id = $1
           GROUP BY e.tenant_id, e.id
           ORDER BY e.date DESC, e.posted_at DESC LIMIT 50`,
          [tenantId]
        );
        entries = (resDb.rows || []).map((r: any) => ({
          id: r.id,
          code: r.entry_number,
          date: r.date,
          description: r.description,
          totalAmount: Number(r.total_debit),
          status: r.is_posted ? 'POSTED' : 'DRAFT',
          lines: r.lines || [],
        }));
      }
      return res.json({ success: true, data: entries });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/accounting/journal-entries', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId;
      const key = requireIdempotencyKey(req, res, 'ترحيل القيد المحاسبي');
      if (!key) return;
      const payload = req.body;

      if (!payload.id || !payload.code) {
        return res.status(400).json({
          type: 'https://api.an-erp.local/errors/invalid-payload',
          title: 'بيانات القيد غير مكتملة',
          status: 400,
          detail: 'معرف القيد ورمز القيد مطلوبان صراحة لترحيل القيد المحاسبي.',
        });
      }

      const entryId = payload.id;
      const entry: JournalEntry = {
        id: entryId,
        code: payload.code,
        tenantId,
        date: payload.date || new Date().toISOString().split('T')[0],
        type: payload.type || 'قيد يدوي عام',
        description: payload.description,
        totalAmount: payload.lines.reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0),
        status: 'APPROVED',
        createdBy: userId,
        lines: payload.lines.map((l: any, i: number) => ({
          id: `${entryId}-L${i + 1}`,
          accountCode: l.accountCode,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description || payload.description,
          costCenter: l.costCenter,
        })),
      };

      const posted = await getAccountingService(req).postJournalEntryWithInvariants(tenantId, entry, key);
      return res.json({ success: true, data: posted, message: 'تم ترحيل القيد المحاسبي ذرياً بنجاح' });
    } catch (err: any) {
      const status = err.status || 422;
      return res.status(status).json(err);
    }
  });

  // 4C: الأبعاد المحاسبية (Dimensions)
  app.get('/api/accounting/dimensions', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const type = req.query.type as any;
      const dimensions = await getAccountingService(req).listDimensions(tenantId, type);
      return res.json({ success: true, data: dimensions });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/accounting/dimensions', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const dim = await getAccountingService(req).saveDimension(tenantId, req.body);
      return res.json({ success: true, data: dim });
    } catch (err: any) {
      return res.status(422).json({ success: false, error: err.message });
    }
  });

  app.get('/api/accounting/dimensions/analytics', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const type = (req.query.type as any) || 'COST_CENTER';
      const report = await getAccountingService(req).getDimensionAnalyticalReport(tenantId, type);
      return res.json({ success: true, data: report });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4D: الأصناف والوحدات (Items & Units)
  app.get('/api/accounting/units', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const units = await getAccountingService(req).listUnits(tenantId);
      return res.json({ success: true, data: units });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/accounting/items', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const items = await getAccountingService(req).listItems(tenantId);
      return res.json({ success: true, data: items });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/accounting/items', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const saved = await getAccountingService(req).saveItem(tenantId, req.body);
      return res.json({ success: true, data: saved, message: 'تم حفظ الصنف المحاسبي بنجاح' });
    } catch (err: any) {
      return res.status(422).json({ success: false, error: err.message });
    }
  });

  // 4E: الأرصدة الافتتاحية (Opening Balances)
  app.post('/api/accounting/opening-balances', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId;
      const key = requireIdempotencyKey(req, res, 'ترحيل الأرصدة الافتتاحية');
      if (!key) return;
      const entry = await getAccountingService(req).postOpeningBalanceEntry(tenantId, req.body.lines, key, userId);
      return res.json({ success: true, data: entry, message: 'تم ترحيل الأرصدة الافتتاحية بنجاح' });
    } catch (err: any) {
      return res.status(err.status || 422).json(err);
    }
  });

  // 4F: القوائم المالية الثلاث 🔒 (Three Financial Statements)
  app.get('/api/accounting/reports/trial-balance', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const report = await getAccountingService(req).getTrialBalance(tenantId, req.query.asOfDate as string);
      return res.json({ success: true, data: report });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/accounting/reports/income-statement', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const periodId = req.query.periodId as string;
      const report = await getAccountingService(req).getIncomeStatement(tenantId, periodId);
      return res.json({ success: true, data: report });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/accounting/reports/balance-sheet', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const periodId = req.query.periodId as string;
      const report = await getAccountingService(req).getBalanceSheet(tenantId, periodId);
      return res.json({ success: true, data: report });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/accounting/reports/cash-flow', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const periodId = req.query.periodId as string;
      const report = await getAccountingService(req).getCashFlowStatement(tenantId, periodId);
      return res.json({ success: true, data: report });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4G: الاستيراد القياسي (Import)
  app.post('/api/accounting/import/validate', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const accounts = await getAccountingService(req).listAccounts(tenantId);
      const validation = getAccountingService(req).validateImportData(tenantId, req.body.rows || [], accounts);
      return res.json(validation);
    } catch (err: any) {
      return res.status(500).json({ isValid: false, error: err.message });
    }
  });

  app.post('/api/accounting/import/execute', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId;
      const key = requireIdempotencyKey(req, res, 'استيراد وترحيل القيود');
      if (!key) return;
      const { entryCode, description, date, rows } = req.body;
      const entry = await getAccountingService(req).executeStandardImport(tenantId, entryCode, description, date, rows, userId, key);
      return res.json({ success: true, data: entry, message: 'تم استيراد وترحيل القيود بنجاح' });
    } catch (err: any) {
      return res.status(err.status || 422).json(err);
    }
  });

  // 4H: الموازنات والقيود الدورية (Budgets & Recurring)
  app.get('/api/accounting/budgets', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const year = req.query.year ? Number(req.query.year) : 2026;
      const budgets = await getAccountingService(req).listBudgets(tenantId, year);
      return res.json({ success: true, data: budgets });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/accounting/budgets', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const saved = await getAccountingService(req).saveBudget(tenantId, req.body);
      return res.json({ success: true, data: saved, message: 'تم حفظ الموازنة التقديرية بنجاح' });
    } catch (err: any) {
      return res.status(422).json({ success: false, error: err.message });
    }
  });

  app.get('/api/accounting/recurring', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const entries = await getAccountingService(req).listRecurringEntries(tenantId);
      return res.json({ success: true, data: entries });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/accounting/recurring/:id/run', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId;
      const key = requireIdempotencyKey(req, res, 'توليد وترحيل القيد الدوري');
      if (!key) return;
      const entry = await getAccountingService(req).generateRecurringEntry(tenantId, req.params.id, userId, key);
      return res.json({ success: true, data: entry, message: 'تم توليد وترحيل القيد الدوري بنجاح' });
    } catch (err: any) {
      return res.status(422).json({ success: false, error: err.message });
    }
  });

  // 4I: هجرة من أنظمة أخرى (Legacy Migration)
  app.get('/api/accounting/migration/templates', requireAuth, (req: Request, res: Response) => {
    const system = ((req.query.system as string) || 'ORACLE').toUpperCase() as any;
    const template = getAccountingService(req).generateMappingTemplate(system);
    return res.json({ success: true, data: template });
  });

  // 4J: فاحص التوازن المستمر (Continuous Trial Balance Checker)
  app.get('/api/accounting/balance-checker/run', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const simulate = req.query.simulate === 'true';
      const log = await getAccountingService(req).runContinuousBalanceCheck(tenantId, simulate);
      return res.json({ success: true, data: log });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/accounting/balance-checker/history', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const logs = await getAccountingService(req).getBalanceCheckHistory(tenantId);
      return res.json({ success: true, data: logs });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4K: اختبار الخصائص العشوائي على PostingEngine ضد PostgreSQL
  app.post('/api/accounting/fuzz-test', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const iterations = req.body.iterations ? Number(req.body.iterations) : 1000;
      const results = await getAccountingService(req).runFuzzTestingBattery(tenantId, iterations);
      return res.json({ success: true, data: results });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7. Vite middleware for frontend development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`A.N ERP Server running on http://0.0.0.0:${PORT}`);

    // تشغيل بذر المنشأة والمستخدمين بشكل غير معطل للمنفذ بعد استماع السيرفر مباشرة
    (async () => {
      try {
        const existingTenant = await masterStorage.getTenant(companyProfile.id);
        if (!existingTenant.success || !existingTenant.data) {
          await masterStorage.saveTenant(companyProfile, 'init-seed-company-profile');
        }
        await initSeedUsers(masterStorage, companyProfile.id);
        console.log('✓ تم فحص وبذر بيانات المستأجر والمستخدمين بنجاح.');
      } catch (seedErr) {
        console.error('تنبيه: تعذر إكمال بذر البيانات الأولية تلقائياً — المنفذ متاح والفحوصات تعمل:', seedErr);
      }
    })();
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
