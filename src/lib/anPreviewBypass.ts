/**
 * AN-DEV-PREVIEW-BYPASS-1 — local full-admin AppUser for UI preview only.
 */
import type { AppUser } from '../types';

export const PREVIEW_BYPASS_USER_ID = 'dev-preview-admin';

/** Broad UI permissions: keys used across KEMIT gates; unknown keys are harmless. */
export function buildPreviewAdminPermissions(): Record<string, boolean> {
  return {
    platform: true,
    admin: true,
    accounting: true,
    audit: true,
    inventory: true,
    purchasing: true,
    sales: true,
    hr: true,
    custody: true,
    reports: true,
    settings: true,
    users: true,
    companies: true,
    warehouses: true,
    all: true,
  };
}

export function buildPreviewAdminUser(language: 'ar' | 'en' = 'ar'): AppUser {
  return {
    id: PREVIEW_BYPASS_USER_ID,
    email: 'preview-admin@local.dev',
    full_name: language === 'ar' ? 'مدير معاينة (تطوير)' : 'Preview Admin (dev)',
    name: language === 'ar' ? 'معاينة' : 'Preview',
    role: 'SystemAdmin',
    userRoles: ['SystemAdmin', 'Admin'],
    assigned_roles: ['SystemAdmin'],
    permissions: buildPreviewAdminPermissions() as any,
    is_active: true,
    is_platform_owner: true,
    must_change_password: false,
    company_id: undefined,
    tenantId: 'default',
  };
}

export function isPreviewBypassEnvEnabled(env: {
  AN_PREVIEW_BYPASS?: string;
  AN_PREVIEW_BYPASS_FORCE?: string;
  STRICT_PROD_SECURITY?: string;
  NODE_ENV?: string;
}): boolean {
  const on =
    env.AN_PREVIEW_BYPASS === '1' ||
    env.AN_PREVIEW_BYPASS === 'true';
  if (!on) return false;
  const strict =
    String(env.STRICT_PROD_SECURITY || '').toLowerCase() === 'true' || env.NODE_ENV === 'production';
  if (strict) {
    return env.AN_PREVIEW_BYPASS_FORCE === '1' || env.AN_PREVIEW_BYPASS_FORCE === 'true';
  }
  return true;
}
