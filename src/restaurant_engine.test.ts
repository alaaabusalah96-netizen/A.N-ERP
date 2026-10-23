import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine } from './db/storage';
import { InventoryModule } from './db/inventory';
import { RestaurantEngine } from './db/restaurant';

describe('Restaurant Module & Dish Costing Engine (Phase 1)', () => {
  const companyId = 'comp-restaurant-test';

  beforeEach(() => {
    // Clear storage for test isolate
    StorageEngine.setStored('restaurant_menu_categories', []);
    StorageEngine.setStored('restaurant_menu_items', []);
    StorageEngine.setStored('restaurant_recipes', []);
    StorageEngine.setStored('products', []);
  });

  it('1. manages menu categories correctly (add, list, update, delete)', () => {
    const cat = RestaurantEngine.addCategory({
      company_id: companyId,
      name_ar: 'المشويات',
      name_en: 'Grills',
      display_order: 1
    });

    expect(cat.id).toBeDefined();
    expect(cat.name_ar).toBe('المشويات');

    const categories = RestaurantEngine.getCategories(companyId);
    expect(categories.length).toBe(1);

    RestaurantEngine.updateCategory(cat.id, { name_ar: 'المشويات المتميزة' });
    const updated = RestaurantEngine.getCategories(companyId)[0];
    expect(updated.name_ar).toBe('المشويات المتميزة');

    RestaurantEngine.deleteCategory(cat.id);
    expect(RestaurantEngine.getCategories(companyId).length).toBe(0);
  });

  it('2. manages menu items and calculates dish cost dynamically from inventory raw materials (BOM)', async () => {
    // 1) Seed raw material products in inventory
    const meatProd = await InventoryModule.addProduct({
      name: 'Fresh Beef Kebab Meat (لحم كباب بلدي)',
      code: 'RAW-MEAT-01',
      unit: 'كجم (Kg)',
      min_stock: 10,
      last_purchase_price: 400, // 400 EGP per kg
      is_active: true,
      company_id: companyId
    });

    const riceProd = await InventoryModule.addProduct({
      name: 'Basmati Rice (أرز بسمتي)',
      code: 'RAW-RICE-01',
      unit: 'كجم (Kg)',
      min_stock: 20,
      last_purchase_price: 50, // 50 EGP per kg
      is_active: true,
      company_id: companyId
    });

    const oilProd = await InventoryModule.addProduct({
      name: 'Cooking Oil (زيت طهي)',
      code: 'RAW-OIL-01',
      unit: 'لتر (Litre)',
      min_stock: 10,
      last_purchase_price: 60, // 60 EGP per litre
      is_active: true,
      company_id: companyId
    });

    // 2) Create menu category & item
    const cat = RestaurantEngine.addCategory({
      company_id: companyId,
      name_ar: 'الأطباق الرئيسية',
      name_en: 'Main Courses',
      display_order: 1
    });

    const menuItem = RestaurantEngine.addMenuItem({
      company_id: companyId,
      name_ar: 'وجبة كباب مع أرز',
      name_en: 'Kebab Plate with Rice',
      category_id: cat.id,
      price: 250,
      is_available: true,
      description: '300 جرام كباب بلدي + 200 جرام أرز'
    });

    // 3) Create Recipe (BOM):
    // 0.30 kg meat @ 400 = 120 EGP
    // 0.20 kg rice @ 50   = 10 EGP
    // 0.05 L oil  @ 60   = 3 EGP
    // Total Expected Cost = 133 EGP
    RestaurantEngine.saveRecipe({
      company_id: companyId,
      menu_item_id: menuItem.id,
      ingredients: [
        { inventory_item_id: meatProd.id, quantity_used: 0.30, unit: 'كجم (Kg)' },
        { inventory_item_id: riceProd.id, quantity_used: 0.20, unit: 'كجم (Kg)' },
        { inventory_item_id: oilProd.id, quantity_used: 0.05, unit: 'لتر (Litre)' }
      ],
      notes: 'Standard 1-person serving'
    });

    // 4) Calculate cost
    const calculatedCost = RestaurantEngine.calculateMenuItemCost(menuItem.id, companyId);
    expect(calculatedCost).toBe(133); // 120 + 10 + 3

    // 5) Get MenuItemsWithCost
    const itemsWithCost = RestaurantEngine.getMenuItemsWithCost(companyId);
    expect(itemsWithCost.length).toBe(1);
    const itemWithCost = itemsWithCost[0];
    expect(itemWithCost.cost).toBe(133);
    expect(itemWithCost.gross_profit).toBe(117); // 250 - 133
    expect(itemWithCost.margin_percentage).toBe(46.8); // (117 / 250) * 100 = 46.8%
  });

  it('3. dynamically updates dish cost when raw material purchase price changes in inventory', async () => {
    // 1) Seed product
    const meatProd = await InventoryModule.addProduct({
      name: 'Fresh Lamb (لحم ضاني)',
      code: 'RAW-LAMB',
      unit: 'كجم (Kg)',
      min_stock: 10,
      last_purchase_price: 300,
      is_active: true,
      company_id: companyId
    });

    const menuItem = RestaurantEngine.addMenuItem({
      company_id: companyId,
      name_ar: 'ريش ضاني',
      name_en: 'Lamb Chops',
      category_id: 'cat-1',
      price: 300,
      is_available: true
    });

    RestaurantEngine.saveRecipe({
      company_id: companyId,
      menu_item_id: menuItem.id,
      ingredients: [
        { inventory_item_id: meatProd.id, quantity_used: 0.40, unit: 'كجم (Kg)' }
      ]
    });

    // Cost at 300 EGP/kg * 0.40 kg = 120 EGP
    expect(RestaurantEngine.calculateMenuItemCost(menuItem.id, companyId)).toBe(120);

    // Update raw meat purchase price in inventory to 400 EGP/kg
    const products = InventoryModule.getProducts(companyId);
    const idx = products.findIndex(p => p.id === meatProd.id);
    products[idx].last_purchase_price = 400;
    await InventoryModule.saveProducts(products);

    // Cost auto-updates: 400 * 0.40 = 160 EGP
    expect(RestaurantEngine.calculateMenuItemCost(menuItem.id, companyId)).toBe(160);
  });

  it('4. calculates suggested selling price based on target gross profit margin', () => {
    // Cost = 100 EGP, target margin = 60%
    // Price = 100 / (1 - 0.60) = 250 EGP
    const suggestedPrice = RestaurantEngine.suggestMenuItemPrice(100, 60);
    expect(suggestedPrice).toBe(250);

    // Cost = 120 EGP, target margin = 50%
    // Price = 120 / (1 - 0.50) = 240 EGP
    expect(RestaurantEngine.suggestMenuItemPrice(120, 50)).toBe(240);
  });
});
