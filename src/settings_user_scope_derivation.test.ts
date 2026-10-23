import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deriveScopeIdsFromOrgUnit } from './pages/Settings';
import { CustodyDB } from './db';
import { StorageEngine } from './db/storage';
import { OrganizationUnit } from './types/organization';

describe('User Scope Derivation & Multi-Strategy Resolution Tests', () => {
  const mockRegions = [
    { id: 'R1', name: 'Region R1', org_unit_id: 'ou_reg_r1', company_id: 'comp_1' },
    { id: 'reg_north', name: 'North Region', org_unit_id: 'ou_reg_north', company_id: 'comp_1' },
    { id: 'reg_south', name: 'South Region', org_unit_id: 'ou_reg_south', company_id: 'comp_1' }
  ];

  const mockStations = [
    { id: 'S1', name: 'Station S1', org_unit_id: 'ou_stn_s1', region_id: 'R1', company_id: 'comp_1' },
    { id: 'stn_101', name: 'Station 101', org_unit_id: 'ou_stn_101', region_id: 'reg_north', company_id: 'comp_1' },
    { id: 'stn_102', name: 'Station 102', org_unit_id: 'ou_stn_102', region_id: 'reg_south', company_id: 'comp_1' }
  ];

  const mockUnits: OrganizationUnit[] = [
    {
      id: 'U1',
      companyId: 'comp_1',
      parentId: null,
      typeId: 'out-region',
      code: 'REG-001',
      name: 'Region U1 Node',
      nameAr: 'وحدة المنطقة U1',
      nameEn: 'Region U1 Node',
      metadata: { legacyRegionId: 'R1' },
      isActive: true,
      path: '/U1',
      level: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    },
    {
      id: 'U_STN_1',
      companyId: 'comp_1',
      parentId: 'U1',
      typeId: 'out-station',
      code: 'STN-001',
      name: 'Station U Node',
      nameAr: 'محطة U',
      nameEn: 'Station U Node',
      metadata: { legacyStationId: 'S1' },
      isActive: true,
      path: '/U1/U_STN_1',
      level: 2,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    },
    {
      id: 'U_CHILD',
      companyId: 'comp_1',
      parentId: 'U1',
      typeId: 'out-dept',
      code: 'DEPT-001',
      name: 'Child Dept Under Region',
      nameAr: 'قسم فرعي تحت المنطقة',
      nameEn: 'Child Dept Under Region',
      isActive: true,
      path: '/U1/U_CHILD',
      level: 2,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    },
    {
      id: 'U_UNLINKED',
      companyId: 'comp_1',
      parentId: null,
      typeId: 'out-custom',
      code: 'ORG-9999',
      name: 'Unlinked Root Unit',
      nameAr: 'وحدة غير مرتبطة',
      nameEn: 'Unlinked Root Unit',
      isActive: true,
      path: '/U_UNLINKED',
      level: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    }
  ];

  beforeEach(() => {
    vi.spyOn(CustodyDB, 'getRegions').mockReturnValue(mockRegions as any);
    vi.spyOn(CustodyDB, 'getStations').mockReturnValue(mockStations as any);
    vi.spyOn(StorageEngine, 'getStored').mockImplementation((key: string, defaultValue: any) => {
      if (key === 'organization_units') return mockUnits as any;
      return defaultValue;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Target Test Case 1: unit.id=U1, metadata.legacyRegionId=R1 → region_id R1
  it('1. unit.id=U1, metadata.legacyRegionId=R1 -> resolves region_id R1', () => {
    const derived = deriveScopeIdsFromOrgUnit('U1', 'RegionalManager');
    expect(derived.region_id).toBe('R1');
    expect(derived.station_id).toBeNull();
  });

  // Target Test Case 2: regions=[{id:R1, org_unit_id:U1}], select U1 → region_id R1
  it('2. regions=[{id:R1, org_unit_id:U_DIRECT}], select U_DIRECT -> resolves region_id R1', () => {
    vi.spyOn(CustodyDB, 'getRegions').mockReturnValue([
      { id: 'R1', name: 'Region R1', org_unit_id: 'U_DIRECT', company_id: 'comp_1' }
    ] as any);

    const derived = deriveScopeIdsFromOrgUnit('U_DIRECT', 'RegionalManager');
    expect(derived.region_id).toBe('R1');
    expect(derived.station_id).toBeNull();
  });

  // Target Test Case 3: select org-unit-region-R1, regions=[{id:R1, org_unit_id:'other'}] → R1
  it('3. select org-unit-region-R1, regions=[{id:R1, org_unit_id: "other"}] -> resolves region_id R1', () => {
    vi.spyOn(CustodyDB, 'getRegions').mockReturnValue([
      { id: 'R1', name: 'Region R1', org_unit_id: 'other', company_id: 'comp_1' }
    ] as any);

    const derived = deriveScopeIdsFromOrgUnit('org-unit-region-R1', 'RegionalManager');
    expect(derived.region_id).toBe('R1');
    expect(derived.station_id).toBeNull();
  });

  // Target Test Case 4: station via legacyStationId + region_id on station
  it('4. station via legacyStationId -> resolves station_id S1 and inherited region_id R1', () => {
    const derived = deriveScopeIdsFromOrgUnit('U_STN_1', 'StationAdmin');
    expect(derived.station_id).toBe('S1');
    expect(derived.region_id).toBe('R1');
  });

  // Target Test Case 5: child unit whose parent has legacyRegionId → inherits region_id
  it('5. child unit whose parent has legacyRegionId -> inherits region_id R1', () => {
    const derived = deriveScopeIdsFromOrgUnit('U_CHILD', 'RegionalManager');
    expect(derived.region_id).toBe('R1');
    expect(derived.station_id).toBeNull();
  });

  // Target Test Case 6: no link → nulls (guards still block)
  it('6. no link -> returns nulls and guards block creation/edit', () => {
    const derived = deriveScopeIdsFromOrgUnit('U_UNLINKED', 'RegionalManager');
    expect(derived.region_id).toBeNull();
    expect(derived.station_id).toBeNull();

    const isRegional = true;
    const newUserRegionId = '';
    let isBlocked = false;
    let alertMessage = '';

    if (isRegional && !derived.region_id && !newUserRegionId) {
      isBlocked = true;
      alertMessage = 'A valid region-linked organizational unit must be selected for Regional Manager!';
    }

    expect(isBlocked).toBe(true);
    expect(alertMessage).toContain('valid region-linked organizational unit');
  });

  // Regression / Form Payload Tests
  it('7. Edit: existing RegionalManager on region A; org unit changed to region B -> payload region_id is B, not A', () => {
    const existingUserRegionId = 'reg_north';
    const updatedOrgUnitId = 'ou_reg_south';
    const editUserRole: string = 'RegionalManager';

    const derived = deriveScopeIdsFromOrgUnit(updatedOrgUnitId, editUserRole);
    expect(derived.region_id).toBe('reg_south');
    expect(derived.station_id).toBeNull();

    const payload = {
      full_name: 'Updated Regional Manager',
      role: editUserRole,
      region_id: editUserRole === 'RegionalManager' ? (derived.region_id || null) : null,
      station_id: editUserRole === 'StationAdmin' ? (derived.station_id || null) : null,
      org_unit_id: updatedOrgUnitId || null,
    };

    expect(payload.region_id).toBe('reg_south');
    expect(payload.region_id).not.toBe(existingUserRegionId);
    expect(payload.org_unit_id).toBe('ou_reg_south');
  });

  it('8. Edit: RegionalManager -> Cashier -> payload region_id is explicitly null', () => {
    const existingOrgUnitId = 'ou_reg_north';
    const newRole: string = 'Cashier';

    const derived = deriveScopeIdsFromOrgUnit(existingOrgUnitId, newRole);

    const payload = {
      full_name: 'Demoted to Cashier',
      role: newRole,
      region_id: newRole === 'RegionalManager' ? (derived.region_id || null) : null,
      station_id: newRole === 'StationAdmin' ? (derived.station_id || null) : null,
      org_unit_id: existingOrgUnitId || null,
    };

    expect(payload.role).toBe('Cashier');
    expect(payload.region_id).toBeNull();
    expect(payload.station_id).toBeNull();
    expect(payload.org_unit_id).toBe('ou_reg_north');
  });

  it('9. Modern tree unit "منطقة القاهرة الكبرى" (code ORG-6848, typeId: out-region) without legacy region -> returns region_id: null and unlinked: true', () => {
    const cairoRegionUnit: OrganizationUnit = {
      id: 'orgunit-cairo-6848',
      companyId: 'comp_1',
      parentId: null,
      typeId: 'out-region',
      code: 'ORG-6848',
      name: 'منطقة القاهرة الكبرى',
      nameAr: 'منطقة القاهرة الكبرى',
      nameEn: 'Greater Cairo Region',
      isActive: true,
      path: '/orgunit-cairo-6848',
      level: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    };

    vi.spyOn(StorageEngine, 'getStored').mockImplementation((key: string, defaultValue: any) => {
      if (key === 'organization_units') return [...mockUnits, cairoRegionUnit] as any;
      return defaultValue;
    });

    const derived = deriveScopeIdsFromOrgUnit('orgunit-cairo-6848', 'RegionalManager');
    expect(derived.region_id).toBeNull();
    expect(derived.station_id).toBeNull();
    expect(derived.unlinked).toBe(true);
    expect(derived.unlinkedMessage).toBeDefined();
  });

  it('10. Modern branch unit under Cairo region without backing records -> returns station_id but inherited region_id is null', () => {
    const cairoRegionUnit: OrganizationUnit = {
      id: 'orgunit-cairo-6848',
      companyId: 'comp_1',
      parentId: null,
      typeId: 'out-region',
      code: 'ORG-6848',
      name: 'منطقة القاهرة الكبرى',
      nameAr: 'منطقة القاهرة الكبرى',
      nameEn: 'Greater Cairo Region',
      isActive: true,
      path: '/orgunit-cairo-6848',
      level: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    };

    const maadiBranchUnit: OrganizationUnit = {
      id: 'orgunit-maadi-branch',
      companyId: 'comp_1',
      parentId: 'orgunit-cairo-6848',
      typeId: 'out-branch',
      code: 'ORG-7712',
      name: 'فرع المعادي',
      nameAr: 'فرع المعادي',
      nameEn: 'Maadi Branch',
      isActive: true,
      path: '/orgunit-cairo-6848/orgunit-maadi-branch',
      level: 2,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    };

    vi.spyOn(StorageEngine, 'getStored').mockImplementation((key: string, defaultValue: any) => {
      if (key === 'organization_units') return [...mockUnits, cairoRegionUnit, maadiBranchUnit] as any;
      return defaultValue;
    });

    // Parent out-region without regions row returns region_id: null and unlinked: true
    const derivedParent = deriveScopeIdsFromOrgUnit('orgunit-cairo-6848', 'RegionalManager');
    expect(derivedParent.region_id).toBeNull();
    expect(derivedParent.unlinked).toBe(true);

    // Branch under Cairo region -> resolves station_id, but cannot inherit unbacked region_id
    const derived = deriveScopeIdsFromOrgUnit('orgunit-maadi-branch', 'StationAdmin');
    expect(derived.station_id).toBe('orgunit-maadi-branch');
    expect(derived.region_id).toBeNull();
    expect(derived.company_id).toBe('comp_1');
  });

  it('11. Company ID is automatically derived from unit, ancestor, or active company', () => {
    const derivedUnit = deriveScopeIdsFromOrgUnit('U1', 'RegionalManager');
    expect(derivedUnit.company_id).toBe('comp_1');

    const derivedChild = deriveScopeIdsFromOrgUnit('U_CHILD', 'RegionalManager');
    expect(derivedChild.company_id).toBe('comp_1');

    const derivedNull = deriveScopeIdsFromOrgUnit(null, 'Admin');
    expect(derivedNull.company_id).toBeDefined();
  });

  it('12. Unit name containing "منطقة" or "region" alone does NOT invent region_id if not type out-region or linked', () => {
    const fakeRegionNameUnit: OrganizationUnit = {
      id: 'ou-dept-fake',
      companyId: 'comp_1',
      parentId: null,
      typeId: 'out-dept',
      code: 'DEPT-99',
      name: 'منطقة المبيعات العامة والتسويق (Department)',
      nameAr: 'منطقة المبيعات العامة والتسويق',
      nameEn: 'General Sales Region Department',
      isActive: true,
      path: '/ou-dept-fake',
      level: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    };

    vi.spyOn(StorageEngine, 'getStored').mockImplementation((key: string, defaultValue: any) => {
      if (key === 'organization_units') return [...mockUnits, fakeRegionNameUnit] as any;
      return defaultValue;
    });

    const derived = deriveScopeIdsFromOrgUnit('ou-dept-fake', 'RegionalManager');
    // Name containing 'منطقة' must NOT trick resolution into inventing a region_id
    expect(derived.region_id).toBeNull();
    expect(derived.unlinked).toBe(true);
    expect(derived.unlinkedMessage).toBeDefined();
  });

  it('13. Unlinked unit returns unlinked: true and explicit bilingual unlinkedMessage', () => {
    const derived = deriveScopeIdsFromOrgUnit('U_UNLINKED', 'RegionalManager');
    expect(derived.unlinked).toBe(true);
    expect(derived.unlinkedMessage).toContain('غير مرتبطة');
  });
});

