import { describe, it, expect, beforeEach } from 'vitest';
import { RestaurantEngine } from './db/restaurant';
import { InventoryModule } from './db/inventory';
import { StorageEngine } from './db/storage';

describe('Restaurant Orders & Stock Deduction Engine', () => {
  const companyId = 'comp-test-orders';

  beforeEach(() => {
    // Clear relevant storage
    StorageEngine.setStored('restaurant_tables', []);
    StorageEngine.setStored('restaurant_orders', []);
    StorageEngine.setStored('restaurant_menu_items', []);
    StorageEngine.setStored('restaurant_recipes', []);
    StorageEngine.setStored('stock_movements', []);
    InventoryModule.clearStockLookupIndex();
  });

  it('seeds and retrieves default tables for a restaurant company', () => {
    const tables = RestaurantEngine.getTables(companyId);
    expect(tables.length).toBe(6);
    expect(tables[0].table_number).toContain('طاولة 1');
    expect(tables[0].status).toBe('available');
  });

  it('creates an order and updates table status to occupied', async () => {
    const tables = RestaurantEngine.getTables(companyId);
    const tableToOccupied = tables[0];

    const order = await RestaurantEngine.createOrder({
      company_id: companyId,
      order_type: 'dine_in',
      table_id: tableToOccupied.id,
      table_number: tableToOccupied.table_number,
      items: [
        {
          menu_item_id: 'dish-1',
          name_ar: 'شاورما دجاج',
          name_en: 'Chicken Shawarma',
          quantity: 2,
          unit_price: 120,
          total_price: 240
        }
      ],
      status: 'pending',
      subtotal: 240,
      tax: 33.6,
      discount: 0,
      total: 273.6,
      payment_method: 'cash',
      created_by: 'user-1'
    });

    expect(order.id).toBeDefined();
    expect(order.order_number).toContain('ORD-');

    // Check table status
    const updatedTables = RestaurantEngine.getTables(companyId);
    const tableAfter = updatedTables.find(t => t.id === tableToOccupied.id);
    expect(tableAfter?.status).toBe('occupied');
    expect(tableAfter?.current_order_id).toBe(order.id);
  });

  it('deducts inventory raw materials when order is served and frees table when paid', async () => {
    // Setup recipe and product
    const dish = RestaurantEngine.addMenuItem({
      company_id: companyId,
      category_id: 'cat-1',
      name_ar: 'برجر دجاج',
      name_en: 'Chicken Burger',
      price: 150,
      is_available: true
    });

    RestaurantEngine.saveRecipe({
      company_id: companyId,
      menu_item_id: dish.id,
      ingredients: [
        { inventory_item_id: 'prod-chicken-meat', quantity_used: 0.2, unit: 'كجم' }
      ]
    });

    const tables = RestaurantEngine.getTables(companyId);
    const table = tables[0];

    const order = await RestaurantEngine.createOrder({
      company_id: companyId,
      order_type: 'dine_in',
      table_id: table.id,
      table_number: table.table_number,
      items: [
        {
          menu_item_id: dish.id,
          name_ar: dish.name_ar,
          name_en: dish.name_en,
          quantity: 3, // 3 x 0.2kg = 0.6kg raw chicken needed
          unit_price: 150,
          total_price: 450
        }
      ],
      status: 'pending',
      subtotal: 450,
      tax: 0,
      discount: 0,
      total: 450,
      payment_method: 'cash'
    });

    // Advance status to served
    await RestaurantEngine.updateOrderStatus(order.id, 'served', 'wh-1');

    // Verify stock movements created
    const movements = InventoryModule.getStockMovements();
    const chickenMovements = movements.filter(m => m.product_id === 'prod-chicken-meat');
    expect(chickenMovements.length).toBe(1);
    expect(chickenMovements[0].qty_change).toBe(-0.6);
    expect(chickenMovements[0].doc_id).toBe(order.id);

    // Verify order marked as stock deducted
    const fetchedOrder = RestaurantEngine.getOrderById(order.id);
    expect(fetchedOrder?.is_stock_deducted).toBe(true);

    // Advance status to paid -> table should become available again
    await RestaurantEngine.updateOrderStatus(order.id, 'paid');
    const tableAfterPaid = RestaurantEngine.getTables(companyId).find(t => t.id === table.id);
    expect(tableAfterPaid?.status).toBe('available');
    expect(tableAfterPaid?.current_order_id).toBeUndefined();
  });

  it('prevents duplicate inventory deductions on the same order', async () => {
    const dish = RestaurantEngine.addMenuItem({
      company_id: companyId,
      category_id: 'cat-1',
      name_ar: 'بيتزا',
      name_en: 'Pizza',
      price: 200,
      is_available: true
    });

    RestaurantEngine.saveRecipe({
      company_id: companyId,
      menu_item_id: dish.id,
      ingredients: [
        { inventory_item_id: 'prod-flour', quantity_used: 0.3, unit: 'كجم' }
      ]
    });

    const order = await RestaurantEngine.createOrder({
      company_id: companyId,
      order_type: 'takeaway',
      items: [
        {
          menu_item_id: dish.id,
          name_ar: dish.name_ar,
          name_en: dish.name_en,
          quantity: 2,
          unit_price: 200,
          total_price: 400
        }
      ],
      status: 'pending',
      subtotal: 400,
      tax: 0,
      discount: 0,
      total: 400
    });

    // First deduction via transition
    await RestaurantEngine.updateOrderStatus(order.id, 'served', 'wh-1');
    const movementsCountFirst = InventoryModule.getStockMovements().length;

    // Call deductStockForOrder a second time manually
    const secondDeductionResult = await RestaurantEngine.deductStockForOrder(order.id);
    expect(secondDeductionResult).toBe(false);

    // Movements count should remain unchanged
    const movementsCountSecond = InventoryModule.getStockMovements().length;
    expect(movementsCountSecond).toBe(movementsCountFirst);
  });
});
