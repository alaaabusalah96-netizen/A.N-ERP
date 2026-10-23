import { describe, it, expect, beforeEach } from 'vitest';
import { InventoryModule } from './db/inventory';
import { OrganizationEngine } from './db/organizationEngine';
import { CostCenterEngine } from './db/costCenterEngine';
import { CompaniesModule } from './db/companies';
import { StorageEngine } from './db/storage';
import { Warehouse, Product } from './types/inventory';
import { OrganizationUnit } from './types/organization';

describe('Phase 12: Inventory Organization Unit Migration & Integration Tests', () => {
  const companyId = 'comp-phase12-test';

  beforeEach(async () => {
    const store: Record<string, string> = {};
    globalThis.localStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => { store[key] = val; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
      length: 0,
      key: () => null
    } as any;

    StorageEngine.clearCache();
    StorageEngine.cache['active_user'] = {
      id: 'admin-p12',
      email: 'admin@p12.com',
      full_name: 'Phase 12 Admin',
      role: 'SystemAdmin',
      company_id: companyId,
      is_active: true
    } as any;

    // 1. Setup Company
    CompaniesModule.saveCompanies([
      { id: companyId, name: 'Phase 12 Test Co' } as any
    ]);
    CompaniesModule.setSelectedCompanyId(companyId);

    // 2. Setup Organization Tree
    // Root: HQ (org-hq)
    // Children: Sector North (org-north), Sector South (org-south)
    // Sub-child: Branch Alex (org-alex) under org-north
    const units: OrganizationUnit[] = [
      {
        id: 'org-hq',
        companyId,
        typeId: 'type-hq',
        code: 'ORG-HQ',
        name: 'Headquarters',
        nameAr: 'المقاطعة المركزية',
        nameEn: 'Headquarters',
        parentId: null,
        path: '/org-hq/',
        level: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as any,
      {
        id: 'org-north',
        companyId,
        typeId: 'type-sector',
        code: 'ORG-NORTH',
        name: 'North Sector',
        nameAr: 'قطاع الشمال',
        nameEn: 'North Sector',
        parentId: 'org-hq',
        path: '/org-hq/org-north/',
        level: 2,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as any,
      {
        id: 'org-alex',
        companyId,
        typeId: 'type-branch',
        code: 'ORG-ALEX',
        name: 'Alexandria Branch',
        nameAr: 'فرع الإسكندرية',
        nameEn: 'Alexandria Branch',
        parentId: 'org-north',
        path: '/org-hq/org-north/org-alex/',
        level: 3,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as any
    ];
    await OrganizationEngine.saveUnits(units);

    // 3. Setup Cost Center linked to Org Unit
    CostCenterEngine.saveCostCenters([
      {
        id: 'cc-alex',
        company_id: companyId,
        code: 'CC-ALEX-01',
        nameAr: 'مركز تكلفة الإسكندرية',
        nameEn: 'Alex Cost Center',
        org_unit_id: 'org-alex'
      } as any
    ]);

    // 4. Setup Warehouses linked to Org Units
    const warehouses: Warehouse[] = [
      {
        id: 'wh-hq',
        name: 'HQ Central Warehouse',
        code: 'WH-HQ',
        is_active: true,
        company_id: companyId,
        org_unit_id: 'org-hq',
        receiving_approval_workflow: false
      },
      {
        id: 'wh-alex',
        name: 'Alexandria Branch Warehouse',
        code: 'WH-ALEX',
        is_active: true,
        company_id: companyId,
        org_unit_id: 'org-alex',
        receiving_approval_workflow: false
      }
    ];
    await InventoryModule.saveWarehouses(warehouses);

    // 5. Setup Product
    const products: Product[] = [
      {
        id: 'prod-item-1',
        name: 'Engine Oil 5W30',
        code: 'PRD-OIL-01',
        unit: 'Bottle',
        min_stock_level: 10,
        last_purchase_price: 500,
        company_id: companyId,
        is_active: true
      } as any
    ];
    InventoryModule.saveProducts(products);
  });

  it('should correctly resolve linked Organization Unit for a warehouse', () => {
    const hqOrgUnit = InventoryModule.resolveWarehouseOrgUnit('wh-hq', companyId);
    expect(hqOrgUnit).toBe('org-hq');

    const alexOrgUnit = InventoryModule.resolveWarehouseOrgUnit('wh-alex', companyId);
    expect(alexOrgUnit).toBe('org-alex');
  });

  it('should retrieve warehouses matching an Organization Unit subtree', () => {
    // North Sector includes Alex Branch warehouse when sub-units are included
    const northWarehouses = InventoryModule.getWarehousesByOrgUnit(companyId, 'org-north', true);
    expect(northWarehouses.map(w => w.id)).toContain('wh-alex');

    // HQ includes both HQ and Alex Branch warehouses when sub-units are included
    const hqWarehouses = InventoryModule.getWarehousesByOrgUnit(companyId, 'org-hq', true);
    expect(hqWarehouses.map(w => w.id)).toEqual(expect.arrayContaining(['wh-hq', 'wh-alex']));
  });

  it('should auto-populate org_unit_id and derived cost_center_id when creating inventory documents & movements', async () => {
    // Create stock receipt for Alex Warehouse
    const docData: any = {
      doc_type: 'Receipt' as const,
      source_warehouse_id: 'wh-alex',
      date: '2026-07-24',
      tenantId: companyId,
      supplier_name: 'Shell Supplier',
      statement: 'Direct Receipt to Alex Warehouse',
      items: [
        { product_id: 'prod-item-1', product_code: 'PRD-OIL-01', product_name: 'Engine Oil 5W30', unit: 'Bottle', qty: 100, last_purchase_price: 500 }
      ]
    };

    const doc = await InventoryModule.addInventoryDocument(docData);
    expect(doc.org_unit_id).toBe('org-alex');

    // Approve & Post document
    doc.status = 'Posted';
    await InventoryModule.saveInventoryDocuments([doc]);

    // Force stock movement and ledger generation
    await InventoryModule.processDocumentStage(doc.id, 'Posted', 'user-admin');

    const movements = InventoryModule.getStockMovements().filter(m => m.doc_id === doc.id);
    expect(movements.length).toBeGreaterThan(0);
    expect(movements[0].org_unit_id).toBe('org-alex');

    const ledger = InventoryModule.getInventoryLedger().filter(l => l.reference_document_id === doc.id);
    expect(ledger.length).toBeGreaterThan(0);
    expect(ledger[0].org_unit_id).toBe('org-alex');
    expect(ledger[0].cost_center_id).toBe('cc-alex');
  });

  it('should calculate stock levels grouped by Organization Unit subtree', async () => {
    // Stock 50 at HQ, 30 at Alex
    await InventoryModule.adjustStock('wh-hq', 'prod-item-1', 50, 'Receipt', 'user-1');
    await InventoryModule.adjustStock('wh-alex', 'prod-item-1', 30, 'Receipt', 'user-1');

    // Check stock for Alex Org Unit (30)
    const alexStock = InventoryModule.getOrgUnitStock(companyId, 'org-alex', 'prod-item-1', true);
    expect(alexStock).toBe(30);

    // Check stock for North Sector Org Unit (includes Alex = 30)
    const northStock = InventoryModule.getOrgUnitStock(companyId, 'org-north', 'prod-item-1', true);
    expect(northStock).toBe(30);

    // Check stock for HQ Org Unit (includes HQ + Alex = 80)
    const hqStock = InventoryModule.getOrgUnitStock(companyId, 'org-hq', 'prod-item-1', true);
    expect(hqStock).toBe(80);
  });
});
