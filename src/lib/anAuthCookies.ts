/**
 * AN-AUTH-COOKIES-1 — cookie options for A.N tokens (no secret values here).
 */
export const AN_ACCESS_COOKIE = 'an_access';
export const AN_REFRESH_COOKIE = 'an_refresh';

export function anCookieSecure(req?: { secure?: boolean }): boolean {
  if (process.env.COOKIE_SECURE === '1' || process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.NODE_ENV === 'production') return true;
  return !!(req && req.secure);
}

export function accessCookieOptions(req: any, maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: anCookieSecure(req),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.max(60, maxAgeSec) * 1000,
  };
}

export function refreshCookieOptions(req: any, maxAgeSec = 7 * 24 * 3600) {
  return {
    httpOnly: true,
    secure: anCookieSecure(req),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec * 1000,
  };
}

export function clearAnAuthCookieOptions(req: any) {
  return {
    httpOnly: true,
    secure: anCookieSecure(req),
    sameSite: 'lax' as const,
    path: '/',
  };
}
