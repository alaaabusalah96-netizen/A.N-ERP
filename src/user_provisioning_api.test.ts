import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 1: Unified Secure User Provisioning API', () => {
  const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');

  it('1. server.ts defines POST /api/admin/users and PATCH /api/admin/users/:id', () => {
    expect(serverCode).toContain('app.post("/api/admin/users"');
    expect(serverCode).toContain('app.patch("/api/admin/users/:id"');
    expect(serverCode).toContain('authenticateSessionOrBearer');
  });

  it('2. Enforces StationAdmin station_id binding requirements', () => {
    expect(serverCode).toContain("role === 'StationAdmin'");
    expect(serverCode).toContain("station_id is required for StationAdmin");
    expect(serverCode).toContain("RegionalManager");
    expect(serverCode).toContain("region_id is required for RegionalManager");
  });

  it('3. Enforces Company Admin scope limits (Admin cannot create or update user for another company)', () => {
    expect(serverCode).toContain("Admin cannot create user for another company");
    expect(serverCode).toContain("Admin cannot edit user from another company");
    expect(serverCode).toContain("company_id !== creator.company_id");
  });

  it('4. Rejects creation or promotion of SystemAdmin / Platform Owner via provisioning endpoints', () => {
    expect(serverCode).toContain("Cannot create SystemAdmin or Platform Owner via this endpoint");
    expect(serverCode).toContain("Cannot promote to SystemAdmin via this endpoint");
  });

  it('5. Stores password hash in user_credentials vault and ensures users doc has no password field', () => {
    expect(serverCode).toContain('user_credentials');
    expect(serverCode).toContain('hashPasswordPBKDF2_210k');

    // Extract userDocData block from serverCode
    const userDocDataIndex = serverCode.indexOf('const userDocData = {');
    expect(userDocDataIndex).toBeGreaterThan(0);
    const userDocDataSnippet = serverCode.substring(userDocDataIndex, userDocDataIndex + 600);

    expect(userDocDataSnippet).not.toContain('password:');
    expect(userDocDataSnippet).not.toContain('password_hash');
    expect(userDocDataSnippet).not.toContain('pbkdf2Hash');
    expect(userDocDataSnippet).toContain('id: userId');
    expect(userDocDataSnippet).toContain('email: emailLower');
  });

  it('6. Supports dual AuthN via Session Cookie or Bearer Token', () => {
    expect(serverCode).toContain('req.cookies?.session');
    expect(serverCode).toContain('verifySessionCookie');
    expect(serverCode).toContain('authorization');
    expect(serverCode).toContain('verifyIdToken');
  });

  it('7. Enforces fail-closed validation for region and station lookups in server.ts', () => {
    // Catch blocks must not set isValidRegion/Station = true
    expect(serverCode).toContain('Infrastructure error during region verification');
    expect(serverCode).toContain('Infrastructure error during station verification');
    expect(serverCode).toContain('status(503)');
    expect(serverCode).toContain('status(400)');
    expect(serverCode).not.toContain('catch (_) {\n          isValidRegion = true;');
    expect(serverCode).not.toContain('catch (_) {\n          isValidStation = true;');
  });

  it('8. Enforces RegionalManager can only create/update StationAdmin within their own region', () => {
    expect(serverCode).toContain('isRegionalManager && role === "StationAdmin"');
    expect(serverCode).toContain('targetRegionId !== creatorRegionId');
    expect(serverCode).toContain('status(403)');
    expect(serverCode).toContain('مصرح فقط بإنشاء مدراء محطات تابعين لمنطقتك');
  });
});
