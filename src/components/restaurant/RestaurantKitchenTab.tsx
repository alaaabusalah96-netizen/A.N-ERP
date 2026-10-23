import React from 'react';
import { Check, Printer } from 'lucide-react';
import { RestaurantOrder, OrderStatus } from '../../types/restaurant';
import { Theme } from '../../types';

interface RestaurantKitchenTabProps {
  isRtl: boolean;
  theme: Theme;
  orders: RestaurantOrder[];
  getStatusBadgeLabel: (status: OrderStatus) => string;
  getStatusBadgeClass: (status: OrderStatus) => string;
  handleAdvanceOrderStatus: (order: RestaurantOrder, targetStatus: OrderStatus) => void;
  setReceiptModalOrder: (order: RestaurantOrder | null) => void;
}

export const RestaurantKitchenTab: React.FC<RestaurantKitchenTabProps> = ({
  isRtl,
  theme,
  orders,
  getStatusBadgeLabel,
  getStatusBadgeClass,
  handleAdvanceOrderStatus,
  setReceiptModalOrder,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {(['pending', 'in_kitchen', 'ready', 'served'] as OrderStatus[]).map(statusCol => {
        const colOrders = orders.filter(o => o.status === statusCol);
        return (
          <div
            key={statusCol}
            className={`p-3 rounded-2xl border min-h-[500px] flex flex-col ${
              theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-slate-100/70 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                {getStatusBadgeLabel(statusCol)}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                {colOrders.length}
              </span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto">
              {colOrders.map(order => (
                <div
                  key={order.id}
                  className={`p-3 rounded-xl border transition-all ${
                    theme === 'dark' ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-100">
                      {order.order_number}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getStatusBadgeClass(order.status)}`}>
                      {order.order_type === 'dine_in' ? (order.table_number || (isRtl ? 'صالة' : 'Dine-in')) : order.order_type === 'takeaway' ? (isRtl ? 'سفري' : 'Takeaway') : (isRtl ? 'دليفري' : 'Delivery')}
                    </span>
                  </div>

                  {order.customer_name && (
                    <div className="text-[11px] text-slate-500 font-semibold mb-2">
                      👤 {order.customer_name} {order.customer_phone ? `(${order.customer_phone})` : ''}
                    </div>
                  )}

                  {/* Items List */}
                  <div className="space-y-1 mb-3 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg text-xs">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                        <span>{item.quantity}x {isRtl ? item.name_ar : item.name_en}</span>
                        {item.notes && <span className="text-[10px] text-amber-500">({item.notes})</span>}
                      </div>
                    ))}
                  </div>

                  {/* Raw Material Stock Deduction Status */}
                  <div className="flex items-center justify-between text-[10px] mb-3">
                    <span className="text-slate-400">{isRtl ? 'خصم المخزون:' : 'Stock Deduction:'}</span>
                    {order.is_stock_deducted ? (
                      <span className="text-emerald-500 font-bold flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        {isRtl ? 'تم التخصيم' : 'Deducted'}
                      </span>
                    ) : (
                      <span className="text-amber-500 font-bold">{isRtl ? 'في انتظار الخدمة' : 'Pending'}</span>
                    )}
                  </div>

                  {/* Action buttons to advance status */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {statusCol === 'pending' && (
                      <button
                        onClick={() => handleAdvanceOrderStatus(order, 'in_kitchen')}
                        className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-[11px] transition-all cursor-pointer"
                      >
                        {isRtl ? 'بدء التحضير' : 'Start Preparing'}
                      </button>
                    )}
                    {statusCol === 'in_kitchen' && (
                      <button
                        onClick={() => handleAdvanceOrderStatus(order, 'ready')}
                        className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-[11px] transition-all cursor-pointer"
                      >
                        {isRtl ? 'جاهز للتقديم' : 'Mark Ready'}
                      </button>
                    )}
                    {statusCol === 'ready' && (
                      <button
                        onClick={() => handleAdvanceOrderStatus(order, 'served')}
                        className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-[11px] transition-all cursor-pointer"
                      >
                        {isRtl ? 'تقديم وتخصيم مخزون' : 'Serve & Deduct'}
                      </button>
                    )}
                    {statusCol === 'served' && (
                      <button
                        onClick={() => handleAdvanceOrderStatus(order, 'paid')}
                        className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px] transition-all cursor-pointer"
                      >
                        {isRtl ? 'تحصيل الحساب (إغلاق)' : 'Mark Paid'}
                      </button>
                    )}
                    <button
                      onClick={() => setReceiptModalOrder(order)}
                      className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 transition-colors"
                      title="View Receipt"
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
