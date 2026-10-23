import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageEngine } from './db/storage';
import * as offlineQueue from './db/offlineQueue';

import { CompaniesModule } from './db/companies';
import { StationsModule } from './db/stations';
import { BusinessGroupsModule } from './db/businessGroups';
import { TransactionsModule } from './db/transactions';
import { ApprovalEngine } from './db/approvalEngine';
import { OrganizationEngine } from './db/organizationEngine';
import { WarehouseHierarchyEngine } from './db/warehouseHierarchyEngine';
import { InventoryModule } from './db/inventory';

describe('Phase I: Regression Protection — Write-Order Guard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    // Default mock: fail cloud sync
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: false,
      syncedToFirestore: false,
      queuedOffline: false,
      error: 'Simulated network or permission failure'
    });
  });

  it('CompaniesModule.saveCompanies does not modify storage on failure', async () => {
    StorageEngine.setStored('companies', [{ id: 'comp-1', company_name: 'Existing Company' }]);
    const setStoredSpy = vi.spyOn(StorageEngine, 'setStored');

    const res = await CompaniesModule.saveCompanies([{ id: 'comp-2', company_name: 'New Company' } as any]);
    expect(res.success).toBe(false);

    expect(setStoredSpy).not.toHaveBeenCalledWith('companies', expect.arrayContaining([
      expect.objectContaining({ id: 'comp-2' })
    ]));
    expect(CompaniesModule.getCompanies()[0].id).toBe('comp-1');
  });

  it('StationsModule.saveRegions does not modify storage on failure', async () => {
    StorageEngine.setStored('regions', [{ id: 'reg-1', name: 'Existing Region' }]);
    const setStoredSpy = vi.spyOn(StorageEngine, 'setStored');

    const res = await StationsModule.saveRegions([{ id: 'reg-2', name: 'New Region' } as any]);
    expect(res.success).toBe(false);

    expect(setStoredSpy).not.toHaveBeenCalledWith('regions', expect.arrayContaining([
      expect.objectContaining({ id: 'reg-2' })
    ]));
  });

  it('StationsModule.saveStations does not modify storage on failure', async () => {
    StorageEngine.setStored('stations', [{ id: 'stn-1', name: 'Existing Station' }]);
    const setStoredSpy = vi.spyOn(StorageEngine, 'setStored');

    const res = await StationsModule.saveStations([{ id: 'stn-2', name: 'New Station' } as any]);
    expect(res.success).toBe(false);

    expect(setStoredSpy).not.toHaveBeenCalledWith('stations', expect.arrayContaining([
      expect.objectContaining({ id: 'stn-2' })
    ]));
  });

  it('BusinessGroupsModule.saveGroups does not modify storage on failure', async () => {
    StorageEngine.setStored('business_groups', [{ id: 'bg-1', nameAr: 'Group 1' }]);
    const setStoredSpy = vi.spyOn(StorageEngine, 'setStored');

    const res = await BusinessGroupsModule.saveGroups([{ id: 'bg-2', nameAr: 'Group 2' } as any]);
    expect(res.success).toBe(false);

    expect(setStoredSpy).not.toHaveBeenCalledWith('business_groups', expect.arrayContaining([
      expect.objectContaining({ id: 'bg-2' })
    ]));
  });

  it('TransactionsModule.saveCategories does not modify storage on failure', async () => {
    StorageEngine.setStored('expense_categories', [{ id: 'cat-1', name: 'Category 1' }]);
    const setStoredSpy = vi.spyOn(StorageEngine, 'setStored');

    const res = await TransactionsModule.saveCategories([{ id: 'cat-2', name: 'Category 2' } as any]);
    expect(res.success).toBe(false);

    expect(setStoredSpy).not.toHaveBeenCalledWith('expense_categories', expect.arrayContaining([
      expect.objectContaining({ id: 'cat-2' })
    ]));
  });

  it('ApprovalEngine.saveWorkflow does not modify storage on failure', async () => {
    StorageEngine.setStored('approval_workflows', [{ id: 'wf-1', name: 'Workflow 1' }]);
    const setStoredSpy = vi.spyOn(StorageEngine, 'setStored');

    const res = await ApprovalEngine.saveWorkflow({ id: 'wf-2', name: 'Workflow 2', companyId: 'comp-1' } as any);
    expect(res).toBeNull();

    expect(setStoredSpy).not.toHaveBeenCalledWith('approval_workflows', expect.arrayContaining([
      expect.objectContaining({ id: 'wf-2' })
    ]));
  });

  it('OrganizationEngine.saveUnits does not modify storage on failure', async () => {
    StorageEngine.setStored('organization_units', [{ id: 'unit-1', name_ar: 'Unit 1' }]);
    const setStoredSpy = vi.spyOn(StorageEngine, 'setStored');

    const res = await OrganizationEngine.saveUnits([{ id: 'unit-2', name_ar: 'Unit 2' } as any]);
    expect(res.success).toBe(false);

    expect(setStoredSpy).not.toHaveBeenCalledWith('organization_units', expect.arrayContaining([
      expect.objectContaining({ id: 'unit-2' })
    ]));
  });

  it('WarehouseHierarchyEngine.saveWarehouseTypes does not modify storage on failure', async () => {
    StorageEngine.setStored('warehouse_types', [{ id: 'wht-1', name_ar: 'Type 1' }]);
    const setStoredSpy = vi.spyOn(StorageEngine, 'setStored');

    const res = await WarehouseHierarchyEngine.saveWarehouseTypes([{ id: 'wht-2', name_ar: 'Type 2' } as any]);
    expect(res.success).toBe(false);

    expect(setStoredSpy).not.toHaveBeenCalledWith('warehouse_types', expect.arrayContaining([
      expect.objectContaining({ id: 'wht-2' })
    ]));
  });

  it('InventoryModule.saveWarehouses does not modify storage on failure', async () => {
    StorageEngine.setStored('warehouses', [{ id: 'wh-1', name: 'Warehouse 1' }]);
    const setStoredSpy = vi.spyOn(StorageEngine, 'setStored');

    const res = await InventoryModule.saveWarehouses([{ id: 'wh-2', name: 'Warehouse 2' } as any]);
    expect(res.success).toBe(false);

    expect(setStoredSpy).not.toHaveBeenCalledWith('warehouses', expect.arrayContaining([
      expect.objectContaining({ id: 'wh-2' })
    ]));
  });
});
