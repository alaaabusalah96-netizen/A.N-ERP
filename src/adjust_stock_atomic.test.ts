import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InventoryModule } from './db/inventory';
import { StorageEngine } from './db/storage';
import { CompaniesModule } from './db/companies';
import * as firestore from 'firebase/firestore';

describe('Phase H: Atomic adjustStock Race-Condition Prevention Tests', () => {
  const companyId = 'comp-test-atomic';
  const warehouseId = 'wh-atomic-1';
  const productId = 'prod-atomic-1';
  const binId = 'bin-atomic-1';

  beforeEach(() => {
    localStorage.clear();
    CompaniesModule.setSelectedCompanyId(companyId);

    // Setup initial warehouse
    StorageEngine.setStored('warehouses', [
      {
        id: warehouseId,
        name: 'Atomic Test Warehouse',
        code: 'AT-WH-01',
        company_id: companyId,
        is_active: true
      }
    ]);

    // Setup initial stock movements with starting balance of 50
    StorageEngine.setStored('stock_movements', [
      {
        id: 'mov-init-1',
        doc_id: 'init-doc',
        doc_no: 'INIT-001',
        doc_type: 'Receipt',
        product_id: productId,
        warehouse_id: warehouseId,
        bin_id: binId,
        qty_change: 50,
        type: 'IN',
        current_balance_after: 50,
        date: '2026-08-24',
        company_id: companyId,
        created_at: '2026-08-24T00:00:00Z',
        created_by: 'system'
      }
    ]);

    // Set overdraft rule to STRICT
    StorageEngine.setStored('inventory_config', {
      allow_overdraft: 'STRICT',
      valuation_method: 'FEFO',
      company_id: companyId
    });
  });

  it('correctly executes sequential stock adjustments without losing updates', async () => {
    // Initial balance is 50
    const initialStock = InventoryModule.getProductStockInWarehouse(warehouseId, productId, binId);
    expect(initialStock).toBe(50);

    // Run two sequential adjustments
    await InventoryModule.adjustStock(warehouseId, productId, 20, 'Receipt', 'user-1', binId);
    await InventoryModule.adjustStock(warehouseId, productId, 15, 'Receipt', 'user-2', binId);

    // Final balance must be 50 + 20 + 15 = 85
    const finalStock = InventoryModule.getProductStockInWarehouse(warehouseId, productId, binId);
    expect(finalStock).toBe(85);

    const movements = InventoryModule.getStockMovements().filter(
      m => m.warehouse_id === warehouseId && m.product_id === productId && m.bin_id === binId
    );
    expect(movements.length).toBe(3);
  });

  it('correctly handles concurrent stock adjustments via Promise.all using atomic transaction isolation', async () => {
    const initialStock = InventoryModule.getProductStockInWarehouse(warehouseId, productId, binId);
    expect(initialStock).toBe(50);

    // Setup an in-memory document store and transactional execution lock to emulate Firestore's atomic serializability
    const docStore = new Map<string, any>();
    let queueLock = Promise.resolve();

    const runTxSpy = vi.spyOn(firestore, 'runTransaction').mockImplementation(async (_db: any, updateFunction: any) => {
      const prevLock = queueLock;
      let release: () => void;
      queueLock = new Promise<void>(resolve => { release = resolve; });
      await prevLock;

      try {
        const tx = {
          get: async (docRef: any) => {
            const path = docRef?.path || docRef?.id || String(docRef);
            const data = docStore.get(path);
            return {
              exists: () => data !== undefined,
              data: () => data || {}
            };
          },
          set: (docRef: any, data: any, options?: any) => {
            const path = docRef?.path || docRef?.id || String(docRef);
            if (options?.merge && docStore.has(path)) {
              docStore.set(path, { ...docStore.get(path), ...data });
            } else {
              docStore.set(path, data);
            }
          },
          update: (docRef: any, data: any) => {
            const path = docRef?.path || docRef?.id || String(docRef);
            docStore.set(path, { ...docStore.get(path), ...data });
          }
        };
        return await updateFunction(tx);
      } finally {
        release!();
      }
    });

    // Fire two adjustments concurrently via Promise.all
    await Promise.all([
      InventoryModule.adjustStock(warehouseId, productId, 20, 'Receipt', 'user-1', binId),
      InventoryModule.adjustStock(warehouseId, productId, 15, 'Receipt', 'user-2', binId)
    ]);

    // Both adjustments must be reflected: 50 + 20 + 15 = 85
    const finalStock = InventoryModule.getProductStockInWarehouse(warehouseId, productId, binId);
    expect(finalStock).toBe(85);

    const movements = InventoryModule.getStockMovements().filter(
      m => m.warehouse_id === warehouseId && m.product_id === productId && m.bin_id === binId
    );
    expect(movements.length).toBe(3);

    // Verify individual adjustment quantities exist in movements
    const deltas = movements.slice(1).map(m => m.qty_change);
    expect(deltas).toContain(20);
    expect(deltas).toContain(15);

    runTxSpy.mockRestore();
  });

  it('strictly enforces overdraft prevention on negative balance adjustments', async () => {
    // Balance is 50, trying to deduct 60 should throw in STRICT mode
    await expect(
      InventoryModule.adjustStock(warehouseId, productId, -60, 'Issue', 'user-1', binId)
    ).rejects.toThrow(/رصيد غير كافٍ|Insufficient stock/);

    // Balance should remain unchanged at 50
    const finalStock = InventoryModule.getProductStockInWarehouse(warehouseId, productId, binId);
    expect(finalStock).toBe(50);
  });

  it('fails loud on generic runTransaction failure without writing to local memory or altering balance', async () => {
    const initialStock = InventoryModule.getProductStockInWarehouse(warehouseId, productId, binId);
    expect(initialStock).toBe(50);
    const initialMovementsCount = InventoryModule.getStockMovements().length;

    const runTxSpy = vi.spyOn(firestore, 'runTransaction').mockRejectedValueOnce(new Error('Network transport unavailable'));

    await expect(
      InventoryModule.adjustStock(warehouseId, productId, 10, 'Receipt', 'user-1', binId)
    ).rejects.toThrow(/فشل تعديل المخزون ولم يتم حفظ الحركة.*Network transport unavailable|Stock adjustment failed and movement was NOT persisted.*Network transport unavailable/);

    // No local movement should be written
    const currentMovements = InventoryModule.getStockMovements();
    expect(currentMovements.length).toBe(initialMovementsCount);

    // Balance in local memory must remain unchanged
    const currentStock = InventoryModule.getProductStockInWarehouse(warehouseId, productId, binId);
    expect(currentStock).toBe(50);

    runTxSpy.mockRestore();
  });

  it('generates predictable, stable movement and doc IDs when idempotencyKey is supplied across retries', async () => {
    const fixedKey = 'idem-retry-9988';
    await InventoryModule.adjustStock(warehouseId, productId, 10, 'Receipt', 'user-1', binId, fixedKey);

    const movements = InventoryModule.getStockMovements().filter(
      m => m.warehouse_id === warehouseId && m.product_id === productId && m.bin_id === binId
    );

    const lastMovement = movements[movements.length - 1];
    expect(lastMovement.id).toBe(`m-adj-${fixedKey}`);
    expect(lastMovement.doc_no).toBe(`ADJ-${fixedKey.slice(0, 8)}`);
  });
});
