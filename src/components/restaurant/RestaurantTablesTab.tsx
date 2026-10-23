import React from 'react';
import { Plus, Users } from 'lucide-react';
import { RestaurantTable, RestaurantOrder, OrderType } from '../../types/restaurant';

interface RestaurantTablesTabProps {
  isRtl: boolean;
  tables: RestaurantTable[];
  orders: RestaurantOrder[];
  setIsAddTableOpen: (open: boolean) => void;
  setSelectedTableId: (id: string) => void;
  setOrderType: (type: OrderType) => void;
  setActiveTab: (tab: 'pos' | 'tables' | 'kitchen') => void;
  setReceiptModalOrder: (order: RestaurantOrder | null) => void;
}

export const RestaurantTablesTab: React.FC<RestaurantTablesTabProps> = ({
  isRtl,
  tables,
  orders,
  setIsAddTableOpen,
  setSelectedTableId,
  setOrderType,
  setActiveTab,
  setReceiptModalOrder,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-emerald-500 inline-block" />
            {isRtl ? `متاحة (${tables.filter(t => t.status === 'available').length})` : `Available`}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-rose-500 inline-block" />
            {isRtl ? `مشغولة (${tables.filter(t => t.status === 'occupied').length})` : `Occupied`}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-amber-500 inline-block" />
            {isRtl ? `محجوزة (${tables.filter(t => t.status === 'reserved').length})` : `Reserved`}
          </span>
        </div>

        <button
          onClick={() => setIsAddTableOpen(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>{isRtl ? 'إضافة طاولة جديدة' : 'Add Table'}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {tables.map(table => {
          const activeOrder = orders.find(o => o.id === table.current_order_id);
          return (
            <div
              key={table.id}
              className={`p-4 rounded-2xl border transition-all flex flex-col justify-between h-44 relative ${
                table.status === 'available'
                  ? 'bg-emerald-500/5 border-emerald-500/30 dark:bg-emerald-950/20'
                  : table.status === 'occupied'
                    ? 'bg-rose-500/5 border-rose-500/30 dark:bg-rose-950/20'
                    : 'bg-amber-500/5 border-amber-500/30 dark:bg-amber-950/20'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                    table.status === 'available'
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      : table.status === 'occupied'
                        ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                        : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                  }`}>
                    {table.status === 'available' ? (isRtl ? 'متاحة' : 'Available') : table.status === 'occupied' ? (isRtl ? 'مشغولة' : 'Occupied') : (isRtl ? 'محجوزة' : 'Reserved')}
                  </span>

                  <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {table.capacity}
                  </span>
                </div>

                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                  {table.table_number}
                </h3>

                {table.status === 'occupied' && activeOrder && (
                  <div className="mt-2 text-[11px] space-y-0.5 font-mono text-slate-600 dark:text-slate-300">
                    <div>{activeOrder.order_number}</div>
                    <div className="font-bold text-emerald-600 dark:text-emerald-400">{activeOrder.total} EGP</div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800">
                {table.status === 'available' ? (
                  <button
                    onClick={() => {
                      setSelectedTableId(table.id);
                      setOrderType('dine_in');
                      setActiveTab('pos');
                    }}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-[11px] transition-all cursor-pointer"
                  >
                    {isRtl ? 'فتح طلب جديد' : 'New Order'}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (activeOrder) setReceiptModalOrder(activeOrder);
                    }}
                    className="w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-[11px] transition-all cursor-pointer"
                  >
                    {isRtl ? 'عرض الطلب / تسوية' : 'View Order'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
