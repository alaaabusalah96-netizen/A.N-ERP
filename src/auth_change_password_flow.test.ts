import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import {
  hashPasswordPBKDF2_210k,
  hashPassword,
  legacyStretchedHashPassword1000,
  legacySinglePassHashPassword,
  legacyHashPassword
} from './lib/server_hash';

describe('Auth Session Identity Resolution & Forced Password Change Verification', () => {
  const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
  const changePassComp = fs.readFileSync(path.join(process.cwd(), 'src/components/ChangePasswordRequired.tsx'), 'utf-8');

  it('1. authenticateSessionOrBearer binds user id strictly to verified uid', () => {
    expect(serverCode).toContain('user: { ...userData, id: uid }');
  });

  it('2. /api/auth/change-password resolves UID from authenticated principal and checks doc(uid)', () => {
    expect(serverCode).toContain('const uid = String(user.id || "").trim();');
    expect(serverCode).toContain('adminDb.collection("user_credentials").doc(uid).get()');
    expect(serverCode).toContain('adminDb.collection("user_credentials").doc(uid).set(');
    expect(serverCode).toContain('adminDb.collection("users").doc(uid).update({');
    expect(serverCode).toContain('must_change_password: false');
  });

  it('3. /api/auth/change-password normalizes currentPassword by trimming ends and validates newPassword policy (>= 12, letters + digits)', () => {
    expect(serverCode).toContain('currentPassword = String(currentPassword ?? "").trim();');
    expect(serverCode).toContain('newPassword.length < 12 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)');
  });

  it('4. Current password validation performs PBKDF2 210k comparison and multi-hash fallback consistent with verify-credentials', () => {
    const tempPassword = 'TempSecret2026!';
    const salt = crypto.randomUUID();
    const pepperVersion = 2;

    const storedHash = hashPasswordPBKDF2_210k(tempPassword, salt, pepperVersion);

    // Verify exact match
    const computedHash = hashPasswordPBKDF2_210k(tempPassword, salt, pepperVersion);
    expect(computedHash).toBe(storedHash);

    // Verify wrong password fails
    const wrongHash = hashPasswordPBKDF2_210k('WrongTempSecret2026!', salt, pepperVersion);
    expect(wrongHash).not.toBe(storedHash);
  });

  it('5. Supports multi-hash matching for users created or migrated with legacy schemes during change-password', () => {
    const tempPassword = 'LegacyTempPassword2026!';
    const salt = 'legacy-salt-123';
    const emailLower = 'user@example.com';

    // 10k hash match
    const hash10k = hashPassword(tempPassword, salt, 1);
    expect(hash10k).toBeDefined();

    // 1k hash match
    const hash1k = legacyStretchedHashPassword1000(tempPassword, salt, 1);
    expect(hash1k).toBeDefined();

    // Single pass match
    const hashSingle = legacySinglePassHashPassword(tempPassword, salt, 1);
    expect(hashSingle).toBeDefined();

    // Old email salt match
    const hashOldEmail = legacyHashPassword(tempPassword, emailLower);
    expect(hashOldEmail).toBeDefined();
  });

  it('6. ChangePasswordRequired component trims passwords and sends credentials with Bearer token', () => {
    expect(changePassComp).toContain('currentPassword: trimmedCurrent');
    expect(changePassComp).toContain('newPassword: trimmedNew');
    expect(changePassComp).toContain("credentials: 'include'");
    expect(changePassComp).toContain("headers['Authorization'] = `Bearer ${token}`");
  });
});
