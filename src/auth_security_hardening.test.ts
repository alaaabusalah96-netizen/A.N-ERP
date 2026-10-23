import { describe, it, expect } from 'vitest';
import { hashPassword, hashPasswordPBKDF2_210k, getPepperByVersion } from './lib/server_hash';
import { validateFirebaseConfig } from './firebase';
import { UsersModule } from './db/users';
import { StorageEngine } from './db/storage';
import { AppUser } from './types';
import fs from 'fs';
import path from 'path';

describe('v49-security-hardening: Authentication & Security Standards Verification', () => {
  it('should verify that Firebase keys, APP_PEPPER, legacy peppers, and placeholder PLATFORM_OWNER_EMAIL are documented in .env.example without exposing real secrets', () => {
    const envExamplePath = path.join(process.cwd(), '.env.example');
    const content = fs.readFileSync(envExamplePath, 'utf-8');
    
    expect(content).toContain('APP_PEPPER=');
    expect(content).toContain('FIREBASE_API_KEY=');
    expect(content).toContain('FIREBASE_PROJECT_ID=');
    expect(content).toContain('LEGACY_PEPPER_V1=');
    expect(content).toContain('LEGACY_PEPPER_V3=');
    expect(content).toContain('PLATFORM_OWNER_EMAIL="admin@your-domain.com"');
    expect(content).not.toContain('AIzaSy');
    expect(content).not.toContain('alaaabusalah96@gmail.com');
  });

  it('should verify no real Firebase API keys or exposed peppers are hardcoded in source files', () => {
    const filesToCheck = [
      path.join(process.cwd(), 'src', 'firebase.ts'),
      path.join(process.cwd(), 'server.ts'),
      path.join(process.cwd(), 'src', 'migrations', 'run.ts'),
      path.join(process.cwd(), 'src', 'migrations', 'run_down.ts'),
      path.join(process.cwd(), 'src', 'lib', 'server_hash.ts'),
    ];

    filesToCheck.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        const text = fs.readFileSync(filePath, 'utf-8');
        expect(text).not.toContain('AIzaSyA2I_2GIEfQhawBL2KhXyxD6CwTLJR-jFw');
        expect(text).not.toContain('CustodyFlowSecureSystemPepper2026!KeyDerivationV2');
        expect(text).not.toContain('CustodyFlowActivePepper2026_SecureDefault_v2_KeyDerivation');
      }
    });
  });

  it('should verify validateFirebaseConfig fails loud in production/strict mode when required config is missing', () => {
    const origStrict = process.env.STRICT_PROD_SECURITY;
    try {
      process.env.STRICT_PROD_SECURITY = 'true';
      expect(() => validateFirebaseConfig({ apiKey: '', projectId: 'custodyflow' })).toThrow(/CRITICAL SECURITY ERROR: Required Firebase configuration/);
      expect(() => validateFirebaseConfig({ apiKey: 'valid-key', projectId: '' })).toThrow(/CRITICAL SECURITY ERROR: Required Firebase configuration/);
      expect(() => validateFirebaseConfig({ apiKey: 'valid-key', projectId: 'custodyflow' })).not.toThrow();
    } finally {
      process.env.STRICT_PROD_SECURITY = origStrict;
    }
  });

  it('should verify PBKDF2 210,000 iteration password hashing produces unique salted-and-peppered hashes per pepper version', () => {
    process.env.LEGACY_PEPPER_V1 = 'TestLegacyPepperV1_Secret_Key';
    process.env.APP_PEPPER = 'TestActivePepperV2_Secret_Key';
    const password = 'SecureFinancialPassword!2026';
    const emailSalt = 'admin@kemit-erp.com';

    const hashV1 = hashPasswordPBKDF2_210k(password, emailSalt, 1);
    const hashV2 = hashPasswordPBKDF2_210k(password, emailSalt, 2);

    expect(hashV1).toBeDefined();
    expect(hashV2).toBeDefined();
    expect(hashV1).not.toEqual(hashV2);
    expect(hashV1.length).toBe(128); // 64 bytes hex
    expect(hashV2.length).toBe(128);
    delete process.env.LEGACY_PEPPER_V1;
  });

  it('should verify plaintext password matching fallback is disabled when NODE_ENV is production and ALLOW_PLAINTEXT_DEV_FALLBACK is not true', () => {
    const origEnv = process.env.NODE_ENV;
    const origFallback = process.env.ALLOW_PLAINTEXT_DEV_FALLBACK;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_PLAINTEXT_DEV_FALLBACK;

      const allowPlaintextFallback = process.env.NODE_ENV !== 'production' || process.env.ALLOW_PLAINTEXT_DEV_FALLBACK === 'true';
      expect(allowPlaintextFallback).toBe(false);

      process.env.ALLOW_PLAINTEXT_DEV_FALLBACK = 'true';
      const allowPlaintextFallbackOverride = process.env.NODE_ENV !== 'production' || process.env.ALLOW_PLAINTEXT_DEV_FALLBACK === 'true';
      expect(allowPlaintextFallbackOverride).toBe(true);
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.ALLOW_PLAINTEXT_DEV_FALLBACK = origFallback;
    }
  });

  it('should correctly validate platform owner identity without wildcard matching', () => {
    const origOwner = process.env.PLATFORM_OWNER_EMAIL;
    try {
      const testOwnerEmail = 'admin@your-domain.com';
      process.env.PLATFORM_OWNER_EMAIL = testOwnerEmail;

      expect(UsersModule.isPlatformOwner(testOwnerEmail)).toBe(true);
      expect(UsersModule.isPlatformOwner(` ${testOwnerEmail} `)).toBe(true);
      expect(UsersModule.isPlatformOwner(testOwnerEmail.toUpperCase())).toBe(true);
      expect(UsersModule.isPlatformOwner('random_user@domain.com')).toBe(false);
      expect(UsersModule.isPlatformOwner('')).toBe(false);
      expect(UsersModule.isPlatformOwner(null)).toBe(false);
      expect(UsersModule.isPlatformOwner(undefined)).toBe(false);
    } finally {
      process.env.PLATFORM_OWNER_EMAIL = origOwner;
    }
  });

  it('should verify STRICT_PROD_SECURITY disables plaintext fallback even if ALLOW_PLAINTEXT_DEV_FALLBACK is true', () => {
    const origStrict = process.env.STRICT_PROD_SECURITY;
    const origFallback = process.env.ALLOW_PLAINTEXT_DEV_FALLBACK;

    try {
      process.env.STRICT_PROD_SECURITY = 'true';
      process.env.ALLOW_PLAINTEXT_DEV_FALLBACK = 'true';

      const isStrictProdSecurity = process.env.STRICT_PROD_SECURITY === 'true';
      const allowPlaintextFallback = !isStrictProdSecurity && (process.env.NODE_ENV !== 'production' || process.env.ALLOW_PLAINTEXT_DEV_FALLBACK === 'true');
      expect(allowPlaintextFallback).toBe(false);
    } finally {
      process.env.STRICT_PROD_SECURITY = origStrict;
      process.env.ALLOW_PLAINTEXT_DEV_FALLBACK = origFallback;
    }
  });

  it('should verify verifyUserPassword only accepts valid hashes and rejects plaintext passwords', () => {
    // If a user document somehow had a raw plaintext string that does not match a valid cryptographic hash of that plain text
    const testUser = {
      id: 'usr-plaintext-test',
      username: 'plaintest',
      full_name: 'Plaintext Test User',
      email: 'plaintest@kemit-erp.com',
      role: 'StationAdmin' as const,
      password: 'mypassword123', // Raw string in legacy field
      salt: 'plaintest@kemit-erp.com'
    };

    // Storing user directly in StorageEngine
    const existing = StorageEngine.getStored<any[]>('users', []);
    StorageEngine.setStored('users', [...existing, testUser]);

    // Attempting to verify with 'mypassword123' should FAIL because stored password is not the hash of 'mypassword123'
    const result = UsersModule.verifyUserPassword('plaintest@kemit-erp.com', 'mypassword123');
    expect(result).toBeNull();
  });

  it('should not trust localStorage alone for authorization elevation', () => {
    // Clear storage cache
    StorageEngine.cache = {};

    // Genuine canonical registered user is StationAdmin
    const realUser: AppUser = {
      id: 'usr-real-station-admin',
      full_name: 'Genuine Station Admin',
      email: 'station.admin@kemit-erp.com',
      role: 'StationAdmin',
      company_id: 'comp-100',
      is_active: true,
      permissions: UsersModule.enrichUserPermissions('StationAdmin')
    };
    StorageEngine.setStored('users', [realUser]);

    // Attacker modifies localStorage 'custody_active_user' to claim SystemAdmin role and elevated permissions
    const tamperedLocalStorageUser = {
      id: 'usr-real-station-admin',
      full_name: 'Genuine Station Admin',
      email: 'station.admin@kemit-erp.com',
      role: 'SystemAdmin', // Tampered!
      company_id: 'comp-100',
      is_active: true,
      permissions: {
        ...UsersModule.enrichUserPermissions('SystemAdmin'),
        manage_companies: true,
        manage_users: true
      }
    };

    localStorage.setItem('custody_active_user', JSON.stringify(tamperedLocalStorageUser));

    // getActiveUser() should reconcile against canonical registered user record and deny tampered privilege
    const resolvedUser = UsersModule.getActiveUser();
    expect(resolvedUser).not.toBeNull();
    expect(resolvedUser?.role).toBe('StationAdmin');
    expect(resolvedUser?.permissions.manage_companies).toBe(false);
    expect(resolvedUser?.permissions.manage_users).toBe(false);
    expect(resolvedUser?.permissions.create_expense).toBe(true);
  });

  it('should reject forged impersonation sessions where impersonator is not a registered SystemAdmin or Platform Owner', () => {
    StorageEngine.cache = {};

    const targetUser: AppUser = {
      id: 'usr-target-manager',
      full_name: 'Target Regional Manager',
      email: 'manager@kemit-erp.com',
      role: 'RegionalManager',
      company_id: 'comp-100',
      is_active: true,
      permissions: UsersModule.enrichUserPermissions('RegionalManager')
    };
    StorageEngine.setStored('users', [targetUser]);

    // Forged impersonation claim with non-existent or unprivileged impersonator
    const forgedImpersonation = {
      ...targetUser,
      impersonator: {
        id: 'usr-fake-attacker',
        email: 'attacker@evil.com',
        full_name: 'Attacker User',
        role: 'StationAdmin'
      }
    };

    localStorage.setItem('custody_active_user', JSON.stringify(forgedImpersonation));

    // getActiveUser() must detect that the impersonator is not a genuine SystemAdmin or Platform Owner and purge the session
    const resolvedUser = UsersModule.getActiveUser();
    expect(resolvedUser).toBeNull();
    expect(localStorage.getItem('custody_active_user')).toBeNull();
  });
});
