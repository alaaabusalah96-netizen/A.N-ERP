// Phase 7 (AUTH-004): helpers for scripts now that login/refresh no longer return accessToken in the JSON body.
// The session lives in HttpOnly cookies (an_access_token / an_refresh_token); scripts read them from Set-Cookie.

export function readSetCookies(res: Response): string[] {
  const h: any = res.headers as any;
  if (typeof h.getSetCookie === 'function') return h.getSetCookie() as string[];
  const raw = res.headers.get('set-cookie');
  return raw ? raw.split(/,(?=\s*[A-Za-z0-9_\-]+=)/) : [];
}

/** Value of one cookie from a response's Set-Cookie headers (undefined when absent). */
export function cookieFromResponse(res: Response, name: string): string | undefined {
  for (const c of readSetCookies(res)) {
    const first = c.split(';')[0].trim();
    if (first.startsWith(name + '=')) return first.slice(name.length + 1);
  }
  return undefined;
}

/** The access token issued by the login response (read from its cookie). */
export function accessTokenFromResponse(res: Response): string | undefined {
  return cookieFromResponse(res, 'an_access_token');
}

export async function loginAndGetCookies(
  baseUrl: string,
  username: string,
  password: string,
  tenantId = 'MAIN'
): Promise<{ cookieHeader: string; body: any; status: number }> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-code': tenantId },
    body: JSON.stringify({ tenantCode: tenantId, username, password }),
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* empty */ }
  const parts: string[] = [];
  for (const n of ['an_access_token', 'an_refresh_token']) {
    const v = cookieFromResponse(res, n);
    if (v) parts.push(`${n}=${v}`);
  }
  return { cookieHeader: parts.join('; '), body, status: res.status };
}
