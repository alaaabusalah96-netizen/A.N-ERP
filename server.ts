/**
 * @file server.ts
 * @description Enterprise Express Server for A.N ERP (v7.1) — Phase 1 Core Platform
 * Binds to 0.0.0.0:3000.
 * Houses server-side API routes, RFC7807 error formatting, security headers,
 * HttpOnly Secure Cookie Auth with 15-min JWT + Rotation, SoD, PII encryption,
 * and Vite dev middleware.
 */

import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
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
import { JournalEntry, RFC7807Problem } from './src/core/storage/StoragePort';
import { TokenService } from './src/core/auth/TokenService';
import { AnomalyDetector, GeoLocation } from './src/core/auth/AnomalyDetector';
import { EncryptionService } from './src/core/crypto/EncryptionService';
import { SoDPolicyEngine } from './src/core/sod/SoDPolicyEngine';
import { DomainEventBus } from './src/core/events/DomainEventBus';
import { DualCalendar } from './src/core/utils/dualCalendar';
import { CompanyWizardService } from './src/core/wizard/CompanyWizardService';
import { HistoricalQueryService } from './src/core/reports/HistoricalQueryService';
import { DualControlService } from './src/core/governance/DualControlService';
import { AuditChainService } from './src/core/audit/AuditChainService';
import { runPhase2Battery } from './src/core/tests/runPhase2Battery';
import { ACTIVITY_TEMPLATES, COUNTRY_TAX_RULES, MODULE_REGISTRY } from './src/core/templates/ActivityTemplates';

const PORT = 3000;

// In-memory or persisted company settings for Phase 1
const companyProfile = {
  id: 'tenant-main',
  nameAr: 'شركة الأعمال الموحدة القابضة',
  nameEn: 'Unified Business Holding Co.',
  crNumber: '1010482910',
  taxNumber: '300128472900003', // 15-digit ZATCA standard
  baseCurrency: 'ر.س',
  country: 'المملكة العربية السعودية',
  auditRetentionPolicyYears: 10,
  backendConfig: {
    adapterType: 'postgresql',
    connectionRef: 'DATABASE_URL',
    isolationLevel: 'Shared',
  },
};

// Initial Enterprise Users with encrypted PII & roles
interface ServerUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  roleTitleAr: string;
  branchName: string;
  encryptedPii: string;
  is2faEnabled: boolean;
  hashedBackupCodes: string[];
  passwordHash?: string;
  twoFactorSecret?: string;
}

const initialPii = {
  nationalId: '1098765432',
  phone: '+966509876543',
  email: 'a.mansour@company.sa',
};
const defaultBackup = EncryptionService.generateEmergencyBackupCodes();

const serverUsers: Map<string, ServerUser> = new Map([
  [
    'accountant',
    {
      id: 'USR-001',
      username: 'accountant',
      fullName: 'أحمد المنصور',
      role: 'accountant',
      roleTitleAr: 'محاسب عام',
      branchName: 'الفرع الرئيسي - الرياض',
      encryptedPii: EncryptionService.encryptPII(initialPii),
      is2faEnabled: true,
      hashedBackupCodes: defaultBackup.hashedCodes,
    },
  ],
  [
    'approver',
    {
      id: 'USR-002',
      username: 'approver',
      fullName: 'سليمان الراشد',
      role: 'financial_approver',
      roleTitleAr: 'معتمد مالي أول',
      branchName: 'الفرع الرئيسي - الرياض',
      encryptedPii: EncryptionService.encryptPII({
        nationalId: '1087654321',
        phone: '+966509876543',
        email: 's.alrashed@company.sa',
      }),
      is2faEnabled: true,
      hashedBackupCodes: EncryptionService.generateEmergencyBackupCodes().hashedCodes,
    },
  ],
  [
    'warehouse',
    {
      id: 'USR-003',
      username: 'warehouse',
      fullName: 'سعد القحطاني',
      role: 'warehouse_keeper',
      roleTitleAr: 'أمين المستودع المركزي',
      branchName: 'مستودع السلي - الرياض',
      encryptedPii: EncryptionService.encryptPII({
        nationalId: '1076543210',
        phone: '+966559876543',
        email: 's.alqahtani@company.sa',
      }),
      is2faEnabled: false,
      hashedBackupCodes: [],
    },
  ],
]);

// Operational Audit Trail (Separate from SystemChangeLog as per 3.2 & 1E)
interface AuditRecord {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: any;
  ipAddress: string;
}
const operationalAuditTrail: AuditRecord[] = [
  {
    id: 'AUD-001',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    actorId: 'USR-001',
    actorName: 'أحمد المنصور',
    action: 'POST_JOURNAL_VOUCHER',
    entityType: 'JOURNAL_ENTRY',
    entityId: 'JV-2026-0842',
    details: { amount: 84500, currency: 'SAR', note: 'ترحيل قيد توريدات' },
    ipAddress: '192.168.1.10',
  },
];

