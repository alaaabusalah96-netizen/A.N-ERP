import React from 'react';
import {
  RefreshCw,
  Building2,
  MapPin,
  Layers,
  Plus
} from 'lucide-react';
import { Warehouse, Product } from '../../types/inventory';
import { InventoryModule } from '../../db/inventory';
import { CustodyDB } from '../../db';
import WarehouseTreeSelect from '../WarehouseTreeSelect';
import WarehouseHierarchyManager from '../WarehouseHierarchyManager';

export interface InventoryWarehousesTabProps {
  isRtl: boolean;
  theme: 'light' | 'dark';
  activeUser?: { company_id?: string; [key: string]: any } | null;
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  relocShow: boolean;
  setRelocShow: React.Dispatch<React.SetStateAction<boolean>>;
  setRelocSuccess: React.Dispatch<React.SetStateAction<string>>;
  setRelocError: React.Dispatch<React.SetStateAction<string>>;
  relocError: string;
  relocSuccess: string;
  relocWhId: string;
  setRelocWhId: React.Dispatch<React.SetStateAction<string>>;
  setRelocFromBinId: React.Dispatch<React.SetStateAction<string>>;
  setRelocToBinId: React.Dispatch<React.SetStateAction<string>>;
  relocProdId: string;
  setRelocProdId: React.Dispatch<React.SetStateAction<string>>;
  products: Product[];
  relocFromBinId: string;
  relocToBinId: string;
  relocQty: number;
  setRelocQty: React.Dispatch<React.SetStateAction<number>>;
  warehouses: Warehouse[];
  whEnforceCap: Record<string, boolean>;
  setWhEnforceCap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  whCapQty: Record<string, number>;
  setWhCapQty: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  selectedWhForBins: string | null;
  setSelectedWhForBins: React.Dispatch<React.SetStateAction<string | null>>;
  setBinShowForm: React.Dispatch<React.SetStateAction<boolean>>;
  setBinEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  binShowForm: boolean;
  binFormName: string;
  setBinFormName: React.Dispatch<React.SetStateAction<string>>;
  binFormCode: string;
  setBinFormCode: React.Dispatch<React.SetStateAction<string>>;
  binFormZone: string;
  setBinFormZone: React.Dispatch<React.SetStateAction<string>>;
  binFormCapacity: string;
  setBinFormCapacity: React.Dispatch<React.SetStateAction<string>>;
  binEditingId: string | null;
}

