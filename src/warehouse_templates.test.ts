import { describe, it, expect, beforeEach } from 'vitest';
import { WarehouseTemplateEngine } from './db/warehouseTemplateEngine';
import { WarehouseHierarchyEngine } from './db/warehouseHierarchyEngine';
import { InventoryModule } from './db/inventory';
import { StorageEngine } from './db/storage';

describe('Phase 6: Dynamic Warehouse Templates Unit Tests', () => {
  const companyId = 'comp-wh-template-test';

  beforeEach(() => {
    StorageEngine.setStored('warehouses', []);
    StorageEngine.setStored('warehouse_types', []);
    StorageEngine.setStored('warehouse_templates', []);
  });

  it('should provide predefined warehouse templates for Factory, Trading, Retail, Restaurant, Poultry, and Custom', () => {
    const templates = WarehouseTemplateEngine.getWarehouseTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(6);

    const codes = templates.map(t => t.code);
    expect(codes).toContain('FACTORY');
    expect(codes).toContain('TRADING');
    expect(codes).toContain('RETAIL');
    expect(codes).toContain('RESTAURANT');
    expect(codes).toContain('POULTRY');
    expect(codes).toContain('CUSTOM');
  });

  it('should allow adding custom company-specific warehouse templates', () => {
    const customTpl = WarehouseTemplateEngine.addWarehouseTemplate({
      code: 'PHARMA',
      nameAr: 'قالب الهيكل المخزني للصيدليات والأدوية',
      nameEn: 'Pharmacy & Pharmaceutical Template',
      descriptionAr: 'هيكل مخزني مخصص للأدوية والمستلزمات الطبية مع تبريد مراقب',
      descriptionEn: 'Cold chain pharmacy & medical supplies layout',
      companyId,
      isActive: true,
      nodes: [
        {
          codeSuffix: 'MAIN_PHARMA',
          nameAr: 'المستودع الرئيسي للأدوية',
          nameEn: 'Main Pharma Warehouse',
          typeCode: 'MAIN',
          children: [
            {
              codeSuffix: 'COLD_CHAIN',
              nameAr: 'مستودع التبريد العالي للأنسولين والأطعمة الطبية',
              nameEn: 'Cold Chain Controlled Store',
              typeCode: 'RAW_MATERIAL',
            },
            {
              codeSuffix: 'EXPIRED',
              nameAr: 'مستودع المرتجعات والأدوية منتهية الصلاحية',
              nameEn: 'Expired & Quarantine Goods Store',
              typeCode: 'RETURNS',
            },
          ],
        },
      ],
    });

    expect(customTpl.id).toBeDefined();
    expect(customTpl.code).toBe('PHARMA');

    const companyTemplates = WarehouseTemplateEngine.getWarehouseTemplates(companyId);
    expect(companyTemplates.some(t => t.code === 'PHARMA')).toBe(true);
  });

  it('should instantiate Factory Warehouse Template into concrete hierarchical warehouses', async () => {
    const createdWarehouses = await WarehouseTemplateEngine.instantiateWarehouseTemplate({
      templateId: 'wh-tpl-factory',
      companyId,
      org_unit_id: 'org-unit-factory-10',
      namePrefixAr: 'مصنع العاشر',
      namePrefixEn: '10th Factory',
      codePrefix: 'F10',
    });

    expect(createdWarehouses.length).toBe(7); // Main + 6 child stores

    // Find main warehouse
    const mainWh = createdWarehouses.find(w => w.type_code === 'MAIN');
    expect(mainWh).toBeDefined();
    expect(mainWh?.name).toContain('مصنع العاشر');
    expect(mainWh?.code).toBe('F10-MAIN');
    expect(mainWh?.org_unit_id).toBe('org-unit-factory-10');
    expect(mainWh?.level).toBe(0);

    // Verify raw material child store
    const rawWh = createdWarehouses.find(w => w.type_code === 'RAW_MATERIAL');
    expect(rawWh).toBeDefined();
    expect(rawWh?.parent_id).toBe(mainWh?.id);
    expect(rawWh?.level).toBe(1);
    expect(rawWh?.path).toBe(`/${mainWh?.id}/${rawWh?.id}`);

    // Verify finished goods store
    const fgWh = createdWarehouses.find(w => w.type_code === 'FINISHED_GOODS');
    expect(fgWh).toBeDefined();
    expect(fgWh?.parent_id).toBe(mainWh?.id);

    // Verify tree representation
    const tree = WarehouseHierarchyEngine.buildWarehouseTree(companyId);
    const rootNode = tree.find(n => n.id === mainWh?.id);
    expect(rootNode).toBeDefined();
    expect(rootNode?.children.length).toBe(6);
  });

  it('should instantiate Retail Warehouse Template with showroom and backroom stores', async () => {
    const createdWarehouses = await WarehouseTemplateEngine.instantiateWarehouseTemplate({
      templateId: 'wh-tpl-retail',
      companyId,
      namePrefixAr: 'فرع المعادي',
      namePrefixEn: 'Maadi Branch',
      codePrefix: 'MAADI',
    });

    expect(createdWarehouses.length).toBe(4); // Main + Showroom + Backroom + Store Returns

    const mainWh = createdWarehouses.find(w => w.type_code === 'MAIN');
    expect(mainWh).toBeDefined();
    expect(mainWh?.code).toBe('MAADI-STORE_MAIN');

    const showroomWh = createdWarehouses.find(w => w.code === 'MAADI-SHOWROOM');
    expect(showroomWh).toBeDefined();
    expect(showroomWh?.parent_id).toBe(mainWh?.id);
  });

  it('should instantiate Restaurant Warehouse Template with cold storage and prep kitchen', async () => {
    const createdWarehouses = await WarehouseTemplateEngine.instantiateWarehouseTemplate({
      templateId: 'wh-tpl-restaurant',
      companyId,
      namePrefixAr: 'فرع نصر سيتي',
      namePrefixEn: 'Nasr City Branch',
      codePrefix: 'NASR',
    });

    expect(createdWarehouses.length).toBe(5); // Commissary + Cold + Prep + Dry + Waste

    const coldWh = createdWarehouses.find(w => w.code === 'NASR-FREEZER_COLD');
    expect(coldWh).toBeDefined();
    expect(coldWh?.type_code).toBe('RAW_MATERIAL');

    const prepWh = createdWarehouses.find(w => w.code === 'NASR-PREP_KITCHEN');
    expect(prepWh).toBeDefined();
    expect(prepWh?.type_code).toBe('PRODUCTION');
  });
});
