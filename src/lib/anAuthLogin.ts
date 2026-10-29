/**
 * AN-AUTH-G2 + AN-FIX-SEC-1 — server-side A.N-style password verify + access/refresh issue.
 * Hardening: constant-cost failures (no user enumeration), password verified BEFORE any status reveal,
 * input length caps, sanitized errors, structured audit lines (no secrets).
 */
import argon2 from 'argon2';
import crypto from 'crypto';
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import { TokenService } from '../an-core/auth/TokenService';
import { resolveAnLoginFlag } from './anAuthLoginTarget';

export interface AnLoginBody {
  username?: string;
  password?: string;
  tenantId?: string;
}

export interface AnLoginOk {
  ok: true;
  plane: 'an-auth-g2';
  user: {
    id: string;
    username: string;
    fullName: string;
    role: string;
    tenantId: string;
    requiresPasswordChange?: boolean;
  };
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  familyId: string;
  tokenType: 'Bearer';
  expiresInSec: number;
}

export interface AnLoginErr {
  ok: false;
  plane: 'an-auth-g2';
  code: string;
  message: string;
  messageAr: string;
  httpStatus: number;
}

const MAX_USERNAME_LEN = 128;
const MAX_PASSWORD_LEN = 1024;
const TENANT_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash(crypto.randomBytes(16).toString('hex'));
  }
  return dummyHashPromise as Promise<string>;
}

/** Spend roughly the same time as a real verification when the user does not exist. */
async function burnVerify(password: string): Promise<void> {
  try {
    await argon2.verify(await getDummyHash(), password);
  } catch {
    /* intentional: timing equalisation only */
  }
}

function fail(code: string, message: string, messageAr: string, httpStatus: number): AnLoginErr {
  return { ok: false, plane: 'an-auth-g2', code, message, messageAr, httpStatus };
}

function invalidCredentials(): AnLoginErr {
  return fail('invalid_credentials', 'Invalid username or password', 'اسم المستخدم أو كلمة المرور غير صحيحة', 401);
}

function userTag(username: string): string {
  return crypto.createHash('sha256').update(username.toLowerCase()).digest('hex').slice(0, 12);
}

function audit(event: string, fields: Record<string, unknown>): void {
  try {
    console.warn('[AN-AUTH-AUDIT] ' + JSON.stringify({ event, at: new Date().toISOString(), ...fields }));
  } catch {
    /* never throw from audit */
  }
}

function isActiveStatus(status: unknown): boolean {
  return !status || String(status).toUpperCase() === 'ACTIVE';
}

export async function anStyleLogin(
  router: StorageRouter,
  body: AnLoginBody,
  env: NodeJS.ProcessEnv = process.env,
  meta: { ip?: string } = {}
): Promise<AnLoginOk | AnLoginErr> {
  if (!resolveAnLoginFlag(env)) {
    return fail('an_login_disabled', 'AN_ENABLE_AN_LOGIN is not enabled', 'مسار دخول A.N غير مفعّل (AN_ENABLE_AN_LOGIN)', 403);
  }

  if (!env.JWT_SECRET || !String(env.JWT_SECRET).trim()) {
    return fail('jwt_secret_missing', 'JWT_SECRET is required for A.N login', 'JWT_SECRET مطلوب لدخول A.N', 503);
  }

  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const tenantId = String(body.tenantId || 'default').trim() || 'default';

  if (!username || !password) {
    return fail('missing_credentials', 'username and password required', 'اسم المستخدم وكلمة المرور مطلوبان', 400);
  }

  // Input caps: never run argon2 on oversized input; answer exactly like a bad login.
  if (username.length > MAX_USERNAME_LEN || password.length > MAX_PASSWORD_LEN || !TENANT_ID_PATTERN.test(tenantId)) {
    audit('AN_LOGIN_FAILED', { tenantId: tenantId.slice(0, 64), user: userTag(username), ip: meta.ip, reason: 'bad_input' });
    return invalidCredentials();
  }

  const adapter = router.getPrimaryAdapter();
  let userRes: any;
  try {
    userRes = await adapter.getUserByUsername(tenantId, username);
  } catch (e: any) {
    console.error('[AN-AUTH] storage_error', e?.name || 'Error');
    return fail('storage_error', 'Authentication service unavailable', 'الخدمة غير متاحة مؤقتًا', 503);
  }

  const user: any = userRes?.success ? userRes.data : null;
  const hash: string = user?.passwordHash || '';

  if (!user || !hash) {
    await burnVerify(password);
    audit('AN_LOGIN_FAILED', { tenantId, user: userTag(username), ip: meta.ip, reason: user ? 'no_password' : 'unknown_user' });
    return invalidCredentials();
  }

  let match = false;
  try {
    match = await argon2.verify(hash, password);
  } catch {
    match = false;
  }
  if (!match) {
    audit('AN_LOGIN_FAILED', { tenantId, user: userTag(username), ip: meta.ip, reason: 'bad_password' });
    return invalidCredentials();
  }

  // Password is correct from here on: only now may we reveal account state.
  if (!isActiveStatus(user.status)) {
    audit('AN_LOGIN_FAILED', { tenantId, userId: user.id, ip: meta.ip, reason: 'inactive' });
    return fail('user_inactive', 'User is inactive', 'المستخدم غير نشط', 403);
  }
  if (user.tenantId && user.tenantId !== tenantId) {
    audit('AN_LOGIN_FAILED', { tenantId, userId: user.id, ip: meta.ip, reason: 'tenant_mismatch' });
    return invalidCredentials();
  }

  const tokens = new TokenService(adapter);
  const sessionId = `sess-${crypto.randomUUID()}`;
  let familyId: string;
  let refreshToken: string;
  try {
    const fam = await tokens.createRefreshTokenFamily(user.id, tenantId, sessionId);
    familyId = fam.familyId;
    refreshToken = fam.refreshToken;
  } catch (e: any) {
    console.error('[AN-AUTH] token_family_failed', e?.name || 'Error');
    return fail('token_family_failed', 'Could not start session', 'فشل بدء الجلسة', 500);
  }

  let accessToken: string;
  try {
    accessToken = tokens.generateAccessToken({
      userId: user.id,
      tenantId,
      role: user.role || 'user',
      sessionId,
      familyId,
    });
  } catch (e: any) {
    console.error('[AN-AUTH] access_token_failed', e?.name || 'Error');
    return fail('access_token_failed', 'Could not issue token', 'فشل إصدار توكن الوصول', 500);
  }

  audit('AN_LOGIN_OK', { tenantId, userId: user.id, ip: meta.ip });
  return {
    ok: true,
    plane: 'an-auth-g2',
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName || user.username,
      role: user.role,
      tenantId,
      requiresPasswordChange: !!user.requiresPasswordChange,
    },
    accessToken,
    refreshToken,
    sessionId,
    familyId,
    tokenType: 'Bearer',
    expiresInSec: 15 * 60,
  };
}
