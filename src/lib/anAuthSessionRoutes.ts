/**
 * AN-AUTH-REFRESH-ME-1 — helpers for refresh/logout responses (no Express types required).
 */
import { TokenService } from '../an-core/auth/TokenService';
import type { StoragePort } from '../an-core/storage/StoragePort';
import {
  AN_ACCESS_COOKIE,
  AN_REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  clearAnAuthCookieOptions,
} from './anAuthCookies';

export function createAnTokenService(adapter: StoragePort): TokenService {
  return new TokenService(adapter);
}

export async function rotateAnRefresh(
  adapter: StoragePort,
  plainRefreshToken: string
): Promise<
  | { ok: true; accessToken: string; refreshToken: string; expiresInSec: number; userId: string; tenantId?: string }
  | { ok: false; code: string; message: string; messageAr: string; httpStatus: number }
> {
  const tokens = createAnTokenService(adapter);
  try {
    const rotated = await tokens.rotateRefreshToken(plainRefreshToken);
    if (!rotated.success) {
      return {
        ok: false,
        code: 'invalid_refresh',
        message: 'Invalid or expired refresh token',
        messageAr: 'جلسة التجديد غير صالحة أو منتهية',
        httpStatus: 401,
      };
    }
    return { 
        ok: true, 
        accessToken: rotated.newAccessToken!, 
        refreshToken: rotated.newRefreshToken!, 
        expiresInSec: 900, // TokenService uses fixed 15min TTL
        userId: rotated.userId!, 
        tenantId: rotated.tenantId 
    };
  } catch {
    return {
      ok: false,
      code: 'invalid_refresh',
      message: 'Invalid or expired refresh token',
      messageAr: 'جلسة التجديد غير صالحة أو منتهية',
      httpStatus: 401,
    };
  }
}

export { AN_ACCESS_COOKIE, AN_REFRESH_COOKIE, accessCookieOptions, refreshCookieOptions, clearAnAuthCookieOptions };