export default function InventoryWarehousesTab({
  isRtl,
  theme,
  activeUser,
  setRefreshKey,
  relocShow,
  setRelocShow,
  setRelocSuccess,
  setRelocError,
  relocError,
  relocSuccess,
  relocWhId,
  setRelocWhId,
  setRelocFromBinId,
  setRelocToBinId,
  relocProdId,
  setRelocProdId,
  products,
  relocFromBinId,
  relocToBinId,
  relocQty,
  setRelocQty,
  warehouses,
  whEnforceCap,
  setWhEnforceCap,
  whCapQty,
  setWhCapQty,
  selectedWhForBins,
  setSelectedWhForBins,
  setBinShowForm,
  setBinEditingId,
  binShowForm,
  binFormName,
  setBinFormName,
  binFormCode,
  setBinFormCode,
  binFormZone,
  setBinFormZone,
  binFormCapacity,
  setBinFormCapacity,
  binEditingId
}: InventoryWarehousesTabProps) {
  return (
    <div className="space-y-6">
      {/* Warehouse Hierarchy Tree & Template Manager */}
      <WarehouseHierarchyManager
        companyId={activeUser?.company_id || CustodyDB.getSelectedCompanyId() || ''}
        isRtl={isRtl}
        theme={theme}
        onWarehousesUpdated={() => setRefreshKey(prev => prev + 1)}
      />

      {/* Header & Internal Relocation Action */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-3xl border bg-slate-500/5 dark:bg-slate-800/10">
        <div>
          <h3 className="text-sm font-black text-emerald-600 dark:text-emerald-400">
            {isRtl ? 'بنية السعة والتنظيم الداخلي (الحاويات والرفوف)' : 'Storage Capacities & Internal Bins'}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {isRtl 
              ? 'قم بتعيين حدود السعة القصوى لكل مستودع، وإنشاء وإدارة الحاويات والرفوف الداخلية (Bins)' 
              : 'Configure storage capacities per warehouse and organize internal bins or racks.'}
          </p>
        </div>
        
        <button
          onClick={() => {
            setRelocShow(!relocShow);
            setRelocSuccess('');
            setRelocError('');
          }}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow shadow-emerald-600/10 flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw size={14} className={relocShow ? 'rotate-180 transition-transform duration-300' : ''} />
          <span>{isRtl ? 'مناقلة داخلية بين الحاويات' : 'Internal Bin Relocation'}</span>
        </button>
      </div>

      {/* INTERNAL BIN RELOCATION FORM */}
      {relocShow && (
        <div className={`p-6 rounded-3xl border space-y-4 shadow-lg ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-slate-50 border-slate-200'
        }`}>
          <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <RefreshCw size={13} />
            <span>{isRtl ? 'طلب مناقلة داخلية للمخزون' : 'Internal Bin-to-Bin Stock Transfer'}</span>
          </h4>

          {relocError && (
            <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl font-bold">
              {relocError}
            </div>
          )}
          {relocSuccess && (
            <div className="p-3 text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl font-bold">
              {relocSuccess}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-1">{isRtl ? 'المخزن الرئيسي' : 'Warehouse'}</label>
              <WarehouseTreeSelect
                value={relocWhId}
                onChange={(whId) => {
                  setRelocWhId(whId);
                  setRelocFromBinId('');
                  setRelocToBinId('');
                }}
                companyId={activeUser?.company_id || CustodyDB.getSelectedCompanyId() || ''}
                isRtl={isRtl}
                theme={theme}
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-1">{isRtl ? 'الصنف المستهدف' : 'Product'}</label>
              <select
                value={relocProdId}
                disabled={!relocWhId}
                onChange={(e) => setRelocProdId(e.target.value)}
                className={`w-full px-3 py-1.5 text-xs rounded-xl border focus:outline-none ${
                  theme === 'dark' ? 'text-slate-200 bg-slate-800 border-slate-700' : 'text-slate-700 bg-white border-slate-200'
                }`}
              >
                <option value="">{isRtl ? '-- اختر الصنف --' : '-- Select Product --'}</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} [{p.code}]</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-1">{isRtl ? 'الحاوية المصدر' : 'From Bin'}</label>
              <select
                value={relocFromBinId}
                disabled={!relocWhId}
                onChange={(e) => setRelocFromBinId(e.target.value)}
                className={`w-full px-3 py-1.5 text-xs rounded-xl border focus:outline-none ${
                  theme === 'dark' ? 'text-slate-200 bg-slate-800 border-slate-700' : 'text-slate-700 bg-white border-slate-200'
                }`}
              >
                <option value="">{isRtl ? '-- اختر الحاوية --' : '-- Select Bin --'}</option>
                {InventoryModule.getWarehouseBins(relocWhId).map(b => {
                  const avail = relocProdId ? InventoryModule.getBinProductStock(relocProdId, b.id) : 0;
                  return (
                    <option key={b.id} value={b.id}>{b.name} ({b.code}) - {isRtl ? `رصيد: ${avail}` : `Stock: ${avail}`}</option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-1">{isRtl ? 'الحاوية المستهدفة' : 'To Bin'}</label>
              <select
                value={relocToBinId}
                disabled={!relocWhId}
                onChange={(e) => setRelocToBinId(e.target.value)}
                className={`w-full px-3 py-1.5 text-xs rounded-xl border focus:outline-none ${
                  theme === 'dark' ? 'text-slate-200 bg-slate-800 border-slate-700' : 'text-slate-700 bg-white border-slate-200'
                }`}
              >
                <option value="">{isRtl ? '-- اختر الحاوية --' : '-- Select Bin --'}</option>
                {InventoryModule.getWarehouseBins(relocWhId)
                  .filter(b => b.id !== relocFromBinId)
                  .map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                  ))
                }
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-1">{isRtl ? 'الكمية المنقولة' : 'Transfer Qty'}</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={relocQty}
                  onChange={(e) => setRelocQty(parseInt(e.target.value) || 1)}
                  className={`w-full px-3 py-1 text-xs rounded-xl border focus:outline-none font-mono ${
                    theme === 'dark' ? 'text-slate-200 bg-slate-800 border-slate-700' : 'text-slate-700 bg-white border-slate-200'
                  }`}
                />
                <button
                  onClick={async () => {
                    setRelocError('');
                    setRelocSuccess('');
                    if (!relocWhId || !relocProdId || !relocFromBinId || !relocToBinId || relocQty <= 0) {
                      setRelocError(isRtl ? 'يرجى ملء جميع الحقول أولاً' : 'Please fill all inputs first');
                      return;
                    }
                    const res = await InventoryModule.relocateBinStock(
                      activeUser?.company_id || CustodyDB.getSelectedCompanyId() || '',
                      relocWhId,
                      relocProdId,
                      relocFromBinId,
                      relocToBinId,
                      relocQty
                    );
                    if (res.success) {
                      setRelocSuccess(isRtl ? res.messageAr : res.messageEn);
                      setRefreshKey(prev => prev + 1);
                    } else {
                      setRelocError(isRtl ? res.messageAr : res.messageEn);
                    }
                  }}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition-all cursor-pointer active:scale-95 shrink-0"
                >
                  {isRtl ? 'نقل الآن' : 'Execute'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WAREHOUSE CARDS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {warehouses.map(wh => {
          const totalStock = InventoryModule.getWarehouseTotalStock(wh.id);
          const isEnforced = whEnforceCap[wh.id] !== undefined ? whEnforceCap[wh.id] : !!wh.is_capacity_enforced;
          const capQty = whCapQty[wh.id] !== undefined ? whCapQty[wh.id] : wh.max_capacity_qty || 0;
          const utilization = capQty > 0 ? (totalStock / capQty) * 100 : 0;
          const binsList = InventoryModule.getWarehouseBins(wh.id);

          return (
            <div key={wh.id} className={`p-6 rounded-3xl border flex flex-col justify-between gap-6 transition-all shadow-md ${
              theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'
            }`}>
              {/* Title & Location */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase bg-slate-500/10 px-2.5 py-0.5 rounded border border-slate-500/10">
                    {wh.code}
                  </span>
                  <Building2 size={16} className="text-emerald-500" />
                </div>
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 mt-2">{wh.name}</h4>
                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                  <MapPin size={10} />
                  <span>{wh.location || (isRtl ? 'غير محدد' : 'Not Specified')}</span>
                </p>
              </div>

              {/* Capacity Settings Panel */}
              <div className="p-4 rounded-2xl bg-slate-500/5 dark:bg-slate-800/20 border border-slate-200/40 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{isRtl ? 'تفعيل رقابة السعة' : 'Enforce Capacity Limit'}</span>
                  <input
                    type="checkbox"
                    checked={isEnforced}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setWhEnforceCap(prev => ({ ...prev, [wh.id]: val }));
                    }}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{isRtl ? 'السعة القصوى (وحدة)' : 'Max capacity (units)'}</span>
                  <input
                    type="number"
                    min="0"
                    value={capQty || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setWhCapQty(prev => ({ ...prev, [wh.id]: val }));
                    }}
                    className={`w-24 px-2 py-1 text-xs rounded-lg border text-center font-mono focus:outline-none ${
                      theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  />
                </div>

                {/* Progress Bar */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                    <span>{isRtl ? `الاستهلاك: %${utilization.toFixed(1)}` : `Utilized: ${utilization.toFixed(1)}%`}</span>
                    <span>{totalStock} / {capQty || '∞'}</span>
                  </div>
                  <div className="w-full bg-slate-300 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        utilization > 90 ? 'bg-rose-500' : utilization > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, utilization)}%` }}
                    />
                  </div>
                </div>

                {/* Save Button for capacity */}
                <button
                  onClick={() => {
                    const allWh = InventoryModule.getWarehouses();
                    const targetIdx = allWh.findIndex(w => w.id === wh.id);
                    if (targetIdx !== -1) {
                      allWh[targetIdx] = {
                        ...allWh[targetIdx],
                        is_capacity_enforced: isEnforced,
                        max_capacity_qty: capQty || undefined
                      };
                      InventoryModule.saveWarehouses(allWh);
                      setRefreshKey(prev => prev + 1);
                      alert(isRtl ? 'تم حفظ إعدادات السعة بنجاح' : 'Capacity settings saved successfully');
                    }
                  }}
                  className="w-full py-1 bg-emerald-600/10 hover:bg-emerald-600 hover:text-white text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-lg transition-all border border-emerald-500/20"
                >
                  {isRtl ? 'تطبيق وحفظ التغييرات' : 'Save Capacity Configuration'}
                </button>
              </div>

              {/* Bins Management Trigger */}
              <button
                onClick={() => {
                  if (selectedWhForBins === wh.id) {
                    setSelectedWhForBins(null);
                  } else {
                    setSelectedWhForBins(wh.id);
                    setBinShowForm(false);
                    setBinEditingId(null);
                  }
                }}
                className={`w-full py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                  selectedWhForBins === wh.id 
                    ? 'bg-emerald-600 text-white border-emerald-500' 
                    : 'bg-transparent text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-800/10'
                }`}
              >
                <Layers size={13} />
                <span>{isRtl ? `إدارة الحاويات والرفوف (${binsList.length})` : `Manage Bins (${binsList.length})`}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* ACTIVE BINS CRUD PANEL */}
      {selectedWhForBins && (
        <div className={`p-6 rounded-3xl border space-y-6 shadow-xl ${
          theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'
        }`}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-4">
            <div>
              <h4 className="text-xs md:text-sm font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                {isRtl ? 'الحاويات والرفوف المرتبطة بالمستودع المختار' : 'Warehouse Bins & Storage Units'}
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isRtl ? 'إعداد البنية التحتية الداخلية لتسهيل فرز السلع وتحميلها' : 'Configure storage cells, zones, and individual max capacities.'}
              </p>
            </div>

            <button
              onClick={() => {
                setBinFormName('');
                setBinFormCode('');
                setBinFormZone('');
                setBinFormCapacity('');
                setBinEditingId(null);
                setBinShowForm(!binShowForm);
              }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
            >
              <Plus size={12} />
              <span>{isRtl ? 'إضافة حاوية/رف جديد' : 'Add New Bin'}</span>
            </button>
          </div>

          {/* BIN ADD/EDIT FORM */}
          {binShowForm && (
            <div className={`p-4 rounded-2xl border grid grid-cols-1 md:grid-cols-5 gap-4 items-end ${
              theme === 'dark' ? 'bg-[#1e293b]/50 border-slate-800' : 'bg-slate-50 border-slate-200/50'
            }`}>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{isRtl ? 'اسم الحاوية' : 'Bin Name'}</label>
                <input
                  type="text"
                  value={binFormName}
                  onChange={(e) => setBinFormName(e.target.value)}
                  placeholder="e.g. Bin A1"
                  className={`w-full px-3 py-1 text-xs rounded-lg border focus:outline-none ${
                    theme === 'dark' ? 'text-slate-100 bg-slate-900 border-slate-700' : 'text-slate-800 bg-white border-slate-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{isRtl ? 'كود الحاوية الفريد' : 'Bin Code'}</label>
                <input
                  type="text"
                  value={binFormCode}
                  onChange={(e) => setBinFormCode(e.target.value)}
                  placeholder="e.g. BIN-A1"
                  className={`w-full px-3 py-1 text-xs rounded-lg border focus:outline-none ${
                    theme === 'dark' ? 'text-slate-100 bg-slate-900 border-slate-700' : 'text-slate-800 bg-white border-slate-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{isRtl ? 'المنطقة (Zone)' : 'Zone'}</label>
                <input
                  type="text"
                  value={binFormZone}
                  onChange={(e) => setBinFormZone(e.target.value)}
                  placeholder="e.g. Zone A"
                  className={`w-full px-3 py-1 text-xs rounded-lg border focus:outline-none ${
                    theme === 'dark' ? 'text-slate-100 bg-slate-900 border-slate-700' : 'text-slate-800 bg-white border-slate-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{isRtl ? 'السعة القصوى (وحدة)' : 'Max Capacity'}</label>
                <input
                  type="number"
                  min="1"
                  value={binFormCapacity}
                  onChange={(e) => setBinFormCapacity(e.target.value)}
                  placeholder="e.g. 500"
                  className={`w-full px-3 py-1 text-xs rounded-lg border focus:outline-none font-mono ${
                    theme === 'dark' ? 'text-slate-100 bg-slate-900 border-slate-700' : 'text-slate-800 bg-white border-slate-200'
                  }`}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setBinShowForm(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    theme === 'dark' ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!binFormName || !binFormCode) {
                      alert(isRtl ? 'يرجى إدخال اسم وكود الحاوية' : 'Please input bin name and code');
                      return;
                    }

                    const capacityVal = parseInt(binFormCapacity) || undefined;

                    if (binEditingId) {
                      // Edit
                      await InventoryModule.updateWarehouseBin(binEditingId, {
                        name: binFormName,
                        code: binFormCode,
                        zone: binFormZone || undefined,
                        max_capacity_qty: capacityVal
                      });
                    } else {
                      // Add
                      await InventoryModule.addWarehouseBin({
                        warehouse_id: selectedWhForBins,
                        name: binFormName,
                        code: binFormCode,
                        zone: binFormZone || undefined,
                        max_capacity_qty: capacityVal,
                        is_active: true
                      });
                    }

                    setBinShowForm(false);
                    setBinEditingId(null);
                    setRefreshKey(prev => prev + 1);
                  }}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow transition-all cursor-pointer"
                >
                  {isRtl ? 'حفظ الحاوية' : 'Save Bin'}
                </button>
              </div>
            </div>
          )}

          {/* BINS TABLE LIST */}
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold bg-slate-500/5">
                  <th className="p-3">{isRtl ? 'اسم الحاوية' : 'Bin Name'}</th>
                  <th className="p-3 text-center">{isRtl ? 'الكود' : 'Code'}</th>
                  <th className="p-3 text-center">{isRtl ? 'المنطقة' : 'Zone'}</th>
                  <th className="p-3 text-center">{isRtl ? 'الاستخدام الحالي' : 'Stock Utilization'}</th>
                  <th className="p-3 text-center w-36">{isRtl ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/20">
                {InventoryModule.getWarehouseBins(selectedWhForBins).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400 italic">
                      {isRtl ? 'لا توجد حاويات معرفة لهذا المخزن حتى الآن.' : 'No bins defined for this warehouse yet.'}
                    </td>
                  </tr>
                ) : (
                  InventoryModule.getWarehouseBins(selectedWhForBins).map(b => {
                    const binStock = InventoryModule.getBinTotalStock(b.id);
                    const limit = b.max_capacity_qty || 0;
                    const utilPercent = limit > 0 ? (binStock / limit) * 100 : 0;

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                        <td className="p-3 font-semibold text-slate-800 dark:text-slate-100">{b.name}</td>
                        <td className="p-3 text-center font-mono text-slate-500">{b.code}</td>
                        <td className="p-3 text-center text-slate-500">{b.zone || '---'}</td>
                        <td className="p-3 text-center font-mono">
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-bold text-slate-700 dark:text-slate-300">
                              {binStock} / {limit || '∞'} {isRtl ? 'وحدة' : 'units'}
                            </span>
                            {limit > 0 && (
                              <div className="w-24 bg-slate-300 dark:bg-slate-800 rounded-full h-1 overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${
                                    utilPercent > 90 ? 'bg-rose-500' : utilPercent > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.min(100, utilPercent)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setBinEditingId(b.id);
                                setBinFormName(b.name);
                                setBinFormCode(b.code);
                                setBinFormZone(b.zone || '');
                                setBinFormCapacity(b.max_capacity_qty ? b.max_capacity_qty.toString() : '');
                                setBinShowForm(true);
                              }}
                              className="px-2.5 py-1 bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white rounded transition-all cursor-pointer text-[10px] font-bold"
                            >
                              {isRtl ? 'تعديل' : 'Edit'}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (confirm(isRtl ? 'هل أنت متأكد من حذف هذه الحاوية؟' : 'Are you sure you want to delete this bin?')) {
                                  await InventoryModule.deleteWarehouseBin(b.id);
                                  setRefreshKey(prev => prev + 1);
                                }
                              }}
                              className="px-2.5 py-1 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded transition-all cursor-pointer text-[10px] font-bold"
                            >
                              {isRtl ? 'حذف' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
