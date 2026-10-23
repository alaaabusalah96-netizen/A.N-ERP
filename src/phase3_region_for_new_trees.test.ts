import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrganizationEngine, REGION_TYPE_IDS, isRegionLikeType } from './db/organizationEngine';
import { StorageEngine } from './db/storage';
import { StationsModule } from './db/stations';
import { CustodyDB } from './db';
import { deriveScopeIdsFromOrgUnit } from './pages/Settings';
import { OrganizationUnit } from './types/organization';
import { Region } from './types';

describe('Phase 3: Region for New Trees & Anti-Synthetic Enforcement', () => {
  const companyId = 'comp-phase3-enterprise';

  beforeEach(() => {
    StorageEngine.setStored('organization_unit_types', []);
    StorageEngine.setStored('organization_units', []);
    StorageEngine.setStored('organization_paths', []);
    StorageEngine.setStored('regions', []);
    StorageEngine.setStored('stations', []);
    StorageEngine.setStored('users', []);
  });

  it('1. REGION_TYPE_IDS contains out-region and isRegionLikeType is locked to region types', () => {
    expect(REGION_TYPE_IDS).toContain('out-region');
    expect(isRegionLikeType('out-region')).toBe(true);
    expect(isRegionLikeType('out-company')).toBe(false);
    expect(isRegionLikeType('out-sector')).toBe(false);
    expect(isRegionLikeType('out-department')).toBe(false);
    expect(isRegionLikeType('out-station')).toBe(false);
  });

  it('2. addUnit out-region atomically persists a real Region row', async () => {
    const unit = await OrganizationEngine.addUnit({
      companyId,
      typeId: 'out-region',
      code: 'REG-NORTH',
      name: 'منطقة الشمال',
      nameAr: 'منطقة الشمال',
      nameEn: 'Northern Region'
    });

    expect(unit.id).toBeDefined();
    expect(unit.metadata?.legacyRegionId).toBe(unit.id);

    const regions = StationsModule.getRegions();
    const matchingRegion = regions.find(r => r.id === unit.id || r.org_unit_id === unit.id);
    expect(matchingRegion).toBeDefined();
    expect(matchingRegion?.id).toBe(unit.id);
    expect(matchingRegion?.company_id).toBe(companyId);
    expect(matchingRegion?.org_unit_id).toBe(unit.id);
    expect(matchingRegion?.name).toBe('منطقة الشمال');
  });

  it('3. Failure during saveRegions causes addUnit to rollback and throw (no orphaned units)', async () => {
    vi.spyOn(StationsModule, 'saveRegions').mockResolvedValueOnce({
      success: false,
      error: 'Cloud datastore write rejected: quota exceeded'
    });

    await expect(
      OrganizationEngine.addUnit({
        companyId,
        typeId: 'out-region',
        code: 'REG-WILL-FAIL',
        name: 'منطقة فاشلة'
      })
    ).rejects.toThrow('Cloud datastore write rejected: quota exceeded');

    // Confirm that the unit was rolled back and is NOT in storage
    const allUnits = OrganizationEngine.getUnits(companyId);
    expect(allUnits.find(u => u.code === 'REG-WILL-FAIL')).toBeUndefined();

    // Confirm that no region was created
    const allRegions = StationsModule.getRegions();
    expect(allRegions.find(r => r.code === 'REG-WILL-FAIL')).toBeUndefined();
  });

  it('4. deriveScopeIdsFromOrgUnit derives region_id ONLY from real regions row', async () => {
    const unit = await OrganizationEngine.addUnit({
      companyId,
      typeId: 'out-region',
      code: 'REG-EAST',
      name: 'منطقة الشرقية'
    });

    const regions = StationsModule.getRegions();
    vi.spyOn(CustodyDB, 'getRegions').mockReturnValue(regions);

    const derived = deriveScopeIdsFromOrgUnit(unit.id, 'RegionalManager');
    expect(derived.region_id).toBe(unit.id);
    expect(derived.unlinked).toBe(false);
    expect(derived.unlinkedMessage).toBeNull();
  });

  it('5. deriveScopeIdsFromOrgUnit blocks RM and flags unlinked if unit has no matching regions row', () => {
    const ghostUnit: OrganizationUnit = {
      id: 'unit-ghost-out-region',
      companyId,
      parentId: null,
      typeId: 'out-region',
      code: 'REG-GHOST',
      name: 'منطقة غير مسجلة بقاعدة المناطق',
      nameAr: 'منطقة غير مسجلة',
      nameEn: 'Ghost Unit',
      isActive: true,
      path: '/unit-ghost-out-region',
      level: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    };

    StorageEngine.setStored('organization_units', [ghostUnit]);
    vi.spyOn(CustodyDB, 'getRegions').mockReturnValue([]); // No regions in database

    const derived = deriveScopeIdsFromOrgUnit('unit-ghost-out-region', 'RegionalManager');
    expect(derived.region_id).toBeNull();
    expect(derived.unlinked).toBe(true);
    expect(derived.unlinkedMessage).toBeTruthy();
  });

  it('6. Full Acceptance Flow: New Company -> out-region -> success implies regions row -> RM creation scope is valid', async () => {
    // Step 1: New company created
    const newCompId = 'comp-fresh-2026';

    // Step 2: Add out-region unit
    const regionUnit = await OrganizationEngine.addUnit({
      companyId: newCompId,
      typeId: 'out-region',
      code: 'REG-WEST',
      name: 'منطقة الغربية',
      nameAr: 'منطقة الغربية'
    });

    expect(regionUnit.id).toBeDefined();

    // Step 3: Success implies regions row exists
    const regions = StationsModule.getRegions();
    const dbRegion = regions.find(r => r.id === regionUnit.id || r.org_unit_id === regionUnit.id);
    expect(dbRegion).toBeDefined();
    expect(dbRegion?.company_id).toBe(newCompId);

    // Step 4: Resolve scope for RegionalManager on that unit
    vi.spyOn(CustodyDB, 'getRegions').mockReturnValue(regions);
    const scope = deriveScopeIdsFromOrgUnit(regionUnit.id, 'RegionalManager');

    expect(scope.unlinked).toBe(false);
    expect(scope.region_id).toBe(dbRegion?.id);
    expect(scope.region_id).not.toBeNull();
    expect(typeof scope.region_id).toBe('string');
  });
});
