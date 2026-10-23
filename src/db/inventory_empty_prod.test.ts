import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InventoryModule } from './inventory';
import { StorageEngine } from './storage';
import { CompaniesModule } from './companies';

describe('InventoryModule — Production vs Development Empty Fallback (Item 2)', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    StorageEngine.cache = {};
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    StorageEngine.cache = {};
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('In simulated production (NODE_ENV=production), empty storage returns [] for warehouses, products, movements, and ledger', () => {
    process.env.NODE_ENV = 'production';
    StorageEngine.cache = {};

    const warehouses = InventoryModule.getWarehouses('comp-prod-test');
    expect(warehouses).toEqual([]);

    const products = InventoryModule.getProducts('comp-prod-test');
    expect(products).toEqual([]);

    const movements = InventoryModule.getStockMovements();
    expect(movements).toEqual([]);

    const ledger = InventoryModule.getInventoryLedger();
    expect(ledger).toEqual([]);
  });

  it('In simulated development/test (NODE_ENV=test), empty storage returns default fixtures for comp-1', () => {
    process.env.NODE_ENV = 'test';
    StorageEngine.cache = {};

    const warehouses = InventoryModule.getWarehouses('comp-1');
    expect(warehouses.length).toBeGreaterThan(0);

    const products = InventoryModule.getProducts('comp-1');
    expect(products.length).toBeGreaterThan(0);

    const movements = InventoryModule.getStockMovements('comp-1');
    expect(movements.length).toBeGreaterThan(0);

    const ledger = InventoryModule.getInventoryLedger('comp-1');
    expect(ledger.length).toBeGreaterThan(0);
  });
});
