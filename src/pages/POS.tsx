import React, { useState, useEffect } from 'react';
import { 
  Plus, Minus, Trash2, ShoppingCart, Tag, CreditCard, 
  Smartphone, Monitor, Sparkles, Receipt, X, Check, Search, Printer, Building2
} from 'lucide-react';
import { StorageEngine } from '../db/storage';
import { InventoryModule } from '../db/inventory';
import { UsersModule } from '../db/users';
import { CompaniesModule } from '../db/companies';
import { LogsModule } from '../db/logs';
import { dbSetDoc } from '../firebase';
import { OrganizationEngine } from '../db/organizationEngine';
import { SalesBusinessEngine } from '../lib/enterprise/sales_engine';

interface POSProps {
  language: 'ar' | 'en';
  theme: 'light' | 'dark';
}

interface PosCartItem {
  id: string;
  productId: string;
  name: string;
  code: string;
  price: number;
  qty: number;
  unit: string;
}

export default function POS({ language, theme }: POSProps) {
  const isRtl = language === 'ar';
  const activeUser = UsersModule.getActiveUser();
  const companyId = activeUser?.company_id || CompaniesModule.getSelectedCompanyId() || '';

  // Core POS States
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Organization Engine State
  const [orgUnits, setOrgUnits] = useState<any[]>([]);
  const [selectedOrgUnitId, setSelectedOrgUnitId] = useState<string>('');

  // Modals & Receipts
  const [completedSale, setCompletedSale] = useState<any | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'WALLET'>('CASH');

  // Categories list
  const categories = [
    { id: 'ALL', nameAr: 'الكل', nameEn: 'All Items' },
    { id: 'FEED', nameAr: 'الأعلاف', nameEn: 'Feeds' },
    { id: 'POULTRY', nameAr: 'داجني', nameEn: 'Poultry' },
    { id: 'VET', nameAr: 'بيطري', nameEn: 'Veterinary' },
    { id: 'EQUIP', nameAr: 'معدات', nameEn: 'Equipment' }
  ];

  // Load Data
  const loadProducts = () => {
    const prd = InventoryModule.getProducts() || [];
    setProducts(prd);

    const units = OrganizationEngine.getUnits(companyId);
    setOrgUnits(units);
    if (!selectedOrgUnitId && units.length > 0) {
      setSelectedOrgUnitId(activeUser?.org_unit_id || units[0].id);
    }
  };

  useEffect(() => {
    loadProducts();
    const onUpdate = () => loadProducts();
    window.addEventListener('custody_db_updated', onUpdate);
    return () => window.removeEventListener('custody_db_updated', onUpdate);
  }, [companyId]);

  const getProductStockTotal = (prodId: string) => {
    const warehouses = InventoryModule.getWarehouses();
    return warehouses.reduce((sum, wh) => sum + InventoryModule.getProductStock(prodId, wh.id), 0);
  };

  // Cart Management
  const addToCart = (prod: any) => {
    const existing = cart.find(item => item.productId === prod.id);
    const availableStock = getProductStockTotal(prod.id);
    if (existing) {
      if (availableStock <= existing.qty) {
        alert(isRtl ? 'الكمية المطلوبة تتجاوز المتاح في المخزن!' : 'Requested quantity exceeds warehouse stock!');
        return;
      }
      setCart(cart.map(item => 
        item.productId === prod.id 
          ? { ...item, qty: item.qty + 1 } 
          : item
      ));
    } else {
      if (availableStock <= 0) {
        alert(isRtl ? 'هذا الصنف غير متوفر بالمخزن حالياً!' : 'This item is currently out of stock!');
        return;
      }
      const newItem: PosCartItem = {
        id: `cart-${Date.now()}`,
        productId: prod.id,
        name: prod.name,
        code: prod.code,
        price: prod.last_sale_price || prod.last_purchase_price || 150,
        qty: 1,
        unit: prod.unit || 'PCS'
      };
      setCart([...cart, newItem]);
    }
  };

  const updateQty = (productId: string, delta: number) => {
    const item = cart.find(i => i.productId === productId);
    if (!item) return;

    const availableStock = getProductStockTotal(productId);
    const maxQty = availableStock || 9999;

    const newQty = item.qty + delta;
    if (newQty > maxQty) {
      alert(isRtl ? 'عذراً، الرصيد المتاح غير كافٍ!' : 'Sorry, insufficient stock available!');
      return;
    }

    if (newQty <= 0) {
      setCart(cart.filter(i => i.productId !== productId));
    } else {
      setCart(cart.map(i => i.productId === productId ? { ...i, qty: newQty } : i));
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(i => i.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
  };

  // Cart Calculations
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const vatAmount = subtotal * 0.14; // Egypt standard VAT 14%
  const grandTotal = subtotal + vatAmount;

  // Finalize Sale
  const handleCheckout = async () => {
    if (!companyId) {
      alert(isRtl ? 'يرجى تحديد الشركة أولاً' : 'Please select a company first');
      return;
    }
    if (cart.length === 0) return;

    try {
      const saleRecord = await SalesBusinessEngine.processPOSCheckout(
        companyId,
        activeUser?.id || 'system',
        activeUser?.full_name || 'Cashier',
        {
          items: cart,
          subtotal,
          vatAmount,
          grandTotal,
          paymentMethod,
          org_unit_id: selectedOrgUnitId || activeUser?.org_unit_id
        }
      );

      // Audit and Log
      LogsModule.addLog(
        activeUser?.id || 'system',
        activeUser?.full_name || 'System',
        isRtl ? 'إجراء عملية بيع POS' : 'POS Checkout Processed',
        `Processed POS sale ${saleRecord.receiptNo} using ${paymentMethod}. Total: ${grandTotal.toLocaleString()} EGP`
      );

      setCompletedSale(saleRecord);
      setCart([]);
      loadProducts(); // Reload to see updated quantities
    } catch (err) {
      console.error('POS Checkout failed:', err);
    }
  };

  // Filter products by category & search query
  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategory === 'ALL' || 
                            p.category === selectedCategory || 
                            (selectedCategory === 'FEED' && p.name.includes('علف')) ||
                            (selectedCategory === 'POULTRY' && p.name.includes('كتكوت')) ||
                            (selectedCategory === 'VET' && p.name.includes('لقاح'));
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-10rem)] min-h-[500px]">
      
      {/* LEFT PANE: Catalog & Categories (8 Columns) */}
      <div className="lg:col-span-7 xl:col-span-8 flex flex-col space-y-4">
        
        {/* Header and Search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h1 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-1.5">
              <Monitor className="text-emerald-500 h-5 w-5" />
              <span>{isRtl ? 'كاشير نقاط البيع السريع (POS)' : 'Retail Point of Sale Terminal'}</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {orgUnits.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <Building2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <select
                  value={selectedOrgUnitId}
                  onChange={(e) => setSelectedOrgUnitId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                >
                  {orgUnits.map((u) => (
                    <option key={u.id} value={u.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                      {isRtl ? (u.nameAr || u.name) : (u.nameEn || u.name)} ({u.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="relative w-full sm:w-48">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder={isRtl ? 'ابحث عن صنف بالاسم أو الكود...' : 'Search item or barcode...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Categories Tab list */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {isRtl ? cat.nameAr : cat.nameEn}
            </button>
          ))}
        </div>

        {/* Catalog Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pr-1">
          {filteredProducts.map((p) => {
            const availableStock = getProductStockTotal(p.id);
            const isOutOfStock = availableStock <= 0;
            return (
              <button
                key={p.id}
                disabled={isOutOfStock}
                onClick={() => addToCart(p)}
                className={`p-3 rounded-xl border text-right flex flex-col justify-between transition-all active:scale-95 text-xs font-sans h-[135px] cursor-pointer ${
                  isOutOfStock
                    ? 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 opacity-50 cursor-not-allowed'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-500/50 dark:hover:border-emerald-500/30 hover:shadow-md'
                }`}
              >
                <div className="w-full text-left">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 bg-slate-50 dark:bg-slate-800 rounded text-slate-400 font-bold uppercase">{p.code}</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 dark:text-slate-100 truncate text-[11px] mt-1.5">{p.name}</h3>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold mt-1">
                    <span>{availableStock} {p.unit}</span>
                    <span className="text-emerald-500 font-extrabold font-mono">{(p.last_sale_price || p.last_purchase_price || 150).toLocaleString()} EGP</span>
                  </div>
                </div>
                {isOutOfStock && (
                  <span className="text-[9px] text-rose-500 font-bold mt-1 block uppercase tracking-wider">{isRtl ? 'نفذت الكمية' : 'Out of Stock'}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT PANE: active ticket (4 Columns) */}
      <div className="lg:col-span-5 xl:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between overflow-hidden shadow-lg">
        
        {/* Ticket Title */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800 dark:text-white">
            <ShoppingCart className="h-4 w-4 text-emerald-500" />
            <h3 className="text-xs font-black uppercase tracking-wider">{isRtl ? 'سلة المشتريات والطلب' : 'Active Sales Ticket'}</h3>
          </div>
          <button
            onClick={clearCart}
            disabled={cart.length === 0}
            className="text-[10px] font-bold text-rose-500 hover:text-rose-600 disabled:opacity-50"
          >
            {isRtl ? 'تفريغ' : 'Clear All'}
          </button>
        </div>

        {/* Ticket cart items container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <Receipt className="h-10 w-10 text-slate-300 dark:text-slate-700 animate-pulse mb-3" />
              <p className="text-xs font-medium leading-relaxed">
                {isRtl ? 'سلة المشتريات فارغة.\nاضغط على الأصناف في اليسار لإضافتها للفاتورة.' : 'Ticket is empty. Tap items on the catalog grid to build active receipt.'}
              </p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-2 border-b border-slate-100 dark:border-slate-800/50">
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{item.name}</h4>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{(item.price).toLocaleString()} EGP</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQty(item.productId, -1)}
                    className="p-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="text-xs font-bold font-mono w-5 text-center">{item.qty}</span>
                  <button
                    onClick={() => updateQty(item.productId, 1)}
                    className="p-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500"
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    onClick={() => removeFromCart(item.productId)}
                    className="text-rose-500 hover:text-rose-600 p-1 rounded ml-1"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals & Payments checkout */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-4">
          
          {/* Calculators summary */}
          <div className="space-y-1.5 text-xs font-medium">
            <div className="flex justify-between text-slate-500">
              <span>{isRtl ? 'الإجمالي الفرعي:' : 'Subtotal:'}</span>
              <span className="font-mono">{subtotal.toLocaleString()} EGP</span>
            </div>
            <div className="flex justify-between text-indigo-500 font-semibold">
              <span>{isRtl ? 'ضريبة القيمة المضافة (14%):' : 'VAT (14%):'}</span>
              <span className="font-mono">{vatAmount.toLocaleString()} EGP</span>
            </div>
            <div className="flex justify-between text-sm font-black text-slate-800 dark:text-white border-t border-slate-200/50 dark:border-slate-800 pt-2">
              <span>{isRtl ? 'المبلغ المطلوب سداده:' : 'Grand Net Total:'}</span>
              <span className="font-mono text-emerald-600">{grandTotal.toLocaleString()} EGP</span>
            </div>
          </div>

          {/* Payment selector */}
          <div className="grid grid-cols-3 gap-1.5">
            {(['CASH', 'CARD', 'WALLET'] as const).map(method => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(method)}
                className={`py-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  paymentMethod === method
                    ? 'border-emerald-600 bg-emerald-500/10 text-emerald-600 font-bold'
                    : 'border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-950'
                }`}
              >
                {method === 'CASH' && <Receipt size={14} />}
                {method === 'CARD' && <CreditCard size={14} />}
                {method === 'WALLET' && <Smartphone size={14} />}
                <span className="text-[10px] font-semibold mt-0.5">
                  {method === 'CASH' && (isRtl ? 'نقدي' : 'Cash')}
                  {method === 'CARD' && (isRtl ? 'فيزا/شبكة' : 'Card')}
                  {method === 'WALLET' && (isRtl ? 'محفظة' : 'Wallet')}
                </span>
              </button>
            ))}
          </div>

          {/* Pay Trigger Button */}
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs transition-all active:scale-95 shadow-md shadow-emerald-900/10 disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2"
          >
            <Check size={16} />
            <span>{isRtl ? 'إتمام عملية البيع وطباعة الفاتورة' : 'Complete Sale & Pay'}</span>
          </button>
        </div>
      </div>

      {/* POS THERMAL RECEIPT MODAL */}
      {completedSale && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl relative text-slate-900 font-sans border border-slate-200">
            <button
              onClick={() => setCompletedSale(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X size={16} />
            </button>
            
            {/* Success check badge */}
            <div className="flex flex-col items-center text-center mb-4">
              <div className="h-10 w-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-2">
                <Check size={20} />
              </div>
              <h3 className="text-sm font-black text-emerald-600">{isRtl ? 'تمت عملية البيع بنجاح' : 'Payment Completed Successfully'}</h3>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{completedSale.receiptNo}</p>
            </div>

            {/* Simulated Thermal Ticket paper */}
            <div className="border-t-2 border-dashed border-slate-300 pt-3 pb-3 space-y-3 text-[11px] font-mono">
              <div className="text-center">
                <h4 className="text-sm font-black uppercase">KEMIT ERP POS SYSTEM</h4>
                <p className="text-[10px] text-slate-500 mt-1">{new Date(completedSale.timestamp).toLocaleString()}</p>
              </div>

              {/* Items List */}
              <div className="space-y-1.5 pt-2 border-t border-dashed border-slate-200">
                {completedSale.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.name} x {item.qty}</span>
                    <span>{(item.price * item.qty).toLocaleString()} EGP</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-dashed border-slate-200 pt-2 space-y-1">
                <div className="flex justify-between">
                  <span>SUBTOTAL:</span>
                  <span>{completedSale.subtotal.toLocaleString()} EGP</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT (14%):</span>
                  <span>{completedSale.vatAmount.toLocaleString()} EGP</span>
                </div>
                <div className="flex justify-between font-black text-xs border-t border-dashed border-slate-300 pt-1">
                  <span>NET TOTAL:</span>
                  <span>{completedSale.grandTotal.toLocaleString()} EGP</span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="pt-2 text-center text-[10px] text-slate-500 border-t border-dashed border-slate-200">
                <p>Payment: {completedSale.paymentMethod} | Cashier: {completedSale.cashier}</p>
                <p className="mt-1">*** Thank you for your business! ***</p>
              </div>
            </div>

            {/* Print and Close buttons */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer"
              >
                <Printer size={13} />
                <span>{isRtl ? 'طباعة' : 'Print'}</span>
              </button>
              <button
                onClick={() => setCompletedSale(null)}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                {isRtl ? 'موافق' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
