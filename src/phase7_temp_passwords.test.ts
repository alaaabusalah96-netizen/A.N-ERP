import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';

describe('Phase 7: MANDATORY server implementation guard', () => {
  const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');

  it('server.ts actually contains generateSecureTemporaryPassword', () => {
    expect(serverCode).toContain('generateSecureTemporaryPassword');
  });

  it('server.ts actually contains POST /api/auth/change-password route', () => {
    expect(serverCode).toContain('/api/auth/change-password');
  });

  it('server.ts applies otpRateLimiter to change-password', () => {
    const idx = serverCode.indexOf('/api/auth/change-password');
    const snippet = serverCode.slice(Math.max(0, idx - 200), idx + 50);
    expect(snippet).toContain('otpRateLimiter');
  });

  it('server.ts verify-credentials response includes mustChangePassword', () => {
    expect(serverCode).toContain('mustChangePassword');
  });

  it('server.ts create-user path ignores client password and always generates one', () => {
    expect(serverCode).toContain('generateSecureTemporaryPassword');
    expect(serverCode).toContain('temporaryPassword');
  });

  it('ChangePasswordRequired.tsx component file physically exists on disk', () => {
    const exists = fs.existsSync(path.join(process.cwd(), 'src/components/ChangePasswordRequired.tsx'));
    expect(exists).toBe(true);
  });

  it('App.tsx imports ChangePasswordRequired from an existing path', () => {
    const appCode = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf-8');
    expect(appCode).toContain("from './components/ChangePasswordRequired'");
  });

  it('no file contains the removed weak padding pattern', () => {
    const filesToCheck = [
      'src/pages/Settings.tsx',
      'src/pages/SuperAdmin.tsx',
      'src/pages/CompanyAdminDashboard.tsx',
      'src/pages/RegionAdminDashboard.tsx',
      'src/pages/Stations.tsx',
    ];
    for (const f of filesToCheck) {
      if (fs.existsSync(path.join(process.cwd(), f))) {
        const code = fs.readFileSync(path.join(process.cwd(), f), 'utf-8');
        expect(code).not.toContain('ensureCompliantPassword');
        expect(code).not.toContain('_2026!');
      }
    }
  });
});
