import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingBag, 
  Plus, 
  Minus, 
  Trash2, 
  Search, 
  ChefHat, 
  Clock, 
  CheckCircle2, 
  CreditCard, 
  DollarSign, 
  Printer, 
  Users, 
  MapPin, 
  Phone, 
  User, 
  AlertCircle, 
  RefreshCw, 
  Layers, 
  Utensils, 
  ArrowRight,
  Check,
  X,
  FileText
} from 'lucide-react';
import { CompaniesModule } from '../db/companies';
import { UsersModule } from '../db/users';
import { InventoryModule } from '../db/inventory';
import { RestaurantEngine } from '../db/restaurant';
import { RestaurantPosTab } from '../components/restaurant/RestaurantPosTab';
import { RestaurantTablesTab } from '../components/restaurant/RestaurantTablesTab';
import { RestaurantKitchenTab } from '../components/restaurant/RestaurantKitchenTab';
import { 
  MenuItem, 
  MenuCategory, 
  RestaurantTable, 
  RestaurantOrder, 
  RestaurantOrderItem, 
  OrderType, 
  OrderStatus, 
  PaymentMethod 
} from '../types/restaurant';
import { Language, Theme } from '../types';

interface RestaurantOrdersProps {
  language: Language;
  theme: Theme;
}

