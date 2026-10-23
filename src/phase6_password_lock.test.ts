import { describe, it, expect, vi } from 'vitest';
import { UsersModule } from './db/users';
import { StorageEngine } from './db/storage';
import { AppUser } from './types';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 6: Hard-lock legacy plaintext user password writes', () => {
  it('1. saveUsers strips password and salt fields before storing user documents', async () => {
    const testUser: AppUser = {
      id: 'test-p6-lock-user',
      email: 'p6lock@example.com',
      full_name: 'P6 Test User',
      role: 'StationAdmin',
      company_id: 'comp-sewedy-mfg',
      station_id: 'stn-sewedy-fac-1',
      is_active: true,
      password: 'PlaintextPassword123!',
      salt: 'custom_salt_123',
      permissions: UsersModule.enrichUserPermissions('StationAdmin')
    };

    await UsersModule.saveUsers([testUser]);

    // Retrieve raw stored user documents from StorageEngine
    const storedUsers = StorageEngine.getStored<AppUser[]>('users', []);
    const foundStored = storedUsers.find(u => u.id === 'test-p6-lock-user');

    expect(foundStored).toBeDefined();
    expect((foundStored as any).password).toBeUndefined();
    expect((foundStored as any).salt).toBeUndefined();
    expect(foundStored?.email).toBe('p6lock@example.com');
  });

  it('2. getUsers returns user documents strictly without password or salt fields', () => {
    const users = UsersModule.getUsers();
    for (const u of users) {
      expect((u as any).password).toBeUndefined();
      expect((u as any).salt).toBeUndefined();
    }
  });

  it('3. saveUsers logs a deprecation warning when called with a password field', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const testUserWithPwd: AppUser = {
      id: 'test-warn-user',
      email: 'warn@example.com',
      full_name: 'Warn User',
      role: 'StationAdmin',
      company_id: 'comp-sewedy-mfg',
      is_active: true,
      password: 'SecretPassword999!',
      permissions: UsersModule.enrichUserPermissions('StationAdmin')
    };

    await UsersModule.saveUsers([testUserWithPwd]);

    const hasDeprecationWarn = warnSpy.mock.calls.some(args =>
      args.some(a => typeof a === 'string' && a.includes('[Deprecation Warning] saveUsers received password field'))
    );
    expect(hasDeprecationWarn).toBe(true);

    warnSpy.mockRestore();
  });

  it('4. Server provisioning endpoint (/api/admin/users) remains authoritative credential writer to user_credentials', () => {
    const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
    expect(serverCode).toContain('user_credentials');
    expect(serverCode).toContain('hashPasswordPBKDF2_210k');
    expect(serverCode).toContain('app.post("/api/admin/users"');
    expect(serverCode).toContain('app.patch("/api/admin/users/:id"');
  });
});
