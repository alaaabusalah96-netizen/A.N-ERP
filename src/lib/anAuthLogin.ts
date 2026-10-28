/**
 * AN-AUTH-G2 — server-side A.N-style password verify + access/refresh issue.
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

export async function anStyleLogin(
  router: StorageRouter,
  body: AnLoginBody,
  env: NodeJS.ProcessEnv = process.env
): Promise<AnLoginOk | AnLoginErr> {
  if (!resolveAnLoginFlag(env)) {
    return {
      ok: false,
      plane: 'an-auth-g2',
      code: 'an_login_disabled',
      message: 'AN_ENABLE_AN_LOGIN is not enabled',
      messageAr: 'مسار دخول A.N غير مفعّل (AN_ENABLE_AN_LOGIN)',
      httpStatus: 403,
    };
  }

  if (!env.JWT_SECRET || !String(env.JWT_SECRET).trim()) {
    return {
      ok: false,
      plane: 'an-auth-g2',
      code: 'jwt_secret_missing',
      message: 'JWT_SECRET is required for A.N login',
      messageAr: 'JWT_SECRET مطلوب لدخول A.N',
      httpStatus: 503,
    };
  }

  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const tenantId = String(body.tenantId || 'default').trim() || 'default';

  if (!username || !password) {
    return {
      ok: false,
      plane: 'an-auth-g2',
      code: 'missing_credentials',
      message: 'username and password required',
      messageAr: 'اسم المستخدم وكلمة المرور مطلوبان',
      httpStatus: 400,
    };
  }

  const adapter = router.getPrimaryAdapter();
  let userRes;
  try {
    userRes = await adapter.getUserByUsername(tenantId, username);
  } catch (e: any) {
    return {
      ok: false,
      plane: 'an-auth-g2',
      code: 'storage_error',
      message: (e?.message || 'storage_error').slice(0, 160),
      messageAr: 'فشل قراءة المستخدم من التخزين',
      httpStatus: 500,
    };
  }

  if (!userRes?.success || !userRes.data) {
    return {
      ok: false,
      plane: 'an-auth-g2',
      code: 'invalid_credentials',
      message: 'Invalid username or password',
      messageAr: 'اسم المستخدم أو كلمة المرور غير صحيحة',
      httpStatus: 401,
    };
  }

  const user = userRes.data;
  if (user.status === 'INACTIVE') {
    return {
      ok: false,
      plane: 'an-auth-g2',
      code: 'user_inactive',
      message: 'User is inactive',
      messageAr: 'المستخدم غير نشط',
      httpStatus: 403,
    };
  }

  const hash = user.passwordHash || '';
  if (!hash) {
    return {
      ok: false,
      plane: 'an-auth-g2',
      code: 'password_not_set',
      message: 'User has no password hash',
      messageAr: 'لا توجد كلمة مرور مخزّنة لهذا المستخدم',
      httpStatus: 401,
    };
  }

  let match = false;
  try {
    match = await argon2.verify(hash, password);
  } catch {
    match = false;
  }
  if (!match) {
    return {
      ok: false,
      plane: 'an-auth-g2',
      code: 'invalid_credentials',
      message: 'Invalid username or password',
      messageAr: 'اسم المستخدم أو كلمة المرور غير صحيحة',
      httpStatus: 401,
    };
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
    return {
      ok: false,
      plane: 'an-auth-g2',
      code: 'token_family_failed',
      message: (e?.message || 'token_family_failed').slice(0, 160),
      messageAr: 'فشل إنشاء عائلة التوكن',
      httpStatus: 500,
    };
  }

  let accessToken: string;
  try {
    accessToken = tokens.generateAccessToken({
      userId: user.id,
      tenantId: user.tenantId || tenantId,
      role: user.role || 'user',
      sessionId,
      familyId,
    });
  } catch (e: any) {
    return {
      ok: false,
      plane: 'an-auth-g2',
      code: 'access_token_failed',
      message: (e?.message || 'access_token_failed').slice(0, 160),
      messageAr: 'فشل إصدار توكن الوصول',
      httpStatus: 500,
    };
  }

  return {
    ok: true,
    plane: 'an-auth-g2',
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName || user.username,
      role: user.role,
      tenantId: user.tenantId || tenantId,
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
