import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock firebase
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('firebase/storage', () => ({ getStorage: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: () => ({}),
  getFirestore: () => ({}),
  doc: (db: any, col: any, id: any) => ({ id, path: `${col}/${id}` }),
  collection: (db: any, col: any) => ({ id: col }),
  setDoc: () => Promise.resolve(),
  deleteDoc: () => Promise.resolve(),
  updateDoc: vi.fn(() => Promise.resolve()),
  increment: vi.fn((val) => val),
  onSnapshot: () => (() => {}),
  writeBatch: () => ({}),
  getDocs: () => Promise.resolve({ empty: true, docs: [] }),
  getDoc: () => Promise.resolve({ exists: () => false }),
  query: () => ({}),
  limit: () => ({}),
  where: () => ({}),
  startAfter: () => ({}),
  orderBy: () => ({}),
  runTransaction: () => Promise.resolve(),
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

describe('Inventory Document Types: Receipt vs Addition', () => {
  let warehouseId: string;

  beforeEach(() => {
    localStorageMock.clear();
    StorageEngine.cache = {};
    const mockUser = {
      id: 'admin-1',
      full_name: 'Test Admin',
      email: 'admin@example.com',
      role: 'SystemAdmin',
      company_id: 'comp-1',
      is_active: true
    };
    localStorageMock.setItem('custody_active_user', JSON.stringify(mockUser));
    localStorageMock.setItem('custody_selected_company_id', 'comp-1');
    StorageEngine.cache['active_user'] = mockUser;
    StorageEngine.cache['selected_company_id'] = 'comp-1';

    const warehouses = InventoryModule.getWarehouses();
    if (warehouses.length > 0) {
      warehouseId = warehouses[0].id;
    } else {
      warehouseId = 'wh-1';
    }
  });

  it('should correctly handle Receipt (الاستلامات) document type and stock movement', async () => {
    const products = InventoryModule.getProducts();
    expect(products.length).toBeGreaterThan(0);
    const prod = products[0];
    const initialStock = InventoryModule.getProductStock(prod.id, warehouseId);

    // Create a Receipt doc
    const newDoc = await InventoryModule.addInventoryDocument({
      date: '2026-07-22',
      doc_type: 'Receipt',
      source_warehouse_id: warehouseId,
      dest_entity_type: 'supplier',
      statement: 'اختبار إذن استلام',
      items: [
        {
          product_id: prod.id,
          product_code: prod.code,
          product_name: prod.name,
          unit: prod.unit,
          qty: 10,
          last_purchase_price: 150
        }
      ]
    });

    expect(newDoc).toBeDefined();
    expect(newDoc.doc_type).toBe('Receipt');

    // Transition to Posted
    const sRes1 = await InventoryModule.triggerLifecycleTransition(newDoc.id, 'Submit');
    const aRes1 = await InventoryModule.triggerLifecycleTransition(newDoc.id, 'Approve');

    // Verify stock increased
    const updatedStock = InventoryModule.getProductStock(prod.id, warehouseId);
    expect(updatedStock).toBe(initialStock + 10);
  });

  it('should correctly handle Addition (إذن إضافة) document type and stock movement', async () => {
    const products = InventoryModule.getProducts();
    expect(products.length).toBeGreaterThan(0);
    const prod = products[0];
    const initialStock = InventoryModule.getProductStock(prod.id, warehouseId);

    // Create an Addition doc
    const newDoc = await InventoryModule.addInventoryDocument({
      date: '2026-07-22',
      doc_type: 'Addition',
      source_warehouse_id: warehouseId,
      statement: 'اختبار إذن إضافة مخزني',
      items: [
        {
          product_id: prod.id,
          product_code: prod.code,
          product_name: prod.name,
          unit: prod.unit,
          qty: 25,
          last_purchase_price: 200
        }
      ]
    });

    expect(newDoc).toBeDefined();
    expect(newDoc.doc_type).toBe('Addition');

    // Transition to Posted
    await InventoryModule.triggerLifecycleTransition(newDoc.id, 'Submit');
    await InventoryModule.triggerLifecycleTransition(newDoc.id, 'Approve');

    // Verify stock increased
    const updatedStock = InventoryModule.getProductStock(prod.id, warehouseId);
    expect(updatedStock).toBe(initialStock + 25);
  });
});
