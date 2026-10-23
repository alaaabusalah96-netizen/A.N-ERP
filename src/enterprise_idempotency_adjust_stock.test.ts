import { vi, describe, it, expect, beforeEach } from 'vitest';

Object.defineProperty(global, 'navigator', {
  value: { onLine: true },
  configurable: true,
  writable: true
});

const docStore = new Map<string, any>();

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('firebase/storage', () => ({ getStorage: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: () => ({}),
  getFirestore: () => ({}),
  doc: (_db: any, ...parts: string[]) => {
    const path = parts.join('/');
    return { id: parts[parts.length - 1], path };
  },
  collection: (_db: any, ...parts: string[]) => ({ id: parts[parts.length - 1], path: parts.join('/') }),
  setDoc: (docRef: any, data: any) => {
    const path = docRef?.path || docRef?.id || String(docRef);
    docStore.set(path, data);
    return Promise.resolve();
  },
  deleteDoc: (docRef: any) => {
    const path = docRef?.path || docRef?.id || String(docRef);
    docStore.delete(path);
    return Promise.resolve();
  },
  updateDoc: vi.fn((docRef: any, data: any) => {
    const path = docRef?.path || docRef?.id || String(docRef);
    docStore.set(path, { ...docStore.get(path), ...data });
    return Promise.resolve();
  }),
  increment: vi.fn((val) => val),
  onSnapshot: () => (() => {}),
  writeBatch: () => ({
    set: (docRef: any, data: any) => {
      const path = docRef?.path || docRef?.id || String(docRef);
      docStore.set(path, data);
    },
    commit: () => Promise.resolve()
  }),
  getDocs: () => Promise.resolve({ empty: true, docs: [] }),
  getDoc: (docRef: any) => {
    const path = docRef?.path || docRef?.id || String(docRef);
    const data = docStore.get(path);
    return Promise.resolve({
      exists: () => data !== undefined,
      data: () => data || {}
    });
  },
  query: () => ({}),
  limit: () => ({}),
  where: () => ({}),
  startAfter: () => ({}),
  orderBy: () => ({}),
  runTransaction: (_db: any, updateFunction: (tx: any) => Promise<any>) => {
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
    return updateFunction(tx);
  }
}));

