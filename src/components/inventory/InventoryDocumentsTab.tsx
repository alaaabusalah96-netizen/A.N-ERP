import React from 'react';
import { Search, TrendingUp, Eye, PackageCheck } from 'lucide-react';
import { InventoryDocument, Warehouse } from '../../types/inventory';
import { InventoryModule } from '../../db/inventory';

export interface InventoryDocumentsTabProps {
  isRtl: boolean;
  activeDocSubTab: 'all' | 'transit';
  setActiveDocSubTab: React.Dispatch<React.SetStateAction<'all' | 'transit'>>;
  transitDocsCount: number;
  theme: 'light' | 'dark';
  filterSearch: string;
  setFilterSearch: React.Dispatch<React.SetStateAction<string>>;
  filterType: string;
  setFilterType: React.Dispatch<React.SetStateAction<string>>;
  filterWarehouse: string;
  setFilterWarehouse: React.Dispatch<React.SetStateAction<string>>;
  warehouses: Warehouse[];
  filterStatus: string;
  setFilterStatus: React.Dispatch<React.SetStateAction<string>>;
  filteredDocs: InventoryDocument[];
  getDocTypeLabel: (type: string, scrapAction?: 'IN' | 'OUT') => string;
  setSelectedDocId: React.Dispatch<React.SetStateAction<string | null>>;
  transitDocs: InventoryDocument[];
  receivedItemsInput: { [prodId: string]: { qty_received: number; variance_reason: string } };
  setReceivedItemsInput: React.Dispatch<React.SetStateAction<{ [prodId: string]: { qty_received: number; variance_reason: string } }>>;
  setReceivedNotesInput: React.Dispatch<React.SetStateAction<string>>;
  setReceivingDocId: React.Dispatch<React.SetStateAction<string | null>>;
  receivingDocId: string | null;
  documents: InventoryDocument[];
  receivedNotesInput: string;
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
}

