import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Package,
  Warehouse as WarehouseIcon,
  PackageCheck,
  ArrowRightLeft,
  ClipboardList,
  Plus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Layers,
  Search,
  Filter,
  RefreshCw,
  Eye,
  ShieldCheck,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react';
import { UserProfile } from '../types/erp';
import { ItemCardPanel } from './ItemCardPanel';

interface WarehouseItem {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  location?: string;
  isDefault: boolean;
  valuationMethod: string;
  isActive: boolean;
}

interface StockItemRow {
  id: string;
  itemCode: string;
  nameAr: string;
  category: string;
  uom: string;
  inventoryAccountCode: string;
  cogsAccountCode: string;
  valuationMethod: string;
  averageCost: number;
  reorderPoint: number;
  trackBatch: boolean;
  trackSerial: boolean;
  isActive: boolean;
}

interface WarehouseStockRow {
  id: string;
  warehouseId: string;
  itemId: string;
  currentQty: number;
  reservedQty: number;
  availableQty: number;
  averageCost: number;
  totalValue: number;
  warehouseNameAr?: string;
  itemNameAr?: string;
  itemCode?: string;
}

interface StockMovementRow {
  id: string;
  movementNumber: string;
  movementType: string;
  warehouseId: string;
  warehouseNameAr: string;
  itemId: string;
  itemCode: string;
  itemNameAr: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  balanceAfterQty: number;
  performedByName: string;
  timestamp: string;
}

interface StockTransferRow {
  id: string;
  transferNumber: string;
  sourceWarehouseNameAr: string;
  targetWarehouseNameAr: string;
  status: string;
  totalQuantity: number;
  totalCost: number;
  requestedByName: string;
  requestedAt: string;
  receivedByName?: string;
  receivedAt?: string;
}

interface StockCountRow {
  id: string;
  countNumber: string;
  warehouseNameAr: string;
  status: string;
  performedByName: string;
  performedAt: string;
  hasVariance: boolean;
  netVarianceAmount: number;
  approvedByName?: string;
  journalEntryId?: string;
}

interface InventoryWorkspaceProps {
  currentUser: UserProfile;
  onNotification: (msg: string) => void;
}

