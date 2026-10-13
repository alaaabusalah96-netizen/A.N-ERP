/**
 * @file server.ts
 * @description Enterprise Express Server for A.N ERP (v7.1) — Phase 1 Core Platform
 * Binds to 0.0.0.0:3000.
 * Houses server-side API routes, RFC7807 error formatting, security headers,
 * HttpOnly Secure Cookie Auth with 15-min JWT + Rotation, SoD, PII encryption,
 * and Vite dev middleware.
 */

import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { resolveCspProfile, resolveTrustProxy, parseFuzzIterations } from './src/core/security/runtimeSecurity';
import { publicErrorMessage } from './src/core/security/publicError';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import argon2 from 'argon2';
import { generateSecret, verify, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { TwoFactorService } from './src/core/auth/TwoFactorService';
import { createServer as createViteServer } from 'vite';
import { Phase0TestRunner } from './src/core/tests/Phase0TestRunner';
import { executePrimaryBattery } from './src/core/tests/runPrimaryBattery';
import { runPhase1Battery } from './src/core/tests/runPhase1Battery';
import { globalStorageRouter } from './src/core/storage/StorageRouter';
import { PostingEngine } from './src/core/engines/PostingEngine';
import { seedStandardsCatalogue } from './src/core/standards/seedCatalogue';
import { RuleExplanationService } from './src/core/standards/RuleExplanationService';
import { StandardsDecisionService } from './src/core/standards/StandardsDecisionService';
import { ApprovalEngine } from './src/core/engines/ApprovalEngine';
import { NumberingEngine } from './src/core/engines/NumberingEngine';
import { JournalEntry, RFC7807Problem, User, ActiveSessionRecord, StoragePort, CompanyProfile, TenantCompany, CustomFieldDefinition } from './src/core/storage/StoragePort';
import { TokenService } from './src/core/auth/TokenService';
import { AnomalyDetector, GeoLocation, loginLockKey } from './src/core/auth/AnomalyDetector';
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
import { runPhase46Battery } from './src/core/tests/runPhase4_6Battery';
import { runPhase5Battery } from './src/core/tests/runPhase5Battery';
import { runPhase6Battery } from './src/core/tests/runPhase6Battery';
import { CashCustodyService } from './src/core/modules/custody/CashCustodyService';
import { ExpenseService } from './src/core/modules/expenses/ExpenseService';
import { InventoryService } from './src/core/inventory/InventoryService';
import { PurchasingService } from './src/core/purchasing/PurchasingService';
import { SEED_COMPANY_PROFILE, seedOnlyInitialBootstrap, seedKey, SEED_TENANT_ID } from './src/core/seed/seedOnly';
import { runPhase7Battery } from './src/core/inventory/Phase7Battery';
import { ACTIVITY_TEMPLATES, COUNTRY_TAX_RULES, MODULE_REGISTRY } from './src/core/templates/ActivityTemplates';
import { AccountingService } from './src/core/accounting/AccountingService';
import { TenantResolutionService } from './src/core/tenant/TenantResolutionService';
import { UnifiedPrintService } from './src/core/printing/UnifiedPrintService';
import { requirePermission, hasPermission, PermissionGroup } from './src/core/auth/PermissionMatrix';
import { requestContextALS } from './src/core/context/RequestContext';
import { parseIsoDate, parseNonNegativeMoney, validationError, validateJournalInput, type ParseResult, parseSafeFileUrl, parseSafeFileName, parseSafeMimeType, parseAttachmentSize, ATTACHMENT_LIMITS } from './src/core/utils/validation';

// Wave 0: Security Hardening — Strict Environment Secrets Enforcement
export function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    throw new Error(`المتغيّر ${name} غير معرَّف في البيئة — لا يمكن تشغيل السيرفر بدونه`);
  }
  return val;
}

// Wave 0: Version Synchronization (Single source of truth from package.json)
const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
export const APP_VERSION = packageJson.version || '7.2.0';

/**
 * Wave 7.5B & Section 3.5: Standard Cookie Security Policy
 * The default and mandatory value is sameSite='strict'.
 * sameSite='none' is strictly forbidden unless explicitly enabled via ALLOW_IFRAME_EMBEDDING=true
 * and the request verified to be within an iframe context.
 */
export function resolveCookieSameSite(req: Request): 'strict' | 'none' {
  const allowIframe = process.env.ALLOW_IFRAME_EMBEDDING === 'true';
  const isIframe = req.headers['sec-fetch-dest'] === 'iframe' || req.headers['sec-fetch-site'] === 'cross-site';
  if (allowIframe && isIframe) {
    return 'none';
  }
  return 'strict';
}

// Ensure all 6 mandatory security secrets are strictly provided at server boot
requireEnv('SEED_ADMIN_PASSWORD');
requireEnv('INITIAL_USER_PASSWORD');
requireEnv('RESET_USER_PASSWORD');
requireEnv('E2E_TEST_PASSWORD');
requireEnv('JWT_SECRET');
requireEnv('PII_ENCRYPTION_SECRET');

const PORT = Number(process.env.PORT) || 3000;

// Initial company seed settings for primary setup (Phase 0 / Phase 1)
const companyProfile: TenantCompany = SEED_COMPANY_PROFILE;

// Helper to initialize Seed Admin and Enterprise Users with Argon2id hashing directly via StoragePort
async function initSeedUsers(storage: StoragePort, tenantId: string = companyProfile.id) {
  const seedForceReset = process.env.SEED_FORCE_RESET === 'true';
  const seedAdminPass = requireEnv('SEED_ADMIN_PASSWORD');
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

    await storage.saveUser(adminUser, seedKey('admin'), true);

    console.log('[seed] admin created from environment credentials; 2FA is not enabled');
  } else {
    if (seedForceReset) {
      await storage.updateUser(existingAdmin.data.id, {
        passwordHash: adminHash,
        status: 'ACTIVE',
      });
      console.log('[seed] admin reset by SEED_FORCE_RESET');
    }
  }

  // Standard operational users for business operation
  const standardPass = requireEnv('INITIAL_USER_PASSWORD');
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
      await storage.saveUser(u, seedKey(`user-${u.id}`), true);
    } else {
      if (seedForceReset) {
        await storage.updateUser(check.data.id, {
          passwordHash: u.passwordHash,
          status: 'ACTIVE',
        });
        console.log(`[seed] ${u.username} reset by SEED_FORCE_RESET`);
      }
    }
  }
}

