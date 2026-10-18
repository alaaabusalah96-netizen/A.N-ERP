/**
 * @file UserAdminGuards.ts
 * @description SEC-ROLE-CEILING-1: nobody can use USER_MANAGE to climb to (or take over) a platform-level account.
 *  - a role that carries PLATFORM_ADMIN (super_admin, platform_admin, ...) can be ASSIGNED only by an actor who effectively holds PLATFORM_ADMIN;
 *  - an account that holds PLATFORM_ADMIN (by role or by an individual grant) can be CHANGED / have its password reset / sessions revoked only by such an actor;
 *  - nobody changes their own role.
 * Pure functions (no I/O) so the rules are testable without the HTTP server; the routes in server.ts translate a failure into a 403 response.
 * Unknown role names are not judged here (they hold no permissions); role-name validation is a separate follow-up.
 */
import { ROLE_PERMISSION_MATRIX, hasPermission, normalizeRole } from './PermissionMatrix';

export interface GuardActor { userId?: string; role?: string; permissions?: readonly string[] | null }
export interface GuardTarget { role?: string; permissions?: readonly string[] | null }
export type GuardFail = { ok: false; status: number; type: string; title: string; detail: string };
export type GuardResult = { ok: true } | GuardFail;

const fail = (code: string, title: string, detail: string): GuardFail => ({ ok: false, status: 403, type: `https://api.an-erp.local/errors/${code}`, title, detail });

/** A role is platform-privileged when its matrix entry holds PLATFORM_ADMIN. */
export function isPlatformPrivilegedRole(role?: string): boolean {
  const set = ROLE_PERMISSION_MATRIX[normalizeRole(role)];
  return !!set && set.has('PLATFORM_ADMIN');
}

/** A user is platform-privileged by role or by an individually granted PLATFORM_ADMIN. */
export function isPlatformPrivilegedUser(u: GuardTarget): boolean {
  return isPlatformPrivilegedRole(u.role) || !!(u.permissions || []).includes('PLATFORM_ADMIN');
}

const actorIsPlatform = (a: GuardActor) => hasPermission(a.role, 'PLATFORM_ADMIN', a.permissions);

export function checkRoleAssignment(actor: GuardActor, targetRole?: string): GuardResult {
  if (isPlatformPrivilegedRole(targetRole) && !actorIsPlatform(actor)) {
    return fail('role-assignment-forbidden', 'تعيين هذا الدور غير مسموح', 'الأدوار على مستوى المنصة لا يمنحها إلا من يملك صلاحية إدارة المنصة.');
  }
  return { ok: true };
}

export function checkTargetAccess(actor: GuardActor, target: GuardTarget): GuardResult {
  if (isPlatformPrivilegedUser(target) && !actorIsPlatform(actor)) {
    return fail('target-user-protected', 'الحساب محمي', 'لا يمكنك تعديل حساب على مستوى المنصة أو إعادة تعيين كلمة مروره أو إنهاء جلساته.');
  }
  return { ok: true };
}

export function checkSelfRoleChange(actorId: string | undefined, targetId: string | undefined): GuardResult {
  if (actorId && targetId && actorId === targetId) {
    return fail('self-role-change-forbidden', 'لا يمكنك تغيير دورك بنفسك', 'تغيير الدور يتم بواسطة مسؤول آخر.');
  }
  return { ok: true };
}
