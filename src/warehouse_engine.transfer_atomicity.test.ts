import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WarehouseBusinessEngine } from './lib/enterprise/warehouse_engine';
import { InventoryModule } from './db/inventory';
import { StorageEngine } from './db/storage';
import { CompaniesModule } from './db/companies';
import { EventEnvelope } from './types/enterprise';

describe('Warehouse Business Engine - Multi-Item Transfer Compensation Acceptance Tests', () => {
  const tenantId = 'comp-wh-atomicity-test';

  beforeEach(() => {
    localStorage.clear();
    CompaniesModule.setSelectedCompanyId(tenantId);
    StorageEngine.setStored('warehouses', [
      { id: 'wh-source', name: 'Source Warehouse', company_id: tenantId },
      { id: 'wh-target', name: 'Target Warehouse', company_id: tenantId }
    ]);
    StorageEngine.setStored('stock_movements', [
      {
        id: 'm-init-a',
        doc_id: 'init-a',
        doc_no: 'INIT-A',
        doc_type: 'Receipt',
        product_id: 'prod-item-1',
        warehouse_id: 'wh-source',
        qty_change: 100,
        type: 'IN',
        current_balance_after: 100,
        date: '2026-08-29',
        company_id: tenantId,
        created_at: new Date().toISOString(),
        created_by: 'u-admin'
      },
      {
        id: 'm-init-b',
        doc_id: 'init-b',
        doc_no: 'INIT-B',
        doc_type: 'Receipt',
        product_id: 'prod-item-2',
        warehouse_id: 'wh-source',
        qty_change: 60,
        type: 'IN',
        current_balance_after: 60,
        date: '2026-08-29',
        company_id: tenantId,
        created_at: new Date().toISOString(),
        created_by: 'u-admin'
      },
      {
        id: 'm-init-c',
        doc_id: 'init-c',
        doc_no: 'INIT-C',
        doc_type: 'Receipt',
        product_id: 'prod-item-3',
        warehouse_id: 'wh-source',
        qty_change: 40,
        type: 'IN',
        current_balance_after: 40,
        date: '2026-08-29',
        company_id: tenantId,
        created_at: new Date().toISOString(),
        created_by: 'u-admin'
      }
    ]);
  });

  it('proves transfer atomicity: rolls back and compensates earlier item adjustments when a subsequent item fails', async () => {
    const engine = new WarehouseBusinessEngine();
    const realAdjustStock = InventoryModule.adjustStock;
    let callCount = 0;

    // Spy on adjustStock:
    // Call 1: item 1 (prod-item-1) deduct from wh-source -> succeeds
    // Call 2: item 1 (prod-item-1) credit to wh-target   -> succeeds
    // Call 3: item 2 (prod-item-2) deduct from wh-source -> fails with error
    const adjustSpy = vi.spyOn(InventoryModule, 'adjustStock').mockImplementation(async (...args) => {
      callCount++;
      if (callCount === 3) {
        throw new Error('Simulation of transient database write failure on item 2');
      }
      return realAdjustStock.apply(InventoryModule, args);
    });

    const transferEvent: EventEnvelope = {
      eventId: 'evt-transfer-compensation-acceptance',
      eventType: 'STOCK_TRANSFERRED',
      timestamp: new Date().toISOString(),
      tenantId,
      organizationId: 'org-1',
      user_id: 'u-admin',
      user_name: 'Admin',
      user_role: 'Admin',
      payload: {
        srcWarehouseId: 'wh-source',
        destWarehouseId: 'wh-target',
        items: [
          { product_id: 'prod-item-1', qty: 25 },
          { product_id: 'prod-item-2', qty: 15 },
          { product_id: 'prod-item-3', qty: 10 }
        ]
      },
      metadataVersion: '1.0'
    };

    const result = await engine.processEvent(transferEvent);

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe('EXECUTION_ERROR');
    expect(result.messageAr).toContain('فشل تحويل المخزون وتم التراجع عن الحركات السابقة');

    // Verify complete restoration of all balances (Source & Dest)
    expect(InventoryModule.getProductStockInWarehouse('wh-source', 'prod-item-1')).toBe(100);
    expect(InventoryModule.getProductStockInWarehouse('wh-target', 'prod-item-1')).toBe(0);

    expect(InventoryModule.getProductStockInWarehouse('wh-source', 'prod-item-2')).toBe(60);
    expect(InventoryModule.getProductStockInWarehouse('wh-target', 'prod-item-2')).toBe(0);

    expect(InventoryModule.getProductStockInWarehouse('wh-source', 'prod-item-3')).toBe(40);
    expect(InventoryModule.getProductStockInWarehouse('wh-target', 'prod-item-3')).toBe(0);

    adjustSpy.mockRestore();
  });

  it('records compensation failure in error message if rollback itself encounters an error', async () => {
    const engine = new WarehouseBusinessEngine();
    const realAdjustStock = InventoryModule.adjustStock;
    let callCount = 0;

    // Call 1: item 1 deduct -> ok
    // Call 2: item 1 credit -> ok
    // Call 3: item 2 deduct -> fails
    // Call 4: rollback item 1 credit (deduct from target) -> fails
    const adjustSpy = vi.spyOn(InventoryModule, 'adjustStock').mockImplementation(async (...args) => {
      callCount++;
      if (callCount === 3) {
        throw new Error('Failure during forward transfer step');
      }
      if (callCount === 4) {
        throw new Error('Failure during compensation rollback step');
      }
      return realAdjustStock.apply(InventoryModule, args);
    });

    const transferEvent: EventEnvelope = {
      eventId: 'evt-transfer-compensation-failure',
      eventType: 'STOCK_TRANSFERRED',
      timestamp: new Date().toISOString(),
      tenantId,
      organizationId: 'org-1',
      user_id: 'u-admin',
      user_name: 'Admin',
      user_role: 'Admin',
      payload: {
        srcWarehouseId: 'wh-source',
        destWarehouseId: 'wh-target',
        items: [
          { product_id: 'prod-item-1', qty: 25 },
          { product_id: 'prod-item-2', qty: 15 }
        ]
      },
      metadataVersion: '1.0'
    };

    const result = await engine.processEvent(transferEvent);

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe('EXECUTION_ERROR');
    expect(result.messageAr).toContain('فشل التحويل وفشلت بعض حركات التراجع');
    expect(result.messageAr).toContain('prod-item-1@wh-target');
    expect(result.messageEn).toContain('Transfer failed and compensation rollback had errors');

    adjustSpy.mockRestore();
  });
});
