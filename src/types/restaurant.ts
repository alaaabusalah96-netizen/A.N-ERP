export interface MenuCategory {
  id: string;
  company_id: string;
  name_ar: string;
  name_en: string;
  display_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface MenuItem {
  id: string;
  company_id: string;
  category_id: string;
  name_ar: string;
  name_en: string;
  description?: string;
  price: number; // selling price EGP
  is_available: boolean;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RecipeIngredient {
  inventory_item_id: string; // product ID in inventory
  quantity_used: number; // e.g. 0.25 (kg or liters)
  unit: string; // e.g. 'كجم', 'لتر', 'جرام'
}

export interface Recipe {
  id: string;
  company_id: string;
  menu_item_id: string;
  ingredients: RecipeIngredient[];
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MenuItemWithCost extends MenuItem {
  category_name_ar?: string;
  category_name_en?: string;
  cost: number;
  gross_profit: number;
  margin_percentage: number;
  ingredients_count: number;
}

export type TableStatus = 'available' | 'occupied' | 'reserved';

export interface RestaurantTable {
  id: string;
  company_id: string;
  table_number: string; // e.g. "طاولة 1", "T-01"
  capacity: number; // e.g. 4
  status: TableStatus;
  current_order_id?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type OrderStatus = 'pending' | 'in_kitchen' | 'ready' | 'served' | 'paid' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'credit';

export interface RestaurantOrderItem {
  menu_item_id: string;
  name_ar: string;
  name_en: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string;
}

export interface RestaurantOrder {
  id: string;
  company_id: string;
  order_number: string; // e.g. "ORD-1001"
  order_type: OrderType;
  table_id?: string;
  table_number?: string;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string;
  items: RestaurantOrderItem[];
  status: OrderStatus;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payment_method?: PaymentMethod;
  is_stock_deducted?: boolean;
  warehouse_id?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}
