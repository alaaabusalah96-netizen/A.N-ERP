/**
 * @file platformAdminBootstrap.ts
 * @description PLATFORM-ADMIN-BOOTSTRAP-1 — sole platform administrator from env credentials.
 * Fail-closed on conflicts; never resets passwords from Secrets; never creates demo operational users.
 */
import crypto from 'crypto';
import argon2 from 'argon2';
import { StoragePort, User } from '../storage/StoragePort';
import { isPlatformPrivilegedUser } from './UserAdminGuards';
import { seedKey } from '../seed/seedOnly';

export type PlatformAdminBootstrapOk = { ok: true; outcome: 'created' | 'already_exists' };
export type PlatformAdminBootstrapErr = { ok: false; code: string; message: string };
export type PlatformAdminBootstrapResult = PlatformAdminBootstrapOk | PlatformAdminBootstrapErr;

const USERNAME_MAX = 64;

/**
 * Bootstrap exactly one platform-privileged account (role super_admin) from
 * PLATFORM_ADMIN_USERNAME / PLATFORM_ADMIN_PASSWORD semantics (caller supplies values).
 */
export async function bootstrapPlatformAdmin(
  storage: StoragePort,
  tenantId: string,
  usernameRaw: string,
  password: string
): Promise<PlatformAdminBootstrapResult> {
  const username = (usernameRaw || '').trim();
  if (!username) {
    return {
      ok: false,
      code: 'platform-admin-username-empty',
      message: 'PLATFORM_ADMIN_USERNAME فارغ أو مسافات فقط — تعذر الإقلاع.',
    };
  }
  if (username.length > USERNAME_MAX) {
    return {
      ok: false,
      code: 'platform-admin-username-too-long',
      message: `PLATFORM_ADMIN_USERNAME أطول من ${USERNAME_MAX} حرفًا.`,
    };
  }
  if (!password || !String(password).length) {
    return {
      ok: false,
      code: 'platform-admin-password-empty',
      message: 'PLATFORM_ADMIN_PASSWORD فارغ — تعذر الإقلاع.',
    };
  }

  const existingByName = await storage.getUserByUsername(tenantId, username);
  if (existingByName.success && existingByName.data) {
    if (isPlatformPrivilegedUser(existingByName.data)) {
      // Intended platform admin already present — do not touch password/role/status/2FA.
      return { ok: true, outcome: 'already_exists' };
    }
    return {
      ok: false,
      code: 'platform-admin-username-conflict-nonprivileged',
      message:
        'اسم المستخدم موجود لحساب ليس على مستوى المنصة — لن يتم ترقيته. يلزم تنظيف/ترحيل يدوي معتمد.',
    };
  }
  if (!existingByName.success) {
    const status = existingByName.error?.status;
    const type = existingByName.error?.type || '';
    if (status !== 404 && !type.includes('user-not-found')) {
      return {
        ok: false,
        code: 'platform-admin-lookup-failed',
        message: 'تعذر التحقق من وجود مدير المنصة في التخزين — إقلاع متوقف.',
      };
    }
  }

  const listed = await storage.listUsers(tenantId);
  if (!listed.success) {
    return {
      ok: false,
      code: 'platform-admin-list-failed',
      message: 'تعذر سرد المستخدمين للتحقق من تعارض حسابات المنصة — إقلاع متوقف.',
    };
  }
  const otherPrivileged = (listed.data || []).filter((u) => isPlatformPrivilegedUser(u));
  if (otherPrivileged.length > 0) {
    return {
      ok: false,
      code: 'platform-admin-legacy-privileged-exists',
      message:
        'يوجد حساب بصلاحيات منصة مسبقًا باسم مختلف. لن يُنشأ مدير منصة ثانٍ. يلزم خطوة ترحيل/تنظيف معتمدة.',
    };
  }

  let passwordHash: string;
  try {
    passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  } catch {
    return {
      ok: false,
      code: 'platform-admin-hash-failed',
      message: 'تعذر تشفير كلمة مرور مدير المنصة.',
    };
  }

  const adminUser: User = {
    id: `USR-${crypto.randomUUID().slice(0, 8)}`,
    tenantId,
    username,
    fullName: 'مدير المنصة',
    email: 'platform-admin@invalid.local',
    role: 'super_admin',
    roleTitleAr: 'مدير المنصة',
    status: 'ACTIVE',
    passwordHash,
    twoFactorEnabled: false,
    requiresPasswordChange: false,
    createdAt: new Date().toISOString(),
  };

  const saved = await storage.saveUser(adminUser, seedKey('platform-admin'), true);
  if (!saved.success) {
    return {
      ok: false,
      code: 'platform-admin-save-failed',
      message: 'فشل حفظ مدير المنصة — إقلاع متوقف.',
    };
  }
  return { ok: true, outcome: 'created' };
}