if (typeof window === 'undefined') {
  (global as any).window = {
    dispatchEvent: () => {},
    addEventListener: () => {},
  };
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

import { InventoryModule } from './db/inventory';
import { StorageEngine } from './db/storage';
import { CompaniesModule } from './db/companies';
import { WarehouseBusinessEngine } from './lib/enterprise/warehouse_engine';
import { PurchasingBusinessEngine } from './lib/enterprise/purchasing_engine';
import { SalesBusinessEngine } from './lib/enterprise/sales_engine';

describe('Item 1: Enterprise adjustStock Idempotency Keys Integration Tests', () => {
  const companyId = 'comp-idem-test';
  const warehouseId = 'wh-idem-1';
  const destWarehouseId = 'wh-idem-2';
  const productId = 'prod-idem-1';

  beforeEach(() => {
    localStorageMock.clear();
    docStore.clear();
    CompaniesModule.setSelectedCompanyId(companyId);

    StorageEngine.setStored('warehouses', [
      {
        id: warehouseId,
        name: 'Main Idem Warehouse',
        code: 'WH-IDEM-1',
        company_id: companyId,
        is_active: true
      },
      {
        id: destWarehouseId,
        name: 'Dest Idem Warehouse',
        code: 'WH-IDEM-2',
        company_id: companyId,
        is_active: true
      }
    ]);

    StorageEngine.setStored('products', [
      {
        id: productId,
        name: 'Idempotent Test Item',
        code: 'PROD-IDEM',
        company_id: companyId,
        cost_price: 100,
        selling_price: 150,
        is_active: true
      }
    ]);

    StorageEngine.setStored('stock_movements', []);
    StorageEngine.setStored('inventory_config', {
      allow_overdraft: 'STRICT',
      valuation_method: 'FEFO',
      company_id: companyId
    });
  });

  describe('Warehouse Engine Idempotency', () => {
    it('handles duplicate STOCK_RECEIVED event idempotently without duplicating stock or movement records', async () => {
      const engine = new WarehouseBusinessEngine();
      const event = {
        eventId: 'evt-rcv-1001',
        eventType: 'STOCK_RECEIVED',
        user_id: 'usr-wh-1',
        company_id: companyId,
        timestamp: '2026-09-01T00:00:00Z',
        payload: {
          warehouseId,
          items: [{ product_id: productId, qty: 50, bin_id: 'bin-1' }]
        }
      };

      // First run
      const res1 = await engine.processEvent(event as any);
      expect(res1.success).toBe(true);

      const movementsAfterFirst = InventoryModule.getStockMovements();
      expect(movementsAfterFirst.length).toBe(1);
      expect(movementsAfterFirst[0].id).toBe('m-adj-wh-rcv-evt-rcv-1001-wh-idem-1-prod-idem-1-bin-1-0');
      expect(movementsAfterFirst[0].qty_change).toBe(50);

      // Re-run with identical event
      const res2 = await engine.processEvent(event as any);
      expect(res2.success).toBe(true);

      const movementsAfterSecond = InventoryModule.getStockMovements();
      // Should not duplicate the movement record
      expect(movementsAfterSecond.length).toBe(1);

      // Balance in Firestore balanceDoc should remain exactly 50 (not 100)
      const balanceKey = `${productId}___${warehouseId}___bin-1`;
      const balanceDocData = docStore.get(`inventory_balances/${companyId}/items/${balanceKey}`);
      expect(balanceDocData.balance).toBe(50);
    });

    it('handles duplicate STOCK_TRANSFERRED event idempotently', async () => {
      // Seed source warehouse with 100 units
      await InventoryModule.adjustStock(warehouseId, productId, 100, 'Receipt', 'usr-seed', 'bin-1', 'seed-trf-init');

      const engine = new WarehouseBusinessEngine();
      const transferEvent = {
        eventId: 'evt-trf-2002',
        eventType: 'STOCK_TRANSFERRED',
        user_id: 'usr-wh-1',
        company_id: companyId,
        timestamp: '2026-09-01T00:00:00Z',
        payload: {
          srcWarehouseId: warehouseId,
          destWarehouseId,
          items: [{ product_id: productId, qty: 30, src_bin_id: 'bin-1', dest_bin_id: 'bin-2' }]
        }
      };

      // First transfer execution
      const res1 = await engine.processEvent(transferEvent as any);
      expect(res1.success).toBe(true);

      const movementsCountFirst = InventoryModule.getStockMovements().length; // 1 seed + 2 legs = 3
      expect(movementsCountFirst).toBe(3);

      // Second identical transfer execution (retry)
      const res2 = await engine.processEvent(transferEvent as any);
      expect(res2.success).toBe(true);

      const movementsCountSecond = InventoryModule.getStockMovements().length;
      expect(movementsCountSecond).toBe(3);

      // Check balances in Firestore
      const srcBalance = docStore.get(`inventory_balances/${companyId}/items/${productId}___${warehouseId}___bin-1`);
      const destBalance = docStore.get(`inventory_balances/${companyId}/items/${productId}___${destWarehouseId}___bin-2`);
      expect(srcBalance.balance).toBe(70); // 100 - 30
      expect(destBalance.balance).toBe(30); // 0 + 30
    });
  });

  describe('Purchasing Engine Idempotency', () => {
    it('handles duplicate PO receiving stock adjustment idempotently', async () => {
      const purchasingEngine = new PurchasingBusinessEngine();

      // Seed issued purchase order
      const po = {
        id: 'po-idem-999',
        poNumber: 'PO-999',
        company_id: companyId,
        status: 'ISSUED',
        supplierId: 'supp-1',
        supplierName: 'Test Supplier',
        vendorName: 'Test Supplier',
        items: [
          { productId, productName: 'Idempotent Item', qty: 40, unitPrice: 100, total: 4000 }
        ],
        totalAmount: 4000,
        metadata: {
          version: 1,
          created_at: '2026-09-01T00:00:00Z',
          created_by: 'usr-purchaser-1',
          updated_at: '2026-09-01T00:00:00Z',
          updated_by: 'usr-purchaser-1'
        },
        createdAt: '2026-09-01T00:00:00Z'
      };
      StorageEngine.setStored('purchase_orders', [po]);

      const receiveEvent = {
        eventId: 'evt-po-rcv-1',
        eventType: 'PO_RECEIVED',
        user_id: 'usr-purchaser-1',
        user_role: 'SystemAdmin',
        company_id: companyId,
        tenantId: companyId,
        timestamp: '2026-09-01T00:00:00Z',
        payload: {
          poId: 'po-idem-999',
          warehouseId
        }
      };

      // Process receive
      const res1 = await purchasingEngine.processEvent(receiveEvent as any);
      if (!res1.success) {
        console.error('Purchasing receive failed:', res1.messageEn, res1.messageAr, res1.statusCode);
      }
      expect(res1.success).toBe(true);

      const movements = InventoryModule.getStockMovements();
      const poMovements = movements.filter(m => m.id === 'm-adj-po-rcv-po-idem-999-prod-idem-1-0');
      expect(poMovements.length).toBe(1);
      expect(poMovements[0].qty_change).toBe(40);

      // Retrying the same adjustStock call with identical idempotencyKey
      await InventoryModule.adjustStock(warehouseId, productId, 40, 'Receipt', 'usr-purchaser-1', undefined, 'po-rcv-po-idem-999-prod-idem-1-0');

      const movementsAfterRetry = InventoryModule.getStockMovements().filter(m => m.id === 'm-adj-po-rcv-po-idem-999-prod-idem-1-0');
      expect(movementsAfterRetry.length).toBe(1);

      const balanceKey = `${productId}___${warehouseId}___nobin`;
      const balanceDoc = docStore.get(`inventory_balances/${companyId}/items/${balanceKey}`);
      expect(balanceDoc.balance).toBe(40);
    });
  });

  describe('Sales Engine Idempotency', () => {
    it('handles sales issue stock adjustment idempotently across retries', async () => {
      // Seed warehouse with 50 units
      await InventoryModule.adjustStock(warehouseId, productId, 50, 'Receipt', 'usr-seed', undefined, 'seed-sale-init');

      const invoiceId = 'inv-sale-777';
      const itemIdx = 0;
      const idempotencyKey = `sales-inv-${invoiceId}-${productId}-${itemIdx}`;

      // First deduction
      await InventoryModule.adjustStock(warehouseId, productId, -15, 'Issue', 'usr-seller', undefined, idempotencyKey);

      const movementsFirst = InventoryModule.getStockMovements();
      const saleMovementsFirst = movementsFirst.filter(m => m.id === `m-adj-${idempotencyKey}`);
      expect(saleMovementsFirst.length).toBe(1);

      const balanceKey = `${productId}___${warehouseId}___nobin`;
      let balanceDoc = docStore.get(`inventory_balances/${companyId}/items/${balanceKey}`);
      expect(balanceDoc.balance).toBe(35); // 50 - 15

      // Retry same sales issue
      await InventoryModule.adjustStock(warehouseId, productId, -15, 'Issue', 'usr-seller', undefined, idempotencyKey);

      const movementsSecond = InventoryModule.getStockMovements();
      const saleMovementsSecond = movementsSecond.filter(m => m.id === `m-adj-${idempotencyKey}`);
      expect(saleMovementsSecond.length).toBe(1);

      balanceDoc = docStore.get(`inventory_balances/${companyId}/items/${balanceKey}`);
      expect(balanceDoc.balance).toBe(35); // Still 35, not 20!
    });
  });
});
