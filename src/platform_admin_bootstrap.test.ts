import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Auth & First-Run Platform Owner Bootstrap Rules', () => {
  const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
  const loginCode = fs.readFileSync(path.join(process.cwd(), 'src/pages/Login.tsx'), 'utf-8');
  const appCode = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf-8');
  const firstRunCode = fs.readFileSync(path.join(process.cwd(), 'src/pages/FirstRunSetup.tsx'), 'utf-8');

  it('1. server.ts contains GET /api/auth/platform-status and POST /api/auth/bootstrap-platform-owner', () => {
    expect(serverCode).toContain('/api/auth/platform-status');
    expect(serverCode).toContain('/api/auth/bootstrap-platform-owner');
    expect(serverCode).not.toContain('/api/dev/wipe-auth-data');
  });

  it('2. server.ts enforces strict checks on /api/auth/bootstrap-platform-owner', () => {
    // Rejects if owner/super_admin exists (403)
    expect(serverCode).toContain('hasOwner');
    expect(serverCode).toContain('403');
    // Checks PLATFORM_OWNER_EMAIL match
    expect(serverCode).toContain('configuredOwnerEmail');
    // Enforces min 12 chars password strength with letters and numbers
    expect(serverCode).toContain('password.length < 12');
    // Uses PBKDF2 210,000 iterations
    expect(serverCode).toContain('hashPasswordPBKDF2_210k');
  });

  it('3. App.tsx checks platform-status live and renders FirstRunSetup when platform has no owner', () => {
    expect(appCode).toContain('/api/auth/platform-status');
    expect(appCode).toContain('FirstRunSetup');
    expect(appCode).toContain('hasPlatformOwner === false');
  });

  it('4. FirstRunSetup.tsx has required fields, validations, and does not hardcode pre-filled email', () => {
    expect(firstRunCode).toContain('/api/auth/bootstrap-platform-owner');
    expect(firstRunCode).toContain('confirmPassword');
    expect(firstRunCode).toContain('password.length < 12');
    expect(loginCode).not.toContain('FirstRunSetup');
  });

  it('5. Session Cookie Layer (Phase 2): server.ts uses cookieParser, defines /api/auth/session & /api/auth/logout', () => {
    expect(serverCode).toContain('cookieParser');
    expect(serverCode).toContain('app.use(cookieParser())');
    expect(serverCode).toContain('/api/auth/session');
    expect(serverCode).toContain('/api/auth/logout');
    expect(serverCode).toContain('createSessionCookie');
    expect(serverCode).toContain('verifySessionCookie');
    expect(serverCode).toContain('revokeRefreshTokens');
    expect(serverCode).toContain("res.cookie('session'");
    expect(serverCode).toContain("httpOnly: true");
    expect(serverCode).toContain("secure: true");
    expect(serverCode).toContain("sameSite: 'strict'");
  });

  it('6. Frontend integration: Login.tsx, FirstRunSetup.tsx call /api/auth/session and App.tsx calls /api/auth/logout', () => {
    expect(loginCode).toContain('/api/auth/session');
    expect(firstRunCode).toContain('/api/auth/session');
    expect(appCode).toContain('/api/auth/logout');
    expect(appCode).toContain('signOut(auth)');
  });
});

