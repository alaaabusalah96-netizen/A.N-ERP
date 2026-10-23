import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrganizationEngine, REGION_TYPE_IDS, isRegionLikeType } from './db/organizationEngine';
import { StorageEngine } from './db/storage';
import { StationsModule } from './db/stations';
import { CustodyDB } from './db';
import { deriveScopeIdsFromOrgUnit } from './pages/Settings';
import { OrganizationUnit } from './types/organization';

describe('Phase 1: Organization Tree Region Creation & Atomic Sync Tests', () => {
  const companyId = 'comp-test-phase1';

  beforeEach(() => {
    StorageEngine.setStored('organization_unit_types', []);
    StorageEngine.setStored('organization_units', []);
    StorageEngine.setStored('organization_paths', []);
    StorageEngine.setStored('regions', []);
    StorageEngine.setStored('stations', []);
  });

  it('1. REGION_TYPE_IDS includes out-region and isRegionLikeType identifies region types', () => {
    expect(REGION_TYPE_IDS).toContain('out-region');
    expect(isRegionLikeType('out-region')).toBe(true);
    expect(isRegionLikeType('out-unit')).toBe(false);
    expect(isRegionLikeType('out-station')).toBe(false);
  });

  it('2. addUnit with type out-region atomically creates a matching Region record', async () => {
    const unit = await OrganizationEngine.addUnit({
      companyId,
      typeId: 'out-region',
      code: 'REG-DELTA',
      name: 'منطقة الدلتا',
      nameAr: 'منطقة الدلتا',
      nameEn: 'Delta Region'
    });

    expect(unit.id).toBeDefined();
    expect(unit.metadata?.legacyRegionId).toBe(unit.id);

    // Verify Region was created in storage
    const regions = StationsModule.getRegions();
    const createdRegion = regions.find(r => r.id === unit.id || r.org_unit_id === unit.id);
    expect(createdRegion).toBeDefined();
    expect(createdRegion?.name).toBe('منطقة الدلتا');
    expect(createdRegion?.org_unit_id).toBe(unit.id);
    expect(createdRegion?.company_id).toBe(companyId);
  });

  it('3. addUnit rolls back if reverse-sync to saveRegions fails', async () => {
    vi.spyOn(StationsModule, 'saveRegions').mockRejectedValueOnce(new Error('Storage failure'));

    await expect(
      OrganizationEngine.addUnit({
        companyId,
        typeId: 'out-region',
        code: 'REG-FAIL',
        name: 'Failed Region'
      })
    ).rejects.toThrow('Storage failure');

    // Verify organization_units storage was rolled back
    const units = OrganizationEngine.getUnits(companyId);
    expect(units.find(u => u.code === 'REG-FAIL')).toBeUndefined();
  });

  it('4. deriveScopeIdsFromOrgUnit correctly resolves real region created by addUnit', async () => {
    const unit = await OrganizationEngine.addUnit({
      companyId,
      typeId: 'out-region',
      code: 'REG-ALEX',
      name: 'منطقة الإسكندرية',
    });

    // Mock CustodyDB.getRegions to return current storage regions
    const regions = StationsModule.getRegions();
    vi.spyOn(CustodyDB, 'getRegions').mockReturnValue(regions);

    const derived = deriveScopeIdsFromOrgUnit(unit.id, 'RegionalManager');
    expect(derived.region_id).toBe(unit.id);
    expect(derived.station_id).toBeNull();
    expect(derived.unlinked).toBe(false);
  });

  it('5. deriveScopeIdsFromOrgUnit returns region_id: null and unlinked: true when unit has no regions row', () => {
    const unlinkedUnit: OrganizationUnit = {
      id: 'unit-unlinked-reg',
      companyId,
      parentId: null,
      typeId: 'out-region',
      code: 'REG-GHOST',
      name: 'منطقة وهمية غير مسجلة',
      nameAr: 'منطقة وهمية',
      nameEn: 'Ghost Region',
      isActive: true,
      path: '/unit-unlinked-reg',
      level: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    };

    StorageEngine.setStored('organization_units', [unlinkedUnit]);
    vi.spyOn(CustodyDB, 'getRegions').mockReturnValue([]);

    const derived = deriveScopeIdsFromOrgUnit('unit-unlinked-reg', 'RegionalManager');
    expect(derived.region_id).toBeNull();
    expect(derived.unlinked).toBe(true);
    expect(derived.unlinkedMessage).toContain('غير مرتبطة');
  });

  it('6. repairMissingRegions idempotently creates missing regions for existing units', async () => {
    const unlinkedUnit: OrganizationUnit = {
      id: 'unit-orphan-reg',
      companyId,
      parentId: null,
      typeId: 'out-region',
      code: 'REG-ORPHAN',
      name: 'منطقة الصعيد',
      nameAr: 'منطقة الصعيد',
      nameEn: 'Upper Egypt Region',
      isActive: true,
      path: '/unit-orphan-reg',
      level: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    };

    StorageEngine.setStored('organization_units', [unlinkedUnit]);
    StorageEngine.setStored('regions', []);

    const result = await OrganizationEngine.repairMissingRegions();
    expect(result.fixed).toBe(1);
    expect(result.details[0].status).toBe('created');

    // Verify Region exists now
    const regions = StationsModule.getRegions();
    expect(regions.some(r => r.id === 'unit-orphan-reg')).toBe(true);

    // Second run should be idempotent (0 fixed, 1 skipped)
    const secondRun = await OrganizationEngine.repairMissingRegions();
    expect(secondRun.fixed).toBe(0);
    expect(secondRun.skipped).toBe(1);
  });
});