export default function RestaurantOrders({ language, theme }: RestaurantOrdersProps) {
  const isRtl = language === 'ar';
  const activeUser = UsersModule.getActiveUser();
  const selectedCompanyId = CompaniesModule.getSelectedCompanyId();

  // Active sub-tab state
  const [activeTab, setActiveTab] = useState<'pos' | 'tables' | 'kitchen'>('pos');

  // Master Data
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');

  // POS State
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<RestaurantOrderItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [applyVat, setApplyVat] = useState<boolean>(true);

  // Modals & Notifications
  const [receiptModalOrder, setReceiptModalOrder] = useState<RestaurantOrder | null>(null);
  const [isAddTableOpen, setIsAddTableOpen] = useState<boolean>(false);
  const [newTableNumber, setNewTableNumber] = useState<string>('');
  const [newTableCapacity, setNewTableCapacity] = useState<number>(4);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load Data
  const loadData = () => {
    if (!selectedCompanyId) return;
    const cats = RestaurantEngine.getCategories(selectedCompanyId);
    const dishes = RestaurantEngine.getMenuItems(selectedCompanyId);
    const tbls = RestaurantEngine.getTables(selectedCompanyId);
    const ords = RestaurantEngine.getOrders(selectedCompanyId);
    const whs = InventoryModule.getWarehouses(selectedCompanyId);

    setCategories(cats);
    setMenuItems(dishes);
    setTables(tbls);
    setOrders(ords);
    setWarehouses(whs);

    if (whs.length > 0 && !selectedWarehouseId) {
      setSelectedWarehouseId(whs[0].id);
    }
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener('custody_db_updated', handleUpdate);
    return () => window.removeEventListener('custody_db_updated', handleUpdate);
  }, [selectedCompanyId]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3500);
  };

  // Filtered Menu Items
  const filteredDishes = useMemo(() => {
    return menuItems.filter(item => {
      const matchCat = selectedCategory === 'all' || item.category_id === selectedCategory;
      const matchQuery = !searchQuery || 
        item.name_ar.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.name_en.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery && item.is_available;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  // Cart Handlers
  const addToCart = (dish: MenuItem) => {
    setCart(prev => {
      const existingIdx = prev.findIndex(i => i.menu_item_id === dish.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const qty = updated[existingIdx].quantity + 1;
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: qty,
          total_price: Number((qty * dish.price).toFixed(2))
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            menu_item_id: dish.id,
            name_ar: dish.name_ar,
            name_en: dish.name_en,
            quantity: 1,
            unit_price: dish.price,
            total_price: dish.price,
            notes: ''
          }
        ];
      }
    });
  };

  const updateCartQuantity = (dishId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.menu_item_id === dishId) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          return {
            ...item,
            quantity: newQty,
            total_price: Number((newQty * item.unit_price).toFixed(2))
          };
        }
        return item;
      }).filter(Boolean) as RestaurantOrderItem[];
    });
  };

  const updateCartItemNote = (dishId: string, note: string) => {
    setCart(prev => prev.map(item => item.menu_item_id === dishId ? { ...item, notes: note } : item));
  };

  const removeFromCart = (dishId: string) => {
    setCart(prev => prev.filter(item => item.menu_item_id !== dishId));
  };

  const clearCart = () => {
    setCart([]);
    setSelectedTableId('');
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setDiscountAmount(0);
  };

  // Calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.total_price, 0);
  }, [cart]);

  const vatAmount = useMemo(() => {
    return applyVat ? Number((cartSubtotal * 0.14).toFixed(2)) : 0;
  }, [cartSubtotal, applyVat]);

  const cartTotal = useMemo(() => {
    const total = cartSubtotal + vatAmount - discountAmount;
    return total > 0 ? Number(total.toFixed(2)) : 0;
  }, [cartSubtotal, vatAmount, discountAmount]);

  // Submit Order
  const handleCreateOrder = (targetStatus: OrderStatus = 'pending') => {
    if (cart.length === 0) {
      showNotification('error', isRtl ? 'السلة فارغة! اختر بعض الوجبات أولاً' : 'Cart is empty!');
      return;
    }

    if (orderType === 'dine_in' && !selectedTableId) {
      showNotification('error', isRtl ? 'يرجى اختيار الطاولة للطلبات داخل الصالة' : 'Please select a table for Dine-in orders');
      return;
    }

    if (orderType === 'delivery' && !customerName) {
      showNotification('error', isRtl ? 'يرجى إدخال اسم العميل لطلب الدليفري' : 'Please enter customer name');
      return;
    }

    const selectedTable = tables.find(t => t.id === selectedTableId);

    const newOrder = RestaurantEngine.createOrder({
      company_id: selectedCompanyId,
      order_type: orderType,
      table_id: orderType === 'dine_in' ? selectedTableId : undefined,
      table_number: orderType === 'dine_in' ? selectedTable?.table_number : undefined,
      customer_name: customerName || undefined,
      customer_phone: customerPhone || undefined,
      delivery_address: deliveryAddress || undefined,
      items: cart,
      status: targetStatus,
      subtotal: cartSubtotal,
      tax: vatAmount,
      discount: discountAmount,
      total: cartTotal,
      payment_method: paymentMethod,
      warehouse_id: selectedWarehouseId,
      created_by: activeUser?.id
    });

    showNotification('success', isRtl ? `تم تسجيل الطلب بنجاح رقم [${newOrder.order_number}]` : `Order created [${newOrder.order_number}]`);
    
    // Automatically trigger thermal invoice view
    setReceiptModalOrder(newOrder);

    clearCart();
    loadData();
  };

  // Kitchen Order Status Advance
  const handleAdvanceOrderStatus = (order: RestaurantOrder, newStatus: OrderStatus) => {
    RestaurantEngine.updateOrderStatus(order.id, newStatus, selectedWarehouseId, activeUser?.id);
    showNotification('success', isRtl ? `تم تحديث حالة الطلب [${order.order_number}] إلى ${getStatusBadgeLabel(newStatus)}` : `Updated order status`);
    loadData();
  };

  // Add Table
  const handleAddTableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNumber) return;
    RestaurantEngine.addTable({
      company_id: selectedCompanyId,
      table_number: newTableNumber,
      capacity: newTableCapacity,
      status: 'available'
    });
    setNewTableNumber('');
    setIsAddTableOpen(false);
    showNotification('success', isRtl ? 'تم إضافة الطاولة بنجاح' : 'Table added successfully');
    loadData();
  };

  const getStatusBadgeLabel = (status: OrderStatus) => {
    switch (status) {
      case 'pending': return isRtl ? 'جديد' : 'New';
      case 'in_kitchen': return isRtl ? 'في المطبخ' : 'In Kitchen';
      case 'ready': return isRtl ? 'جاهز' : 'Ready';
      case 'served': return isRtl ? 'تم التقديم' : 'Served';
      case 'paid': return isRtl ? 'مدفوع' : 'Paid';
      case 'cancelled': return isRtl ? 'ملغي' : 'Cancelled';
      default: return status;
    }
  };

  const getStatusBadgeClass = (status: OrderStatus) => {
    switch (status) {
      case 'pending': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'in_kitchen': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'ready': return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20';
      case 'served': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'paid': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'cancelled': return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed bottom-6 left-6 z-50 p-4 rounded-xl border shadow-2xl flex items-center gap-3 animate-bounce-subtle ${
          notification.type === 'success' 
            ? 'bg-emerald-900/95 border-emerald-500/40 text-emerald-100' 
            : 'bg-rose-900/95 border-rose-500/40 text-rose-100'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <AlertCircle className="h-5 w-5 text-rose-400" />}
          <span className="text-xs font-bold font-sans">{notification.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className={`p-5 rounded-2xl border transition-all ${
        theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl border border-emerald-500/20">
              <ChefHat className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                {isRtl ? 'طلبات المطعم ونقطة البيع (POS)' : 'Restaurant Orders & POS'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isRtl 
                  ? 'إدارة كاشير الطلبات، خريطة الطاولات، والتخصيم التلقائي للمواد الخام من المخزن' 
                  : 'Manage POS orders, floor tables, and automatic raw material stock deduction'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Warehouse Selector */}
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-500" />
              <select
                value={selectedWarehouseId}
                onChange={e => setSelectedWarehouseId(e.target.value)}
                className={`text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${
                  theme === 'dark' ? 'bg-[#0f172a] border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tab Switchers */}
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setActiveTab('pos')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'pos'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                <span>{isRtl ? 'نقطة البيع (POS)' : 'POS'}</span>
              </button>

              <button
                onClick={() => setActiveTab('tables')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'tables'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                <span>{isRtl ? 'خريطة الطاولات' : 'Tables Floor'}</span>
                <span className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {tables.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('kitchen')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'kitchen'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <ChefHat className="h-3.5 w-3.5" />
                <span>{isRtl ? 'متابعة المطبخ' : 'Kitchen Kanban'}</span>
                <span className="bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {orders.filter(o => o.status !== 'paid' && o.status !== 'cancelled').length}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* TAB 1: POINT OF SALE (POS) */}
      {activeTab === 'pos' && (
        <RestaurantPosTab
          isRtl={isRtl}
          theme={theme}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filteredDishes={filteredDishes}
          categories={categories}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          addToCart={addToCart}
          orderType={orderType}
          setOrderType={setOrderType}
          selectedTableId={selectedTableId}
          setSelectedTableId={setSelectedTableId}
          tables={tables}
          customerName={customerName}
          setCustomerName={setCustomerName}
          customerPhone={customerPhone}
          setCustomerPhone={setCustomerPhone}
          deliveryAddress={deliveryAddress}
          setDeliveryAddress={setDeliveryAddress}
          cart={cart}
          updateCartItemNote={updateCartItemNote}
          updateCartQuantity={updateCartQuantity}
          removeFromCart={removeFromCart}
          cartSubtotal={cartSubtotal}
          applyVat={applyVat}
          setApplyVat={setApplyVat}
          vatAmount={vatAmount}
          discountAmount={discountAmount}
          setDiscountAmount={setDiscountAmount}
          cartTotal={cartTotal}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          handleCreateOrder={handleCreateOrder}
        />
      )}

      {/* TAB 2: TABLES FLOOR MAP */}
      {activeTab === 'tables' && (
        <RestaurantTablesTab
          isRtl={isRtl}
          tables={tables}
          orders={orders}
          setIsAddTableOpen={setIsAddTableOpen}
          setSelectedTableId={setSelectedTableId}
          setOrderType={setOrderType}
          setActiveTab={setActiveTab}
          setReceiptModalOrder={setReceiptModalOrder}
        />
      )}

      {/* TAB 3: KITCHEN KANBAN VIEW */}
      {activeTab === 'kitchen' && (
        <RestaurantKitchenTab
          isRtl={isRtl}
          theme={theme}
          orders={orders}
          getStatusBadgeLabel={getStatusBadgeLabel}
          getStatusBadgeClass={getStatusBadgeClass}
          handleAdvanceOrderStatus={handleAdvanceOrderStatus}
          setReceiptModalOrder={setReceiptModalOrder}
        />
      )}

      {/* MODAL 1: ADD TABLE */}
      {isAddTableOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {isRtl ? 'إضافة طاولة جديدة' : 'Add New Table'}
              </h3>
              <button onClick={() => setIsAddTableOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddTableSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'اسم / رقم الطاولة *' : 'Table Number/Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={newTableNumber}
                  onChange={e => setNewTableNumber(e.target.value)}
                  placeholder={isRtl ? 'مثلاً: طاولة 7 أو VIP-1' : 'e.g. Table 7'}
                  className={`w-full p-2 text-xs rounded-xl border ${
                    theme === 'dark' ? 'bg-[#0f172a] border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'السعة (عدد الأفراد)' : 'Capacity (Seats)'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={newTableCapacity}
                  onChange={e => setNewTableCapacity(Number(e.target.value))}
                  className={`w-full p-2 text-xs rounded-xl border ${
                    theme === 'dark' ? 'bg-[#0f172a] border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddTableOpen(false)}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-all"
                >
                  {isRtl ? 'حفظ الطاولة' : 'Save Table'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: THERMAL RECEIPT / INVOICE PREVIEW */}
      {receiptModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className={`w-full max-w-sm p-6 rounded-2xl border shadow-2xl space-y-4 ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex justify-between items-center border-b pb-3 border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Printer className="h-4 w-4 text-emerald-500" />
                <span>{isRtl ? 'فاتورة الطلب الحرارية' : 'Thermal Receipt'}</span>
              </h3>
              <button onClick={() => setReceiptModalOrder(null)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Thermal Receipt Body */}
            <div className="p-4 bg-white text-slate-900 rounded-xl font-mono text-xs border border-slate-200 space-y-3">
              <div className="text-center space-y-1">
                <h2 className="font-extrabold text-sm uppercase">KEMIT RESTAURANT</h2>
                <p className="text-[10px] text-slate-500">{isRtl ? 'فاتورة مبيعات مطعم' : 'Restaurant Invoice'}</p>
                <div className="text-[10px] text-slate-500 font-bold border-t border-b border-dashed border-slate-300 py-1 my-1">
                  {receiptModalOrder.order_number} | {new Date(receiptModalOrder.created_at).toLocaleString()}
                </div>
              </div>

              <div className="text-[11px] space-y-0.5">
                <div>{isRtl ? 'نوع الطلب:' : 'Type:'} <span className="font-bold">{receiptModalOrder.order_type}</span></div>
                {receiptModalOrder.table_number && <div>{isRtl ? 'الطاولة:' : 'Table:'} <span className="font-bold">{receiptModalOrder.table_number}</span></div>}
                {receiptModalOrder.customer_name && <div>{isRtl ? 'العميل:' : 'Customer:'} <span className="font-bold">{receiptModalOrder.customer_name}</span></div>}
              </div>

              <table className="w-full text-right text-[11px] border-t border-b border-slate-300 py-1">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="py-1">{isRtl ? 'الصنف' : 'Item'}</th>
                    <th className="py-1 text-center">{isRtl ? 'ع' : 'Qty'}</th>
                    <th className="py-1 text-left">{isRtl ? 'إجمالي' : 'Total'}</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptModalOrder.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-1">{isRtl ? item.name_ar : item.name_en}</td>
                      <td className="py-1 text-center">{item.quantity}</td>
                      <td className="py-1 text-left">{item.total_price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-1 text-[11px] pt-1">
                <div className="flex justify-between">
                  <span>{isRtl ? 'المجموع الفرعي:' : 'Subtotal:'}</span>
                  <span>{receiptModalOrder.subtotal} EGP</span>
                </div>
                {receiptModalOrder.tax > 0 && (
                  <div className="flex justify-between">
                    <span>{isRtl ? 'ضريبة القيمة المضافة (14%):' : 'VAT:'}</span>
                    <span>{receiptModalOrder.tax} EGP</span>
                  </div>
                )}
                {receiptModalOrder.discount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>{isRtl ? 'الخصم:' : 'Discount:'}</span>
                    <span>-{receiptModalOrder.discount} EGP</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-sm border-t border-slate-300 pt-1">
                  <span>{isRtl ? 'الإجمالي:' : 'Total:'}</span>
                  <span>{receiptModalOrder.total} EGP</span>
                </div>
              </div>

              <div className="text-center text-[10px] text-slate-500 pt-2 border-t border-dashed border-slate-300">
                {isRtl ? 'شكراً لزيارتكم! نتمنى لكم وجبة شهية' : 'Thank you for your visit!'}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>{isRtl ? 'طباعة الفاتورة' : 'Print Receipt'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
