import React, { useState, useMemo } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  Eye, 
  CheckCircle2, 
  XCircle, 
  X,
  AlertTriangle, 
  FileSpreadsheet, 
  TrendingUp, 
  BarChart3, 
  SlidersHorizontal,
  Layers,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Printer,
  ShieldCheck,
  Building2,
  MapPin,
  PieChart,
  PackageCheck,
  Settings,
  Check,
  Workflow
} from 'lucide-react';
import { 
  InventoryDocument, 
  InventoryDocType, 
  InventoryDocStatus, 
  Warehouse, 
  Product, 
  StockMovement,
  InventoryLedgerEntry,
  InventoryWorkflowConfig
} from '../types/inventory';
import { InventoryModule } from '../db/inventory';
import { CustodyDB } from '../db';
import InventoryDocumentForm from '../components/InventoryDocumentForm';
import WarehouseTreeSelect from '../components/WarehouseTreeSelect';
import WarehouseHierarchyManager from '../components/WarehouseHierarchyManager';
import InventoryDocumentsTab from '../components/inventory/InventoryDocumentsTab';
import InventoryReportsTab from '../components/inventory/InventoryReportsTab';
import InventoryWarehousesTab from '../components/inventory/InventoryWarehousesTab';
import InventorySettingsTab from '../components/inventory/InventorySettingsTab';

interface InventoryProps {
  language: 'en' | 'ar';
  theme: 'light' | 'dark';
}

type SubTab = 'documents' | 'reports' | 'warehouses' | 'settings';
export type ReportType = 'card' | 'balances' | 'valuation' | 'slow_moving' | 'stocktake' | 'movements' | 'ledger';

