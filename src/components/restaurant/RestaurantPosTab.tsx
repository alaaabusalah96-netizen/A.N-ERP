import React from 'react';
import { Search, Utensils, Plus, ShoppingBag, Minus, Trash2, DollarSign, CreditCard, ChefHat, Printer } from 'lucide-react';
import { MenuCategory, MenuItem, RestaurantOrderItem, RestaurantTable, OrderType, OrderStatus, PaymentMethod } from '../../types/restaurant';
import { Theme } from '../../types';

interface RestaurantPosTabProps {
  isRtl: boolean;
  theme: Theme;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredDishes: MenuItem[];
  categories: MenuCategory[];
  selectedCategory: string;
  setSelectedCategory: (catId: string) => void;
  addToCart: (dish: MenuItem) => void;
  orderType: OrderType;
  setOrderType: (type: OrderType) => void;
  selectedTableId: string;
  setSelectedTableId: (id: string) => void;
  tables: RestaurantTable[];
  customerName: string;
  setCustomerName: (name: string) => void;
  customerPhone: string;
  setCustomerPhone: (phone: string) => void;
  deliveryAddress: string;
  setDeliveryAddress: (address: string) => void;
  cart: RestaurantOrderItem[];
  updateCartItemNote: (dishId: string, note: string) => void;
  updateCartQuantity: (dishId: string, delta: number) => void;
  removeFromCart: (dishId: string) => void;
  cartSubtotal: number;
  applyVat: boolean;
  setApplyVat: (vat: boolean) => void;
  vatAmount: number;
  discountAmount: number;
  setDiscountAmount: (amt: number) => void;
  cartTotal: number;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (pm: PaymentMethod) => void;
  handleCreateOrder: (targetStatus?: OrderStatus) => void;
}

