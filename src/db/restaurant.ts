import { StorageEngine } from './storage';
import { InventoryModule } from './inventory';
import { MenuItem, MenuCategory, Recipe, MenuItemWithCost, RestaurantTable, RestaurantOrder, OrderStatus, TableStatus } from '../types/restaurant';
import { StockMovement } from '../types/inventory';

export class RestaurantEngine {
  // Categories
  static getCategories(companyId?: string): MenuCategory[] {
    const list = StorageEngine.getStored<MenuCategory[]>('restaurant_menu_categories', []);
    if (!companyId) return list;
    return list.filter(c => c.company_id === companyId);
  }

  static saveCategories(list: MenuCategory[]): void {
    StorageEngine.setStored('restaurant_menu_categories', list);
  }

  static addCategory(category: Omit<MenuCategory, 'id'>): MenuCategory {
    const list = StorageEngine.getStored<MenuCategory[]>('restaurant_menu_categories', []);
    const newCategory: MenuCategory = {
      ...category,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    list.push(newCategory);
    this.saveCategories(list);
    return newCategory;
  }

  static updateCategory(id: string, updates: Partial<MenuCategory>): MenuCategory | null {
    const list = StorageEngine.getStored<MenuCategory[]>('restaurant_menu_categories', []);
    const index = list.findIndex(c => c.id === id);
    if (index === -1) return null;
    list[index] = { ...list[index], ...updates, updated_at: new Date().toISOString() };
    this.saveCategories(list);
    return list[index];
  }

  static deleteCategory(id: string): boolean {
    const list = StorageEngine.getStored<MenuCategory[]>('restaurant_menu_categories', []);
    const filtered = list.filter(c => c.id !== id);
    if (filtered.length === list.length) return false;
    this.saveCategories(filtered);
    return true;
  }

  // Menu Items
  static getMenuItems(companyId?: string): MenuItem[] {
    const list = StorageEngine.getStored<MenuItem[]>('restaurant_menu_items', []);
    if (!companyId) return list;
    return list.filter(m => m.company_id === companyId);
  }

  static saveMenuItems(list: MenuItem[]): void {
    StorageEngine.setStored('restaurant_menu_items', list);
  }

  static addMenuItem(item: Omit<MenuItem, 'id'>): MenuItem {
    const list = StorageEngine.getStored<MenuItem[]>('restaurant_menu_items', []);
    const newItem: MenuItem = {
      ...item,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    list.push(newItem);
    this.saveMenuItems(list);
    return newItem;
  }

  static updateMenuItem(id: string, updates: Partial<MenuItem>): MenuItem | null {
    const list = StorageEngine.getStored<MenuItem[]>('restaurant_menu_items', []);
    const index = list.findIndex(m => m.id === id);
    if (index === -1) return null;
    list[index] = { ...list[index], ...updates, updated_at: new Date().toISOString() };
    this.saveMenuItems(list);
    return list[index];
  }

  static deleteMenuItem(id: string): boolean {
    const list = StorageEngine.getStored<MenuItem[]>('restaurant_menu_items', []);
    const filtered = list.filter(m => m.id !== id);
    if (filtered.length === list.length) return false;
    this.saveMenuItems(filtered);
    // Also delete recipes for this item
    const recipes = StorageEngine.getStored<Recipe[]>('restaurant_recipes', []);
    const filteredRecipes = recipes.filter(r => r.menu_item_id !== id);
    StorageEngine.setStored('restaurant_recipes', filteredRecipes);
    return true;
  }

  // Recipes (BOM)
  static getRecipes(companyId?: string): Recipe[] {
    const list = StorageEngine.getStored<Recipe[]>('restaurant_recipes', []);
    if (!companyId) return list;
    return list.filter(r => r.company_id === companyId);
  }

  static getRecipeForMenuItem(menuItemId: string): Recipe | null {
    const list = StorageEngine.getStored<Recipe[]>('restaurant_recipes', []);
    return list.find(r => r.menu_item_id === menuItemId) || null;
  }

  static saveRecipe(recipe: Omit<Recipe, 'id'> & { id?: string }): Recipe {
    const list = StorageEngine.getStored<Recipe[]>('restaurant_recipes', []);
    const existingIndex = list.findIndex(r => r.menu_item_id === recipe.menu_item_id);

    if (existingIndex >= 0) {
      const updated: Recipe = {
        ...list[existingIndex],
        ...recipe,
        updated_at: new Date().toISOString()
      };
      list[existingIndex] = updated;
      StorageEngine.setStored('restaurant_recipes', list);
      return updated;
    } else {
      const newRecipe: Recipe = {
        ...recipe,
        id: recipe.id || crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      list.push(newRecipe);
      StorageEngine.setStored('restaurant_recipes', list);
      return newRecipe;
    }
  }

  // Calculation Engine
  static calculateMenuItemCost(menuItemId: string, companyId?: string): number {
    const recipe = this.getRecipeForMenuItem(menuItemId);
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
      return 0;
    }

    const products = InventoryModule.getProducts(companyId || recipe.company_id);
    let totalCost = 0;

    for (const ing of recipe.ingredients) {
      const product = products.find(p => p.id === ing.inventory_item_id);
      if (product) {
        const unitPrice = product.last_purchase_price || 0;
        totalCost += unitPrice * ing.quantity_used;
      }
    }

    return Number(totalCost.toFixed(2));
  }

  static getMenuItemsWithCost(companyId?: string): MenuItemWithCost[] {
    const items = this.getMenuItems(companyId);
    const categories = this.getCategories(companyId);

    return items.map(item => {
      const cat = categories.find(c => c.id === item.category_id);
      const cost = this.calculateMenuItemCost(item.id, companyId || item.company_id);
      const recipe = this.getRecipeForMenuItem(item.id);
      const grossProfit = Number((item.price - cost).toFixed(2));
      const marginPercentage = item.price > 0 ? Number(((grossProfit / item.price) * 100).toFixed(1)) : 0;

      return {
        ...item,
        category_name_ar: cat?.name_ar,
        category_name_en: cat?.name_en,
        cost,
        gross_profit: grossProfit,
        margin_percentage: marginPercentage,
        ingredients_count: recipe?.ingredients?.length || 0
      };
    });
  }

  static suggestMenuItemPrice(cost: number, targetGrossMarginPercent: number = 60): number {
    if (cost <= 0) return 0;
    if (targetGrossMarginPercent >= 100) return cost * 2;
    const decimalMargin = targetGrossMarginPercent / 100;
    const price = cost / (1 - decimalMargin);
    return Number(price.toFixed(2));
  }

  // --- Tables Management ---
  static getTables(companyId?: string): RestaurantTable[] {
    const list = StorageEngine.getStored<RestaurantTable[]>('restaurant_tables', []);
    if (!companyId) return list;
    const filtered = list.filter(t => t.company_id === companyId);
    if (filtered.length === 0 && companyId) {
      return this.seedDefaultTables(companyId);
    }
    return filtered;
  }

  static saveTables(tables: RestaurantTable[]): void {
    StorageEngine.setStored('restaurant_tables', tables);
  }

  static seedDefaultTables(companyId: string): RestaurantTable[] {
    const current = StorageEngine.getStored<RestaurantTable[]>('restaurant_tables', []);
    const existingForCompany = current.filter(t => t.company_id === companyId);
    if (existingForCompany.length > 0) return existingForCompany;

    const defaultTables: RestaurantTable[] = [
      { id: `tbl-${companyId}-1`, company_id: companyId, table_number: 'طاولة 1 (VIP)', capacity: 4, status: 'available', created_at: new Date().toISOString() },
      { id: `tbl-${companyId}-2`, company_id: companyId, table_number: 'طاولة 2', capacity: 2, status: 'available', created_at: new Date().toISOString() },
      { id: `tbl-${companyId}-3`, company_id: companyId, table_number: 'طاولة 3', capacity: 4, status: 'available', created_at: new Date().toISOString() },
      { id: `tbl-${companyId}-4`, company_id: companyId, table_number: 'طاولة 4 العائلات', capacity: 6, status: 'available', created_at: new Date().toISOString() },
      { id: `tbl-${companyId}-5`, company_id: companyId, table_number: 'طاولة 5', capacity: 2, status: 'available', created_at: new Date().toISOString() },
      { id: `tbl-${companyId}-6`, company_id: companyId, table_number: 'طاولة 6 (خارجية)', capacity: 4, status: 'available', created_at: new Date().toISOString() },
    ];

    const updated = [...current, ...defaultTables];
    this.saveTables(updated);
    return defaultTables;
  }

  static addTable(table: Omit<RestaurantTable, 'id'>): RestaurantTable {
    const list = StorageEngine.getStored<RestaurantTable[]>('restaurant_tables', []);
    const newTable: RestaurantTable = {
      ...table,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    list.push(newTable);
    this.saveTables(list);
    return newTable;
  }

  static updateTable(id: string, updates: Partial<RestaurantTable>): RestaurantTable | null {
    const list = StorageEngine.getStored<RestaurantTable[]>('restaurant_tables', []);
    const idx = list.findIndex(t => t.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...updates, updated_at: new Date().toISOString() };
    this.saveTables(list);
    return list[idx];
  }

  static deleteTable(id: string): boolean {
    const list = StorageEngine.getStored<RestaurantTable[]>('restaurant_tables', []);
    const filtered = list.filter(t => t.id !== id);
    if (filtered.length === list.length) return false;
    this.saveTables(filtered);
    return true;
  }

  // --- Orders Management ---
  static getOrders(companyId?: string): RestaurantOrder[] {
    const list = StorageEngine.getStored<RestaurantOrder[]>('restaurant_orders', []);
    if (!companyId) return list;
    return list.filter(o => o.company_id === companyId);
  }

  static saveOrders(orders: RestaurantOrder[]): void {
    StorageEngine.setStored('restaurant_orders', orders);
  }

  static getOrderById(orderId: string): RestaurantOrder | null {
    const list = StorageEngine.getStored<RestaurantOrder[]>('restaurant_orders', []);
    return list.find(o => o.id === orderId) || null;
  }

  static createOrder(orderData: Omit<RestaurantOrder, 'id' | 'order_number' | 'created_at' | 'updated_at'>): RestaurantOrder {
    const list = StorageEngine.getStored<RestaurantOrder[]>('restaurant_orders', []);
    const companyOrders = list.filter(o => o.company_id === orderData.company_id);
    const orderSeq = companyOrders.length + 1001;

    const newOrder: RestaurantOrder = {
      ...orderData,
      id: crypto.randomUUID(),
      order_number: `ORD-${orderSeq}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    list.push(newOrder);
    this.saveOrders(list);

    // If order is dine-in and associated with a table, mark table as occupied
    if (newOrder.order_type === 'dine_in' && newOrder.table_id) {
      this.updateTable(newOrder.table_id, {
        status: 'occupied',
        current_order_id: newOrder.id
      });
    }

    // Auto-deduct stock if created directly in served or paid state
    if (newOrder.status === 'served' || newOrder.status === 'paid') {
      void this.deductStockForOrder(newOrder.id, newOrder.warehouse_id, newOrder.created_by);
    }

    return newOrder;
  }

  static async updateOrderStatus(orderId: string, status: OrderStatus, warehouseId?: string, userId?: string): Promise<RestaurantOrder | null> {
    const list = StorageEngine.getStored<RestaurantOrder[]>('restaurant_orders', []);
    const idx = list.findIndex(o => o.id === orderId);
    if (idx === -1) return null;

    const currentOrder = list[idx];
    list[idx] = {
      ...currentOrder,
      status,
      updated_at: new Date().toISOString()
    };
    this.saveOrders(list);

    // If order moves to 'served' or 'paid', trigger stock deduction if not already done
    if ((status === 'served' || status === 'paid') && !list[idx].is_stock_deducted) {
      await this.deductStockForOrder(orderId, warehouseId || list[idx].warehouse_id, userId);
    }

    // If order is marked as 'paid' or 'cancelled', free up the table if linked
    if ((status === 'paid' || status === 'cancelled') && list[idx].table_id) {
      const table = this.getTables(list[idx].company_id).find(t => t.id === list[idx].table_id);
      if (table && table.current_order_id === orderId) {
        this.updateTable(table.id, {
          status: 'available',
          current_order_id: undefined
        });
      }
    }

    return list[idx];
  }

  // Auto-deduct raw materials inventory based on menu item recipes
  static async deductStockForOrder(orderId: string, warehouseId?: string, userId?: string): Promise<boolean> {
    const orders = StorageEngine.getStored<RestaurantOrder[]>('restaurant_orders', []);
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return false;

    const order = orders[orderIndex];
    if (order.is_stock_deducted) return false; // Already deducted

    // Determine target warehouse
    const companyWarehouses = InventoryModule.getWarehouses(order.company_id);
    const targetWarehouseId = warehouseId || order.warehouse_id || companyWarehouses[0]?.id || 'wh-1';

    const stockMovements = InventoryModule.getStockMovements();
    let movementsCreated = 0;

    for (const item of order.items) {
      const recipe = this.getRecipeForMenuItem(item.menu_item_id);
      if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
        for (const ing of recipe.ingredients) {
          const totalQtyUsed = Number((ing.quantity_used * item.quantity).toFixed(4));
          if (totalQtyUsed <= 0) continue;

          const mov: StockMovement = {
            id: crypto.randomUUID(),
            doc_id: order.id,
            doc_no: order.order_number,
            doc_type: 'Issue',
            product_id: ing.inventory_item_id,
            warehouse_id: targetWarehouseId,
            qty_change: -totalQtyUsed,
            type: 'OUT',
            current_balance_after: InventoryModule.getProductStock(ing.inventory_item_id, targetWarehouseId) - totalQtyUsed,
            date: new Date().toISOString().split('T')[0],
            company_id: order.company_id,
            created_at: new Date().toISOString(),
            created_by: userId || order.created_by || 'system'
          };

          stockMovements.push(mov);
          movementsCreated++;
        }
      }
    }

    if (movementsCreated > 0) {
      await InventoryModule.saveStockMovements(stockMovements);
      InventoryModule.clearStockLookupIndex();
    }

    // Mark order as stock deducted
    orders[orderIndex].is_stock_deducted = true;
    orders[orderIndex].warehouse_id = targetWarehouseId;
    orders[orderIndex].updated_at = new Date().toISOString();
    this.saveOrders(orders);

    return true;
  }
}