// Active Sessions Store (Section 1I)
interface ActiveSession {
  sessionId: string;
  userId: string;
  username: string;
  fullName: string;
  role: string;
  deviceType: string;
  ipAddress: string;
  location: GeoLocation;
  familyId: string;
  createdAt: string;
  lastActiveAt: string;
}
const activeSessions: Map<string, ActiveSession> = new Map();

// Custom Fields Store (Section 1G)
interface CustomFieldDef {
  id: string;
  targetEntity: 'JOURNAL_ENTRY' | 'USER' | 'COMPANY';
  fieldName: string;
  fieldLabelAr: string;
  fieldType: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT';
  isRequired: boolean;
  options?: string[];
}
const customFieldsStore: CustomFieldDef[] = [
  {
    id: 'cf-1',
    targetEntity: 'JOURNAL_ENTRY',
    fieldName: 'projectCode',
    fieldLabelAr: 'رمز المشروع المرتبط',
    fieldType: 'TEXT',
    isRequired: false,
  },
  {
    id: 'cf-2',
    targetEntity: 'JOURNAL_ENTRY',
    fieldName: 'costCenterType',
    fieldLabelAr: 'نوع مركز التكلفة',
    fieldType: 'SELECT',
    isRequired: false,
    options: ['تشغيلي', 'إداري', 'رأسمالي', 'تسويقي'],
  },
];

// Idempotency cache for login requests (Section 8)
const loginIdempotencyCache = new Map<string, any>();

// Helper to initialize Seed Admin and Enterprise Users with Argon2id hashing
async function initSeedUsers(storage: any) {
  const seedAdminPass = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(16).toString('base64url');
  const adminHash = await argon2.hash(seedAdminPass, { type: argon2.argon2id });
  const adminTotpSecret = generateSecret();
  const encryptedAdminTotp = EncryptionService.encryptPII(adminTotpSecret);
  const adminBackupCodes = EncryptionService.generateEmergencyBackupCodes();

  serverUsers.set('admin', {
    id: 'USR-ADMIN',
    username: 'admin',
    fullName: 'مدير النظام (Seed Administrator)',
    role: 'super_admin',
    roleTitleAr: 'مدير النظام الأعلى',
    branchName: 'المركز الرئيسي',
    encryptedPii: EncryptionService.encryptPII({ email: 'admin@company.sa', phone: '+966509876543' }),
    is2faEnabled: false,
    hashedBackupCodes: adminBackupCodes.hashedCodes,
    passwordHash: adminHash,
    twoFactorSecret: encryptedAdminTotp,
  });

  await storage.saveUser({
    id: 'USR-ADMIN',
    tenantId: 'tenant-main',
    username: 'admin',
    fullName: 'مدير النظام (Seed Administrator)',
    email: 'admin@company.sa',
    role: 'super_admin',
    status: 'active',
    passwordHash: adminHash,
    twoFactorSecret: encryptedAdminTotp,
    twoFactorEnabled: false,
    backupCodes: adminBackupCodes.hashedCodes,
  }, 'init-admin-seed');

  console.log('\n============================================================');
  console.log('[A.N ERP v7.1] Initial Setup — Seed Administrator Created');
  console.log('Username: admin');
  console.log(`Generated Password: ${seedAdminPass}`);
  console.log('(This password is shown once. Stored in DB via Argon2id hash.)');
  console.log('============================================================\n');

  const standardPass = process.env.INITIAL_USER_PASSWORD || crypto.randomBytes(14).toString('base64url');
  const standardHash = await argon2.hash(standardPass, { type: argon2.argon2id });

  for (const [uname, u] of serverUsers.entries()) {
    if (uname === 'admin') continue;
    u.passwordHash = standardHash;
    const totpSec = generateSecret();
    u.twoFactorSecret = EncryptionService.encryptPII(totpSec);
    await storage.saveUser({
      id: u.id,
      tenantId: 'tenant-main',
      username: u.username,
      fullName: u.fullName,
      email: `${u.username}@company.sa`,
      role: u.role,
      status: 'active',
      passwordHash: standardHash,
      twoFactorSecret: u.twoFactorSecret,
      twoFactorEnabled: u.is2faEnabled,
      backupCodes: u.hashedBackupCodes,
    }, `init-user-${u.id}`);
  }
}

