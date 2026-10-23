import React from 'react';
import { ShoppingCart, Plus, Building2, Printer, CheckCircle2 } from 'lucide-react';
import { PurchaseOrder, PurchasingWorkflowConfig } from '../../types/purchasing';
import { OrganizationUnit } from '../../types/organization';

interface PurchasingOrdersTabProps {
  isRtl: boolean;
  orders: PurchaseOrder[];
  orgUnits: OrganizationUnit[];
  workflowConfig: PurchasingWorkflowConfig;
  setShowDirectPO: (show: boolean) => void;
  setPrintPO: (po: PurchaseOrder | null) => void;
  setShowReceivePO: (poId: string | null) => void;
}

export default function PurchasingOrdersTab({
  isRtl,
  orders,
  orgUnits,
  workflowConfig,
  setShowDirectPO,
  setPrintPO,
  setShowReceivePO,
}: PurchasingOrdersTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
            {isRtl ? 'أوامر التوريد والشراء المباشر (PO)' : 'Binding Purchase Orders (PO)'}
          </h2>
          <p className="text-xs text-slate-500">
            {isRtl ? 'أوامر التوريد الصادرة للموردين واستلام الشحنات وتغذية الأرصدة والسجلات المالية' : 'Issued POs, shipment receipts, stock updates and financial logs'}
          </p>
        </div>
        {workflowConfig.allowDirectPoWithoutPr && (
          <button
            onClick={() => setShowDirectPO(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all"
          >
            <Plus className="h-4 w-4" />
            {isRtl ? 'إصدار أمر شراء مباشر' : 'Direct PO'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {orders.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
            <ShoppingCart className="h-12 w-12 text-slate-400 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
              {isRtl ? 'لا توجد أوامر شراء مسجلة حالياً' : 'No purchase orders recorded yet'}
            </p>
          </div>
        ) : (
          orders.map(po => (
            <div key={po.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600">
                    <ShoppingCart className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">{po.poNumber}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        po.status === 'RECEIVED' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                        po.status === 'CANCELLED' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' :
                        'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                      }`}>
                        {po.status === 'RECEIVED' ? (isRtl ? 'تم الاستلام بالمخزن' : 'Fully Received') :
                         po.status === 'CANCELLED' ? (isRtl ? 'ملغى' : 'Cancelled') :
                         (isRtl ? 'صادر / قيد التوريد' : 'Issued / Pending Delivery')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span>{isRtl ? `المورد: ${po.vendorName}` : `Vendor: ${po.vendorName}`}</span>
                      {po.prNumber && <span>| {isRtl ? 'مرجع الطلب:' : 'PR:'} {po.prNumber}</span>}
                      {po.org_unit_id && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                          <Building2 className="h-3 w-3" />
                          {orgUnits.find(u => u.id === po.org_unit_id)?.nameAr || orgUnits.find(u => u.id === po.org_unit_id)?.name}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">{po.date}</span>
                  <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                    {po.totalAmount.toLocaleString()} {isRtl ? 'ج.م' : 'EGP'}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                      <th className="p-2 rounded-r-lg">{isRtl ? 'الكود' : 'Code'}</th>
                      <th className="p-2">{isRtl ? 'الصنف' : 'Product'}</th>
                      <th className="p-2">{isRtl ? 'الكمية' : 'Qty'}</th>
                      <th className="p-2">{isRtl ? 'سعر الوحدة' : 'Unit Price'}</th>
                      <th className="p-2 rounded-l-lg">{isRtl ? 'الإجمالي' : 'Total'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {po.items.map((it, idx) => (
                      <tr key={idx} className="text-slate-700 dark:text-slate-300">
                        <td className="p-2 font-mono font-bold text-slate-500">{it.productCode}</td>
                        <td className="p-2 font-bold">{it.productName}</td>
                        <td className="p-2">{it.qty} {it.unit}</td>
                        <td className="p-2">{it.unitPrice.toLocaleString()}</td>
                        <td className="p-2 font-bold">{it.totalPrice.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* PO Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setPrintPO(po)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 text-xs font-bold"
                >
                  <Printer className="h-3.5 w-3.5" />
                  {isRtl ? 'طباعة أمر التوريد الرسمى' : 'Print PO'}
                </button>

                {po.status === 'ISSUED' && (
                  <button
                    onClick={() => setShowReceivePO(po.id)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {isRtl ? 'استلام الشحنة وتغذية المخزون' : 'Receive Goods & Update Stock'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