async function startServer() {
  // SEC-3: refuse silent InMemory fallback in production (or when AN_REQUIRE_DATABASE=1)
  const requireDatabase =
    process.env.AN_REQUIRE_DATABASE === '1' ||
    (process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (requireDatabase && !process.env.DATABASE_URL) {
    console.error(
      '[SEC-3] Refusing to start: DATABASE_URL is required when NODE_ENV=production or AN_REQUIRE_DATABASE=1. Silent InMemory fallback is not allowed.'
    );
    process.exit(1);
  }

  // SEC-PROD-ROLE: refuse start when enforce=1 and the connection role bypasses RLS
  if (process.env.AN_ENFORCE_PROD_ROLE === '1' && process.env.DATABASE_URL) {
    try {
      const { cleanPgConnectionString } = await import('./src/core/security/pgAppRoleGuard');
      const pgMod = await import('pg');
      const client = new pgMod.Client({ connectionString: cleanPgConnectionString(process.env.DATABASE_URL) });
      await client.connect();
      const roleRes = await client.query(
        `SELECT current_user AS u, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
      );
      await client.end();
      const row = roleRes.rows[0] || {};
      if (row.rolsuper === true || row.rolbypassrls === true) {
        console.error(
          `[SEC-PROD-ROLE] Refusing to start: role "${row.u}" bypasses RLS ` +
            `(rolsuper=${row.rolsuper}, rolbypassrls=${row.rolbypassrls}). ` +
            `Use NOSUPERUSER NOBYPASSRLS — docs/ops/PROD-PG-ROLE.md`,
        );
        process.exit(1);
      }
      console.log(`[SEC-PROD-ROLE] App role subject to RLS (user=${row.u})`);
    } catch (e) {
      console.error('[SEC-PROD-ROLE] Refusing to start: could not verify application DB role under AN_ENFORCE_PROD_ROLE=1', e);
      process.exit(1);
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

  // SEC-A: behind Cloud Run / a reverse proxy the client IP comes from X-Forwarded-For. Without this every client shares the
  // proxy's IP and rate limits/lockouts hit everyone at once. Never "trust all": explicit TRUST_PROXY, or 1 hop on Cloud Run.
  const trustProxy = resolveTrustProxy(process.env);
  if (trustProxy.value !== undefined) app.set('trust proxy', trustProxy.value);
  console.log(`[SEC] trust proxy = ${String(trustProxy.value)} (${trustProxy.source})`);

  // Wave 0 / SEC-A: CSP profile is strict by default whenever NODE_ENV=production; CSP_PROFILE can still override explicitly.
  const cspResolved = resolveCspProfile(process.env);
  const cspProfile = cspResolved.profile;
  if (cspResolved.warning) console.warn(`[SEC] ${cspResolved.warning}`);
  console.log(`[SEC] CSP profile = ${cspProfile} (${cspResolved.source})`);
  const isCspProduction = cspProfile === 'production';

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isCspProduction ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'https://*.google.com', 'https://*.run.app', 'https://*.aistudio.google.com', 'https://ai.studio'],
        frameAncestors: isCspProduction ? ["'none'"] : ["'self'", 'https://*.google.com', 'https://*.run.app', 'https://*.aistudio.google.com', 'https://ai.studio'],
      },
    },
    frameguard: isCspProduction ? { action: 'deny' } : false,
    crossOriginEmbedderPolicy: false, // لمنع كسر تحميل الخطوط الخارجية
  }));

  app.use(express.json());
  app.use(cookieParser());

  // INV-001: Request Context ALS for Idempotency Request Hash computation
  app.use((req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = (req.headers['idempotency-key'] as string | undefined) || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      return next();
    }
    const sortKeys = (obj: any): any => {
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(sortKeys);
      return Object.keys(obj).sort().reduce((acc: any, k) => {
        acc[k] = sortKeys(obj[k]);
        return acc;
      }, {});
    };
    const canonical = JSON.stringify(sortKeys(req.body || {})) + ':' + req.method + ':' + (req.baseUrl || '') + req.path;
    const hash = crypto.createHash('sha256').update(canonical).digest('hex');
    requestContextALS.run({ requestHash: hash }, () => next());
  });

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

  // Wave 7.5H & v7.3 Clause 18: Structured Logging, Correlation Tracing & Observability
  const latencySamples: number[] = [];
  function getP95Latency(samples: number[]): number {
    if (samples.length === 0) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return Math.round(sorted[index] * 100) / 100;
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    const traceId = (req.headers['x-trace-id'] as string) || `trc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    (req as any).traceId = traceId;
    res.setHeader('x-trace-id', traceId);

    const start = performance.now();
    res.on('finish', () => {
      const duration = performance.now() - start;
      if (latencySamples.length > 500) latencySamples.shift();
      latencySamples.push(duration);

      if (req.path.startsWith('/api') && !req.path.startsWith('/api/health')) {
        if (res.statusCode >= 400) {
          console.warn(`[API-WARN][${traceId}] ${req.method} ${req.path} -> ${res.statusCode} (${Math.round(duration * 100) / 100}ms)`);
        }
      }
    });
    next();
  });

  // 1E — Security Headers (CSP, HSTS, X-Content-Type-Options, etc.)
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // 4.6A: Strict Storage & Tenant Request Resolvers — No Silent Fallbacks Allowed
  function getRequestStorage(req: Request, res: Response): StoragePort | null {
    const storage = (req as any).storage as StoragePort;
    if (!storage) {
      res.status(500).json({
        type: 'https://api.an-erp.local/errors/missing-storage-context',
        title: 'سياق التخزين مفقود',
        status: 500,
        detail: 'تعذر تحديد محوّل التخزين الخاص بهذه المنشأة (ممنوع السقوط الصامت على المخزن الافتراضي وفق البند 4.6A).',
      });
      return null;
    }
    return storage;
  }

  function getRequestTenant(req: Request, res: Response): TenantCompany | null {
    const tenant = (req as any).tenant as TenantCompany;
    if (!tenant) {
      res.status(500).json({
        type: 'https://api.an-erp.local/errors/missing-tenant-context',
        title: 'سياق المنشأة مفقود',
        status: 500,
        detail: 'تعذر تحديد سياق المنشأة الحالية (ممنوع السقوط الصامت على المنشأة الافتراضية وفق البند 4.6A).',
      });
      return null;
    }
    return tenant;
  }

  // 4.6G: CSRF & Origin Defense-in-Depth for State-Changing Requests (ADR 007)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const method = req.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const origin = req.headers['origin'] as string;
      const host = req.headers['host'] as string;

      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host) {
            // Must have custom anti-CSRF header
            const hasCustomHeader =
              req.headers['idempotency-key'] ||
              req.headers['x-requested-with'] ||
              req.headers['authorization'];
            if (!hasCustomHeader) {
              const problem: RFC7807Problem = {
                type: 'https://api.an-erp.local/errors/csrf-violation',
                title: 'انتهاك حماية CSRF',
                status: 403,
                detail: 'تم رفض الطلب الخارجي غير المصرح به لافتقاره إلى ترويسة مخصصة (ADR 007 والبند 4.6G).',
              };
              return res.status(403).json(problem);
            }
          }
        } catch (e) {
          console.error(JSON.stringify({ level: 'CRITICAL', op: 'csrf_validation', trace: crypto.randomUUID(), err: String(e) }));
        }
      }
    }
    next();
  });

  // Phase 6 (HYGIENE-001): append a SystemChangeLog entry for an administrative action.
  // Never carries passwords, tokens, invite links or personal data; a failure is logged and never fails the request.
  const logSystemChange = async (
    storage: StoragePort,
    actor: string,
    changeType: 'SECURITY' | 'NUMBERING_OVERRIDE' | 'PLATFORM_MANAGEMENT',
    module: 'USERS' | 'INVITATIONS' | 'COMPANY' | 'NUMBERING' | 'CUSTOM_FIELDS',
    entitiesAffected: string[],
    summaryAr: string
  ): Promise<void> => {
    try {
      const r = await storage.appendSystemChangeLog({
        id: `LOG-${module}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
        timestamp: new Date().toISOString(),
        actor,
        changeType,
        module,
        entitiesAffected,
        summaryAr,
        version: '1',
      });
      if (!r.success) console.error('[audit] system change log failed:', (r as any).error?.title || 'storage error');
    } catch (e: any) {
      console.error('[audit] system change log failed:', e?.message);
    }
  };

  // Helper to record operational audit log (scoped strictly to provided storage & tenant)
  const recordAudit = async (
    actorId: string,
    actorName: string,
    action: string,
    entityType: string,
    entityId: string,
    details: any,
    ip: string,
    tenantId?: string,
    storage?: StoragePort
  ) => {
    try {
      const activePort = storage;
      if (!activePort || !tenantId) return;
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
      version: `v${APP_VERSION}`,
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
    scopes?: { type: 'TENANT' | 'NODE'; orgNodeId?: string }[];
  }

  // =========================================================================
  // AUTH-001: Strict Test-Only Auth Bypass Isolation
  //
  // Architectural Invariants:
  // 1. Strictly forbidden in production and staging environments under any circumstances.
  // 2. Only permitted in explicit 'test' environment (NODE_ENV === 'test').
  // 3. Explicit opt-in flag required: ENABLE_TEST_AUTH_BYPASS === 'true' (disabled by default).
  // 4. Localhost / loopback socket connection restriction (cannot be invoked remotely).
  // 5. Shared dynamic test secret required (TEST_AUTH_BYPASS_SECRET, min 16 chars).
  // 6. No hardcoded super_admin; defaults to least-privilege 'test_user'.
  // =========================================================================
  function isLoopbackAddress(addr?: string): boolean {
    if (!addr) return false;
    return (
      addr === '127.0.0.1' ||
      addr === '::1' ||
      addr === '::ffff:127.0.0.1' ||
      addr === 'localhost'
    );
  }

  function isTestBypassPermitted(): boolean {
    const rawEnv = (process.env.NODE_ENV || '').toLowerCase().trim();
    // 1. Strictly forbidden in production, staging, development, or any environment other than 'test'
    if (rawEnv === 'production' || rawEnv === 'staging' || rawEnv !== 'test') {
      return false;
    }
    // 2. Explicit opt-in flag required (disabled by default)
    if (process.env.ENABLE_TEST_AUTH_BYPASS !== 'true') {
      return false;
    }
    // 3. Dynamic test secret required in environment (minimum 16 characters, not hardcoded)
    const secret = process.env.TEST_AUTH_BYPASS_SECRET;
    if (!secret || secret.trim().length < 16) {
      return false;
    }
    return true;
  }

  async function tryIsolatedTestBypass(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<boolean> {
    // 1. Check if test bypass is permitted by strict environment policy
    if (!isTestBypassPermitted()) {
      return false;
    }

    // 2. Must originate strictly from loopback (localhost)
    const remoteAddr = req.socket?.remoteAddress || req.ip;
    if (!isLoopbackAddress(remoteAddr)) {
      return false;
    }

    // 3. Check for explicit test bypass header
    const bypassHeader = req.headers['x-bypass-auth'] || req.headers['x-test-bypass-auth'];
    if (bypassHeader !== 'true') {
      return false;
    }

    // 4. Validate client-supplied secret against configured environment secret using timingSafeEqual
    const clientSecret = req.headers['x-test-bypass-secret'];
    const expectedSecret = process.env.TEST_AUTH_BYPASS_SECRET;
    if (typeof clientSecret !== 'string' || !clientSecret || !expectedSecret) {
      return false;
    }

    const clientBuf = Buffer.from(clientSecret);
    const expectedBuf = Buffer.from(expectedSecret);
    if (clientBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(clientBuf, expectedBuf)) {
      return false;
    }

    // 5. Tenant context is strictly mandatory
    const devTenantId = req.headers['x-tenant-id'] as string;
    if (!devTenantId) {
      res.status(400).json({
        type: 'https://api.an-erp.local/errors/missing-tenant-id',
        title: 'معرف المنشأة إلزامي لتجاوز المصادقة الاختباري',
        status: 400,
        detail: 'يتطلب تجاوز المصادقة في بيئة الاختبار تمرير الترويسة X-Tenant-Id صراحة دون سقوط صامت.',
      });
      return true;
    }

    const tenantRes = await masterStorage.getTenant(devTenantId);
    if (!tenantRes.success || !tenantRes.data) {
      res.status(404).json({
        type: 'https://api.an-erp.local/errors/tenant-not-found',
        title: 'المنشأة غير مسجلة',
        status: 404,
        detail: `المنشأة (${devTenantId}) غير مسجلة في سجل المستأجرين.`,
      });
      return true;
    }

    const devTenant = tenantRes.data;
    let devStorage: StoragePort;
    try {
      devStorage = await globalStorageRouter.resolveAdapterAsync(devTenant);
    } catch (err: any) {
      console.error(`[tryIsolatedTestBypass] tenant storage unavailable tenant=${devTenant.id}: ${err?.message}`);
      res.status(503).json({
        type: 'https://api.an-erp.local/errors/storage-unavailable',
        title: 'مخزن بيانات المنشأة غير متاح',
        status: 503,
        detail: 'تعذر الاتصال بمخزن بيانات هذه المنشأة. حاول لاحقًا أو تواصل مع مدير النظام.',
      });
      return true;
    }

    // 6. No hardcoded super_admin bypass!
    // Role must be explicitly specified by test harness or defaults to non-privileged 'test_user'
    const testRole = (req.headers['x-test-role'] as string) || 'test_user';
    const testUserId = (req.headers['x-test-user-id'] as string) || 'USR-TEST-RUNNER';

    (req as any).authContext = {
      tenantId: devTenantId,
      userId: testUserId,
      sessionId: 'ses-test-isolated',
      role: testRole,
    } as AuthContext;
    (req as any).storage = devStorage;
    (req as any).tenant = devTenant;
    next();
    return true;
  }

  async function requireAuth(req: Request, res: Response, next: NextFunction) {
    let accessToken = req.cookies['an_access_token'];
    if (!accessToken && req.headers.authorization?.startsWith('Bearer ')) {
      accessToken = req.headers.authorization.split(' ')[1];
    }
    if (!accessToken) {
      // AUTH-001: Try isolated test-only auth bypass (strictly rejected in prod/staging/dev)
      const handled = await tryIsolatedTestBypass(req, res, next);
      if (handled) {
        return;
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

      const tenantId = payload.tenantId;
      if (!tenantId) {
        return res.status(401).json({
          type: 'https://api.an-erp.local/errors/unauthorized',
          title: 'سياق المنشأة مفقود',
          status: 401,
          detail: 'رمز الدخول يفتقر إلى معرف المنشأة القانوني.',
        });
      }

      const tenantRes = await masterStorage.getTenant(tenantId);
      if (!tenantRes.success || !tenantRes.data) {
        return res.status(401).json({
          type: 'https://api.an-erp.local/errors/tenant-not-found',
          title: 'المنشأة غير مسجلة',
          status: 401,
          detail: `المنشأة ذات المعرف (${tenantId}) غير مسجلة بالنظام أو تم إيقافها.`,
        });
      }
      const tenant = tenantRes.data;
      const tenantStorage = await globalStorageRouter.resolveAdapterAsync(tenant);
      const tokenService = new TokenService(tenantStorage);

      const ver = await tokenService.verifyAccessToken(accessToken);
      if (!ver.valid || !ver.payload) {
        return res.status(401).json({ success: false, message: ver.error || 'جلسة غير صالحة' });
      }

      // Phase 3 (I2/I3/I7): Verify user membership exists and is ACTIVE in tenant
      const userCheck = typeof (tenantStorage as any).getUser === 'function'
        ? await (tenantStorage as any).getUser(ver.payload.tenantId, ver.payload.sub)
        : await tenantStorage.getUserById(ver.payload.sub);

      if (!userCheck.success || !userCheck.data || (userCheck.data.tenantId && userCheck.data.tenantId !== ver.payload.tenantId) || userCheck.data.status !== 'ACTIVE') {
        return res.status(403).json({
          type: 'https://api.an-erp.local/errors/inactive-membership',
          title: 'عضوية غير صالحة أو معطلة',
          status: 403,
          detail: 'المستخدم لا يملك عضوية نشطة في هذه المنشأة.',
        });
      }

      // Phase 4 (IDENT-001): membership + DB-authoritative role + scopes
      const mem = await tenantStorage.getMembershipContext(ver.payload.tenantId, userCheck.data.id);
      if (!mem.success || !mem.data || mem.data.status !== 'ACTIVE' || !mem.data.role) {
        return res.status(403).json({
          type: 'https://api.an-erp.local/errors/inactive-membership',
          title: 'عضوية غير نشطة',
          status: 403,
          detail: 'لا توجد عضوية نشطة بدور محدد لهذا المستخدم في هذه المنشأة.',
        });
      }

      (req as any).authContext = {
        tenantId: ver.payload.tenantId,
        userId: ver.payload.sub,
        sessionId: ver.payload.sessionId,
        role: mem.data.role,
        scopes: mem.data.scopes,
        orgNodeId: (userCheck.data as any).assignedNodeId || (userCheck.data as any).orgNodeId,
      } as AuthContext;
      (req as any).storage = tenantStorage;
      (req as any).tenant = tenant;
      next();
    } catch (err: any) {
      return res.status(401).json({ success: false, message: publicErrorMessage(err) || 'فشل التحقق من الجلسة' });
    }
  }

  // Wave 0: Sensitive Route Guards (Platform Admin & Developer/Auditor)
  async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
    return requireAuth(req, res, () => {
      const authContext = (req as any).authContext as AuthContext;
      if (!authContext) {
        return res.status(401).json({
          type: 'https://api.an-erp.local/errors/unauthorized',
          title: 'غير مصادق',
          status: 401,
          detail: 'رمز المصادقة مفقود أو غير صالح.',
        });
      }
      const role = authContext.role;
      if (role !== 'super_admin' && role !== 'platform_admin') {
        return res.status(403).json({
          type: 'https://api.an-erp.local/errors/forbidden',
          title: 'صلاحيات غير كافية',
          status: 403,
          detail: 'هذا المسار مخصص لمدير المنصة (Platform Admin) فقط.',
        });
      }
      next();
    });
  }

  async function requireDeveloperOrAuditor(req: Request, res: Response, next: NextFunction) {
    return requireAuth(req, res, () => {
      const authContext = (req as any).authContext as AuthContext;
      if (!authContext) {
        return res.status(401).json({
          type: 'https://api.an-erp.local/errors/unauthorized',
          title: 'غير مصادق',
          status: 401,
          detail: 'رمز المصادقة مفقود أو غير صالح.',
        });
      }
      const role = authContext.role;
      if (role !== 'developer' && role !== 'auditor' && role !== 'super_admin' && role !== 'platform_admin') {
        return res.status(403).json({
          type: 'https://api.an-erp.local/errors/forbidden',
          title: 'صلاحيات غير كافية',
          status: 403,
          detail: 'هذا المسار محمي ومخصص لدور المطور أو المدقق (Developer/Auditor) فقط (البند 1.3).',
        });
      }
      next();
    });
  }

  // 1A & 1D & 1I & 1J & 1K — Enterprise Authentication (Login)
  // 4.6C & 4.6F: Pre-auth tenant resolution and scoped credential lookup
  // SEC-1: the single owner of TOTP secrets / backup codes (the TOTP library and QR renderer are injected)
  const twoFactorService = new TwoFactorService({ generateSecret, generateURI, verify: (o) => verify(o) as any, qrDataUrl: (u: string) => QRCode.toDataURL(u) });

  app.post('/api/auth/login', authRateLimiter, async (req: Request, res: Response) => {
    // 4.6C & 4.6F: Resolve target tenant before accessing storage or credentials
    const tenantResolution = await TenantResolutionService.resolveTenantFromRequest(masterStorage, req);
    if (!tenantResolution.success || !tenantResolution.tenant) {
      return res.status(tenantResolution.error?.status || 400).json(tenantResolution.error);
    }
    const targetTenant = tenantResolution.tenant;
    let targetStorage: StoragePort;
    try {
      targetStorage = await globalStorageRouter.resolveAdapterAsync(targetTenant);
    } catch (err: any) {
      console.error(`[auth/login] tenant storage unavailable tenant=${targetTenant.id}: ${err?.message}`);
      return res.status(503).json({
        type: 'https://api.an-erp.local/errors/storage-unavailable',
        title: 'مخزن بيانات المنشأة غير متاح',
        status: 503,
        detail: 'تعذر الاتصال بمخزن بيانات هذه المنشأة. حاول لاحقًا أو تواصل مع مدير النظام.',
      });
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

    // 4.6F: Credential check strictly scoped to targetTenant.id — NO cross-tenant search
    let user: User | null = null;
    const uRes = await targetStorage.getUserByUsername(targetTenant.id, username);
    if (uRes.success && uRes.data) {
      user = uRes.data;
    }

    const anomalyDetector = new AnomalyDetector(targetStorage);
    const tokenService = new TokenService(targetStorage);
    const lockKey = loginLockKey(targetTenant.id, username); // SEC-A: per-tenant counter (was: bare username shared by all tenants)

    // 1D: Check Progressive Account Lockout via StoragePort
    const lockout = await anomalyDetector.checkLockout(lockKey);
    if (lockout.isLocked) {
      const problem: RFC7807Problem = {
        type: 'https://api.an-erp.local/errors/account-locked',
        title: 'الحساب مقفل مؤقتاً لدواعي أمنية',
        status: 423,
        detail: `تم قفل الحساب تلقائياً إثر استنفاد المحاولات (${lockout.failedAttempts} محاولات فاشلة). يرجى الانتظار ${lockout.lockoutDurationMinutes} دقيقة قبل المحاولة مجدداً.`,
      };
      return res.status(423).json(problem);
    }

    if (!user || !user.passwordHash || user.status !== 'ACTIVE') {
      const failedState = await anomalyDetector.recordFailedAttempt(lockKey);
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
      const failedState = await anomalyDetector.recordFailedAttempt(lockKey);
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

    // 1J: Impossible-travel check. SEC-1: only with a REAL location; an omitted clientGeo is "unknown", never a made-up city
    const location: GeoLocation | null = clientGeo || null;
    const travelCheck: Awaited<ReturnType<typeof anomalyDetector.checkImpossibleTravel>> = location
      ? await anomalyDetector.checkImpossibleTravel(user.id, location)
      : { isAnomaly: false, message: 'الموقع الجغرافي غير متوفر؛ لم يُجرَ فحص الانتقال المستحيل.' };
    // SEC-1: a second factor is demanded only from users who actually HAVE one (an anomaly raises an alert; it cannot create a factor)
    const mustEnforce2fa = !!user.twoFactorEnabled;

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
        await anomalyDetector.recordFailedAttempt(lockKey);
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
      location: location || { city: 'غير معروف', country: '', lat: 0, lon: 0 },
      familyId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    await targetStorage.saveActiveSession(sessionRecord);
    await anomalyDetector.registerActiveSession(sessionRecord);
    await targetStorage.clearFailedLoginAttempts(lockKey);   // SEC-A: a successful login resets this tenant's counter (was cleared by user id but written by username, so it never reset)
    if (location) await anomalyDetector.recordSuccessfulLogin(user.id, location, req.ip || '127.0.0.1', userTenantId);   // SEC-1: an unknown location is never stored as a position

    // 1A: Set HttpOnly, Secure, SameSite Cookies — Zero tokens in localStorage!
    const isProd = process.env.NODE_ENV === 'production';
    const sameSiteMode = resolveCookieSameSite(req);

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

    let targetStorage: StoragePort | null = null;
    try {
      const parts = rawRefreshToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (payload.tenantId) {
          const tRes = await masterStorage.getTenant(payload.tenantId);
          if (tRes.success && tRes.data) {
            targetStorage = await globalStorageRouter.resolveAdapterAsync(tRes.data);
          }
        }
      }
    } catch (e) {
      console.error(JSON.stringify({ level: 'CRITICAL', op: 'refresh_token_tenant_parsing', trace: crypto.randomUUID(), err: String(e) }));
    }

    if (!targetStorage) {
      return res.status(401).json({
        type: 'https://api.an-erp.local/errors/unauthorized',
        title: 'فشل حسم سياق المنشأة',
        status: 401,
        detail: 'تعذر التحقق من سياق المنشأة المرتبط برمز التحديث (البند 4.6A).',
      });
    }

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
    const sameSiteMode = resolveCookieSameSite(req);

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

    return res.json({ success: true, message: 'تم تدوير رمز الجلسة بنجاح' });
  });

  // 1A — Logout Endpoint
  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    const accessToken = req.cookies['an_access_token'];
    if (accessToken) {
      try {
        const parts = accessToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (payload.tenantId) {
            const tRes = await masterStorage.getTenant(payload.tenantId);
            if (tRes.success && tRes.data) {
              const targetStorage = await globalStorageRouter.resolveAdapterAsync(tRes.data);
              const tokenService = new TokenService(targetStorage);
              const anomalyDetector = new AnomalyDetector(targetStorage);
              const ver = await tokenService.verifyAccessToken(accessToken);
              if (ver.valid && ver.payload) {
                await tokenService.revokeFamily(ver.payload.familyId, 'USER_LOGOUT');
                await targetStorage.deleteActiveSession(ver.payload.sessionId);
                await anomalyDetector.terminateSession(ver.payload.sessionId);
                DomainEventBus.publish({
                  eventType: 'SESSION_REVOKED',
                  tenantId: payload.tenantId,
                  actorId: ver.payload.sub,
                  actorName: 'User',
                  payload: { sessionId: ver.payload.sessionId, reason: 'USER_LOGOUT' },
                });
              }
            }
          }
        }
      } catch (e) {
        console.error(JSON.stringify({ level: 'CRITICAL', op: 'logout_session_revocation', trace: crypto.randomUUID(), err: String(e) }));
      }
    }

    res.clearCookie('an_access_token', { path: '/' });
    res.clearCookie('an_refresh_token', { path: '/' });
    return res.json({ success: true, message: 'تم تسجيل الخروج وإبطال الجلسة بنجاح' });
  });

  // 1A — Current User & Session Info (Reads from Cookie and StoragePort)
  app.get('/api/auth/me', requireAuth, async (req: Request, res: Response) => {
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const tenant = getRequestTenant(req, res);
    if (!tenant) return;
    const auth = (req as any).authContext;

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
        backupCodesRemaining: userRecord?.backupCodes?.length || userRecord?.hashedBackupCodes?.length || 0,
      },
      session: {
        sessionId: auth.sessionId,
        deviceType: session?.deviceType || 'Desktop Browser',
        ipAddress: session?.ipAddress || req.ip,
        location: session?.location || { city: 'غير معروف', country: '' },
        createdAt: session?.createdAt,
      },
      tenant,
      calendar: dualDate,
    });
  });

  // Section B.2: 2FA Setup with Real TOTP & QR Code (otplib + qrcode) via StoragePort
  // SEC-1: enrollment works ONLY on the caller's own account (the user id comes from the session; a username in the body is ignored)
  app.post('/api/auth/2fa/setup', requireAuth, async (req: Request, res: Response) => {
    const auth = (req as any).authContext;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const r = await twoFactorService.startSetup(storage, { tenantId: auth.tenantId, userId: auth.userId });
    if (!r.ok) {
      const err = r as any;
      return res.status(err.status).json({ type: err.type, title: err.title, status: err.status, detail: err.detail });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, secret: (r as any).secret, qrCodeDataUrl: (r as any).qrCodeDataUrl, otpauthUrl: (r as any).otpauthUrl });
  });

  app.post('/api/auth/2fa/verify-setup', requireAuth, async (req: Request, res: Response) => {
    const auth = (req as any).authContext;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const r = await twoFactorService.confirmSetup(storage, { tenantId: auth.tenantId, userId: auth.userId }, String((req.body || {}).token || ''));
    if (!r.ok) {
      const err = r as any;
      if (err.code === 'invalid-2fa' && err.username) await new AnomalyDetector(storage).recordFailedAttempt(err.username);
      return res.status(err.status).json({ type: err.type, title: err.title, status: err.status, detail: err.detail });
    }
    return res.json({ success: true, message: 'تم تفعيل التحقق بخطوتين بنجاح' });
  });

  // 1B — Company Settings (Read and Update, with Read-Only backendConfig)
  app.get('/api/company', requireAuth, (req: Request, res: Response) => {
    const tenant = getRequestTenant(req, res);
    if (!tenant) return;
    return res.json({ success: true, data: tenant });
  });

  app.put('/api/company', requireAuth, requirePermission('COMPANY_SETTINGS_MANAGE'), async (req: Request, res: Response) => {
    const { nameAr, nameEn, crNumber, taxNumber, baseCurrency, auditRetentionPolicyYears } = req.body;
    const tenant = getRequestTenant(req, res);
    if (!tenant) return;
    const storage = getRequestStorage(req, res);
    if (!storage) return;

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

    await logSystemChange(storage, (req as any).authContext.userId, 'PLATFORM_MANAGEMENT', 'COMPANY', [`TENANT:${tenant.id}`], 'تحديث بيانات المنشأة');

    return res.json({ success: true, data: tenant, message: 'تم تحديث بيانات المنشأة بنجاح' });
  });

  // 1C — Users & Segregation of Duties (SoD) Management via StoragePort
  app.get('/api/users', requireAuth, requirePermission('USER_MANAGE'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const usersRes = await storage.listUsers(tenantId);
    const users = usersRes.success && usersRes.data ? usersRes.data : [];
    const list = users.map((u) => {
      let decryptedPii: any = {};
      try {
        if (u.encryptedPii) {
          const rawPii = typeof u.encryptedPii === 'string' ? u.encryptedPii : JSON.stringify(u.encryptedPii);
          decryptedPii = EncryptionService.decryptPII<any>(rawPii) || {};
        }
      } catch (e) {
        console.error(JSON.stringify({ level: 'CRITICAL', op: 'list_users_decrypt_pii', trace: crypto.randomUUID(), err: String(e) }));
        decryptedPii = {};
      }
      if (!decryptedPii || typeof decryptedPii !== 'object') {
        decryptedPii = {};
      }
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

  app.post('/api/users', requireAuth, requirePermission('USER_MANAGE'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const { username, fullName, role, branchName, email, phone, nationalId } = req.body;

    // SoD Server-Side Conflict Check (Section 1C)
    const sodCheck = SoDPolicyEngine.validateRoleAssignment([], role);
    if (!sodCheck.allowed && sodCheck.problem) {
      return res.status(sodCheck.problem.status).json(sodCheck.problem);
    }

    const encryptedPii = EncryptionService.encryptPII({ email, phone, nationalId });
    // Phase 5 (AUTH-003): collision-safe id + a unique one-time temporary password per user
    const newId = `USR-${crypto.randomUUID().slice(0, 8)}`;
    const temporaryPassword = crypto.randomBytes(9).toString('base64url');
    const hash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
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

    // Sanitize user object to prevent leaking hashed secrets or backup code arrays
    const { passwordHash: _ph, twoFactorSecret: _ts, encryptedPii: _ep, backupCodes: _bc, hashedBackupCodes: _hbc, ...safeUser } = newUser;
    const userResponse = {
      ...safeUser,
      backupCodesRemaining: (_bc?.length || _hbc?.length || 0),
    };

    await logSystemChange(storage, (req as any).authContext.userId, 'SECURITY', 'USERS', [`USER:${newUser.id}`, `TENANT:${tenantId}`], `إنشاء مستخدم جديد بدور (${role})`);

    // temporaryPassword is returned ONCE here; it is never stored (only its Argon2id hash), logged, audited or published.
    return res.json({ success: true, data: { ...userResponse, temporaryPassword }, message: 'تم إضافة المستخدم بنجاح بعد التحقق من قواعد فصل المهام' });
  });

  // 1L — Invitation link generation (Phase 5 / AUTH-003: persistent, only the SHA-256 hash is stored)
  app.post('/api/invitations', requireAuth, requirePermission('USER_MANAGE'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ error: 'البريد الإلكتروني والدور مطلوبان لإنشاء الدعوة' });
    }

    // Verify SoD before issuing invitation
    const sodCheck = SoDPolicyEngine.validateRoleAssignment([], role);
    if (!sodCheck.allowed && sodCheck.problem) {
      return res.status(sodCheck.problem.status).json(sodCheck.problem);
    }

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const invitationId = `INV-${crypto.randomUUID()}`;
    const created = await storage.createInvitation(tenantId, {
      id: invitationId,
      tenantId,
      tokenHash,
      email,
      proposedRole: role,
      orgNodeId: (req as any).authContext.orgNodeId || undefined,
      status: 'PENDING',
      expiresAt,
      createdBy: (req as any).authContext.userId,
    });
    if (!created.success) {
      return res.status(500).json({ error: 'تعذر إنشاء الدعوة' });
    }

    // Out of scope (Phase 5): the host below still comes from req.get('host').
    const inviteUrl = `${req.protocol}://${req.get('host')}/join?token=${rawToken}`;

    DomainEventBus.publish({
      eventType: 'USER_INVITED',
      tenantId,
      actorId: (req as any).authContext.userId || 'USR-001',
      actorName: 'المستخدم الحالي',
      payload: { email, role, expiresAt },
    });

    recordAudit((req as any).authContext.userId || 'USR-001', 'المستخدم الحالي', 'INVITE_USER', 'INVITATION', email, { role, expiresAt }, req.ip || '127.0.0.1', tenantId, storage);

    await logSystemChange(storage, (req as any).authContext.userId, 'SECURITY', 'INVITATIONS', [`INVITATION:${invitationId}`, `TENANT:${tenantId}`], `إنشاء دعوة مستخدم بدور (${role})`);

    return res.json({
      success: true,
      data: {
        email,
        role,
        inviteUrl,
        expiresAt,
      },
    });
  });

  // Phase 5 (AUTH-003): PUBLIC invitation acceptance. Role / email / org node come ONLY from the invitation row.
  app.post('/api/invitations/accept', authRateLimiter, async (req: Request, res: Response) => {
    const body = req.body || {};
    const { tenantId, token, username, fullName, password } = body;
    const isFilled = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
    if (![tenantId, token, username, fullName, password].every(isFilled) || (password as string).length < 12) {
      return res.status(400).json({ error: 'بيانات قبول الدعوة غير مكتملة أو غير صالحة (كلمة المرور 12 حرفًا على الأقل)' });
    }
    const gone = () => res.status(410).json({ error: 'رابط الدعوة غير صالح أو منتهي الصلاحية أو تم استخدامه' });

    let storage: StoragePort;
    try {
      const tenantRes = await masterStorage.getTenant(tenantId);
      if (!tenantRes.success || !tenantRes.data) return gone();
      storage = await globalStorageRouter.resolveAdapterAsync(tenantRes.data);
    } catch (err: any) {
      console.error(`[invitations/accept] tenant storage unavailable: ${err?.message}`);
      return res.status(503).json({
        type: 'https://api.an-erp.local/errors/storage-unavailable',
        title: 'مخزن بيانات المنشأة غير متاح',
        status: 503,
        detail: 'تعذر الاتصال بمخزن بيانات هذه المنشأة. حاول لاحقًا أو تواصل مع مدير النظام.',
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const consumed = await storage.consumeInvitation(tenantId, tokenHash);
    if (!consumed.success) return res.status(500).json({ error: 'تعذر معالجة الدعوة' });
    if (!consumed.data) return gone();
    const inv = consumed.data;

    let userCreated = false;
    const release = async () => {
      try {
        const r = await storage.releaseInvitation(tenantId, tokenHash);
        if (!r.success) console.error('[invitations/accept] release failed for invitation', inv.id);
      } catch (e: any) {
        console.error('[invitations/accept] release failed for invitation', inv.id, e?.message);
      }
    };

    try {
      const existing = await storage.getUserByUsername(tenantId, username);
      if (!existing.success) {
        await release();
        return res.status(500).json({ error: 'تعذر التحقق من اسم المستخدم' });
      }
      if (existing.data) {
        await release();
        return res.status(409).json({ error: 'اسم المستخدم مستخدم بالفعل، اختر اسمًا آخر ويمكنك إعادة استخدام نفس الدعوة' });
      }

      const hash = await argon2.hash(password, { type: argon2.argon2id });
      const totp = generateSecret();
      const encryptedTotp = EncryptionService.encryptPII(totp);
      const backupCodes = EncryptionService.generateEmergencyBackupCodes();
      const role = inv.proposedRole; // NEVER read from the request body
      const newId = `USR-${crypto.randomUUID().slice(0, 8)}`;

      const newUser: User = {
        id: newId,
        tenantId,
        username,
        fullName,
        email: inv.email,
        role,
        roleTitleAr: role === 'accountant' ? 'محاسب عام' : role === 'financial_approver' ? 'معتمد مالي' : role === 'warehouse_keeper' ? 'أمين مستودع' : 'موظف تشغيلي',
        branchName: 'الفرع الرئيسي',
        status: 'ACTIVE',
        assignedNodeId: inv.orgNodeId,
        encryptedPii: EncryptionService.encryptPII({ email: inv.email }),
        passwordHash: hash,
        twoFactorSecret: encryptedTotp,
        twoFactorEnabled: false,
        backupCodes: backupCodes.hashedCodes,
        hashedBackupCodes: backupCodes.hashedCodes,
        requiresPasswordChange: false,
        createdAt: new Date().toISOString(),
      };

      const saved = await storage.saveUser(newUser, `accept-invite-${inv.id}`);
      if (!saved.success) {
        await release();
        return res.status(500).json({ error: 'تعذر إنشاء المستخدم' });
      }
      userCreated = true;

      // No token, token hash, password or password hash in the audit record.
      await recordAudit(newId, fullName, 'ACCEPT_INVITATION', 'INVITATION', inv.id, { userId: newId, username, role }, req.ip || '127.0.0.1', tenantId, storage);

      return res.json({ success: true, data: { id: newId, username, role } });
    } catch (err: any) {
      if (!userCreated) await release();
      console.error('[invitations/accept] failed:', err?.message);
      return res.status(500).json({ error: 'تعذر قبول الدعوة' });
    }
  });

  // 1I — Active Sessions List & Remote Instant Revocation via StoragePort
  app.get('/api/sessions', requireAuth, requirePermission('USER_MANAGE'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const listRes = await storage.listActiveSessions(tenantId);
    const list = listRes.success && listRes.data ? listRes.data : [];
    return res.json({ success: true, data: list });
  });

  app.delete('/api/sessions/:sessionId', requireAuth, requirePermission('USER_MANAGE'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
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
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const resFields = await storage.getCustomFields(tenantId);
    const data = resFields.success && resFields.data ? resFields.data : [];
    return res.json({ success: true, data });
  });

  app.post('/api/custom-fields', requireAuth, requirePermission('COMPANY_SETTINGS_MANAGE'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
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

    await logSystemChange(storage, (req as any).authContext.userId, 'PLATFORM_MANAGEMENT', 'CUSTOM_FIELDS', [`CUSTOM_FIELD:${newField.id}`, `TENANT:${tenantId}`], 'إضافة حقل مخصص');

    return res.json({ success: true, data: newField, message: 'تم إضافة الحقل المخصص بنجاح' });
  });

  // 1E — Operational Audit Trail
  app.get('/api/audit-trail', requireAuth, requirePermission('AUDIT_LOG_VIEW'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const resAudit = await storage.getAuditRecords(tenantId);
    const data = resAudit.success && resAudit.data ? resAudit.data : [];
    return res.json({ success: true, data });
  });

  // 1F — Domain Events Stream
  app.get('/api/domain-events', requireAuth, requirePermission('AUDIT_LOG_VIEW'), (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const events = DomainEventBus.getRecentEvents(tenantId);
    return res.json({ success: true, data: events });
  });

  // 3. Transactions List (Read via StoragePort)
  app.get('/api/transactions', requireAuth, requirePermission('ENTRY_VIEW'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const result = await storage.listJournalEntries(tenantId);
    if (!result.success) {
      return res.status(result.error?.status || 500).json(result.error);
    }
    return res.json({ success: true, data: result.data });
  });

  // 4. Create and Post Transaction
  app.post('/api/transactions/post', requireAuth, requirePermission('ENTRY_POST'), async (req: Request, res: Response) => {
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

    // Phase 9 (VAL-001): validate date and every line BEFORE any numbering or draft is created
    if (entry === null || typeof entry !== 'object') {
      return res.status(400).json(validationError('بيانات القيد (entry) مطلوبة.'));
    }
    const jv = validateJournalInput(entry.date, entry.lines);
    if (!jv.ok) return res.status(400).json(validationError((jv as { ok: false; detail: string }).detail));
    if (jv.date !== undefined) entry.date = jv.date;
    entry.lines.forEach((l: any, i: number) => {
      l.debit = jv.amounts[i].debit;
      l.credit = jv.amounts[i].credit;
    });

    const storage = getRequestStorage(req, res);
    if (!storage) return;
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
  app.post('/api/transactions/approve', requireAuth, requirePermission('ENTRY_APPROVE'), async (req: Request, res: Response) => {
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
    const storage = getRequestStorage(req, res);
    if (!storage) return;
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
  app.post('/api/transactions/:id/approve', requireAuth, requirePermission('ENTRY_APPROVE'), async (req: Request, res: Response) => {
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

    const storage = getRequestStorage(req, res);
    if (!storage) return;
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

  // ============================================================================
  // Phase 12 (APR-001): configurable approvals — policies, inbox, approve, reject
  // ============================================================================

  const approvalIdempotencyKey = (req: Request): string => String((req.headers['idempotency-key'] as string) || req.body?.idempotencyKey || '').trim();
  const missingApprovalKey = (res: Response) => res.status(400).json({
    type: 'https://api.an-erp.local/errors/missing-idempotency-key',
    title: 'مفتاح idempotencyKey مطلوب',
    status: 400,
    detail: 'عمليات الموافقات تتطلب Idempotency-Key.',
  });

  app.get('/api/approvals/policies', requireAuth, async (req: Request, res: Response) => {
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const r = await storage.listApprovalPolicies((req as any).authContext.tenantId);
    if (!r.success) return res.status(r.error?.status || 500).json(r.error);
    return res.json({ success: true, data: r.data });
  });

  app.put('/api/approvals/policies/:documentType', requireAuth, requirePermission('APPROVAL_POLICY_MANAGE'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const idempotencyKey = approvalIdempotencyKey(req);
    if (!idempotencyKey) return missingApprovalKey(res);
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const engine = new ApprovalEngine(storage);
    const body = req.body || {};
    const candidate = {
      tenantId,
      documentType: req.params.documentType,
      mode: body.mode,
      steps: body.steps === undefined ? [] : body.steps,
      enforceDistinctApprovers: body.enforceDistinctApprovers === undefined ? true : body.enforceDistinctApprovers,
      isActive: body.isActive === undefined ? true : body.isActive,
    };
    const valid = await engine.validatePolicy(candidate, storage);
    if (!valid.success) return res.status(valid.error?.status || 400).json(valid.error);

    const saved = await storage.saveApprovalPolicy(tenantId, {
      id: `apol-${crypto.createHash('sha1').update(`${tenantId}:${candidate.documentType}`).digest('hex').slice(0, 24)}`,
      tenantId,
      documentType: candidate.documentType as any,
      mode: candidate.mode,
      steps: (candidate.steps as any[]).map(st => ({ label: String(st.label).trim(), approverType: st.approverType, approverRef: String(st.approverRef).trim(), stepKind: st.stepKind })),
      enforceDistinctApprovers: candidate.enforceDistinctApprovers,
      isActive: candidate.isActive,
      version: 1,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    }, idempotencyKey);
    if (!saved.success || !saved.data) return res.status(saved.error?.status || 500).json(saved.error);

    // Change-log entry: policy shape only (no secrets, no user names)
    try {
      const logged = await storage.appendSystemChangeLog({
        id: `LOG-APPROVALS-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
        timestamp: new Date().toISOString(),
        actor: userId,
        changeType: 'PLATFORM_MANAGEMENT',
        module: 'APPROVALS',
        entitiesAffected: [`APPROVAL_POLICY:${saved.data.documentType}`, `TENANT:${tenantId}`],
        summaryAr: `تحديث سياسة الاعتماد (${saved.data.documentType}) إلى الإصدار ${saved.data.version} بنمط ${saved.data.mode}`,
        version: '1',
      });
      if (!logged.success) console.error('[audit] system change log failed:', (logged as any).error?.title || 'storage error');
    } catch (e: any) {
      console.error('[audit] system change log failed:', e?.message);
    }
    return res.json({ success: true, data: saved.data });
  });

  app.get('/api/approvals/inbox', requireAuth, async (req: Request, res: Response) => {
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const engine = new ApprovalEngine(storage);
    const r = await engine.listInbox((req as any).authContext.tenantId, (req as any).authContext.userId, (req as any).authContext.role || '');
    if (!r.success) return res.status(r.error?.status || 500).json(r.error);
    return res.json({ success: true, data: r.data });
  });

  app.post('/api/approvals/:id/approve', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const role = (req as any).authContext.role || '';
    const idempotencyKey = approvalIdempotencyKey(req);
    if (!idempotencyKey) return missingApprovalKey(res);
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const engine = new ApprovalEngine(storage);
    const r = await engine.approve(tenantId, req.params.id, userId, role, idempotencyKey);
    if (!r.success) return res.status(r.error?.status || 403).json(r.error);
    await recordAudit(userId, userId, 'APPROVE_STEP', 'APPROVAL_REQUEST', req.params.id, { status: r.data?.status, currentStep: r.data?.currentStep }, req.ip || '127.0.0.1', tenantId, storage);
    return res.json({ success: true, data: r.data });
  });

  app.post('/api/approvals/:id/reject', requireAuth, async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const role = (req as any).authContext.role || '';
    const idempotencyKey = approvalIdempotencyKey(req);
    if (!idempotencyKey) return missingApprovalKey(res);
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const engine = new ApprovalEngine(storage);
    const r = await engine.reject(tenantId, req.params.id, userId, role, String(req.body?.reason ?? ''), idempotencyKey);
    if (!r.success) return res.status(r.error?.status || 403).json(r.error);
    await recordAudit(userId, userId, 'REJECT_STEP', 'APPROVAL_REQUEST', req.params.id, { status: r.data?.status, rejectedStep: r.data?.rejectedStep }, req.ip || '127.0.0.1', tenantId, storage);
    return res.json({ success: true, data: r.data });
  });

  // 5.2 Post transaction by URL param id
  app.post('/api/transactions/:id/post', requireAuth, requirePermission('ENTRY_POST'), async (req: Request, res: Response) => {
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

    const storage = getRequestStorage(req, res);
    if (!storage) return;
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

  // ============================================================================
  // PLATFORM-LEVEL ROUTES (Section 4.6B)
  // Direct access to masterStorage is strictly restricted to platform-level tenant
  // provisioning and tenant directory listing. Business operations MUST NOT use masterStorage.
  // ============================================================================

  // 2A, 2B, 2H: Execute 5-Step Company Creation Wizard (Platform Route — Section 4.6B)
  app.post('/api/wizard/create-company', requirePlatformAdmin, async (req: Request, res: Response) => {
    const storage = masterStorage; // Explicitly allowed: Platform tenant provisioning (4.6B)
    const wizard = new CompanyWizardService(storage);
    const result = await wizard.createCompany(req.body);
    if (!result.success) {
      return res.status(result.error?.status || 400).json(result.error);
    }
    return res.status(201).json(result);
  });

  // 2B: List Registered Tenants / Companies (Platform Route — Section 4.6B)
  app.get('/api/tenants', requirePlatformAdmin, async (req: Request, res: Response) => {
    const storage = masterStorage; // Explicitly allowed: Platform tenant directory (4.6B)
    const result = await storage.listTenants();
    if (!result.success) {
      return res.status(result.error?.status || 500).json(result.error);
    }
    return res.json(result);
  });

  // 2B: Propose BackendConfig Migration
  app.post('/api/storage/propose-migration', requirePlatformAdmin, (req: Request, res: Response) => {
    const { tenantId, targetConfig, requestedBy, justificationAr } = req.body;
    const result = globalStorageRouter.proposeMigration(tenantId, targetConfig, requestedBy || 'USR-ADMIN', justificationAr || 'ترقية البنية التحتية');
    if (!result.success) {
      return res.status(result.error?.status || 400).json(result.error);
    }
    return res.json(result);
  });

  // 2C: Numbering Sequence Manual Override with Mandatory Audit Justification
  app.post('/api/numbering/override', requireAuth, requirePermission('COMPANY_SETTINGS_MANAGE'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const { sequenceKey, targetSequence, justificationAr, authorizedBy, idempotencyKey } = req.body;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
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
    await logSystemChange(storage, userId, 'NUMBERING_OVERRIDE', 'NUMBERING', [`SEQUENCE:${sequenceKey}`, `TENANT:${tenantId}`], 'تجاوز يدوي لتسلسل الترقيم');
    return res.json(result);
  });

  // 2D: As-Of Historical Balance Query
  app.get('/api/reports/balance-as-of', requireAuth, requirePermission('FINANCIAL_REPORTS'), async (req: Request, res: Response) => {
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
    const storage = getRequestStorage(req, res);
    if (!storage) return;
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
  app.get('/api/reports/statement-as-of', requireAuth, requirePermission('FINANCIAL_REPORTS'), async (req: Request, res: Response) => {
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
    const storage = getRequestStorage(req, res);
    if (!storage) return;
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
  app.post('/api/master-data/items', requireAuth, requirePermission('ENTRY_CREATE'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const { item, createdBy, idempotencyKey } = req.body;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
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

  app.post('/api/master-data/items/:id/approve', requireAuth, requirePermission('ENTRY_APPROVE'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const { approvedBy, idempotencyKey } = req.body;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
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

  app.get('/api/master-data/partners', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const type = (req.query.type as string) || undefined;
      const result = await storage.listMasterPartners(tenantId, type as any);
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/master-data/partners', requireAuth, requirePermission('ENTRY_CREATE'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const { partner, createdBy, idempotencyKey } = req.body;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
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

  app.post('/api/master-data/partners/:id/approve', requireAuth, requirePermission('ENTRY_APPROVE'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const { approvedBy, idempotencyKey } = req.body;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
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
  app.get('/api/audit-chain', requireAuth, requirePermission('AUDIT_LOG_VIEW'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const result = await storage.getAuditChain(tenantId);
    if (!result.success) {
      return res.status(result.error?.status || 500).json(result.error);
    }
    return res.json(result);
  });

  app.post('/api/audit-chain/verify', requireAuth, requirePermission('AUDIT_LOG_VIEW'), async (req: Request, res: Response) => {
    const tenantId = (req as any).authContext.tenantId;
    const storage = getRequestStorage(req, res);
    if (!storage) return;
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
    const storage = getRequestStorage(req, res);
    if (!storage) return;
    const result = await storage.getTenantModules(tenantId);
    if (!result.success) {
      return res.status(result.error?.status || 500).json(result.error);
    }
    return res.json(result);
  });

  // Phase 2 Comprehensive Acceptance Battery Endpoint
  app.get('/api/internal/phase2-battery', requireDeveloperOrAuditor, async (req: Request, res: Response) => {
    const result = await runPhase2Battery();
    return res.json(result);
  });

  // Phase 3 Comprehensive Acceptance Battery Endpoint
  app.get('/api/internal/phase3-battery', requireDeveloperOrAuditor, async (req: Request, res: Response) => {
    const result = await runPhase3Battery();
    return res.json(result);
  });

  // 6. Internal Route: /internal/build-status (Protected audit view per section 1.3)
  app.get('/api/internal/build-status', requireDeveloperOrAuditor, async (req: Request, res: Response) => {
    const runner = new Phase0TestRunner();
    const report = await runner.runAll();
    return res.json(report);
  });

  // Wave 7.5H & v7.3 Clause 18: Operational Health Dashboard (/internal/health)
  app.get('/api/internal/health', requireDeveloperOrAuditor, async (req: Request, res: Response) => {
    const p95 = getP95Latency(latencySamples);
    const mem = process.memoryUsage();
    return res.json({
      status: 'HEALTHY',
      system: 'A.N ERP',
      version: `v${APP_VERSION}`,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      observability: {
        totalRequestsTracked: latencySamples.length,
        p95LatencyMs: p95,
        targetP95Ms: 150,
        meetsPerformanceTarget: p95 <= 150,
      },
      memory: {
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      },
      storage: {
        primaryConfigured: !!process.env.DATABASE_URL,
        currentPrimary: process.env.DATABASE_URL ? 'PostgreSQL' : 'InMemory (Dev)',
      },
    });
  });

  app.get('/api/internal/primary-battery', requireDeveloperOrAuditor, async (req: Request, res: Response) => {
    const result = await executePrimaryBattery();
    return res.json(result);
  });

  // Phase 1 Acceptance Battery Endpoint
  app.get('/api/internal/phase1-battery', requireDeveloperOrAuditor, async (req: Request, res: Response) => {
    const result = await runPhase1Battery();
    return res.json(result);
  });

  // Phase 4.6 Foundation Hardening Acceptance Battery Endpoint
  app.get('/api/internal/phase4_6-battery', requireDeveloperOrAuditor, async (req: Request, res: Response) => {
    const result = await runPhase46Battery();
    return res.json(result);
  });

  // ============================================================================
  // PHASE 4: ACCOUNTING CORE (نظام المحاسبة الشامل وإدارة الدفاتر والقوائم المالية)
  // ============================================================================

  const getAccountingService = (req: Request, res: Response): AccountingService | null => {
    const storage = getRequestStorage(req, res);
    if (!storage) return null;
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

  function denyForbidden(res: Response, role: string | undefined, permission: string) {
    return res.status(403).json({
      type: 'https://api.an-erp.local/errors/forbidden',
      title: 'صلاحيات غير كافية',
      status: 403,
      detail: `دور المستخدم (${role || 'غير محدد'}) لا يملك صلاحية تنفيذ هذه العملية (${permission}).`,
    });
  }

  function expenseAccess(req: Request) {
    const role = (req as any).authContext?.role as string | undefined;
    const canViewAll = hasPermission(role, 'EXPENSE_APPROVE') || hasPermission(role, 'FINANCIAL_REPORTS');
    const isSubmitter = hasPermission(role, 'EXPENSE_SUBMIT');
    return { role, canViewAll, isSubmitter };
  }

  // Phase 18 (SCOPE-001): per-user warehouse scope
  const SCOPE_EXEMPT_ROLES = new Set(['super_admin', 'admin', 'platform_admin', 'system_admin', 'auditor']);
  async function getAllowedWarehouseIds(req: Request, storage: StoragePort): Promise<Set<string> | null> {
    const cached = (req as any).__allowedWarehouses;
    if (cached !== undefined) return cached;
    const role = String((req as any).authContext?.role || '').toLowerCase();
    if (SCOPE_EXEMPT_ROLES.has(role)) {
      (req as any).__allowedWarehouses = null;
      return null;
    }
    const tenantId = (req as any).authContext.tenantId;
    const userId = (req as any).authContext.userId;
    const res = await storage.listUserWarehouseAccess(tenantId, userId);
    if (!res.success) {
      (req as any).__allowedWarehouses = null;
      return null;
    }
    const ids = res.data || [];
    const allowed = ids.length === 0 ? null : new Set(ids);
    (req as any).__allowedWarehouses = allowed;
    return allowed;
  }
  async function assertWarehouseAllowed(req: Request, res: Response, storage: StoragePort, warehouseId: string | undefined | null): Promise<boolean> {
    if (!warehouseId) {
      res.status(400).json({ type: 'https://api.an-erp.local/errors/validation-failed', title: 'بيانات غير صالحة', status: 400, detail: 'معرّف المستودع مطلوب.' });
      return false;
    }
    const allowed = await getAllowedWarehouseIds(req, storage);
    if (allowed === null) return true;
    if (!allowed.has(warehouseId)) {
      const role = (req as any).authContext?.role as string | undefined;
      denyForbidden(res, role, 'WAREHOUSE_SCOPE');
      return false;
    }
    return true;
  }

  // 4A: دليل الحسابات (Chart of Accounts)
  app.get('/api/accounting/accounts', requireAuth, requirePermission('ENTRY_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const accounts = await svc.listAccounts(tenantId);
      return res.json({ success: true, data: accounts });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) || 'فشل جلب دليل الحسابات' });
    }
  });

  app.post('/api/accounting/accounts', requireAuth, requirePermission('ENTRY_CREATE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const key = requireIdempotencyKey(req, res, 'حفظ الحساب المحاسبي');
      if (!key) return;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const account = await svc.saveAccount(tenantId, req.body, key);
      return res.json({ success: true, data: account, message: 'تم حفظ وتحديث الحساب بنجاح' });
    } catch (err: any) {
      return res.status(422).json({ success: false, error: publicErrorMessage(err) || 'فشل حفظ الحساب' });
    }
  });

  app.patch('/api/accounting/accounts/:code/status', requireAuth, requirePermission('ENTRY_CREATE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const { code } = req.params;
      const { isActive } = req.body;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const result = await svc.toggleAccountStatus(tenantId, code, isActive);
      return res.json({ success: true, updated: result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 4B: الفترات المحاسبية (Fiscal Periods)
  app.get('/api/accounting/periods', requireAuth, requirePermission('ENTRY_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const periods = await svc.listFiscalPeriods(tenantId);
      return res.json({ success: true, data: periods });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/accounting/periods/close', requireAuth, requirePermission('PERIOD_CLOSE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId;
      const { periodId } = req.body;
      const key = requireIdempotencyKey(req, res, 'إقفال الفترة المحاسبية');
      if (!key) return;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const result = await svc.executePeriodClosingChecklist(tenantId, periodId, userId, key);
      return res.json(result);
    } catch (err: any) {
      return res.status(err.status || 500).json({ success: false, error: (err.status && err.status < 500 && err.detail) ? err.detail : publicErrorMessage(err) });
    }
  });

  app.post('/api/accounting/periods/reopen', requireAuth, requirePermission('PERIOD_CLOSE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId;
      const { periodId, reason } = req.body;
      const key = requireIdempotencyKey(req, res, 'إعادة فتح الفترة المحاسبية');
      if (!key) return;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const result = await svc.reopenPeriod(tenantId, periodId, reason, userId, key);
      return res.json({ success: true, reopened: result, message: 'تم إعادة فتح الفترة المحاسبية وتوثيق ذلك في سلسلة التدقيق.' });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 4B: القيود اليومية (Manual Journal Entries with PostingEngine)
  app.get('/api/accounting/journal-entries', requireAuth, requirePermission('ENTRY_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const primary: any = getRequestStorage(req, res);
      if (!primary) return;
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
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/accounting/journal-entries', requireAuth, requirePermission('ENTRY_POST'), async (req: Request, res: Response) => {
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

      // Phase 9 (VAL-001): validate date and every line BEFORE the service is called
      let entryDate: string = new Date().toISOString().split('T')[0];
      if (payload.date !== undefined && payload.date !== null && payload.date !== '') {
        const dateCheck = parseIsoDate(payload.date, 'تاريخ القيد (date)');
        if (!dateCheck.ok) return res.status(400).json(validationError(dateCheck.detail));
        entryDate = dateCheck.value;
      }
      if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
        return res.status(400).json(validationError('أسطر القيد (lines) مطلوبة ويجب أن تحتوي على سطر واحد على الأقل.'));
      }
      const checkedAmounts: Array<{ debit: number; credit: number }> = [];
      for (let i = 0; i < payload.lines.length; i++) {
        const l = payload.lines[i];
        if (l === null || typeof l !== 'object') {
          return res.status(400).json(validationError(`السطر رقم ${i + 1} من القيد (lines[${i}]) غير صالح.`));
        }
        const amt = (v: unknown, label: string): ParseResult<number> =>
          v === undefined || v === null || v === '' ? { ok: true, value: 0 } : parseNonNegativeMoney(v, label);
        const d = amt(l.debit, `المدين (debit) في السطر رقم ${i + 1}`);
        if (!d.ok) return res.status(400).json(validationError(d.detail));
        const c = amt(l.credit, `الدائن (credit) في السطر رقم ${i + 1}`);
        if (!c.ok) return res.status(400).json(validationError(c.detail));
        if (d.value > 0 && c.value > 0) {
          return res.status(400).json(validationError(`السطر رقم ${i + 1} يحتوي على مدين ودائن معًا؛ يجب أن يكون أحدهما صفرًا (debit / credit).`));
        }
        checkedAmounts.push({ debit: d.value, credit: c.value });
      }

      const entryId = payload.id;
      const entry: JournalEntry = {
        id: entryId,
        code: payload.code,
        tenantId,
        date: entryDate,
        type: payload.type || 'قيد يدوي عام',
        description: payload.description,
        totalAmount: checkedAmounts.reduce((s: number, a) => s + a.debit, 0),
        status: 'APPROVED',
        createdBy: userId,
        lines: payload.lines.map((l: any, i: number) => ({
          id: `${entryId}-L${i + 1}`,
          accountCode: l.accountCode,
          debit: checkedAmounts[i].debit,
          credit: checkedAmounts[i].credit,
          description: l.description || payload.description,
          costCenter: l.costCenter,
        })),
      };

      const svc = getAccountingService(req, res);
      if (!svc) return;
      const posted = await svc.postJournalEntryWithInvariants(tenantId, entry, key);
      return res.json({ success: true, data: posted, message: 'تم ترحيل القيد المحاسبي ذرياً بنجاح' });
    } catch (err: any) {
      const status = err.status || 422;
      return res.status(status).json(err);
    }
  });

  // 4C: الأبعاد المحاسبية (Dimensions)
  app.get('/api/accounting/dimensions', requireAuth, requirePermission('ENTRY_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const type = req.query.type as any;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const dimensions = await svc.listDimensions(tenantId, type);
      return res.json({ success: true, data: dimensions });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/accounting/dimensions', requireAuth, requirePermission('ENTRY_CREATE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const dim = await svc.saveDimension(tenantId, req.body);
      return res.json({ success: true, data: dim });
    } catch (err: any) {
      return res.status(422).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.get('/api/accounting/dimensions/analytics', requireAuth, requirePermission('FINANCIAL_REPORTS'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const type = (req.query.type as any) || 'COST_CENTER';
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const report = await svc.getDimensionAnalyticalReport(tenantId, type);
      return res.json({ success: true, data: report });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 4D: الأصناف والوحدات (Items & Units)
  app.get('/api/accounting/units', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const units = await svc.listUnits(tenantId);
      return res.json({ success: true, data: units });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.get('/api/accounting/items', requireAuth, requirePermission('ENTRY_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const items = await svc.listItems(tenantId);
      return res.json({ success: true, data: items });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/accounting/items', requireAuth, requirePermission('ENTRY_CREATE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const saved = await svc.saveItem(tenantId, req.body);
      return res.json({ success: true, data: saved, message: 'تم حفظ الصنف المحاسبي بنجاح' });
    } catch (err: any) {
      return res.status(422).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 4E: الأرصدة الافتتاحية (Opening Balances)
  app.post('/api/accounting/opening-balances', requireAuth, requirePermission('ENTRY_POST'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId;
      const key = requireIdempotencyKey(req, res, 'ترحيل الأرصدة الافتتاحية');
      if (!key) return;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const entry = await svc.postOpeningBalanceEntry(tenantId, req.body.lines, key, userId);
      return res.json({ success: true, data: entry, message: 'تم ترحيل الأرصدة الافتتاحية بنجاح' });
    } catch (err: any) {
      return res.status(err.status || 422).json(err);
    }
  });

  // 4F: القوائم المالية الثلاث 🔒 (Three Financial Statements)
  app.get('/api/accounting/reports/trial-balance', requireAuth, requirePermission('FINANCIAL_REPORTS'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const report = await svc.getTrialBalance(tenantId, req.query.asOfDate as string);
      return res.json({ success: true, data: report });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.get('/api/accounting/reports/income-statement', requireAuth, requirePermission('FINANCIAL_REPORTS'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const periodId = req.query.periodId as string;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const report = await svc.getIncomeStatement(tenantId, periodId);
      return res.json({ success: true, data: report });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.get('/api/accounting/reports/balance-sheet', requireAuth, requirePermission('FINANCIAL_REPORTS'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const periodId = req.query.periodId as string;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const report = await svc.getBalanceSheet(tenantId, periodId);
      return res.json({ success: true, data: report });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.get('/api/accounting/reports/cash-flow', requireAuth, requirePermission('FINANCIAL_REPORTS'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const periodId = req.query.periodId as string;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const report = await svc.getCashFlowStatement(tenantId, periodId);
      return res.json({ success: true, data: report });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 4G: الاستيراد القياسي (Import)
  app.post('/api/accounting/import/validate', requireAuth, requirePermission('ENTRY_CREATE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const accounts = await svc.listAccounts(tenantId);
      const validation = svc.validateImportData(tenantId, req.body.rows || [], accounts);
      return res.json(validation);
    } catch (err: any) {
      return res.status(500).json({ isValid: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/accounting/import/execute', requireAuth, requirePermission('ENTRY_CREATE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId;
      const key = requireIdempotencyKey(req, res, 'استيراد وترحيل القيود');
      if (!key) return;
      const { entryCode, description, date, rows } = req.body;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const entry = await svc.executeStandardImport(tenantId, entryCode, description, date, rows, userId, key);
      return res.json({ success: true, data: entry, message: 'تم استيراد وترحيل القيود بنجاح' });
    } catch (err: any) {
      return res.status(err.status || 422).json(err);
    }
  });

  // 4H: الموازنات والقيود الدورية (Budgets & Recurring)
  app.get('/api/accounting/budgets', requireAuth, requirePermission('FINANCIAL_REPORTS'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const year = req.query.year ? Number(req.query.year) : 2026;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const budgets = await svc.listBudgets(tenantId, year);
      return res.json({ success: true, data: budgets });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/accounting/budgets', requireAuth, requirePermission('ENTRY_CREATE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const saved = await svc.saveBudget(tenantId, req.body);
      return res.json({ success: true, data: saved, message: 'تم حفظ الموازنة التقديرية بنجاح' });
    } catch (err: any) {
      return res.status(422).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.get('/api/accounting/recurring', requireAuth, requirePermission('ENTRY_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const entries = await svc.listRecurringEntries(tenantId);
      return res.json({ success: true, data: entries });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/accounting/recurring/:id/run', requireAuth, requirePermission('ENTRY_CREATE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId;
      const key = requireIdempotencyKey(req, res, 'توليد وترحيل القيد الدوري');
      if (!key) return;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const entry = await svc.generateRecurringEntry(tenantId, req.params.id, userId, key);
      return res.json({ success: true, data: entry, message: 'تم توليد وترحيل القيد الدوري بنجاح' });
    } catch (err: any) {
      return res.status(422).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 4I: هجرة من أنظمة أخرى (Legacy Migration)
  app.get('/api/accounting/migration/templates', requireAuth, (req: Request, res: Response) => {
    const system = ((req.query.system as string) || 'ORACLE').toUpperCase() as any;
    const svc = getAccountingService(req, res);
    if (!svc) return;
    const template = svc.generateMappingTemplate(system);
    return res.json({ success: true, data: template });
  });

  // 4J: فاحص التوازن المستمر (Continuous Trial Balance Checker)
  app.get('/api/accounting/balance-checker/run', requireAuth, requirePermission('FINANCIAL_REPORTS'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const simulate = req.query.simulate === 'true';
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const log = await svc.runContinuousBalanceCheck(tenantId, simulate);
      return res.json({ success: true, data: log });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.get('/api/accounting/balance-checker/history', requireAuth, requirePermission('FINANCIAL_REPORTS'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const logs = await svc.getBalanceCheckHistory(tenantId);
      return res.json({ success: true, data: logs });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 4K: اختبار الخصائص العشوائي على PostingEngine ضد PostgreSQL
  app.post('/api/accounting/fuzz-test', requireDeveloperOrAuditor, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const fz = parseFuzzIterations(req.body?.iterations);
      if (!fz.ok) return res.status(400).json({ success: false, error: `iterations يجب أن يكون عددًا صحيحًا بين 1 و${fz.max}` });
      const iterations = fz.value;
      const svc = getAccountingService(req, res);
      if (!svc) return;
      const results = await svc.runFuzzTestingBattery(tenantId, iterations);
      return res.json({ success: true, data: results });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // ============================================================================
  // PHASE 5: CASH CUSTODY MODULE (موديول العهدة النقدية - موديول 1 من 15)
  // ============================================================================

  const getCustodyService = (req: Request, res: Response): CashCustodyService | null => {
    const storage = getRequestStorage(req, res);
    if (!storage) return null;
    return new CashCustodyService(storage);
  };

  // Phase 5 Acceptance Battery Endpoint (Internal / Auditor)
  app.get('/api/internal/phase5-battery', requireDeveloperOrAuditor, async (req: Request, res: Response) => {
    const result = await runPhase5Battery();
    return res.json(result);
  });

  // 5A: عرض قائمة العهد النقدية للمنشأة
  app.get('/api/custody/custodies', requireAuth, requirePermission('CUSTODY_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const filter = {
        status: req.query.status as string,
        employeeId: req.query.employeeId as string,
      };
      const result = await storage.listCashCustodies(tenantId, filter);
      if (!result.success) return res.status(500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 5A: جلب تفاصيل عهدة واحدة
  app.get('/api/custody/custodies/:id', requireAuth, requirePermission('CUSTODY_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const result = await storage.getCashCustody(tenantId, req.params.id);
      if (!result.success) return res.status(500).json(result.error);
      if (!result.data) return res.status(404).json({ error: 'العهدة غير موجودة' });
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 5A: فتح وتخصيص عهدة نقدية جديدة لموظف/فرع
  app.post('/api/custody/custodies', requireAuth, requirePermission('CUSTODY_OPEN'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-fin';
      const key = requireIdempotencyKey(req, res, 'فتح عهدة نقدية');
      if (!key) return;

      const svc = getCustodyService(req, res);
      if (!svc) return;

      const payload = {
        ...req.body,
        openedBy: userId,
        openedByName: req.body.openedByName || 'المعتمد المالي',
        idempotencyKey: key,
      };

      const result = await svc.openCustody(tenantId, payload);
      if (!result.success) {
        return res.status(result.error?.status || 400).json(result.error);
      }

      return res.json({ success: true, data: result.data, message: 'تم فتح وتخصيص العهدة النقدية بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 5B: تسجيل مصروف من العهدة النقدية
  app.post('/api/custody/expenses', requireAuth, requirePermission('CUSTODY_EXPENSE_RECORD'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-emp';
      const key = requireIdempotencyKey(req, res, 'تسجيل مصروف من العهدة');
      if (!key) return;

      const svc = getCustodyService(req, res);
      if (!svc) return;

      const payload = {
        ...req.body,
        recordedBy: userId,
        recordedByName: req.body.recordedByName || 'الموظف المسؤول',
        idempotencyKey: key,
      };

      const result = await svc.recordExpense(tenantId, payload);
      if (!result.success) {
        return res.status(result.error?.status || 400).json(result.error);
      }

      return res.json({ success: true, data: result.data, message: 'تم تسجيل الصرف وخصم المبلغ من رصيد العهدة بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 5B: جلب قائمة مصروفات العهدة
  app.get('/api/custody/expenses', requireAuth, requirePermission('CUSTODY_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const custodyId = req.query.custodyId as string;
      const result = await storage.listCustodyTransactions(tenantId, custodyId);
      if (!result.success) return res.status(500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 5C: اعتماد وتسوية العهدة الدورية وتوليد قيد الترحيل (PostingEngine + SoD)
  app.post('/api/custody/settlements', requireAuth, requirePermission('CUSTODY_SETTLE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-auditor';
      const key = requireIdempotencyKey(req, res, 'تسوية دورية للعهدة النقدية');
      if (!key) return;

      const svc = getCustodyService(req, res);
      if (!svc) return;

      const payload = {
        ...req.body,
        settledBy: userId,
        settledByName: req.body.settledByName || 'المدقق المالي المعتمد',
        idempotencyKey: key,
      };

      const result = await svc.settleCustody(tenantId, payload);
      if (!result.success) {
        return res.status(result.error?.status || 400).json(result.error);
      }

      return res.json({
        success: true,
        data: result.data,
        message: 'تم ترحيل قيد تسوية العهدة وتجديد الرصيد عبر محرك الترحيل بنجاح',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 5C: قائمة تسويات العهدة
  app.get('/api/custody/settlements', requireAuth, requirePermission('CUSTODY_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const custodyId = req.query.custodyId as string;
      const result = await storage.listCustodySettlements(tenantId, custodyId);
      if (!result.success) return res.status(500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 5D: فحص إخلاء طرف الموظف للعهد النقدية (HR Clearance Check)
  app.get('/api/custody/hr-clearance/:employeeId', requireAuth, requirePermission('CUSTODY_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getCustodyService(req, res);
      if (!svc) return;
      const clearance = await svc.checkEmployeeClearance(tenantId, req.params.employeeId);
      return res.json({ success: true, data: clearance });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 5D: تصفية العهدة وإقفالها
  app.post('/api/custody/custodies/:id/liquidate', requireAuth, requirePermission('CUSTODY_SETTLE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-auditor';
      const key = requireIdempotencyKey(req, res, 'تصفية وإقفال العهدة');
      if (!key) return;

      const svc = getCustodyService(req, res);
      if (!svc) return;

      const result = await svc.liquidateCustody(
        tenantId,
        req.params.id,
        userId,
        req.body.liquidatorName || 'المدقق المالي',
        key
      );

      if (!result.success) {
        return res.status(result.error?.status || 400).json(result.error);
      }

      return res.json({ success: true, data: result.data, message: 'تم إقفال وتصفية العهدة النقدية نهائياً' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 5D: تحويل مسؤولية العهدة لموظف آخر
  app.post('/api/custody/custodies/:id/transfer', requireAuth, requirePermission('CUSTODY_OPEN'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-manager';
      const key = requireIdempotencyKey(req, res, 'تحويل مسؤولية العهدة');
      if (!key) return;

      const svc = getCustodyService(req, res);
      if (!svc) return;

      const { newEmployeeId, newEmployeeName } = req.body;
      if (!newEmployeeId || !newEmployeeName) {
        return res.status(400).json({ error: 'معرف واسم الموظف البديل مطلوبان' });
      }

      const result = await svc.transferCustody(
        tenantId,
        req.params.id,
        newEmployeeId,
        newEmployeeName,
        userId,
        req.body.transferredByName || 'مدير الحسابات',
        key
      );

      if (!result.success) {
        return res.status(result.error?.status || 400).json(result.error);
      }

      return res.json({ success: true, data: result.data, message: 'تم تحويل مسؤولية العهدة النقدية بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // ============================================================================
  // PHASE 6: EXPENSES MODULE (موديول المصروفات - موديول 2 من 15)
  // ============================================================================

  const getExpenseService = (req: Request, res: Response): ExpenseService | null => {
    const storage = getRequestStorage(req, res);
    if (!storage) return null;
    const pe = new PostingEngine(storage);
    const ne = new NumberingEngine(storage);
    const ae = new ApprovalEngine(storage);
    return new ExpenseService(storage, pe, ne, ae);
  };

  // Phase 6 Acceptance Battery Endpoint (Internal / Auditor)
  app.get('/api/internal/phase6-battery', requireDeveloperOrAuditor, async (req: Request, res: Response) => {
    const result = await runPhase6Battery();
    return res.json(result);
  });

  // 6A: عرض فئات المصروفات
  app.get('/api/expenses/categories', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const result = await storage.listExpenseCategories(tenantId);
      if (!result.success) return res.status(500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 6A: حفظ / إنشاء فئة مصروفات
  app.post('/api/expenses/categories', requireAuth, requirePermission('EXPENSE_SUBMIT'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const key = requireIdempotencyKey(req, res, 'إنشاء فئة مصروفات');
      if (!key) return;

      const category = {
        ...req.body,
        id: req.body.id || `cat-${Date.now()}`,
        tenantId,
        companyId: tenantId,
        createdAt: new Date().toISOString(),
      };
      const result = await storage.saveExpenseCategory(tenantId, category, key);
      if (!result.success) return res.status(400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 6A: استعلام طلبات الصرف مع الفلترة
  app.get('/api/expenses/requests', requireAuth, async (req: Request, res: Response) => {
    try {
      const { role, canViewAll, isSubmitter } = expenseAccess(req);
      if (!canViewAll && !isSubmitter) {
        return denyForbidden(res, role, 'EXPENSE_SUBMIT');
      }

      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const filter = {
        status: req.query.status as string,
        employeeId: req.query.employeeId as string,
        department: req.query.department as string,
      };
      const result = await storage.listExpenseRequests(tenantId, filter);
      if (!result.success) return res.status(500).json(result.error);

      let items = result.data || [];
      if (!canViewAll) {
        const userId = (req as any).authContext?.userId;
        items = items.filter((x: any) => x.submittedBy === userId);
      }
      return res.json({ success: true, data: items });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 6A: تفاصيل طلب صرف واحد مع البنود والمرفقات
  app.get('/api/expenses/requests/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const { role, canViewAll, isSubmitter } = expenseAccess(req);
      if (!canViewAll && !isSubmitter) {
        return denyForbidden(res, role, 'EXPENSE_SUBMIT');
      }

      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const result = await storage.getExpenseRequest(tenantId, req.params.id);
      if (!result.success) return res.status(500).json(result.error);
      if (!result.data) return res.status(404).json({ error: 'طلب المصروفات غير موجود' });

      const submittedBy = (result.data as any).request?.submittedBy || (result.data as any).submittedBy;
      if (!canViewAll && submittedBy !== (req as any).authContext?.userId) {
        return res.status(404).json({ error: 'طلب المصروفات غير موجود' });
      }

      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 6A: تقديم طلب صرف جديد
  app.post('/api/expenses/requests', requireAuth, requirePermission('EXPENSE_SUBMIT'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-emp';
      const key = requireIdempotencyKey(req, res, 'تقديم طلب صرف');
      if (!key) return;

      const svc = getExpenseService(req, res);
      if (!svc) return;

      const payload = {
        ...req.body,
        submittedBy: userId,
        submittedByName: req.body.submittedByName || 'الموظف مقدم الطلب',
        idempotencyKey: key,
      };

      const result = await svc.submitExpenseRequest(tenantId, payload);
      if (!result.success) {
        return res.status(result.error?.status || 400).json(result.error);
      }

      return res.json({
        success: true,
        data: result.data,
        message: 'تم رفع طلب المصروفات وبدء مسار الاعتماد بنجاح',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 6B: اعتماد المستوى الأول (L1 - المدير المباشر)
  app.post('/api/expenses/requests/:id/approve-l1', requireAuth, requirePermission('EXPENSE_APPROVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-manager';
      const key = requireIdempotencyKey(req, res, 'اعتماد طلب صرف مستوى أول');
      if (!key) return;

      const svc = getExpenseService(req, res);
      if (!svc) return;

      const result = await svc.approveL1(tenantId, {
        requestId: req.params.id,
        approverId: userId,
        approverName: req.body.approverName || 'المدير المباشر',
        comment: req.body.comment,
        idempotencyKey: key,
      });

      if (!result.success) {
        return res.status(result.error?.status || 400).json(result.error);
      }

      return res.json({
        success: true,
        data: result.data,
        message: result.data.status === 'POSTED'
          ? 'تم اعتماد وترحيل طلب المصروفات آلياً بنجاح'
          : 'تم اعتماد المستوى الأول بنجاح وتصعيد الطلب للمدير المالي (L2)',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 6B: اعتماد المستوى الثاني (L2 - المدير المالي)
  app.post('/api/expenses/requests/:id/approve-l2', requireAuth, requirePermission('EXPENSE_APPROVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-cfo';
      const key = requireIdempotencyKey(req, res, 'اعتماد طلب صرف نهائي');
      if (!key) return;

      const svc = getExpenseService(req, res);
      if (!svc) return;

      const result = await svc.approveL2(tenantId, {
        requestId: req.params.id,
        approverId: userId,
        approverName: req.body.approverName || 'المدير المالي',
        comment: req.body.comment,
        disbursementAccountCode: req.body.disbursementAccountCode,
        idempotencyKey: key,
      });

      if (!result.success) {
        return res.status(result.error?.status || 400).json(result.error);
      }

      return res.json({
        success: true,
        data: result.data,
        message: 'تم الاعتماد النهائي وترحيل القيد المحاسبي المتوازن لطلب المصروفات بنجاح',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 6B: رفض طلب الصرف
  app.post('/api/expenses/requests/:id/reject', requireAuth, requirePermission('EXPENSE_APPROVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-reviewer';
      const key = requireIdempotencyKey(req, res, 'رفض طلب صرف');
      if (!key) return;

      const svc = getExpenseService(req, res);
      if (!svc) return;

      const result = await svc.rejectExpenseRequest(tenantId, {
        requestId: req.params.id,
        rejectedBy: userId,
        rejectedByName: req.body.rejectedByName || 'المسؤول',
        reasonAr: req.body.reasonAr || 'رفض الطلب لعدم استيفاء الشروط',
        idempotencyKey: key,
      });

      if (!result.success) {
        return res.status(result.error?.status || 400).json(result.error);
      }

      return res.json({
        success: true,
        data: result.data,
        message: 'تم رفض طلب المصروفات وتحديث الحالة بنجاح',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // ============================================================================
  // PHASE 7: WAREHOUSES & INVENTORY MODULE (موديول المخازن والمخزون - موديول 3 من 15)
  // ============================================================================

  const getPurchasingService = (req: Request, res: Response): PurchasingService | null => {
    const storage = getRequestStorage(req, res);
    if (!storage) return null;
    const pe = new PostingEngine(storage);
    const ne = new NumberingEngine(storage);
    const inv = new InventoryService(storage, pe, ne);
    const appr = new ApprovalEngine(storage);
    return new PurchasingService(storage, appr, ne, inv);
  };

  const getInventoryService = (req: Request, res: Response): InventoryService | null => {
    const storage = getRequestStorage(req, res);
    if (!storage) return null;
    const pe = new PostingEngine(storage);
    const ne = new NumberingEngine(storage);
    return new InventoryService(storage, pe, ne);
  };

  // F3a (SI-7): "why was this entry/treatment produced?" — read-only, tenant-scoped via getRequestStorage.
  app.get('/api/standards/explain/journal/:entryId', requireAuth, requirePermission('ENTRY_VIEW'), async (req: Request, res: Response) => {
    try {
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const out = await new RuleExplanationService(storage).explainJournal((req as any).authContext.tenantId, String(req.params.entryId));
      return res.status(out.found ? 200 : 404).json({ success: out.found, data: out });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.get('/api/standards/explain/decision/:id', requireAuth, requirePermission('AUDIT_LOG_VIEW'), async (req: Request, res: Response) => {
    try {
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const out = await new RuleExplanationService(storage).explainDecision((req as any).authContext.tenantId, String(req.params.id));
      return res.status(out.found ? 200 : 404).json({ success: out.found, data: out });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.get('/api/standards/decisions', requireAuth, requirePermission('AUDIT_LOG_VIEW'), async (req: Request, res: Response) => {
    try {
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const q = req.query as Record<string, string | undefined>;
      const limit = Math.min(Math.max(parseInt(q.limit || '50', 10) || 50, 1), 200);
      const result = await new StandardsDecisionService(storage).findDecisions((req as any).authContext.tenantId, { eventType: q.eventType, eventId: q.eventId, journalEntryId: q.journalEntryId, status: q.status, limit });
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });

  // Phase 7 Acceptance Battery Endpoint (Internal / Auditor)
  app.get('/api/internal/phase7-battery', requireDeveloperOrAuditor, async (req: Request, res: Response) => {
    const result = await runPhase7Battery();
    return res.json(result);
  });

  // 7A: Warehouses List
  
  // Phase 18 (SCOPE-001): manage user warehouse access
  app.get('/api/inventory/warehouse-access/:userId', requireAuth, requirePermission('USER_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const result = await storage.listUserWarehouseAccess(tenantId, req.params.userId);
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });
  app.put('/api/inventory/warehouse-access/:userId', requireAuth, requirePermission('USER_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const actorId = (req as any).authContext.userId || 'system';
      const key = requireIdempotencyKey(req, res, 'تحديث نطاق المستودعات');
      if (!key) return;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const warehouseIds = Array.isArray(req.body?.warehouseIds) ? req.body.warehouseIds
        : (Array.isArray(req.body?.warehouse_ids) ? req.body.warehouse_ids : null);
      if (!Array.isArray(warehouseIds)) {
        return res.status(400).json({ type: 'https://api.an-erp.local/errors/validation-failed', title: 'بيانات غير صالحة', status: 400, detail: 'warehouseIds يجب أن يكون مصفوفة.' });
      }
      if (warehouseIds.length > 200) {
        return res.status(400).json({ type: 'https://api.an-erp.local/errors/validation-failed', title: 'بيانات غير صالحة', status: 400, detail: 'الحد الأقصى 200 مستودعًا.' });
      }
      const result = await storage.setUserWarehouseAccess(tenantId, req.params.userId, warehouseIds.map(String), actorId, key);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      try {
        await storage.appendSystemChangeLog({
          id: `scl-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actor: actorId,
          changeType: 'SECURITY',
          module: 'WAREHOUSE_SCOPE',
          entitiesAffected: [req.params.userId],
          summaryAr: `تحديث نطاق مستودعات المستخدم (${(result.data || []).length} مستودع)`,
          afterState: { warehouseIds: result.data },
          version: 'phase-18',
        });
      } catch { /* non-fatal */ }
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

app.get('/api/inventory/warehouses', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const filter = {
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
        branchId: req.query.branchId as string,
      };
      const result = await svc.listWarehouses(tenantId, filter);
      if (!result.success) return res.status(500).json(result.error);
      {
        const storage = getRequestStorage(req, res);
        if (!storage) return;
        const allowed = await getAllowedWarehouseIds(req, storage);
        const data = allowed === null ? result.data : (result.data || []).filter((w: any) => allowed.has(w.id));
        return res.json({ success: true, data });
      }
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7A: Save / Create Warehouse
  app.post('/api/inventory/warehouses', requireAuth, requirePermission('STOCK_RECEIVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const key = requireIdempotencyKey(req, res, 'حفظ مستودع');
      if (!key) return;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const result = await svc.saveWarehouse(tenantId, req.body, key);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data, message: 'تم حفظ المستودع بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7A: Warehouse Bins
  app.get('/api/inventory/warehouses/:id/bins', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      {
        const storage = getRequestStorage(req, res);
        if (!storage) return;
        if (!(await assertWarehouseAllowed(req, res, storage, req.params.id))) return;
      }
      const result = await svc.listWarehouseBins(tenantId, req.params.id);
      if (!result.success) return res.status(500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/inventory/warehouses/:id/bins', requireAuth, requirePermission('STOCK_RECEIVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const result = await svc.saveWarehouseBin(tenantId, { ...req.body, warehouseId: req.params.id });
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data, message: 'تم إضافة موقع التخزين الفرعي بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7A: Items List & Card
  app.get('/api/inventory/items', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const filter = {
        category: req.query.category as string,
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
      };
      const result = await svc.listStockItems(tenantId, filter);
      if (!result.success) return res.status(500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/inventory/items', requireAuth, requirePermission('STOCK_RECEIVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const key = requireIdempotencyKey(req, res, 'حفظ بطاقة صنف');
      if (!key) return;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const result = await svc.saveStockItem(tenantId, req.body, key);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data, message: 'تم حفظ بطاقة الصنف بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // Phase 13 (COST-001): inventory settings (default valuation method, negative stock, over-receipt tolerance)
  app.get('/api/inventory/settings', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const result = await svc.getInventorySettings(tenantId);
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.put('/api/inventory/settings', requireAuth, requirePermission('COMPANY_SETTINGS_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const key = requireIdempotencyKey(req, res, 'تحديث إعدادات المخزون');
      if (!key) return;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const b = req.body || {};
      const result = await svc.saveInventorySettings(tenantId, {
        defaultValuationMethod: b.default_valuation_method ?? b.defaultValuationMethod,
        allowNegativeStock: b.allow_negative_stock ?? b.allowNegativeStock,
        overReceiptTolerancePct: b.over_receipt_tolerance_pct ?? b.overReceiptTolerancePct,
      }, userId, key);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data, message: 'تم تحديث إعدادات المخزون' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });



  // Phase 15 (PO-001): Purchase Orders & Goods Receipts
  app.get('/api/purchasing/orders', requireAuth, requirePermission('PURCHASE_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.listPurchaseOrders(tenantId, { status: req.query.status as string, vendorId: req.query.vendorId as string });
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/orders', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const key = requireIdempotencyKey(req, res, 'إنشاء أمر شراء');
      if (!key) return;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const b = req.body || {};
      const result = await svc.createPurchaseOrder(tenantId, {
        vendorId: b.vendor_id || b.vendorId,
        orderDate: b.order_date || b.orderDate,
        expectedDate: b.expected_date || b.expectedDate,
        notes: b.notes,
        lines: (b.lines || []).map((l: any) => ({ itemId: l.item_id || l.itemId, orderedQty: l.ordered_qty ?? l.orderedQty, unitCost: l.unit_cost ?? l.unitCost })),
        createdBy: userId,
        idempotencyKey: key,
      });
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.get('/api/purchasing/orders/:id', requireAuth, requirePermission('PURCHASE_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.getPurchaseOrder(tenantId, req.params.id);
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      if (!result.data) return res.status(404).json({ success: false, error: { detail: 'غير موجود' } });
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/orders/:id/open', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.openPurchaseOrder(tenantId, req.params.id, userId);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/orders/:id/close', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.closePurchaseOrder(tenantId, req.params.id, userId);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/orders/:id/cancel', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.cancelPurchaseOrder(tenantId, req.params.id, userId);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.get('/api/purchasing/receipts', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.listGoodsReceipts(tenantId, { poId: req.query.poId as string, status: req.query.status as string });
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/receipts', requireAuth, requirePermission('STOCK_RECEIVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const key = requireIdempotencyKey(req, res, 'إنشاء إيصال استلام');
      if (!key) return;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const b = req.body || {};
      const result = await svc.createGoodsReceipt(tenantId, {
        poId: b.po_id || b.poId,
        warehouseId: b.warehouse_id || b.warehouseId,
        lines: (b.lines || []).map((l: any) => ({
          poLineId: l.po_line_id || l.poLineId,
          receivedQty: l.received_qty ?? l.receivedQty,
          batchNumber: l.batch_number || l.batchNumber,
          serialNumber: l.serial_number || l.serialNumber,
          expiryDate: l.expiry_date || l.expiryDate,
        })),
        createdBy: userId,
        idempotencyKey: key,
      });
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.get('/api/purchasing/receipts/:id', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.getGoodsReceipt(tenantId, req.params.id);
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      if (!result.data) return res.status(404).json({ success: false, error: { detail: 'غير موجود' } });
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/receipts/:id/approve', requireAuth, requirePermission('STOCK_RECEIVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const role = (req as any).authContext.role || (req as any).authContext.roles?.[0] || 'warehouse_keeper';
      const key = requireIdempotencyKey(req, res, 'اعتماد إيصال استلام');
      if (!key) return;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.approveReceipt(tenantId, req.params.id, userId, role, key);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/receipts/:id/reject', requireAuth, requirePermission('STOCK_RECEIVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const role = (req as any).authContext.role || (req as any).authContext.roles?.[0] || 'warehouse_keeper';
      const key = requireIdempotencyKey(req, res, 'رفض إيصال استلام');
      if (!key) return;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const reason = (req.body || {}).reason || (req.body || {}).reject_reason;
      const result = await svc.rejectReceipt(tenantId, req.params.id, userId, role, reason, key);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/receipts/:id/retry-post', requireAuth, requirePermission('STOCK_RECEIVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const key = requireIdempotencyKey(req, res, 'إعادة ترحيل إيصال');
      if (!key) return;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.retryPostReceipt(tenantId, req.params.id, key);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });


  // Phase 8a/8b — Purchase Request / RFQ / Supplier Quotes API
  app.get('/api/purchasing/requests', requireAuth, requirePermission('PURCHASE_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.listPurchaseRequests(tenantId, { status: req.query.status as string, requestedBy: req.query.requestedBy as string });
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.get('/api/purchasing/requests/:id', requireAuth, requirePermission('PURCHASE_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.getPurchaseRequest(tenantId, req.params.id);
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      if (!result.data) return res.status(404).json({ success: false, error: { detail: 'طلب الشراء غير موجود' } });
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/requests', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const key = requireIdempotencyKey(req, res, 'إنشاء طلب شراء');
      if (!key) return;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const b = req.body || {};
      const result = await svc.createPurchaseRequest(tenantId, {
        requestedBy: userId,
        neededBy: b.needed_by || b.neededBy,
        notes: b.notes,
        costCenterId: b.cost_center_id || b.costCenterId,
        projectId: b.project_id || b.projectId,
        lines: (b.lines || []).map((l: any) => ({
          itemId: l.item_id || l.itemId,
          quantity: l.quantity ?? l.qty,
          uom: l.uom,
          neededBy: l.needed_by || l.neededBy,
          costCenterId: l.cost_center_id || l.costCenterId,
          projectId: l.project_id || l.projectId,
          notes: l.notes,
        })),
        idempotencyKey: key,
      });
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/requests/:id/submit', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.submitPurchaseRequest(tenantId, req.params.id, userId);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/requests/:id/approve', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.approvePurchaseRequest(tenantId, req.params.id, userId);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/requests/:id/reject', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const reason = (req.body || {}).reason || 'مرفوض';
      const result = await svc.rejectPurchaseRequest(tenantId, req.params.id, userId, reason);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/requests/:id/convert-to-po', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const key = requireIdempotencyKey(req, res, 'تحويل طلب شراء لأمر شراء');
      if (!key) return;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const b = req.body || {};
      const result = await svc.convertPurchaseRequestToPO(tenantId, {
        prId: req.params.id,
        vendorId: b.vendor_id || b.vendorId,
        actorId: userId,
        unitCosts: b.unit_costs || b.unitCosts || {},
        idempotencyKey: key,
      });
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });

  app.get('/api/purchasing/rfqs', requireAuth, requirePermission('PURCHASE_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.listRfqs(tenantId, { status: req.query.status as string, prId: req.query.prId as string });
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.get('/api/purchasing/rfqs/:id', requireAuth, requirePermission('PURCHASE_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.getRfq(tenantId, req.params.id);
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      if (!result.data) return res.status(404).json({ success: false, error: { detail: 'طلب عرض السعر غير موجود' } });
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/rfqs', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const key = requireIdempotencyKey(req, res, 'إنشاء طلب عرض سعر');
      if (!key) return;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const b = req.body || {};
      const result = await svc.createRfq(tenantId, {
        prId: b.pr_id || b.prId,
        notes: b.notes,
        createdBy: userId,
        lines: b.lines ? (b.lines || []).map((l: any) => ({
          itemId: l.item_id || l.itemId,
          quantity: l.quantity ?? l.qty,
          uom: l.uom,
          notes: l.notes,
        })) : undefined,
        idempotencyKey: key,
      });
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/rfqs/:id/send', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.sendRfq(tenantId, req.params.id, userId);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });

  app.get('/api/purchasing/quotes', requireAuth, requirePermission('PURCHASE_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.listSupplierQuotes(tenantId, {
        rfqId: req.query.rfqId as string,
        vendorId: req.query.vendorId as string,
        status: req.query.status as string,
      });
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.get('/api/purchasing/quotes/:id', requireAuth, requirePermission('PURCHASE_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.getSupplierQuote(tenantId, req.params.id);
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      if (!result.data) return res.status(404).json({ success: false, error: { detail: 'عرض المورد غير موجود' } });
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/quotes', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const key = requireIdempotencyKey(req, res, 'تسجيل عرض مورد');
      if (!key) return;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const b = req.body || {};
      const result = await svc.recordSupplierQuote(tenantId, {
        rfqId: b.rfq_id || b.rfqId,
        vendorId: b.vendor_id || b.vendorId,
        quoteDate: b.quote_date || b.quoteDate,
        validUntil: b.valid_until || b.validUntil,
        notes: b.notes,
        createdBy: userId,
        lines: (b.lines || []).map((l: any) => ({
          rfqLineId: l.rfq_line_id || l.rfqLineId,
          itemId: l.item_id || l.itemId,
          quantity: l.quantity ?? l.qty,
          unitPrice: l.unit_price ?? l.unitPrice,
          leadTimeDays: l.lead_time_days ?? l.leadTimeDays,
          notes: l.notes,
        })),
        idempotencyKey: key,
      });
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/quotes/:id/select', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.selectSupplierQuote(tenantId, req.params.id, userId);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/quotes/:id/convert-to-po', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const key = requireIdempotencyKey(req, res, 'تحويل عرض مورد لأمر شراء');
      if (!key) return;
      const svc = getPurchasingService(req, res);
      if (!svc) return;
      const result = await svc.convertQuoteToPO(tenantId, { quoteId: req.params.id, actorId: userId, idempotencyKey: key });
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });


  // Phase 8c — Supplier Invoice + Three-Way Matching
  app.get('/api/purchasing/invoices', requireAuth, requirePermission('PURCHASE_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getPurchasingService(req, res); if (!svc) return;
      const result = await svc.listSupplierInvoices(tenantId, { status: req.query.status as string, poId: req.query.poId as string, vendorId: req.query.vendorId as string });
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.get('/api/purchasing/invoices/:id', requireAuth, requirePermission('PURCHASE_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getPurchasingService(req, res); if (!svc) return;
      const result = await svc.getSupplierInvoice(tenantId, req.params.id);
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      if (!result.data) return res.status(404).json({ success: false, error: { detail: 'فاتورة المورد غير موجودة' } });
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/invoices', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const key = requireIdempotencyKey(req, res, 'إنشاء فاتورة مورد'); if (!key) return;
      const svc = getPurchasingService(req, res); if (!svc) return;
      const b = req.body || {};
      const result = await svc.createSupplierInvoice(tenantId, {
        poId: b.po_id || b.poId, receiptId: b.receipt_id || b.receiptId,
        vendorInvoiceRef: b.vendor_invoice_ref || b.vendorInvoiceRef,
        invoiceDate: b.invoice_date || b.invoiceDate, dueDate: b.due_date || b.dueDate,
        notes: b.notes, taxAmount: b.tax_amount ?? b.taxAmount, autoMatch: b.auto_match ?? b.autoMatch,
        lines: (b.lines || []).map((l: any) => ({
          poLineId: l.po_line_id || l.poLineId, itemId: l.item_id || l.itemId,
          invoicedQty: l.invoiced_qty ?? l.invoicedQty, unitPrice: l.unit_price ?? l.unitPrice,
          taxAmount: l.tax_amount ?? l.taxAmount, notes: l.notes,
        })),
        createdBy: userId, idempotencyKey: key,
      });
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/invoices/:id/match', requireAuth, requirePermission('PURCHASE_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getPurchasingService(req, res); if (!svc) return;
      const result = await svc.runThreeWayMatch(tenantId, req.params.id);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/invoices/:id/approve', requireAuth, requirePermission('SUPPLIER_INVOICE_APPROVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const key = requireIdempotencyKey(req, res, 'اعتماد فاتورة مورد'); if (!key) return;
      const svc = getPurchasingService(req, res); if (!svc) return;
      const result = await svc.approveSupplierInvoice(tenantId, req.params.id, userId, key);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });
  app.post('/api/purchasing/invoices/:id/reject', requireAuth, requirePermission('SUPPLIER_INVOICE_APPROVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const svc = getPurchasingService(req, res); if (!svc) return;
      const result = await svc.rejectSupplierInvoice(tenantId, req.params.id, userId, (req.body || {}).reason || 'مرفوضة');
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) { return res.status(500).json({ success: false, error: publicErrorMessage(err) }); }
  });

  // Phase 14 (ACC-AUTO-001)
  app.get('/api/inventory/accounting-config', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const result = await svc.getStockAccountingConfig(tenantId);
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });
  app.put('/api/inventory/accounting-config', requireAuth, requirePermission('COMPANY_SETTINGS_MANAGE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'system';
      const key = requireIdempotencyKey(req, res, 'تحديث إعدادات محاسبة المخزون');
      if (!key) return;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const b = req.body || {};
      const result = await svc.saveStockAccountingConfig(tenantId, {
        autoPostEnabled: b.auto_post_enabled ?? b.autoPostEnabled,
        grirAccountCode: b.grir_account_code ?? b.grirAccountCode,
        inTransitAccountCode: b.in_transit_account_code ?? b.inTransitAccountCode,
        defaultInventoryAccountCode: b.default_inventory_account_code ?? b.defaultInventoryAccountCode,
        defaultCogsAccountCode: b.default_cogs_account_code ?? b.defaultCogsAccountCode,
      }, userId, key);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data, message: 'تم تحديث إعدادات محاسبة المخزون' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });
  app.post('/api/inventory/documents/:id/post-journal', requireAuth, requirePermission('ENTRY_POST'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const key = requireIdempotencyKey(req, res, 'إعادة ترحيل قيد مستند المخزون');
      if (!key) return;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const result = await svc.retryStockDocumentJournal(tenantId, req.params.id, key);
      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7B: Stock Balances & Real-Time Levels
  
  // Phase 16 (REC-001): stock vs ledger reconciliation (read-only)
  app.get('/api/inventory/reconciliation', requireAuth, requirePermission('FINANCIAL_REPORTS'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const result = await svc.getInventoryReconciliation(tenantId);
      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

app.get('/api/inventory/stock', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const warehouseId = req.query.warehouseId as string;
      const itemId = req.query.itemId as string;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      if (warehouseId && !(await assertWarehouseAllowed(req, res, storage, warehouseId))) return;
      const result = await svc.listWarehouseStock(tenantId, warehouseId, itemId);
      if (!result.success) return res.status(500).json(result.error);
      const allowed = await getAllowedWarehouseIds(req, storage);
      const data = allowed === null ? result.data : (result.data || []).filter((r: any) => allowed.has(r.warehouseId));
      return res.json({ success: true, data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7B: Stock Movements
  app.get('/api/inventory/movements', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const filter = {
        warehouseId: req.query.warehouseId as string,
        itemId: req.query.itemId as string,
        movementType: req.query.movementType as string,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      };
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      if (filter.warehouseId && !(await assertWarehouseAllowed(req, res, storage, filter.warehouseId))) return;
      const result = await svc.listStockMovements(tenantId, filter);
      if (!result.success) return res.status(500).json(result.error);
      const allowed = await getAllowedWarehouseIds(req, storage);
      const data = allowed === null ? result.data : (result.data || []).filter((r: any) => allowed.has(r.warehouseId));
      return res.json({ success: true, data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7B: Stock Receipt (توريد مخزني)
  app.post(['/api/inventory/receive', '/api/inventory/movements/receive'], requireAuth, requirePermission('STOCK_RECEIVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-storekeeper';
      const key = requireIdempotencyKey(req, res, 'توريد مخزني');
      if (!key) return;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      {
        const storage = getRequestStorage(req, res);
        if (!storage) return;
        const wid = (req.body || {}).warehouseId || (req.body || {}).warehouse_id;
        if (!(await assertWarehouseAllowed(req, res, storage, wid))) return;
      }

      const result = await svc.receiveStock(tenantId, {
        ...req.body,
        performedBy: userId,
        performedByName: req.body.performedByName || 'أمين المستودع',
        idempotencyKey: key,
      });

      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data, message: 'تم تسجيل التوريد المخزني واحتساب التكلفة بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7B: Stock Issue (صرف مخزني)
  app.post(['/api/inventory/issue', '/api/inventory/movements/issue'], requireAuth, requirePermission('STOCK_ISSUE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-storekeeper';
      const key = requireIdempotencyKey(req, res, 'صرف مخزني');
      if (!key) return;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      {
        const storage = getRequestStorage(req, res);
        if (!storage) return;
        const wid = (req.body || {}).warehouseId || (req.body || {}).warehouse_id;
        if (!(await assertWarehouseAllowed(req, res, storage, wid))) return;
      }

      const result = await svc.issueStock(tenantId, {
        ...req.body,
        performedBy: userId,
        performedByName: req.body.performedByName || 'أمين المستودع',
        idempotencyKey: key,
      });

      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data, message: 'تم صرف الأصناف وتحديث الأرصدة بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7A: Transfers Between Warehouses
  app.get('/api/inventory/transfers', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const filter = {
        status: req.query.status as string,
        warehouseId: req.query.warehouseId as string,
      };
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const result = await svc.listStockTransfers(tenantId, filter);
      if (!result.success) return res.status(500).json(result.error);
      const allowed = await getAllowedWarehouseIds(req, storage);
      const data = allowed === null ? result.data : (result.data || []).filter((t: any) => allowed.has(t.sourceWarehouseId) || allowed.has(t.targetWarehouseId));
      return res.json({ success: true, data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/inventory/transfers', requireAuth, requirePermission('STOCK_TRANSFER'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-logistics';
      const key = requireIdempotencyKey(req, res, 'إنشاء تحويل مخزني');
      if (!key) return;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      {
        const storage = getRequestStorage(req, res);
        if (!storage) return;
        const src = (req.body || {}).sourceWarehouseId || (req.body || {}).source_warehouse_id;
        if (!(await assertWarehouseAllowed(req, res, storage, src))) return;
      }

      const result = await svc.createTransfer(tenantId, {
        ...req.body,
        requestedBy: userId,
        requestedByName: req.body.requestedByName || 'مشرف الحركة المخزنية',
        idempotencyKey: key,
      });

      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data, message: 'تم إنشاء مستند التحويل وإرسال البضاعة بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.get('/api/inventory/transfers/:id', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const result = await svc.getStockTransfer(tenantId, req.params.id);
      if (!result.success) return res.status(500).json(result.error);
      if (!result.data) return res.status(404).json({ error: 'مستند التحويل غير موجود' });
      {
        const storage = getRequestStorage(req, res);
        if (!storage) return;
        const allowed = await getAllowedWarehouseIds(req, storage);
        const tr = (result.data as any).transfer || result.data;
        if (allowed !== null && !allowed.has(tr.sourceWarehouseId) && !allowed.has(tr.targetWarehouseId)) {
          return denyForbidden(res, (req as any).authContext?.role, 'WAREHOUSE_SCOPE');
        }
      }
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/inventory/transfers/:id/dispatch', requireAuth, requirePermission('STOCK_TRANSFER'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      {
        const storage = getRequestStorage(req, res);
        if (!storage) return;
        const existing = await svc.getStockTransfer(tenantId, req.params.id);
        const tr = existing.success && existing.data ? ((existing.data as any).transfer || existing.data) : null;
        if (!(await assertWarehouseAllowed(req, res, storage, tr?.sourceWarehouseId))) return;
      }
      const existing = await svc.getStockTransfer(tenantId, req.params.id);
      if (!existing.success || !existing.data) return res.status(404).json({ error: 'مستند التحويل غير موجود' });
      return res.json({ success: true, data: existing.data, message: 'التحويل أُرسل عند إنشائه، والخصم من مستودع المصدر تم وقتها.' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/inventory/transfers/:id/receive', requireAuth, requirePermission('STOCK_TRANSFER'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-storekeeper-dest';
      const key = requireIdempotencyKey(req, res, 'استلام تحويل مخزني');
      if (!key) return;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      {
        const storage = getRequestStorage(req, res);
        if (!storage) return;
        const existing = await svc.getStockTransfer(tenantId, req.params.id);
        const tr = existing.success && existing.data ? ((existing.data as any).transfer || existing.data) : null;
        if (!(await assertWarehouseAllowed(req, res, storage, tr?.targetWarehouseId))) return;
      }

      const result = await svc.receiveTransfer(
        tenantId,
        req.params.id,
        userId,
        req.body.receivedByName || 'أمين مستودع الوصول',
        key
      );

      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data, message: 'تم تأكيد استلام الشحنة وإيداعها بالمستودع بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7C: Inventory Counts (الجرد الفعلي والتسويات)
  app.get('/api/inventory/counts', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const filter = {
        warehouseId: req.query.warehouseId as string,
        status: req.query.status as string,
      };
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      if ((filter as any).warehouseId && !(await assertWarehouseAllowed(req, res, storage, (filter as any).warehouseId))) return;
      const result = await svc.listStockCounts(tenantId, filter);
      if (!result.success) return res.status(500).json(result.error);
      const allowed = await getAllowedWarehouseIds(req, storage);
      const data = allowed === null ? result.data : (result.data || []).filter((c: any) => allowed.has(c.warehouseId));
      return res.json({ success: true, data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/inventory/counts', requireAuth, requirePermission('STOCK_COUNT_APPROVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-auditor';
      const key = requireIdempotencyKey(req, res, 'تسجيل محضر جرد');
      if (!key) return;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      {
        const storage = getRequestStorage(req, res);
        if (!storage) return;
        const wid = (req.body || {}).warehouseId || (req.body || {}).warehouse_id;
        if (!(await assertWarehouseAllowed(req, res, storage, wid))) return;
      }

      const result = await svc.createStockCount(tenantId, {
        ...req.body,
        performedBy: userId,
        performedByName: req.body.performedByName || 'المراجع الميداني',
        idempotencyKey: key,
      });

      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data, message: 'تم حفظ محضر الجرد واحتساب الفروقات بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.get('/api/inventory/counts/:id', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const result = await svc.getStockCount(tenantId, req.params.id);
      if (!result.success) return res.status(500).json(result.error);
      if (!result.data) return res.status(404).json({ error: 'محضر الجرد غير موجود' });
      {
        const storage = getRequestStorage(req, res);
        if (!storage) return;
        const allowed = await getAllowedWarehouseIds(req, storage);
        const cnt = (result.data as any).count || result.data;
        if (allowed !== null && !allowed.has(cnt.warehouseId)) {
          return denyForbidden(res, (req as any).authContext?.role, 'WAREHOUSE_SCOPE');
        }
      }
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7C: Approve & Post Count (with strict SoD check & PostingEngine)
  app.post('/api/inventory/counts/:id/approve', requireAuth, requirePermission('STOCK_COUNT_APPROVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-cfo';
      const key = requireIdempotencyKey(req, res, 'اعتماد وترحيل تسوية الجرد');
      if (!key) return;
      const svc = getInventoryService(req, res);
      if (!svc) return;

      const result = await svc.approveAndPostStockCount(tenantId, {
        countId: req.params.id,
        approvedBy: userId,
        approvedByName: req.body.approvedByName || 'المدير المالي',
        idempotencyKey: key,
      });

      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data, message: 'تم اعتماد محضر الجرد وترحيل قيود التسوية المتوازنة بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // =========================================================================
  // PHASE 7.6 UPGRADE ENDPOINTS: Multi-Line, Printing, Returns, Stock Card
  // =========================================================================

  // 7.6A: Stock Documents List (Multi-line Receipts, Issues, Returns)
  app.get('/api/inventory/documents', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const filter = {
        documentType: req.query.documentType as any,
        warehouseId: req.query.warehouseId as string,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      };
      if (filter.warehouseId && !(await assertWarehouseAllowed(req, res, storage, filter.warehouseId))) return;
      const result = await storage.listStockDocuments(tenantId, filter);
      if (!result.success) return res.status(500).json(result.error);
      const allowed = await getAllowedWarehouseIds(req, storage);
      const data = allowed === null ? result.data : (result.data || []).filter((d: any) => allowed.has(d.warehouseId));
      return res.json({ success: true, data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7.6A: Stock Document Detail
  app.get('/api/inventory/documents/:id', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const result = await storage.getStockDocument(tenantId, req.params.id);
      if (!result.success) return res.status(500).json(result.error);
      if (!result.data) return res.status(404).json({ error: 'المستند غير موجود' });
      {
        const allowed = await getAllowedWarehouseIds(req, storage);
        if (allowed !== null && !allowed.has((result.data as any).warehouseId)) {
          return denyForbidden(res, (req as any).authContext?.role, 'WAREHOUSE_SCOPE');
        }
      }
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7.6D: Stock Return (Multi-line Return for Receipt or Issue with GL Reversal)
  app.post('/api/inventory/returns', requireAuth, requirePermission('STOCK_RETURN'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-storekeeper';
      const key = requireIdempotencyKey(req, res, 'مرتجع مخزني');
      if (!key) return;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      {
        const storage = getRequestStorage(req, res);
        if (!storage) return;
        const wid = (req.body || {}).warehouseId || (req.body || {}).warehouse_id;
        if (!(await assertWarehouseAllowed(req, res, storage, wid))) return;
      }

      const result = await svc.returnStock(tenantId, {
        ...req.body,
        performedBy: userId,
        performedByName: req.body.performedByName || 'أمين المستودع',
        idempotencyKey: key,
      });

      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data, message: 'تم ترحيل إذن المرتجع المخزني وعكس الأثر المالي بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7.6E: Item Ledger / Stock Card (كارت الصنف)
  app.get('/api/inventory/items/:id/ledger', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const __scopeStorage = getRequestStorage(req, res);
      if (!__scopeStorage) return;
      const __allowedWh = await getAllowedWarehouseIds(req, __scopeStorage);
      const warehouseId = req.query.warehouseId as string;
      const fromDate = req.query.from as string;
      const toDate = req.query.to as string;

      const result = await svc.getItemLedger(tenantId, req.params.id, {
        warehouseId,
        fromDate,
        toDate,
      });

      if (!result.success) return res.status(result.error?.status || 500).json(result.error);
      {
        let data = result.data as any;
        if (__allowedWh !== null && data) {
          if (Array.isArray(data)) data = data.filter((m: any) => __allowedWh.has(m.warehouseId));
          else if (Array.isArray(data.movements)) data.movements = data.movements.filter((m: any) => __allowedWh.has(m.warehouseId));
          else if (Array.isArray(data.entries)) data.entries = data.entries.filter((m: any) => __allowedWh.has(m.warehouseId));
        }
        return res.json({ success: true, data });
      }
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7.6F: Item Prices (قوائم أسعار الصنف)
  app.get('/api/inventory/items/:id/prices', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const result = await svc.getItemPrices(tenantId, req.params.id);
      if (!result.success) return res.status(500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/inventory/items/:id/prices', requireAuth, requirePermission('STOCK_RECEIVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const key = requireIdempotencyKey(req, res, 'حفظ سعر الصنف');
      if (!key) return;
      const svc = getInventoryService(req, res);
      if (!svc) return;

      const result = await svc.saveItemPrice(tenantId, {
        ...req.body,
        itemId: req.params.id,
      });

      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.status(201).json({ success: true, data: result.data, message: 'تم حفظ تسعيرة الصنف بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7.6F: Barcode Lookup & SVG
  app.get('/api/inventory/items/search/barcode', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const barcode = req.query.barcode as string;
      if (!barcode) return res.status(400).json({ error: 'رمز الباركود مطلوب' });
      const result = await svc.searchItemsByBarcode(tenantId, barcode);
      if (!result.success) return res.status(500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.get('/api/inventory/items/:id/barcode-svg', requireAuth, requirePermission('STOCK_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const svc = getInventoryService(req, res);
      if (!svc) return;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const itemRes = await storage.getStockItem(tenantId, req.params.id);
      const barcode = itemRes.success && itemRes.data?.barcode ? itemRes.data.barcode : req.params.id;
      const svg = svc.generateBarcodeSvg(barcode);
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(svg);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // P3 (AUTHZ-002): attachment / print authorization maps (local, reuse existing PermissionGroup + hasPermission)

  // Phase 17 (ATT-001): resolve document existence + ownership (read-only check)
  async function assertAttachmentDocument(
    storage: StoragePort,
    tenantId: string,
    docType: string,
    docId: string,
    access: { userId: string; canViewAllExpenses: boolean }
  ): Promise<{ ok: true; documentNumber?: string; status?: never; error?: never } | { ok: false; status: number; error: any; documentNumber?: never }> {
    if (!docType || !docId || docId.length > 64 || docType.length > 64) {
      return { ok: false, status: 400, error: validationError('documentType و documentId مطلوبان وبطول معقول (≤ 64).') };
    }
    const notFound = () => ({ ok: false as const, status: 404, error: { type: 'https://api.an-erp.local/errors/not-found', title: 'المستند غير موجود', status: 404, detail: 'المستند غير موجود أو غير متاح.' } });
    try {
      switch (docType) {
        case 'JOURNAL_ENTRY': {
          const r = await storage.getJournalEntry(tenantId, docId);
          if (!r.success || !r.data) return notFound();
          return { ok: true, documentNumber: (r.data as any).entryNumber || (r.data as any).code };
        }
        case 'CUSTODY_VOUCHER': {
          const r = await storage.getCustodyExpenseVoucher(tenantId, docId);
          if (!r.success || !r.data) return notFound();
          return { ok: true, documentNumber: (r.data as any).voucherNumber };
        }
        case 'CUSTODY_SETTLEMENT': {
          const r = await storage.listCustodySettlements(tenantId);
          const hit = r.success && r.data ? r.data.find((x: any) => x.id === docId) : null;
          if (!hit) return notFound();
          return { ok: true, documentNumber: (hit as any).settlementNumber };
        }
        case 'EXPENSE_CLAIM':
        case 'EXPENSE_REQUEST': {
          const r = await storage.getExpenseRequest(tenantId, docId);
          if (!r.success || !r.data) return notFound();
          const req = r.data.request || r.data;
          const ownerId = (req as any).requesterId || (req as any).createdBy || (req as any).submittedBy;
          if (!access.canViewAllExpenses && ownerId && ownerId !== access.userId) return notFound();
          return { ok: true, documentNumber: (req as any).requestNumber || (req as any).code };
        }
        case 'STOCK_RECEIPT':
        case 'RECEIPT':
        case 'STOCK_ISSUE':
        case 'ISSUE':
        case 'STOCK_RETURN': {
          const r = await storage.getStockDocument(tenantId, docId);
          if (!r.success || !r.data) return notFound();
          return { ok: true, documentNumber: (r.data as any).documentNumber };
        }
        case 'STOCK_TRANSFER': {
          const r = await storage.getStockTransfer(tenantId, docId);
          if (!r.success || !r.data) return notFound();
          return { ok: true, documentNumber: (r.data.transfer || r.data as any).transferNumber };
        }
        case 'STOCK_COUNT': {
          const r = await storage.getStockCount(tenantId, docId);
          if (!r.success || !r.data) return notFound();
          return { ok: true, documentNumber: (r.data.count || r.data as any).countNumber };
        }
        default:
          return { ok: false, status: 400, error: validationError(`نوع المستند (${docType}) غير مدعوم للمرفقات.`) };
      }
    } catch {
      return notFound();
    }
  }

  const EXPENSE_DOC_TYPES = new Set<string>(['EXPENSE_CLAIM', 'EXPENSE_REQUEST']);
  const ATTACHMENT_READ_PERMISSION: Record<string, PermissionGroup> = {
    STOCK_RECEIPT: 'STOCK_VIEW',
    RECEIPT: 'STOCK_VIEW',
    STOCK_ISSUE: 'STOCK_VIEW',
    ISSUE: 'STOCK_VIEW',
    STOCK_TRANSFER: 'STOCK_VIEW',
    STOCK_COUNT: 'STOCK_VIEW',
    STOCK_RETURN: 'STOCK_VIEW',
    JOURNAL_ENTRY: 'ENTRY_VIEW',
    CUSTODY_VOUCHER: 'CUSTODY_VIEW',
    CUSTODY_SETTLEMENT: 'CUSTODY_VIEW',
  };
  const ATTACHMENT_WRITE_PERMISSION: Record<string, PermissionGroup> = {
    EXPENSE_CLAIM: 'EXPENSE_SUBMIT',
    EXPENSE_REQUEST: 'EXPENSE_SUBMIT',
    STOCK_RECEIPT: 'STOCK_RECEIVE',
    RECEIPT: 'STOCK_RECEIVE',
    STOCK_ISSUE: 'STOCK_ISSUE',
    ISSUE: 'STOCK_ISSUE',
    STOCK_TRANSFER: 'STOCK_TRANSFER',
    STOCK_COUNT: 'STOCK_COUNT_APPROVE',
    STOCK_RETURN: 'STOCK_RETURN',
    JOURNAL_ENTRY: 'ENTRY_CREATE',
    CUSTODY_VOUCHER: 'CUSTODY_EXPENSE_RECORD',
    CUSTODY_SETTLEMENT: 'CUSTODY_SETTLE',
  };
  const PRINT_PERMISSION: Record<string, PermissionGroup> = {
    'journal-entry': 'ENTRY_VIEW',
    'custody-voucher': 'CUSTODY_VIEW',
    'custody-settlement': 'CUSTODY_VIEW',
    'stock-receipt': 'STOCK_VIEW',
    'stock-issue': 'STOCK_VIEW',
    'stock-transfer': 'STOCK_VIEW',
    'stock-count': 'STOCK_VIEW',
    'stock-card': 'STOCK_VIEW',
    'item-ledger': 'STOCK_VIEW',
  };

  // 7.6G: Document Attachments (مرفقات المستندات 4–7)
  app.get('/api/attachments', requireAuth, async (req: Request, res: Response) => {
    try {
      const docType = String(req.query.documentType || '');
      const docId = String(req.query.documentId || '');
      if (!docType || !docId || docType.length > 64 || docId.length > 64) {
        return res.status(400).json(validationError('documentType و documentId مطلوبان وبطول معقول (≤ 64).'));
      }
      const role = (req as any).authContext?.role as string | undefined;
      const userId = (req as any).authContext.userId || '';
      let canViewAllExpenses = false;
      if (EXPENSE_DOC_TYPES.has(docType)) {
        const access = expenseAccess(req);
        canViewAllExpenses = access.canViewAll;
        if (!access.canViewAll && !access.isSubmitter) return denyForbidden(res, role, 'EXPENSE_SUBMIT');
      } else {
        const needed = ATTACHMENT_READ_PERMISSION[docType];
        if (!needed) return res.status(400).json(validationError(`نوع المستند (${docType}) غير مدعوم للمرفقات`));
        if (!hasPermission(role, needed)) return denyForbidden(res, role, needed);
      }
      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const exists = await assertAttachmentDocument(storage, tenantId, docType, docId, { userId, canViewAllExpenses });
      if (!exists.ok) return res.status(exists.status).json(exists.error);
      const result = await storage.listDocumentAttachments(tenantId, docType, docId);
      if (!result.success) return res.status(500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.post('/api/attachments', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-uploader';
      const role = (req as any).authContext?.role as string | undefined;
      const body = req.body || {};
      const docType = String(body.documentType || '');
      const docId = String(body.documentId || '');
      const needed = ATTACHMENT_WRITE_PERMISSION[docType];
      if (!needed) return res.status(400).json(validationError(`نوع المستند (${docType}) غير مدعوم للمرفقات`));
      if (!hasPermission(role, needed)) return denyForbidden(res, role, needed);

      const key = requireIdempotencyKey(req, res, 'إضافة مرفق مستند');
      if (!key) return;
      const storage = getRequestStorage(req, res);
      if (!storage) return;

      // Validate fields
      const urlP = parseSafeFileUrl(body.fileUrl);
      if (!urlP.ok) return res.status(400).json(validationError(urlP.detail));
      const nameP = parseSafeFileName(body.fileName);
      if (!nameP.ok) return res.status(400).json(validationError(nameP.detail));
      const mimeRaw = body.mimeType || body.fileType;
      const mimeP = parseSafeMimeType(mimeRaw);
      if (!mimeP.ok) return res.status(400).json(validationError(mimeP.detail));
      const sizeRaw = body.fileSize ?? body.fileSizeBytes;
      const sizeP = parseAttachmentSize(sizeRaw);
      if (!sizeP.ok) return res.status(400).json(validationError(sizeP.detail));

      const canViewAllExpenses = EXPENSE_DOC_TYPES.has(docType)
        ? expenseAccess(req).canViewAll
        : true;
      const exists = await assertAttachmentDocument(storage, tenantId, docType, docId, { userId, canViewAllExpenses });
      if (!exists.ok) return res.status(exists.status).json(exists.error);

      // Cap 50 attachments per document
      const listed = await storage.listDocumentAttachments(tenantId, docType, docId);
      if (listed.success && listed.data && listed.data.length >= ATTACHMENT_LIMITS.maxPerDocument) {
        return res.status(422).json({
          type: 'https://api.an-erp.local/errors/attachment-limit',
          title: 'تجاوز حد المرفقات',
          status: 422,
          detail: `الحد الأقصى ${ATTACHMENT_LIMITS.maxPerDocument} مرفقًا لكل مستند.`,
        });
      }

      // Real uploader name from user record (never from body)
      let uploadedByName = 'المستخدم';
      try {
        const u = await storage.getUser(tenantId, userId);
        if (u.success && u.data) uploadedByName = (u.data as any).fullName || (u.data as any).username || uploadedByName;
      } catch { /* keep default */ }

      const att: any = {
        id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        tenantId,
        companyId: tenantId,
        documentType: docType,
        documentId: docId,
        documentNumber: exists.documentNumber || body.documentNumber,
        fileName: nameP.value,
        fileUrl: urlP.value,
        mimeType: mimeP.value,
        fileSize: sizeP.value,
        fileType: mimeP.value,
        fileSizeBytes: sizeP.value,
        uploadedBy: userId,
        uploadedByName,
        createdAt: new Date().toISOString(),
      };

      const result = await storage.saveDocumentAttachment(tenantId, att);
      if (!result.success) return res.status((result.error as any)?.status || 500).json(result.error);
      return res.status(201).json({ success: true, data: result.data, message: 'تم حفظ المرفق بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7.6B: Custody Expense Vouchers (سندات صرف العهدة متعددة البنود)
  app.get('/api/custody/vouchers', requireAuth, requirePermission('CUSTODY_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const custodyId = req.query.custodyId as string;
      const result = await storage.listCustodyExpenseVouchers(tenantId, custodyId);
      if (!result.success) return res.status(500).json(result.error);
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  app.get('/api/custody/vouchers/:id', requireAuth, requirePermission('CUSTODY_VIEW'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;
      const result = await storage.getCustodyExpenseVoucher(tenantId, req.params.id);
      if (!result.success) return res.status(500).json(result.error);
      if (!result.data) return res.status(404).json({ error: 'سند الصرف غير موجود' });
      return res.json({ success: true, data: result.data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7.6D: Reversal of Custody Voucher (مرتجع سند صرف عهدة بقيد عكسي)
  app.post('/api/custody/vouchers/:id/return', requireAuth, requirePermission('CUSTODY_SETTLE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-auditor';
      const key = requireIdempotencyKey(req, res, 'إلغاء ومرتجع سند صرف عهدة');
      if (!key) return;
      const svc = getCustodyService(req, res);
      if (!svc) return;

      const result = await svc.returnCustodyExpense(tenantId, {
        voucherId: req.params.id,
        reason: req.body.reason || 'إلغاء سند الصرف ومرتجع النقدية',
        performedBy: userId,
        performedByName: req.body.performedByName || 'المدقق المالي',
        idempotencyKey: key,
      });

      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data, message: 'تم إلغاء سند الصرف وعكس القيد وإعادة الرصيد للعهدة بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7.6D: Reversal of Approved Expense Request (مرتجع طلب مصروف بقيد عكسي)
  app.post('/api/expenses/requests/:id/reverse', requireAuth, requirePermission('EXPENSE_APPROVE'), async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const userId = (req as any).authContext.userId || 'usr-cfo';
      const key = requireIdempotencyKey(req, res, 'قيد عكسي لمصروف معتمد');
      if (!key) return;
      const svc = getExpenseService(req, res);
      if (!svc) return;

      const result = await svc.reverseExpense(tenantId, {
        requestId: req.params.id,
        reason: req.body.reason || 'إلغاء المصروف بقيد عكسي',
        reversedBy: userId,
        reversedByName: req.body.reversedByName || 'المدير المالي',
        idempotencyKey: key,
      });

      if (!result.success) return res.status(result.error?.status || 400).json(result.error);
      return res.json({ success: true, data: result.data, message: 'تم إلغاء المصروف وترحيل القيد العكسي بنجاح' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
    }
  });

  // 7.6C: Unified Print Service Endpoint (HTML + Print View)
  app.get('/api/print/:docType/:docId', requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).authContext.tenantId;
      const storage = getRequestStorage(req, res);
      if (!storage) return;

      const printService = new UnifiedPrintService(storage);
      const { docType, docId } = req.params;

      {
        const role = (req as any).authContext?.role as string | undefined;
        if (docType === 'expense-request') {
          const { canViewAll, isSubmitter } = expenseAccess(req);
          if (!canViewAll && !isSubmitter) return denyForbidden(res, role, 'EXPENSE_SUBMIT');
        } else {
          const needed = PRINT_PERMISSION[docType];
          if (needed && !hasPermission(role, needed)) return denyForbidden(res, role, needed);
        }
      }

      let html: string | null = null;
      switch (docType) {
        case 'journal-entry':
          html = await printService.renderJournalEntry(tenantId, docId);
          break;
        case 'custody-voucher':
          html = await printService.renderCustodyVoucher(tenantId, docId);
          break;
        case 'custody-settlement':
          html = await printService.renderCustodySettlement(tenantId, docId);
          break;
        case 'expense-request':
          html = await printService.renderExpenseRequest(tenantId, docId);
          break;
        case 'stock-receipt':
          html = await printService.renderStockReceipt(tenantId, docId);
          break;
        case 'stock-issue':
          html = await printService.renderStockIssue(tenantId, docId);
          break;
        case 'stock-transfer':
          html = await printService.renderStockTransfer(tenantId, docId);
          break;
        case 'stock-count':
          html = await printService.renderStockCount(tenantId, docId);
          break;
        case 'stock-card':
        case 'item-ledger':
          html = await printService.renderStockCard(tenantId, docId, {
            warehouseId: req.query.warehouseId as string,
            fromDate: req.query.from as string,
            toDate: req.query.to as string,
          });
          break;
        default:
          return res.status(400).json({ error: `نوع المستند (${docType}) غير مدعوم في خدمة الطباعة الموحدة` });
      }

      if (!html) {
        return res.status(404).json({ error: 'المستند المراد طباعته غير موجود أو غير مكتمل' });
      }

      // If user requested raw HTML for iframe / popup window:
      if (req.query.format === 'raw' || req.headers.accept?.includes('text/html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      }

      return res.json({ success: true, html });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: publicErrorMessage(err) });
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

  try {
    if (typeof (masterStorage as any).initializeSchema === 'function') {
      const initRes = await (masterStorage as any).initializeSchema();
      if (!initRes.success) {
        const msg = `CRITICAL [trace=${crypto.randomUUID()}] فشل تهيئة المخطط الأولي: ${JSON.stringify(initRes.error)}`;
        if (process.env.NODE_ENV === 'production') throw new Error(msg);
        console.error(msg);
      } else {
        console.log('✓ تم فحص وتهيئة مخطط جداول قاعدة البيانات بنجاح.');
      }
    }
    await seedOnlyInitialBootstrap(masterStorage);
    await initSeedUsers(masterStorage, companyProfile.id);
    console.log('✓ تم فحص وبذر بيانات المستأجر والمستخدمين بنجاح (seedOnly).');
    // F1 Standards Intelligence: idempotent catalogue seed (reference entries only, never overwrites, non-fatal).
    try {
      const sc = await seedStandardsCatalogue(masterStorage as any, 'system');
      console.log(`✓ كتالوج المعايير: +${sc.standards} معيار، +${sc.jurisdictions} اختصاص (تخطّي ${sc.skipped})${sc.errors.length ? ' | أخطاء: ' + sc.errors.length : ''}`);
    } catch (e: any) { console.error('[standards] seed skipped:', e?.message || e); }

    // Startup Fail-Fast Guard (Section 13.2 & Item A-3)
    const t = crypto.randomUUID();
    const problems: string[] = [];
    const gTenant = await masterStorage.getTenant(SEED_TENANT_ID);
    if (!gTenant.success || !gTenant.data || gTenant.data.status !== 'ACTIVE') {
      problems.push(`an_tenants: لا يوجد صف ACTIVE للمنشأة ${SEED_TENANT_ID}`);
    }
    const gAcc = masterStorage.listAccounts ? await masterStorage.listAccounts(SEED_TENANT_ID) : { success: false, data: [] };
    if (!gAcc.success || (gAcc.data?.length ?? 0) < 14) {
      problems.push(`an_accounts: ${gAcc.data?.length ?? 0} بدل 14`);
    }
    const gCat = await masterStorage.listExpenseCategories(SEED_TENANT_ID);
    if (!gCat.success || (gCat.data?.length ?? 0) < 5) {
      problems.push(`فئات المصروفات: ${gCat.data?.length ?? 0} بدل 5`);
    }
    const gUsr = await masterStorage.listUsers(SEED_TENANT_ID);
    if (!gUsr.success || (gUsr.data?.length ?? 0) < 1) {
      problems.push(`an_users: ${gUsr.data?.length ?? 0}`);
    }
    const needed = ['admin', 'accountant', 'approver', 'warehouse'];
    const missing = needed.filter((u) => !(gUsr.data ?? []).some((x) => x.username === u));
    if (missing.length) {
      problems.push(`مستخدمون مفقودون: ${missing.join(', ')}`);
    }
    if (problems.length) {
      const msg = `CRITICAL [trace=${t}] بذر الإقلاع غير مكتمل: ${problems.join(' | ')}`;
      if (process.env.NODE_ENV === 'production') throw new Error(msg);
      console.error(msg);
    }
  } catch (seedErr) {
    const msg = `CRITICAL [trace=${crypto.randomUUID()}] تعذر إكمال بذر البيانات الأولية تلقائياً: ${seedErr instanceof Error ? seedErr.message : String(seedErr)}`;
    if (process.env.NODE_ENV === 'production') throw new Error(msg);
    console.error(msg, seedErr);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`A.N ERP Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
