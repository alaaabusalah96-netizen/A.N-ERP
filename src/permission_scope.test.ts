import { describe, it, expect, beforeEach } from 'vitest';
import { OrganizationEngine } from './db/organizationEngine';
import { OrganizationScopeEngine } from './db/organizationScopeEngine';
import { StationsModule } from './db/stations';
import { StorageEngine } from './db/storage';
import { AppUser } from './types';

describe('Phase 7: Permission Scope Engine Unit Tests', () => {
  const companyId = 'comp-perm-scope-test';

  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
    StorageEngine.setStored('organization_units', []);
    StorageEngine.setStored('organization_unit_types', []);
    StorageEngine.setStored('stations', []);
    StorageEngine.setStored('regions', []);
  });

  it('should allow SystemAdmin or Admin full company scope access', async () => {
    // Setup org hierarchy: Company -> Sector -> Region -> Station
    const root = await OrganizationEngine.addOrganizationUnit({ nameAr: 'شركة الاختبار', nameEn: 'Test Company', code: 'HQ', typeCode: 'COMPANY', companyId });
    const sector = await OrganizationEngine.addOrganizationUnit({ nameAr: 'قطاع الشمال', nameEn: 'North Sector', code: 'SEC-N', typeCode: 'SECTOR', parentId: root.id, companyId });
    const region = await OrganizationEngine.addOrganizationUnit({ nameAr: 'منطقة القاهرة', nameEn: 'Cairo Region', code: 'REG-CAI', typeCode: 'REGION', parentId: sector.id, companyId });
    const station = await OrganizationEngine.addOrganizationUnit({ nameAr: 'محطة ألعاب', nameEn: 'Station Alpha', code: 'STN-A', typeCode: 'STATION', parentId: region.id, companyId });

    const adminUser: AppUser = {
      id: 'usr-admin',
      email: 'admin@test.com',
      full_name: 'System Admin',
      role: 'SystemAdmin',
      company_id: companyId,
      permissions: { view_reports: true, manage_settings: true },
    };

    const accessible = OrganizationScopeEngine.getAccessibleOrgUnitIds(adminUser, companyId);
    expect(accessible.length).toBe(4);
    expect(accessible).toContain(root.id);
    expect(accessible).toContain(sector.id);
    expect(accessible).toContain(region.id);
    expect(accessible).toContain(station.id);
  });

  it('should automatically inherit permissions down the organization tree hierarchy', async () => {
    // Setup hierarchy: Company -> Sector -> Region -> Branch
    const root = await OrganizationEngine.addOrganizationUnit({ nameAr: 'المقر الرئيسي', nameEn: 'HQ', code: 'HQ', typeCode: 'COMPANY', companyId });
    const sector = await OrganizationEngine.addOrganizationUnit({ nameAr: 'قطاع المبيعات', nameEn: 'Sales Sector', code: 'SEC-SALES', typeCode: 'SECTOR', parentId: root.id, companyId });
    const regCai = await OrganizationEngine.addOrganizationUnit({ nameAr: 'منطقة القاهرة', nameEn: 'Cairo Region', code: 'REG-CAI', typeCode: 'REGION', parentId: sector.id, companyId });
    const regAlex = await OrganizationEngine.addOrganizationUnit({ nameAr: 'منطقة الإسكندرية', nameEn: 'Alex Region', code: 'REG-ALX', typeCode: 'REGION', parentId: sector.id, companyId });
    const brCai1 = await OrganizationEngine.addOrganizationUnit({ nameAr: 'فرع المعادي', nameEn: 'Maadi Branch', code: 'BR-MAADI', typeCode: 'BRANCH', parentId: regCai.id, companyId });
    const brCai2 = await OrganizationEngine.addOrganizationUnit({ nameAr: 'فرع مدينة نصر', nameEn: 'Nasr City Branch', code: 'BR-NASR', typeCode: 'BRANCH', parentId: regCai.id, companyId });

    // User assigned to Cairo Region (regCai)
    const regionalMgr: AppUser = {
      id: 'usr-reg-mgr',
      email: 'cairo.mgr@test.com',
      full_name: 'Cairo Regional Manager',
      role: 'RegionalManager',
      company_id: companyId,
      org_unit_id: regCai.id,
      permissions: { view_reports: true, manage_settings: false },
    };

    const accessibleIds = OrganizationScopeEngine.getAccessibleOrgUnitIds(regionalMgr, companyId);

    // Should include regCai and its descendants (brCai1, brCai2)
    expect(accessibleIds).toContain(regCai.id);
    expect(accessibleIds).toContain(brCai1.id);
    expect(accessibleIds).toContain(brCai2.id);

    // Should NOT include root, sector, or Alex Region (regAlex)
    expect(accessibleIds).not.toContain(root.id);
    expect(accessibleIds).not.toContain(sector.id);
    expect(accessibleIds).not.toContain(regAlex.id);

    // Validate isOrgUnitInScope
    expect(OrganizationScopeEngine.isOrgUnitInScope(brCai1.id, regionalMgr, companyId)).toBe(true);
    expect(OrganizationScopeEngine.isOrgUnitInScope(regAlex.id, regionalMgr, companyId)).toBe(false);
  });

  it('should restrict leaf-assigned user to their exact org unit without access to parent or sibling units', async () => {
    const root = await OrganizationEngine.addOrganizationUnit({ nameAr: 'المقر الرئيسي', nameEn: 'HQ', code: 'HQ', typeCode: 'COMPANY', companyId });
    const regCai = await OrganizationEngine.addOrganizationUnit({ nameAr: 'منطقة القاهرة', nameEn: 'Cairo Region', code: 'REG-CAI', typeCode: 'REGION', parentId: root.id, companyId });
    const br1 = await OrganizationEngine.addOrganizationUnit({ nameAr: 'فرع المعادي', nameEn: 'Maadi Branch', code: 'BR-1', typeCode: 'BRANCH', parentId: regCai.id, companyId });
    const br2 = await OrganizationEngine.addOrganizationUnit({ nameAr: 'فرع المعادي 2', nameEn: 'Maadi Branch 2', code: 'BR-2', typeCode: 'BRANCH', parentId: regCai.id, companyId });

    const branchUser: AppUser = {
      id: 'usr-branch',
      email: 'branch1@test.com',
      full_name: 'Branch 1 Supervisor',
      role: 'StationAdmin',
      company_id: companyId,
      org_unit_id: br1.id,
      permissions: { view_reports: true, manage_settings: false },
    };

    const accessibleIds = OrganizationScopeEngine.getAccessibleOrgUnitIds(branchUser, companyId);
    expect(accessibleIds).toEqual([br1.id]);

    expect(OrganizationScopeEngine.isOrgUnitInScope(br1.id, branchUser, companyId)).toBe(true);
    expect(OrganizationScopeEngine.isOrgUnitInScope(br2.id, branchUser, companyId)).toBe(false);
    expect(OrganizationScopeEngine.isOrgUnitInScope(regCai.id, branchUser, companyId)).toBe(false);
  });

  it('Phase 4: mid-level Organization Unit automatically grants access to all its descendant units without extra config', async () => {
    // Setup deep 4-level hierarchy: Company -> Sector -> Region -> Branch -> SubStation
    const company = await OrganizationEngine.addOrganizationUnit({ nameAr: 'مجموعة النيل', nameEn: 'Nile Group', code: 'NILE', typeCode: 'COMPANY', companyId });
    const midSector = await OrganizationEngine.addOrganizationUnit({ nameAr: 'قطاع التوزيع', nameEn: 'Distribution Sector', code: 'SEC-DIST', typeCode: 'SECTOR', parentId: company.id, companyId });
    
    // 2 Child Regions under Mid-Sector
    const reg1 = await OrganizationEngine.addOrganizationUnit({ nameAr: 'إقليم الدلتا', nameEn: 'Delta Region', code: 'REG-DLT', typeCode: 'REGION', parentId: midSector.id, companyId });
    const reg2 = await OrganizationEngine.addOrganizationUnit({ nameAr: 'إقليم القناة', nameEn: 'Canal Region', code: 'REG-CNL', typeCode: 'REGION', parentId: midSector.id, companyId });

    // 3 Leaf Branches under reg1 and reg2
    const br1 = await OrganizationEngine.addOrganizationUnit({ nameAr: 'فرع طنطا', nameEn: 'Tanta Branch', code: 'BR-TNT', typeCode: 'BRANCH', parentId: reg1.id, companyId });
    const br2 = await OrganizationEngine.addOrganizationUnit({ nameAr: 'فرع المنصورة', nameEn: 'Mansoura Branch', code: 'BR-MNS', typeCode: 'BRANCH', parentId: reg1.id, companyId });
    const br3 = await OrganizationEngine.addOrganizationUnit({ nameAr: 'فرع بورسعيد', nameEn: 'Port Said Branch', code: 'BR-PSD', typeCode: 'BRANCH', parentId: reg2.id, companyId });

    // User assigned ONLY to midSector (Distribution Sector)
    const midLevelUser: AppUser = {
      id: 'usr-sector-mgr',
      email: 'sector.dist@nile.com',
      full_name: 'Distribution Sector Manager',
      role: 'RegionalManager',
      company_id: companyId,
      org_unit_id: midSector.id, // Scoped to mid level
      permissions: { view_reports: true, manage_settings: false },
    };

    // Calculate accessible units
    const accessibleUnits = OrganizationScopeEngine.getAccessibleOrgUnitIds(midLevelUser, companyId);

    // Mid level sector + both regions + all 3 branches must be automatically accessible
    expect(accessibleUnits).toContain(midSector.id);
    expect(accessibleUnits).toContain(reg1.id);
    expect(accessibleUnits).toContain(reg2.id);
    expect(accessibleUnits).toContain(br1.id);
    expect(accessibleUnits).toContain(br2.id);
    expect(accessibleUnits).toContain(br3.id);
    expect(accessibleUnits.length).toBe(6);

    // Parent company must NOT be accessible
    expect(accessibleUnits).not.toContain(company.id);

    // Test Target Scoping
    expect(OrganizationScopeEngine.isTargetInUserScope({ company_id: companyId, org_unit_id: br1.id }, midLevelUser)).toBe(true);
    expect(OrganizationScopeEngine.isTargetInUserScope({ company_id: companyId, org_unit_id: br3.id }, midLevelUser)).toBe(true);
    expect(OrganizationScopeEngine.isTargetInUserScope({ company_id: companyId, org_unit_id: company.id }, midLevelUser)).toBe(false);
  });

  it('Phase 4: legacy Region-based scoped user continues to work identically', () => {
    const legacyUser: AppUser = {
      id: 'usr-legacy-region',
      email: 'legacy.mgr@company.com',
      full_name: 'Legacy Regional Mgr',
      role: 'RegionalManager',
      company_id: companyId,
      region_id: 'reg-legacy-cairo', // Legacy field only
      permissions: { view_reports: true, manage_settings: false },
    };

    const targetLegacyDoc = { company_id: companyId, region_id: 'reg-legacy-cairo' };
    const targetOtherDoc = { company_id: companyId, region_id: 'reg-legacy-alex' };

    expect(OrganizationScopeEngine.isTargetInUserScope(targetLegacyDoc, legacyUser)).toBe(true);
    expect(OrganizationScopeEngine.isTargetInUserScope(targetOtherDoc, legacyUser)).toBe(false);
  });
});