export const InventoryWorkspaceView: React.FC<InventoryWorkspaceProps> = ({
  currentUser,
  onNotification,
}) => {
  const [activeTab, setActiveTab] = useState<'items' | 'stock' | 'warehouses' | 'movements' | 'transfers' | 'counts' | 'battery'>('items');
  const [isLoading, setIsLoading] = useState(false);

  // Data states
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [items, setItems] = useState<StockItemRow[]>([]);
  const [stocks, setStocks] = useState<WarehouseStockRow[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [transfers, setTransfers] = useState<StockTransferRow[]>([]);
  const [transferStatusFilter, setTransferStatusFilter] = useState<'ALL' | 'REQUESTED' | 'IN_TRANSIT' | 'RECEIVED'>('ALL');

  const [counts, setCounts] = useState<StockCountRow[]>([]);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [itemsSearch, setItemsSearch] = useState('');
  const [movFilterWh, setMovFilterWh] = useState('');
  const [movFilterItem, setMovFilterItem] = useState('');
  const [movFilterType, setMovFilterType] = useState('');
  const [movFromDate, setMovFromDate] = useState('');
  const [movToDate, setMovToDate] = useState('');
  const [movFilterLoading, setMovFilterLoading] = useState(false);
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('ALL');

  // Modal states
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isCountModalOpen, setIsCountModalOpen] = useState(false);

  const [isCreateItemModalOpen, setIsCreateItemModalOpen] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [newItemCode, setNewItemCode] = useState('');
  const [newItemNameAr, setNewItemNameAr] = useState('');
  const [newItemNameEn, setNewItemNameEn] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemUom, setNewItemUom] = useState('قطعة');
  const [newItemValuationMethod, setNewItemValuationMethod] = useState('WEIGHTED_AVERAGE');
  const [newItemReorderPoint, setNewItemReorderPoint] = useState<number>(0);
  const [newItemTrackBatch, setNewItemTrackBatch] = useState(false);
  const [newItemTrackSerial, setNewItemTrackSerial] = useState(false);

  // Form states for Receive
  const [recWarehouseId, setRecWarehouseId] = useState('');
  const [recItemId, setRecItemId] = useState('');
  const [recQty, setRecQty] = useState<number>(1);
  const [recUnitCost, setRecUnitCost] = useState<number>(100);
  const [recBatch, setRecBatch] = useState('');

  // Form states for Issue
  const [issWarehouseId, setIssWarehouseId] = useState('');
  const [issItemId, setIssItemId] = useState('');
  const [issQty, setIssQty] = useState<number>(1);
  const [issPurpose, setIssPurpose] = useState('صرف بضاعة تشغيلية');

  // Form states for Transfer
  const [trfSourceWh, setTrfSourceWh] = useState('');
  const [trfTargetWh, setTrfTargetWh] = useState('');
  const [trfItemId, setTrfItemId] = useState('');
  const [trfQty, setTrfQty] = useState<number>(1);

  // Form states for Count
  const [cntWarehouseId, setCntWarehouseId] = useState('');
  const [cntItemId, setCntItemId] = useState('');
  const [cntCountedQty, setCntCountedQty] = useState<number>(0);
  const [cntNotes, setCntNotes] = useState('');

  // Battery report state
  const [batteryReport, setBatteryReport] = useState<any>(null);
  const [isRunningBattery, setIsRunningBattery] = useState(false);
  const [cardItemId, setCardItemId] = useState<string | null>(null);

  // Load data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const cred = { credentials: 'include' as RequestCredentials };
      const [whRes, itRes, stRes, movRes, trfRes, cntRes] = await Promise.all([
        fetch('/api/inventory/warehouses', cred).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/inventory/items', cred).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/inventory/stock', cred).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/inventory/movements', cred).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/inventory/transfers', cred).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/inventory/counts', cred).then(r => r.json()).catch(() => ({ data: [] })),
      ]);

      if (whRes.data) setWarehouses(whRes.data);
      if (itRes.data) setItems(itRes.data);
      if (stRes.data) setStocks(stRes.data);
      if (movRes.data) setMovements(movRes.data);
      if (trfRes.data) setTransfers(trfRes.data);
      if (cntRes.data) setCounts(cntRes.data);
    } catch {
      onNotification('تعذر استرجاع بيانات المستودعات والمخزون.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadMovementsFiltered = async () => {
    setMovFilterLoading(true);
    try {
      const q = new URLSearchParams();
      if (movFilterWh) q.set('warehouseId', movFilterWh);
      if (movFilterItem) q.set('itemId', movFilterItem);
      if (movFilterType) q.set('movementType', movFilterType);
      if (movFromDate) q.set('fromDate', movFromDate);
      if (movToDate) q.set('toDate', movToDate);
      q.set('limit', '500');
      const res = await fetch(`/api/inventory/movements?${q.toString()}`, { credentials: 'include' });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.data) setMovements(j.data);
      else onNotification(j.error?.detail || j.detail || 'تعذر تصفية الحركات');
    } catch {
      onNotification('تعذر تصفية الحركات');
    } finally {
      setMovFilterLoading(false);
    }
  };

  const clearMovFilters = async () => {
    setMovFilterWh('');
    setMovFilterItem('');
    setMovFilterType('');
    setMovFromDate('');
    setMovToDate('');
    setMovFilterLoading(true);
    try {
      const res = await fetch('/api/inventory/movements?limit=500', { credentials: 'include' });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.data) setMovements(j.data);
    } finally {
      setMovFilterLoading(false);
    }
  };


  const handleRunBattery = async () => {
    setIsRunningBattery(true);
    try {
      const res = await fetch('/api/internal/phase7-battery');
      const data = await res.json();
      setBatteryReport(data);
      onNotification(`اكتملت بطارية القبول: ${data.passedScenarios}/${data.totalScenarios} بنجاح.`);
      loadData();
    } catch {
      onNotification('فشل فحص بطارية قبول المخزون.');
    } finally {
      setIsRunningBattery(false);
    }
  };

  // Create a stock item through the existing tenant-scoped API.
  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemCode.trim() || !newItemNameAr.trim() || !newItemCategory.trim()) {
      onNotification('كود الصنف والاسم العربي والتصنيف حقول إلزامية.');
      return;
    }

    setIsSavingItem(true);
    try {
      const idemKey = `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch('/api/inventory/items', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify({
          itemCode: newItemCode.trim(),
          nameAr: newItemNameAr.trim(),
          nameEn: newItemNameEn.trim() || undefined,
          category: newItemCategory.trim(),
          uom: newItemUom.trim() || 'قطعة',
          valuationMethod: newItemValuationMethod,
          reorderPoint: newItemReorderPoint,
          trackBatch: newItemTrackBatch,
          trackSerial: newItemTrackSerial,
          isActive: true,
          idempotencyKey: idemKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        onNotification(`تم إنشاء بطاقة الصنف ${data.data?.itemCode || newItemCode.trim()} بنجاح.`);
        setIsCreateItemModalOpen(false);
        setNewItemCode('');
        setNewItemNameAr('');
        setNewItemNameEn('');
        setNewItemCategory('');
        setNewItemUom('قطعة');
        setNewItemValuationMethod('WEIGHTED_AVERAGE');
        setNewItemReorderPoint(0);
        setNewItemTrackBatch(false);
        setNewItemTrackSerial(false);
        await loadData();
      } else {
        onNotification(data.error?.detail || data.detail || 'تعذر إنشاء بطاقة الصنف. راجع البيانات والصلاحيات.');
      }
    } catch {
      onNotification('تعذر الاتصال بالخادم أثناء إنشاء بطاقة الصنف.');
    } finally {
      setIsSavingItem(false);
    }
  };

  // Submit Receive
  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recWarehouseId || !recItemId || recQty <= 0 || recUnitCost <= 0) {
      onNotification('يرجى تعبئة جميع الحقول المطلوبة للتوريد.');
      return;
    }

    try {
      const idemKey = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const res = await fetch('/api/inventory/movements/receive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify({
          warehouseId: recWarehouseId,
          lines: [
            {
              itemId: recItemId,
              quantity: recQty,
              unitCost: recUnitCost,
              batchNumber: recBatch || undefined,
            },
          ],
          performedBy: currentUser.id,
          performedByName: currentUser.name,
          idempotencyKey: idemKey,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onNotification(`تم توريد الكمية (${recQty}) وتحديث متوسط التكلفة بنجاح.`);
        setIsReceiveModalOpen(false);
        loadData();
      } else {
        onNotification(data.error?.detail || data.detail || 'فشل تسجيل التوريد المخزني.');
      }
    } catch {
      onNotification('تعذر الاتصال بالخادم أثناء التوريد.');
    }
  };

  // Submit Issue
  const handleIssueStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issWarehouseId || !issItemId || issQty <= 0) {
      onNotification('يرجى تحديد المستودع والصنف والكمية المطلوبة.');
      return;
    }

    try {
      const idemKey = `iss-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const res = await fetch('/api/inventory/movements/issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify({
          warehouseId: issWarehouseId,
          lines: [
            {
              itemId: issItemId,
              quantity: issQty,
            },
          ],
          purpose: issPurpose,
          performedBy: currentUser.id,
          performedByName: currentUser.name,
          idempotencyKey: idemKey,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onNotification(`تم صرف الكمية (${issQty}) وتحديث رصيد المخزون.`);
        setIsIssueModalOpen(false);
        loadData();
      } else {
        onNotification(data.error?.detail || data.detail || 'فشل صرف البضاعة (تحقق من كفاية الرصيد).');
      }
    } catch {
      onNotification('تعذر الاتصال بالخادم أثناء الصرف.');
    }
  };

  // Submit Transfer
  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trfSourceWh || !trfTargetWh || trfSourceWh === trfTargetWh || !trfItemId || trfQty <= 0) {
      onNotification('يرجى اختيار مستودعين مختلفين وتحديد الصنف والكمية.');
      return;
    }

    try {
      const idemKey = `trf-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const res = await fetch('/api/inventory/transfers', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify({
          sourceWarehouseId: trfSourceWh,
          targetWarehouseId: trfTargetWh,
          items: [{ itemId: trfItemId, quantity: trfQty }],
          requestedBy: currentUser.id,
          requestedByName: currentUser.name,
          idempotencyKey: idemKey,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onNotification(`تم إنشاء أمر التحويل المخزني رقم (${data.data?.transferNumber}) بنجاح.`);
        setIsTransferModalOpen(false);
        loadData();
      } else {
        onNotification(data.error?.detail || data.detail || 'فشل إنشاء أمر التحويل.');
      }
    } catch {
      onNotification('تعذر الاتصال بالخادم أثناء إنشاء التحويل.');
    }
  };

  // Dispatch Transfer
  const handleDispatchTransfer = async (transferId: string) => {
    try {
      const idemKey = `disp-${transferId}-${Date.now()}`;
      const res = await fetch(`/api/inventory/transfers/${transferId}/dispatch`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify({
          dispatchedBy: currentUser.id,
          dispatchedByName: currentUser.name,
          idempotencyKey: idemKey,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification('تم إرسال الشحنة وخصم الكمية من مستودع المصدر.');
        loadData();
      } else {
        onNotification(data.error?.detail || data.detail || 'فشل إرسال الشحنة.');
      }
    } catch {
      onNotification('تعذر تنفيذ الإرسال.');
    }
  };

  // Receive Transfer
  const handleReceiveTransfer = async (transferId: string) => {
    try {
      const idemKey = `recv-${transferId}-${Date.now()}`;
      const res = await fetch(`/api/inventory/transfers/${transferId}/receive`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify({
          receivedBy: currentUser.id,
          receivedByName: currentUser.name,
          idempotencyKey: idemKey,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotification('تم استلام الشحنة وإضافتها لمستودع الوجهة بنجاح.');
        loadData();
      } else {
        onNotification(data.error?.detail || data.detail || 'فشل استلام الشحنة.');
      }
    } catch {
      onNotification('تعذر تنفيذ الاستلام.');
    }
  };

  // Submit Stock Count
  const handleCreateCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cntWarehouseId || !cntItemId) {
      onNotification('يرجى تحديد المستودع والصنف المعدود.');
      return;
    }

    try {
      const idemKey = `cnt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const res = await fetch('/api/inventory/counts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify({
          warehouseId: cntWarehouseId,
          countType: 'PERIODIC',
          lines: [{ itemId: cntItemId, countedQty: cntCountedQty }],
          performedBy: currentUser.id,
          performedByName: currentUser.name,
          notes: cntNotes || 'محضر جرد فعلي دوري',
          idempotencyKey: idemKey,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onNotification(`تم قيد محضر الجرد رقم (${data.data?.countNumber}) ورصد الفروقات بنجاح.`);
        setIsCountModalOpen(false);
        loadData();
      } else {
        onNotification(data.error?.detail || data.detail || 'فشل تسجيل محضر الجرد.');
      }
    } catch {
      onNotification('تعذر الاتصال بالخادم أثناء تسجيل محضر الجرد.');
    }
  };

  // Approve Stock Count (Strict Segregation of Duties)
  const handleApproveCount = async (countId: string) => {
    try {
      const idemKey = `appr-cnt-${countId}-${Date.now()}`;
      const res = await fetch(`/api/inventory/counts/${countId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify({
          approvedBy: currentUser.id,
          approvedByName: currentUser.name,
          idempotencyKey: idemKey,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onNotification('تم اعتماد محضر الجرد وترحيل قيد التسوية المتوازن آلياً.');
        loadData();
      } else {
        // Show segregation of duties rejection message clearly
        onNotification(data.error?.detail || data.detail || 'تعذر اعتماد الجرد (تأكد من عدم وجود تعارض مصالح بين منفذ الجرد ومعتمده).');
      }
    } catch {
      onNotification('تعذر استكمال اعتماد محضر الجرد.');
    }
  };

  // Filtered Stock items
  const filteredStocks = stocks.filter(s => {
    const matchesWarehouse = selectedWarehouseFilter === 'ALL' || s.warehouseId === selectedWarehouseFilter;
    const item = items.find(i => i.id === s.itemId);
    const matchesSearch = !searchTerm ||
      (item?.nameAr.includes(searchTerm) || false) ||
      (item?.itemCode.includes(searchTerm) || false);
    return matchesWarehouse && matchesSearch;
  });

  // INV-INTRANSIT-1: filter + open-in-transit summary for warehouse transfers
  const transferCountByStatus = {
    REQUESTED: transfers.filter((t) => t.status === 'REQUESTED').length,
    IN_TRANSIT: transfers.filter((t) => t.status === 'IN_TRANSIT').length,
    RECEIVED: transfers.filter((t) => t.status === 'RECEIVED').length,
  };
  const filteredTransfers =
    transferStatusFilter === 'ALL'
      ? transfers
      : transfers.filter((t) => t.status === transferStatusFilter);

  return (
    <div className="space-y-6">
      {/* Enterprise Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">إدارة المستودعات والمخزون</h1>
              <p className="text-xs text-slate-500 mt-1">
                تعدد المستودعات، التقييم بالمتوسط المرجح، التحويلات، ومحاضر الجرد بتكامل المحركات المحاسبية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsReceiveModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors"
            >
              <ArrowDownRight className="w-4 h-4" />
              توريد مخزني
            </button>
            <button
              onClick={() => setIsIssueModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors"
            >
              <ArrowUpRight className="w-4 h-4" />
              صرف بضاعة
            </button>
            <button
              onClick={() => setIsTransferModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors"
            >
              <ArrowRightLeft className="w-4 h-4" />
              تحويل بين المستودعات
            </button>
            <button
              onClick={() => setIsCountModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors"
            >
              <ClipboardList className="w-4 h-4" />
              محضر جرد
            </button>
            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500">المستودعات المسجلة</span>
            <p className="text-lg font-bold text-slate-900 mt-0.5">{warehouses.length}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500">الأصناف المعرفة</span>
            <p className="text-lg font-bold text-slate-900 mt-0.5">{items.length}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500">التحويلات الجارية</span>
            <p className="text-lg font-bold text-blue-600 mt-0.5">
              {transfers.filter(t => t.status !== 'RECEIVED').length}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500">محاضر الجرد بانتظار الاعتماد</span>
            <p className="text-lg font-bold text-amber-600 mt-0.5">
              {counts.filter(c => c.status === 'COMPLETED').length}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('items')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'items'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Package className="w-4 h-4" />
          الأصناف ({items.length})
        </button>

        <button
          onClick={() => setActiveTab('stock')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'stock'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Boxes className="w-4 h-4" />
          أرصدة وتقييم المخزون
        </button>

        <button
          onClick={() => setActiveTab('warehouses')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'warehouses'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <WarehouseIcon className="w-4 h-4" />
          المستودعات والرفوف ({warehouses.length})
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'movements'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          سجل الحركات المخزنية ({movements.length})
        </button>

        <button
          onClick={() => setActiveTab('transfers')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'transfers'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          التحويلات بين المستودعات ({transfers.length}{transferCountByStatus.IN_TRANSIT > 0 ? ` · ${transferCountByStatus.IN_TRANSIT} في الطريق` : ''})
        </button>

        <button
          onClick={() => setActiveTab('counts')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'counts'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          محاضر الجرد والتسوية ({counts.length})
        </button>

        <button
          onClick={() => setActiveTab('battery')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'battery'
              ? 'bg-slate-800 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          التدقيق والرقابة الآلية
        </button>
      </div>


      {/* Tab Content: Items master list (INV-UI-TABS) */}
      {activeTab === 'items' && (
        <div className="space-y-3">
          <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={itemsSearch}
                onChange={(e) => setItemsSearch(e.target.value)}
                placeholder="بحث بالاسم أو الرمز أو التصنيف..."
                className="w-full pr-9 pl-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              قائمة الأصناف المعرفة — اضغط «بطاقة» لفتح كارتة الصنف حتى لو الرصيد صفر.
            </p>
            <button
              type="button"
              onClick={() => setIsCreateItemModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              إنشاء صنف جديد
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                    <th className="py-3 px-4">الرمز</th>
                    <th className="py-3 px-4">الاسم</th>
                    <th className="py-3 px-4">التصنيف</th>
                    <th className="py-3 px-4 text-center">الوحدة</th>
                    <th className="py-3 px-4 text-center">إعادة الطلب</th>
                    <th className="py-3 px-4 text-center">التقييم</th>
                    <th className="py-3 px-4 text-center">الحالة</th>
                    <th className="py-3 px-4 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.filter((it) => {
                    const q = itemsSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      (it.nameAr || '').toLowerCase().includes(q) ||
                      (it.itemCode || '').toLowerCase().includes(q) ||
                      (it.category || '').toLowerCase().includes(q)
                    );
                  }).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-slate-400">
                        {items.length === 0
                          ? 'لا توجد أصناف معرفة بعد. استخدم «إنشاء صنف جديد» لإضافة أول بطاقة صنف.'
                          : 'لا نتائج مطابقة لبحث الأصناف.'}
                      </td>
                    </tr>
                  ) : (
                    items
                      .filter((it) => {
                        const q = itemsSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          (it.nameAr || '').toLowerCase().includes(q) ||
                          (it.itemCode || '').toLowerCase().includes(q) ||
                          (it.category || '').toLowerCase().includes(q)
                        );
                      })
                      .map((it) => (
                        <tr key={it.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-700">{it.itemCode}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{it.nameAr}</td>
                          <td className="py-3 px-4 text-slate-600">{it.category || '—'}</td>
                          <td className="py-3 px-4 text-center">{it.uom || '—'}</td>
                          <td className="py-3 px-4 text-center tabular-nums">{it.reorderPoint ?? '—'}</td>
                          <td className="py-3 px-4 text-center text-[10px]">{it.valuationMethod || '—'}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                              it.isActive !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {it.isActive !== false ? 'نشط' : 'متوقف'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => setCardItemId(it.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-100 hover:bg-blue-100"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              بطاقة
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

      {/* Tab Content: Stock Levels */}
      {activeTab === 'stock' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="بحث بالصنف أو الرمز..."
                className="w-full pr-9 pl-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">المستودع:</span>
              <select
                value={selectedWarehouseFilter}
                onChange={e => setSelectedWarehouseFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">جميع المستودعات</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.nameAr} ({w.code})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                    <th className="py-3 px-4">الصنف / الرمز</th>
                    <th className="py-3 px-4">المستودع</th>
                    <th className="py-3 px-4 text-center">الرصيد الفعلي</th>
                    <th className="py-3 px-4 text-center">المتاح</th>
                    <th className="py-3 px-4 text-center">حد الطلب</th>
                    <th className="py-3 px-4 text-center">متوسط التكلفة</th>
                    <th className="py-3 px-4 text-left">إجمالي القيمة</th>
                    <th className="py-3 px-4 text-center">حالة التنبيه</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStocks.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-slate-400">
                        لا توجد أرصدة مطابقة لخيارات البحث الحالية.
                      </td>
                    </tr>
                  ) : (
                    filteredStocks.map((stock) => {
                      const item = items.find(i => i.id === stock.itemId);
                      const warehouse = warehouses.find(w => w.id === stock.warehouseId);
                      const isLowStock = item ? stock.availableQty <= item.reorderPoint : false;

                      return (
                        <tr key={stock.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => item?.id && setCardItemId(item.id)}
                              className="text-right w-full hover:bg-blue-50 rounded-lg px-1 -mx-1 transition-colors"
                              title="فتح بطاقة الصنف"
                            >
                              <div className="font-bold text-blue-700 hover:underline">{item?.nameAr || stock.itemId}</div>
                              <div className="text-[11px] text-slate-400 font-mono">{item?.itemCode || '—'}</div>
                            </button>
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            {warehouse?.nameAr || stock.warehouseId}
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-slate-900">
                            {stock.currentQty} {item?.uom || ''}
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-blue-600">
                            {stock.availableQty}
                          </td>
                          <td className="py-3 px-4 text-center text-slate-500 font-medium">
                            {item?.reorderPoint ?? '—'}
                          </td>
                          <td className="py-3 px-4 text-center text-slate-700 font-mono">
                            {stock.averageCost.toLocaleString('ar-SA')} ر.س
                          </td>
                          <td className="py-3 px-4 text-left font-bold text-emerald-700 font-mono">
                            {stock.totalValue.toLocaleString('ar-SA')} ر.س
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isLowStock ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <AlertTriangle className="w-3 h-3" />
                                حد إعادة الطلب
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                مغطى
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Warehouses */}
      {activeTab === 'warehouses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouses.map((wh) => (
            <div key={wh.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-[10px] font-mono font-bold rounded-lg">
                    {wh.code}
                  </span>
                  {wh.isDefault && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-200">
                      رئيسي
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-2">{wh.nameAr}</h3>
                {wh.nameEn && <p className="text-xs text-slate-400 font-sans">{wh.nameEn}</p>}
                <p className="text-xs text-slate-500 mt-2">{wh.location || 'الموقع غير محدد'}</p>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400">طريقة التقييم:</span>
                <span className="font-semibold text-slate-700">
                  {wh.valuationMethod === 'WEIGHTED_AVERAGE' ? 'المتوسط المرجح' : 'FIFO'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Content: Movements */}
      {activeTab === 'movements' && (
        <div className="space-y-3">
        <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-2xs flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Filter className="w-3.5 h-3.5" />
            تصفية سجل الحركات
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <select value={movFilterWh} onChange={(e) => setMovFilterWh(e.target.value)}
              className="border border-slate-200 rounded-xl px-2 py-2 text-xs bg-slate-50">
              <option value="">كل المستودعات</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.nameAr}</option>
              ))}
            </select>
            <select value={movFilterItem} onChange={(e) => setMovFilterItem(e.target.value)}
              className="border border-slate-200 rounded-xl px-2 py-2 text-xs bg-slate-50">
              <option value="">كل الأصناف</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>{it.nameAr} ({it.itemCode})</option>
              ))}
            </select>
            <select value={movFilterType} onChange={(e) => setMovFilterType(e.target.value)}
              className="border border-slate-200 rounded-xl px-2 py-2 text-xs bg-slate-50">
              <option value="">كل الأنواع</option>
              <option value="RECEIPT">استلام RECEIPT</option>
              <option value="ISSUE">صرف ISSUE</option>
              <option value="TRANSFER_IN">تحويل وارد</option>
              <option value="TRANSFER_OUT">تحويل صادر</option>
              <option value="RETURN_RECEIPT">مرتجع استلام</option>
              <option value="RETURN_ISSUE">مرتجع صرف</option>
              <option value="COUNT_ADJUSTMENT_GAIN">تسوية زيادة</option>
              <option value="COUNT_ADJUSTMENT_LOSS">تسوية عجز</option>
            </select>
            <input type="date" value={movFromDate} onChange={(e) => setMovFromDate(e.target.value)}
              className="border border-slate-200 rounded-xl px-2 py-2 text-xs bg-slate-50" title="من تاريخ" />
            <input type="date" value={movToDate} onChange={(e) => setMovToDate(e.target.value)}
              className="border border-slate-200 rounded-xl px-2 py-2 text-xs bg-slate-50" title="إلى تاريخ" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadMovementsFiltered} disabled={movFilterLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-50">
              <Search className="w-3.5 h-3.5" />
              تطبيق التصفية
            </button>
            <button type="button" onClick={clearMovFilters} disabled={movFilterLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">
              مسح التصفية
            </button>
            <span className="text-[11px] text-slate-400 self-center">النتائج: {movements.length}</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <th className="py-3 px-4">رقم الحركة</th>
                  <th className="py-3 px-4">النوع</th>
                  <th className="py-3 px-4">المستودع</th>
                  <th className="py-3 px-4">الصنف</th>
                  <th className="py-3 px-4 text-center">الكمية</th>
                  <th className="py-3 px-4 text-center">التكلفة</th>
                  <th className="py-3 px-4 text-center">الرصيد بعدها</th>
                  <th className="py-3 px-4">المنفذ</th>
                  <th className="py-3 px-4 text-left">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-400">
                      لا توجد حركات مخزنية مسجلة حتى الآن.
                    </td>
                  </tr>
                ) : (
                  movements.map((mov) => {
                    const isPositive = mov.movementType === 'RECEIPT' || mov.movementType === 'TRANSFER_IN' || mov.movementType === 'COUNT_ADJUSTMENT_GAIN';
                    return (
                      <tr key={mov.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{mov.movementNumber}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                            isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {mov.movementType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-700">{mov.warehouseNameAr}</td>
                        <td className="py-3 px-4 font-medium text-slate-900">{mov.itemNameAr}</td>
                        <td className="py-3 px-4 text-center font-bold font-mono">
                          {isPositive ? `+${mov.quantity}` : `-${mov.quantity}`}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-600">
                          {mov.unitCost.toLocaleString('ar-SA')} ر.س
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-blue-600 font-mono">
                          {mov.balanceAfterQty}
                        </td>
                        <td className="py-3 px-4 text-slate-500">{mov.performedByName}</td>
                        <td className="py-3 px-4 text-left text-slate-400 text-[11px]">
                          {new Date(mov.timestamp).toLocaleDateString('ar-SA')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* Tab Content: Transfers (INV-INTRANSIT-1) */}
      {activeTab === 'transfers' && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              <span className="font-bold text-slate-900">الشحنات في الطريق: </span>
              <span className="font-mono font-bold text-blue-700">{transferCountByStatus.IN_TRANSIT}</span>
              <span className="mx-2 text-slate-300">|</span>
              بانتظار الإرسال: <span className="font-mono">{transferCountByStatus.REQUESTED}</span>
              <span className="mx-2 text-slate-300">|</span>
              مكتمل: <span className="font-mono">{transferCountByStatus.RECEIVED}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                ['ALL', 'الكل'],
                ['REQUESTED', 'بانتظار الإرسال'],
                ['IN_TRANSIT', 'في الطريق'],
                ['RECEIVED', 'مكتمل'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTransferStatusFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
                    transferStatusFilter === key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <th className="py-3 px-4">رقم التحويل</th>
                  <th className="py-3 px-4">من مستودع</th>
                  <th className="py-3 px-4">إلى مستودع</th>
                  <th className="py-3 px-4 text-center">إجمالي الكمية</th>
                  <th className="py-3 px-4 text-center">التكلفة الإجمالية</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                  <th className="py-3 px-4">طالب التحويل</th>
                  <th className="py-3 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransfers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      {transfers.length === 0
                        ? 'لا توجد طلبات تحويل بين المستودعات.'
                        : 'لا توجد تحويلات تطابق عامل التصفية (جرّب «الكل» أو «في الطريق»).'}
                    </td>
                  </tr>
                ) : (
                  filteredTransfers.map((trf) => (
                    <tr key={trf.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{trf.transferNumber}</td>
                      <td className="py-3 px-4 text-slate-700">{trf.sourceWarehouseNameAr}</td>
                      <td className="py-3 px-4 text-slate-700">{trf.targetWarehouseNameAr}</td>
                      <td className="py-3 px-4 text-center font-bold text-slate-900">{trf.totalQuantity}</td>
                      <td className="py-3 px-4 text-center font-mono text-slate-700">
                        {trf.totalCost.toLocaleString('ar-SA')} ر.س
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          trf.status === 'RECEIVED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : trf.status === 'IN_TRANSIT'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {trf.status === 'RECEIVED' ? 'مكتمل ومستلم' : trf.status === 'IN_TRANSIT' ? 'في الطريق' : 'بانتظار الإرسال'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">{trf.requestedByName}</td>
                      <td className="py-3 px-4 text-center">
                        {trf.status === 'REQUESTED' && (
                          <button
                            onClick={() => handleDispatchTransfer(trf.id)}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold shadow-2xs"
                          >
                            إرسال الشحنة
                          </button>
                        )}
                        {trf.status === 'IN_TRANSIT' && (
                          <button
                            onClick={() => handleReceiveTransfer(trf.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-2xs"
                          >
                            تأكيد الاستلام
                          </button>
                        )}
                        {trf.status === 'RECEIVED' && (
                          <span className="text-slate-400 text-[11px]">مكتمل</span>
                        )}
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

      {/* Tab Content: Stock Counts */}
      {activeTab === 'counts' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <th className="py-3 px-4">رقم المحضر</th>
                  <th className="py-3 px-4">المستودع</th>
                  <th className="py-3 px-4">المنفذ الفعلي للجرد</th>
                  <th className="py-3 px-4 text-center">الفروقات المرصودة</th>
                  <th className="py-3 px-4 text-center">صافي القيمة</th>
                  <th className="py-3 px-4 text-center">حالة الاعتماد</th>
                  <th className="py-3 px-4 text-center">القيد المحاسبي</th>
                  <th className="py-3 px-4 text-center">إجراء الاعتماد والرقابة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {counts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      لا توجد محاضر جرد مسجلة.
                    </td>
                  </tr>
                ) : (
                  counts.map((cnt) => (
                    <tr key={cnt.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{cnt.countNumber}</td>
                      <td className="py-3 px-4 text-slate-700">{cnt.warehouseNameAr}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{cnt.performedByName}</td>
                      <td className="py-3 px-4 text-center">
                        {cnt.hasVariance ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            يوجد فروقات
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">
                            مطابق تماماً
                          </span>
                        )}
                      </td>
                      <td className={`py-3 px-4 text-center font-mono font-bold ${
                        cnt.netVarianceAmount < 0 ? 'text-rose-600' : cnt.netVarianceAmount > 0 ? 'text-emerald-600' : 'text-slate-500'
                      }`}>
                        {cnt.netVarianceAmount.toLocaleString('ar-SA')} ر.س
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          cnt.status === 'POSTED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {cnt.status === 'POSTED' ? 'معتمد ومرحل' : 'بانتظار مراجعة واعتماد مستقل'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-[11px] text-blue-600">
                        {cnt.journalEntryId || '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {cnt.status !== 'POSTED' ? (
                          <button
                            onClick={() => handleApproveCount(cnt.id)}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold shadow-2xs"
                            title="اعتماد وترحيل التسوية المحاسبية (ممنوع على نفس المنفذ لمنع تعارض المصالح)"
                          >
                            اعتماد وترحيل
                          </button>
                        ) : (
                          <span className="text-emerald-600 font-bold text-[11px] flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            مرحل
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Battery Execution Report */}
      {activeTab === 'battery' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">سجل الفحص والتدقيق الآلي لسلامة العمليات المخزنية</h2>
              <p className="text-xs text-slate-500 mt-1">
                التحقق الآلي من السيناريوهات التشغيلية الـ9: تعدد المستودعات، التقييم بالمتوسط المرجح، الترقيم الذري، فصل الصلاحيات والواجبات، وقيد التسوية المتوازن.
              </p>
            </div>
            <button
              onClick={handleRunBattery}
              disabled={isRunningBattery}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isRunningBattery ? 'animate-spin' : ''}`} />
              تشغيل بطارية الفحص الآن
            </button>
          </div>

          {batteryReport && (
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-medium">إجمالي السيناريوهات</span>
                  <p className="text-base font-bold text-slate-900">{batteryReport.totalScenarios}</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <span className="text-[10px] text-emerald-600 font-medium">الناجحة</span>
                  <p className="text-base font-bold text-emerald-700">{batteryReport.passedScenarios}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-medium">الفاشلة</span>
                  <p className="text-base font-bold text-slate-900">{batteryReport.failedScenarios}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-medium">حالة إغلاق الموديول</span>
                  <p className={`text-base font-bold ${batteryReport.isClosed ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {batteryReport.isClosed ? 'مغلق ومستوفٍ (CLOSED)' : 'غير مكتمل'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {batteryReport.scenarios.map((sc: any) => (
                  <div
                    key={sc.id}
                    className="p-3 rounded-xl border flex items-start gap-3 bg-white border-slate-200"
                  >
                    <div className="mt-0.5">
                      {sc.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{sc.titleAr}</span>
                        <span className="text-[10px] font-mono text-slate-400">{sc.id}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{sc.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Stock Item (INV-ITEM-CREATE) */}
      {isCreateItemModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 mb-5">
              <h2 className="text-base font-bold text-slate-900">إنشاء بطاقة صنف جديدة</h2>
              <button type="button" onClick={() => setIsCreateItemModalOpen(false)} className="text-slate-500 hover:text-slate-900" aria-label="إغلاق">✕</button>
            </div>
            <form onSubmit={handleCreateItem} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">كود الصنف *</label>
                  <input value={newItemCode} onChange={e => setNewItemCode(e.target.value)} maxLength={64} required className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الاسم العربي *</label>
                  <input value={newItemNameAr} onChange={e => setNewItemNameAr(e.target.value)} maxLength={200} required className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الاسم الإنجليزي</label>
                  <input value={newItemNameEn} onChange={e => setNewItemNameEn(e.target.value)} maxLength={200} className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">التصنيف *</label>
                  <input value={newItemCategory} onChange={e => setNewItemCategory(e.target.value)} maxLength={100} required className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">وحدة القياس</label>
                  <input value={newItemUom} onChange={e => setNewItemUom(e.target.value)} maxLength={40} className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">طريقة التقييم</label>
                  <select value={newItemValuationMethod} onChange={e => setNewItemValuationMethod(e.target.value)} className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50">
                    <option value="WEIGHTED_AVERAGE">المتوسط المرجح</option>
                    <option value="FIFO">الوارد أولاً يصرف أولاً (FIFO)</option>
                    <option value="SPECIFIC_LOT">التكلفة المحددة للدفعة</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">حد إعادة الطلب</label>
                  <input type="number" min="0" step="any" value={newItemReorderPoint} onChange={e => setNewItemReorderPoint(Math.max(0, Number(e.target.value) || 0))} className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50" />
                </div>
              </div>
              <div className="flex flex-wrap gap-5">
                <label className="inline-flex items-center gap-2 text-slate-700">
                  <input type="checkbox" checked={newItemTrackBatch} onChange={e => setNewItemTrackBatch(e.target.checked)} />
                  تتبع التشغيلات / الدُفعات
                </label>
                <label className="inline-flex items-center gap-2 text-slate-700">
                  <input type="checkbox" checked={newItemTrackSerial} onChange={e => setNewItemTrackSerial(e.target.checked)} />
                  تتبع الرقم المسلسل
                </label>
              </div>
              <p className="text-[11px] text-slate-500">إنشاء البطاقة لا يضيف رصيدًا للمخزون؛ يتم تسجيل الكميات لاحقًا بإذن توريد معتمد.</p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsCreateItemModalOpen(false)} disabled={isSavingItem} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold disabled:opacity-50">إلغاء</button>
                <button type="submit" disabled={isSavingItem} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">{isSavingItem ? 'جارٍ الحفظ...' : 'حفظ بطاقة الصنف'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Receive Stock */}
      {isReceiveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-4">تسجيل إذن توريد مخزني</h2>
            <form onSubmit={handleReceiveStock} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">المستودع المستلم *</label>
                <select
                  value={recWarehouseId}
                  onChange={e => setRecWarehouseId(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                >
                  <option value="">-- اختر المستودع --</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.nameAr} ({w.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">الصنف *</label>
                <select
                  value={recItemId}
                  onChange={e => setRecItemId(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                >
                  <option value="">-- اختر الصنف --</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>{i.nameAr} ({i.itemCode})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الكمية الموردة *</label>
                  <input
                    type="number"
                    min="1"
                    value={recQty}
                    onChange={e => setRecQty(Number(e.target.value))}
                    required
                    className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تكلفة الوحدة (ر.س) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={recUnitCost}
                    onChange={e => setRecUnitCost(Number(e.target.value))}
                    required
                    className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">رقم التشغيلة (Batch) - اختياري</label>
                <input
                  type="text"
                  value={recBatch}
                  onChange={e => setRecBatch(e.target.value)}
                  placeholder="مثال: LOT-2026-09"
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsReceiveModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-2xs"
                >
                  حفظ وتوريد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Issue Stock */}
      {isIssueModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-4">تسجيل إذن صرف بضاعة</h2>
            <form onSubmit={handleIssueStock} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">مستودع الصرف *</label>
                <select
                  value={issWarehouseId}
                  onChange={e => setIssWarehouseId(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                >
                  <option value="">-- اختر المستودع --</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.nameAr} ({w.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">الصنف المطلوب *</label>
                <select
                  value={issItemId}
                  onChange={e => setIssItemId(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                >
                  <option value="">-- اختر الصنف --</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>{i.nameAr} ({i.itemCode})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">الكمية المطلوبة *</label>
                <input
                  type="number"
                  min="1"
                  value={issQty}
                  onChange={e => setIssQty(Number(e.target.value))}
                  required
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">الغرض من الصرف</label>
                <input
                  type="text"
                  value={issPurpose}
                  onChange={e => setIssPurpose(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsIssueModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold shadow-2xs"
                >
                  صرف وتحديث الرصيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Transfer Stock */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-4">طلب تحويل مخزني بين المستودعات</h2>
            <form onSubmit={handleCreateTransfer} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">من مستودع (المصدر) *</label>
                <select
                  value={trfSourceWh}
                  onChange={e => setTrfSourceWh(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                >
                  <option value="">-- اختر مستودع المصدر --</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.nameAr} ({w.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">إلى مستودع (الوجهة) *</label>
                <select
                  value={trfTargetWh}
                  onChange={e => setTrfTargetWh(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                >
                  <option value="">-- اختر مستودع الوجهة --</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.nameAr} ({w.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">الصنف المراد تحويله *</label>
                <select
                  value={trfItemId}
                  onChange={e => setTrfItemId(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                >
                  <option value="">-- اختر الصنف --</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>{i.nameAr} ({i.itemCode})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">الكمية المراد تحويلها *</label>
                <input
                  type="number"
                  min="1"
                  value={trfQty}
                  onChange={e => setTrfQty(Number(e.target.value))}
                  required
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-2xs"
                >
                  إنشاء أمر التحويل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Stock Count */}
      {isCountModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-4">إنشاء محضر جرد مخزني فعلي</h2>
            <form onSubmit={handleCreateCount} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">المستودع المراد جرده *</label>
                <select
                  value={cntWarehouseId}
                  onChange={e => setCntWarehouseId(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                >
                  <option value="">-- اختر المستودع --</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.nameAr} ({w.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">الصنف المعدود *</label>
                <select
                  value={cntItemId}
                  onChange={e => setCntItemId(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                >
                  <option value="">-- اختر الصنف --</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>{i.nameAr} ({i.itemCode})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">الكمية الفعلية المحصورة *</label>
                <input
                  type="number"
                  min="0"
                  value={cntCountedQty}
                  onChange={e => setCntCountedQty(Number(e.target.value))}
                  required
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  سيتم احتساب الفارق (عجز أو زيادة) بالمقارنة مع الرصيد الدفتري الحالي في النظام تلقائياً.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">ملاحظات محضر الجرد</label>
                <textarea
                  value={cntNotes}
                  onChange={e => setCntNotes(e.target.value)}
                  rows={2}
                  placeholder="بيانات اللجنة، الأسباب الظاهرة للفروقات..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
                <strong>تنبيه فصل الصلاحيات والرقابة الثنائية:</strong> مسجل محضر الجرد ({currentUser.name}) لا يحق له اعتماد المحضر أو ترحيل قيد الفروقات بنفسه منعاً لتعارض المصالح.
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCountModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-2xs"
                >
                  حفظ وقيد المحضر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cardItemId && (
        <ItemCardPanel
          itemId={cardItemId}
          stocks={stocks as any}
          warehouses={warehouses.map((w) => ({ id: w.id, nameAr: w.nameAr }))}
          onClose={() => setCardItemId(null)}
          onReceive={(id) => {
            setRecItemId(id);
            setCardItemId(null);
            setIsReceiveModalOpen(true);
          }}
          onIssue={(id) => {
            setIssItemId(id);
            setCardItemId(null);
            setIsIssueModalOpen(true);
          }}
          onTransfer={(id) => {
            setTrfItemId(id);
            setCardItemId(null);
            setIsTransferModalOpen(true);
          }}
          onCount={(id) => {
            setCntItemId(id);
            setCardItemId(null);
            setIsCountModalOpen(true);
          }}
        />
      )}
    </div>
  );
};
