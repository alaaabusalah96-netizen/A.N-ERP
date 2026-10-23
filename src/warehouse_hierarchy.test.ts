import { describe, it, expect, beforeEach } from 'vitest';
import { WarehouseHierarchyEngine } from './db/warehouseHierarchyEngine';
import { InventoryModule } from './db/inventory';
import { StorageEngine } from './db/storage';

describe('Phase 5: Warehouse Hierarchy Engine Unit Tests', () => {
  const companyId = 'comp-wh-hierarchy-test';

  beforeEach(() => {
    StorageEngine.setStored('warehouses', []);
    StorageEngine.setStored('warehouse_types', []);
    StorageEngine.setStored('warehouse_bins', []);
    StorageEngine.setStored('stock_movements', []);
  });

  it('should provide predefined warehouse types (Main, Sub, Production, Raw Material, Finished Goods, Returns, Damaged, Transit, Spare Parts)', () => {
    const types = WarehouseHierarchyEngine.getWarehouseTypes();
    expect(types.length).toBeGreaterThanOrEqual(9);

    const codes = types.map(t => t.code);
    expect(codes).toContain('MAIN');
    expect(codes).toContain('SUB');
    expect(codes).toContain('PRODUCTION');
    expect(codes).toContain('RAW_MATERIAL');
    expect(codes).toContain('FINISHED_GOODS');
    expect(codes).toContain('RETURNS');
    expect(codes).toContain('DAMAGED');
    expect(codes).toContain('TRANSIT');
    expect(codes).toContain('SPARE_PARTS');
  });

  it('should allow creating custom company-specific warehouse types', async () => {
    const customType = await WarehouseHierarchyEngine.addWarehouseType({
      code: 'COLD_STORAGE',
      nameAr: 'مستودع تبريد وتجميد',
      nameEn: 'Cold Storage Warehouse',
      descriptionAr: 'مستودع الأغذية والمواد الحساسة للحرارة',
      companyId,
      isActive: true,
    });

    expect(customType.id).toBeDefined();
    expect(customType.code).toBe('COLD_STORAGE');

    const companyTypes = WarehouseHierarchyEngine.getWarehouseTypes(companyId);
    expect(companyTypes.some(t => t.code === 'COLD_STORAGE')).toBe(true);
  });

  it('should create hierarchical parent and sub-warehouses linked to Organization Units', async () => {
    // Root Main Warehouse
    const mainWh = await WarehouseHierarchyEngine.addWarehouse({
      name: 'المستودع الرئيسي للمركز',
      code: 'WH-MAIN-01',
      is_active: true,
      company_id: companyId,
      receiving_approval_workflow: true,
      type_code: 'MAIN',
      org_unit_id: 'org-unit-cairo-hq',
    });

    expect(mainWh.level).toBe(0);
    expect(mainWh.path).toBe(`/${mainWh.id}`);

    // Sub Raw Material Warehouse
    const rawWh = await WarehouseHierarchyEngine.addWarehouse({
      name: 'مستودع المواد الخام A',
      code: 'WH-RAW-A',
      is_active: true,
      company_id: companyId,
      receiving_approval_workflow: false,
      parent_id: mainWh.id,
      type_code: 'RAW_MATERIAL',
      org_unit_id: 'org-unit-factory-1',
    });

    expect(rawWh.level).toBe(1);
    expect(rawWh.path).toBe(`/${mainWh.id}/${rawWh.id}`);

    // Sub Production Line Warehouse
    const prodWh = await WarehouseHierarchyEngine.addWarehouse({
      name: 'مستودع صالة خط التجميع 1',
      code: 'WH-LINE-1',
      is_active: true,
      company_id: companyId,
      receiving_approval_workflow: false,
      parent_id: rawWh.id,
      type_code: 'PRODUCTION',
      org_unit_id: 'org-unit-line-1',
    });

    expect(prodWh.level).toBe(2);
    expect(prodWh.path).toBe(`/${mainWh.id}/${rawWh.id}/${prodWh.id}`);
  });

  it('should construct a nested tree view (buildWarehouseTree)', async () => {
    const mainWh = await WarehouseHierarchyEngine.addWarehouse({
      name: 'المستودع المركزي',
      code: 'WH-CENTRAL',
      is_active: true,
      company_id: companyId,
      receiving_approval_workflow: true,
      type_code: 'MAIN',
    });

    const fgWh = await WarehouseHierarchyEngine.addWarehouse({
      name: 'مستودع المنتجات التامة',
      code: 'WH-FG',
      is_active: true,
      company_id: companyId,
      receiving_approval_workflow: false,
      parent_id: mainWh.id,
      type_code: 'FINISHED_GOODS',
    });

    const tree = WarehouseHierarchyEngine.buildWarehouseTree(companyId);
    const mainNode = tree.find(n => n.id === mainWh.id);
    expect(mainNode).toBeDefined();
    expect(mainNode?.children.length).toBe(1);
    expect(mainNode?.children[0].id).toBe(fgWh.id);
  });

  it('should support dynamic reparenting (moveWarehouse) and prevent cycles', async () => {
    const root = await WarehouseHierarchyEngine.addWarehouse({ name: 'Root WH', code: 'W-R', company_id: companyId, is_active: true, receiving_approval_workflow: false });
    const sub1 = await WarehouseHierarchyEngine.addWarehouse({ name: 'Sub 1 WH', code: 'W-S1', parent_id: root.id, company_id: companyId, is_active: true, receiving_approval_workflow: false });
    const sub2 = await WarehouseHierarchyEngine.addWarehouse({ name: 'Sub 2 WH', code: 'W-S2', parent_id: root.id, company_id: companyId, is_active: true, receiving_approval_workflow: false });

    // Move sub1 under sub2
    const movedSub1 = await WarehouseHierarchyEngine.moveWarehouse(sub1.id, sub2.id, companyId);
    expect(movedSub1.parent_id).toBe(sub2.id);
    expect(movedSub1.level).toBe(2);

    // Try moving root under sub1 (cycle error)
    await expect(async () => await WarehouseHierarchyEngine.moveWarehouse(root.id, sub1.id, companyId)).rejects.toThrowError(/Cannot move warehouse/);
  });

  it('should rollup inclusive stock across parent and descendant sub-warehouses', async () => {
    const mainWh = await WarehouseHierarchyEngine.addWarehouse({ name: 'Main Hub', code: 'HUB-M', company_id: companyId, is_active: true, receiving_approval_workflow: false });
    const subWh = await WarehouseHierarchyEngine.addWarehouse({ name: 'Sub Store', code: 'HUB-S', parent_id: mainWh.id, company_id: companyId, is_active: true, receiving_approval_workflow: false });

    const prodId = 'prod-test-oil';

    // Adjust stock in main warehouse (100 units)
    await InventoryModule.adjustStock(mainWh.id, prodId, 100, 'Receipt', 'user-1');

    // Adjust stock in sub warehouse (50 units)
    await InventoryModule.adjustStock(subWh.id, prodId, 50, 'Receipt', 'user-1');

    // Direct stock checks
    expect(InventoryModule.getProductStockInWarehouse(mainWh.id, prodId)).toBe(100);
    expect(InventoryModule.getProductStockInWarehouse(subWh.id, prodId)).toBe(50);

    // Inclusive stock check (Main Hub inclusive = 100 + 50 = 150)
    const inclusiveStock = WarehouseHierarchyEngine.getWarehouseInclusiveStock(mainWh.id, prodId, companyId);
    expect(inclusiveStock).toBe(150);
  });

  it('should validate warehouse hierarchy integrity without errors', async () => {
    const mainWh = await WarehouseHierarchyEngine.addWarehouse({ name: 'Main', code: 'M', company_id: companyId, is_active: true, receiving_approval_workflow: false });
    await WarehouseHierarchyEngine.addWarehouse({ name: 'Sub', code: 'S', parent_id: mainWh.id, company_id: companyId, is_active: true, receiving_approval_workflow: false });

    const validation = WarehouseHierarchyEngine.validateWarehouseHierarchy(companyId);
    expect(validation.isValid).toBe(true);
    expect(validation.totalWarehouses).toBeGreaterThanOrEqual(2);
    expect(validation.errors.length).toBe(0);
  });
});
