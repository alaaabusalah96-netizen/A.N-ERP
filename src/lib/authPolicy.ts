/**
 * @file authPolicy.ts
 * @description MERGE-M3 — single auth policy for the merged product.
 * Canonical rule: one login path at a time per deployment.
 * Default = CustodyFlow Firebase session (/api/auth/verify-credentials + customToken).
 * an-jwt (A.N TokenService) is opt-in only when AN_ENABLE_AN_JWT=1 AND company.auth_driver=an-jwt.
 */
import type { AuthDriver } from './anBridge';
import { getCompanyBackendSettings } from './anBridge';

export type AuthPathId = 'firebase-session' | 'an-jwt';

export interface AuthPolicy {
  /** Active path for this process / company resolution */
  activePath: AuthPathId;
  auth_driver: AuthDriver;
  /** Server flag AN_ENABLE_AN_JWT===1 */
  anJwtEnabled: boolean;
  /** Human-readable reason */
  reason: string;
  reasonAr: string;
}

/** Client-side: env is not fully available; treat an-jwt as disabled until server says otherwise. */
export function resolveAuthPolicyClient(company?: {
  auth_driver?: AuthDriver;
} | null): AuthPolicy {
  const settings = getCompanyBackendSettings(company || null);
  // Browser never activates an-jwt alone — server must enable it.
  return {
    activePath: 'firebase-session',
    auth_driver: settings.auth_driver,
    anJwtEnabled: false,
    reason:
      settings.auth_driver === 'an-jwt'
        ? 'Company requests an-jwt, but client always uses firebase-session until server enables AN_ENABLE_AN_JWT.'
        : 'Default firebase-session path (CustodyFlow verify-credentials).',
    reasonAr:
      settings.auth_driver === 'an-jwt'
        ? 'الشركة مضبوطة على an-jwt، لكن العميل يستخدم مسار Firebase حتى يفعّل الخادم AN_ENABLE_AN_JWT.'
        : 'المسار الافتراضي: جلسة Firebase (verify-credentials).',
  };
}

export function resolveAuthPolicyServer(
  company: { auth_driver?: AuthDriver } | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): AuthPolicy {
  const settings = getCompanyBackendSettings(company || null);
  const anJwtEnabled = env.AN_ENABLE_AN_JWT === '1' || env.AN_ENABLE_AN_JWT === 'true';
  if (settings.auth_driver === 'an-jwt' && anJwtEnabled) {
    return {
      activePath: 'an-jwt',
      auth_driver: 'an-jwt',
      anJwtEnabled: true,
      reason: 'AN_ENABLE_AN_JWT enabled and company.auth_driver=an-jwt.',
      reasonAr: 'تم تفعيل AN_ENABLE_AN_JWT والشركة مضبوطة على an-jwt.',
    };
  }
  return {
    activePath: 'firebase-session',
    auth_driver: settings.auth_driver,
    anJwtEnabled,
    reason: anJwtEnabled
      ? 'AN_ENABLE_AN_JWT is on but company.auth_driver is not an-jwt; using firebase-session.'
      : 'firebase-session is the only active login path (AN JWT gated off).',
    reasonAr: anJwtEnabled
      ? 'AN_ENABLE_AN_JWT مفعّل لكن الشركة ليست an-jwt؛ يُستخدم مسار Firebase.'
      : 'مسار Firebase هو مسار الدخول النشط الوحيد (AN JWT مغلق).',
  };
}

/** Login UI must not call a second parallel auth API while firebase-session is active. */
export function assertSingleLoginPath(policy: AuthPolicy): void {
  if (policy.activePath !== 'firebase-session' && policy.activePath !== 'an-jwt') {
    throw new Error('Invalid auth path');
  }
}
