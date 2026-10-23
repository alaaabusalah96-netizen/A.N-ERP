import { describe, it, expect, beforeEach } from 'vitest';
import { OrganizationEngine } from './db/organizationEngine';
import { StorageEngine } from './db/storage';

describe('Phase 2: Enterprise Organization Engine Unit Tests', () => {
  beforeEach(() => {
    // Clear storage before each test
    StorageEngine.setStored('organization_unit_types', []);
    StorageEngine.setStored('organization_units', []);
    StorageEngine.setStored('organization_paths', []);
  });

  it('should load default organization unit types and allow adding custom unit types', async () => {
    const defaultTypes = OrganizationEngine.getUnitTypes();
    expect(defaultTypes.length).toBeGreaterThanOrEqual(10);

    const customType = await OrganizationEngine.addUnitType({
      companyId: 'comp-1',
      code: 'LAB',
      nameAr: 'مختبر جودة',
      nameEn: 'Quality Lab',
      level: 4,
      isActive: true,
    });

    expect(customType.id).toBeDefined();
    expect(customType.code).toBe('LAB');

    const companyTypes = OrganizationEngine.getUnitTypes('comp-1');
    expect(companyTypes.some(t => t.code === 'LAB')).toBe(true);
  });

  it('should create root and nested organization units with correct materialized path and level', async () => {
    const compId = 'comp-1';

    // 1. Create Root Holding Unit
    const holding = await OrganizationEngine.addUnit({
      companyId: compId,
      typeId: 'out-holding',
      code: 'HOLD-01',
      name: 'Kemit Group Holding',
      nameAr: 'مجموعة كيميت القابضة',
      nameEn: 'Kemit Group Holding',
    });

    expect(holding.level).toBe(0);
    expect(holding.path).toBe(`/${holding.id}`);
    expect(holding.parentId).toBeNull();

    // 2. Create Company under Holding
    const company = await OrganizationEngine.addUnit({
      companyId: compId,
      parentId: holding.id,
      typeId: 'out-company',
      code: 'COMP-01',
      name: 'Cairo Poultry Co',
    });

    expect(company.level).toBe(1);
    expect(company.path).toBe(`/${holding.id}/${company.id}`);
    expect(company.parentId).toBe(holding.id);

    // 3. Create Region under Company
    const region = await OrganizationEngine.addUnit({
      companyId: compId,
      parentId: company.id,
      typeId: 'out-region',
      code: 'REG-EAST',
      name: 'Eastern Region',
    });

    expect(region.level).toBe(2);
    expect(region.path).toBe(`/${holding.id}/${company.id}/${region.id}`);

    // 4. Create Station under Region
    const station = await OrganizationEngine.addUnit({
      companyId: compId,
      parentId: region.id,
      typeId: 'out-station',
      code: 'STN-SINA',
      name: 'Sina 2000 Station',
      metadata: { custodyAmount: 250000 },
    });

    expect(station.level).toBe(3);
    expect(station.path).toBe(`/${holding.id}/${company.id}/${region.id}/${station.id}`);
    expect(station.metadata.custodyAmount).toBe(250000);

    // Check organization paths
    const pathObj = OrganizationEngine.getPathByUnitId(station.id);
    expect(pathObj).not.toBeNull();
    expect(pathObj?.depth).toBe(3);
    expect(pathObj?.ancestorIds).toEqual([holding.id, company.id, region.id]);
  });

  it('should query children, subtrees, and ancestors correctly', async () => {
    const compId = 'comp-1';

    const root = await OrganizationEngine.addUnit({ companyId: compId, typeId: 'out-company', code: 'ROOT', name: 'Root Corp' });
    const sectorA = await OrganizationEngine.addUnit({ companyId: compId, parentId: root.id, typeId: 'out-sector', code: 'SEC-A', name: 'Sector A' });
    const sectorB = await OrganizationEngine.addUnit({ companyId: compId, parentId: root.id, typeId: 'out-sector', code: 'SEC-B', name: 'Sector B' });
    const branchA1 = await OrganizationEngine.addUnit({ companyId: compId, parentId: sectorA.id, typeId: 'out-branch', code: 'BR-A1', name: 'Branch A1' });

    // Children of Root
    const rootChildren = OrganizationEngine.getUnitChildren(root.id, compId);
    expect(rootChildren.length).toBe(2);
    expect(rootChildren.map(c => c.id).sort()).toEqual([sectorA.id, sectorB.id].sort());

    // Subtree of Sector A
    const subtreeA = OrganizationEngine.getUnitSubtree(sectorA.id);
    expect(subtreeA.length).toBe(2); // Sector A itself + Branch A1
    expect(subtreeA.map(u => u.id)).toContain(branchA1.id);

    // Ancestors of Branch A1
    const ancestors = OrganizationEngine.getUnitAncestors(branchA1.id);
    expect(ancestors.map(a => a.id)).toEqual([root.id, sectorA.id]);
  });

  it('should dynamically update subtree paths when a unit is reparented', async () => {
    const compId = 'comp-1';

    const root1 = await OrganizationEngine.addUnit({ companyId: compId, typeId: 'out-company', code: 'ROOT-1', name: 'Root 1' });
    const root2 = await OrganizationEngine.addUnit({ companyId: compId, typeId: 'out-company', code: 'ROOT-2', name: 'Root 2' });

    const sector = await OrganizationEngine.addUnit({ companyId: compId, parentId: root1.id, typeId: 'out-sector', code: 'SEC-1', name: 'Sector 1' });
    const branch = await OrganizationEngine.addUnit({ companyId: compId, parentId: sector.id, typeId: 'out-branch', code: 'BR-1', name: 'Branch 1' });

    expect(branch.path).toBe(`/${root1.id}/${sector.id}/${branch.id}`);

    // Reparent sector from Root 1 to Root 2
    await OrganizationEngine.updateUnit(sector.id, { parentId: root2.id });

    const updatedSector = OrganizationEngine.getUnitById(sector.id);
    const updatedBranch = OrganizationEngine.getUnitById(branch.id);

    expect(updatedSector?.path).toBe(`/${root2.id}/${sector.id}`);
    expect(updatedBranch?.path).toBe(`/${root2.id}/${sector.id}/${branch.id}`);
    expect(updatedBranch?.level).toBe(2);

    const updatedBranchPath = OrganizationEngine.getPathByUnitId(branch.id);
    expect(updatedBranchPath?.ancestorIds).toEqual([root2.id, sector.id]);
  });

  it('should enforce deletion constraints on units with active children', async () => {
    const compId = 'comp-1';

    const root = await OrganizationEngine.addUnit({ companyId: compId, typeId: 'out-company', code: 'ROOT', name: 'Root Corp' });
    const child = await OrganizationEngine.addUnit({ companyId: compId, parentId: root.id, typeId: 'out-sector', code: 'CHILD', name: 'Child Unit' });

    await expect(OrganizationEngine.deleteUnit(root.id)).rejects.toThrowError(/Cannot delete organization unit/);

    // Delete child first, then root
    const deletedChild = await OrganizationEngine.deleteUnit(child.id);
    expect(deletedChild).toBe(true);

    const deletedRoot = await OrganizationEngine.deleteUnit(root.id);
    expect(deletedRoot).toBe(true);
  });

  describe('Phase 3: Organization Templates Unit Tests', () => {
    beforeEach(() => {
      StorageEngine.setStored('organization_templates', []);
    });

    it('should provide predefined industry templates (Trading, Manufacturing, Poultry, Construction, Healthcare, Retail, Restaurants, Holding, Educational)', () => {
      const templates = OrganizationEngine.getTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(9);

      const categories = templates.map(t => t.category);
      expect(categories).toContain('Trading');
      expect(categories).toContain('Manufacturing');
      expect(categories).toContain('Poultry');
      expect(categories).toContain('Construction');
      expect(categories).toContain('Healthcare');
      expect(categories).toContain('Retail');
      expect(categories).toContain('Restaurants');
      expect(categories).toContain('Holding Company');
      expect(categories).toContain('Educational');
    });

    it('should allow administrators to build custom templates', async () => {
      const customTpl = await OrganizationEngine.addCustomTemplate({
        code: 'CUSTOM_LOGISTICS',
        nameAr: 'هيكل شركة شحن ولوجستيات مخصص',
        nameEn: 'Custom Logistics Template',
        descriptionAr: 'هيكل خاص بأسطول النقل والمراكز اللوجستية',
        descriptionEn: 'Custom template for logistics fleet and distribution hubs',
        category: 'Custom',
        companyId: 'comp-1',
        units: [
          { tempKey: 'hq', parentTempKey: null, typeCode: 'COMPANY', codePrefix: 'LOG-HQ', nameAr: 'المقر اللوجستي الرئيسي', nameEn: 'Logistics Main HQ' },
          { tempKey: 'hub_1', parentTempKey: 'hq', typeCode: 'STATION', codePrefix: 'HUB-01', nameAr: 'مركز التجميع اللوجستي 1', nameEn: 'Logistics Distribution Hub 1' },
        ],
      });

      expect(customTpl.id).toBeDefined();
      expect(customTpl.isPredefined).toBe(false);

      const fetched = OrganizationEngine.getTemplateById(customTpl.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.code).toBe('CUSTOM_LOGISTICS');
    });

    it('should apply an industry template to a company and correctly instantiate all hierarchy units & paths', async () => {
      const compId = 'comp-poultry-100';

      // Apply Poultry Template to Poultry Company
      const createdUnits = await OrganizationEngine.applyTemplateToCompany(compId, 'tpl-poultry', 'شركة الوطنية للإنتاج الداجني');

      expect(createdUnits.length).toBe(6); // 1 HQ + 2 Sectors + 1 Station + 2 Farms

      const rootUnit = createdUnits.find(u => u.parentId === null);
      expect(rootUnit).toBeDefined();
      expect(rootUnit?.nameAr).toBe('شركة الوطنية للإنتاج الداجني');
      expect(rootUnit?.companyId).toBe(compId);

      // Check hierarchy paths for farm
      const farmUnit = createdUnits.find(u => u.metadata.specTempKey === 'farm_salam_1');
      expect(farmUnit).toBeDefined();
      expect(farmUnit?.level).toBe(3);

      const ancestors = OrganizationEngine.getUnitAncestors(farmUnit!.id);
      expect(ancestors.length).toBe(3);
      expect(ancestors[0].id).toBe(rootUnit!.id);
    });
  });

  describe('Phase 4: Dynamic Organization Builder (Unlimited Hierarchy)', () => {
    const compId = 'comp-builder-deep-tree';

    beforeEach(() => {
      StorageEngine.setStored('organization_units', []);
      StorageEngine.setStored('organization_paths', []);
    });

    it('should support creating arbitrary deep structures without depth limits (6+ levels deep)', async () => {
      // Level 0: Holding
      const holding = await OrganizationEngine.addUnit({ companyId: compId, typeId: 'out-holding', code: 'HOLDING-01', name: 'Global Group' });
      // Level 1: Company
      const company = await OrganizationEngine.addUnit({ companyId: compId, parentId: holding.id, typeId: 'out-company', code: 'COMP-01', name: 'Industrial Corp' });
      // Level 2: Sector
      const sector = await OrganizationEngine.addUnit({ companyId: compId, parentId: company.id, typeId: 'out-sector', code: 'SEC-01', name: 'Agri Sector' });
      // Level 3: Region
      const region = await OrganizationEngine.addUnit({ companyId: compId, parentId: sector.id, typeId: 'out-region', code: 'REG-01', name: 'Delta Region' });
      // Level 4: Station
      const station = await OrganizationEngine.addUnit({ companyId: compId, parentId: region.id, typeId: 'out-station', code: 'STN-01', name: 'Tanta Station' });
      // Level 5: Farm
      const farm = await OrganizationEngine.addUnit({ companyId: compId, parentId: station.id, typeId: 'out-farm', code: 'FRM-01', name: 'Farm Alpha' });
      // Level 6: Shift Unit
      const unitShift = await OrganizationEngine.addUnit({ companyId: compId, parentId: farm.id, typeId: 'out-unit', code: 'SFT-01', name: 'Morning Shift' });

      expect(holding.level).toBe(0);
      expect(company.level).toBe(1);
      expect(sector.level).toBe(2);
      expect(region.level).toBe(3);
      expect(station.level).toBe(4);
      expect(farm.level).toBe(5);
      expect(unitShift.level).toBe(6);

      expect(OrganizationEngine.getMaxHierarchyDepth(compId)).toBe(6);
      expect(OrganizationEngine.getUnitsAtLevel(compId, 6).length).toBe(1);
      expect(OrganizationEngine.getUnitsAtLevel(compId, 6)[0].id).toBe(unitShift.id);
    });

    it('should correctly build a nested tree structure (buildTree) and flat indented view (getTreeFlatView)', async () => {
      const root = await OrganizationEngine.addUnit({ companyId: compId, typeId: 'out-company', code: 'ROOT', name: 'Root Corp' });
      const secA = await OrganizationEngine.addUnit({ companyId: compId, parentId: root.id, typeId: 'out-sector', code: 'SEC-A', name: 'Sector A' });
      const secB = await OrganizationEngine.addUnit({ companyId: compId, parentId: root.id, typeId: 'out-sector', code: 'SEC-B', name: 'Sector B' });
      const brA1 = await OrganizationEngine.addUnit({ companyId: compId, parentId: secA.id, typeId: 'out-branch', code: 'BR-A1', name: 'Branch A1' });

      const tree = OrganizationEngine.buildTree(compId);
      expect(tree.length).toBe(1); // 1 root node
      expect(tree[0].id).toBe(root.id);
      expect(tree[0].children.length).toBe(2); // Sec A & Sec B

      const secANode = tree[0].children.find(c => c.id === secA.id);
      expect(secANode).toBeDefined();
      expect(secANode?.children.length).toBe(1);
      expect(secANode?.children[0].id).toBe(brA1.id);

      const flatView = OrganizationEngine.getTreeFlatView(compId);
      expect(flatView.length).toBe(4);
      expect(flatView[0].id).toBe(root.id);
      expect(flatView[0].depthIndent).toBe(0);
      expect(flatView[1].depthIndent).toBe(1);
    });

    it('should support dynamic reparenting (moveUnit) and prevent cycle creation', async () => {
      const root = await OrganizationEngine.addUnit({ companyId: compId, typeId: 'out-company', code: 'ROOT', name: 'Root Corp' });
      const sec1 = await OrganizationEngine.addUnit({ companyId: compId, parentId: root.id, typeId: 'out-sector', code: 'SEC-1', name: 'Sector 1' });
      const sec2 = await OrganizationEngine.addUnit({ companyId: compId, parentId: root.id, typeId: 'out-sector', code: 'SEC-2', name: 'Sector 2' });
      const br1 = await OrganizationEngine.addUnit({ companyId: compId, parentId: sec1.id, typeId: 'out-branch', code: 'BR-1', name: 'Branch 1' });

      // Move br1 from sec1 to sec2
      const movedBr1 = await OrganizationEngine.moveUnit(br1.id, sec2.id);
      expect(movedBr1.parentId).toBe(sec2.id);
      expect(movedBr1.level).toBe(2);

      const br1Ancestors = OrganizationEngine.getUnitAncestors(br1.id);
      expect(br1Ancestors.some(a => a.id === sec2.id)).toBe(true);

      // Attempt invalid move: moving root under sec2 (would create a cycle)
      await expect(OrganizationEngine.moveUnit(root.id, sec2.id)).rejects.toThrowError(/Cannot move unit/);
    });

    it('should validate hierarchy integrity (validateHierarchyTree) and report errors', async () => {
      const root = await OrganizationEngine.addUnit({ companyId: compId, typeId: 'out-company', code: 'ROOT', name: 'Root Corp' });
      const child = await OrganizationEngine.addUnit({ companyId: compId, parentId: root.id, typeId: 'out-sector', code: 'CHILD', name: 'Child Unit' });

      const auditResult = OrganizationEngine.validateHierarchyTree(compId);
      expect(auditResult.isValid).toBe(true);
      expect(auditResult.totalUnits).toBe(2);
      expect(auditResult.maxDepth).toBe(1);
      expect(auditResult.errors.length).toBe(0);
    });
  });
});


