import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { hashPasswordPBKDF2_210k } from './lib/server_hash';

describe('Path B: Optional Admin-Provided Password on User Creation', () => {
  const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
  const settingsCode = fs.readFileSync(path.join(process.cwd(), 'src/pages/Settings.tsx'), 'utf-8');
  const uaccCode = fs.readFileSync(path.join(process.cwd(), 'src/components/settings/UnifiedAccessControlCenter.tsx'), 'utf-8');

  it('1. server.ts extracts optional password and validates minimum length 12', () => {
    expect(serverCode).toContain('password,');
    expect(serverCode).toContain('trimmed.length < 12');
    expect(serverCode).toContain('كلمة المرور يجب أن لا تقل عن 12 حرفاً / Password must be at least 12 characters.');
  });

  it('2. server.ts uses provided password when valid, else falls back to generateSecureTemporaryPassword', () => {
    expect(serverCode).toContain('effectivePassword = trimmed;');
    expect(serverCode).toContain('effectivePassword = generateSecureTemporaryPassword();');
    expect(serverCode).toContain('password: effectivePassword');
    expect(serverCode).toContain('hashPasswordPBKDF2_210k(effectivePassword, salt, 2)');
    expect(serverCode).toContain('temporaryPassword: effectivePassword');
  });

  it('3. PBKDF2 hashing functions correctly for admin-provided password and auto-generated passwords', () => {
    const adminPassword = 'MyCustomAdminPassword2026!';
    const salt = crypto.randomUUID();
    const hash = hashPasswordPBKDF2_210k(adminPassword, salt, 2);

    expect(hash).toBeDefined();
    expect(hash.length).toBe(128); // 64-byte hex

    // Correct password matches
    const verifyHash = hashPasswordPBKDF2_210k(adminPassword, salt, 2);
    expect(verifyHash).toBe(hash);

    // Incorrect password fails
    const wrongHash = hashPasswordPBKDF2_210k('WrongPassword123!', salt, 2);
    expect(wrongHash).not.toBe(hash);
  });

  it('4. Settings.tsx validates client-side min length 12 and includes password in payload when provided', () => {
    expect(settingsCode).toContain('trimmedPassword.length < 12');
    expect(settingsCode).toContain('payload.password = trimmedPassword');
  });

  it('5. Settings.tsx renders a one-click copyable success UI for the temporary password', () => {
    expect(settingsCode).toContain('createdUserSuccess');
    expect(settingsCode).toContain('createdUserSuccess.temporaryPassword');
    expect(settingsCode).toContain('navigator.clipboard.writeText');
    expect(settingsCode).toContain('copiedPassword');
  });

  it('6. UnifiedAccessControlCenter.tsx contains helper text and min-12 validation warning', () => {
    expect(uaccCode).toContain('Optional — leave blank to auto-generate; minimum 12 characters if typed.');
    expect(uaccCode).toContain('اختياري — اترك الحقل فارغاً للتوليد التلقائي؛ بحد أدنى 12 حرفاً في حال الإدخال اليدوي');
  });
});
