import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 9: Administrative User Management & Password Reset Security Hardening', () => {
  const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
  const superAdminCode = fs.readFileSync(path.join(process.cwd(), 'src/pages/SuperAdmin.tsx'), 'utf-8');

  it('1. server.ts protects PATCH /api/admin/users/:id with adminRateLimiter', () => {
    expect(serverCode).toContain('app.patch("/api/admin/users/:id", adminRateLimiter, async (req, res) => {');
  });

  it('2. server.ts validates password strength and minimum length 12 in PATCH /api/admin/users/:id', () => {
    expect(serverCode).toContain('password.length < 12');
    expect(serverCode).toContain('Password must be at least 12 characters long and contain letters and numbers.');
  });

  it('3. server.ts protects /api/auth/save-credentials with adminRateLimiter and validates minimum length 12', () => {
    expect(serverCode).toContain('app.post("/api/auth/save-credentials", adminRateLimiter, requireAdminOrSystemAdminAuth, async (req, res) => {');
    expect(serverCode).toContain('password.trim().length < 12');
    expect(serverCode).toContain('كلمة المرور يجب أن لا تقل عن 12 حرفاً / Password must be at least 12 characters.');
  });

  it('4. SuperAdmin.tsx validates minimum length 12 in handleResetPassword before sending PATCH request', () => {
    expect(superAdminCode).toContain('newPlainPassword.trim().length < 12');
    expect(superAdminCode).toContain('كلمة المرور يجب أن لا تقل عن 12 حرفاً وتحتوي على حروف وأرقام.');
  });

  it('5. SuperAdmin.tsx reset password modal enforces minLength 12 on the input field', () => {
    expect(superAdminCode).toContain('minLength={12}');
    expect(superAdminCode).toContain('placeholder="e.g. Pass@2026Secure"');
  });
});
