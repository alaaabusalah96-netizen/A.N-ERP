import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Part 2: Repeat-Login-Failure Diagnostic & Auth Bypass Verification', () => {
  it('1. Confirms legacy sign-in and unsafe invalid-credential auto-create branches are removed from Login.tsx', () => {
    const loginTsxPath = path.join(process.cwd(), 'src/pages/Login.tsx');
    const content = fs.readFileSync(loginTsxPath, 'utf8');
    
    // Check that legacy auth codes are removed
    expect(content).not.toContain("authErr.code === 'auth/invalid-credential'");
    expect(content).not.toContain("signInWithEmailAndPassword");
    expect(content).not.toContain("createUserWithEmailAndPassword");
  });

  it('2. Confirms legacy migrate-credential-id and unwrapped saveUsers calls are removed from Login.tsx', () => {
    const loginTsxPath = path.join(process.cwd(), 'src/pages/Login.tsx');
    const content = fs.readFileSync(loginTsxPath, 'utf8');

    expect(content).not.toContain("await fetch('/api/auth/migrate-credential-id'");
    expect(content).not.toContain("await dbDeleteDoc('users'");
  });
});
