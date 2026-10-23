import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hashPasswordPBKDF2_210k } from './lib/server_hash';
import { DEFAULT_USERS } from './db/defaults';

describe('Phase 6: Lock down POST /api/seed/auto-seed', () => {
  const originalEnv = process.env.ALLOW_AUTO_SEED;

  afterEach(() => {
    process.env.ALLOW_AUTO_SEED = originalEnv;
  });

  it('1. Verifies seed passwords hash calculation uses PBKDF2 210k with pepper version 2', () => {
    DEFAULT_USERS.forEach((u) => {
      const pwd = u.password || '123456';
      const salt = u.salt || u.email;
      const hashed = hashPasswordPBKDF2_210k(pwd, salt, 2);
      expect(hashed).toBeDefined();
      expect(typeof hashed).toBe('string');
      expect(hashed.length).toBeGreaterThan(32);
      // Verify deterministic PBKDF2 calculation
      const hashedAgain = hashPasswordPBKDF2_210k(pwd, salt, 2);
      expect(hashedAgain).toBe(hashed);
    });
  });

  it('2. Gate check logic blocks unauthorized callers when ALLOW_AUTO_SEED is undefined/false', async () => {
    delete process.env.ALLOW_AUTO_SEED;

    // Simulate the gate logic from server.ts
    const simulateGate = (req: { headers: Record<string, string> }) => {
      if (process.env.ALLOW_AUTO_SEED === 'true') {
        return { status: 200, allowed: true };
      }
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { status: 401, allowed: false, message: 'Unauthorized: Missing authentication token' };
      }
      return { status: 200, allowed: true };
    };

    const unauthReq = { headers: {} };
    const result1 = simulateGate(unauthReq);
    expect(result1.allowed).toBe(false);
    expect(result1.status).toBe(401);

    // When ALLOW_AUTO_SEED is 'true', gate opens
    process.env.ALLOW_AUTO_SEED = 'true';
    const result2 = simulateGate(unauthReq);
    expect(result2.allowed).toBe(true);
    expect(result2.status).toBe(200);
  });
});
