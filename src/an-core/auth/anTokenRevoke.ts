/**
 * AN-SEC-AUTH-1 — logout that really revokes: invalidate the refresh token's whole family
 * (no rotation, so no new refresh token is minted on logout).
 */
import crypto from 'crypto';

export async function revokeFamilyByRefreshToken(
  storage: {
    withTenantScope<T>(tenantId: string, fn: () => Promise<T>): Promise<T>;
    getRefreshToken(tokenHash: string): Promise<{ success: boolean; data?: { familyId: string } | null }>;
    invalidateTokenFamily(familyId: string, reason: string): Promise<unknown>;
  },
  plainToken: string,
  reason = 'LOGOUT'
): Promise<boolean> {
  const parts = String(plainToken || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'rt' || !parts[1]) return false;
  let tenantId = '';
  try {
    tenantId = String(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))?.tenantId || '');
  } catch {
    return false;
  }
  if (!tenantId) return false;
  const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
  try {
    return await storage.withTenantScope(tenantId, async () => {
      const rec = await storage.getRefreshToken(tokenHash);
      if (!rec.success || !rec.data?.familyId) return false;
      await storage.invalidateTokenFamily(rec.data.familyId, reason);
      return true;
    });
  } catch {
    return false;
  }
}
