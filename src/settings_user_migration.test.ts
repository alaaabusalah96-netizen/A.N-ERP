import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 2 - Settings.tsx User Creation/Editing Migration Audit', () => {
  const settingsPath = path.join(process.cwd(), 'src', 'pages', 'Settings.tsx');
  const usersTabPath = path.join(process.cwd(), 'src', 'components', 'settings', 'UnifiedAccessControlCenter.tsx');
  const userProvPath = path.join(process.cwd(), 'src', 'lib', 'userProvisioning.ts');
  const settingsContent = fs.readFileSync(settingsPath, 'utf8') + '\n' + fs.readFileSync(usersTabPath, 'utf8') + '\n' + fs.readFileSync(userProvPath, 'utf8');

  it('1. Verify handleAddUser uses POST /api/admin/users', () => {
    expect(settingsContent).toContain("fetch('/api/admin/users'");
    expect(settingsContent).toContain("method: 'POST'");
  });

  it('2. Verify no hardcoded password "123456" or plaintext password save in handleAddUser', () => {
    expect(settingsContent).not.toContain("password: '123456'");
  });

  it('3. Verify handleSaveEditUser uses PATCH /api/admin/users/:id', () => {
    expect(settingsContent).toContain("fetch(`/api/admin/users/${id}`");
    expect(settingsContent).toContain("method: 'PATCH'");
  });

  it('4. Verify user updates and access provisioning use PATCH /api/admin/users/:id', () => {
    expect(settingsContent).toContain("fetch(`/api/admin/users/${id}`");
    expect(settingsContent).toContain("body: JSON.stringify(payload)");
  });

  it('5. Verify Authorization Bearer token or credentials header is passed', () => {
    expect(settingsContent).toContain('getAuthHeaders');
    expect(settingsContent).toContain("credentials: 'include'");
  });

  it('6. Verify error response is handled without falling back to plaintext saveUsers', () => {
    expect(settingsContent).toContain('if (!res.ok || !data.success)');
  });

  it('7. Verify handleAddUser uses CustodyDB.getSelectedCompanyId() as sole source of truth', () => {
    const settingsCode = fs.readFileSync(settingsPath, 'utf8');
    expect(settingsCode).toContain('const companyId = CustodyDB.getSelectedCompanyId() || \'\';');
    expect(settingsCode).not.toContain('const companyId = selectedCompanyId ||');
  });

  it('8. Verify handleAddUser alert uses server data.temporaryPassword instead of client finalPassword', () => {
    const settingsCode = fs.readFileSync(settingsPath, 'utf8');
    expect(settingsCode).toContain('const tempPass = data.temporaryPassword || \'\';');
    expect(settingsCode).toContain('tempPass ? `\\nكلمة المرور المؤقتة هي: ${tempPass}` : \'\'');
    expect(settingsCode).not.toContain('finalPassword');
  });

  it('9. Verify handleSaveEditUser uses targetUser.company_id || CustodyDB.getSelectedCompanyId()', () => {
    const settingsCode = fs.readFileSync(settingsPath, 'utf8');
    expect(settingsCode).toContain('const companyId = targetUser.company_id || CustodyDB.getSelectedCompanyId() || \'\';');
    expect(settingsCode).not.toContain('targetUser.company_id || currentUser.company_id');
  });
});