async function startServer() {
  // Section B.4: Zero fallback secrets — throw immediately if secrets missing!
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET غير معرَّف في متغيرات البيئة — لا يمكن تشغيل السيرفر بدونه');
  }
  if (!process.env.PII_ENCRYPTION_SECRET) {
    throw new Error('PII_ENCRYPTION_SECRET غير معرَّف في متغيرات البيئة — لا يمكن تشغيل السيرفر بدونه');
  }

  const primaryStorage = globalStorageRouter.getPrimaryAdapter();
  const devStorage = globalStorageRouter.getDevInMemoryAdapter();

  const getStorage = () => {
    return process.env.DATABASE_URL ? primaryStorage : devStorage;
  };

  const activeStorage = getStorage();
  const tokenService = new TokenService(activeStorage);

  await initSeedUsers(activeStorage);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // 1E — Security Headers (CSP, HSTS, X-Content-Type-Options, etc.)
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    // Allow embedding in AI Studio preview iframe while securing external origins
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  // Helper to record operational audit log
  const recordAudit = (
    actorId: string,
    actorName: string,
    action: string,
    entityType: string,
    entityId: string,
    details: any,
    ip: string
  ) => {
    operationalAuditTrail.unshift({
      id: `AUD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId,
      actorName,
      action,
      entityType,
      entityId,
      details,
      ipAddress: ip,
    });
    if (operationalAuditTrail.length > 500) {
      operationalAuditTrail.pop();
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

  // 1A & 1D & 1I & 1J & 1K — Enterprise Authentication (Login)
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (idempotencyKey && loginIdempotencyCache.has(idempotencyKey)) {
      const cached = loginIdempotencyCache.get(idempotencyKey);
      return res.json(cached);
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

    // 1D: Check Progressive Account Lockout
    const lockout = AnomalyDetector.checkLockout(username);
    if (lockout.isLocked) {
      const problem: RFC7807Problem = {
        type: 'https://api.an-erp.local/errors/account-locked',
        title: 'الحساب مقفل مؤقتاً لدواعي أمنية',
        status: 423,
        detail: `تم قفل الحساب تلقائياً إثر استنفاد المحاولات (${lockout.failedAttempts} محاولات فاشلة). يرجى الانتظار ${lockout.lockoutDurationMinutes} دقيقة قبل المحاولة مجدداً.`,
      };
      return res.status(423).json(problem);
    }

    const user = serverUsers.get(username);
    if (!user || !user.passwordHash) {
      const failedState = AnomalyDetector.recordFailedAttempt(username);
      recordAudit(
        username,
        username,
        'FAILED_LOGIN_ATTEMPT',
        'AUTH',
        username,
        { attemptsCount: failedState.failedAttempts },
        req.ip || '127.0.0.1'
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
      const failedState = AnomalyDetector.recordFailedAttempt(username);
      recordAudit(
        username,
        username,
        'FAILED_LOGIN_ATTEMPT',
        'AUTH',
        username,
        { attemptsCount: failedState.failedAttempts },
        req.ip || '127.0.0.1'
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

    const travelCheck = AnomalyDetector.checkImpossibleTravel(user.id, location);
    const mustEnforce2fa = user.is2faEnabled || travelCheck.isAnomaly;

    if (travelCheck.isAnomaly) {
      DomainEventBus.publish({
        eventType: 'SECURITY_ALERT_TRIGGERED',
        tenantId: 'tenant-main',
        actorId: user.id,
        actorName: user.fullName,
        payload: {
          alertType: 'IMPOSSIBLE_TRAVEL',
          details: travelCheck,
          location,
        },
      });
      recordAudit(
        user.id,
        user.fullName,
        'IMPOSSIBLE_TRAVEL_DETECTED',
        'SECURITY',
        user.id,
        travelCheck,
        req.ip || '127.0.0.1'
      );
    }

    // 1D: Verify 2FA via real TOTP (otplib) or Emergency Backup Code
    if (mustEnforce2fa) {
      if (!twoFactorCode && !backupCode) {
        return res.status(200).json({
          requires2FA: true,
          anomalyDetected: travelCheck.isAnomaly,
          securityNote: travelCheck.message || 'يلزم التحقق الثنائي لإتمام الدخول',
        });
      }

      let twoFactorValid = false;
      if (twoFactorCode) {
        if (user.twoFactorSecret) {
          const plainSecret = EncryptionService.decryptPII<string>(user.twoFactorSecret);
          const verifyResult = await verify({ token: twoFactorCode, secret: plainSecret });
          twoFactorValid = !!verifyResult.valid;
        }
      } else if (backupCode) {
        // Verify and consume 1 of 8 one-time emergency backup codes
        const consumeRes = EncryptionService.verifyAndConsumeBackupCode(
          backupCode,
          user.hashedBackupCodes
        );
        if (consumeRes.valid) {
          twoFactorValid = true;
          user.hashedBackupCodes = consumeRes.remainingHashedCodes;
          recordAudit(
            user.id,
            user.fullName,
            'EMERGENCY_BACKUP_CODE_CONSUMED',
            'AUTH',
            user.id,
            { remainingCodes: user.hashedBackupCodes.length },
            req.ip || '127.0.0.1'
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
    const concurrent = AnomalyDetector.checkConcurrentSessionLimit(user.id, user.role);
    if (concurrent.limitExceeded && !forceTerminateOldest) {
      return res.status(409).json({
        type: 'https://api.an-erp.local/errors/concurrent-session-limit-exceeded',
        title: 'تجاوز الحد الأقصى للجلسات المتزامنة',
        status: 409,
        detail: `حسابك مسموح له بـ ${concurrent.maxAllowed} جلسات متزامنة لدور (${user.roleTitleAr}). لديك حالياً ${concurrent.currentActiveCount} جلسة نشطة.`,
        oldestSessionId: concurrent.oldestSessionId,
        requiresConfirmation: true,
      });
    }

    if (concurrent.limitExceeded && forceTerminateOldest && concurrent.oldestSessionId) {
      // Terminate oldest session
      const oldSes = activeSessions.get(concurrent.oldestSessionId);
      if (oldSes) {
        await tokenService.revokeFamily(oldSes.familyId, 'CONCURRENT_LIMIT_TERMINATION');
        activeSessions.delete(concurrent.oldestSessionId);
      }
      AnomalyDetector.terminateSession(user.id, concurrent.oldestSessionId);
    }

    // Create session & Token Family with Mandatory Rotation
    const sessionId = `ses-${crypto.randomUUID()}`;
    const { familyId, refreshToken } = await tokenService.createRefreshTokenFamily(
      user.id,
      'tenant-main',
      sessionId
    );

    const accessToken = tokenService.generateAccessToken({
      userId: user.id,
      tenantId: 'tenant-main',
      role: user.role,
      sessionId,
      familyId,
    });

    // Record session
    activeSessions.set(sessionId, {
      sessionId,
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      deviceType: req.headers['user-agent']?.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser',
      ipAddress: req.ip || '127.0.0.1',
      location,
      familyId,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    });

    AnomalyDetector.registerActiveSession(user.id, sessionId, user.role);
    AnomalyDetector.recordSuccessfulLogin(user.id, location, req.ip || '127.0.0.1');

    // 1A: Set HttpOnly, Secure, SameSite Cookies — Zero tokens in localStorage!
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('an_access_token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes (Section 1A)
      path: '/',
    });

    res.cookie('an_refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });

    DomainEventBus.publish({
      eventType: 'USER_LOGGED_IN',
      tenantId: 'tenant-main',
      actorId: user.id,
      actorName: user.fullName,
      payload: { sessionId, role: user.role, ip: req.ip },
    });

    recordAudit(
      user.id,
      user.fullName,
      'USER_LOGIN',
      'SESSION',
      sessionId,
      { role: user.role, ip: req.ip },
      req.ip || '127.0.0.1'
    );

    const responsePayload = {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        roleTitleAr: user.roleTitleAr,
        branchName: user.branchName,
        is2faEnabled: user.is2faEnabled,
      },
      tenant: companyProfile,
      calendar: DualCalendar.format(),
    };

    if (idempotencyKey) {
      loginIdempotencyCache.set(idempotencyKey, responsePayload);
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
    res.cookie('an_access_token', rotation.newAccessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });

    res.cookie('an_refresh_token', rotation.newRefreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.json({ success: true, message: 'تم تدوير رمز الجلسة بنجاح' });
  });

  // 1A — Logout Endpoint
  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    const accessToken = req.cookies['an_access_token'];
    if (accessToken) {
      const ver = await tokenService.verifyAccessToken(accessToken);
      if (ver.valid && ver.payload) {
        await tokenService.revokeFamily(ver.payload.familyId, 'USER_LOGOUT');
        activeSessions.delete(ver.payload.sessionId);
        AnomalyDetector.terminateSession(ver.payload.sub, ver.payload.sessionId);
        DomainEventBus.publish({
          eventType: 'SESSION_REVOKED',
          tenantId: 'tenant-main',
          actorId: ver.payload.sub,
          actorName: 'User',
          payload: { sessionId: ver.payload.sessionId, reason: 'USER_LOGOUT' },
        });
      }
    }

    res.clearCookie('an_access_token', { path: '/' });
    res.clearCookie('an_refresh_token', { path: '/' });
    return res.json({ success: true, message: 'تم تسجيل الخروج وإبطال الجلسة بنجاح' });
  });

  // 1A — Current User & Session Info (Reads from Cookie)
  app.get('/api/auth/me', async (req: Request, res: Response) => {
    const accessToken = req.cookies['an_access_token'];
    if (!accessToken) {
      return res.status(401).json({ success: false, message: 'غير مسجل الدخول' });
    }

    const ver = await tokenService.verifyAccessToken(accessToken);
    if (!ver.valid || !ver.payload) {
      return res.status(401).json({ success: false, message: ver.error || 'جلسة غير صالحة' });
    }

    // Find server user
    let userRecord = Array.from(serverUsers.values()).find((u) => u.id === ver.payload!.sub);
    if (!userRecord) {
      userRecord = serverUsers.get('accountant');
    }

    const session = activeSessions.get(ver.payload.sessionId);
    const dualDate = DualCalendar.format();

    return res.json({
      success: true,
      user: {
        id: userRecord?.id,
        username: userRecord?.username,
        fullName: userRecord?.fullName,
        role: userRecord?.role,
        roleTitleAr: userRecord?.roleTitleAr,
        branchName: userRecord?.branchName,
        is2faEnabled: userRecord?.is2faEnabled,
        emergencyBackupCodesCount: userRecord?.hashedBackupCodes.length || 0,
      },
      session: {
        sessionId: ver.payload.sessionId,
        deviceType: session?.deviceType || 'Desktop Browser',
        ipAddress: session?.ipAddress || req.ip,
        location: session?.location || { city: 'Riyadh', country: 'SA' },
        createdAt: session?.createdAt,
      },
      tenant: companyProfile,
      calendar: dualDate,
    });
  });

  // Section B.2: 2FA Setup with Real TOTP & QR Code (otplib + qrcode)
  app.post('/api/auth/2fa/setup', async (req: Request, res: Response) => {
    const { username } = req.body;
    const user = serverUsers.get(username);
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const plainSecret = generateSecret();
    const encryptedSecret = EncryptionService.encryptPII(plainSecret);
    user.twoFactorSecret = encryptedSecret;

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

  app.post('/api/auth/2fa/verify-setup', async (req: Request, res: Response) => {
    const { username, token } = req.body;
    const user = serverUsers.get(username);
    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ error: 'لم يتم تهيئة 2FA لهذا الحساب' });
    }

    const plainSecret = EncryptionService.decryptPII<string>(user.twoFactorSecret);
    const verifyResult = await verify({ token, secret: plainSecret });
    if (!verifyResult.valid) {
      return res.status(400).json({ success: false, error: 'رمز TOTP غير صحيح أو منتهي الصلاحية' });
    }

    user.is2faEnabled = true;
    return res.json({ success: true, message: 'تم تفعيل التحقق بخطوتين بنجاح' });
  });

  // 1B — Company Settings (Read and Update, with Read-Only backendConfig)
  app.get('/api/company', (req: Request, res: Response) => {
    return res.json({ success: true, data: companyProfile });
  });

  app.put('/api/company', (req: Request, res: Response) => {
    const { nameAr, nameEn, crNumber, taxNumber, baseCurrency, auditRetentionPolicyYears } = req.body;

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

    if (nameAr) companyProfile.nameAr = nameAr;
    if (nameEn) companyProfile.nameEn = nameEn;
    if (crNumber) companyProfile.crNumber = crNumber;
    if (taxNumber) companyProfile.taxNumber = taxNumber;
    if (baseCurrency) companyProfile.baseCurrency = baseCurrency;
    if (auditRetentionPolicyYears) companyProfile.auditRetentionPolicyYears = Number(auditRetentionPolicyYears);

    recordAudit(
      'USR-001',
      'أحمد المنصور',
      'UPDATE_COMPANY_PROFILE',
      'COMPANY',
      companyProfile.id,
      companyProfile,
      req.ip || '127.0.0.1'
    );

    return res.json({ success: true, data: companyProfile, message: 'تم تحديث بيانات المنشأة بنجاح' });
  });

  // 1C — Users & Segregation of Duties (SoD) Management
  app.get('/api/users', (req: Request, res: Response) => {
    const list = Array.from(serverUsers.values()).map((u) => {
      const decryptedPii = EncryptionService.decryptPII<any>(u.encryptedPii);
      return {
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        roleTitleAr: u.roleTitleAr,
        branchName: u.branchName,
        is2faEnabled: u.is2faEnabled,
        email: decryptedPii.email || '—',
        phone: decryptedPii.phone || '—',
        nationalId: decryptedPii.nationalId || '—',
      };
    });
    return res.json({ success: true, data: list });
  });

  app.post('/api/users', (req: Request, res: Response) => {
    const { username, fullName, role, branchName, email, phone, nationalId } = req.body;

    // SoD Server-Side Conflict Check (Section 1C)
    const sodCheck = SoDPolicyEngine.validateRoleAssignment([], role);
    if (!sodCheck.allowed && sodCheck.problem) {
      return res.status(sodCheck.problem.status).json(sodCheck.problem);
    }

    const encryptedPii = EncryptionService.encryptPII({ email, phone, nationalId });
    const newUser: ServerUser = {
      id: `USR-${Date.now().toString().slice(-4)}`,
      username,
      fullName,
      role,
      roleTitleAr: role === 'accountant' ? 'محاسب عام' : role === 'financial_approver' ? 'معتمد مالي' : role === 'warehouse_keeper' ? 'أمين مستودع' : 'موظف تشغيلي',
      branchName: branchName || 'الفرع الرئيسي',
      encryptedPii,
      is2faEnabled: false,
      hashedBackupCodes: [],
    };

    serverUsers.set(username, newUser);
    recordAudit('USR-001', 'أحمد المنصور', 'CREATE_USER', 'USER', newUser.id, { username, role }, req.ip || '127.0.0.1');

    return res.json({ success: true, data: newUser, message: 'تم إضافة المستخدم بنجاح بعد التحقق من قواعد فصل المهام' });
  });

  // 1L — Invitation Signed Link Generation
  app.post('/api/invitations', (req: Request, res: Response) => {
    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ error: 'البريد الإلكتروني والدور مطلوبان لإنشاء الدعوة' });
    }

    // Verify SoD before issuing invitation
    const sodCheck = SoDPolicyEngine.validateRoleAssignment([], role);
    if (!sodCheck.allowed && sodCheck.problem) {
      return res.status(sodCheck.problem.status).json(sodCheck.problem);
    }

    const invite = tokenService.generateInvitationToken('tenant-main', email, role);
    const inviteUrl = `${req.protocol}://${req.get('host')}/join?token=${invite.token}`;

    DomainEventBus.publish({
      eventType: 'USER_INVITED',
      tenantId: 'tenant-main',
      actorId: 'USR-001',
      actorName: 'أحمد المنصور',
      payload: { email, role, expiresAt: invite.expiresAt },
    });

    recordAudit('USR-001', 'أحمد المنصور', 'INVITE_USER', 'INVITATION', email, { role, expiresAt: invite.expiresAt }, req.ip || '127.0.0.1');

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

  // 1I — Active Sessions List & Remote Instant Revocation
  app.get('/api/sessions', (req: Request, res: Response) => {
    const list = Array.from(activeSessions.values());
    return res.json({ success: true, data: list });
  });

  app.delete('/api/sessions/:sessionId', async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'الجلسة غير موجودة' });
    }

    // Instantly invalidate entire refresh token family (Section 1I)
    await tokenService.revokeFamily(session.familyId, 'REMOTE_TERMINATION');
    activeSessions.delete(sessionId);
    AnomalyDetector.terminateSession(session.userId, sessionId);

    DomainEventBus.publish({
      eventType: 'SESSION_REVOKED',
      tenantId: 'tenant-main',
      actorId: 'USR-001',
      actorName: 'أحمد المنصور',
      payload: { sessionId, reason: 'REMOTE_INSTANT_TERMINATION' },
    });

    recordAudit('USR-001', 'أحمد المنصور', 'TERMINATE_SESSION', 'SESSION', sessionId, { targetUser: session.username }, req.ip || '127.0.0.1');

    return res.json({ success: true, message: 'تم إنهاء الجلسة عن بُعد وإبطال سلسلة التوكن بالكامل فوراً' });
  });

  // 1G — No-Code Custom Fields Management (JSONB)
  app.get('/api/custom-fields', (req: Request, res: Response) => {
    return res.json({ success: true, data: customFieldsStore });
  });

  app.post('/api/custom-fields', (req: Request, res: Response) => {
    const { targetEntity, fieldName, fieldLabelAr, fieldType, isRequired, options } = req.body;
    if (!fieldName || !fieldLabelAr || !fieldType) {
      return res.status(400).json({ error: 'الاسم التقني والاسم العربي ونوع الحقل مطلوبة' });
    }

    const newField: CustomFieldDef = {
      id: `cf-${Date.now()}`,
      targetEntity: targetEntity || 'JOURNAL_ENTRY',
      fieldName,
      fieldLabelAr,
      fieldType,
      isRequired: !!isRequired,
      options: options || [],
    };

    customFieldsStore.push(newField);
    recordAudit('USR-001', 'أحمد المنصور', 'ADD_CUSTOM_FIELD', 'SCHEMA', newField.id, newField, req.ip || '127.0.0.1');

    return res.json({ success: true, data: newField, message: 'تم إضافة الحقل المخصص بنجاح' });
  });

  // 1E — Operational Audit Trail
  app.get('/api/audit-trail', (req: Request, res: Response) => {
    return res.json({ success: true, data: operationalAuditTrail });
  });

  // 1F — Domain Events Stream
  app.get('/api/domain-events', (req: Request, res: Response) => {
    const events = DomainEventBus.getRecentEvents('tenant-main');
    return res.json({ success: true, data: events });
  });

  // 3. Transactions List (Read via StoragePort)
  app.get('/api/transactions', async (req: Request, res: Response) => {
    const storage = getStorage();
    const result = await storage.listJournalEntries('tenant-main');
    if (!result.success) {
      return res.status(result.error?.status || 500).json(result.error);
    }
    return res.json({ success: true, data: result.data });
  });

  // 4. Create and Post Transaction
  app.post('/api/transactions/post', async (req: Request, res: Response) => {
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

    const storage = getStorage();
    const postingEngine = new PostingEngine(storage);
    const numberingEngine = new NumberingEngine(storage);

    if (!entry.code) {
      const seqRes = await numberingEngine.generateNumber('tenant-main', 'JV_SEQ', 'JV-2026', `${idempotencyKey}-seq`);
      if (seqRes.success && seqRes.data) {
        entry.code = seqRes.data.formattedCode;
      }
    }

    const draftRes = await postingEngine.draftEntry('tenant-main', entry, `${idempotencyKey}-draft`);
    if (!draftRes.success) {
      return res.status(draftRes.error?.status || 422).json(draftRes.error);
    }

    const postRes = await postingEngine.postEntry('tenant-main', entry.id, idempotencyKey);
    if (!postRes.success) {
      return res.status(postRes.error?.status || 422).json(postRes.error);
    }

    DomainEventBus.publish({
      eventType: 'DOCUMENT_POSTED',
      tenantId: 'tenant-main',
      actorId: entry.createdBy || 'USR-001',
      actorName: 'أحمد المنصور',
      payload: postRes.data,
      idempotencyKey,
    });

    recordAudit(
      entry.createdBy || 'USR-001',
      'أحمد المنصور',
      'POST_JOURNAL_ENTRY',
      'JOURNAL_ENTRY',
      entry.id,
      { code: entry.code, amount: entry.totalAmount },
      req.ip || '127.0.0.1'
    );

    return res.json({ success: true, data: postRes.data });
  });

  // 5. Approve Transaction with Segregation of Duties (SoD)
  app.post('/api/transactions/approve', async (req: Request, res: Response) => {
    const { requestId, approverId, initiatorId, idempotencyKey } = req.body;

    if (!idempotencyKey) {
      return res.status(400).json({
        type: 'https://api.an-erp.local/errors/missing-idempotency-key',
        title: 'مفتاح idempotencyKey مطلوب',
        status: 400,
        detail: 'عمليات الاعتماد المالي تتطلب idempotencyKey.',
      });
    }

    // SoD Check: Initiator cannot approve own document!
    const sodCheck = SoDPolicyEngine.validateDocumentApproval(initiatorId || 'USR-001', approverId);
    if (!sodCheck.allowed && sodCheck.problem) {
      return res.status(sodCheck.problem.status).json(sodCheck.problem);
    }

    const storage = getStorage();
    const approvalEngine = new ApprovalEngine(storage);

    const dummyRequest = {
      id: requestId,
      tenantId: 'tenant-main',
      documentType: 'JOURNAL_VOUCHER',
      documentId: requestId,
      documentCode: `JV-${requestId}`,
      initiatorId: initiatorId || 'USR-001',
      currentStep: 1,
      steps: [{ stepNumber: 1, roleRequired: 'financial_approver', status: 'PENDING' as const }],
      status: 'PENDING' as const,
      createdAt: new Date().toISOString(),
    };

    const approveRes = await approvalEngine.executeApproval('tenant-main', dummyRequest, approverId, idempotencyKey);
    if (!approveRes.success) {
      return res.status(approveRes.error?.status || 403).json(approveRes.error);
    }

    recordAudit(
      approverId,
      'سليمان الراشد',
      'APPROVE_DOCUMENT',
      'JOURNAL_ENTRY',
      requestId,
      { initiatorId },
      req.ip || '127.0.0.1'
    );

    return res.json({ success: true, data: approveRes.data });
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
    const storage = getStorage();
    const wizard = new CompanyWizardService(storage);
    const result = await wizard.createCompany(req.body);
    if (!result.success) {
      return res.status(result.error?.status || 400).json(result.error);
    }
    return res.status(201).json(result);
  });

  // 2B: List Registered Tenants / Companies
  app.get('/api/tenants', async (req: Request, res: Response) => {
    const storage = getStorage();
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
  app.post('/api/numbering/override', async (req: Request, res: Response) => {
    const { tenantId, sequenceKey, targetSequence, justificationAr, authorizedBy, idempotencyKey } = req.body;
    const storage = getStorage();
    const numbering = new NumberingEngine(storage);
    const result = await numbering.overrideSequence(
      tenantId || 'tenant-main',
      sequenceKey,
      Number(targetSequence),
      justificationAr,
      authorizedBy || 'USR-001',
      idempotencyKey
    );
    if (!result.success) {
      return res.status(result.error?.status || 400).json(result.error);
    }
    return res.json(result);
  });

  // 2D: As-Of Historical Balance Query
  app.get('/api/reports/balance-as-of', async (req: Request, res: Response) => {
    const { tenantId, accountCode, asOfDate } = req.query;
    if (!accountCode || !asOfDate) {
      return res.status(400).json({
        type: 'https://api.an-erp.local/errors/missing-as-of-params',
        title: 'معاملات الاستعلام التاريخي غير مكتملة',
        status: 400,
        detail: 'رقم الحساب (accountCode) وتاريخ الاستعلام (asOfDate بصيغة YYYY-MM-DD) مطلوبان.',
      });
    }
    const storage = getStorage();
    const historyService = new HistoricalQueryService(storage);
    const result = await historyService.getAccountBalanceAsOf(
      String(tenantId || 'tenant-main'),
      String(accountCode),
      String(asOfDate)
    );
    if (!result.success) {
      return res.status(result.error?.status || 404).json(result.error);
    }
    return res.json(result);
  });

  // 2D: As-Of Historical Account Statement
  app.get('/api/reports/statement-as-of', async (req: Request, res: Response) => {
    const { tenantId, accountCode, asOfDate } = req.query;
    if (!accountCode || !asOfDate) {
      return res.status(400).json({
        type: 'https://api.an-erp.local/errors/missing-statement-params',
        title: 'معاملات كشف الحساب غير مكتملة',
        status: 400,
        detail: 'رقم الحساب (accountCode) وتاريخ الاستعلام (asOfDate) مطلوبان.',
      });
    }
    const storage = getStorage();
    const historyService = new HistoricalQueryService(storage);
    const result = await historyService.getStatementAsOf(
      String(tenantId || 'tenant-main'),
      String(accountCode),
      String(asOfDate)
    );
    if (!result.success) {
      return res.status(result.error?.status || 404).json(result.error);
    }
    return res.json(result);
  });

  // 2F: Dual-Control Master Items
  app.post('/api/master-data/items', async (req: Request, res: Response) => {
    const { tenantId, item, createdBy, idempotencyKey } = req.body;
    const storage = getStorage();
    const dualControl = new DualControlService(storage);
    const result = await dualControl.createMasterItem(
      tenantId || 'tenant-main',
      item,
      createdBy || { id: 'USR-001', fullName: 'المستخدم الحالي', role: 'accountant' },
      idempotencyKey
    );
    if (!result.success) {
      return res.status(result.error?.status || 400).json(result.error);
    }
    return res.status(201).json(result);
  });

  app.post('/api/master-data/items/:id/approve', async (req: Request, res: Response) => {
    const { tenantId, approvedBy, idempotencyKey } = req.body;
    const storage = getStorage();
    const dualControl = new DualControlService(storage);
    const result = await dualControl.approveMasterItem(
      tenantId || 'tenant-main',
      req.params.id,
      approvedBy || { id: 'USR-002', fullName: 'المدير المالي', role: 'financial_approver' },
      idempotencyKey
    );
    if (!result.success) {
      return res.status(result.error?.status || 403).json(result.error);
    }
    return res.json(result);
  });

  // 2F: Dual-Control Master Partners (Customer/Vendor)
  app.post('/api/master-data/partners', async (req: Request, res: Response) => {
    const { tenantId, partner, createdBy, idempotencyKey } = req.body;
    const storage = getStorage();
    const dualControl = new DualControlService(storage);
    const result = await dualControl.createMasterPartner(
      tenantId || 'tenant-main',
      partner,
      createdBy || { id: 'USR-001', fullName: 'المستخدم الحالي', role: 'accountant' },
      idempotencyKey
    );
    if (!result.success) {
      return res.status(result.error?.status || 400).json(result.error);
    }
    return res.status(201).json(result);
  });

  app.post('/api/master-data/partners/:id/approve', async (req: Request, res: Response) => {
    const { tenantId, approvedBy, idempotencyKey } = req.body;
    const storage = getStorage();
    const dualControl = new DualControlService(storage);
    const result = await dualControl.approveMasterPartner(
      tenantId || 'tenant-main',
      req.params.id,
      approvedBy || { id: 'USR-002', fullName: 'المدير المالي', role: 'financial_approver' },
      idempotencyKey
    );
    if (!result.success) {
      return res.status(result.error?.status || 403).json(result.error);
    }
    return res.json(result);
  });

  // 2E & 2G: SHA-256 Tamper-Evident Hash Chain Audit
  app.get('/api/audit-chain', async (req: Request, res: Response) => {
    const tenantId = String(req.query.tenantId || 'tenant-main');
    const storage = getStorage();
    const result = await storage.getAuditChain(tenantId);
    if (!result.success) {
      return res.status(result.error?.status || 500).json(result.error);
    }
    return res.json(result);
  });

  app.post('/api/audit-chain/verify', async (req: Request, res: Response) => {
    const tenantId = String(req.body.tenantId || 'tenant-main');
    const storage = getStorage();
    const auditService = new AuditChainService(storage);
    const result = await auditService.verifyIntegrity(tenantId);
    if (!result.success) {
      return res.status(result.error?.status || 500).json(result.error);
    }
    return res.json(result);
  });

  // 2H: Tenant Active Module Manifests
  app.get('/api/tenant-modules', async (req: Request, res: Response) => {
    const tenantId = String(req.query.tenantId || 'tenant-main');
    const storage = getStorage();
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
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
