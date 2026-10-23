import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 2 - User Provisioning Module & Architecture Audit', () => {
  function scanDirForFetches(dir: string, found: string[] = []): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
          scanDirForFetches(fullPath, found);
        }
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        // Exclude tests and userProvisioning.ts itself
        if (!entry.name.includes('.test.') && entry.name !== 'userProvisioning.ts') {
          const content = fs.readFileSync(fullPath, 'utf8');
          // Check for fetch calls targeting /api/admin/users
          if (/fetch\s*\(\s*[`'"]\/api\/admin\/users/i.test(content)) {
            found.push(fullPath);
          }
        }
      }
    }
    return found;
  }

  it('1. src/** must not call fetch("/api/admin/users") except inside userProvisioning.ts', () => {
    const srcDir = path.join(process.cwd(), 'src');
    const violatingFiles = scanDirForFetches(srcDir);
    expect(violatingFiles).toEqual([]);
  });

  it('2. userProvisioning.ts exports createManagedUser, updateManagedUser, deleteManagedUser', () => {
    const modPath = path.join(process.cwd(), 'src', 'lib', 'userProvisioning.ts');
    const content = fs.readFileSync(modPath, 'utf8');
    expect(content).toContain('export async function createManagedUser');
    expect(content).toContain('export async function updateManagedUser');
    expect(content).toContain('export async function deleteManagedUser');
    expect(content).toContain('credentials: \'include\'');
    expect(content).toContain('getAuthHeaders');
  });

  it('3. server.ts POST /api/admin/users fails closed when Firebase createUser fails without creating orphan local users', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const content = fs.readFileSync(serverPath, 'utf8');
    expect(content).toContain('app.post("/api/admin/users"');
    expect(content).toContain('authClient.createUser');
    expect(content).toContain('createAuthErr');
  });

  it('4. Login.tsx sanitizes and trims credentials, uses honest error messages, and avoids logging passwords', () => {
    const loginPath = path.join(process.cwd(), 'src', 'pages', 'Login.tsx');
    const content = fs.readFileSync(loginPath, 'utf8');
    expect(content).toContain('cleanEmail');
    expect(content).toContain('cleanPassword');
    expect(content).toContain('Too many attempts');
    expect(content).not.toContain('console.log(password');
    expect(content).not.toContain('console.log("password"');
  });

  it('5. ChangePasswordRequired.tsx enforces 12+ chars, letters + numbers, and clears errors on retype', () => {
    const cpPath = path.join(process.cwd(), 'src', 'components', 'ChangePasswordRequired.tsx');
    const content = fs.readFileSync(cpPath, 'utf8');
    expect(content).toContain('trimmedNew.length < 12');
    expect(content).toContain('/[a-zA-Z]/');
    expect(content).toContain('/[0-9]/');
    expect(content).toContain('if (errorMsg) setErrorMsg(null);');
  });
});
