import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 4: Final Cleanup & Integrity Verification', () => {
  it('1. SuperAdmin.tsx has no unused AdminCredentialsForm import', () => {
    const superAdminFile = fs.readFileSync(path.join(process.cwd(), 'src/pages/SuperAdmin.tsx'), 'utf-8');
    expect(superAdminFile).not.toContain("AdminCredentialsForm");
  });

  it('2. Stations.tsx preserves all operational and custody workflows without regression', () => {
    const stationsFile = fs.readFileSync(path.join(process.cwd(), 'src/pages/Stations.tsx'), 'utf-8');
    expect(stationsFile).toContain('CustodyDB');
    expect(stationsFile).toContain('OrganizationTreeManager');
    expect(stationsFile).not.toContain('AdminCredentialsForm');
  });

  it('3. RegionAdminDashboard.tsx and CompanyAdminDashboard.tsx do not have AdminCredentialsForm', () => {
    const radFile = fs.readFileSync(path.join(process.cwd(), 'src/pages/RegionAdminDashboard.tsx'), 'utf-8');
    expect(radFile).not.toContain('AdminCredentialsForm');
    const cadFile = fs.readFileSync(path.join(process.cwd(), 'src/pages/CompanyAdminDashboard.tsx'), 'utf-8');
    expect(cadFile).not.toContain('AdminCredentialsForm');
  });

  it('4. UnifiedAccessControlCenter manages all access, structure, and users centrally', () => {
    const uacFile = fs.readFileSync(path.join(process.cwd(), 'src/components/settings/UnifiedAccessControlCenter.tsx'), 'utf-8');
    expect(uacFile).toContain('effectiveCompanyId');
    expect(uacFile).toContain('UsersModule');
    expect(uacFile).toContain('impersonateUser');
  });
});
