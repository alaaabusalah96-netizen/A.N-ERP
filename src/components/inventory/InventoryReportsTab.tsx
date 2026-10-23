import React from 'react';
import {
  PackageCheck,
  FileSpreadsheet,
  FileText,
  PieChart,
  AlertTriangle,
  Printer,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { Warehouse, Product, InventoryLedgerEntry } from '../../types/inventory';
import { InventoryModule } from '../../db/inventory';
import { ReportType } from '../../pages/Inventory';

export interface InventoryReportsTabProps {
  isRtl: boolean;
  theme: 'light' | 'dark';
  language: 'en' | 'ar';
  activeReport: ReportType;
  setActiveReport: React.Dispatch<React.SetStateAction<ReportType>>;
  repWarehouse: string;
  setRepWarehouse: React.Dispatch<React.SetStateAction<string>>;
  warehouses: Warehouse[];
  repProduct: string;
  setRepProduct: React.Dispatch<React.SetStateAction<string>>;
  products: Product[];
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  reportBalances: Array<{
    id: string;
    code: string;
    name: string;
    unit: string;
    min_stock: number;
    totalStock: number;
    balances: Array<{
      warehouseId: string;
      warehouseName: string;
      stock: number;
    }>;
    isUnderMin: boolean;
    [key: string]: any;
  }>;
  reportStockCard: Array<{
    id: string;
    doc_no: string;
    date: string;
    doc_type: string;
    qty_change: number;
    runningBalance: number;
    created_by?: string;
    [key: string]: any;
  }>;
  reportItemLedger: InventoryLedgerEntry[];
  reportValuation: {
    items: Array<{
      id: string;
      name: string;
      code: string;
      totalStock: number;
      last_purchase_price?: number;
      valuation: number;
      [key: string]: any;
    }>;
    totalCostVal: number;
  };
  reportSlowMoving: Product[];
  getDocTypeLabel: (type: string, scrapAction?: 'IN' | 'OUT') => string;
}

export default function InventoryReportsTab({
  isRtl,
  theme,
  language,
  activeReport,
  setActiveReport,
  repWarehouse,
  setRepWarehouse,
  warehouses,
  repProduct,
  setRepProduct,
  products,
  setRefreshKey,
  reportBalances,
  reportStockCard,
  reportItemLedger,
  reportValuation,
  reportSlowMoving,
  getDocTypeLabel
}: InventoryReportsTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Left panel: Report selection menu */}
      <div className={`lg:col-span-1 p-4 rounded-3xl border h-fit space-y-2 ${
        theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'
      }`}>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 px-2">
          {isRtl ? 'قائمة التقارير والتحليلات' : 'Reports Directory'}
        </h3>
        
        <button
          onClick={() => setActiveReport('balances')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-right transition-all ${
            activeReport === 'balances'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>{isRtl ? 'أرصدة المخازن والحد الأدنى' : 'Warehouse Stock Balances'}</span>
          <PackageCheck size={14} />
        </button>

        <button
          onClick={() => setActiveReport('card')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-right transition-all ${
            activeReport === 'card'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>{isRtl ? 'حركة صنف (كارت الصنف)' : 'Stock Card Ledger'}</span>
          <FileSpreadsheet size={14} />
        </button>

        <button
          onClick={() => setActiveReport('ledger')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-right transition-all ${
            activeReport === 'ledger'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>{isRtl ? 'الأستاذ التحليلي للمخزون' : 'Enterprise Item Ledger'}</span>
          <FileText size={14} />
        </button>

        <button
          onClick={() => setActiveReport('valuation')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-right transition-all ${
            activeReport === 'valuation'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>{isRtl ? 'تقييم المخزون المالي' : 'Inventory Valuation (Cost)'}</span>
          <PieChart size={14} />
        </button>

        <button
          onClick={() => setActiveReport('slow_moving')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-right transition-all ${
            activeReport === 'slow_moving'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>{isRtl ? 'الأصناف الراكدة' : 'Slow Moving Items'}</span>
          <AlertTriangle size={14} />
        </button>

        <button
          onClick={() => setActiveReport('stocktake')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-right transition-all ${
            activeReport === 'stocktake'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>{isRtl ? 'تقرير وجدول جرد المخزون' : 'Stocktake Checklist'}</span>
          <Printer size={14} />
        </button>
      </div>

      {/* Right panel: Active Report Content */}
      <div className="lg:col-span-3 space-y-6">
        {/* Filter bar for Reports */}
        <div className={`p-4 rounded-3xl border grid grid-cols-1 md:grid-cols-3 gap-4 items-center ${
          theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'
        }`}>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{isRtl ? 'المستودع المستهدف' : 'Warehouse Target'}</label>
            <select
              value={repWarehouse}
              onChange={(e) => setRepWarehouse(e.target.value)}
              className={`w-full px-3 py-1.5 text-xs rounded-xl border focus:outline-none ${
                theme === 'dark' ? 'text-slate-200 bg-slate-800 border-slate-700' : 'text-slate-700 bg-white border-slate-200'
              }`}
            >
              <option value="all">{isRtl ? 'كل المستودعات' : 'All Warehouses'}</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {(activeReport === 'card' || activeReport === 'ledger') && (
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{isRtl ? 'اختر الصنف' : 'Select Product'}</label>
              <select
                value={repProduct}
                onChange={(e) => setRepProduct(e.target.value)}
                className={`w-full px-3 py-1.5 text-xs rounded-xl border focus:outline-none ${
                  theme === 'dark' ? 'text-slate-200 bg-slate-800 border-slate-700' : 'text-slate-700 bg-white border-slate-200'
                }`}
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} [{p.code}]</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex md:col-start-3 items-end justify-end pt-4">
            <button
              onClick={() => setRefreshKey(prev => prev + 1)}
              className="px-3.5 py-1.5 rounded-xl border border-dashed hover:bg-slate-800 text-slate-400 hover:text-white text-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={12} />
              <span>{isRtl ? 'تحديث البيانات' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* REPORT 1: STOCK BALANCES */}
        {activeReport === 'balances' && (
          <div className={`p-6 rounded-3xl border ${theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'}`}>
            <h3 className="text-sm font-black mb-4 text-emerald-600 dark:text-emerald-400">{isRtl ? 'مستند أرصدة المخازن والإنذار بالحد الأدنى' : 'Warehouse Balances & Min Alerts'}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold">
                    <th className="p-3">{isRtl ? 'الصنف' : 'Item Description'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الوحدة' : 'Unit'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الحد الأدنى للأمان' : 'Safety Min'}</th>
                    {warehouses.map(w => (
                      <th key={w.id} className="p-3 text-center">{w.name.split(' ')[0]}</th>
                    ))}
                    <th className="p-3 text-center">{isRtl ? 'إجمالي الرصيد الحالي' : 'Total Stock'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الحالة الرقابية' : 'Compliance Alert'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/30">
                  {reportBalances.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="p-3 font-semibold">
                        {p.name} <span className="text-[10px] font-mono text-slate-400">[{p.code}]</span>
                      </td>
                      <td className="p-3 text-center text-slate-500">{p.unit}</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-500">{p.min_stock}</td>
                      {p.balances.map(b => (
                        <td key={b.warehouseId} className="p-3 text-center font-mono font-bold">{b.stock}</td>
                      ))}
                      <td className="p-3 text-center font-mono font-black text-emerald-600 dark:text-emerald-400">{p.totalStock}</td>
                      <td className="p-3 text-center">
                        {p.isUnderMin ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold text-[10px]">
                            <AlertTriangle size={10} />
                            <span>{isRtl ? 'أقل من الحد الأدنى!' : 'Below Min!'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-bold text-[10px]">
                            <CheckCircle2 size={10} />
                            <span>{isRtl ? 'آمن ومستقر' : 'Secure'}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORT 2: STOCK CARD */}
        {activeReport === 'card' && (
          <div className={`p-6 rounded-3xl border ${theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'}`}>
            <h3 className="text-sm font-black mb-4 text-emerald-600 dark:text-emerald-400">{isRtl ? 'كارت الصنف والتحليل المستمر للحركات' : 'Stock Card Ledger Ledger'}</h3>
            {!repProduct ? (
              <p className="text-xs text-slate-400 italic text-center py-6">{isRtl ? 'يرجى اختيار صنف لعرض كارت التحليل الخاص به' : 'Please select product'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-bold">
                      <th className="p-3">{isRtl ? 'رقم المستند' : 'Document No.'}</th>
                      <th className="p-3">{isRtl ? 'التاريخ' : 'Date'}</th>
                      <th className="p-3">{isRtl ? 'النوع' : 'Doc Type'}</th>
                      <th className="p-3 text-center">{isRtl ? 'الكمية الواردة / المنصرفة' : 'Quantity Change'}</th>
                      <th className="p-3 text-center">{isRtl ? 'الرصيد بعد الحركة' : 'Balance After'}</th>
                      <th className="p-3">{isRtl ? 'بواسطة' : 'User'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/30">
                    {reportStockCard.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400 italic">{isRtl ? 'لا توجد حركات مخزنية مسجلة لهذا الصنف' : 'No movements recorded for this item'}</td>
                      </tr>
                    ) : (
                      reportStockCard.map(m => (
                        <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="p-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">{m.doc_no}</td>
                          <td className="p-3 text-slate-500 font-mono">{m.date}</td>
                          <td className="p-3 font-semibold">{m.doc_type}</td>
                          <td className={`p-3 text-center font-mono font-bold ${m.qty_change > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {m.qty_change > 0 ? `+${m.qty_change}` : m.qty_change}
                          </td>
                          <td className="p-3 text-center font-mono font-black text-slate-800 dark:text-slate-100">{m.runningBalance}</td>
                          <td className="p-3 text-slate-400">{m.created_by}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* REPORT: ENTERPRISE ITEM LEDGER */}
        {activeReport === 'ledger' && (
          <div className={`p-6 rounded-3xl border ${theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'}`}>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                  {isRtl ? 'دفتر الأستاذ التحليلي للمخزون والرقابة المالية' : 'Enterprise Continuous Item Ledger'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  {isRtl ? 'مسار التدقيق المالي الكامل، أرصدة اللحظية وتتبع التكلفة التاريخية للامتثال' : 'Real-time financial stock tracking, instant balance reconciliation & historic audit trail'}
                </p>
              </div>
              <button
                onClick={() => window.print()}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer self-end sm:self-auto"
              >
                <Printer size={12} />
                <span>{isRtl ? 'طباعة كشف الأستاذ' : 'Print Ledger Sheet'}</span>
              </button>
            </div>
            {!repProduct ? (
              <p className="text-xs text-slate-400 italic text-center py-6">{isRtl ? 'يرجى اختيار صنف لعرض كارت الأستاذ الخاص به' : 'Please select product'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-bold bg-slate-800/10 dark:bg-slate-800/30">
                      <th className="p-3">{isRtl ? 'المستند المرجعي' : 'Ref Document'}</th>
                      <th className="p-3">{isRtl ? 'التاريخ والوقت' : 'Date & Time'}</th>
                      <th className="p-3 text-center">{isRtl ? 'نوع الحركة' : 'Tx Type'}</th>
                      <th className="p-3 text-center">{isRtl ? 'الوارد (+)' : 'Qty In (+)'}</th>
                      <th className="p-3 text-center">{isRtl ? 'المنصرف (-)' : 'Qty Out (-)'}</th>
                      <th className="p-3 text-center text-slate-400">{isRtl ? 'الرصيد السابق' : 'Bal Before'}</th>
                      <th className="p-3 text-center text-emerald-500">{isRtl ? 'الرصيد بعد الحركة' : 'Bal After'}</th>
                      <th className="p-3 text-center">{isRtl ? 'تكلفة الوحدة' : 'Unit Cost'}</th>
                      <th className="p-3 text-center">{isRtl ? 'القيمة الجارية' : 'Running Value'}</th>
                      <th className="p-3">{isRtl ? 'المستخدم' : 'Operator'}</th>
                      <th className="p-3">{isRtl ? 'رمز التدقيق' : 'Audit Trace'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/30">
                    {reportItemLedger.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-6 text-center text-slate-400 italic">{isRtl ? 'لا توجد حركات مسجلة في الأستاذ لهذا الصنف' : 'No ledger records found for this item'}</td>
                      </tr>
                    ) : (
                      reportItemLedger.map(entry => (
                        <tr key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                          <td className="p-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">{entry.reference_document_no}</td>
                          <td className="p-3 text-slate-500 font-mono">
                            {new Date(entry.timestamp).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                          </td>
                          <td className="p-3 text-center">
                            <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">
                              {getDocTypeLabel(entry.transaction_type)}
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-500">
                            {entry.qty_in > 0 ? `+${entry.qty_in}` : '-'}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-rose-500">
                            {entry.qty_out > 0 ? `-${entry.qty_out}` : '-'}
                          </td>
                          <td className="p-3 text-center font-mono text-slate-400">{entry.balance_before}</td>
                          <td className="p-3 text-center font-mono font-black text-emerald-600 dark:text-emerald-400">{entry.balance_after}</td>
                          <td className="p-3 text-center font-mono text-slate-500">{entry.unit_cost.toLocaleString()} {isRtl ? 'ج.م' : 'EGP'}</td>
                          <td className="p-3 text-center font-mono font-black text-slate-700 dark:text-slate-200">{entry.running_cost.toLocaleString()} {isRtl ? 'ج.م' : 'EGP'}</td>
                          <td className="p-3 text-slate-500 font-medium">{entry.user_name || 'System'}</td>
                          <td className="p-3 text-slate-400 font-mono text-[10px]">{entry.audit_ref}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* REPORT 3: INVENTORY VALUATION */}
        {activeReport === 'valuation' && (
          <div className={`p-6 rounded-3xl border ${theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-emerald-600 dark:text-emerald-400">{isRtl ? 'تقييم المخزون الإجمالي وقيمة رأس المال السائل' : 'Inventory Valuation (Liquidity / Asset Cost)'}</h3>
              <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-xl px-4 py-2 text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase">{isRtl ? 'إجمالي القيمة المالية للمخزون' : 'Total Asset Cost'}</p>
                <p className="text-base font-mono font-black">{reportValuation.totalCostVal.toLocaleString()} EGP</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold">
                    <th className="p-3">{isRtl ? 'الصنف الكود والاسم' : 'Item Description'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الرصيد الكلي الحالي' : 'Total Available Stock'}</th>
                    <th className="p-3 text-center">{isRtl ? 'آخر سعر شراء معتمد' : 'Last Purchase Price'}</th>
                    <th className="p-3 text-center">{isRtl ? 'القيمة الإجمالية للمخزون (ج.م)' : 'Asset Value (EGP)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/30">
                  {reportValuation.items.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="p-3 font-semibold">
                        {p.name} <span className="text-[10px] font-mono text-slate-400">[{p.code}]</span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold">{p.totalStock}</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-500">{p.last_purchase_price || 0}</td>
                      <td className="p-3 text-center font-mono font-black text-emerald-600 dark:text-emerald-400">
                        {p.valuation.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORT 4: SLOW MOVING STOCK */}
        {activeReport === 'slow_moving' && (
          <div className={`p-6 rounded-3xl border ${theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'}`}>
            <h3 className="text-sm font-black mb-4 text-emerald-600 dark:text-emerald-400">{isRtl ? 'قائمة الأصناف الراكدة (التي لم يسجل لها حركات)' : 'Slow Moving Items Checklist (No Stock Activity)'}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold">
                    <th className="p-3">{isRtl ? 'الصنف الكود والاسم' : 'Item Description'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الوحدة' : 'Unit'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الحد الأدنى' : 'Min Safety limit'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الرصيد الإجمالي الحالي' : 'Total Current Stock'}</th>
                    <th className="p-3 text-center">{isRtl ? 'معدل الحركة' : 'Activity Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/30">
                  {reportSlowMoving.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400 italic">{isRtl ? 'لا توجد أصناف راكدة، جميع الأصناف نشطة ولها حركات' : 'No slow-moving items found'}</td>
                    </tr>
                  ) : (
                    reportSlowMoving.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                        <td className="p-3 font-semibold">
                          {p.name} <span className="text-[10px] font-mono text-slate-400">[{p.code}]</span>
                        </td>
                        <td className="p-3 text-center text-slate-500">{p.unit}</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-500">{p.min_stock}</td>
                        <td className="p-3 text-center font-mono font-bold">
                          {warehouses.reduce((sum, w) => sum + InventoryModule.getProductStock(p.id, w.id), 0)}
                        </td>
                        <td className="p-3 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 font-bold text-[10px]">
                            {isRtl ? 'راكد (خامل)' : 'STAGNANT'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORT 5: STOCKTAKE CHECKLIST */}
        {activeReport === 'stocktake' && (
          <div className={`p-6 rounded-3xl border ${theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-emerald-600 dark:text-emerald-400">{isRtl ? 'تقرير وكشف جرد الأرصدة المخزنية الفعلي' : 'Inventory Stocktake & Reconciliation Checklist'}</h3>
              <button
                onClick={() => window.print()}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Printer size={12} />
                <span>{isRtl ? 'طباعة كشف الجرد الميداني' : 'Print Stocktake Sheet'}</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold">
                    <th className="p-3">{isRtl ? 'الصنف' : 'Item Description'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الوحدة' : 'Unit'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الرصيد الدفتري الحالي' : 'System Stock'}</th>
                    <th className="p-3 text-center w-28">{isRtl ? 'الجرد الفعلي (يدوي)' : 'Physical Stock'}</th>
                    <th className="p-3 text-center w-28">{isRtl ? 'الفارق (العجز / الزيادة)' : 'Variance'}</th>
                    <th className="p-3">{isRtl ? 'توقيع المسؤول' : 'Signee'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/30">
                  {products.map(p => {
                    const totalStock = warehouses.reduce((sum, w) => sum + InventoryModule.getProductStock(p.id, w.id), 0);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                        <td className="p-3 font-semibold">
                          {p.name} <span className="text-[10px] font-mono text-slate-400">[{p.code}]</span>
                        </td>
                        <td className="p-3 text-center text-slate-500">{p.unit}</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">{totalStock}</td>
                        <td className="p-3 text-center">
                          <div className="h-6 w-20 border border-dashed border-slate-400 dark:border-slate-700 rounded mx-auto"></div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="h-6 w-20 border border-dashed border-slate-400 dark:border-slate-700 rounded mx-auto"></div>
                        </td>
                        <td className="p-3 text-slate-400 italic">..........................</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
