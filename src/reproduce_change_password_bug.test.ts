import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Password Lifecycle & Change Password Token Flow Audit', () => {
  const serverPath = path.join(process.cwd(), 'server.ts');
  const changePassPath = path.join(process.cwd(), 'src/components/ChangePasswordRequired.tsx');
  const serverCode = fs.readFileSync(serverPath, 'utf8');
  const changePassCode = fs.readFileSync(changePassPath, 'utf8');

  it('1. ChangePasswordRequired must retrieve fresh ID token from auth.currentUser instead of dead localStorage key', () => {
    // Current buggy code uses dead key custody_auth_token:
    // const token = localStorage.getItem('custody_auth_token') || sessionStorage.getItem('custody_auth_token');
    const hasDeadKey = changePassCode.includes("localStorage.getItem('custody_auth_token')");
    expect(hasDeadKey).toBe(false);

    const hasAuthTokenCall = changePassCode.includes('auth.currentUser?.getIdToken()');
    expect(hasAuthTokenCall).toBe(true);
  });

  it('2. authenticateSessionOrBearer in server.ts must prioritize Bearer token or properly check active caller', () => {
    // Bearer token from active user header should be verified first
    const bearerIndex = serverCode.indexOf('req.headers.authorization');
    const cookieIndex = serverCode.indexOf('req.cookies?.session');
    
    // Bearer token should be checked before session cookie
    expect(bearerIndex).toBeLessThan(cookieIndex);
  });

  it('3. verify-credentials endpoint must trim password consistently with change-password', () => {
    const verifySection = serverCode.slice(serverCode.indexOf('app.post("/api/auth/verify-credentials"'));
    const verifyTrim = verifySection.includes('const password = String(rawPassword).trim()') || verifySection.includes('password.trim()');
    expect(verifyTrim).toBe(true);
  });
});
