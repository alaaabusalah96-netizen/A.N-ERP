import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 8: Password Min Length Alignment & Admin Rate Limits', () => {
  const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');

  it('1. server.ts defines adminRateLimiter with appropriate window and limit', () => {
    expect(serverCode).toContain('const adminRateLimiter = rateLimit({');
    expect(serverCode).toContain('windowMs: 15 * 60 * 1000');
    expect(serverCode).toContain('max: 30');
    expect(serverCode).toContain('Rate limit exceeded for administrative operations');
  });

  it('2. POST /api/admin/users is protected by adminRateLimiter and enforces min 12 char password', () => {
    expect(serverCode).toContain('app.post("/api/admin/users", adminRateLimiter, async (req, res) => {');
    expect(serverCode).toContain('trimmed.length < 12');
    expect(serverCode).toContain('كلمة المرور يجب أن لا تقل عن 12 حرفاً / Password must be at least 12 characters.');
  });

  it('3. DELETE /api/admin/users/:id is protected by adminRateLimiter', () => {
    expect(serverCode).toContain('app.delete("/api/admin/users/:id", adminRateLimiter, async (req, res) => {');
  });

  it('4. POST /api/auth/migrate-credential-id is protected by adminRateLimiter', () => {
    expect(serverCode).toContain('app.post("/api/auth/migrate-credential-id", adminRateLimiter, async (req, res) => {');
  });
});