export const RestaurantPosTab: React.FC<RestaurantPosTabProps> = ({
  isRtl,
  theme,
  searchQuery,
  setSearchQuery,
  filteredDishes,
  categories,
  selectedCategory,
  setSelectedCategory,
  addToCart,
  orderType,
  setOrderType,
  selectedTableId,
  setSelectedTableId,
  tables,
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  deliveryAddress,
  setDeliveryAddress,
  cart,
  updateCartItemNote,
  updateCartQuantity,
  removeFromCart,
  cartSubtotal,
  applyVat,
  setApplyVat,
  vatAmount,
  discountAmount,
  setDiscountAmount,
  cartTotal,
  paymentMethod,
  setPaymentMethod,
  handleCreateOrder,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Menu Catalog (7 Cols) */}
      <div className="lg:col-span-7 space-y-4">
        {/* Category Pills & Search */}
        <div className={`p-4 rounded-2xl border ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isRtl ? 'بحث باسم الوجبة...' : 'Search dish...'}
                className={`w-full pr-9 pl-3 py-1.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  theme === 'dark' ? 'bg-[#0f172a] border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
            </div>

            <div className="text-xs text-slate-500 font-semibold">
              {isRtl ? `عدد الأطعمة المتاحة: ${filteredDishes.length}` : `Dishes: ${filteredDishes.length}`}
            </div>
          </div>

          {/* Categories Scrollable Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : theme === 'dark'
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isRtl ? 'الكل' : 'All'}
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-emerald-600 text-white shadow-md'
                    : theme === 'dark'
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {isRtl ? cat.name_ar : cat.name_en}
              </button>
            ))}
          </div>
        </div>

        {/* Dish Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filteredDishes.length === 0 ? (
            <div className="col-span-full p-8 text-center text-slate-500 text-xs font-semibold">
              {isRtl ? 'لا توجد وجبات تطابق البحث' : 'No menu items found'}
            </div>
          ) : (
            filteredDishes.map(dish => (
              <button
                key={dish.id}
                onClick={() => addToCart(dish)}
                className={`p-3 rounded-2xl border text-right transition-all group hover:scale-[1.02] active:scale-95 cursor-pointer flex flex-col justify-between h-32 ${
                  theme === 'dark' 
                    ? 'bg-[#1e293b] border-[#334155] hover:border-emerald-500/50' 
                    : 'bg-white border-slate-200 hover:border-emerald-500/50 shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-lg">
                      {dish.price} EGP
                    </span>
                    <Utensils className="h-3.5 w-3.5 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                  </div>
                  <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 line-clamp-2">
                    {isRtl ? dish.name_ar : dish.name_en}
                  </h4>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span>{isRtl ? 'انقر للإضافة' : 'Click to add'}</span>
                  <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                    <Plus className="h-3 w-3" />
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Column: Order Cart & Billing (5 Cols) */}
      <div className="lg:col-span-5 space-y-4">
        <div className={`p-4 rounded-2xl border flex flex-col h-full ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          {/* Order Type Switcher */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-4 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setOrderType('dine_in')}
              className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                orderType === 'dine_in' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {isRtl ? 'صالة (Dine-in)' : 'Dine-in'}
            </button>
            <button
              onClick={() => setOrderType('takeaway')}
              className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                orderType === 'takeaway' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {isRtl ? 'سفري (Takeaway)' : 'Takeaway'}
            </button>
            <button
              onClick={() => setOrderType('delivery')}
              className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                orderType === 'delivery' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {isRtl ? 'دليفري (Delivery)' : 'Delivery'}
            </button>
          </div>

          {/* Order Specific Details */}
          {orderType === 'dine_in' && (
            <div className="mb-4">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isRtl ? 'اختر الطاولة *' : 'Select Table *'}
              </label>
              <select
                value={selectedTableId}
                onChange={e => setSelectedTableId(e.target.value)}
                className={`w-full text-xs p-2 rounded-xl border focus:ring-2 focus:ring-emerald-500 ${
                  theme === 'dark' ? 'bg-[#0f172a] border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="">{isRtl ? '-- حدد رقم الطاولة --' : '-- Select Table --'}</option>
                {tables.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.table_number} ({isRtl ? `سعة: ${t.capacity}` : `Capacity: ${t.capacity}`}) - [{t.status === 'available' ? (isRtl ? 'متاحة' : 'Available') : (isRtl ? 'مشغولة' : 'Occupied')}]
                  </option>
                ))}
              </select>
            </div>
          )}

          {orderType === 'delivery' && (
            <div className="grid grid-cols-1 gap-2 mb-4">
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder={isRtl ? 'اسم العميل *' : 'Customer Name *'}
                className={`text-xs p-2 rounded-xl border ${
                  theme === 'dark' ? 'bg-[#0f172a] border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
              <input
                type="text"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder={isRtl ? 'رقم الهاتف' : 'Phone Number'}
                className={`text-xs p-2 rounded-xl border ${
                  theme === 'dark' ? 'bg-[#0f172a] border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
              <input
                type="text"
                value={deliveryAddress}
                onChange={e => setDeliveryAddress(e.target.value)}
                placeholder={isRtl ? 'عنوان التوصيل' : 'Delivery Address'}
                className={`text-xs p-2 rounded-xl border ${
                  theme === 'dark' ? 'bg-[#0f172a] border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
            </div>
          )}

          {/* Cart List */}
          <div className="flex-1 min-h-[220px] max-h-[320px] overflow-y-auto space-y-2 mb-4 pr-1">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2 py-8">
                <ShoppingBag className="h-10 w-10 opacity-40" />
                <span className="text-xs font-semibold">{isRtl ? 'السلة فارغة. انقر على الأطعمة لإضافتها' : 'Cart is empty'}</span>
              </div>
            ) : (
              cart.map(item => (
                <div
                  key={item.menu_item_id}
                  className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${
                    theme === 'dark' ? 'bg-[#0f172a] border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      {isRtl ? item.name_ar : item.name_en}
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {item.total_price} EGP
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={item.notes || ''}
                      onChange={e => updateCartItemNote(item.menu_item_id, e.target.value)}
                      placeholder={isRtl ? 'ملاحظات الوجبة (مثلاً: بدون بصل)...' : 'Dish notes...'}
                      className="text-[10px] p-1 px-2 rounded-lg border w-full bg-transparent border-slate-200 dark:border-slate-700"
                    />

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => updateCartQuantity(item.menu_item_id, -1)}
                        className="p-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 transition-colors"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-xs font-bold font-mono px-1.5">{item.quantity}</span>
                      <button
                        onClick={() => updateCartQuantity(item.menu_item_id, 1)}
                        className="p-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => removeFromCart(item.menu_item_id)}
                        className="p-1 rounded text-rose-500 hover:bg-rose-500/10 transition-colors mr-1"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Order Calculations Summary */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs mb-4">
            <div className="flex justify-between text-slate-500">
              <span>{isRtl ? 'المجموع الفرعي:' : 'Subtotal:'}</span>
              <span className="font-mono font-bold">{cartSubtotal} EGP</span>
            </div>

            <div className="flex justify-between items-center text-slate-500">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyVat}
                  onChange={e => setApplyVat(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>{isRtl ? 'ضريبة القيمة المضافة (14%):' : 'VAT (14%):'}</span>
              </label>
              <span className="font-mono font-bold">{vatAmount} EGP</span>
            </div>

            <div className="flex justify-between items-center text-slate-500">
              <span>{isRtl ? 'خصم:' : 'Discount:'}</span>
              <input
                type="number"
                min="0"
                value={discountAmount || ''}
                onChange={e => setDiscountAmount(Number(e.target.value))}
                placeholder="0"
                className="w-16 p-0.5 text-left text-xs font-mono rounded border bg-transparent text-right border-slate-300 dark:border-slate-700"
              />
            </div>

            <div className="flex justify-between text-sm font-extrabold text-slate-800 dark:text-slate-100 pt-2 border-t border-slate-200 dark:border-slate-700">
              <span>{isRtl ? 'الإجمالي النهائي:' : 'Grand Total:'}</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">{cartTotal} EGP</span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button
              onClick={() => setPaymentMethod('cash')}
              className={`py-1.5 text-xs font-bold rounded-xl border flex items-center justify-center gap-1 cursor-pointer ${
                paymentMethod === 'cash' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-300 dark:border-slate-700'
              }`}
            >
              <DollarSign className="h-3.5 w-3.5" />
              <span>{isRtl ? 'نقداً (Cash)' : 'Cash'}</span>
            </button>
            <button
              onClick={() => setPaymentMethod('card')}
              className={`py-1.5 text-xs font-bold rounded-xl border flex items-center justify-center gap-1 cursor-pointer ${
                paymentMethod === 'card' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-300 dark:border-slate-700'
              }`}
            >
              <CreditCard className="h-3.5 w-3.5" />
              <span>{isRtl ? 'فيزا/بطاقة' : 'Card'}</span>
            </button>
            <button
              onClick={() => setPaymentMethod('credit')}
              className={`py-1.5 text-xs font-bold rounded-xl border flex items-center justify-center gap-1 cursor-pointer ${
                paymentMethod === 'credit' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-300 dark:border-slate-700'
              }`}
            >
              <span>{isRtl ? 'حساب آجل' : 'Credit'}</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleCreateOrder('pending')}
              className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ChefHat className="h-4 w-4" />
              <span>{isRtl ? 'إرسال للمطبخ' : 'Send to Kitchen'}</span>
            </button>

            <button
              onClick={() => handleCreateOrder('paid')}
              className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>{isRtl ? 'دفع وطباعة الفاتورة' : 'Pay & Print'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
