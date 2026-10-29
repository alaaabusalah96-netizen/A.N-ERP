import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  deleteDoc 
} from "firebase/firestore";
import { initializeApp as initializeAdminApp, getApps as getAdminApps, cert as adminCert, App as AdminApp } from "firebase-admin/app";
import { getFirestore as getFirestoreAdmin, FieldValue } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { runTenantMigrationUp, runTenantMigrationDown } from "./src/migrations/tenantMigration";
import { hashPassword, legacyHashPassword, legacySinglePassHashPassword, legacyStretchedHashPassword1000, getPepperByVersion, hashPasswordPBKDF2_210k, getLegacyHashDeprecationPolicy } from "./src/lib/server_hash";
import { 
  DEFAULT_COMPANIES, 
  DEFAULT_REGIONS, 
  DEFAULT_STATIONS, 
  DEFAULT_ORGANIZATION_UNITS, 
  DEFAULT_CATEGORIES, 
  DEFAULT_USERS, 
  DEFAULT_TRANSACTIONS, 
  DEFAULT_LOGS, 
  DEFAULT_CONFIG, 
  DEFAULT_PERMISSIONS, 
  DEFAULT_ROLES 
} from "./src/db/defaults";

function generateSecureTemporaryPassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let pass = "";
  for (let i = 0; i < 16; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

const isProductionOrStrict = Boolean(
  process.env.NODE_ENV === 'production' || process.env.STRICT_PROD_SECURITY === 'true'
);

let appletConfig: Record<string, string> = {};
if (!isProductionOrStrict) {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      appletConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch (_) {}
}

const serverApiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || (isProductionOrStrict ? "" : (appletConfig.apiKey || ""));
const serverProjectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || (isProductionOrStrict ? "" : (appletConfig.projectId || "custodyflow"));
const serverAuthDomain = process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || (isProductionOrStrict ? "custodyflow.firebaseapp.com" : (appletConfig.authDomain || "custodyflow.firebaseapp.com"));
const serverStorageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || (isProductionOrStrict ? "custodyflow.firebasestorage.app" : (appletConfig.storageBucket || "custodyflow.firebasestorage.app"));
const serverMessagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || (isProductionOrStrict ? "" : (appletConfig.messagingSenderId || ""));
const serverAppId = process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || (isProductionOrStrict ? "" : (appletConfig.appId || ""));

if (isProductionOrStrict && (!serverApiKey || !serverProjectId)) {
  console.error("CRITICAL SECURITY ERROR: Required Firebase environment variables (FIREBASE_API_KEY, FIREBASE_PROJECT_ID) are missing in production/strict mode. Committed JSON fallback is disabled.");
  process.exit(1);
}

const firebaseConfig = {
  projectId: serverProjectId || "custodyflow",
  appId: serverAppId,
  apiKey: serverApiKey || "dev-placeholder-key",
  authDomain: serverAuthDomain,
  storageBucket: serverStorageBucket,
  messagingSenderId: serverMessagingSenderId
};

const firebaseApp = initializeApp(firebaseConfig);
const DATABASE_ID = process.env.FIREBASE_DATABASE_ID || process.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-custodyflow-b2f42bf6-7a6a-43a4-9986-3d46405d5ebe";
const db = getFirestore(firebaseApp, DATABASE_ID);

// Initialize Firebase Admin SDK
function getAdminApp(): AdminApp {
  const existingApps = getAdminApps();
  if (existingApps.length > 0 && existingApps[0]) {
    return existingApps[0];
  }

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (rawServiceAccount) {
    try {
      let cleaned = rawServiceAccount.trim();
      if ((cleaned.startsWith("'") && cleaned.endsWith("'")) || (cleaned.startsWith('"') && cleaned.endsWith('"'))) {
        cleaned = cleaned.slice(1, -1).trim();
      }
      if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
        try {
          const decoded = Buffer.from(cleaned, 'base64').toString('utf-8').trim();
          if (decoded.startsWith('{')) {
            cleaned = decoded;
          }
        } catch (_) {
          // Keep cleaned as is if base64 decode fails
        }
      }
      const serviceAccount = JSON.parse(cleaned);
      if (serviceAccount && typeof serviceAccount === 'object') {
        if (typeof serviceAccount.private_key === 'string') {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        return initializeAdminApp({
          credential: adminCert(serviceAccount)
        });
      }
    } catch (err) {
      console.error("Error initializing Firebase Admin with FIREBASE_SERVICE_ACCOUNT:", err);
    }
  }

  const appsAfter = getAdminApps();
  if (appsAfter.length > 0 && appsAfter[0]) {
    return appsAfter[0];
  }

  try {
    return initializeAdminApp({
      projectId: firebaseConfig.projectId
    });
  } catch (err) {
    const finalApps = getAdminApps();
    if (finalApps.length > 0 && finalApps[0]) {
      return finalApps[0];
    }
    throw err;
  }
}

const adminApp = getAdminApp();
const adminDb = getFirestoreAdmin(adminApp, DATABASE_ID);


import helmet from "helmet";

async function startServer() {
  const app = express();
  app.use(helmet({
    contentSecurityPolicy: false, // Allow AI Studio iframe preview and Vite development inline/eval scripts
    frameguard: false, // Allow embedding in AI Studio preview iframe
    crossOriginEmbedderPolicy: false
  }));
  const PORT = 3000;

  const isProduction = process.env.NODE_ENV === 'production';
  if (!process.env.APP_PEPPER) {
    if (isProduction) {
      console.error("CRITICAL SECURITY ERROR: APP_PEPPER environment variable is not set in production. Refusing to start.");
      process.exit(1);
    }
    console.warn("[Security Notice] APP_PEPPER is not set. Server will start in non-strict/dev mode with a fallback pepper — do NOT use this in production.");
  }

  // Trust first proxy in Cloud Run / Nginx container environment for rate limiter IP resolution
  app.set("trust proxy", 1);

  app.use(express.json());
  app.use(cookieParser());

  const isRelaxedAuthRateLimit = !isProduction && process.env.RELAX_AUTH_RATE_LIMIT === 'true';

  // Rate limiting for auth verification endpoints (generous 60 attempts / 15m to avoid blocking legit admins testing multiple accounts)
  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60, // Max 60 attempts per 15 minutes per IP
    skip: () => isRelaxedAuthRateLimit,
    message: {
      success: false,
      message: "تم تجاوز الحد الأقصى للمحاولات من هذا الجهاز. يرجى الانتظار بضع دقائق قبل إعادة المحاولة / Rate limit exceeded. Please try again in a few minutes."
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Dedicated Rate Limiter for Session Cookie issuance (isolated from login attempts)
  const sessionRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    skip: () => isRelaxedAuthRateLimit,
    message: {
      success: false,
      message: "Rate limit exceeded for session operations. Please try again later."
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Dedicated Rate Limiter for Password Changes
  const changePasswordRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    skip: () => isRelaxedAuthRateLimit,
    message: {
      success: false,
      message: "تم تجاوز الحد الأقصى لمحاولات تغيير كلمة المرور. يرجى المحاولة لاحقاً / Password change rate limit exceeded. Please try again later."
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Backward-compatible alias
  const otpRateLimiter = authRateLimiter;

  // Dedicated Rate Limiter for Admin operations and Credential ID migrations
  const adminRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // Max 30 operations per 15 minutes per IP
    skip: () => isRelaxedAuthRateLimit,
    message: {
      success: false,
      message: "تم تجاوز الحد الأقصى للعمليات الإدارية من هذا الجهاز. يرجى المحاولة مرة أخرى لاحقاً / Rate limit exceeded for administrative operations. Please try again later."
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // AN-FIX-SEC-1: per tenant+username limiter for A.N login (in-memory; per instance)
  const anLoginUserLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skip: () => isRelaxedAuthRateLimit,
    skipSuccessfulRequests: true,
    keyGenerator: (req: any) =>
      `${String(req.body?.tenantId || 'default').toLowerCase().slice(0, 64)}:${String(req.body?.username || '').toLowerCase().slice(0, 128)}`,
    message: {
      ok: false,
      plane: 'an-auth-g2',
      code: 'too_many_attempts',
      message: 'Too many attempts. Try again later.',
      messageAr: 'محاولات كثيرة. حاول لاحقًا.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const PLATFORM_OWNER_EMAIL = (process.env.PLATFORM_OWNER_EMAIL || "").toLowerCase().trim();

  async function isPlatformAdminUser(email?: string, userData?: any): Promise<boolean> {
    if (userData?.is_platform_owner === true || userData?.role === 'SystemAdmin') return true;
    const targetEmail = (email || userData?.email || '').toLowerCase().trim();
    if (!targetEmail) return false;
    if (PLATFORM_OWNER_EMAIL && targetEmail === PLATFORM_OWNER_EMAIL) return true;
    try {
      const snapshot = await adminDb.collection("users").where("email", "==", targetEmail).limit(1).get();
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        return data?.is_platform_owner === true || data?.role === 'SystemAdmin';
      }
    } catch (err) {
      console.error("isPlatformAdminUser lookup error:", err);
    }
    return false;
  }

  function userMayAccessCompany(user: any, companyId: string): boolean {
    const cid = String(companyId || "").trim();
    if (!cid || !user) return false;
    const primary = String(user.company_id || user.companyId || user.tenantId || "").trim();
    if (primary && primary === cid) return true;
    const lists = [user.company_ids, user.assigned_company_ids, user.companies]
      .filter(Array.isArray) as any[][];
    for (const list of lists) {
      for (const entry of list) {
        const id = typeof entry === "string" ? entry : entry?.id || entry?.company_id;
        if (id && String(id).trim() === cid) return true;
      }
    }
    return false;
  }

  async function assertUserCanAccessCompany(
    user: any,
    companyId: string
  ): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string; messageAr: string }> {
    const cid = String(companyId || "").trim();
    if (!cid) {
      return {
        ok: false,
        status: 400,
        code: "company_id_required",
        message: "companyId required",
        messageAr: "معرّف الشركة مطلوب",
      };
    }
    let platform = false;
    try {
      platform = await isPlatformAdminUser(user?.email, user);
    } catch {
      platform = false;
    }
    const role = String(user?.role || "");
    const elevated =
      platform ||
      role === "SystemAdmin" ||
      role === "super_admin" ||
      role === "system_admin" ||
      user?.is_platform_owner === true;

    if (elevated) return { ok: true };
    if (userMayAccessCompany(user, cid)) return { ok: true };

    return {
      ok: false,
      status: 403,
      code: "company_scope_denied",
      message: "Forbidden: user cannot access this companyId",
      messageAr: "غير مصرح بالوصول لبيانات هذه الشركة",
    };
  }

  // Middleware helper to verify Firebase ID token and user role
  async function verifyUserRole(req: express.Request, allowedRoles: string[]): Promise<{ authorized: boolean; statusCode: number; message: string; user?: any }> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { authorized: false, statusCode: 401, message: "Unauthorized: Missing authentication token / يلزم وجود رمز المصادقة." };
    }

    const idToken = authHeader.split("Bearer ")[1]?.trim();
    if (!idToken) {
      return { authorized: false, statusCode: 401, message: "Unauthorized: Invalid authentication token / رمز المصادقة غير صالح." };
    }

    try {
      const decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
      const uid = decodedToken.uid;

      const userDoc = await adminDb.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        return { authorized: false, statusCode: 403, message: "Forbidden: User record not found / لا تملك صلاحية الوصول." };
      }

      const userData = userDoc.data();
      const userRole = userData?.role || "";
      const isPlatformOwner = await isPlatformAdminUser(userData?.email, userData);

      if (isPlatformOwner || allowedRoles.includes(userRole)) {
        return { authorized: true, statusCode: 200, message: "Authorized", user: userData };
      }

      return { authorized: false, statusCode: 403, message: "Forbidden: Insufficient privileges / تطلب صلاحية أعلى." };
    } catch (err: any) {
      console.error("Token verification failed:", err);
      return { authorized: false, statusCode: 401, message: "Unauthorized: Token verification failed / فشلت عملية المصادقة." };
    }
  }

  async function requireSystemAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const result = await verifyUserRole(req, ["SystemAdmin"]);
    if (!result.authorized) {
      return res.status(result.statusCode).json({ success: false, message: result.message });
    }
    (req as any).user = result.user;
    next();
  }

  async function requireAdminOrSystemAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const result = await verifyUserRole(req, ["SystemAdmin", "Admin"]);
    if (!result.authorized) {
      return res.status(result.statusCode).json({ success: false, message: result.message });
    }
    (req as any).user = result.user;
    next();
  }

  // API Route - Run Tenant Migration (UP)
  app.post("/api/migrations/up", requireSystemAdminAuth, async (req, res) => {
    try {
      console.log("Migration endpoint triggered [UP]");
      const result = await runTenantMigrationUp(db);
      return res.json(result);
    } catch (err: any) {
      console.error("Migration UP endpoint error:", err);
      return res.status(500).json({
        success: false,
        message: `Migration failed: ${err.message}`,
        details: {}
      });
    }
  });

  // API Route - Rollback Tenant Migration (DOWN)
  app.post("/api/migrations/down", requireSystemAdminAuth, async (req, res) => {
    try {
      console.log("Migration endpoint triggered [DOWN]");
      const result = await runTenantMigrationDown(db);
      return res.json(result);
    } catch (err: any) {
      console.error("Migration DOWN endpoint error:", err);
      return res.status(500).json({
        success: false,
        message: `Rollback failed: ${err.message}`,
        details: {}
      });
    }
  });


  // API Route - Platform Status (checks if any SystemAdmin/super_admin/platform_owner exists)
  app.get("/api/auth/platform-status", async (req, res) => {
    try {
      const sysAdminSnap = await adminDb.collection("users").where("role", "==", "SystemAdmin").limit(1).get();
      let hasOwner = !sysAdminSnap.empty;
      if (!hasOwner) {
        const superAdminSnap = await adminDb.collection("users").where("role", "==", "super_admin").limit(1).get();
        hasOwner = !superAdminSnap.empty;
      }
      if (!hasOwner) {
        const ownerSnap = await adminDb.collection("users").where("is_platform_owner", "==", true).limit(1).get();
        hasOwner = !ownerSnap.empty;
      }
      return res.json({ hasPlatformOwner: hasOwner });
    } catch (err: any) {
      console.warn("Platform status check notice (defaulting hasPlatformOwner to true):", err?.message || err);
      return res.json({ hasPlatformOwner: true, notice: "Offline or unseeded fallback" });
    }
  });

  const SERVER_SESSION_SECRET = process.env.SESSION_SECRET || "kemit_server_session_secret_fallback_key_2026";

  function signServerSessionToken(payload: { uid: string; email: string; role?: string; company_id?: string; timestamp?: number }): string {
    const data = JSON.stringify({ ...payload, timestamp: payload.timestamp || Date.now() });
    const b64Data = Buffer.from(data).toString('base64url');
    const signature = crypto.createHmac('sha256', SERVER_SESSION_SECRET).update(b64Data).digest('base64url');
    return `${b64Data}.${signature}`;
  }

  function verifyServerSessionToken(token: string): { valid: boolean; uid?: string; email?: string } {
    if (!token || typeof token !== 'string' || !token.includes('.')) return { valid: false };
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false };
    const [b64Data, signature] = parts;
    if (!b64Data || !signature) return { valid: false };
    const expectedSig = crypto.createHmac('sha256', SERVER_SESSION_SECRET).update(b64Data).digest('base64url');
    if (signature !== expectedSig) return { valid: false };
    try {
      const data = JSON.parse(Buffer.from(b64Data, 'base64url').toString('utf8'));
      if (Date.now() - (data.timestamp || 0) > 14 * 24 * 60 * 60 * 1000) {
        return { valid: false };
      }
      return { valid: true, uid: data.uid, email: data.email };
    } catch {
      return { valid: false };
    }
  }

  // API Route - First-Run Super Admin Setup
  app.post("/api/auth/bootstrap-platform-owner", otpRateLimiter, async (req, res) => {
    try {
      // 1. Live Firestore check: Reject if any Super Admin / SystemAdmin / Platform Owner exists
      const sysAdminSnap = await adminDb.collection("users").where("role", "==", "SystemAdmin").limit(1).get();
      let hasOwner = !sysAdminSnap.empty;
      if (!hasOwner) {
        const superAdminSnap = await adminDb.collection("users").where("role", "==", "super_admin").limit(1).get();
        hasOwner = !superAdminSnap.empty;
      }
      if (!hasOwner) {
        const ownerSnap = await adminDb.collection("users").where("is_platform_owner", "==", true).limit(1).get();
        hasOwner = !ownerSnap.empty;
      }

      if (hasOwner) {
        return res.status(403).json({
          success: false,
          message: "الحساب الرئيسي تم إعداده بالفعل / Platform owner already set up."
        });
      }

      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, message: "يرجى إدخال البريد الإلكتروني وكلمة المرور." });
      }

      const emailLower = email.toLowerCase().trim();
      if (!process.env.PLATFORM_OWNER_EMAIL) {
        console.error("CRITICAL: PLATFORM_OWNER_EMAIL environment variable is not set. Refusing to bootstrap.");
        return res.status(500).json({ success: false, message: "Platform owner email is not configured on the server." });
      }
      const configuredOwnerEmail = process.env.PLATFORM_OWNER_EMAIL.toLowerCase().trim();

      // 2. Strict email match against PLATFORM_OWNER_EMAIL environment variable
      if (emailLower !== configuredOwnerEmail) {
        return res.status(400).json({
          success: false,
          message: "البريد الإلكتروني المكتوب لا يطابق بريد المدير الأساسي المعتمد في المنصة."
        });
      }

      // 3. Strict password strength validation (min 12 chars, letters + numbers)
      if (password.length < 12 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        return res.status(400).json({
          success: false,
          message: "كلمة المرور يجب أن تتكون من 12 حرف على الأقل، وتحتوي على حروف وأرقام."
        });
      }

      // 4. Create or update user in Firebase Auth
      let authUser;
      try {
        authUser = await getAdminAuth(adminApp).getUserByEmail(emailLower);
        await getAdminAuth(adminApp).updateUser(authUser.uid, { password });
      } catch (e) {
        authUser = await getAdminAuth(adminApp).createUser({
          email: emailLower,
          password,
          displayName: "Super Admin",
        });
      }
      const userId = authUser.uid;

      // 5. Create user doc in 'users' collection
      const userDocData = {
        id: userId,
        email: emailLower,
        full_name: "Super Admin",
        role: "SystemAdmin",
        is_active: true,
        is_platform_owner: true,
        company_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        permissions: {
          create_expense: true, edit_expense: true, delete_expense: true,
          create_voucher: true, approve_voucher: true, reject_voucher: true,
          create_custody: true, edit_custody: true, replace_custody: true,
          view_reports: true, manage_users: true, manage_companies: true,
          manage_regions: true, manage_stations: true, manage_roles: true,
          manage_settings: true, settle_voucher: true,
        }
      };
      await adminDb.collection("users").doc(userId).set(userDocData);

      // 6. Hash password with PBKDF2 210,000 iterations and store in 'user_credentials' vault
      const salt = crypto.randomUUID();
      const pbkdf2Hash = hashPasswordPBKDF2_210k(password, salt, 2);
      await adminDb.collection("user_credentials").doc(userId).set({
        id: userId,
        company_id: 'platform',
        email: emailLower,
        passwordHash: pbkdf2Hash,
        salt,
        kdf: 'sha256_pbkdf2_210k',
        pepper_version: 2,
        updated_at: new Date().toISOString()
      });

      // 7. Issue custom token & server session token
      const customToken = await getAdminAuth(adminApp).createCustomToken(userId);
      const serverSessionToken = signServerSessionToken({
        uid: userId,
        email: emailLower,
        role: "SystemAdmin",
        company_id: undefined
      });

      return res.json({
        success: true,
        user: userDocData,
        customToken,
        sessionToken: serverSessionToken
      });
    } catch (err: any) {
      console.error("bootstrap-platform-owner error:", err);
      return res.status(500).json({ success: false, message: err?.message || "Error bootstrapping platform owner" });
    }
  });

  // API Route - Issue HttpOnly Session Cookie (Defense-in-depth against XSS)
  app.post("/api/auth/session", sessionRateLimiter, async (req, res) => {
    try {
      let idToken = req.body?.idToken;
      if (!idToken) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          idToken = authHeader.substring(7);
        }
      }

      if (!idToken) {
        return res.status(401).json({ success: false, message: "ID Token is required" });
      }

      let uid: string | null = null;
      let sessionCookie: string | null = null;
      const expiresIn = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds

      try {
        const decoded = await getAdminAuth(adminApp).verifyIdToken(idToken);
        uid = decoded.uid;
        sessionCookie = await getAdminAuth(adminApp).createSessionCookie(idToken, { expiresIn });
      } catch (verifyErr) {
        const serverToken = verifyServerSessionToken(idToken);
        if (serverToken.valid && serverToken.uid) {
          uid = serverToken.uid;
        } else {
          return res.status(401).json({ success: false, message: "Invalid ID Token" });
        }
      }

      if (sessionCookie) {
        res.cookie('session', sessionCookie, {
          maxAge: expiresIn,
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          path: '/'
        });
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.error("Session creation error:", err);
      return res.status(500).json({ success: false, message: "Failed to create session" });
    }
  });

  // API Route - Revoke Session Cookie & Clear
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const sessionCookie = req.cookies?.session;
      if (sessionCookie) {
        try {
          const decodedClaims = await getAdminAuth(adminApp).verifySessionCookie(sessionCookie);
          if (decodedClaims?.uid) {
            await getAdminAuth(adminApp).revokeRefreshTokens(decodedClaims.uid);
          }
        } catch (_) {
          // Ignore invalid or expired session cookie
        }
      }
    } catch (err) {
      console.error("Logout session revocation error:", err);
    } finally {
      res.clearCookie('session', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/'
      });
      res.clearCookie('session', { path: '/' });
      return res.json({ success: true });
    }
  });

  // Helper for Authenticating requests via Bearer Token, Server Session Token, or Session Cookie
  async function authenticateSessionOrBearer(req: express.Request): Promise<{ authenticated: boolean; statusCode: number; message: string; user?: any }> {
    let uid: string | null = null;

    // 1. Check Bearer Token from Authorization Header first (explicit active client token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token) {
        try {
          const decoded = await getAdminAuth(adminApp).verifyIdToken(token);
          uid = decoded.uid;
        } catch (_) {
          // Fallback to server-signed session token
          const serverToken = verifyServerSessionToken(token);
          if (serverToken.valid && serverToken.uid) {
            uid = serverToken.uid;
          }
        }
      }
    }

    // 2. Check x-session-token custom header
    if (!uid) {
      const customHeaderToken = req.headers['x-session-token'];
      if (typeof customHeaderToken === 'string' && customHeaderToken.trim()) {
        const serverToken = verifyServerSessionToken(customHeaderToken.trim());
        if (serverToken.valid && serverToken.uid) {
          uid = serverToken.uid;
        }
      }
    }

    // 3. Check Session Cookie if Bearer Token is missing/invalid
    if (!uid) {
      const sessionCookie = req.cookies?.session;
      if (sessionCookie) {
        try {
          const decoded = await getAdminAuth(adminApp).verifySessionCookie(sessionCookie, true);
          uid = decoded.uid;
        } catch (_) {
          const serverToken = verifyServerSessionToken(sessionCookie);
          if (serverToken.valid && serverToken.uid) {
            uid = serverToken.uid;
          }
        }
      }
    }

    if (!uid) {
      return { authenticated: false, statusCode: 401, message: "Unauthorized: Missing or invalid authentication token or session cookie." };
    }

    try {
      const userDoc = await adminDb.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        return { authenticated: false, statusCode: 403, message: "Forbidden: Authenticated user record not found." };
      }

      const userData = userDoc.data();
      if (!userData || userData.is_active === false) {
        return { authenticated: false, statusCode: 403, message: "Forbidden: User account is inactive." };
      }

      return { authenticated: true, statusCode: 200, message: "Authorized", user: { ...userData, id: uid } };
    } catch (err: any) {
      console.error("Auth check error in authenticateSessionOrBearer:", err);
      return { authenticated: false, statusCode: 500, message: "Server error during authentication check." };
    }
  }

  // API Route - Unified Secure User Provisioning Endpoint (POST /api/admin/users)
  app.post("/api/admin/users", adminRateLimiter, async (req, res) => {
    try {
      // 1. AuthN
      const authResult = await authenticateSessionOrBearer(req);
      if (!authResult.authenticated) {
        return res.status(authResult.statusCode).json({ success: false, message: authResult.message });
      }

      const creator = authResult.user;
      const isPlatformAdmin = await isPlatformAdminUser(creator.email, creator);

      // 2. AuthZ
      const isRegionalManager = creator.role === "RegionalManager" || creator.role === "BranchManager";
      const canManageUsers = isPlatformAdmin || creator.role === "Admin" || (isRegionalManager && req.body?.role === "StationAdmin");

      if (!canManageUsers) {
        return res.status(403).json({ success: false, message: "Forbidden: Insufficient privileges to manage users / غير مصرح لك بإدارة المستخدمين." });
      }

      const {
        email,
        full_name,
        role,
        company_id,
        region_id,
        station_id,
        org_unit_id,
        assigned_org_unit_ids,
        permissions,
        password,
        must_change_password
      } = req.body || {};

      // Determine effective password (manual if provided >= 12 chars, otherwise auto-generate >= 16 chars)
      let effectivePassword = "";
      let isGeneratedPassword = false;
      if (password !== undefined && password !== null && typeof password === 'string' && password.trim() !== '') {
        const trimmed = password.trim();
        if (trimmed.length < 12) {
          return res.status(400).json({
            success: false,
            message: "كلمة المرور يجب أن لا تقل عن 12 حرفاً / Password must be at least 12 characters."
          });
        }
        effectivePassword = trimmed;
      } else {
        effectivePassword = generateSecureTemporaryPassword();
        isGeneratedPassword = true;
      }

      // 3. Validation: Prevent creating SystemAdmin or setting is_platform_owner
      if (role === 'SystemAdmin' || role === 'super_admin' || req.body.is_platform_owner === true) {
        return res.status(403).json({ success: false, message: "لا يمكن إنشاء حساب مدير نظام من هذا المسار / Cannot create SystemAdmin or Platform Owner via this endpoint." });
      }

      // Required fields validation
      if (!email || typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({ success: false, message: "البريد الإلكتروني مطلوب / Email is required." });
      }
      if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
        return res.status(400).json({ success: false, message: "الاسم الكامل مطلوب / Full name is required." });
      }
      if (!role || typeof role !== 'string' || !role.trim()) {
        return res.status(400).json({ success: false, message: "الدور الوظيفي مطلوب / Role is required." });
      }

      const emailLower = email.toLowerCase().trim();

      // Automatic Company resolution from scope / org unit / region / station / fallback
      let effectiveCompanyId = (company_id && typeof company_id === 'string' && company_id.trim()) 
        ? company_id.trim() 
        : (!isPlatformAdmin ? (creator.company_id || "") : "");

      if (!effectiveCompanyId) {
        const targetOrgId = org_unit_id || region_id || station_id;
        if (targetOrgId) {
          try {
            const orgDoc = await adminDb.collection("organization_units").doc(targetOrgId).get();
            if (orgDoc.exists) {
              effectiveCompanyId = orgDoc.data()?.companyId || orgDoc.data()?.company_id || "";
            } else {
              const orgCodeSnap = await adminDb.collection("organization_units").where("code", "==", targetOrgId).limit(1).get();
              if (!orgCodeSnap.empty) {
                effectiveCompanyId = orgCodeSnap.docs[0].data()?.companyId || orgCodeSnap.docs[0].data()?.company_id || "";
              } else {
                const regDoc = await adminDb.collection("regions").doc(targetOrgId).get();
                if (regDoc.exists) {
                  effectiveCompanyId = regDoc.data()?.company_id || "";
                } else {
                  const stDoc = await adminDb.collection("stations").doc(targetOrgId).get();
                  if (stDoc.exists) {
                    effectiveCompanyId = stDoc.data()?.company_id || "";
                  }
                }
              }
            }
          } catch (scopeLookupErr) {
            console.warn("Scope lookup error in user provisioning:", scopeLookupErr);
          }
        }
      }

      if (!effectiveCompanyId && isPlatformAdmin) {
        try {
          const compSnap = await adminDb.collection("companies").limit(1).get();
          if (!compSnap.empty) {
            effectiveCompanyId = compSnap.docs[0].id;
          }
        } catch (compLookupErr) {
          console.warn("Company lookup error:", compLookupErr);
        }
      }

      // Company Admin Scope Check
      if (!isPlatformAdmin) {
        if (!effectiveCompanyId || effectiveCompanyId !== creator.company_id || (company_id && company_id !== creator.company_id)) {
          return res.status(403).json({ success: false, message: "غير مصرح لك بإضافة مستخدم لشركة أخرى / Admin cannot create user for another company." });
        }
      } else {
        if (!effectiveCompanyId || typeof effectiveCompanyId !== 'string' || !effectiveCompanyId.trim()) {
          return res.status(400).json({ success: false, message: "معرف الشركة مطلوب / company_id is required." });
        }
      }

      // Role-specific binding requirements
      if (role === 'Admin' && !effectiveCompanyId) {
        return res.status(400).json({ success: false, message: "معرف الشركة مطلوب لدور مدير الشركة / company_id is required for Admin." });
      }
      if (role === 'RegionalManager' && (!region_id || typeof region_id !== 'string' || !region_id.trim())) {
        return res.status(400).json({ success: false, message: "المنطقة مطلوبة لهذا الدور / region_id is required for RegionalManager." });
      }
      if (role === 'StationAdmin' && (!station_id || typeof station_id !== 'string' || !station_id.trim())) {
        return res.status(400).json({ success: false, message: "المحطة مطلوبة لهذا الدور / station_id is required for StationAdmin." });
      }

      // Region/Station belong to company check (supports legacy collections & modern organization_units) - FAIL-CLOSED
      if (region_id) {
        let isValidRegion = false;
        let regionFound = false;
        let infraError = false;
        let matchedOrgUnitData: any = null;
        let matchedOrgUnitId: string | null = null;
        try {
          const regDoc = await adminDb.collection("regions").doc(region_id).get();
          if (regDoc.exists) {
            regionFound = true;
            const regData = regDoc.data();
            const regCompId = regData?.company_id;
            if (!effectiveCompanyId || regCompId === effectiveCompanyId) {
              isValidRegion = true;
              if (!effectiveCompanyId && regCompId) effectiveCompanyId = regCompId;
            }
          } else {
            const orgDoc = await adminDb.collection("organization_units").doc(region_id).get();
            if (orgDoc.exists) {
              const orgData = orgDoc.data();
              const isRegionType = orgData?.typeId === 'out-region' || orgData?.type_id === 'out-region' || orgData?.typeId === 'out-sector' || orgData?.type_id === 'out-sector' || Boolean(orgData?.metadata?.legacyRegionId);
              if (isRegionType) {
                regionFound = true;
                matchedOrgUnitData = orgData;
                matchedOrgUnitId = orgDoc.id;
                const orgCompId = orgData?.companyId || orgData?.company_id;
                if (!effectiveCompanyId || orgCompId === effectiveCompanyId) {
                  isValidRegion = true;
                  if (!effectiveCompanyId && orgCompId) effectiveCompanyId = orgCompId;
                }
              }
            } else {
              const orgCodeSnap = await adminDb.collection("organization_units").where("code", "==", region_id).limit(1).get();
              if (!orgCodeSnap.empty) {
                const orgData = orgCodeSnap.docs[0].data();
                const isRegionType = orgData?.typeId === 'out-region' || orgData?.type_id === 'out-region' || orgData?.typeId === 'out-sector' || orgData?.type_id === 'out-sector' || Boolean(orgData?.metadata?.legacyRegionId);
                if (isRegionType) {
                  regionFound = true;
                  matchedOrgUnitData = orgData;
                  matchedOrgUnitId = orgCodeSnap.docs[0].id;
                  const orgCompId = orgData?.companyId || orgData?.company_id;
                  if (!effectiveCompanyId || orgCompId === effectiveCompanyId) {
                    isValidRegion = true;
                    if (!effectiveCompanyId && orgCompId) effectiveCompanyId = orgCompId;
                  }
                }
              }
            }
          }

          // Auto-mirror legacy region document if resolved through organization_units
          if (isValidRegion && matchedOrgUnitData && matchedOrgUnitId) {
            try {
              await adminDb.collection("regions").doc(matchedOrgUnitId).set({
                id: matchedOrgUnitId,
                name: matchedOrgUnitData.nameAr || matchedOrgUnitData.name || region_id,
                code: matchedOrgUnitData.code || '',
                company_id: effectiveCompanyId,
                org_unit_id: matchedOrgUnitId,
                created_at: new Date().toISOString()
              }, { merge: true });
            } catch (mirrorErr) {
              console.warn("Could not mirror region doc:", mirrorErr);
            }
          }
        } catch (regLookupErr) {
          console.error("Infrastructure error during region verification:", regLookupErr);
          infraError = true;
        }

        if (infraError) {
          return res.status(503).json({
            success: false,
            message: "تعذر التحقق من بيانات المنطقة بسبب خطأ في الخادم، يرجى إعادة المحاولة / Infrastructure error verifying region. Please retry."
          });
        }

        if (!regionFound || !isValidRegion) {
          return res.status(400).json({
            success: false,
            message: "المنطقة غير موجودة أو لا تنتمي للشركة المحجوزة / Region does not exist or does not belong to company."
          });
        }
      }

      let resolvedStationRegionId: string | null = null;
      if (station_id) {
        let isValidStation = false;
        let stationFound = false;
        let infraError = false;
        let matchedStationOrgData: any = null;
        let matchedStationOrgId: string | null = null;
        try {
          const stDoc = await adminDb.collection("stations").doc(station_id).get();
          if (stDoc.exists) {
            stationFound = true;
            const stData = stDoc.data();
            const stCompId = stData?.company_id;
            resolvedStationRegionId = stData?.region_id || null;
            if (!effectiveCompanyId || stCompId === effectiveCompanyId) {
              isValidStation = true;
              if (!effectiveCompanyId && stCompId) effectiveCompanyId = stCompId;
            }
          } else {
            const orgDoc = await adminDb.collection("organization_units").doc(station_id).get();
            if (orgDoc.exists) {
              stationFound = true;
              matchedStationOrgData = orgDoc.data();
              matchedStationOrgId = orgDoc.id;
              const orgData = matchedStationOrgData;
              const orgCompId = orgData?.companyId || orgData?.company_id;
              resolvedStationRegionId = orgData?.metadata?.legacyRegionId || orgData?.metadata?.legacy_region_id || null;
              if (!resolvedStationRegionId && orgData?.parentId) {
                const parentDoc = await adminDb.collection("organization_units").doc(orgData.parentId).get();
                if (parentDoc.exists) {
                  const parentData = parentDoc.data();
                  resolvedStationRegionId = parentData?.metadata?.legacyRegionId || parentData?.metadata?.legacy_region_id || parentDoc.id.replace('org-unit-region-', '');
                }
              }
              if (!effectiveCompanyId || orgCompId === effectiveCompanyId) {
                isValidStation = true;
                if (!effectiveCompanyId && orgCompId) effectiveCompanyId = orgCompId;
              }
            } else {
              const orgCodeSnap = await adminDb.collection("organization_units").where("code", "==", station_id).limit(1).get();
              if (!orgCodeSnap.empty) {
                stationFound = true;
                matchedStationOrgData = orgCodeSnap.docs[0].data();
                matchedStationOrgId = orgCodeSnap.docs[0].id;
                const orgData = matchedStationOrgData;
                const orgCompId = orgData?.companyId || orgData?.company_id;
                resolvedStationRegionId = orgData?.metadata?.legacyRegionId || orgData?.metadata?.legacy_region_id || null;
                if (!effectiveCompanyId || orgCompId === effectiveCompanyId) {
                  isValidStation = true;
                  if (!effectiveCompanyId && orgCompId) effectiveCompanyId = orgCompId;
                }
              }
            }
          }

          // Auto-mirror legacy station document if resolved through organization_units
          if (isValidStation && matchedStationOrgData && matchedStationOrgId) {
            try {
              await adminDb.collection("stations").doc(matchedStationOrgId).set({
                id: matchedStationOrgId,
                station_name: matchedStationOrgData.nameAr || matchedStationOrgData.name || station_id,
                station_code: matchedStationOrgData.code || '',
                custody_amount: matchedStationOrgData.metadata?.custodyAmount || 0,
                company_id: effectiveCompanyId,
                region_id: resolvedStationRegionId || null,
                org_unit_id: matchedStationOrgId,
                created_at: new Date().toISOString()
              }, { merge: true });
            } catch (mirrorErr) {
              console.warn("Could not mirror station doc:", mirrorErr);
            }
          }
        } catch (stLookupErr) {
          console.error("Infrastructure error during station verification:", stLookupErr);
          infraError = true;
        }

        if (infraError) {
          return res.status(503).json({
            success: false,
            message: "تعذر التحقق من بيانات المحطة بسبب خطأ في الخادم، يرجى إعادة المحاولة / Infrastructure error verifying station. Please retry."
          });
        }

        if (!stationFound || !isValidStation) {
          return res.status(400).json({
            success: false,
            message: "المحطة غير موجودة أو لا تنتمي للشركة المحجوزة / Station does not exist or does not belong to company."
          });
        }
      }

      // Check RegionalManager authorization over station
      if (isRegionalManager && role === "StationAdmin") {
        const creatorRegionId = creator.region_id || creator.scoped_region_id;
        const targetRegionId = resolvedStationRegionId || region_id;
        if (!creatorRegionId || (targetRegionId && targetRegionId !== creatorRegionId)) {
          return res.status(403).json({
            success: false,
            message: "غير مصرح: مصرح فقط بإنشاء مدراء محطات تابعين لمنطقتك / Forbidden: You can only create station admins for stations within your assigned region."
          });
        }
      }

      // Unique email check in Firestore 'users' collection
      const existingUserSnap = await adminDb.collection("users").where("email", "==", emailLower).limit(1).get();
      if (!existingUserSnap.empty) {
        const existingDoc = existingUserSnap.docs[0];
        const existingData = existingDoc.data();

        // 1. Check if the user belongs to a deleted/non-existent company
        let isOrphanedCompany = false;
        if (existingData?.company_id) {
          try {
            const compDoc = await adminDb.collection("companies").doc(existingData.company_id).get();
            if (!compDoc.exists) {
              isOrphanedCompany = true;
            }
          } catch (_) {}
        }

        if (isOrphanedCompany) {
          // Auto-purge ghost user record from the deleted company and allow provisioning
          console.warn(`[POST /api/admin/users] Auto-purging orphaned user ${existingDoc.id} from deleted company ${existingData?.company_id}`);
          try {
            await adminDb.collection("users").doc(existingDoc.id).delete();
            await adminDb.collection("user_credentials").doc(existingDoc.id).delete();
            const authClient = getAdminAuth(adminApp);
            if (authClient) await authClient.deleteUser(existingDoc.id).catch(() => {});
          } catch (purgeErr) {
            console.warn("Could not purge orphaned user:", purgeErr);
          }
        } else if (existingData?.company_id === effectiveCompanyId && existingData?.is_active === false) {
          // 2. Reactivate and update previously deactivated user in the same company
          console.warn(`[POST /api/admin/users] Reactivating inactive user ${existingDoc.id} in company ${effectiveCompanyId}`);
          const updatedUserData = {
            ...existingData,
            role,
            full_name: full_name.trim(),
            company_id: effectiveCompanyId,
            region_id: region_id || null,
            station_id: station_id || null,
            is_active: true,
            updated_at: new Date().toISOString()
          };
          await adminDb.collection("users").doc(existingDoc.id).set(updatedUserData, { merge: true });

          // Update password in credentials vault and Auth
          const salt = crypto.randomUUID();
          const pbkdf2Hash = hashPasswordPBKDF2_210k(effectivePassword, salt, 2);
          await adminDb.collection("user_credentials").doc(existingDoc.id).set({
            id: existingDoc.id,
            company_id: effectiveCompanyId,
            email: emailLower,
            passwordHash: pbkdf2Hash,
            salt,
            kdf: 'sha256_pbkdf2_210k',
            pepper_version: 2,
            updated_at: new Date().toISOString()
          }, { merge: true });

          const authClient = getAdminAuth(adminApp);
          if (authClient) {
            try {
              await authClient.updateUser(existingDoc.id, {
                password: effectivePassword,
                displayName: full_name.trim(),
                disabled: false
              });
            } catch (_) {}
          }

          return res.status(201).json({
            success: true,
            message: "تم إعادة تفعيل وتحديث بيانات المستخدم بنجاح / User reactivated successfully.",
            user: updatedUserData,
            temporaryPassword: effectivePassword,
            isGeneratedPassword
          });
        } else {
          return res.status(400).json({ success: false, message: "البريد الإلكتروني مسجل بالفعل / Email already exists." });
        }
      }

      // Check Firebase Auth
      let existingAuthUser = null;
      const authClient = getAdminAuth(adminApp);
      if (authClient) {
        try {
          existingAuthUser = await authClient.getUserByEmail(emailLower);
        } catch (_) {
          // Expected if user does not exist in Auth
        }
      }

      let userId = '';
      if (existingAuthUser) {
        // Orphaned or existing Auth user: synchronize password & display name with effectivePassword
        if (authClient) {
          try {
            await authClient.updateUser(existingAuthUser.uid, {
              password: effectivePassword,
              displayName: full_name.trim()
            });
          } catch (updateAuthErr: any) {
            console.error("Auth updateUser error:", updateAuthErr?.message);
            return res.status(500).json({
              success: false,
              message: "فشل تحديث بيانات المستخدم في Firebase Auth / Failed to update user in Firebase Auth: " + (updateAuthErr?.message || "Unknown error")
            });
          }
        }
        userId = existingAuthUser.uid;
      } else {
        // Create Firebase Auth user with effective password
        if (authClient) {
          try {
            const authUser = await authClient.createUser({
              email: emailLower,
              password: effectivePassword,
              displayName: full_name.trim()
            });
            userId = authUser.uid;
          } catch (createAuthErr: any) {
            console.error("Auth createUser error:", createAuthErr?.message);
            return res.status(500).json({
              success: false,
              message: "فشل إنشاء حساب المستخدم في Firebase Auth / Failed to create user in Firebase Auth: " + (createAuthErr?.message || "Unknown error")
            });
          }
        } else {
          userId = 'user-' + crypto.randomUUID();
        }
      }

      // Vault password in 'user_credentials' with PBKDF2 210,000 iterations
      const salt = crypto.randomUUID();
      const pbkdf2Hash = hashPasswordPBKDF2_210k(effectivePassword, salt, 2);
      const credPayload = {
        id: userId,
        company_id: effectiveCompanyId,
        email: emailLower,
        passwordHash: pbkdf2Hash,
        password: pbkdf2Hash,
        salt: salt,
        kdf: 'sha256_pbkdf2_210k',
        pepper_version: 2,
        is_temporary: true,
        updated_at: new Date().toISOString()
      };
      await adminDb.collection("user_credentials").doc(userId).set(credPayload, { merge: true });
      await adminDb.collection("user_credentials").doc(emailLower).set(credPayload, { merge: true });

      // Construct 'users' document WITHOUT plaintext password field
      const userDocData = {
        id: userId,
        email: emailLower,
        full_name: full_name.trim(),
        role: role.trim(),
        company_id: effectiveCompanyId,
        region_id: region_id || null,
        station_id: station_id || null,
        org_unit_id: org_unit_id || null,
        assigned_org_unit_ids: Array.isArray(assigned_org_unit_ids) ? assigned_org_unit_ids : [],
        permissions: permissions && typeof permissions === 'object' ? permissions : {},
        must_change_password: typeof must_change_password === 'boolean' ? must_change_password : true,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await adminDb.collection("users").doc(userId).set(userDocData);

      // Audit Log
      try {
        await adminDb.collection("audit_logs").add({
          action: "user_provisioned",
          performed_by: creator.id || creator.email,
          performed_by_email: creator.email,
          target_user_id: userId,
          target_email: emailLower,
          company_id: effectiveCompanyId,
          timestamp: new Date().toISOString(),
          details: { role, full_name, region_id, station_id, org_unit_id }
        });
      } catch (auditErr) {
        console.warn("Audit log write failed during user creation:", auditErr);
      }

      return res.status(201).json({
        success: true,
        temporaryPassword: effectivePassword,
        user: userDocData
      });
    } catch (err: any) {
      console.error("Error creating user in /api/admin/users:", err);
      return res.status(500).json({ success: false, message: err?.message || "Internal server error creating user." });
    }
  });

  // API Route - Unified Secure User Update Endpoint (PATCH /api/admin/users/:id)
  app.patch("/api/admin/users/:id", adminRateLimiter, async (req, res) => {
    try {
      const authResult = await authenticateSessionOrBearer(req);
      if (!authResult.authenticated) {
        return res.status(authResult.statusCode).json({ success: false, message: authResult.message });
      }

      const creator = authResult.user;
      const isPlatformAdmin = await isPlatformAdminUser(creator.email, creator);

      const targetUserId = req.params.id;
      if (!targetUserId) {
        return res.status(400).json({ success: false, message: "Target user ID is required." });
      }

      const targetDoc = await adminDb.collection("users").doc(targetUserId).get();
      if (!targetDoc.exists) {
        return res.status(404).json({ success: false, message: "المستخدم غير موجود / User not found." });
      }

      const targetData = targetDoc.data() || {};
      const isTargetPlatformAdmin = await isPlatformAdminUser(targetData.email, targetData);

      const isRegionalManager = creator.role === "RegionalManager" || creator.role === "BranchManager";
      const canUpdate = isPlatformAdmin || creator.role === "Admin" || (isRegionalManager && targetData.role === "StationAdmin" && (!req.body?.role || req.body.role === "StationAdmin"));

      if (!canUpdate) {
        return res.status(403).json({ success: false, message: "Forbidden: Insufficient privileges / غير مصرح لك بتحديث المستخدمين." });
      }

      if (isRegionalManager) {
        const creatorRegionId = creator.region_id || creator.scoped_region_id;
        if (!creatorRegionId || targetData.region_id !== creatorRegionId) {
          return res.status(403).json({
            success: false,
            message: "غير مصرح: مصرح فقط بتعديل مدراء محطات تابعين لمنطقتك / Forbidden: You can only modify station admins within your assigned region."
          });
        }
      }

      // SystemAdmin / Platform Owner protection
      if (isTargetPlatformAdmin && !isPlatformAdmin) {
        return res.status(403).json({ success: false, message: "غير مصرح لك بتعديل بيانات مدير النظام / Cannot modify SystemAdmin user." });
      }

      const {
        full_name,
        role,
        company_id,
        region_id,
        station_id,
        org_unit_id,
        assigned_org_unit_ids,
        permissions,
        is_active,
        must_change_password,
        password
      } = req.body || {};

      // Cannot promote to SystemAdmin via this endpoint
      if (role === 'SystemAdmin' || role === 'super_admin' || req.body.is_platform_owner === true) {
        return res.status(403).json({ success: false, message: "لا يمكن الترقية إلى مدير نظام عبر هذا المسار / Cannot promote to SystemAdmin via this endpoint." });
      }

      // Company Admin Scope Check
      if (!isPlatformAdmin && !isRegionalManager) {
        if (targetData.company_id !== creator.company_id) {
          return res.status(403).json({ success: false, message: "غير مصرح لك بتعديل مستخدم ينتمي لشركة أخرى / Admin cannot edit user from another company." });
        }
        if (company_id !== undefined && company_id !== creator.company_id) {
          return res.status(403).json({ success: false, message: "غير مصرح لك بنقل مستخدم لشركة أخرى / Admin cannot move user to another company." });
        }
      }

      let effectiveCompanyId = company_id !== undefined ? company_id : targetData.company_id;
      const effectiveRole = role !== undefined ? role : targetData.role;
      const effectiveRegionId = region_id !== undefined ? region_id : targetData.region_id;
      const effectiveStationId = station_id !== undefined ? station_id : targetData.station_id;

      // Role-specific binding validation on effective values
      if (effectiveRole === 'RegionalManager' && !effectiveRegionId) {
        return res.status(400).json({ success: false, message: "المنطقة مطلوبة لهذا الدور / region_id is required for RegionalManager." });
      }
      if (effectiveRole === 'StationAdmin' && !effectiveStationId) {
        return res.status(400).json({ success: false, message: "المحطة مطلوبة لهذا الدور / station_id is required for StationAdmin." });
      }

      // Validate region/station belong to company if changed or set - FAIL-CLOSED
      if (region_id) {
        let isValidRegion = false;
        let regionFound = false;
        let infraError = false;
        let matchedOrgUnitData: any = null;
        let matchedOrgUnitId: string | null = null;
        try {
          const regDoc = await adminDb.collection("regions").doc(region_id).get();
          if (regDoc.exists) {
            regionFound = true;
            const regData = regDoc.data();
            const regCompId = regData?.company_id;
            if (!effectiveCompanyId || regCompId === effectiveCompanyId) {
              isValidRegion = true;
              if (!effectiveCompanyId && regCompId) effectiveCompanyId = regCompId;
            }
          } else {
            const orgDoc = await adminDb.collection("organization_units").doc(region_id).get();
            if (orgDoc.exists) {
              const orgData = orgDoc.data();
              const isRegionType = orgData?.typeId === 'out-region' || orgData?.type_id === 'out-region' || orgData?.typeId === 'out-sector' || orgData?.type_id === 'out-sector' || Boolean(orgData?.metadata?.legacyRegionId);
              if (isRegionType) {
                regionFound = true;
                matchedOrgUnitData = orgData;
                matchedOrgUnitId = orgDoc.id;
                const orgCompId = orgData?.companyId || orgData?.company_id;
                if (!effectiveCompanyId || orgCompId === effectiveCompanyId) {
                  isValidRegion = true;
                  if (!effectiveCompanyId && orgCompId) effectiveCompanyId = orgCompId;
                }
              }
            } else {
              const orgCodeSnap = await adminDb.collection("organization_units").where("code", "==", region_id).limit(1).get();
              if (!orgCodeSnap.empty) {
                const orgData = orgCodeSnap.docs[0].data();
                const isRegionType = orgData?.typeId === 'out-region' || orgData?.type_id === 'out-region' || orgData?.typeId === 'out-sector' || orgData?.type_id === 'out-sector' || Boolean(orgData?.metadata?.legacyRegionId);
                if (isRegionType) {
                  regionFound = true;
                  matchedOrgUnitData = orgData;
                  matchedOrgUnitId = orgCodeSnap.docs[0].id;
                  const orgCompId = orgData?.companyId || orgData?.company_id;
                  if (!effectiveCompanyId || orgCompId === effectiveCompanyId) {
                    isValidRegion = true;
                    if (!effectiveCompanyId && orgCompId) effectiveCompanyId = orgCompId;
                  }
                }
              }
            }
          }

          if (isValidRegion && matchedOrgUnitData && matchedOrgUnitId) {
            try {
              await adminDb.collection("regions").doc(matchedOrgUnitId).set({
                id: matchedOrgUnitId,
                name: matchedOrgUnitData.nameAr || matchedOrgUnitData.name || region_id,
                code: matchedOrgUnitData.code || '',
                company_id: effectiveCompanyId,
                org_unit_id: matchedOrgUnitId,
                created_at: new Date().toISOString()
              }, { merge: true });
            } catch (mErr) {
              console.warn("Could not mirror region in PATCH:", mErr);
            }
          }
        } catch (regErr) {
          console.error("Infrastructure error during region verification in PATCH:", regErr);
          infraError = true;
        }

        if (infraError) {
          return res.status(503).json({
            success: false,
            message: "تعذر التحقق من بيانات المنطقة بسبب خطأ في الخادم، يرجى إعادة المحاولة / Infrastructure error verifying region. Please retry."
          });
        }

        if (!regionFound || !isValidRegion) {
          return res.status(400).json({
            success: false,
            message: "المنطقة غير موجودة أو لا تنتمي للشركة / Region does not exist or does not belong to company."
          });
        }
      }

      let resolvedStationRegionId: string | null = null;
      if (station_id) {
        let isValidStation = false;
        let stationFound = false;
        let infraError = false;
        let matchedStationOrgData: any = null;
        let matchedStationOrgId: string | null = null;
        try {
          const stDoc = await adminDb.collection("stations").doc(station_id).get();
          if (stDoc.exists) {
            stationFound = true;
            const stData = stDoc.data();
            const stCompId = stData?.company_id;
            resolvedStationRegionId = stData?.region_id || null;
            if (!effectiveCompanyId || stCompId === effectiveCompanyId) {
              isValidStation = true;
              if (!effectiveCompanyId && stCompId) effectiveCompanyId = stCompId;
            }
          } else {
            const orgDoc = await adminDb.collection("organization_units").doc(station_id).get();
            if (orgDoc.exists) {
              stationFound = true;
              matchedStationOrgData = orgDoc.data();
              matchedStationOrgId = orgDoc.id;
              const orgData = matchedStationOrgData;
              const orgCompId = orgData?.companyId || orgData?.company_id;
              resolvedStationRegionId = orgData?.metadata?.legacyRegionId || orgData?.metadata?.legacy_region_id || null;
              if (!resolvedStationRegionId && orgData?.parentId) {
                const parentDoc = await adminDb.collection("organization_units").doc(orgData.parentId).get();
                if (parentDoc.exists) {
                  const parentData = parentDoc.data();
                  resolvedStationRegionId = parentData?.metadata?.legacyRegionId || parentData?.metadata?.legacy_region_id || parentDoc.id.replace('org-unit-region-', '');
                }
              }
              if (!effectiveCompanyId || orgCompId === effectiveCompanyId) {
                isValidStation = true;
                if (!effectiveCompanyId && orgCompId) effectiveCompanyId = orgCompId;
              }
            } else {
              const orgCodeSnap = await adminDb.collection("organization_units").where("code", "==", station_id).limit(1).get();
              if (!orgCodeSnap.empty) {
                stationFound = true;
                matchedStationOrgData = orgCodeSnap.docs[0].data();
                matchedStationOrgId = orgCodeSnap.docs[0].id;
                const orgData = matchedStationOrgData;
                const orgCompId = orgData?.companyId || orgData?.company_id;
                resolvedStationRegionId = orgData?.metadata?.legacyRegionId || orgData?.metadata?.legacy_region_id || null;
                if (!effectiveCompanyId || orgCompId === effectiveCompanyId) {
                  isValidStation = true;
                  if (!effectiveCompanyId && orgCompId) effectiveCompanyId = orgCompId;
                }
              }
            }
          }

          if (isValidStation && matchedStationOrgData && matchedStationOrgId) {
            try {
              await adminDb.collection("stations").doc(matchedStationOrgId).set({
                id: matchedStationOrgId,
                station_name: matchedStationOrgData.nameAr || matchedStationOrgData.name || station_id,
                station_code: matchedStationOrgData.code || '',
                custody_amount: matchedStationOrgData.metadata?.custodyAmount || 0,
                company_id: effectiveCompanyId,
                region_id: resolvedStationRegionId || null,
                org_unit_id: matchedStationOrgId,
                created_at: new Date().toISOString()
              }, { merge: true });
            } catch (mStErr) {
              console.warn("Could not mirror station in PATCH:", mStErr);
            }
          }
        } catch (stErr) {
          console.error("Infrastructure error during station verification in PATCH:", stErr);
          infraError = true;
        }

        if (infraError) {
          return res.status(503).json({
            success: false,
            message: "تعذر التحقق من بيانات المحطة بسبب خطأ في الخادم، يرجى إعادة المحاولة / Infrastructure error verifying station. Please retry."
          });
        }

        if (!stationFound || !isValidStation) {
          return res.status(400).json({
            success: false,
            message: "المحطة غير موجودة أو لا تنتمي للشركة / Station does not exist or does not belong to company."
          });
        }
      }

      if (isRegionalManager && station_id) {
        const creatorRegionId = creator.region_id || creator.scoped_region_id;
        const targetRegionId = resolvedStationRegionId || region_id;
        if (!creatorRegionId || (targetRegionId && targetRegionId !== creatorRegionId)) {
          return res.status(403).json({
            success: false,
            message: "غير مصرح: مصرح فقط بتعيين مدراء محطات تابعين لمنطقتك / Forbidden: You can only assign station admins to stations within your assigned region."
          });
        }
      }

      // Password reset if password string provided
      if (password !== undefined && password !== null && password !== "") {
        if (typeof password !== 'string' || password.length < 12 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
          return res.status(400).json({
            success: false,
            message: "كلمة المرور يجب أن تتكون من 12 حرف على الأقل وتحتوي على حروف وأرقام / Password must be at least 12 characters long and contain letters and numbers."
          });
        }

        // Update password in Firebase Auth
        await getAdminAuth(adminApp).updateUser(targetUserId, { password });

        // Update vault
        const salt = crypto.randomUUID();
        const pbkdf2Hash = hashPasswordPBKDF2_210k(password, salt, 2);
        await adminDb.collection("user_credentials").doc(targetUserId).set({
          id: targetUserId,
          company_id: effectiveCompanyId,
          email: targetData.email,
          passwordHash: pbkdf2Hash,
          salt: salt,
          kdf: 'sha256_pbkdf2_210k',
          pepper_version: 2,
          updated_at: new Date().toISOString()
        }, { merge: true });
      }

      // Build updates for users doc
      const updates: any = {
        updated_at: new Date().toISOString()
      };
      if (full_name !== undefined) updates.full_name = String(full_name).trim();
      if (role !== undefined) updates.role = String(role).trim();
      if (company_id !== undefined) updates.company_id = company_id;
      if (region_id !== undefined) updates.region_id = region_id;
      if (station_id !== undefined) updates.station_id = station_id;
      if (org_unit_id !== undefined) updates.org_unit_id = org_unit_id;
      if (assigned_org_unit_ids !== undefined) updates.assigned_org_unit_ids = Array.isArray(assigned_org_unit_ids) ? assigned_org_unit_ids : [];
      if (permissions !== undefined) updates.permissions = permissions;
      if (is_active !== undefined) updates.is_active = Boolean(is_active);
      if (must_change_password !== undefined) updates.must_change_password = Boolean(must_change_password);

      await adminDb.collection("users").doc(targetUserId).update(updates);

      const updatedDoc = await adminDb.collection("users").doc(targetUserId).get();
      const updatedUser = updatedDoc.data();

      // Audit Log
      try {
        await adminDb.collection("audit_logs").add({
          action: "user_updated",
          performed_by: creator.id || creator.email,
          performed_by_email: creator.email,
          target_user_id: targetUserId,
          target_email: targetData.email,
          company_id: effectiveCompanyId,
          timestamp: new Date().toISOString(),
          details: { updated_fields: Object.keys(updates), password_reset: Boolean(password) }
        });
      } catch (auditErr) {
        console.warn("Audit log write failed during user update:", auditErr);
      }

      return res.json({
        success: true,
        user: updatedUser
      });
    } catch (err: any) {
      console.error("Error updating user in /api/admin/users/:id:", err);
      return res.status(500).json({ success: false, message: err?.message || "Internal server error updating user." });
    }
  });

  // API Route - Unified Secure User Deletion Endpoint (DELETE /api/admin/users/:id)
  app.delete("/api/admin/users/:id", adminRateLimiter, async (req, res) => {
    try {
      const authResult = await authenticateSessionOrBearer(req);
      if (!authResult.authenticated) {
        return res.status(authResult.statusCode).json({ success: false, message: authResult.message });
      }

      const creator = authResult.user;
      const isPlatformAdmin = await isPlatformAdminUser(creator.email, creator);

      const targetUserId = req.params.id;
      if (!targetUserId) {
        return res.status(400).json({ success: false, message: "User ID parameter is required." });
      }

      if (targetUserId === creator.id) {
        return res.status(400).json({ success: false, message: "Cannot delete your own active session account / لا يمكن حذف حسابك الحالي." });
      }

      const userDocRef = adminDb.collection("users").doc(targetUserId);
      const userDoc = await userDocRef.get();
      if (!userDoc.exists) {
        return res.status(404).json({ success: false, message: "Target user not found." });
      }

      const targetData = userDoc.data() || {};
      const targetEmail = (targetData.email || "").toLowerCase().trim();
      const targetRole = targetData.role;
      const targetCompanyId = targetData.company_id;

      // Check authorization:
      // - Platform Admin / SystemAdmin: Can delete any non-self user
      // - Company Admin (role === 'Admin'): Can delete non-SystemAdmin users within their own assigned company
      if (!isPlatformAdmin) {
        const isCompanyAdmin = creator.role === 'Admin' && creator.company_id && creator.company_id === targetCompanyId;
        const targetIsProtected = targetRole === 'SystemAdmin' || targetData.is_platform_owner === true;
        if (!isCompanyAdmin || targetIsProtected) {
          return res.status(403).json({
            success: false,
            message: "غير مصرح لك بحذف هذا المستخدم؛ يمكنك فقط حذف مستخدمي شركتك / Forbidden: You can only delete users belonging to your company."
          });
        }
      }

      // 1. Delete/Disable Firebase Auth User
      try {
        const authClient = getAdminAuth(adminApp);
        if (authClient) {
          try {
            await authClient.deleteUser(targetUserId);
          } catch (authDeleteErr: any) {
            if (authDeleteErr?.code !== 'auth/user-not-found') {
              try {
                // If delete fails, attempt to disable
                await authClient.updateUser(targetUserId, { disabled: true });
              } catch (disableErr) {
                console.warn("Could not disable Firebase Auth user during deletion:", disableErr);
              }
            }
          }
        }
      } catch (authInitErr) {
        console.warn("Firebase Admin Auth unavailable during deletion:", authInitErr);
      }

      // 2. Delete / Invalidate Credentials Vault documents
      const credDocsToDelete: string[] = [targetUserId];
      if (targetEmail) credDocsToDelete.push(targetEmail);
      for (const credId of credDocsToDelete) {
        try {
          await adminDb.collection("user_credentials").doc(credId).delete();
        } catch (credErr) {
          console.warn(`Could not delete user_credentials doc ${credId}:`, credErr);
        }
      }

      // 3. Delete or Mark Deleted in users collection
      await userDocRef.delete();

      // 4. Audit Log
      try {
        await adminDb.collection("audit_logs").add({
          action: "user_deleted",
          performed_by: creator.id || creator.email,
          performed_by_email: creator.email,
          target_user_id: targetUserId,
          target_email: targetEmail,
          company_id: targetData.company_id || creator.company_id || "",
          timestamp: new Date().toISOString(),
          details: { deleted_user_name: targetData.full_name, role: targetData.role }
        });
      } catch (auditErr) {
        console.warn("Audit log write failed during user delete:", auditErr);
      }

      return res.json({
        success: true,
        message: "User and associated authentication credentials permanently deleted."
      });
    } catch (err: any) {
      console.error("Error deleting user in /api/admin/users/:id:", err);
      return res.status(500).json({ success: false, message: err?.message || "Internal server error deleting user." });
    }
  });

  // API Route - Authoritative Company Creation Endpoint (POST /api/admin/companies)
  app.post("/api/admin/companies", adminRateLimiter, async (req, res) => {
    try {
      const authResult = await authenticateSessionOrBearer(req);
      if (!authResult.authenticated || !authResult.user) {
        return res.status(authResult.statusCode || 401).json({
          success: false,
          message: authResult.message || "Unauthorized"
        });
      }

      const requester = authResult.user;
      const isSystemAdmin = requester.role === "SystemAdmin" || await isPlatformAdminUser(requester.email, requester);
      if (!isSystemAdmin) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: SystemAdmin required."
        });
      }

      const { id, name, custody_value, subscription_plan, subscription_status, subscription_expiry } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: "Company name is required." });
      }

      const companyId = (id && String(id).trim()) || `comp-${crypto.randomUUID()}`;
      const companyDoc = {
        id: companyId,
        name: String(name).trim(),
        custody_value: Number(custody_value) || 0,
        is_active: true,
        subscription_status: subscription_status || 'active',
        subscription_plan: subscription_plan || 'Enterprise',
        subscription_expiry: subscription_expiry || '2028-12-31',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await adminDb.collection("companies").doc(companyId).set(companyDoc, { merge: true });

      // Remove from tombstone if re-created
      try {
        await adminDb.collection("deleted_companies").doc(companyId).delete();
      } catch (_) {}

      return res.status(201).json({
        success: true,
        company: companyDoc
      });
    } catch (err: any) {
      console.error("Error in /api/admin/companies:", err);
      return res.status(500).json({ success: false, message: err?.message || "Internal server error creating company." });
    }
  });

  // API Route - Permanent Cascading Company Deletion (DELETE /api/admin/companies/:id)
  app.delete("/api/admin/companies/:id", adminRateLimiter, async (req, res) => {
    try {
      const authResult = await authenticateSessionOrBearer(req);
      if (!authResult.authenticated || !authResult.user) {
        return res.status(authResult.statusCode || 401).json({
          success: false,
          message: authResult.message || "Unauthorized"
        });
      }

      const requester = authResult.user;
      const isSystemAdmin = requester.role === "SystemAdmin" || await isPlatformAdminUser(requester.email, requester);
      if (!isSystemAdmin) {
        return res.status(403).json({
          success: false,
          message: "صلاحيات غير كافية: حذف الشركات مقتصر على مدير المنصة فقط / Forbidden: SystemAdmin required."
        });
      }

      const companyId = String(req.params.id || "").trim();
      if (!companyId) {
        return res.status(400).json({ success: false, message: "Company ID is required." });
      }

      // 1. Cascade delete all users belonging to this company (Auth + user_credentials + users collection)
      const usersSnap1 = await adminDb.collection("users").where("company_id", "==", companyId).get();
      const usersSnap2 = await adminDb.collection("users").where("companyId", "==", companyId).get();
      const userDocsMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      usersSnap1.docs.forEach(d => userDocsMap.set(d.id, d));
      usersSnap2.docs.forEach(d => userDocsMap.set(d.id, d));

      const authClient = getAdminAuth(adminApp);
      const initialUsersCount = userDocsMap.size;

      for (const uDoc of userDocsMap.values()) {
        const uId = uDoc.id;
        const uData = uDoc.data() || {};
        const uEmail = (uData.email || '').toLowerCase().trim();

        // Delete from Firebase Auth: unconditionally attempt by uid AND by email
        if (authClient) {
          try {
            await authClient.deleteUser(uId);
          } catch (_) {}
          if (uEmail) {
            try {
              const au = await authClient.getUserByEmail(uEmail);
              if (au && au.uid) {
                await authClient.deleteUser(au.uid);
              }
            } catch (_) {}
          }
        }

        // Delete from user_credentials vault: unconditionally attempt by uid AND by email
        try {
          await adminDb.collection("user_credentials").doc(uId).delete();
        } catch (credDelErr) {
          console.warn("Notice: user_credentials deletion warning by uid:", credDelErr);
        }
        if (uEmail) {
          try {
            await adminDb.collection("user_credentials").doc(uEmail).delete();
          } catch (credDelErr) {
            console.warn("Notice: user_credentials deletion warning by email:", credDelErr);
          }
        }

        // Delete from users collection
        try {
          await adminDb.collection("users").doc(uId).delete();
        } catch (uDelErr) {
          console.warn("Notice: users doc deletion warning:", uDelErr);
        }
      }

      // Rule 5 Verification: If any user doc for company_id remains after attempted deletes, return 500 success:false (no partial "success")
      const remainingUsersSnap1 = await adminDb.collection("users").where("company_id", "==", companyId).get();
      const remainingUsersSnap2 = await adminDb.collection("users").where("companyId", "==", companyId).get();
      const remainingUserDocs = new Set<string>();
      remainingUsersSnap1.docs.forEach(d => remainingUserDocs.add(d.id));
      remainingUsersSnap2.docs.forEach(d => remainingUserDocs.add(d.id));

      if (remainingUserDocs.size > 0) {
        console.error(`[DELETE /api/admin/companies/:id] Incomplete user deletion: ${remainingUserDocs.size} users remain for company ${companyId}`);
        return res.status(500).json({
          success: false,
          message: `فشل الحذف الكامل: ما زال هناك ${remainingUserDocs.size} مستخدم مرتبط بالشركة في قاعدة البيانات.`
        });
      }

      // 2. Cascade delete all regions belonging to this company
      const regionsSnap = await adminDb.collection("regions").where("company_id", "==", companyId).get();
      for (const rDoc of regionsSnap.docs) {
        await adminDb.collection("regions").doc(rDoc.id).delete();
      }

      // 3. Cascade delete all stations belonging to this company
      const stationsSnap = await adminDb.collection("stations").where("company_id", "==", companyId).get();
      for (const sDoc of stationsSnap.docs) {
        await adminDb.collection("stations").doc(sDoc.id).delete();
      }

      // 4. Cascade delete all organization units belonging to this company
      const orgUnitsSnap1 = await adminDb.collection("organization_units").where("company_id", "==", companyId).get();
      for (const oDoc of orgUnitsSnap1.docs) {
        await adminDb.collection("organization_units").doc(oDoc.id).delete();
      }
      const orgUnitsSnap2 = await adminDb.collection("organization_units").where("companyId", "==", companyId).get();
      for (const oDoc of orgUnitsSnap2.docs) {
        await adminDb.collection("organization_units").doc(oDoc.id).delete();
      }

      // 5. Cascade delete transactions, expenses, cash_vouchers for this company
      const txSnap = await adminDb.collection("transactions").where("company_id", "==", companyId).get();
      for (const tDoc of txSnap.docs) {
        await adminDb.collection("transactions").doc(tDoc.id).delete();
      }
      const expSnap = await adminDb.collection("expenses").where("company_id", "==", companyId).get();
      for (const eDoc of expSnap.docs) {
        await adminDb.collection("expenses").doc(eDoc.id).delete();
      }
      const vchSnap = await adminDb.collection("cash_vouchers").where("company_id", "==", companyId).get();
      for (const vDoc of vchSnap.docs) {
        await adminDb.collection("cash_vouchers").doc(vDoc.id).delete();
      }

      // 6. Delete company document itself
      await adminDb.collection("companies").doc(companyId).delete();

      const verifyCompanyDoc = await adminDb.collection("companies").doc(companyId).get();
      if (verifyCompanyDoc.exists) {
        return res.status(500).json({
          success: false,
          message: "فشل حذف سجل الشركة من قاعدة البيانات."
        });
      }

      // 7. Store permanent tombstone in deleted_companies collection
      await adminDb.collection("deleted_companies").doc(companyId).set({
        id: companyId,
        deleted_at: new Date().toISOString(),
        deleted_by: requester.email || requester.id,
        deleted_users_count: initialUsersCount
      });

      // 8. Audit log entry
      try {
        await adminDb.collection("audit_logs").add({
          action: "company_permanently_deleted",
          performed_by_id: requester.id,
          performed_by_email: requester.email,
          target_company_id: companyId,
          deleted_users_count: initialUsersCount,
          timestamp: new Date().toISOString()
        });
      } catch (auditErr) {
        console.warn("Audit log write failed during company delete:", auditErr);
      }

      return res.json({
        success: true,
        message: "تم حذف الشركة وكافة المستخدمين والبيانات التابعة لها نهائياً وبلا رجعة.",
        deletedUsersCount: initialUsersCount
      });
    } catch (err: any) {
      console.error("Error deleting company in /api/admin/companies/:id:", err);
      return res.status(500).json({ success: false, message: err?.message || "Internal server error deleting company." });
    }
  });

  // API Route - Server-side Credential Verification (Zero-Trust PBKDF2 210k)
  app.post("/api/auth/verify-credentials", authRateLimiter, async (req, res) => {
    try {

      const rawEmail = req.body?.email;
      const rawPassword = req.body?.password;
      if (!rawEmail || !rawPassword) {
        return res.status(400).json({ success: false, message: "يرجى إدخال البريد الإلكتروني وكلمة المرور." });
      }

      const emailLower = String(rawEmail).toLowerCase().trim();
      const password = String(rawPassword).trim();
      if (!emailLower || !password) {
        return res.status(400).json({ success: false, message: "يرجى إدخال البريد الإلكتروني وكلمة المرور." });
      }

      // 1. Fetch user document from 'users' collection using Admin SDK
      let usersSnapshot = await adminDb.collection("users").where("email", "==", emailLower).get();

      if (usersSnapshot.empty) {
        // Resilient lookup: check if email is an alias or prefix match within same domain
        const atIdx = emailLower.indexOf('@');
        if (atIdx > 0) {
          const localPart = emailLower.substring(0, atIdx);
          const domain = emailLower.substring(atIdx);
          const domainUsersSnap = await adminDb.collection("users").where("email", ">=", localPart).where("email", "<=", localPart + "\uf8ff").get();
          const candidate = domainUsersSnap.docs.find(d => {
            const em = (d.data()?.email || "").toLowerCase();
            return em.endsWith(domain) && (em.startsWith(localPart) || localPart.startsWith(em.replace(domain, '')));
          });
          if (candidate) {
            usersSnapshot = { empty: false, docs: [candidate] } as any;
          }
        }
      }

      if (usersSnapshot.empty) {
        return res.status(400).json({ success: false, message: "البريد الإلكتروني غير مسجل بالنظام." });
      }

      const userDoc = usersSnapshot.docs[0];
      const userData = userDoc.data();
      const userId = userDoc.id;

      if (userData.is_active === false) {
        return res.status(400).json({ success: false, message: "هذا الحساب معطل حالياً. يرجى التواصل مع المسؤول." });
      }

      // 2. Fetch private credentials from 'user_credentials' vault using Admin SDK
      let credDoc = await adminDb.collection("user_credentials").doc(userId).get();
      if (!credDoc.exists) {
        credDoc = await adminDb.collection("user_credentials").doc(emailLower).get();
      }

      let storedPasswordHash = '';
      let salt = userData.salt || emailLower;
      let kdf = 'legacy';
      let pepperVersion = 2;

      if (credDoc.exists) {
        const credData = credDoc.data();
        storedPasswordHash = credData?.passwordHash || credData?.password || '';
        salt = credData?.salt || salt;
        kdf = credData?.kdf || 'legacy';
        pepperVersion = typeof credData?.pepper_version === 'number' ? credData.pepper_version : 2;
      } else {
        // Fallback to legacy fields directly on user document
        storedPasswordHash = userData.password || '';
        pepperVersion = typeof userData.pepper_version === 'number' ? userData.pepper_version : 2;
      }

      const isPlatformAdmin = await isPlatformAdminUser(emailLower, userData);

      if (!storedPasswordHash) {
        if (!isPlatformAdmin) {
          return res.status(400).json({ success: false, message: "لم يتم تعيين كلمة مرور لهذا الحساب بعد." });
        }
      }

      // 3. Perform Password Comparisons across KDF iterations using stored pepper_version
      const pbkdf2Hash = hashPasswordPBKDF2_210k(password, salt, pepperVersion);
      const pbkdf2HashAlt = hashPasswordPBKDF2_210k(password, salt, pepperVersion === 2 ? 1 : 2);
      const hash10k = hashPassword(password, salt, pepperVersion);
      const hash1k = legacyStretchedHashPassword1000(password, salt, pepperVersion); // TODO(remove-after-2027-02-01)
      const hashSinglePass = legacySinglePassHashPassword(password, salt, pepperVersion); // TODO(remove-after-2027-02-01)
      const hashOldEmailSalt = legacyHashPassword(password, emailLower); // TODO(remove-after-2027-02-01)
      const hashLegacyUnsalted = legacyHashPassword(password); // TODO(remove-after-2027-02-01)

      const isPBKDF2Match = storedPasswordHash !== '' && (storedPasswordHash === pbkdf2Hash || storedPasswordHash === pbkdf2HashAlt);
      const is10kMatch = storedPasswordHash !== '' && storedPasswordHash === hash10k;
      const is1kMatch = storedPasswordHash !== '' && storedPasswordHash === hash1k; // TODO(remove-after-2027-02-01)
      const isSinglePassMatch = storedPasswordHash !== '' && storedPasswordHash === hashSinglePass; // TODO(remove-after-2027-02-01)
      const isOldEmailSaltMatch = storedPasswordHash !== '' && storedPasswordHash === hashOldEmailSalt; // TODO(remove-after-2027-02-01)
      const isLegacyUnsaltedMatch = storedPasswordHash !== '' && storedPasswordHash === hashLegacyUnsalted; // TODO(remove-after-2027-02-01)
      const allowPlaintextFallback = false;
      const isPlainMatch = false; // TODO(remove-after-2027-02-01)

      const isMatched = isPBKDF2Match || is10kMatch || is1kMatch || isSinglePassMatch || isOldEmailSaltMatch || isLegacyUnsaltedMatch || isPlainMatch;

      if (storedPasswordHash && !isMatched) {
        return res.status(400).json({ success: false, message: "كلمة المرور غير صحيحة." });
      }

      // Phase 4.1 Part 2: Evaluate Legacy Hash Deprecation & Sunset Enforcement Policy
      const deprecationPolicy = getLegacyHashDeprecationPolicy();
      const isLegacyOnlyMatch = !isPBKDF2Match && !is10kMatch && (is1kMatch || isSinglePassMatch || isOldEmailSaltMatch || isLegacyUnsaltedMatch || isPlainMatch || pepperVersion !== 2);
      if (isLegacyOnlyMatch && deprecationPolicy.enforceSunset) {
        return res.status(426).json({
          success: false,
          code: "LEGACY_HASH_SUNSET_EXPIRED",
          messageAr: deprecationPolicy.messageAr,
          messageEn: deprecationPolicy.messageEn,
          message: deprecationPolicy.messageAr
        });
      }
      if (isLegacyOnlyMatch) {
        console.log(`[LegacyHashDeprecationPolicy] Grace period active (${deprecationPolicy.announcementDate} -> ${deprecationPolicy.sunsetDate}): Auto-migrating legacy password hash to PBKDF2 210,000 iterations for userId: ${userId}`);
      }

      // 4. Auto-upgrade credential to PBKDF2 210,000 iterations & pepper_version: 2 in user_credentials vault
      // IMPORTANT: Never block a successful password match because company_id is missing.
      // Platform owners / SystemAdmins frequently have no company_id. Aborting here caused
      // "wrong password" on first login and success after close/reopen.
      if (!credDoc.exists || kdf !== 'sha256_pbkdf2_210k' || !isPBKDF2Match || pepperVersion !== 2) {
        if (!userData.company_id && !isPlatformAdmin) {
          console.warn(
            "[verify-credentials] Auto-upgrade skipped (no company_id) for non-platform userId:",
            userId,
            "email:",
            emailLower
          );
          // Still allow login with the already-verified password; do not return 422.
        } else {
          const newSalt = salt || crypto.randomUUID();
          const newPbkdf2Hash = hashPasswordPBKDF2_210k(password, newSalt, 2);
          const resolvedCompanyId = userData.company_id || (isPlatformAdmin ? 'platform' : '');

          await adminDb.collection("user_credentials").doc(userId).set({
            id: userId,
            company_id: resolvedCompanyId,
            email: emailLower,
            passwordHash: newPbkdf2Hash,
            salt: newSalt,
            kdf: 'sha256_pbkdf2_210k',
            pepper_version: 2,
            updated_at: new Date().toISOString()
          }, { merge: true });
        }

        // Strip password & salt from public user document in 'users' collection
        if (userData.password !== undefined || userData.salt !== undefined) {
          try {
            await adminDb.collection("users").doc(userId).update({
              password: FieldValue.delete(),
              salt: FieldValue.delete()
            });
          } catch (e) {
            console.warn("Could not delete plaintext password field from user doc:", e);
          }
        }
      }

      // Sanitize user object returned to client
      const { password: _, salt: __, ...publicUser } = userData;
      publicUser.id = userId;

      // Ensure permissions object is present and complete for the user's role
      const role = publicUser.role || 'ReconciliationUser';
      const isSystemAdminRole = role === 'SystemAdmin';
      const isAdminRole = role === 'Admin';
      const isRegionalRole = role === 'RegionalManager';
      const isStationRole = role === 'StationAdmin';
      const currentPerms = publicUser.permissions || {};
      publicUser.permissions = {
        create_expense: (isAdminRole || isSystemAdminRole) ? false : (currentPerms.create_expense ?? (isSystemAdminRole || isStationRole)),
        edit_expense: currentPerms.edit_expense ?? (isSystemAdminRole || isAdminRole || isStationRole),
        delete_expense: currentPerms.delete_expense ?? (isSystemAdminRole || isAdminRole),
        create_voucher: (isAdminRole || isSystemAdminRole) ? false : (currentPerms.create_voucher ?? (isSystemAdminRole || isStationRole)),
        approve_voucher: currentPerms.approve_voucher ?? (isSystemAdminRole || isAdminRole || isRegionalRole),
        reject_voucher: currentPerms.reject_voucher ?? (isSystemAdminRole || isAdminRole || isRegionalRole),
        create_custody: currentPerms.create_custody ?? (isSystemAdminRole || isAdminRole),
        edit_custody: currentPerms.edit_custody ?? (isSystemAdminRole || isAdminRole),
        replace_custody: currentPerms.replace_custody ?? (isSystemAdminRole || isAdminRole || isRegionalRole),
        view_reports: currentPerms.view_reports ?? true,
        manage_users: currentPerms.manage_users ?? (isSystemAdminRole || isAdminRole),
        manage_companies: currentPerms.manage_companies ?? isSystemAdminRole,
        manage_regions: currentPerms.manage_regions ?? (isSystemAdminRole || isAdminRole),
        manage_stations: currentPerms.manage_stations ?? (isSystemAdminRole || isAdminRole),
        manage_roles: currentPerms.manage_roles ?? (isSystemAdminRole || isAdminRole),
        manage_settings: currentPerms.manage_settings ?? (isSystemAdminRole || isAdminRole),
        settle_voucher: (isAdminRole || isSystemAdminRole) ? false : (currentPerms.settle_voucher ?? (isSystemAdminRole || isStationRole)),
      };

      let customToken: string | null = null;
      try {
        const adminAuth = getAdminAuth(getAdminApp());
        customToken = await adminAuth.createCustomToken(userId);
      } catch (tokenErr: any) {
        console.warn(
          "[verify-credentials] createCustomToken failed; continuing without customToken:",
          tokenErr?.message || tokenErr
        );
        customToken = null;
      }

      const serverSessionToken = signServerSessionToken({
        uid: userId,
        email: emailLower,
        role: publicUser.role,
        company_id: publicUser.company_id
      });

      return res.json({
        success: true,
        user: publicUser,
        customToken,
        sessionToken: serverSessionToken,
        mustChangePassword: Boolean(publicUser.must_change_password)
      });
    } catch (err: any) {
      console.error("Error in verify-credentials endpoint:", err);
      return res.status(500).json({ success: false, message: "تعذر الاتصال بقاعدة البيانات، يرجى المحاولة لاحقًا." });
    }
  });

  // API Route - Server-side Forced Password Change Gate
  app.post("/api/auth/change-password", otpRateLimiter, changePasswordRateLimiter, async (req, res) => {
    try {
      const authResult = await authenticateSessionOrBearer(req);
      let sessionUser = authResult.authenticated ? authResult.user : null;
      let sessionUid = sessionUser ? String(sessionUser.id || "").trim() : "";

      let { currentPassword, newPassword, email, userId } = req.body || {};

      let user = sessionUser;
      const requestedEmail = email ? String(email).toLowerCase().trim() : "";
      const requestedUserId = userId ? String(userId).trim() : "";

      // Check if session cookie belongs to a different user than what the client is changing password for
      const isMismatchedSession = Boolean(
        (requestedEmail && sessionUser?.email && sessionUser.email.toLowerCase().trim() !== requestedEmail) ||
        (requestedUserId && sessionUid && sessionUid !== requestedUserId)
      );

      // Fallback auth: if bearer/session is pending, blocked, or belongs to another user (stale admin session cookie)
      if (!sessionUid || isMismatchedSession) {
        let userDoc: any = null;
        if (requestedUserId) {
          const doc = await adminDb.collection("users").doc(requestedUserId).get();
          if (doc.exists) userDoc = doc;
        }
        if (!userDoc && requestedEmail) {
          const snap = await adminDb.collection("users").where("email", "==", requestedEmail).limit(1).get();
          if (!snap.empty) {
            userDoc = snap.docs[0];
          } else {
            const prefix = requestedEmail.split('@')[0];
            const allUsersSnap = await adminDb.collection("users").get();
            for (const d of allUsersSnap.docs) {
              const uEmail = (d.data().email || '').toLowerCase().trim();
              if (uEmail && (uEmail === requestedEmail || uEmail.startsWith(prefix) || prefix.startsWith(uEmail.split('@')[0]))) {
                userDoc = d;
                break;
              }
            }
          }
        }
        if (userDoc) {
          user = { ...userDoc.data(), id: userDoc.id };
        }
      }

      if (!user) {
        return res.status(authResult.statusCode || 401).json({ success: false, message: authResult.message || "Unauthorized" });
      }

      const uid = String(user.id || "").trim();
      if (!uid) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      currentPassword = String(currentPassword ?? "").trim();
      if (typeof newPassword === 'string') {
        newPassword = newPassword.trim();
      }

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, message: "يرجى إدخال كلمة المرور الحالية وكلمة المرور الجديدة / Both current and new password are required." });
      }

      if (typeof newPassword !== 'string' || newPassword.length < 12 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return res.status(400).json({
          success: false,
          message: "كلمة المرور الجديدة يجب أن تتكون من 12 حرف على الأقل وتحتوي على حروف وأرقام / New password must be at least 12 characters and contain letters and numbers."
        });
      }

      // Verify current password against vault
      let credDoc = await adminDb.collection("user_credentials").doc(uid).get();
      const emailLower = String(user.email || '').toLowerCase().trim();
      if (!credDoc.exists && emailLower) {
        const credEmailDoc = await adminDb.collection("user_credentials").doc(emailLower).get();
        if (credEmailDoc.exists) {
          credDoc = credEmailDoc;
        }
      }

      let storedPasswordHash = '';
      let salt = user.salt || emailLower;
      let kdf = 'legacy';
      let pepperVersion = 2;

      if (credDoc.exists) {
        const credData = credDoc.data() || {};
        storedPasswordHash = credData.passwordHash || credData.password || '';
        salt = credData.salt || salt;
        kdf = credData.kdf || 'legacy';
        pepperVersion = typeof credData.pepper_version === 'number' ? credData.pepper_version : 2;
      } else {
        storedPasswordHash = user.password || '';
        pepperVersion = typeof user.pepper_version === 'number' ? user.pepper_version : 1;
      }

      // Perform Password Comparisons across KDF iterations using stored pepper_version
      const pbkdf2Hash = hashPasswordPBKDF2_210k(currentPassword, salt, pepperVersion);
      const pbkdf2HashAlt = hashPasswordPBKDF2_210k(currentPassword, salt, pepperVersion === 2 ? 1 : 2);
      const hash10k = hashPassword(currentPassword, salt, pepperVersion);
      const hash1k = legacyStretchedHashPassword1000(currentPassword, salt, pepperVersion); // TODO(remove-after-2027-02-01)
      const hashSinglePass = legacySinglePassHashPassword(currentPassword, salt, pepperVersion); // TODO(remove-after-2027-02-01)
      const hashOldEmailSalt = legacyHashPassword(currentPassword, emailLower); // TODO(remove-after-2027-02-01)
      const hashLegacyUnsalted = legacyHashPassword(currentPassword); // TODO(remove-after-2027-02-01)

      const isPBKDF2Match = storedPasswordHash !== '' && (storedPasswordHash === pbkdf2Hash || storedPasswordHash === pbkdf2HashAlt);
      const is10kMatch = storedPasswordHash !== '' && storedPasswordHash === hash10k;
      const is1kMatch = storedPasswordHash !== '' && storedPasswordHash === hash1k; // TODO(remove-after-2027-02-01)
      const isSinglePassMatch = storedPasswordHash !== '' && storedPasswordHash === hashSinglePass; // TODO(remove-after-2027-02-01)
      const isOldEmailSaltMatch = storedPasswordHash !== '' && storedPasswordHash === hashOldEmailSalt; // TODO(remove-after-2027-02-01)
      const isLegacyUnsaltedMatch = storedPasswordHash !== '' && storedPasswordHash === hashLegacyUnsalted; // TODO(remove-after-2027-02-01)

      const isMatch = isPBKDF2Match || is10kMatch || is1kMatch || isSinglePassMatch || isOldEmailSaltMatch || isLegacyUnsaltedMatch;

      if (!isMatch) {
        return res.status(400).json({ success: false, message: "كلمة المرور الحالية غير صحيحة / Incorrect current password." });
      }

      // Update Firebase Auth user password
      try {
        await getAdminAuth(adminApp).updateUser(uid, { password: newPassword });
      } catch (authErr: any) {
        console.warn("Firebase Auth password update failed (non-blocking if local user):", authErr?.message);
      }

      // Re-hash new password with PBKDF2 210,000 iterations & vault it
      const newSalt = crypto.randomUUID();
      const newPbkdf2Hash = hashPasswordPBKDF2_210k(newPassword, newSalt, 2);
      const updatedCredPayload = {
        id: uid,
        company_id: user.company_id || 'platform',
        email: emailLower,
        passwordHash: newPbkdf2Hash,
        password: newPbkdf2Hash,
        salt: newSalt,
        kdf: 'sha256_pbkdf2_210k',
        pepper_version: 2,
        is_temporary: false,
        updated_at: new Date().toISOString()
      };
      await adminDb.collection("user_credentials").doc(uid).set(updatedCredPayload, { merge: true });
      if (emailLower) {
        await adminDb.collection("user_credentials").doc(emailLower).set(updatedCredPayload, { merge: true });
      }

      // Update users collection document: set must_change_password = false & strip plaintext password/salt
      await adminDb.collection("users").doc(uid).update({
        must_change_password: false,
        password: FieldValue.delete(),
        salt: FieldValue.delete(),
        updated_at: new Date().toISOString()
      });

      const updatedDoc = await adminDb.collection("users").doc(uid).get();
      const updatedUserData = updatedDoc.data() || {};
      const { password: _, salt: __, ...publicUser } = updatedUserData;
      publicUser.id = uid;

      // Generate fresh customToken for the targeted user
      let customToken: string | null = null;
      try {
        customToken = await getAdminAuth(adminApp).createCustomToken(uid);
      } catch (tokenErr) {
        console.warn("Could not create custom token on change-password:", tokenErr);
      }

      // If there was a mismatched session (e.g. old admin cookie), clear it so the browser does not stay attached to the old user
      if (isMismatchedSession) {
        res.clearCookie('session', { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
        res.clearCookie('session', { path: '/' });
      }

      return res.json({
        success: true,
        message: "تم تغيير كلمة المرور بنجاح / Password changed successfully.",
        user: publicUser,
        customToken
      });
    } catch (err: any) {
      console.error("Error in /api/auth/change-password:", err);
      return res.status(500).json({ success: false, message: "حدث خطأ أثناء تغيير كلمة المرور / Server error changing password." });
    }
  });

  // API Route - Server-side Save User Credentials (PBKDF2 210k)
  app.post("/api/auth/save-credentials", adminRateLimiter, requireAdminOrSystemAdminAuth, async (req, res) => {
    try {
      const { userId, companyId, email, password, salt } = req.body;
      if (!userId || !password) {
        return res.status(400).json({ success: false, message: "معلمات غير كافية لحفظ الاعتمادات." });
      }

      if (typeof password !== 'string' || password.trim().length < 12) {
        return res.status(400).json({
          success: false,
          message: "كلمة المرور يجب أن لا تقل عن 12 حرفاً / Password must be at least 12 characters."
        });
      }

      const requester = (req as any).user;
      const isSystemAdmin = requester?.role === 'SystemAdmin';
      const resolvedCompanyId = isSystemAdmin ? companyId : requester?.company_id;
      if (!resolvedCompanyId) {
        return res.status(422).json({
          success: false,
          message: "بيانات الشركة غير مكتملة / Missing or invalid company context for credentials."
        });
      }

      const emailLower = (email || '').toLowerCase().trim();
      const userSalt = salt || crypto.randomUUID();
      const newPbkdf2Hash = hashPasswordPBKDF2_210k(password, userSalt, 2);

      // Save strictly to user_credentials collection using Admin SDK
      await adminDb.collection("user_credentials").doc(userId).set({
        id: userId,
        company_id: resolvedCompanyId,
        email: emailLower,
        passwordHash: newPbkdf2Hash,
        salt: userSalt,
        kdf: 'sha256_pbkdf2_210k',
        pepper_version: 2,
        updated_at: new Date().toISOString()
      }, { merge: true });

      // Clean password/salt from public 'users' collection
      const userRef = adminDb.collection("users").doc(userId);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        await userRef.update({
          password: FieldValue.delete(),
          salt: FieldValue.delete()
        });
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.error("Error in save-credentials endpoint:", err);
      return res.status(500).json({ success: false, message: "حدث خطأ أثناء حفظ الاعتمادات." });
    }
  });

  // API Route - Server-side Migrate Credential Vault ID (when legacy user ID -> Firebase Auth UID)
  app.post("/api/auth/migrate-credential-id", adminRateLimiter, async (req, res) => {
    try {
      const authHeader = req.headers.authorization || "";
      const idToken = authHeader.split("Bearer ")[1]?.trim();
      if (!idToken) {
        return res.status(401).json({ success: false, message: "Unauthorized token." });
      }
      const decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
      const { oldId, newId, email } = req.body;
      if (!oldId || !newId || decodedToken.uid !== newId) {
        return res.status(400).json({ success: false, message: "Invalid migration parameters or token mismatch." });
      }

      // Resolve requesting user's own email from decodedToken or by loading users/{newId} server-side
      let callerEmail = (decodedToken.email || "").toLowerCase().trim();
      if (!callerEmail) {
        const userDocSnap = await adminDb.collection("users").doc(newId).get();
        callerEmail = (userDocSnap.data()?.email || "").toLowerCase().trim();
      }
      if (!callerEmail) {
        return res.status(403).json({ success: false, message: "Caller email could not be resolved for authorization." });
      }

      const oldCredRef = adminDb.collection("user_credentials").doc(oldId);
      const oldCredDoc = await oldCredRef.get();
      if (oldCredDoc.exists) {
        const credData = oldCredDoc.data() || {};
        const oldEmail = (credData.email || "").toLowerCase().trim();
        // Check that oldId actually belongs to the same person making the request
        if (!oldEmail || oldEmail !== callerEmail) {
          return res.status(403).json({ success: false, message: "Forbidden: credential ownership mismatch." });
        }

        await adminDb.collection("user_credentials").doc(newId).set({
          ...credData,
          id: newId,
          email: callerEmail,
          updated_at: new Date().toISOString()
        }, { merge: true });
        if (oldId !== newId) {
          try {
            await oldCredRef.delete();
          } catch (delErr) {
            console.warn("Failed to delete legacy user_credentials doc:", delErr);
          }
        }
        return res.json({ success: true, message: "Credential vault migrated successfully." });
      }
      return res.json({ success: false, message: "No legacy credential found to migrate." });
    } catch (err: any) {
      console.error("Error migrating credential vault ID:", err);
      return res.status(500).json({ success: false, message: "Server error during credential migration." });
    }
  });

  // API Route - One-time repair for already orphaned user_credentials (requires SystemAdmin or manual confirmation)
  app.post("/api/auth/repair-orphaned-credentials", requireSystemAdminAuth, async (req, res) => {
    try {
      const { targetEmail, confirmPairing, manualOldId, manualNewId } = req.body || {};
      const usersSnap = await adminDb.collection("users").get();
      const credsSnap = await adminDb.collection("user_credentials").get();
      const userIds = new Set(usersSnap.docs.map(d => d.id));

      const orphanedDocs = credsSnap.docs.filter(d => !userIds.has(d.id));
      const repaired: string[] = [];
      const pendingConfirmation: any[] = [];

      for (const oldDoc of orphanedDocs) {
        const data = oldDoc.data() || {};
        const docEmail = (data.email || '').toLowerCase().trim();

        if (manualOldId && manualNewId && confirmPairing && oldDoc.id === manualOldId) {
          const resolvedEmail = (targetEmail || docEmail || '').toLowerCase().trim();
          if (!resolvedEmail) {
            pendingConfirmation.push({ oldId: oldDoc.id, reason: "No email field present on orphaned record or request; manual email confirmation required." });
            continue;
          }
          await adminDb.collection("user_credentials").doc(manualNewId).set({
            ...data,
            id: manualNewId,
            email: resolvedEmail,
            updated_at: new Date().toISOString()
          }, { merge: true });
          await oldDoc.ref.delete();
          repaired.push(`Manually paired ${oldDoc.id} -> ${manualNewId}`);
          continue;
        }

        if (docEmail) {
          const matchingUserDoc = usersSnap.docs.find(u => (u.data()?.email || '').toLowerCase().trim() === docEmail);
          if (matchingUserDoc) {
            await adminDb.collection("user_credentials").doc(matchingUserDoc.id).set({
              ...data,
              id: matchingUserDoc.id,
              email: docEmail,
              updated_at: new Date().toISOString()
            }, { merge: true });
            await oldDoc.ref.delete();
            repaired.push(`Auto-repaired by email ${docEmail}: ${oldDoc.id} -> ${matchingUserDoc.id}`);
          } else {
            pendingConfirmation.push({ oldId: oldDoc.id, email: docEmail });
          }
        } else {
          pendingConfirmation.push({ oldId: oldDoc.id, reason: "No email field present on orphaned record; manual confirmation required." });
        }
      }

      return res.json({
        success: true,
        repairedCount: repaired.length,
        repaired,
        pendingConfirmation
      });
    } catch (err: any) {
      console.error("Error in repair-orphaned-credentials:", err);
      return res.status(500).json({ success: false, message: "Error repairing orphaned credentials." });
    }
  });

  // API Route - Check Hash Migration Status (Phase 4.1 Deprecation Plan)
  // Queries user_credentials to report how many accounts are still on legacy hash formats (pepper_version 1 or 3) vs PBKDF2 210,000 (pepper_version 2)
  app.get("/api/auth/hash-migration-status", requireSystemAdminAuth, async (req, res) => {
    try {
      const credsSnap = await adminDb.collection("user_credentials").get();
      let legacyCount = 0;
      let pbkdf2Count = 0;
      let transientV2Count = 0;
      const details: { userId: string; pepperVersion: number; format: string }[] = [];

      credsSnap.docs.forEach(d => {
        const data = d.data() || {};
        const pVer = typeof data.pepper_version === 'number' ? data.pepper_version : 1;
        if (pVer === 1) {
          legacyCount++;
          details.push({ userId: d.id, pepperVersion: 1, format: "legacy_sha256" });
        } else if (pVer === 3) {
          transientV2Count++;
          details.push({ userId: d.id, pepperVersion: 3, format: "transient_regression_v2" });
        } else {
          pbkdf2Count++;
          details.push({ userId: d.id, pepperVersion: 2, format: "pbkdf2_210000" });
        }
      });

      const deprecationPolicy = getLegacyHashDeprecationPolicy();
      return res.json({
        success: true,
        totalCredentials: credsSnap.docs.length,
        legacyCount,
        transientV2Count,
        pbkdf2Count,
        details,
        deprecationPolicy,
        messageAr: `حالة التشفير: ${pbkdf2Count} حساب محدث (PBKDF2)، ${legacyCount + transientV2Count} حساب يحتاج هجرة تلقائية عند تسجيل الدخول. (انتهاء صلاحية التشفير القديم: ${deprecationPolicy.sunsetDate})`,
        messageEn: `Encryption status: ${pbkdf2Count} upgraded (PBKDF2), ${legacyCount + transientV2Count} pending auto-migration upon login. (Legacy Sunset Date: ${deprecationPolicy.sunsetDate})`
      });
    } catch (err: any) {
      console.error("Error in hash-migration-status:", err);
      return res.status(500).json({ success: false, message: "Error retrieving hash migration status." });
    }
  });

  // Helper: Server-side Firestore Seed Function with Admin SDK
  async function seedDatabaseIfEmptyServer(adminDbInstance: FirebaseFirestore.Firestore) {
    console.log('[Server Seed] Checking if Firestore requires initial seeding...');
    try {
      const metaDoc = await adminDbInstance.collection('system_meta').doc('seed_status_v7').get();

      if (metaDoc.exists) {
        console.log('[Server Seed] Database is already initialized with v7. Skipping seed to prevent resurrecting deleted entities.');
        return { alreadySeeded: true };
      }

      console.log('[Server Seed] Database is empty or missing v7 marker. Starting server-side atomic seeding...');

      // Check deleted_companies tombstones to never resurrect deleted companies
      const deletedSnap = await adminDbInstance.collection('deleted_companies').get();
      const deletedCompanyIds = new Set(deletedSnap.docs.map(d => d.id));
      const companiesToSeed = DEFAULT_COMPANIES.filter(c => !deletedCompanyIds.has(c.id));

      // 1. Seed companies
      const compBatch = adminDbInstance.batch();
      companiesToSeed.forEach(c => {
        compBatch.set(adminDbInstance.collection('companies').doc(c.id), c);
      });
      await compBatch.commit();
      console.log(`[Server Seed] Seeded ${companiesToSeed.length} companies.`);

      // 2. Seed regions
      const regBatch = adminDbInstance.batch();
      DEFAULT_REGIONS.forEach(r => {
        regBatch.set(adminDbInstance.collection('regions').doc(r.id), r);
      });
      await regBatch.commit();
      console.log(`[Server Seed] Seeded ${DEFAULT_REGIONS.length} regions.`);

      // 3. Seed stations
      const stnBatch = adminDbInstance.batch();
      DEFAULT_STATIONS.forEach(s => {
        stnBatch.set(adminDbInstance.collection('stations').doc(s.id), s);
      });
      await stnBatch.commit();
      console.log(`[Server Seed] Seeded ${DEFAULT_STATIONS.length} stations.`);

      // 4. Seed categories
      const catBatch = adminDbInstance.batch();
      DEFAULT_CATEGORIES.forEach(c => {
        catBatch.set(adminDbInstance.collection('categories').doc(c.id), c);
      });
      await catBatch.commit();
      console.log(`[Server Seed] Seeded ${DEFAULT_CATEGORIES.length} categories.`);

      // 5. Seed organization units
      const orgBatch = adminDbInstance.batch();
      DEFAULT_ORGANIZATION_UNITS.forEach(u => {
        orgBatch.set(adminDbInstance.collection('organization_units').doc(u.id), u);
      });
      await orgBatch.commit();
      console.log(`[Server Seed] Seeded ${DEFAULT_ORGANIZATION_UNITS.length} organization units.`);

      // 6. Seed users & user_credentials
      const userBatch = adminDbInstance.batch();
      DEFAULT_USERS.forEach(u => {
        const pwd = u.password || '123456';
        const salt = u.salt || u.email;
        const hashedPwd = hashPasswordPBKDF2_210k(pwd, salt, 2);
        const { password: _p, salt: _s, ...publicUser } = u;

        userBatch.set(adminDbInstance.collection('users').doc(u.id), {
          ...publicUser,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

        userBatch.set(adminDbInstance.collection('user_credentials').doc(u.id), {
          id: u.id,
          company_id: u.company_id || '',
          email: u.email.toLowerCase().trim(),
          password: hashedPwd,
          salt: salt,
          pepper_version: 2,
          is_temporary: false,
          updated_at: new Date().toISOString()
        });
      });
      await userBatch.commit();
      console.log(`[Server Seed] Seeded ${DEFAULT_USERS.length} users and credentials with PBKDF2 210k.`);

      // 7. Seed config main
      await adminDbInstance.collection('config').doc('main').set({
        ...DEFAULT_CONFIG,
        updated_at: new Date().toISOString()
      });

      // 8. Seed permissions and roles
      const permBatch = adminDbInstance.batch();
      DEFAULT_PERMISSIONS.forEach(p => {
        permBatch.set(adminDbInstance.collection('Permissions').doc(p.id), p);
      });
      DEFAULT_ROLES.forEach(r => {
        permBatch.set(adminDbInstance.collection('Roles').doc(r.id), r);
      });
      await permBatch.commit();

      // 9. Seed logs and transactions
      const logBatch = adminDbInstance.batch();
      DEFAULT_LOGS.forEach(l => {
        logBatch.set(adminDbInstance.collection('logs').doc(l.id), l);
      });
      DEFAULT_TRANSACTIONS.forEach(t => {
        logBatch.set(adminDbInstance.collection('transactions').doc(t.id), t);
      });
      await logBatch.commit();

      // 10. Mark v7 seed status
      await adminDbInstance.collection('system_meta').doc('seed_status_v7').set({
        seeded: true,
        timestamp: new Date().toISOString(),
        seededBy: 'server_bootstrap',
        version: '7.0'
      });

      console.log('[Server Seed] Firestore seeding completed successfully.');
      return { success: true, seededCount: DEFAULT_COMPANIES.length };
    } catch (err: any) {
      console.error('[Server Seed] Error during seed:', err);
      throw err;
    }
  }

  // Gated Auto-seed endpoint: only permitted if ALLOW_AUTO_SEED === 'true' OR authenticated as SystemAdmin
  async function requireAutoSeedPermission(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (process.env.ALLOW_AUTO_SEED === 'true') {
      return next();
    }
    return requireSystemAdminAuth(req, res, next);
  }

  // API Route - Auto seed endpoint (accessible by client on initial check or bootstrap with gate & rate limit)
  app.post("/api/seed/auto-seed", otpRateLimiter, requireAutoSeedPermission, async (req, res) => {
    try {
      const result = await seedDatabaseIfEmptyServer(adminDb);
      return res.json({ success: true, result });
    } catch (err: any) {
      console.error("Error in /api/seed/auto-seed:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // Run server seed on boot
  try {
    await seedDatabaseIfEmptyServer(adminDb);
  } catch (err) {
    console.error("Initial server boot seed error:", err);
  }



  // ===== A.N core bridge (MERGE-M1) =====
  try {
    const { StorageRouter } = await import("./src/an-core/storage/StorageRouter");
    const anStorageRouter = new StorageRouter();
    app.get("/api/an/storage-status", async (_req: any, res: any) => {
      try {
        const adapter = anStorageRouter.getDevInMemoryAdapter();
        const tenantsResult = await adapter.listTenants();
        const tenants = tenantsResult.success && Array.isArray(tenantsResult.data) ? tenantsResult.data.length : 0;
        const { probeDefaultProcessPlane } = await import("./src/lib/anDataPlane");
        const processPlane = probeDefaultProcessPlane(process.env);
        res.json({
          ok: true,
          adapterName: adapter.adapterName,
          tenants,
          version: "7.2.0",
          processPlane: {
            ok: processPlane.ok,
            adapterType: processPlane.adapterType,
            isolationLevel: processPlane.isolationLevel,
            connectionRef: processPlane.connectionRef,
            envRefPresent: processPlane.envRefPresent,
            requiresEnvRef: processPlane.requiresEnvRef,
            certifiedNote: processPlane.certifiedNote,
            errorEn: processPlane.errorEn,
          },
          note: "dev adapter listed above; processPlane is env-level wiring only — Firestore login unchanged",
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.post("/api/an/company-backend/:companyId", async (req: any, res: any) => {
      try {
        const companyId = String(req.params.companyId || "").trim();
        if (!companyId) return res.status(400).json({ ok: false, error: "companyId required" });
        const body = req.body || {};
        const db_backend = body.db_backend || "firebase";
        const auth_driver = body.auth_driver || "firebase";
        const isolation_level = body.isolation_level || "Shared";
        let connection_ref = typeof body.connection_ref === "string" ? body.connection_ref.trim() : "";
        const allowedDb = ["postgresql", "mysql", "mongodb", "firebase", "inmemory"];
        const allowedIso = ["Shared", "Dedicated"];
        if (!allowedDb.includes(db_backend)) {
          return res.status(400).json({ ok: false, error: "unsupported db_backend" });
        }
        if (!allowedIso.includes(isolation_level)) {
          return res.status(400).json({ ok: false, error: "invalid isolation_level" });
        }
        if (auth_driver !== "firebase" && auth_driver !== "an-jwt") {
          return res.status(400).json({ ok: false, error: "invalid auth_driver" });
        }
        const needsRef = db_backend === "postgresql" || db_backend === "mysql" || db_backend === "mongodb";
        if (needsRef && !connection_ref) {
          return res.status(400).json({ ok: false, error: "connection_ref required" });
        }
        if (connection_ref && (connection_ref.includes("://") || connection_ref.length > 128)) {
          return res.status(400).json({ ok: false, error: "connection_ref must be env var name only" });
        }
        if (!connection_ref && db_backend === "postgresql") connection_ref = "DATABASE_URL";
        const settings = { auth_driver, db_backend, isolation_level, connection_ref };
        const backendConfig = {
          adapterType: db_backend,
          connectionRef: connection_ref || "DATABASE_URL",
          isolationLevel: isolation_level,
        };
        const validation = anStorageRouter.validateBackendConfig(backendConfig);
        if (!validation.valid && needsRef) {
          return res.status(400).json({ ok: false, error: validation.errorDetailAr || "backend config invalid" });
        }
        const { probeBackendBinding } = await import("./src/lib/anDataPlane");
        const probe = probeBackendBinding(settings);
        let persisted = false;
        let persistError: string | null = null;
        try {
          if (typeof adminDb !== "undefined" && adminDb) {
            const payload = {
              auth_driver,
              db_backend,
              isolation_level,
              connection_ref: connection_ref || "",
              an_backend_updated_at: new Date().toISOString(),
              an_backend_version: "A4",
            };
            await adminDb.collection("companies").doc(companyId).set(payload, { merge: true });
            persisted = true;
          } else {
            persistError = "adminDb_unavailable";
          }
        } catch (pe: any) {
          persistError = pe?.message ? String(pe.message).slice(0, 160) : "persist_failed";
          console.warn("company-backend persist:", persistError);
        }
        res.json({
          ok: true,
          companyId,
          settings,
          backendConfig,
          probe: {
            adapterType: probe.adapterType,
            isolationLevel: probe.isolationLevel,
            connectionRef: probe.connectionRef,
            envRefPresent: probe.envRefPresent,
            requiresEnvRef: probe.requiresEnvRef,
            certifiedNote: probe.certifiedNote,
            errorEn: probe.errorEn,
            errorAr: probe.errorAr,
          },
          persisted,
          persistError,
          version: "7.2.0",
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/auth-policy", async (req: any, res: any) => {
      try {
        // Dynamic import keeps client bundle free of server policy helpers when unused
        const { resolveAuthPolicyServer } = await import("./src/lib/authPolicy");
        const companyId = typeof req.query.companyId === "string" ? req.query.companyId : "";
        // Policy is deployment-level; company driver only selects path when AN_ENABLE_AN_JWT is on.
        const company = companyId ? { auth_driver: req.query.auth_driver } : null;
        const policy = resolveAuthPolicyServer(
          company && (req.query.auth_driver === "an-jwt" || req.query.auth_driver === "firebase")
            ? { auth_driver: req.query.auth_driver }
            : null
        );
        res.json({
          ok: true,
          policy,
          loginEndpoint:
            policy.activePath === "firebase-session"
              ? "/api/auth/verify-credentials"
              : "/api/auth/verify-credentials",
          note: "an-jwt login endpoint is not activated in MERGE-M3; flag only reserves the path.",
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/routes", async (_req: any, res: any) => {
      try {
        const { AN_ROUTE_CATALOG, AN_API_PREFIX, CF_RESERVED_PREFIXES } = await import("./src/lib/anApi");
        res.json({
          ok: true,
          prefix: AN_API_PREFIX,
          routes: AN_ROUTE_CATALOG,
          reservedCustodyFlowPrefixes: CF_RESERVED_PREFIXES,
          version: "7.2.0",
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/data-plane/status", async (req: any, res: any) => {
      try {
        const { probeDefaultProcessPlane, probeBackendBinding } = await import("./src/lib/anDataPlane");
        const q = req.query || {};
        const hasOverride =
          typeof q.db_backend === "string" ||
          typeof q.connection_ref === "string" ||
          typeof q.isolation_level === "string";
        const probe = hasOverride
          ? probeBackendBinding({
              db_backend: q.db_backend,
              connection_ref: q.connection_ref,
              isolation_level: q.isolation_level,
              auth_driver: q.auth_driver,
            })
          : probeDefaultProcessPlane(process.env);
        res.json({
          ok: probe.ok,
          plane: "an-data-plane-a1",
          probe: {
            adapterType: probe.adapterType,
            isolationLevel: probe.isolationLevel,
            connectionRef: probe.connectionRef,
            envRefPresent: probe.envRefPresent,
            requiresEnvRef: probe.requiresEnvRef,
            certifiedNote: probe.certifiedNote,
            errorAr: probe.errorAr,
            errorEn: probe.errorEn,
          },
          firestoreOperationalPath: "unchanged",
          loginPath: "/api/auth/verify-credentials",
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/data-plane/company/:companyId", async (req: any, res: any) => {
      try {
        const companyId = String(req.params.companyId || "").trim();
        if (!companyId) {
          return res.status(400).json({ ok: false, error: "companyId required" });
        }
        const { probeCompanyPlane } = await import("./src/lib/anDataPlane");
        let record: Record<string, unknown> | null = null;
        let source: "firestore" | "unavailable" = "unavailable";
        try {
          if (typeof adminDb !== "undefined" && adminDb) {
            const snap = await adminDb.collection("companies").doc(companyId).get();
            if (snap.exists) {
              record = snap.data() as Record<string, unknown>;
              source = "firestore";
            } else {
              source = "firestore";
              record = null;
            }
          }
        } catch (readErr: any) {
          console.warn("data-plane company read:", readErr?.message || readErr);
          source = "unavailable";
          record = null;
        }
        const result = probeCompanyPlane(companyId, record, source === "unavailable" ? "unavailable" : "firestore");
        res.json({
          ok: result.probe.ok,
          plane: "an-data-plane-a2",
          companyId: result.companyId,
          companyFound: !!(record && source === "firestore"),
          companySource: result.companySource,
          settings: result.settings,
          probe: {
            adapterType: result.probe.adapterType,
            isolationLevel: result.probe.isolationLevel,
            connectionRef: result.probe.connectionRef,
            envRefPresent: result.probe.envRefPresent,
            requiresEnvRef: result.probe.requiresEnvRef,
            certifiedNote: result.probe.certifiedNote,
            errorAr: result.probe.errorAr,
            errorEn: result.probe.errorEn,
          },
          firestoreOperationalPath: "unchanged",
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/data-plane/live-check", async (req: any, res: any) => {
      try {
        const { liveCheckDefaultProcess, liveCheckBackend } = await import("./src/lib/anDataPlane");
        const q = req.query || {};
        const hasOverride =
          typeof q.db_backend === "string" ||
          typeof q.connection_ref === "string";
        let live;
        let probeMeta = null;
        if (hasOverride) {
          live = await liveCheckBackend({
            db_backend: q.db_backend,
            connection_ref: q.connection_ref,
            isolation_level: q.isolation_level,
            auth_driver: q.auth_driver,
          });
        } else {
          const both = await liveCheckDefaultProcess(process.env);
          live = both.live;
          probeMeta = {
            adapterType: both.probe.adapterType,
            envRefPresent: both.probe.envRefPresent,
            certifiedNote: both.probe.certifiedNote,
          };
        }
        res.json({
          ok: live.ok,
          plane: "an-data-plane-a3",
          live: {
            attempted: live.attempted,
            skipped: live.skipped,
            ok: live.ok,
            adapterType: live.adapterType,
            connectionRef: live.connectionRef,
            latencyMs: live.latencyMs,
            detail: live.detail,
            detailAr: live.detailAr,
          },
          probeMeta,
          firestoreOperationalPath: "unchanged",
          loginPath: "/api/auth/verify-credentials",
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/session-plane", async (req: any, res: any) => {
      try {
        const { buildSessionPlane } = await import("./src/lib/anSessionPlane");
        const companyId = typeof req.query.companyId === "string" ? req.query.companyId.trim() : "";
        const runLive = req.query.live === "1" || req.query.live === "true";
        let record: Record<string, unknown> | null = null;
        let companySource: "firestore" | "process-default" | "unavailable" = "process-default";
        if (companyId) {
          try {
            if (typeof adminDb !== "undefined" && adminDb) {
              const snap = await adminDb.collection("companies").doc(companyId).get();
              if (snap.exists) {
                record = snap.data() as Record<string, unknown>;
                companySource = "firestore";
              } else {
                companySource = "firestore";
                record = null;
              }
            } else {
              companySource = "unavailable";
            }
          } catch (e: any) {
            console.warn("session-plane company read:", e?.message || e);
            companySource = "unavailable";
          }
        }
        const result = await buildSessionPlane({
          companyId: companyId || "process",
          companyRecord: record,
          companySource: companyId ? companySource : "process-default",
          runLive,
        });
        res.json({
          ok: result.ok,
          plane: "an-auth-plane-b1",
          companyId: result.companyId,
          auth: result.auth,
          settings: result.companyPlane.settings,
          probe: {
            ok: result.companyPlane.probe.ok,
            adapterType: result.companyPlane.probe.adapterType,
            isolationLevel: result.companyPlane.probe.isolationLevel,
            connectionRef: result.companyPlane.probe.connectionRef,
            envRefPresent: result.companyPlane.probe.envRefPresent,
            requiresEnvRef: result.companyPlane.probe.requiresEnvRef,
            certifiedNote: result.companyPlane.probe.certifiedNote,
            errorEn: result.companyPlane.probe.errorEn,
          },
          live: result.live
            ? {
                attempted: result.live.attempted,
                skipped: result.live.skipped,
                ok: result.live.ok,
                adapterType: result.live.adapterType,
                connectionRef: result.live.connectionRef,
                latencyMs: result.live.latencyMs,
                detail: result.live.detail,
              }
            : null,
          loginPath: result.loginPath,
          firestoreOperationalPath: result.firestoreOperationalPath,
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/inventory/summary", async (req: any, res: any) => {
      try {
        const { readInventorySummary } = await import("./src/lib/anInventoryRead");
        const companyId = typeof req.query.companyId === "string" ? req.query.companyId.trim() : "";
        const summary = await readInventorySummary(anStorageRouter, {
          companyId: companyId || "default",
        });
        res.json({
          ok: summary.ok,
          plane: "an-module-inv-c1",
          source: summary.source,
          tenantId: summary.tenantId,
          warehouseCount: summary.warehouseCount,
          itemCount: summary.itemCount,
          probe: summary.probe,
          detail: summary.detail,
          detailAr: summary.detailAr,
          kemitInventoryPage: summary.kemitInventoryPage,
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/accounting/summary", async (req: any, res: any) => {
      try {
        const { readAccountingSummary } = await import("./src/lib/anAccountingRead");
        const companyId = typeof req.query.companyId === "string" ? req.query.companyId.trim() : "";
        const summary = await readAccountingSummary(anStorageRouter, {
          companyId: companyId || "default",
        });
        res.json({
          ok: summary.ok,
          plane: "an-module-acc-c3",
          source: summary.source,
          tenantId: summary.tenantId,
          accountCount: summary.accountCount,
          journalCount: summary.journalCount,
          probe: summary.probe,
          detail: summary.detail,
          detailAr: summary.detailAr,
          kemitAccountingPage: summary.kemitAccountingPage,
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/purchasing/summary", async (req: any, res: any) => {
      try {
        const { readPurchasingSummary } = await import("./src/lib/anPurchasingRead");
        const companyId = typeof req.query.companyId === "string" ? req.query.companyId.trim() : "";
        const summary = await readPurchasingSummary(anStorageRouter, {
          companyId: companyId || "default",
        });
        res.json({
          ok: summary.ok,
          plane: "an-module-pur-c4",
          source: summary.source,
          tenantId: summary.tenantId,
          purchaseOrderCount: summary.purchaseOrderCount,
          goodsReceiptCount: summary.goodsReceiptCount,
          purchaseRequestCount: summary.purchaseRequestCount,
          probe: summary.probe,
          detail: summary.detail,
          detailAr: summary.detailAr,
          kemitPurchasingPage: summary.kemitPurchasingPage,
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/modules/overview", async (req: any, res: any) => {
      try {
        const { readModulesOverview } = await import("./src/lib/anModulesOverview");
        const companyId = typeof req.query.companyId === "string" ? req.query.companyId.trim() : "";
        const overview = await readModulesOverview(anStorageRouter, {
          companyId: companyId || "default",
        });
        res.json(overview);
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/shadow/status", async (req: any, res: any) => {
      try {
        const { buildShadowStatus } = await import("./src/lib/anShadowStatus");
        const companyId = typeof req.query.companyId === "string" ? req.query.companyId.trim() : "";
        const status = await buildShadowStatus(anStorageRouter, {
          companyId: companyId || "default",
        });
        res.json(status);
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/map/entities", async (_req: any, res: any) => {
      try {
        const { listEntityMap } = await import("./src/lib/anEntityMap");
        res.json(listEntityMap());
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/migration/readiness", async (req: any, res: any) => {
      try {
        const { buildMigrationReadiness } = await import("./src/lib/anMigrationReadiness");
        const companyId = typeof req.query.companyId === "string" ? req.query.companyId.trim() : "";
        const result = await buildMigrationReadiness(anStorageRouter, {
          companyId: companyId || "default",
        });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/ops/runbook", async (_req: any, res: any) => {
      try {
        const { getDualPathRunbook } = await import("./src/lib/anOpsRunbook");
        res.json(getDualPathRunbook());
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    // AN-SEC-MIGRATE-1: Require authenticated platform/system admin before any migrate action.
    // Downstream migrate modules enforce AN_MIGRATE_WRITES flag after this operator check passes.
    async function requireAnMigrateOperator(req: any, res: any): Promise<boolean> {
      const authResult = await authenticateSessionOrBearer(req);
      if (!authResult.authenticated) {
        res.status(authResult.statusCode || 401).json({
          ok: false,
          code: "migrate_unauthorized",
          message: authResult.message || "Unauthorized",
          messageAr: "يلزم تسجيل الدخول لتنفيذ الترحيل",
        });
        return false;
      }
      const user = authResult.user || {};
      const role = String(user.role || "");
      const isAdminRole =
        role === "SystemAdmin" ||
        role === "Admin" ||
        role === "super_admin" ||
        role === "system_admin";
      let platform = false;
      try {
        platform = await isPlatformAdminUser(user.email, user);
      } catch {
        platform = false;
      }
      if (!platform && !isAdminRole) {
        res.status(403).json({
          ok: false,
          code: "migrate_forbidden",
          message: "Forbidden: migrate requires platform or system admin",
          messageAr: "الترحيل متاح لمدير المنصة أو مسؤول النظام فقط",
        });
        return false;
      }
      (req as any).anMigrateUser = user;
      return true;
    }

    app.get("/api/an/migrate/inventory/dry-run", async (req: any, res: any) => {
      try {
        if (!(await requireAnMigrateOperator(req, res))) return;
        const companyId = typeof req.query.companyId === "string" ? req.query.companyId.trim() : "default";
        const { loadCompanyLikeFromFirestore, resolveCompanyStorageAdapter, isAdapterFailClosedEnv } = await import("./src/lib/anResolveCompanyAdapter");
        const loadResult = await loadCompanyLikeFromFirestore(
          typeof adminDb !== "undefined" ? adminDb : null,
          companyId
        );
        if (loadResult.status === "error" && isAdapterFailClosedEnv(process.env)) {
          return res.status(503).json({
            ok: false,
            code: "adapter_company_load_failed",
            message: loadResult.message || "Company config load failed",
            messageAr: "تعذر تحميل إعدادات قاعدة بيانات الشركة — لن يتم التوجيه الصامت للقاعدة الأساسية",
          });
        }
        const companyLike = loadResult.status === "loaded" ? loadResult.company : null;
        const bodyBackend = req.body?.backend && typeof req.body.backend === "object" ? req.body.backend : null;
        if (bodyBackend && typeof bodyBackend.connection_ref === "string") {
          const ref = String(bodyBackend.connection_ref);
          if (ref.includes("://") || ref.toLowerCase().includes("password=")) {
            return res.status(400).json({ ok: false, code: "invalid_connection_ref", message: "connection_ref must be env var name only" });
          }
        }
        let resolved;
        try {
          resolved = resolveCompanyStorageAdapter(
            anStorageRouter,
            companyId,
            companyLike,
            bodyBackend,
            { loadStatus: loadResult, failClosed: isAdapterFailClosedEnv(process.env) }
          );
        } catch (e: any) {
          return res.status(400).json({ ok: false, code: "adapter_resolve_failed", message: e?.message || String(e) });
        }
        const { buildInventoryMigrateDryRun } = await import("./src/lib/anMigrateInventoryDry");
        const countKemit = async (cid: string) => {
          if (typeof adminDb === "undefined" || !adminDb) {
            return { warehouseCount: null, productCount: null, detail: "adminDb_unavailable" };
          }
          // Best-effort counts; collection names may vary — never throw out
          let warehouseCount: number | null = null;
          let productCount: number | null = null;
          const details: string[] = [];
          try {
            const wh = await adminDb.collection("warehouses").where("company_id", "==", cid).get();
            warehouseCount = wh.size;
          } catch (e: any) {
            details.push("warehouses:" + (e?.message || "err"));
            try {
              const wh2 = await adminDb.collection("warehouses").limit(500).get();
              warehouseCount = wh2.docs.filter((d: any) => (d.data() || {}).company_id === cid).length;
            } catch {
              warehouseCount = null;
            }
          }
          try {
            const pr = await adminDb.collection("products").where("company_id", "==", cid).get();
            productCount = pr.size;
          } catch (e: any) {
            details.push("products:" + (e?.message || "err"));
            try {
              const pr2 = await adminDb.collection("products").limit(500).get();
              productCount = pr2.docs.filter((d: any) => (d.data() || {}).company_id === cid).length;
            } catch {
              productCount = null;
            }
          }
          return {
            warehouseCount,
            productCount,
            detail: details.join(";") || "ok",
          };
        };
        const report = await buildInventoryMigrateDryRun(anStorageRouter, {
          companyId,
          countKemit,
          adapter: resolved.adapter,
        });
        res.json({
          ...report,
          adapterResolution: {
            source: resolved.source,
            adapterType: resolved.adapterType,
            isolationLevel: resolved.isolationLevel,
            connectionRef: resolved.connectionRef,
          },
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.post("/api/an/migrate/inventory/warehouses", async (req: any, res: any) => {
      try {
        if (!(await requireAnMigrateOperator(req, res))) return;
        const companyId = String(req.body?.companyId || req.query?.companyId || "").trim();
        if (!companyId) {
          return res.status(400).json({ ok: false, error: "companyId required" });
        }
        const { loadCompanyLikeFromFirestore, resolveCompanyStorageAdapter, isAdapterFailClosedEnv } = await import("./src/lib/anResolveCompanyAdapter");
        const loadResult = await loadCompanyLikeFromFirestore(
          typeof adminDb !== "undefined" ? adminDb : null,
          companyId
        );
        if (loadResult.status === "error" && isAdapterFailClosedEnv(process.env)) {
          return res.status(503).json({
            ok: false,
            code: "adapter_company_load_failed",
            message: loadResult.message || "Company config load failed",
            messageAr: "تعذر تحميل إعدادات قاعدة بيانات الشركة — لن يتم التوجيه الصامت للقاعدة الأساسية",
          });
        }
        const companyLike = loadResult.status === "loaded" ? loadResult.company : null;
        const bodyBackend = req.body?.backend && typeof req.body.backend === "object" ? req.body.backend : null;
        if (bodyBackend && typeof bodyBackend.connection_ref === "string") {
          const ref = String(bodyBackend.connection_ref);
          if (ref.includes("://") || ref.toLowerCase().includes("password=")) {
            return res.status(400).json({ ok: false, code: "invalid_connection_ref", message: "connection_ref must be env var name only" });
          }
        }
        let resolved;
        try {
          resolved = resolveCompanyStorageAdapter(
            anStorageRouter,
            companyId,
            companyLike,
            bodyBackend,
            { loadStatus: loadResult, failClosed: isAdapterFailClosedEnv(process.env), requireLoaded: true }
          );
        } catch (e: any) {
          return res.status(400).json({ ok: false, code: "adapter_resolve_failed", message: e?.message || String(e) });
        }
        const { extractIdempotencyKey, requireIdempotencyKey } = await import("./src/lib/anMigrateIdempotency");
        const rawKey = extractIdempotencyKey(req);
        const keyCheck: any = requireIdempotencyKey(rawKey);
        if (!keyCheck.ok) {
          return res.status(keyCheck.status).json({
            ok: false,
            code: keyCheck.code || "idempotency_key_required",
            message: keyCheck.message,
            messageAr: keyCheck.messageAr,
          });
        }
        const { migrateWarehousesToAn } = await import("./src/lib/anMigrateInventoryWrite");
        let rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
        if (!rows) {
          // Load from Firestore when adminDb available
          rows = [];
          if (typeof adminDb !== "undefined" && adminDb) {
            try {
              const snap = await adminDb.collection("warehouses").where("company_id", "==", companyId).get();
              rows = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
            } catch (e: any) {
              try {
                const snap2 = await adminDb.collection("warehouses").limit(500).get();
                rows = snap2.docs
                  .map((d: any) => ({ id: d.id, ...d.data() }))
                  .filter((r: any) => r.company_id === companyId);
              } catch (e2: any) {
                return res.status(500).json({
                  ok: false,
                  error: "failed_to_load_kemit_warehouses",
                  detail: e2?.message || e?.message,
                });
              }
            }
          }
        }
        const result = await migrateWarehousesToAn(anStorageRouter, {
          companyId,
          rows: rows || [],
          adapter: resolved.adapter,
          batchIdempotencyKey: keyCheck.key,
        });
        const status = result.writesEnabled ? 200 : 403;
        res.status(status).json({
          ...result,
          idempotencyKey: keyCheck.key,
          adapterResolution: {
            source: resolved.source,
            adapterType: resolved.adapterType,
            isolationLevel: resolved.isolationLevel,
            connectionRef: resolved.connectionRef,
          },
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.post("/api/an/migrate/inventory/items", async (req: any, res: any) => {
      try {
        if (!(await requireAnMigrateOperator(req, res))) return;
        const companyId = String(req.body?.companyId || req.query?.companyId || "").trim();
        if (!companyId) return res.status(400).json({ ok: false, error: "companyId required" });
        const { loadCompanyLikeFromFirestore, resolveCompanyStorageAdapter, isAdapterFailClosedEnv } = await import("./src/lib/anResolveCompanyAdapter");
        const loadResult = await loadCompanyLikeFromFirestore(
          typeof adminDb !== "undefined" ? adminDb : null,
          companyId
        );
        if (loadResult.status === "error" && isAdapterFailClosedEnv(process.env)) {
          return res.status(503).json({
            ok: false,
            code: "adapter_company_load_failed",
            message: loadResult.message || "Company config load failed",
            messageAr: "تعذر تحميل إعدادات قاعدة بيانات الشركة — لن يتم التوجيه الصامت للقاعدة الأساسية",
          });
        }
        const companyLike = loadResult.status === "loaded" ? loadResult.company : null;
        const bodyBackend = req.body?.backend && typeof req.body.backend === "object" ? req.body.backend : null;
        if (bodyBackend && typeof bodyBackend.connection_ref === "string") {
          const ref = String(bodyBackend.connection_ref);
          if (ref.includes("://") || ref.toLowerCase().includes("password=")) {
            return res.status(400).json({ ok: false, code: "invalid_connection_ref", message: "connection_ref must be env var name only" });
          }
        }
        let resolved;
        try {
          resolved = resolveCompanyStorageAdapter(
            anStorageRouter,
            companyId,
            companyLike,
            bodyBackend,
            { loadStatus: loadResult, failClosed: isAdapterFailClosedEnv(process.env), requireLoaded: true }
          );
        } catch (e: any) {
          return res.status(400).json({ ok: false, code: "adapter_resolve_failed", message: e?.message || String(e) });
        }
        const { extractIdempotencyKey, requireIdempotencyKey } = await import("./src/lib/anMigrateIdempotency");
        const rawKey = extractIdempotencyKey(req);
        const keyCheck: any = requireIdempotencyKey(rawKey);
        if (!keyCheck.ok) {
          return res.status(keyCheck.status).json({
            ok: false,
            code: keyCheck.code || "idempotency_key_required",
            message: keyCheck.message,
            messageAr: keyCheck.messageAr,
          });
        }
        const { migrateStockItemsToAn } = await import("./src/lib/anMigrateInventoryItems");
        let rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
        if (!rows) {
          rows = [];
          if (typeof adminDb !== "undefined" && adminDb) {
            try {
              const snap = await adminDb.collection("products").where("company_id", "==", companyId).get();
              rows = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
            } catch {
              try {
                const snap2 = await adminDb.collection("products").limit(500).get();
                rows = snap2.docs
                  .map((d: any) => ({ id: d.id, ...d.data() }))
                  .filter((r: any) => r.company_id === companyId);
              } catch (e: any) {
                return res.status(500).json({ ok: false, error: "failed_to_load_products", detail: e?.message });
              }
            }
          }
        }
        const result = await migrateStockItemsToAn(anStorageRouter, {
          companyId,
          rows: rows || [],
          adapter: resolved.adapter,
          batchIdempotencyKey: keyCheck.key,
        });
        res.status(result.writesEnabled ? 200 : 403).json({
          ...result,
          idempotencyKey: keyCheck.key,
          adapterResolution: {
            source: resolved.source,
            adapterType: resolved.adapterType,
            isolationLevel: resolved.isolationLevel,
            connectionRef: resolved.connectionRef,
          },
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.post("/api/an/migrate/inventory/balances", async (req: any, res: any) => {
      try {
        if (!(await requireAnMigrateOperator(req, res))) return;
        const companyId = String(req.body?.companyId || req.query?.companyId || "").trim();
        if (!companyId) return res.status(400).json({ ok: false, error: "companyId required" });
        const { loadCompanyLikeFromFirestore, resolveCompanyStorageAdapter, isAdapterFailClosedEnv } = await import("./src/lib/anResolveCompanyAdapter");
        const loadResult = await loadCompanyLikeFromFirestore(
          typeof adminDb !== "undefined" ? adminDb : null,
          companyId
        );
        if (loadResult.status === "error" && isAdapterFailClosedEnv(process.env)) {
          return res.status(503).json({
            ok: false,
            code: "adapter_company_load_failed",
            message: loadResult.message || "Company config load failed",
            messageAr: "تعذر تحميل إعدادات قاعدة بيانات الشركة — لن يتم التوجيه الصامت للقاعدة الأساسية",
          });
        }
        const companyLike = loadResult.status === "loaded" ? loadResult.company : null;
        const bodyBackend = req.body?.backend && typeof req.body.backend === "object" ? req.body.backend : null;
        if (bodyBackend && typeof bodyBackend.connection_ref === "string") {
          const ref = String(bodyBackend.connection_ref);
          if (ref.includes("://") || ref.toLowerCase().includes("password=")) {
            return res.status(400).json({ ok: false, code: "invalid_connection_ref", message: "connection_ref must be env var name only" });
          }
        }
        let resolved;
        try {
          resolved = resolveCompanyStorageAdapter(
            anStorageRouter,
            companyId,
            companyLike,
            bodyBackend,
            { loadStatus: loadResult, failClosed: isAdapterFailClosedEnv(process.env), requireLoaded: true }
          );
        } catch (e: any) {
          return res.status(400).json({ ok: false, code: "adapter_resolve_failed", message: e?.message || String(e) });
        }
        const { extractIdempotencyKey, requireIdempotencyKey } = await import("./src/lib/anMigrateIdempotency");
        const rawKey = extractIdempotencyKey(req);
        const keyCheck: any = requireIdempotencyKey(rawKey);
        if (!keyCheck.ok) {
          return res.status(keyCheck.status).json({
            ok: false,
            code: keyCheck.code || "idempotency_key_required",
            message: keyCheck.message,
            messageAr: keyCheck.messageAr,
          });
        }
        const { migrateOpeningBalancesToAn } = await import("./src/lib/anMigrateInventoryBalances");
        let rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
        if (!rows) {
          rows = [];
          if (typeof adminDb !== "undefined" && adminDb) {
            // Try inventory_balances and balances collection names
            const tryCols = ["inventory_balances", "balances", "warehouse_stock"];
            for (const col of tryCols) {
              try {
                const snap = await adminDb.collection(col).where("company_id", "==", companyId).limit(2000).get();
                if (!snap.empty) {
                  rows = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
                  break;
                }
              } catch {
                /* try next */
              }
            }
          }
        }
        const result = await migrateOpeningBalancesToAn(anStorageRouter, {
          companyId,
          rows: rows || [],
          adapter: resolved.adapter,
          batchIdempotencyKey: keyCheck.key,
        });
        res.status(result.writesEnabled ? 200 : 403).json({
          ...result,
          idempotencyKey: keyCheck.key,
          adapterResolution: {
            source: resolved.source,
            adapterType: resolved.adapterType,
            isolationLevel: resolved.isolationLevel,
            connectionRef: resolved.connectionRef,
          },
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.post("/api/an/migrate/accounting/accounts", async (req: any, res: any) => {
      try {
        if (!(await requireAnMigrateOperator(req, res))) return;
        const companyId = String(req.body?.companyId || req.query?.companyId || "").trim();
        if (!companyId) return res.status(400).json({ ok: false, error: "companyId required" });
        const { loadCompanyLikeFromFirestore, resolveCompanyStorageAdapter, isAdapterFailClosedEnv } = await import("./src/lib/anResolveCompanyAdapter");
        const loadResult = await loadCompanyLikeFromFirestore(
          typeof adminDb !== "undefined" ? adminDb : null,
          companyId
        );
        if (loadResult.status === "error" && isAdapterFailClosedEnv(process.env)) {
          return res.status(503).json({
            ok: false,
            code: "adapter_company_load_failed",
            message: loadResult.message || "Company config load failed",
            messageAr: "تعذر تحميل إعدادات قاعدة بيانات الشركة — لن يتم التوجيه الصامت للقاعدة الأساسية",
          });
        }
        const companyLike = loadResult.status === "loaded" ? loadResult.company : null;
        const bodyBackend = req.body?.backend && typeof req.body.backend === "object" ? req.body.backend : null;
        if (bodyBackend && typeof bodyBackend.connection_ref === "string") {
          const ref = String(bodyBackend.connection_ref);
          if (ref.includes("://") || ref.toLowerCase().includes("password=")) {
            return res.status(400).json({ ok: false, code: "invalid_connection_ref", message: "connection_ref must be env var name only" });
          }
        }
        let resolved;
        try {
          resolved = resolveCompanyStorageAdapter(
            anStorageRouter,
            companyId,
            companyLike,
            bodyBackend,
            { loadStatus: loadResult, failClosed: isAdapterFailClosedEnv(process.env), requireLoaded: true }
          );
        } catch (e: any) {
          return res.status(400).json({ ok: false, code: "adapter_resolve_failed", message: e?.message || String(e) });
        }
        const { extractIdempotencyKey, requireIdempotencyKey } = await import("./src/lib/anMigrateIdempotency");
        const rawKey = extractIdempotencyKey(req);
        const keyCheck: any = requireIdempotencyKey(rawKey);
        if (!keyCheck.ok) {
          return res.status(keyCheck.status).json({
            ok: false,
            code: keyCheck.code || "idempotency_key_required",
            message: keyCheck.message,
            messageAr: keyCheck.messageAr,
          });
        }
        const { migrateAccountsToAn } = await import("./src/lib/anMigrateAccounts");
        let rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
        if (!rows) {
          rows = [];
          if (typeof adminDb !== "undefined" && adminDb) {
            const cols = ["accounts", "chart_of_accounts", "coa"];
            for (const col of cols) {
              try {
                const snap = await adminDb.collection(col).where("company_id", "==", companyId).limit(2000).get();
                if (!snap.empty) {
                  rows = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
                  break;
                }
              } catch { /* next */ }
            }
          }
        }
        const result = await migrateAccountsToAn(anStorageRouter, {
          companyId,
          rows: rows || [],
          adapter: resolved.adapter,
          batchIdempotencyKey: keyCheck.key,
        });
        res.status(result.writesEnabled ? 200 : 403).json({
          ...result,
          idempotencyKey: keyCheck.key,
          adapterResolution: {
            source: resolved.source,
            adapterType: resolved.adapterType,
            isolationLevel: resolved.isolationLevel,
            connectionRef: resolved.connectionRef,
          },
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.get("/api/an/inventory/warehouses", async (req: any, res: any) => {
      try {
        const authResult = await authenticateSessionOrBearer(req);
        if (!authResult.authenticated) {
          return res.status(authResult.statusCode || 401).json({ ok: false, message: authResult.message });
        }
        const companyId = String(req.query.companyId || "").trim();
        if (!companyId) return res.status(400).json({ ok: false, error: "companyId required" });
        const scope: any = await assertUserCanAccessCompany(authResult.user, companyId);
        if (!scope.ok) {
          return res.status(scope.status).json({
            ok: false,
            code: scope.code,
            message: scope.message,
            messageAr: scope.messageAr,
          });
        }
        const { loadCompanyLikeFromFirestore, resolveCompanyStorageAdapter, isAdapterFailClosedEnv } = await import("./src/lib/anResolveCompanyAdapter");
        const { listAnWarehouses } = await import("./src/lib/anInventoryLists");
        const loadResult = await loadCompanyLikeFromFirestore(
          typeof adminDb !== "undefined" ? adminDb : null,
          companyId
        );
        if (loadResult.status === "error" && isAdapterFailClosedEnv(process.env)) {
          return res.status(503).json({
            ok: false,
            code: "adapter_company_load_failed",
            message: loadResult.message || "Company config load failed",
            messageAr: "تعذر تحميل إعدادات قاعدة بيانات الشركة — لن يتم التوجيه الصامت للقاعدة الأساسية",
          });
        }
        const companyLike = loadResult.status === "loaded" ? loadResult.company : null;
        let resolved;
        try {
          resolved = resolveCompanyStorageAdapter(
            anStorageRouter,
            companyId,
            companyLike,
            null,
            { loadStatus: loadResult, failClosed: isAdapterFailClosedEnv(process.env) }
          );
        } catch (e: any) {
          return res.status(400).json({ ok: false, code: "adapter_resolve_failed", message: e?.message || String(e) });
        }
        const result = await listAnWarehouses(resolved.adapter, companyId, resolved);
        res.status(result.ok ? 200 : 500).json(result);
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });

    app.get("/api/an/inventory/items", async (req: any, res: any) => {
      try {
        const authResult = await authenticateSessionOrBearer(req);
        if (!authResult.authenticated) {
          return res.status(authResult.statusCode || 401).json({ ok: false, message: authResult.message });
        }
        const companyId = String(req.query.companyId || "").trim();
        if (!companyId) return res.status(400).json({ ok: false, error: "companyId required" });
        const scope: any = await assertUserCanAccessCompany(authResult.user, companyId);
        if (!scope.ok) {
          return res.status(scope.status).json({
            ok: false,
            code: scope.code,
            message: scope.message,
            messageAr: scope.messageAr,
          });
        }
        const { loadCompanyLikeFromFirestore, resolveCompanyStorageAdapter, isAdapterFailClosedEnv } = await import("./src/lib/anResolveCompanyAdapter");
        const { listAnStockItems } = await import("./src/lib/anInventoryLists");
        const loadResult = await loadCompanyLikeFromFirestore(
          typeof adminDb !== "undefined" ? adminDb : null,
          companyId
        );
        if (loadResult.status === "error" && isAdapterFailClosedEnv(process.env)) {
          return res.status(503).json({
            ok: false,
            code: "adapter_company_load_failed",
            message: loadResult.message || "Company config load failed",
            messageAr: "تعذر تحميل إعدادات قاعدة بيانات الشركة — لن يتم التوجيه الصامت للقاعدة الأساسية",
          });
        }
        const companyLike = loadResult.status === "loaded" ? loadResult.company : null;
        let resolved;
        try {
          resolved = resolveCompanyStorageAdapter(
            anStorageRouter,
            companyId,
            companyLike,
            null,
            { loadStatus: loadResult, failClosed: isAdapterFailClosedEnv(process.env) }
          );
        } catch (e: any) {
          return res.status(400).json({ ok: false, code: "adapter_resolve_failed", message: e?.message || String(e) });
        }
        const result = await listAnStockItems(resolved.adapter, companyId, resolved);
        res.status(result.ok ? 200 : 500).json(result);
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });

    app.get("/api/an/inventory/stock", async (req: any, res: any) => {
      try {
        const authResult = await authenticateSessionOrBearer(req);
        if (!authResult.authenticated) {
          return res.status(authResult.statusCode || 401).json({ ok: false, message: authResult.message });
        }
        const companyId = String(req.query.companyId || "").trim();
        if (!companyId) return res.status(400).json({ ok: false, error: "companyId required" });
        const scope: any = await assertUserCanAccessCompany(authResult.user, companyId);
        if (!scope.ok) {
          return res.status(scope.status).json({
            ok: false,
            code: scope.code,
            message: scope.message,
            messageAr: scope.messageAr,
          });
        }
        const warehouseId = req.query.warehouseId ? String(req.query.warehouseId).trim() : undefined;
        const itemId = req.query.itemId ? String(req.query.itemId).trim() : undefined;
        const { loadCompanyLikeFromFirestore, resolveCompanyStorageAdapter, isAdapterFailClosedEnv } = await import("./src/lib/anResolveCompanyAdapter");
        const { listAnStockBalances } = await import("./src/lib/anInventoryLists");
        const loadResult = await loadCompanyLikeFromFirestore(
          typeof adminDb !== "undefined" ? adminDb : null,
          companyId
        );
        if (loadResult.status === "error" && isAdapterFailClosedEnv(process.env)) {
          return res.status(503).json({
            ok: false,
            code: "adapter_company_load_failed",
            message: loadResult.message || "Company config load failed",
            messageAr: "تعذر تحميل إعدادات قاعدة بيانات الشركة — لن يتم التوجيه الصامت للقاعدة الأساسية",
          });
        }
        const companyLike = loadResult.status === "loaded" ? loadResult.company : null;
        let resolved;
        try {
          resolved = resolveCompanyStorageAdapter(
            anStorageRouter,
            companyId,
            companyLike,
            null,
            { loadStatus: loadResult, failClosed: isAdapterFailClosedEnv(process.env) }
          );
        } catch (e: any) {
          return res.status(400).json({ ok: false, code: "adapter_resolve_failed", message: e?.message || String(e) });
        }
        const result = await listAnStockBalances(
          resolved.adapter,
          companyId,
          { warehouseId, itemId },
          resolved
        );
        res.status(result.ok ? 200 : 500).json(result);
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });

    // AN-INV-PILOT-1: gated single-line stock movement (AN_INV_PILOT_WRITES=1); see docs/ops/AN-INV-PILOT-1.md
    {
      const { mountAnInventoryPilotRoute } = await import("./src/lib/anInventoryPilotRoute");
      mountAnInventoryPilotRoute(app, {
        router: anStorageRouter,
        adminDb: typeof adminDb !== "undefined" ? adminDb : null,
        requireOperator: requireAnMigrateOperator,
        assertCompanyScope: assertUserCanAccessCompany,
      });
    }

    app.get("/api/an/auth/login-target", async (_req: any, res: any) => {
      try {
        const { buildAnLoginTargetStatus } = await import("./src/lib/anAuthLoginTarget");
        res.json(buildAnLoginTargetStatus(process.env, process.cwd()));
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    app.post("/api/an/auth/login", authRateLimiter, anLoginUserLimiter, async (req: any, res: any) => {
      try {
        const { anStyleLogin } = await import("./src/lib/anAuthLogin");
        const result: any = await anStyleLogin(
          anStorageRouter,
          {
            username: req.body?.username,
            password: req.body?.password,
            tenantId: req.body?.tenantId,
          },
          process.env,
          { ip: req.ip }
        );
        if (!result.ok) {
          return res.status(result.httpStatus || 401).json(result);
        }
        return res.status(200).json(result);
      } catch (err: any) {
        console.error("[AN-AUTH] login route error:", err?.name || "Error");
        res.status(500).json({ ok: false, plane: "an-auth-g2", code: "internal_error", messageAr: "خطأ داخلي" });
      }
    });
    try {
      const { runPlatformAdminBootstrapOnStart } = await import("./src/lib/anPlatformBootstrap");
      const boot = await runPlatformAdminBootstrapOnStart(anStorageRouter, process.env);
      if (!boot.ran) {
        console.log("[AN-AUTH-G5] platform bootstrap skipped:", boot.outcome);
      } else if (boot.outcome === "created" || boot.outcome === "already_exists" || boot.outcome === "migrated_synced" || boot.outcome === "migrated_created") {
        console.log("[AN-AUTH-G5] platform bootstrap:", boot.outcome);
      } else {
        console.warn("[AN-AUTH-G5] platform bootstrap issue:", boot.outcome, boot.code || "", boot.message || "");
      }
    } catch (bootErr: any) {
      console.warn("[AN-AUTH-G5] platform bootstrap error:", bootErr?.message || bootErr);
    }
    console.log("A.N core bridge mounted: /api/an/storage-status + company-backend + auth-policy + routes + data-plane/status + data-plane/company/:id + data-plane/live-check + session-plane + inventory/summary + accounting/summary + purchasing/summary + modules/overview + shadow/status + map/entities + migration/readiness + ops/runbook + migrate/inventory/dry-run + migrate/inventory/warehouses + migrate/inventory/items + migrate/inventory/balances + migrate/accounting/accounts + inventory/warehouses + inventory/items + inventory/stock + inventory/pilot/movement + auth/login-target + auth/login");
  } catch (anErr) {
    console.error("A.N core bridge failed to mount:", anErr);
  }

  // Studio Preview: SERVE_DIST=1 avoids @vite/client WebSocket entirely.
  const serveDist =
    process.env.SERVE_DIST === "1" ||
    process.env.SERVE_DIST === "true" ||
    process.env.NODE_ENV === "production";

  if (!serveDist) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.ENABLE_HMR === "true",
        watch: process.env.ENABLE_HMR === "true" ? {} : null,
      },
      appType: "custom",
    });
    app.use(vite.middlewares);
    app.use(async (req: any, res: any, next: any) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      const url = req.originalUrl || req.url || "";
      if (url.startsWith("/api")) return next();
      try {
        const fs = await import("fs");
        const pathMod = await import("path");
        const indexPath = pathMod.join(process.cwd(), "index.html");
        let template = fs.readFileSync(indexPath, "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: any, res: any, next: any) => {
      if ((req.originalUrl || req.url || "").startsWith("/api")) return next();
      res.sendFile(path.join(distPath, "index.html"), (err: any) => {
        if (err) next(err);
      });
    });
    console.log("Serving static dist/ (SERVE_DIST or production) — no Vite HMR client");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