export default function Inventory({ language, theme }: InventoryProps) {
  const isRtl = language === 'ar';
  const activeUser = CustodyDB.getActiveUser();

  const getDocTypeLabel = (type: string, scrapAction?: 'IN' | 'OUT') => {
    switch (type) {
      case 'Receipt':
        return isRtl ? 'إذن استلام' : 'Receipt';
      case 'Addition':
        return isRtl ? 'إذن إضافة' : 'Addition';
      case 'Issue':
        return isRtl ? 'إذن صرف' : 'Issue';
      case 'Transfer':
        return isRtl ? 'تحويل بين مخازن' : 'Transfer';
      case 'BranchTransfer':
        return isRtl ? 'تحويل إلى فرع' : 'Branch Transfer';
      case 'StationTransfer':
        return isRtl ? 'تحويل إلى محطة' : 'Station Transfer';
      case 'BranchReturn':
        return isRtl ? 'مرتجع فرع/محطة' : 'Branch Return';
      case 'SupplierReturn':
        return isRtl ? 'مرتجع إلى مورد' : 'Supplier Return';
      case 'Adjustment':
        return isRtl ? 'تسوية جردية' : 'Adjustment';
      case 'Damage':
        if (scrapAction === 'OUT') {
          return isRtl ? 'خردة/كهنة - صرف (بيع)' : 'Scrap/Obsolete - Issue';
        }
        return isRtl ? 'خردة/كهنة - إضافة' : 'Scrap/Obsolete - Receipt';
      default:
        return type;
    }
  };

  // Navigation state
  const [activeTab, setActiveTab] = useState<SubTab>('documents');
  const [activeReport, setActiveReport] = useState<ReportType>('balances');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [printInventoryDoc, setPrintInventoryDoc] = useState<InventoryDocument | null>(null);

  // Workflow Configuration State
  const [invConfig, setInvConfig] = useState<InventoryWorkflowConfig>(() => InventoryModule.getInventoryConfig());
  const [configSavedToast, setConfigSavedToast] = useState(false);

  // Multi-Echelon Stock Transfer Receipt UI State
  const [activeDocSubTab, setActiveDocSubTab] = useState<'all' | 'transit'>('all');
  const [receivingDocId, setReceivingDocId] = useState<string | null>(null);
  const [receivedItemsInput, setReceivedItemsInput] = useState<{ [prodId: string]: { qty_received: number; variance_reason: string } }>({});
  const [receivedNotesInput, setReceivedNotesInput] = useState<string>('');

  // Filter States (Documents)
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterWarehouse, setFilterWarehouse] = useState<string>('all');
  const [filterSearch, setFilterSearch] = useState<string>('');

  // Report Filter States
  const [repWarehouse, setRepWarehouse] = useState<string>('all');
  const [repProduct, setRepProduct] = useState<string>('');

  // Refresh trigger state
  const [refreshKey, setRefreshKey] = useState(0);

  // Warehouse & Bin management states
  const [selectedWhForBins, setSelectedWhForBins] = useState<string | null>(null);
  const [binEditingId, setBinEditingId] = useState<string | null>(null);
  const [binFormName, setBinFormName] = useState('');
  const [binFormCode, setBinFormCode] = useState('');
  const [binFormZone, setBinFormZone] = useState('');
  const [binFormCapacity, setBinFormCapacity] = useState('');
  const [binShowForm, setBinShowForm] = useState(false);

  // Warehouse capacity inputs (key is warehouse_id)
  const [whEnforceCap, setWhEnforceCap] = useState<{ [whId: string]: boolean }>({});
  const [whCapQty, setWhCapQty] = useState<{ [whId: string]: number }>({});
  
  // Relocation panel states
  const [relocShow, setRelocShow] = useState(false);
  const [relocWhId, setRelocWhId] = useState('');
  const [relocProdId, setRelocProdId] = useState('');
  const [relocFromBinId, setRelocFromBinId] = useState('');
  const [relocToBinId, setRelocToBinId] = useState('');
  const [relocQty, setRelocQty] = useState(1);
  const [relocError, setRelocError] = useState('');
  const [relocSuccess, setRelocSuccess] = useState('');

  // Load lists from DB
  const warehouses = useMemo(() => InventoryModule.getWarehouses(), [refreshKey]);
  const products = useMemo(() => InventoryModule.getProducts(), [refreshKey]);
  const documents = useMemo(() => InventoryModule.getInventoryDocuments(), [refreshKey]);
  const stockMovements = useMemo(() => InventoryModule.getStockMovements(), [refreshKey]);
  const ledgerEntries = useMemo(() => InventoryModule.getInventoryLedger(), [refreshKey]);

  const activeDoc = useMemo(() => {
    if (!selectedDocId) return null;
    return documents.find(d => d.id === selectedDocId) || null;
  }, [selectedDocId, documents]);

  // Document Filtering
  const filteredDocs = useMemo(() => {
    return documents.filter(doc => {
      if (filterType !== 'all' && doc.doc_type !== filterType) return false;
      if (filterStatus !== 'all' && doc.status !== filterStatus) return false;
      if (filterWarehouse !== 'all' && doc.source_warehouse_id !== filterWarehouse) return false;
      
      if (filterSearch.trim()) {
        const query = filterSearch.toLowerCase().trim();
        return (
          doc.doc_no.toLowerCase().includes(query) ||
          (doc.reason && doc.reason.toLowerCase().includes(query)) ||
          (doc.statement && doc.statement.toLowerCase().includes(query)) ||
          (doc.recipient && doc.recipient.toLowerCase().includes(query))
        );
      }
      return true;
    });
  }, [documents, filterType, filterStatus, filterWarehouse, filterSearch]);

  const transitDocsCount = useMemo(() => {
    return documents.filter(d => d.status === 'Dispatched').length;
  }, [documents]);

  const transitDocs = useMemo(() => {
    return documents.filter(d => d.status === 'Dispatched');
  }, [documents]);

  // Handle document transition
  const handleTransition = async (docId: string, event: 'Submit' | 'Approve' | 'Reject' | 'Cancel') => {
    const res = await InventoryModule.triggerLifecycleTransition(docId, event);
    if (res.success) {
      setRefreshKey(prev => prev + 1);
    } else {
      alert(isRtl ? res.messageAr : res.messageEn);
    }
  };

  const handleDelete = async (docId: string) => {
    if (confirm(isRtl ? 'هل أنت متأكد من حذف هذه المسودة نهائياً؟' : 'Are you sure you want to delete this draft?')) {
      const res = await InventoryModule.deleteInventoryDocument(docId);
      if (!res.success) {
        alert(res.errors?.join('\n') || 'Failed to delete document');
        return;
      }
      setSelectedDocId(null);
      setRefreshKey(prev => prev + 1);
    }
  };

  // Stepper helper for lifecycle visualizer
  const getStepperSteps = (status: InventoryDocStatus) => {
    const steps = [
      { key: 'Draft', labelAr: 'مسودة', labelEn: 'Draft' },
      { key: 'Pending', labelAr: 'مراجعة', labelEn: 'Pending' },
      { key: 'Posted', labelAr: 'مرحل', labelEn: 'Posted' }
    ];

    let currentIdx = 0;
    if (status === 'Pending') currentIdx = 1;
    if (status === 'Posted' || status === 'Approved') currentIdx = 2;
    if (status === 'Rejected' || status === 'Cancelled') {
      return [
        { key: 'Draft', labelAr: 'مسودة', labelEn: 'Draft' },
        { key: status, labelAr: status === 'Rejected' ? 'مرفوض' : 'ملغي', labelEn: status, isError: true }
      ];
    }

    return steps.map((s, idx) => ({
      ...s,
      isCompleted: idx < currentIdx,
      isActive: idx === currentIdx
    }));
  };

  // --- REPORT ANALYTICS COMPUTATIONS ---

  // Report: Stock Card (كارت الصنف للرصيد المستمر والوارد والمنصرف)
  const reportStockCard = useMemo(() => {
    if (!repProduct) return [];
    const prodMovements = stockMovements.filter(m => 
      m.product_id === repProduct && 
      (repWarehouse === 'all' || m.warehouse_id === repWarehouse)
    );
    // Sort chronologically
    const sorted = [...prodMovements].sort((a, b) => a.created_at.localeCompare(b.created_at));
    
    let runningBalance = 0;
    return sorted.map(m => {
      runningBalance += m.qty_change;
      return {
        ...m,
        runningBalance
      };
    }).reverse(); // Latest first
  }, [stockMovements, repProduct, repWarehouse]);

  // Report: Item Ledger (التحليل المفصل لحركات الصنف والوارد والمنصرف بالقيم المالية وتتبع الامتثال والاعتماد)
  const reportItemLedger = useMemo(() => {
    if (!repProduct) return [];
    const filtered = ledgerEntries.filter(entry => 
      entry.product_id === repProduct &&
      (repWarehouse === 'all' || entry.warehouse_id === repWarehouse)
    );
    // Sort chronological first to build running balances/costs properly, then reverse to show latest first
    const sorted = [...filtered].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return sorted.reverse(); // Latest first
  }, [ledgerEntries, repProduct, repWarehouse]);

  // Report: Warehouse Balances & Min Alerts
  const reportBalances = useMemo(() => {
    return products.map(p => {
      const warehouseBalances = warehouses.map(w => {
        const stock = InventoryModule.getProductStock(p.id, w.id);
        return {
          warehouseId: w.id,
          warehouseName: w.name,
          stock
        };
      });

      const totalStock = warehouseBalances.reduce((sum, item) => sum + item.stock, 0);

      return {
        ...p,
        totalStock,
        balances: warehouseBalances,
        isUnderMin: totalStock < p.min_stock
      };
    });
  }, [products, warehouses, refreshKey]);

  // Report: Slow Moving Stock (Items with no movements in selected timeframe - simulated as 30 days)
  const reportSlowMoving = useMemo(() => {
    return products.filter(p => {
      const hasMovements = stockMovements.some(m => m.product_id === p.id);
      return !hasMovements; // No movements whatsoever
    });
  }, [products, stockMovements]);

  // Report: Valuation summary
  const reportValuation = useMemo(() => {
    let totalCostVal = 0;
    const items = products.map(p => {
      const totalStock = warehouses.reduce((sum, w) => sum + InventoryModule.getProductStock(p.id, w.id), 0);
      const price = p.last_purchase_price || 0;
      const valuation = totalStock * price;
      totalCostVal += valuation;
      return {
        ...p,
        totalStock,
        valuation
      };
    });

    return {
      items,
      totalCostVal
    };
  }, [products, warehouses, refreshKey]);

  return (
    <ErrorBoundary>
      <div id="inventory-module-page" className="space-y-6">
      {/* Title & Stats */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-3xl font-black tracking-tight flex items-center gap-2">
            <Layers className="text-emerald-500 h-6 w-6 md:h-8 md:w-8" />
            <span>{isRtl ? 'إدارة المستودعات وحركة المخزون' : 'Inventory & Warehouse Management'}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
            {isRtl 
              ? 'مراقبة الرصيد المستمر، السندات المخزنية، ومطابقة حركة التوريدات والتحويلات' 
              : 'Continuous stock ledger tracking, inventory vouchers, supply logs, and transfers'}
          </p>
        </div>

        {!isFormOpen && !selectedDocId && (
          <button
            onClick={() => {
              setEditingDocId(null);
              setIsFormOpen(true);
            }}
            className="w-full md:w-auto px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all shadow-lg shadow-emerald-600/15 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
          >
            <Plus size={16} />
            <span>{isRtl ? 'إنشاء سند مخزني جديد' : 'New Inventory Voucher'}</span>
          </button>
        )}
      </div>

      {/* Sub tabs (Documents vs Reports vs Warehouses) */}
      {!isFormOpen && !selectedDocId && (
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
          <button
            onClick={() => setActiveTab('documents')}
            className={`pb-3 text-xs md:text-sm font-black transition-all ${
              activeTab === 'documents'
                ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {isRtl ? 'أذون ومستندات الحركة' : 'Inventory Documents'}
          </button>
          <button
            onClick={() => {
              setActiveTab('reports');
              if (products.length > 0 && !repProduct) {
                setRepProduct(products[0].id);
              }
            }}
            className={`pb-3 text-xs md:text-sm font-black transition-all ${
              activeTab === 'reports'
                ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {isRtl ? 'التقارير الرقابية والتحليلية' : 'Inventory Reports'}
          </button>
          <button
            onClick={() => setActiveTab('warehouses')}
            className={`pb-3 text-xs md:text-sm font-black transition-all ${
              activeTab === 'warehouses'
                ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {isRtl ? 'تهيئة المستودعات والحاويات' : 'Warehouse & Bin Settings'}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-3 text-xs md:text-sm font-black transition-all flex items-center gap-1.5 ${
              activeTab === 'settings'
                ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Settings size={15} />
            <span>{isRtl ? 'قواعد ودورة عمل المخازن' : 'Workflow & Business Rules'}</span>
          </button>
        </div>
      )}

      {/* RENDER DYNAMIC FORM */}
      {isFormOpen && (
        <div className="space-y-4">
          <button
            onClick={() => setIsFormOpen(false)}
            className={`inline-flex items-center gap-1 text-xs font-bold ${theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {isRtl ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            <span>{isRtl ? 'العودة لجدول المستندات' : 'Back to Documents'}</span>
          </button>
          <InventoryDocumentForm
            docId={editingDocId || undefined}
            onSave={() => {
              setIsFormOpen(false);
              setEditingDocId(null);
              setRefreshKey(prev => prev + 1);
            }}
            onCancel={() => {
              setIsFormOpen(false);
              setEditingDocId(null);
            }}
            language={language}
            theme={theme}
          />
        </div>
      )}

      {/* RENDER DETAILED VIEW WITH LIFE CYCLE CONTROLS */}
      {!isFormOpen && selectedDocId && activeDoc && (
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-4">
            <button
              onClick={() => setSelectedDocId(null)}
              className={`inline-flex items-center gap-1 text-xs font-bold ${theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {isRtl ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              <span>{isRtl ? 'العودة لجدول المستندات' : 'Back to Documents'}</span>
            </button>

            <button
              onClick={() => setPrintInventoryDoc(activeDoc)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black flex items-center gap-2 rounded-xl transition-all cursor-pointer border border-slate-700 shadow-sm"
            >
              <Printer size={15} />
              <span>{isRtl ? 'طباعة مستند الحركة المخزنية (A4)' : 'Print Stock Voucher (A4)'}</span>
            </button>
          </div>

          {/* Stepper Visualizer (المسار الزمني لاعتماد السند) */}
          <div className={`p-4 md:p-6 rounded-3xl border ${theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'}`}>
            <h4 className="text-xs font-bold mb-4 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck size={14} />
              <span>{isRtl ? 'مسار دورة الاعتماد والامتثال للمستند' : 'Lifecycle Compliance Path'}</span>
            </h4>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-6 w-full sm:w-auto">
                {getStepperSteps(activeDoc.status).map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs ${
                      step.isActive ? 'bg-emerald-600 text-white animate-pulse' :
                      step.isCompleted ? 'bg-emerald-500/20 text-emerald-600' :
                      step.isError ? 'bg-rose-500/20 text-rose-600' :
                      'bg-slate-800 text-slate-500'
                    }`}>
                      {step.isCompleted ? '✓' : idx + 1}
                    </div>
                    <div>
                      <p className="text-xs font-black">{isRtl ? step.labelAr : step.labelEn}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{step.key}</p>
                    </div>
                    {idx < 2 && <div className="hidden sm:block w-12 h-0.5 bg-slate-700"></div>}
                  </div>
                ))}
              </div>

              {/* ACTION BUTTONS (تحكم دورة الاعتماد) */}
              <div className="flex items-center gap-2.5">
                {activeDoc.status === 'Draft' && (
                  <>
                    <button
                      onClick={() => handleTransition(activeDoc.id, 'Submit')}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer"
                    >
                      {isRtl ? 'إرسال للاعتماد النهائي' : 'Submit for Approval'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingDocId(activeDoc.id);
                        setIsFormOpen(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-black transition-all cursor-pointer"
                    >
                      {isRtl ? 'تعديل المسودة' : 'Edit Draft'}
                    </button>
                    <button
                      onClick={() => handleDelete(activeDoc.id)}
                      className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-600 hover:text-white text-rose-500 text-xs font-black transition-all cursor-pointer"
                    >
                      {isRtl ? 'حذف المسودة' : 'Delete'}
                    </button>
                  </>
                )}

                {activeDoc.status === 'Pending' && (
                  <>
                    <button
                      onClick={() => handleTransition(activeDoc.id, 'Approve')}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer"
                    >
                      {isRtl ? 'اعتماد المستند وتحديث المخزون' : 'Approve & Release Stock'}
                    </button>
                    <button
                      onClick={() => handleTransition(activeDoc.id, 'Reject')}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer"
                    >
                      {isRtl ? 'رفض المستند' : 'Reject'}
                    </button>
                    <button
                      onClick={() => handleTransition(activeDoc.id, 'Cancel')}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-black transition-all cursor-pointer"
                    >
                      {isRtl ? 'إلغاء المستند' : 'Cancel'}
                    </button>
                  </>
                )}

                {activeDoc.status === 'Dispatched' && (
                  <>
                    <button
                      onClick={() => {
                        const initialInput: typeof receivedItemsInput = {};
                        activeDoc.items.forEach(item => {
                          initialInput[item.product_id] = { qty_received: item.qty, variance_reason: '' };
                        });
                        setReceivedItemsInput(initialInput);
                        setReceivedNotesInput('');
                        setReceivingDocId(activeDoc.id);
                      }}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <PackageCheck size={14} />
                      <span>{isRtl ? 'تأكيد الاستلام والاعتماد' : 'Confirm Receipt & Authorize'}</span>
                    </button>
                    <button
                      onClick={() => handleTransition(activeDoc.id, 'Cancel')}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-black transition-all cursor-pointer"
                    >
                      {isRtl ? 'إلغاء المستند' : 'Cancel'}
                    </button>
                  </>
                )}

                {activeDoc.status === 'Posted' && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold bg-emerald-500/5 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                    <CheckCircle2 size={14} />
                    <span>{isRtl ? 'تم الاعتماد النهائي وتحديث المخزن تلقائياً' : 'Approved & Inventory Updated'}</span>
                  </div>
                )}
                
                {activeDoc.status === 'Rejected' && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-600 font-bold bg-rose-500/5 px-3 py-1.5 rounded-xl border border-rose-500/20">
                    <XCircle size={14} />
                    <span>{isRtl ? 'تم رفض السند من المدير المسؤول' : 'Rejected'}</span>
                  </div>
                )}

                {activeDoc.status === 'Cancelled' && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold bg-slate-500/5 px-3 py-1.5 rounded-xl border border-slate-500/10">
                    <XCircle size={14} />
                    <span>{isRtl ? 'مستند ملغي' : 'Cancelled'}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Document Content Block */}
          <div className={`p-6 md:p-8 rounded-3xl border transition-colors duration-200 shadow-xl ${
            theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'
          }`}>
            <div className="border-b-2 border-dashed border-slate-200 dark:border-slate-800 pb-6 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-lg">
                  CF
                </div>
                <div>
                  <h3 className="text-xs font-bold">Cairo Poultry ERP</h3>
                  <p className="text-[9px] font-mono text-slate-400">WAREHOUSE MANAGEMENT SHEET</p>
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-base font-black text-emerald-600 dark:text-emerald-400">
                  {isRtl ? 'تفاصيل السند المخزني الرسمي' : 'Official Stock Sheet Detail'}
                </h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">{activeDoc.doc_no}</p>
              </div>
              <div className="text-right text-xs">
                <p className="font-mono text-slate-400">{activeDoc.date}</p>
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                  activeDoc.status === 'Posted' ? 'bg-emerald-500/10 text-emerald-500' :
                  activeDoc.status === 'Pending' ? 'bg-amber-500/10 text-amber-500' :
                  'bg-slate-500/10 text-slate-400'
                }`}>
                  {activeDoc.status}
                </span>
              </div>
            </div>

            {/* Grid of basic data */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs mb-8">
              <div>
                <p className="text-slate-400 font-bold mb-1">{isRtl ? 'نوع المستند' : 'Doc Type'}</p>
                <p className="font-black text-slate-700 dark:text-slate-200">
                  {getDocTypeLabel(activeDoc.doc_type, activeDoc.scrap_action)}
                </p>
              </div>
              <div>
                <p className="text-slate-400 font-bold mb-1">
                  {activeDoc.doc_type === 'Damage' 
                    ? (isRtl ? 'مخزن الخردة / الكهنة' : 'Scrap / Obsolete Warehouse') 
                    : (isRtl ? 'المخزن الرئيسي' : 'Primary Warehouse')}
                </p>
                <p className="font-black text-slate-700 dark:text-slate-200">
                  {warehouses.find(w => w.id === activeDoc.source_warehouse_id)?.name || activeDoc.source_warehouse_id}
                </p>
              </div>
              {activeDoc.dest_entity_id && (
                <div>
                  <p className="text-slate-400 font-bold mb-1">{isRtl ? 'الجهة المستلمة' : 'Destination Entity'}</p>
                  <p className="font-black text-slate-700 dark:text-slate-200">
                    {activeDoc.dest_entity_id} ({activeDoc.dest_entity_type})
                  </p>
                </div>
              )}
              <div>
                <p className="text-slate-400 font-bold mb-1">{isRtl ? 'سبب الحركة' : 'Stock Reason'}</p>
                <p className="font-medium">{activeDoc.reason}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold mb-1">{isRtl ? 'البيان' : 'Memo'}</p>
                <p className="font-medium">{activeDoc.statement}</p>
              </div>
              {activeDoc.recipient && (
                <div>
                  <p className="text-slate-400 font-bold mb-1">
                    {activeDoc.doc_type === 'Damage'
                      ? (activeDoc.scrap_action === 'OUT' 
                          ? (isRtl ? 'الجهة المستلمة / المشتري' : 'Buyer / Scrap Recipient')
                          : (isRtl ? 'المشرف المسؤول عن التكهين' : 'Responsible Supervisor'))
                      : (isRtl ? 'المستلم المسئول' : 'Operator / Driver')}
                  </p>
                  <p className="font-medium">{activeDoc.recipient}</p>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden mb-8">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold">
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3">{isRtl ? 'الصنف الكود والاسم' : 'Item Description'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الوحدة' : 'Unit'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الكمية المستندة' : 'Quantity'}</th>
                    {(activeDoc.doc_type === 'Receipt' || activeDoc.doc_type === 'Addition') && <th className="p-3 text-center">{isRtl ? 'سعر الشراء (ج.م)' : 'Purchase Price'}</th>}
                    <th className="p-3">{isRtl ? 'ملاحظات الصنف' : 'Item Notes'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/30">
                  {activeDoc.items.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="p-3 text-center font-mono text-slate-400 font-bold">{index + 1}</td>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-100">
                        {item.product_name} <span className="text-[10px] font-mono text-slate-400">[{item.product_code}]</span>
                      </td>
                      <td className="p-3 text-center text-slate-500 dark:text-slate-400">{item.unit}</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">{item.qty}</td>
                      {(activeDoc.doc_type === 'Receipt' || activeDoc.doc_type === 'Addition') && <td className="p-3 text-center font-mono">{item.last_purchase_price || 0}</td>}
                      <td className="p-3 text-slate-500 dark:text-slate-400">{item.notes || <span className="italic text-slate-400">---</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Notes */}
            {activeDoc.notes && (
              <div className="mb-8 p-3.5 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs">
                <p className="font-bold mb-1 text-slate-400">{isRtl ? 'ملاحظات المستند العامة:' : 'General Document Comments:'}</p>
                <p className="text-slate-600 dark:text-slate-300">{activeDoc.notes}</p>
              </div>
            )}

            {/* Multi-Echelon Receipt Verification */}
            {activeDoc.received_by && (
              <div className="mb-8 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 text-xs text-right" dir={isRtl ? 'rtl' : 'ltr'}>
                <h4 className="font-bold mb-3 flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck size={15} />
                  <span>{isRtl ? 'بيانات تتبع واستلام الشحنة بالكامل (Multi-Echelon Receipt Verification)' : 'Multi-Echelon Receipt Audit Verification'}</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                  <div>
                    <p className="text-slate-400 font-bold mb-0.5">{isRtl ? 'تاريخ وتوقيت الاستلام' : 'Date Received'}</p>
                    <p className="font-mono font-bold text-slate-700 dark:text-slate-200">
                      {new Date(activeDoc.received_date!).toLocaleString(isRtl ? 'ar-EG' : 'en-US')}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-bold mb-0.5">{isRtl ? 'المستلم المصادق' : 'Received By'}</p>
                    <p className="font-semibold text-slate-700 dark:text-slate-200">{activeDoc.received_by}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-bold mb-0.5">{isRtl ? 'ملاحظات الاستلام والترخيص' : 'Receipt Notes'}</p>
                    <p className="font-medium text-slate-600 dark:text-slate-300">{activeDoc.received_notes || (isRtl ? 'لا توجد ملاحظات' : 'No notes')}</p>
                  </div>
                </div>

                {/* Variance analysis inside details */}
                <div className="border border-emerald-500/20 rounded-xl overflow-hidden mt-2">
                  <table className="w-full text-right border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold">
                        <th className="p-2">{isRtl ? 'الصنف' : 'Item'}</th>
                        <th className="p-2 text-center">{isRtl ? 'الكمية المشحونة' : 'Shipped Qty'}</th>
                        <th className="p-2 text-center">{isRtl ? 'الكمية المستلمة' : 'Received Qty'}</th>
                        <th className="p-2 text-center">{isRtl ? 'العجز / الفارق' : 'Variance'}</th>
                        <th className="p-2">{isRtl ? 'سبب الفارق' : 'Variance Reason'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-500/10">
                      {activeDoc.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-emerald-500/5">
                          <td className="p-2 font-semibold">{item.product_name}</td>
                          <td className="p-2 text-center font-mono">{item.qty}</td>
                          <td className="p-2 text-center font-mono font-bold">{item.qty_received ?? item.qty}</td>
                          <td className={`p-2 text-center font-mono font-bold ${
                            (item.qty_variance ?? 0) > 0 ? 'text-amber-500' : 'text-emerald-500'
                          }`}>
                            {item.qty_variance ?? 0}
                          </td>
                          <td className="p-2 text-slate-500 italic">{item.variance_reason || '---'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer signatures */}
            <div className="grid grid-cols-3 gap-4 text-center text-[10px] pt-4 border-t border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
              <div>
                <p className="font-bold text-slate-300 mb-1">{isRtl ? 'مُعد السند' : 'Prepared by'}</p>
                <p className="font-mono text-slate-500">{activeDoc.created_by}</p>
              </div>
              <div>
                <p className="font-bold text-slate-300 mb-1">{isRtl ? 'توقيع المستلم' : 'Recipient Stamp'}</p>
                <p className="font-mono text-slate-500">{activeDoc.recipient || '---'}</p>
              </div>
              <div>
                <p className="font-bold text-slate-300 mb-1">{isRtl ? 'توقيع المدير المعتمد' : 'Authorized Signee'}</p>
                <p className="font-mono text-slate-500">{activeDoc.status === 'Posted' ? 'Enterprise Engine Sec' : '---'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: DOCUMENTS LIST */}
      {!isFormOpen && !selectedDocId && activeTab === 'documents' && (
        <InventoryDocumentsTab
          isRtl={isRtl}
          activeDocSubTab={activeDocSubTab}
          setActiveDocSubTab={setActiveDocSubTab}
          transitDocsCount={transitDocsCount}
          theme={theme}
          filterSearch={filterSearch}
          setFilterSearch={setFilterSearch}
          filterType={filterType}
          setFilterType={setFilterType}
          filterWarehouse={filterWarehouse}
          setFilterWarehouse={setFilterWarehouse}
          warehouses={warehouses}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filteredDocs={filteredDocs}
          getDocTypeLabel={getDocTypeLabel}
          setSelectedDocId={setSelectedDocId}
          transitDocs={transitDocs}
          receivedItemsInput={receivedItemsInput}
          setReceivedItemsInput={setReceivedItemsInput}
          setReceivedNotesInput={setReceivedNotesInput}
          setReceivingDocId={setReceivingDocId}
          receivingDocId={receivingDocId}
          documents={documents}
          receivedNotesInput={receivedNotesInput}
          setRefreshKey={setRefreshKey}
        />
      )}

      {/* SUB-TAB: REPORTS ANALYTICS PANEL */}
      {!isFormOpen && !selectedDocId && activeTab === "reports" && (
        <InventoryReportsTab
          isRtl={isRtl}
          theme={theme}
          language={language}
          activeReport={activeReport}
          setActiveReport={setActiveReport}
          repWarehouse={repWarehouse}
          setRepWarehouse={setRepWarehouse}
          warehouses={warehouses}
          repProduct={repProduct}
          setRepProduct={setRepProduct}
          products={products}
          setRefreshKey={setRefreshKey}
          reportBalances={reportBalances}
          reportStockCard={reportStockCard}
          reportItemLedger={reportItemLedger}
          reportValuation={reportValuation}
          reportSlowMoving={reportSlowMoving}
          getDocTypeLabel={getDocTypeLabel}
        />
      )}

      {/* SUB-TAB: WAREHOUSE & BIN SETTINGS */}
      {!isFormOpen && !selectedDocId && activeTab === 'warehouses' && (
        <InventoryWarehousesTab
          isRtl={isRtl}
          theme={theme}
          activeUser={activeUser}
          setRefreshKey={setRefreshKey}
          relocShow={relocShow}
          setRelocShow={setRelocShow}
          setRelocSuccess={setRelocSuccess}
          setRelocError={setRelocError}
          relocError={relocError}
          relocSuccess={relocSuccess}
          relocWhId={relocWhId}
          setRelocWhId={setRelocWhId}
          setRelocFromBinId={setRelocFromBinId}
          setRelocToBinId={setRelocToBinId}
          relocProdId={relocProdId}
          setRelocProdId={setRelocProdId}
          products={products}
          relocFromBinId={relocFromBinId}
          relocToBinId={relocToBinId}
          relocQty={relocQty}
          setRelocQty={setRelocQty}
          warehouses={warehouses}
          whEnforceCap={whEnforceCap}
          setWhEnforceCap={setWhEnforceCap}
          whCapQty={whCapQty}
          setWhCapQty={setWhCapQty}
          selectedWhForBins={selectedWhForBins}
          setSelectedWhForBins={setSelectedWhForBins}
          setBinShowForm={setBinShowForm}
          setBinEditingId={setBinEditingId}
          binShowForm={binShowForm}
          binFormName={binFormName}
          setBinFormName={setBinFormName}
          binFormCode={binFormCode}
          setBinFormCode={setBinFormCode}
          binFormZone={binFormZone}
          setBinFormZone={setBinFormZone}
          binFormCapacity={binFormCapacity}
          setBinFormCapacity={setBinFormCapacity}
          binEditingId={binEditingId}
        />
      )}

      {/* WORKFLOW RULES & SETTINGS TAB */}
      {!isFormOpen && !selectedDocId && activeTab === 'settings' && (
        <InventorySettingsTab
          isRtl={isRtl}
          theme={theme}
          invConfig={invConfig}
          setInvConfig={setInvConfig}
          configSavedToast={configSavedToast}
          setConfigSavedToast={setConfigSavedToast}
        />
      )}

      {/* INVENTORY DOC PRINT MODAL */}
      {printInventoryDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:backdrop-blur-none animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full p-6 shadow-2xl space-y-4 print:p-0 print:shadow-none print:rounded-none">
            <div className="flex justify-between items-center print:hidden border-b pb-3 dark:border-slate-800">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
                {isRtl ? 'معاينة السند المخزني للطباعة' : 'Inventory Document Print Preview'}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Printer size={14} />
                  <span>{isRtl ? 'طباعة المستند' : 'Print Voucher'}</span>
                </button>
                <button
                  onClick={() => setPrintInventoryDoc(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div
              id="voucher-sheet-printable"
              className="w-[210mm] min-h-[297mm] mx-auto p-12 border border-slate-300 bg-white text-black text-xs font-bold leading-relaxed shadow-xl relative print:shadow-none print:border-none print:w-full print:min-h-0 print:p-2"
              dir={isRtl ? 'rtl' : 'ltr'}
              style={{
                backgroundImage: (CustodyDB.getConfig().use_custom_template && CustodyDB.getConfig().custom_template_image) ? `url(${CustodyDB.getConfig().custom_template_image})` : undefined,
                backgroundSize: '100% 100%',
                backgroundRepeat: 'no-repeat',
              }}
            >
              <div className="flex justify-between items-center border-b-2 border-black pb-5 mb-6 gap-4">
                {!CustodyDB.getConfig().use_custom_template ? (
                  <div className="flex items-center gap-3">
                    <div className="border-[2.5px] border-black rounded-[50%/50%] px-3 py-1.5 flex flex-col items-center justify-center leading-none bg-white shrink-0 shadow-sm h-[52px] w-[90px]">
                      <span className="text-[20px] font-black leading-none text-black">كوكي</span>
                      <span className="text-[9px] font-bold font-mono tracking-wider mt-0.5 leading-none text-black">Koki</span>
                    </div>
                    <div className="text-right space-y-0.5">
                      <h1 className="text-[13px] font-black text-black">شركة / القاهرة الجديدة للدواجن</h1>
                      <p className="text-[10px] text-neutral-800 font-bold">{isRtl ? 'إدارة المستودعات وسلاسل الإمداد' : 'Warehouse & Inventory Control'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-right space-y-0.5">
                    <h1 className="text-[13px] font-black text-emerald-600">{CustodyDB.getConfig().company_name}</h1>
                    <p className="text-[10px] text-neutral-800 font-bold">{isRtl ? 'إدارة المستودعات وسلاسل الإمداد' : 'Warehouse & Inventory Control'}</p>
                  </div>
                )}
                
                <div className="text-center">
                  <h2 className="text-[14px] font-black border-[2.5px] border-black px-4 py-2 bg-neutral-100 text-black shadow-sm uppercase">
                    {getDocTypeLabel(printInventoryDoc.doc_type, printInventoryDoc.scrap_action)}
                  </h2>
                </div>

                <div className="text-right space-y-1">
                  <div className="text-xs font-mono font-bold text-black border border-black px-2.5 py-1 bg-neutral-50 rounded">
                    {isRtl ? 'سند رقم: ' : 'Voucher #: '} <span className="font-black font-mono">{printInventoryDoc.doc_no}</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-600">
                    {isRtl ? 'التاريخ: ' : 'Date: '} {printInventoryDoc.date}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border border-black p-3 rounded mb-6 bg-neutral-50/50">
                <div>
                  <span className="text-slate-500 font-semibold">{isRtl ? 'موقع المخزن المسؤول:' : 'Primary Warehouse:'}</span>
                  <p className="font-bold text-black">{warehouses.find(w => w.id === printInventoryDoc.source_warehouse_id)?.name || printInventoryDoc.source_warehouse_id}</p>
                </div>
                {printInventoryDoc.dest_entity_id && (
                  <div>
                    <span className="text-slate-500 font-semibold">{isRtl ? 'الجهة المستلمة / المخزن البديل:' : 'Destination Entity / Wh:'}</span>
                    <p className="font-bold text-black">{printInventoryDoc.dest_entity_id} ({printInventoryDoc.dest_entity_type})</p>
                  </div>
                )}
                <div>
                  <span className="text-slate-500 font-semibold">{isRtl ? 'سبب المعاملة:' : 'Reason / Reference:'}</span>
                  <p className="font-bold text-black">{printInventoryDoc.reason || '---'}</p>
                </div>
                {printInventoryDoc.recipient && (
                  <div>
                    <span className="text-slate-500 font-semibold">{isRtl ? 'أمين المخزن / السائق المستلم:' : 'Recipient Personnel:'}</span>
                    <p className="font-bold text-black">{printInventoryDoc.recipient}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <span className="text-slate-500 font-semibold">{isRtl ? 'البيان العام للحركة:' : 'Voucher Statement:'}</span>
                  <p className="font-bold text-black">{printInventoryDoc.statement || '---'}</p>
                </div>
              </div>

              <table className="w-full text-right border-collapse text-xs border border-black mb-8">
                <thead>
                  <tr className="bg-neutral-100 border-b border-black text-black font-black">
                    <th className="p-2 border-r border-black w-10 text-center">#</th>
                    <th className="p-2 border-r border-black w-28 text-center">{isRtl ? 'كود الصنف' : 'Item Code'}</th>
                    <th className="p-2 border-r border-black">{isRtl ? 'اسم ووصف الصنف المخزني' : 'Item Name & Description'}</th>
                    <th className="p-2 border-r border-black w-24 text-center">{isRtl ? 'الكمية' : 'Qty'}</th>
                    <th className="p-2 border-r border-black w-24 text-center">{isRtl ? 'الوحدة' : 'Unit'}</th>
                    <th className="p-2 w-48">{isRtl ? 'ملاحظات الصنف' : 'Line Notes'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black text-black">
                  {printInventoryDoc.items.map((item, index) => (
                    <tr key={index} className="border-b border-black">
                      <td className="p-2 border-r border-black text-center font-mono font-bold">{index + 1}</td>
                      <td className="p-2 border-r border-black text-center font-mono font-bold">{item.product_code}</td>
                      <td className="p-2 border-r border-black font-extrabold">{item.product_name}</td>
                      <td className="p-2 border-r border-black text-center font-mono font-black">{item.qty}</td>
                      <td className="p-2 border-r border-black text-center font-medium">{item.unit || (isRtl ? 'وحدة' : 'Unit')}</td>
                      <td className="p-2 text-slate-700">{item.notes || '---'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {printInventoryDoc.received_by && (
                <div className="mb-6 p-3 border border-emerald-500 rounded bg-emerald-500/5 text-black">
                  <p className="font-black text-emerald-800 mb-1">{isRtl ? 'تأكيد تتبع الشحنة اللوجستي (Multi-Echelon Audit Trail):' : 'Multi-Echelon Logistic Audit Verification:'}</p>
                  <p className="text-[11px] font-bold">
                    {isRtl ? 'المستلم المصادق:' : 'Received by:'} <span className="font-black text-slate-800">{printInventoryDoc.received_by}</span> • {isRtl ? 'تاريخ الاستلام المخزني الفعلي:' : 'Date:'} <span className="font-black text-slate-800">{new Date(printInventoryDoc.received_date!).toLocaleString(isRtl ? 'ar-EG' : 'en-US')}</span>
                  </p>
                  {printInventoryDoc.received_notes && (
                    <p className="text-[11px] font-medium mt-1">
                      {isRtl ? 'ملاحظات المستلم الفعلي:' : 'Recipient Comments:'} <span className="italic text-slate-700">{printInventoryDoc.received_notes}</span>
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-4 gap-4 text-center mt-12 pt-6 border-t border-slate-300">
                <div className="space-y-6">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">{isRtl ? 'أمين مخزن الصرف / الإضافة' : 'Storekeeper Signature'}</p>
                  <div className="h-10 border-b border-black w-32 mx-auto border-dashed"></div>
                  <p className="text-[9px] text-black font-semibold">{printInventoryDoc.created_by}</p>
                </div>
                <div className="space-y-6">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">{isRtl ? 'السائق / المستلم الفعلي' : 'Recipient / Transporter'}</p>
                  <div className="h-10 border-b border-black w-32 mx-auto border-dashed"></div>
                  <p className="text-[9px] text-black font-mono">{printInventoryDoc.recipient || '---'}</p>
                </div>
                <div className="space-y-6">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">{isRtl ? 'البوابة / تصريح الأمن' : 'Security Clearance Gate'}</p>
                  <div className="h-10 border-b border-black w-32 mx-auto border-dashed"></div>
                  <p className="text-[9px] text-black font-mono">---</p>
                </div>
                <div className="space-y-6">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">{isRtl ? 'مدير إدارة المستودعات' : 'Logistics Manager'}</p>
                  <div className="h-10 border-b border-black w-32 mx-auto border-dashed"></div>
                  <p className="text-[9px] text-black font-mono">{printInventoryDoc.status === 'Posted' ? '✓ SYSTEM_POSTED' : '---'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
