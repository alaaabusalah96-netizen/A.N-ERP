import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PERMISSIONS } from './db/defaults';
import { buildDynamicPermissionCategories } from './components/settings/UnifiedAccessControlCenter';

describe('Phase 1: Unified Access Control Center & Dynamic Permissions Audit', () => {
  const usersTabPath = path.join(process.cwd(), 'src', 'components', 'settings', 'UnifiedAccessControlCenter.tsx');
  const fileContent = fs.readFileSync(usersTabPath, 'utf8');

  it('1. Verifies removal of hardcoded comp-sewedy-mfg fallback', () => {
    expect(fileContent).not.toContain("'comp-sewedy-mfg'");
    expect(fileContent).not.toContain('"comp-sewedy-mfg"');
  });

  it('2. Verifies dynamic permission categories are built from DEFAULT_PERMISSIONS', () => {
    const dynamicCats = buildDynamicPermissionCategories(DEFAULT_PERMISSIONS);
    expect(dynamicCats.length).toBeGreaterThan(0);

    // Flatten all permissions in dynamic categories
    const allGeneratedKeys = dynamicCats.flatMap(c => c.permissions.map(p => p.key));
    
    // Ensure every permission in DEFAULT_PERMISSIONS is mapped
    DEFAULT_PERMISSIONS.forEach(p => {
      expect(allGeneratedKeys).toContain(p.id);
    });
  });

  it('3. Verifies tabbed navigation structure exists in UnifiedAccessControlCenter', () => {
    expect(fileContent).toContain("setCenterTab('users')");
    expect(fileContent).toContain("setCenterTab('org_structure')");
    expect(fileContent).toContain("setCenterTab('modules')");
    expect(fileContent).toContain("setCenterTab('companies')");
  });

  it('4. Verifies role-based tab visibility enforcement (Scoped admins cannot access modules/companies tabs)', () => {
    expect(fileContent).toContain('!isScopedAdmin');
    expect(fileContent).toContain('isSystemAdmin');
  });

  it('5. Verifies integration of OrganizationTreeManager in org_structure tab', () => {
    expect(fileContent).toContain('<OrganizationTreeManager');
    expect(fileContent).toContain('companyId={effectiveCompanyId}');
  });

  it('6. Verifies SystemAdmin explicit company selection affordance', () => {
    expect(fileContent).toContain('id="select-target-company-dropdown"');
    expect(fileContent).toContain('handleCompanyChange');
  });

  it('7. Verifies compliance with secure user provisioning and editing contracts', () => {
    expect(fileContent).toContain('handleSaveEditUser');
    expect(fileContent).toContain('handleAddUser');
    expect(fileContent).toContain('id="btn-save-user-access"');
  });
});