export default function InventoryDocumentsTab({
  isRtl,
  activeDocSubTab,
  setActiveDocSubTab,
  transitDocsCount,
  theme,
  filterSearch,
  setFilterSearch,
  filterType,
  setFilterType,
  filterWarehouse,
  setFilterWarehouse,
  warehouses,
  filterStatus,
  setFilterStatus,
  filteredDocs,
  getDocTypeLabel,
  setSelectedDocId,
  transitDocs,
  receivedItemsInput,
  setReceivedItemsInput,
  setReceivedNotesInput,
  setReceivingDocId,
  receivingDocId,
  documents,
  receivedNotesInput,
  setRefreshKey,
}: InventoryDocumentsTabProps) {
  return (
    <div className="space-y-4 text-right" dir={isRtl ? 'rtl' : 'ltr'}>
      
      {/* Inner Sub-tab navigation: Vouchers list vs Multi-Echelon Logistics Transit */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 pb-0.5">
        <button
          onClick={() => setActiveDocSubTab('all')}
          className={`pb-3 text-xs md:text-sm font-black transition-all ${
            activeDocSubTab === 'all'
              ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-black'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          {isRtl ? 'كافة السندات والعهود' : 'All Vouchers & Vouchers'}
        </button>
        <button
          onClick={() => setActiveDocSubTab('transit')}
          className={`pb-3 text-xs md:text-sm font-black transition-all flex items-center gap-2 ${
            activeDocSubTab === 'transit'
              ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-black'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <span>{isRtl ? 'شحنات التحويل اللوجستية قيد النقل' : 'In-Transit Logistics Transfers'}</span>
          {transitDocsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-900 animate-bounce">
              {transitDocsCount}
            </span>
          )}
        </button>
      </div>

      {activeDocSubTab === 'all' ? (
        <>
          {/* Controls / Filter row */}
          <div className={`p-4 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4 ${
            theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'
          }`}>
            {/* Search inputs */}
            <div className="relative flex items-center w-full md:w-80">
              <Search size={14} className="absolute right-3.5 text-slate-400" />
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder={isRtl ? 'ابحث برقم المستند، المستلم، البيان...' : 'Search by voucher, recipient...'}
                className={`w-full pr-10 pl-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
            </div>

            {/* Select dropdown filters */}
            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              {/* Type Filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className={`px-3 py-2 text-xs border rounded-xl font-medium focus:outline-none ${
                  theme === 'dark' ? 'text-slate-200 bg-slate-800 border-slate-700' : 'text-slate-700 bg-white border-slate-200'
                }`}
              >
                <option value="all">{isRtl ? 'كل أنواع المستندات' : 'All Document Types'}</option>
                <option value="Receipt">{isRtl ? 'إذن استلام (الاستلامات)' : 'Receipt'}</option>
                <option value="Addition">{isRtl ? 'إذن إضافة' : 'Addition'}</option>
                <option value="Issue">{isRtl ? 'إذن صرف' : 'Issue'}</option>
                <option value="Transfer">{isRtl ? 'تحويل بين مخازن' : 'Transfer'}</option>
                <option value="BranchTransfer">{isRtl ? 'تحويل إلى فرع' : 'Branch Transfer'}</option>
                <option value="StationTransfer">{isRtl ? 'تحويل إلى محطة' : 'Station Transfer'}</option>
                <option value="BranchReturn">{isRtl ? 'مرتجع فرع/محطة' : 'Branch Return'}</option>
                <option value="SupplierReturn">{isRtl ? 'مرتجع إلى مورد' : 'Supplier Return'}</option>
                <option value="Adjustment">{isRtl ? 'تسوية جرد' : 'Adjustment'}</option>
                <option value="Damage">{isRtl ? 'خردة / كهنة' : 'Scrap / Obsolete'}</option>
              </select>

              {/* Warehouse Filter */}
              <select
                value={filterWarehouse}
                onChange={(e) => setFilterWarehouse(e.target.value)}
                className={`px-3 py-2 text-xs border rounded-xl font-medium focus:outline-none ${
                  theme === 'dark' ? 'text-slate-200 bg-slate-800 border-slate-700' : 'text-slate-700 bg-white border-slate-200'
                }`}
              >
                <option value="all">{isRtl ? 'كل المستودعات' : 'All Warehouses'}</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className={`px-3 py-2 text-xs border rounded-xl font-medium focus:outline-none ${
                  theme === 'dark' ? 'text-slate-200 bg-slate-800 border-slate-700' : 'text-slate-700 bg-white border-slate-200'
                }`}
              >
                <option value="all">{isRtl ? 'كل الحالات' : 'All Statuses'}</option>
                <option value="Draft">{isRtl ? 'مسودة' : 'Draft'}</option>
                <option value="Pending">{isRtl ? 'قيد المراجعة' : 'Pending'}</option>
                <option value="Dispatched">{isRtl ? 'شحنة قيد النقل' : 'Dispatched'}</option>
                <option value="Posted">{isRtl ? 'مرحل / معتمد' : 'Posted'}</option>
                <option value="Rejected">{isRtl ? 'مرفوض' : 'Rejected'}</option>
                <option value="Cancelled">{isRtl ? 'ملغي' : 'Cancelled'}</option>
              </select>
            </div>
          </div>

          {/* Documents Table */}
          <div className={`rounded-3xl border overflow-hidden ${
            theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className={`text-[11px] font-bold border-b ${
                    theme === 'dark' ? 'bg-slate-800/30 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}>
                    <th className="p-4">{isRtl ? 'رقم المستند' : 'Doc No.'}</th>
                    <th className="p-4">{isRtl ? 'التاريخ' : 'Date'}</th>
                    <th className="p-4">{isRtl ? 'نوع المستند' : 'Type'}</th>
                    <th className="p-4">{isRtl ? 'المخزن الرئيسي' : 'Warehouse'}</th>
                    <th className="p-4">{isRtl ? 'عدد الأصناف' : 'Items'}</th>
                    <th className="p-4">{isRtl ? 'المستلم / الجهة' : 'Recipient / Entity'}</th>
                    <th className="p-4 text-center">{isRtl ? 'الحالة' : 'Status'}</th>
                    <th className="p-4 text-center">{isRtl ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {filteredDocs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 font-semibold italic">
                        {isRtl ? 'لا توجد مستندات مخزنية تطابق الفلاتر المحددة' : 'No inventory documents match the active filters'}
                      </td>
                    </tr>
                  ) : (
                    filteredDocs.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                        <td className="p-4 font-bold text-emerald-600 dark:text-emerald-400 font-mono">{doc.doc_no}</td>
                        <td className="p-4 text-slate-500 dark:text-slate-400 font-mono">{doc.date}</td>
                        <td className="p-4 font-semibold">
                          <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-1 rounded text-xs font-bold">
                            {getDocTypeLabel(doc.doc_type, doc.scrap_action)}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500 dark:text-slate-400">
                          {warehouses.find(w => w.id === doc.source_warehouse_id)?.name || doc.source_warehouse_id}
                        </td>
                        <td className="p-4 font-bold font-mono">{doc.items.length}</td>
                        <td className="p-4 text-slate-600 dark:text-slate-300 max-w-[150px] truncate">
                          {doc.recipient || doc.dest_entity_id || '---'}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                            doc.status === 'Posted' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                            doc.status === 'Dispatched' ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30' :
                            doc.status === 'Pending' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                            doc.status === 'Draft' ? 'bg-slate-500/10 text-slate-400 border border-slate-500/15' :
                            'bg-slate-500/10 text-slate-400 border border-slate-500/15'
                          }`}>
                            {doc.status === 'Posted' ? (isRtl ? 'مرحل ومكتمل' : 'Posted') :
                             doc.status === 'Dispatched' ? (isRtl ? 'شحنة قيد النقل' : 'In Transit') :
                             doc.status === 'Pending' ? (isRtl ? 'مراجعة معلقة' : 'Pending Approval') :
                             doc.status === 'Draft' ? (isRtl ? 'مسودة' : 'Draft') : doc.status}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => setSelectedDocId(doc.id)}
                            className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1 mx-auto"
                          >
                            <Eye size={12} />
                            <span className="text-[10px] font-black">{isRtl ? 'عرض ومسار الاعتماد' : 'Review Path'}</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* MULTI-ECHELON IN-TRANSIT QUEUE */
        <div className="space-y-4">
          <div className="p-4 rounded-2xl border bg-amber-500/5 border-amber-500/10 flex items-center gap-3">
            <TrendingUp className="text-amber-500" size={20} />
            <div className="text-xs">
              <h4 className="font-black text-amber-600 dark:text-amber-400">{isRtl ? 'بوابة التحويلات الميدانية اللوجستية (Multi-Echelon Control Console)' : 'Multi-Echelon Logistics Control Console'}</h4>
              <p className="text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                {isRtl 
                  ? 'الشحنات الصادرة التي تم خصمها بالفعل من مخزن المنشأ، وبانتظار تأكيد الاستلام والفحص لتقييدها بمخازن الفروع والوصول النهائي.' 
                  : 'Dispatched transfers subtracted from source, awaiting receipt verification to be posted to receiving branch ledger.'}
              </p>
            </div>
          </div>

          <div className={`rounded-3xl border overflow-hidden ${
            theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className={`text-[11px] font-bold border-b ${
                    theme === 'dark' ? 'bg-slate-800/30 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}>
                    <th className="p-4">{isRtl ? 'رقم الشحنة' : 'Voucher No.'}</th>
                    <th className="p-4">{isRtl ? 'تاريخ الشحن' : 'Shipped Date'}</th>
                    <th className="p-4">{isRtl ? 'نوع التحويل' : 'Transfer Type'}</th>
                    <th className="p-4">{isRtl ? 'مخزن الشحن' : 'From Warehouse'}</th>
                    <th className="p-4">{isRtl ? 'جهة الاستقبال' : 'To Entity'}</th>
                    <th className="p-4">{isRtl ? 'تفاصيل الشحنة' : 'Shipped Items'}</th>
                    <th className="p-4 text-center">{isRtl ? 'الحالة اللوجستية' : 'Logistics State'}</th>
                    <th className="p-4 text-center">{isRtl ? 'إجراء الاستقبال' : 'Receipt Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {transitDocs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 font-semibold italic">
                        {isRtl ? 'لا توجد شحنات في حالة نقل حالياً' : 'No dispatched transfers are currently in transit'}
                      </td>
                    </tr>
                  ) : (
                    transitDocs.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                        <td className="p-4 font-bold text-amber-500 font-mono">{doc.doc_no}</td>
                        <td className="p-4 text-slate-500 font-mono">{doc.date}</td>
                        <td className="p-4">
                          <span className="bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded text-[10px] font-black">
                            {getDocTypeLabel(doc.doc_type)}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500">
                          {warehouses.find(w => w.id === doc.source_warehouse_id)?.name || doc.source_warehouse_id}
                        </td>
                        <td className="p-4 font-bold text-emerald-600 dark:text-emerald-400">
                          {warehouses.find(w => w.id === doc.dest_entity_id)?.name || `${doc.dest_entity_id} (${doc.dest_entity_type})`}
                        </td>
                        <td className="p-4 text-slate-500 max-w-[180px] truncate">
                          {doc.items.map(item => `${item.product_name} (${item.qty})`).join('، ')}
                        </td>
                        <td className="p-4 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-lg text-[9px] font-black bg-amber-500/15 text-amber-500 animate-pulse border border-amber-500/20">
                            {isRtl ? 'قيد الشحن والتوصيل' : 'In-Transit'}
                          </span>
                        </td>
                        <td className="p-4 text-center flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedDocId(doc.id)}
                            className="p-1 px-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Eye size={11} />
                            <span className="text-[10px] font-bold">{isRtl ? 'عرض المستند' : 'View'}</span>
                          </button>
                          <button
                            onClick={() => {
                              const initialInput: typeof receivedItemsInput = {};
                              doc.items.forEach(item => {
                                initialInput[item.product_id] = { qty_received: item.qty, variance_reason: '' };
                              });
                              setReceivedItemsInput(initialInput);
                              setReceivedNotesInput('');
                              setReceivingDocId(doc.id);
                            }}
                            className="p-1 px-2.5 rounded-lg bg-amber-500 text-slate-900 hover:bg-amber-400 transition-all cursor-pointer flex items-center gap-1"
                          >
                            <PackageCheck size={11} />
                            <span className="text-[10px] font-bold">{isRtl ? 'تأكيد الاستلام' : 'Receive'}</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT CONFIRMATION OVERLAY MODAL FORM */}
      {receivingDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-right" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className={`w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border p-6 md:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200 ${
            theme === 'dark' ? 'bg-[#0f172a] border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-800'
          }`}>
            {/* Header */}
            <div className="border-b border-slate-100 dark:border-slate-800/80 pb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base md:text-lg font-black flex items-center gap-2 text-amber-500">
                  <PackageCheck size={20} />
                  <span>{isRtl ? 'تأكيد فحص واستلام شحنة تحويل مخزني' : 'Verify & Confirm Transfer Stock Receipt'}</span>
                </h3>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  {isRtl 
                    ? 'يرجى مطابقة الكميات الفعلية المستلمة وإدخال أي عجز أو فروقات للمطابقة المالية والرقابية.' 
                    : 'Confirm physical counts received on site. Record any shortages for dual audit resolution.'}
                </p>
              </div>
            </div>

            {/* Body Table of Items for receipt mapping */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                    <th className="p-3">{isRtl ? 'الصنف كود واسم' : 'Item'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الكمية المشحونة' : 'Shipped Qty'}</th>
                    <th className="p-3 text-center w-28">{isRtl ? 'الكمية المستلمة فعلياً' : 'Received Qty'}</th>
                    <th className="p-3">{isRtl ? 'سبب العجز / الملاحظات' : 'Variance Reason'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/30">
                  {documents.find(d => d.id === receivingDocId)?.items.map((item, index) => {
                    const stateItem = receivedItemsInput[item.product_id] || { qty_received: item.qty, variance_reason: '' };
                    const hasVariance = stateItem.qty_received !== item.qty;

                    return (
                      <tr key={index} className="hover:bg-slate-50/20 dark:hover:bg-slate-800/10">
                        <td className="p-3 font-semibold">
                          <p>{item.product_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono font-bold">[{item.product_code}]</p>
                        </td>
                        <td className="p-3 text-center font-mono font-black text-slate-500">{item.qty}</td>
                        <td className="p-3">
                          <input
                            type="number"
                            min={0}
                            max={item.qty}
                            value={stateItem.qty_received}
                            onChange={(e) => {
                              const val = Math.min(item.qty, Math.max(0, Number(e.target.value) || 0));
                              setReceivedItemsInput(prev => ({
                                ...prev,
                                [item.product_id]: { ...stateItem, qty_received: val }
                              }));
                            }}
                            className={`w-full p-2 text-center text-xs font-mono font-black rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                              theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                            }`}
                          />
                        </td>
                        <td className="p-3">
                          {hasVariance ? (
                            <input
                              type="text"
                              value={stateItem.variance_reason}
                              onChange={(e) => {
                                setReceivedItemsInput(prev => ({
                                  ...prev,
                                  [item.product_id]: { ...stateItem, variance_reason: e.target.value }
                                }));
                              }}
                              placeholder={isRtl ? 'يرجى إدخال سبب الفارق...' : 'Why the variance?'}
                              className={`w-full p-2 text-xs rounded-lg border focus:outline-none focus:ring-2 focus:ring-rose-500/15 ${
                                theme === 'dark' ? 'bg-slate-800 border-rose-900/30 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-800'
                              }`}
                              required
                            />
                          ) : (
                            <span className="text-slate-400 text-[10px] italic">{isRtl ? 'مطابق بالكامل' : 'Perfect Match'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Received Notes */}
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-slate-400">{isRtl ? 'ملاحظات الاستلام العامة والترخيص اللوجستي' : 'Logistics General Receipt Comments'}</label>
              <textarea
                rows={3}
                value={receivedNotesInput}
                onChange={(e) => setReceivedNotesInput(e.target.value)}
                placeholder={isRtl ? 'ملاحظات إضافية بخصوص النقل أو فحص الجودة والتعبئة...' : 'Optional comment about transit, quality audit, security seal...'}
                className={`w-full p-3 rounded-2xl border text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
              <button
                onClick={() => setReceivingDocId(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={async () => {
                  const doc = documents.find(d => d.id === receivingDocId);
                  if (!doc) return;

                  // Build received items list
                  const receivedList = doc.items.map(item => {
                    const input = receivedItemsInput[item.product_id] || { qty_received: item.qty, variance_reason: '' };
                    return {
                      product_id: item.product_id,
                      qty_received: input.qty_received,
                      variance_reason: input.variance_reason
                    };
                  });

                  // Validate that if there's any variance, a reason is provided
                  const missingReason = receivedList.some((item, idx) => {
                    const originalQty = doc.items[idx].qty;
                    return item.qty_received !== originalQty && !item.variance_reason.trim();
                  });

                  if (missingReason) {
                    alert(isRtl 
                      ? 'يرجى إدخال سبب الفارق/العجز لجميع الأصناف التي بها اختلاف في الكمية.' 
                      : 'Please specify a variance reason for all items with shortages.');
                    return;
                  }

                  const res = await InventoryModule.receiveTransferDocument(receivingDocId, receivedList, receivedNotesInput);
                  if (res.success) {
                    setReceivingDocId(null);
                    setRefreshKey(prev => prev + 1);
                    setSelectedDocId(null); // Return to list view
                  } else {
                    alert(isRtl ? res.messageAr : res.messageEn);
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-600/15 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <PackageCheck size={15} />
                <span>{isRtl ? 'تأكيد الاستلام والتقييد المالي بالمخازن' : 'Confirm & Post to Ledger'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
