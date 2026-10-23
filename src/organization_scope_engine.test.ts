import { describe, it, expect, beforeEach } from 'vitest';
import { OrganizationScopeEngine } from './db/organizationScopeEngine';
import { OrganizationEngine } from './db/organizationEngine';
import { StorageEngine } from './db/storage';
import { AppUser } from './types';

describe('Phase 2: OrganizationScopeEngine Unit Tests', () => {
  const companyId = 'comp-scope-test';

  beforeEach(() => {
    // Clear state
    StorageEngine.setStored('organization_units', []);
    StorageEngine.setStored('organization_unit_types', []);
    OrganizationScopeEngine.invalidateScopeCache();
  });

  it('1. should return empty accessible IDs if target company ID is missing', () => {
    const user = { id: 'u1', role: 'User', email: 'u1@test.com', full_name: 'User 1', permissions: [] } as unknown as AppUser;
    const accessible = OrganizationScopeEngine.getAccessibleOrgUnitIds(user);
    expect(accessible).toEqual([]);
  });

  it('2. should grant full accessible IDs to Admin or SystemAdmin users', async () => {
    // Add two units
    const unit1 = await OrganizationEngine.addUnit({
      companyId,
      typeId: 'out-company',
      code: 'U1',
      name: 'Unit 1',
    });
    const unit2 = await OrganizationEngine.addUnit({
      companyId,
      typeId: 'out-company',
      code: 'U2',
      name: 'Unit 2',
    });

    const adminUser = { id: 'u-admin', role: 'Admin', company_id: companyId, email: 'admin@test.com', full_name: 'Admin User', permissions: [] } as unknown as AppUser;
    const accessible = OrganizationScopeEngine.getAccessibleOrgUnitIds(adminUser, companyId);

    expect(accessible).toContain(unit1.id);
    expect(accessible).toContain(unit2.id);
  });

  it('3. should inherit access to child units for scoped manager assigned to parent unit', async () => {
    const parent = await OrganizationEngine.addUnit({
      companyId,
      typeId: 'out-company',
      code: 'REG-01',
      name: 'Cairo Region',
    });
    const child1 = await OrganizationEngine.addUnit({
      companyId,
      typeId: 'out-company',
      parentId: parent.id,
      code: 'BR-01',
      name: 'Maadi Branch',
    });
    const child2 = await OrganizationEngine.addUnit({
      companyId,
      typeId: 'out-company',
      parentId: parent.id,
      code: 'BR-02',
      name: 'Heliopolis Branch',
    });
    const other = await OrganizationEngine.addUnit({
      companyId,
      typeId: 'out-company',
      code: 'REG-02',
      name: 'Alex Region',
    });

    const regManager = {
      id: 'mgr-1',
      role: 'User',
      company_id: companyId,
      org_unit_id: parent.id,
      email: 'mgr@test.com',
      full_name: 'Manager',
      permissions: [],
    } as unknown as AppUser;

    const accessible = OrganizationScopeEngine.getAccessibleOrgUnitIds(regManager, companyId);

    expect(accessible).toContain(parent.id);
    expect(accessible).toContain(child1.id);
    expect(accessible).toContain(child2.id);
    expect(accessible).not.toContain(other.id);
  });

  it('4. should correctly validate isOrgUnitInScope for scoped users', async () => {
    const root = await OrganizationEngine.addUnit({ companyId, typeId: 'out-company', code: 'R1', name: 'Root' });
    const leaf = await OrganizationEngine.addUnit({ companyId, typeId: 'out-company', parentId: root.id, code: 'L1', name: 'Leaf' });
    const unlinked = await OrganizationEngine.addUnit({ companyId, typeId: 'out-company', code: 'U1', name: 'Unlinked' });

    const user = {
      id: 'u-leaf',
      role: 'User',
      company_id: companyId,
      org_unit_id: leaf.id,
      email: 'leaf@test.com',
      full_name: 'Leaf User',
      permissions: [],
    } as unknown as AppUser;

    expect(OrganizationScopeEngine.isOrgUnitInScope(leaf.id, user, companyId)).toBe(true);
    expect(OrganizationScopeEngine.isOrgUnitInScope(unlinked.id, user, companyId)).toBe(false);
    expect(OrganizationScopeEngine.isOrgUnitInScope(null, user, companyId)).toBe(true); // Unassigned items are accessible
  });

  it('5. should reject cross-company access in isTargetInUserScope', () => {
    const user = { id: 'u1', role: 'User', company_id: 'comp-a', email: 'u1@test.com', full_name: 'User 1', permissions: [] } as unknown as AppUser;
    const targetOtherCompany = { company_id: 'comp-b', org_unit_id: 'ou-1' };

    expect(OrganizationScopeEngine.isTargetInUserScope(targetOtherCompany, user)).toBe(false);
  });

  it('6. should filter arrays of records based on user scope via filterByOrganizationScope', async () => {
    const parent = await OrganizationEngine.addUnit({ companyId, typeId: 'out-company', code: 'P1', name: 'Parent' });
    const child = await OrganizationEngine.addUnit({ companyId, typeId: 'out-company', parentId: parent.id, code: 'C1', name: 'Child' });
    const outsider = await OrganizationEngine.addUnit({ companyId, typeId: 'out-company', code: 'O1', name: 'Outsider' });

    const user = {
      id: 'u-scoped',
      role: 'User',
      company_id: companyId,
      org_unit_id: parent.id,
      email: 'scoped@test.com',
      full_name: 'Scoped User',
      permissions: [],
    } as unknown as AppUser;

    const items = [
      { id: '1', company_id: companyId, org_unit_id: child.id },
      { id: '2', company_id: companyId, org_unit_id: outsider.id },
      { id: '3', company_id: companyId, org_unit_id: parent.id },
    ];

    const filtered = OrganizationScopeEngine.filterByOrganizationScope(items, user);
    expect(filtered.map(i => i.id)).toEqual(['1', '3']);
  });

  it('7. should clear scope cache when invalidateScopeCache is invoked', async () => {
    const unit = await OrganizationEngine.addUnit({ companyId, typeId: 'out-company', code: 'U1', name: 'Unit 1' });
    const user = { id: 'u1', role: 'User', company_id: companyId, org_unit_id: unit.id, email: 'u1@test.com', full_name: 'User 1', permissions: [] } as unknown as AppUser;

    const ids1 = OrganizationScopeEngine.getAccessibleOrgUnitIds(user, companyId);
    expect(ids1).toContain(unit.id);

    OrganizationScopeEngine.invalidateScopeCache();
    const ids2 = OrganizationScopeEngine.getAccessibleOrgUnitIds(user, companyId);
    expect(ids2).toContain(unit.id);
  });
});
