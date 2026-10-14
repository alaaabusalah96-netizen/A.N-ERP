/**
 * @file PurchasingWorkspaceView.tsx
 * @description واجهة موديول المشتريات — طلب شراء / RFQ / عروض / أوامر / استلام / فواتير الموردين
 * Phase 8 continuation (UI + API wiring). PH8-INV-TAB: supplier invoices list tab. No build terms in labels.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  RefreshCw,
  ShoppingCart,
  FileText,
  Send,
  CheckCircle2,
  XCircle,
  Package,
  Truck,
  ClipboardList,
  Receipt,
  RotateCcw,
} from 'lucide-react';
import { UserProfile } from '../types/erp';

type TabId = 'requests' | 'rfqs' | 'quotes' | 'orders' | 'receipts' | 'invoices' | 'returns';

interface PurchasingWorkspaceViewProps {
  currentUser: UserProfile;
  onNotification: (msg: string) => void;
}

function idemKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const PurchasingWorkspaceView: React.FC<PurchasingWorkspaceViewProps> = ({
  currentUser,
  onNotification,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('requests');
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  // Create PR form
  const [showPrForm, setShowPrForm] = useState(false);
  const [prLines, setPrLines] = useState<Array<{ itemId: string; quantity: string; uom: string }>>([
    { itemId: '', quantity: '1', uom: 'PCS' },
  ]);
  const [prNotes, setPrNotes] = useState('');

  // Convert PR → PO
  const [convertPrId, setConvertPrId] = useState<string | null>(null);
  const [convertVendorId, setConvertVendorId] = useState('');
  const [convertUnitCost, setConvertUnitCost] = useState('10');

  // RFQ from PR
  const [rfqFromPrId, setRfqFromPrId] = useState<string | null>(null);

  // Quote form
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteRfqId, setQuoteRfqId] = useState('');
  const [quoteVendorId, setQuoteVendorId] = useState('');
  const [quotePrice, setQuotePrice] = useState('10');

  // Receipt form
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptPoId, setReceiptPoId] = useState('');
  const [receiptWhId, setReceiptWhId] = useState('');
  const [receiptQty, setReceiptQty] = useState('1');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const opts = { credentials: 'include' as RequestCredentials };
      const [rPr, rRfq, rQ, rPo, rGr, rInv, rRet, rItems, rVendors, rWh] = await Promise.all([
        fetch('/api/purchasing/requests', opts),
        fetch('/api/purchasing/rfqs', opts),
        fetch('/api/purchasing/quotes', opts),
        fetch('/api/purchasing/orders', opts),
        fetch('/api/purchasing/receipts', opts),
        fetch('/api/purchasing/invoices', opts),
        fetch('/api/purchasing/returns', opts),
        fetch('/api/inventory/items', opts),
        fetch('/api/master-data/partners?type=VENDOR', opts).catch(() => null),
        fetch('/api/inventory/warehouses', opts),
      ]);
      if (rPr.ok) {
        const j = await rPr.json();
        setRequests(j.data || []);
      }
      if (rRfq.ok) {
        const j = await rRfq.json();
        setRfqs(j.data || []);
      }
      if (rQ.ok) {
        const j = await rQ.json();
        setQuotes(j.data || []);
      }
      if (rPo.ok) {
        const j = await rPo.json();
        setOrders(j.data || []);
      }
      if (rGr.ok) {
        const j = await rGr.json();
        setReceipts(j.data || []);
      }
      if (rInv.ok) {
        const j = await rInv.json();
        setInvoices(j.data || []);
      }
      if (rRet.ok) {
        const j = await rRet.json();
        setReturns(j.data || []);
      }
      if (rItems.ok) {
        const j = await rItems.json();
        setItems(j.data || j.items || []);
      }
      if (rVendors && rVendors.ok) {
        const j = await rVendors.json();
        setVendors(j.data || []);
      } else {
        // fallback: partners list if route differs
        const alt = await fetch('/api/master-data/partners?type=VENDOR', { credentials: 'include' }).catch(() => null);
        if (alt && alt.ok) {
          const j = await alt.json();
          setVendors(j.data || []);
        }
      }
      if (rWh.ok) {
        const j = await rWh.json();
        setWarehouses(j.data || []);
      }
    } catch {
      onNotification('تعذر تحميل بيانات المشتريات');
    } finally {
      setLoading(false);
    }
  }, [onNotification]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const generateFromReorder = async () => {
    setReorderBusy(true);
    try {
      const res = await fetch('/api/purchasing/reorder/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `ui-reorder-${Date.now()}` },
        body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) {
        onNotification(j.detail || j.error?.detail || j.title || 'فشل توليد طلبات إعادة الطلب');
        return;
      }
      const c = j.data?.created?.length || 0;
      const s = j.data?.skipped?.length || 0;
      const cand = j.data?.candidates?.length || 0;
      onNotification(`إعادة الطلب: مرشّح ${cand} · أُنشئ ${c} · تُخطي ${s}`);
      await loadAll();
      setActiveTab('requests');
    } catch (e: any) {
      onNotification(e.message || 'فشل توليد طلبات إعادة الطلب');
    } finally {
      setReorderBusy(false);
    }
  };


  const postJson = async (url: string, body: any, key: string) => {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.success === false) {
      const detail = j.detail || j.error?.detail || j.error || j.title || 'فشلت العملية';
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    return j;
  };

  const createPr = async () => {
    try {
      const lines = prLines
        .filter((l) => l.itemId && Number(l.quantity) > 0)
        .map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), uom: l.uom || 'PCS' }));
      if (!lines.length) {
        onNotification('أضف سطرًا واحدًا على الأقل بصنف وكمية');
        return;
      }
      await postJson('/api/purchasing/requests', { notes: prNotes, lines }, idemKey('pr'));
      onNotification('تم إنشاء طلب الشراء');
      setShowPrForm(false);
      setPrLines([{ itemId: '', quantity: '1', uom: 'PCS' }]);
      setPrNotes('');
      loadAll();
    } catch (e: any) {
      onNotification(e.message || 'فشل إنشاء طلب الشراء');
    }
  };

  const actPr = async (id: string, action: 'submit' | 'approve' | 'reject') => {
    try {
      const path =
        action === 'submit'
          ? `/api/purchasing/requests/${id}/submit`
          : action === 'approve'
            ? `/api/purchasing/requests/${id}/approve`
            : `/api/purchasing/requests/${id}/reject`;
      await postJson(path, action === 'reject' ? { reason: 'مرفوض من الواجهة' } : {}, idemKey(action));
      onNotification(action === 'submit' ? 'تم تقديم الطلب' : action === 'approve' ? 'تم اعتماد الطلب' : 'تم رفض الطلب');
      loadAll();
    } catch (e: any) {
      onNotification(e.message || 'فشلت العملية');
    }
  };

  const convertPr = async () => {
    if (!convertPrId || !convertVendorId) {
      onNotification('اختر المورد');
      return;
    }
    try {
      const detail = await fetch(`/api/purchasing/requests/${convertPrId}`, { credentials: 'include' });
      const dj = await detail.json();
      const lines = dj.data?.lines || [];
      const unitCosts: Record<string, number> = {};
      for (const l of lines) unitCosts[l.itemId] = Number(convertUnitCost) || 0;
      await postJson(
        `/api/purchasing/requests/${convertPrId}/convert-to-po`,
        { vendorId: convertVendorId, unitCosts },
        idemKey('pr2po'),
      );
      onNotification('تم تحويل طلب الشراء إلى أمر شراء');
      setConvertPrId(null);
      loadAll();
      setActiveTab('orders');
    } catch (e: any) {
      onNotification(e.message || 'فشل التحويل');
    }
  };

  const createRfqFromPr = async (prId: string) => {
    try {
      await postJson('/api/purchasing/rfqs', { prId }, idemKey('rfq'));
      onNotification('تم إنشاء طلب عرض السعر');
      setRfqFromPrId(null);
      loadAll();
      setActiveTab('rfqs');
    } catch (e: any) {
      onNotification(e.message || 'فشل إنشاء طلب عرض السعر');
    }
  };

  const sendRfq = async (id: string) => {
    try {
      await postJson(`/api/purchasing/rfqs/${id}/send`, {}, idemKey('rfq-send'));
      onNotification('تم إرسال طلب عرض السعر');
      loadAll();
    } catch (e: any) {
      onNotification(e.message || 'فشل الإرسال');
    }
  };

  const recordQuote = async () => {
    if (!quoteRfqId || !quoteVendorId) {
      onNotification('اختر طلب العرض والمورد');
      return;
    }
    try {
      const detail = await fetch(`/api/purchasing/rfqs/${quoteRfqId}`, { credentials: 'include' });
      const dj = await detail.json();
      const lines = (dj.data?.lines || []).map((l: any) => ({
        rfqLineId: l.id,
        itemId: l.itemId,
        quantity: l.quantity,
        unitPrice: Number(quotePrice) || 0,
      }));
      if (!lines.length) {
        onNotification('لا توجد بنود في طلب العرض');
        return;
      }
      await postJson(
        '/api/purchasing/quotes',
        { rfqId: quoteRfqId, vendorId: quoteVendorId, lines },
        idemKey('sq'),
      );
      onNotification('تم تسجيل عرض المورد');
      setShowQuoteForm(false);
      loadAll();
      setActiveTab('quotes');
    } catch (e: any) {
      onNotification(e.message || 'فشل تسجيل العرض');
    }
  };

  const selectQuote = async (id: string) => {
    try {
      await postJson(`/api/purchasing/quotes/${id}/select`, {}, idemKey('sq-sel'));
      onNotification('تم اختيار العرض');
      loadAll();
    } catch (e: any) {
      onNotification(e.message || 'فشل الاختيار');
    }
  };

  const convertQuote = async (id: string) => {
    try {
      await postJson(`/api/purchasing/quotes/${id}/convert-to-po`, {}, idemKey('sq2po'));
      onNotification('تم تحويل العرض إلى أمر شراء');
      loadAll();
      setActiveTab('orders');
    } catch (e: any) {
      onNotification(e.message || 'فشل التحويل');
    }
  };

  const openPo = async (id: string) => {
    try {
      await postJson(`/api/purchasing/orders/${id}/open`, {}, idemKey('po-open'));
      onNotification('تم فتح أمر الشراء');
      loadAll();
    } catch (e: any) {
      onNotification(e.message || 'فشل الفتح');
    }
  };

  const createReceipt = async () => {
    if (!receiptPoId || !receiptWhId) {
      onNotification('اختر أمر الشراء والمستودع');
      return;
    }
    try {
      const detail = await fetch(`/api/purchasing/orders/${receiptPoId}`, { credentials: 'include' });
      const dj = await detail.json();
      const lines = (dj.data?.lines || []).map((l: any) => ({
        poLineId: l.id,
        receivedQty: Number(receiptQty) || l.orderedQty,
      }));
      await postJson(
        '/api/purchasing/receipts',
        { poId: receiptPoId, warehouseId: receiptWhId, lines },
        idemKey('gr'),
      );
      onNotification('تم تسجيل إذن الاستلام');
      setShowReceiptForm(false);
      loadAll();
      setActiveTab('receipts');
    } catch (e: any) {
      onNotification(e.message || 'فشل تسجيل الاستلام');
    }
  };

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'requests', label: 'طلبات الشراء', icon: ClipboardList },
    { id: 'rfqs', label: 'طلبات عروض الأسعار', icon: Send },
    { id: 'quotes', label: 'عروض الموردين', icon: FileText },
    { id: 'orders', label: 'أوامر الشراء', icon: ShoppingCart },
    { id: 'receipts', label: 'إذونات الاستلام', icon: Package },
    { id: 'invoices', label: 'فواتير الموردين', icon: Receipt },
    { id: 'returns', label: 'مرتجعات المشتريات', icon: RotateCcw },
  ];

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      DRAFT: 'bg-slate-100 text-slate-700',
      PENDING_APPROVAL: 'bg-amber-100 text-amber-800',
      APPROVED: 'bg-emerald-100 text-emerald-800',
      REJECTED: 'bg-red-100 text-red-800',
      CONVERTED: 'bg-blue-100 text-blue-800',
      SENT: 'bg-indigo-100 text-indigo-800',
      CLOSED: 'bg-slate-200 text-slate-600',
      RECEIVED: 'bg-teal-100 text-teal-800',
      MATCH_PENDING: 'bg-amber-100 text-amber-800',
      MATCHED: 'bg-blue-100 text-blue-800',
      POSTED: 'bg-emerald-100 text-emerald-800',
      SELECTED: 'bg-emerald-100 text-emerald-800',
      OPEN: 'bg-blue-100 text-blue-800',
      PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-800',
      IN_APPROVAL: 'bg-amber-100 text-amber-800',
      POSTING_FAILED: 'bg-red-100 text-red-800',
      CANCELLED: 'bg-slate-200 text-slate-500',
    };
    return map[s] || 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            المشتريات والتوريد
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            طلب شراء ← عرض سعر ← أمر شراء ← استلام — المستخدم: {currentUser?.name || currentUser?.fullName || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={generateFromReorder}
            disabled={reorderBusy || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${reorderBusy ? 'animate-spin' : ''}`} />
            توليد من إعادة الطلب
          </button>
          <button
            type="button"
            onClick={loadAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-slate-200">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-t-lg transition-colors ${
                active ? 'bg-blue-50 text-blue-700 border border-b-0 border-blue-100' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* REQUESTS */}
      {activeTab === 'requests' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">{requests.length} طلب</p>
            <button
              type="button"
              onClick={() => setShowPrForm((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
            >
              <Plus className="w-3.5 h-3.5" /> طلب شراء جديد
            </button>
          </div>

          {showPrForm && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
              <p className="text-sm font-bold text-slate-800">إنشاء طلب شراء متعدد البنود</p>
              {prLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <select
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                    value={line.itemId}
                    onChange={(e) => {
                      const next = [...prLines];
                      next[idx] = { ...next[idx], itemId: e.target.value };
                      setPrLines(next);
                    }}
                  >
                    <option value="">اختر الصنف</option>
                    {items.map((it: any) => (
                      <option key={it.id} value={it.id}>
                        {it.nameAr || it.itemCode || it.id}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0.0001"
                    step="any"
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                    value={line.quantity}
                    onChange={(e) => {
                      const next = [...prLines];
                      next[idx] = { ...next[idx], quantity: e.target.value };
                      setPrLines(next);
                    }}
                    placeholder="الكمية"
                  />
                  <input
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                    value={line.uom}
                    onChange={(e) => {
                      const next = [...prLines];
                      next[idx] = { ...next[idx], uom: e.target.value };
                      setPrLines(next);
                    }}
                    placeholder="الوحدة"
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs text-blue-600 font-semibold"
                  onClick={() => setPrLines([...prLines, { itemId: '', quantity: '1', uom: 'PCS' }])}
                >
                  + سطر إضافي
                </button>
              </div>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                rows={2}
                placeholder="ملاحظات"
                value={prNotes}
                onChange={(e) => setPrNotes(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <button type="button" className="px-3 py-1.5 text-xs rounded-lg border" onClick={() => setShowPrForm(false)}>
                  إلغاء
                </button>
                <button type="button" className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white font-bold" onClick={createPr}>
                  حفظ الطلب
                </button>
              </div>
            </div>
          )}

          {convertPrId && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <p className="text-sm font-bold text-amber-900">تحويل الطلب إلى أمر شراء</p>
              <select
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                value={convertVendorId}
                onChange={(e) => setConvertVendorId(e.target.value)}
              >
                <option value="">اختر المورد المعتمد</option>
                {vendors.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.nameAr || v.code || v.id}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                value={convertUnitCost}
                onChange={(e) => setConvertUnitCost(e.target.value)}
                placeholder="تكلفة الوحدة الافتراضية"
              />
              <div className="flex gap-2 justify-end">
                <button type="button" className="px-3 py-1.5 text-xs rounded-lg border" onClick={() => setConvertPrId(null)}>
                  إلغاء
                </button>
                <button type="button" className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white font-bold" onClick={convertPr}>
                  تحويل
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">الرقم</th>
                  <th className="px-3 py-2 font-semibold">الحالة</th>
                  <th className="px-3 py-2 font-semibold">مقدم الطلب</th>
                  <th className="px-3 py-2 font-semibold">التاريخ</th>
                  <th className="px-3 py-2 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                      لا توجد طلبات شراء بعد — أنشئ طلبًا جديدًا للبدء
                    </td>
                  </tr>
                )}
                {requests.map((pr) => (
                  <tr key={pr.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2 font-semibold text-slate-800">{pr.prNumber}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBadge(pr.status)}`}>{pr.status}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{pr.requestedBy}</td>
                    <td className="px-3 py-2 text-slate-500">{(pr.createdAt || '').slice(0, 10)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {pr.status === 'DRAFT' && (
                          <button type="button" className="text-[10px] font-bold text-blue-600" onClick={() => actPr(pr.id, 'submit')}>
                            تقديم
                          </button>
                        )}
                        {(pr.status === 'DRAFT' || pr.status === 'PENDING_APPROVAL') && (
                          <>
                            <button type="button" className="text-[10px] font-bold text-emerald-600" onClick={() => actPr(pr.id, 'approve')}>
                              اعتماد
                            </button>
                            <button type="button" className="text-[10px] font-bold text-red-600" onClick={() => actPr(pr.id, 'reject')}>
                              رفض
                            </button>
                          </>
                        )}
                        {pr.status === 'APPROVED' && (
                          <>
                            <button type="button" className="text-[10px] font-bold text-indigo-600" onClick={() => setConvertPrId(pr.id)}>
                              تحويل لأمر شراء
                            </button>
                            <button type="button" className="text-[10px] font-bold text-slate-600" onClick={() => createRfqFromPr(pr.id)}>
                              إنشاء RFQ
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RFQs */}
      {activeTab === 'rfqs' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">الرقم</th>
                <th className="px-3 py-2 font-semibold">الحالة</th>
                <th className="px-3 py-2 font-semibold">طلب الشراء</th>
                <th className="px-3 py-2 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rfqs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                    لا توجد طلبات عروض أسعار
                  </td>
                </tr>
              )}
              {rfqs.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold">{r.rfqNumber}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBadge(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{r.prId || '—'}</td>
                  <td className="px-3 py-2">
                    {r.status === 'DRAFT' && (
                      <button type="button" className="text-[10px] font-bold text-blue-600" onClick={() => sendRfq(r.id)}>
                        إرسال
                      </button>
                    )}
                    {(r.status === 'SENT' || r.status === 'DRAFT') && (
                      <button
                        type="button"
                        className="text-[10px] font-bold text-indigo-600 mr-2"
                        onClick={() => {
                          setQuoteRfqId(r.id);
                          setShowQuoteForm(true);
                          setActiveTab('quotes');
                        }}
                      >
                        تسجيل عرض
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* QUOTES */}
      {activeTab === 'quotes' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowQuoteForm((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" /> تسجيل عرض مورد
            </button>
          </div>
          {showQuoteForm && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <select className="w-full border rounded-lg px-2 py-1.5 text-xs" value={quoteRfqId} onChange={(e) => setQuoteRfqId(e.target.value)}>
                <option value="">اختر طلب عرض السعر</option>
                {rfqs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.rfqNumber} ({r.status})
                  </option>
                ))}
              </select>
              <select className="w-full border rounded-lg px-2 py-1.5 text-xs" value={quoteVendorId} onChange={(e) => setQuoteVendorId(e.target.value)}>
                <option value="">اختر المورد</option>
                {vendors.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.nameAr || v.id}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="w-full border rounded-lg px-2 py-1.5 text-xs"
                value={quotePrice}
                onChange={(e) => setQuotePrice(e.target.value)}
                placeholder="سعر الوحدة"
              />
              <div className="flex justify-end gap-2">
                <button type="button" className="px-3 py-1.5 text-xs border rounded-lg" onClick={() => setShowQuoteForm(false)}>
                  إلغاء
                </button>
                <button type="button" className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-bold" onClick={recordQuote}>
                  حفظ العرض
                </button>
              </div>
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">الرقم</th>
                  <th className="px-3 py-2 font-semibold">المورد</th>
                  <th className="px-3 py-2 font-semibold">الحالة</th>
                  <th className="px-3 py-2 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {quotes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                      لا توجد عروض موردين
                    </td>
                  </tr>
                )}
                {quotes.map((q) => (
                  <tr key={q.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">{q.quoteNumber}</td>
                    <td className="px-3 py-2">{q.vendorName}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBadge(q.status)}`}>{q.status}</span>
                    </td>
                    <td className="px-3 py-2 space-x-1 space-x-reverse">
                      {q.status === 'RECEIVED' && (
                        <button type="button" className="text-[10px] font-bold text-emerald-600" onClick={() => selectQuote(q.id)}>
                          اختيار
                        </button>
                      )}
                      {(q.status === 'SELECTED' || q.status === 'RECEIVED') && !q.convertedPoId && (
                        <button type="button" className="text-[10px] font-bold text-blue-600" onClick={() => convertQuote(q.id)}>
                          تحويل لأمر شراء
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ORDERS */}
      {activeTab === 'orders' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowReceiptForm(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700"
            >
              <Package className="w-3.5 h-3.5" /> تسجيل استلام
            </button>
          </div>
          {showReceiptForm && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <select className="w-full border rounded-lg px-2 py-1.5 text-xs" value={receiptPoId} onChange={(e) => setReceiptPoId(e.target.value)}>
                <option value="">اختر أمر الشراء</option>
                {orders
                  .filter((o) => o.status === 'OPEN' || o.status === 'PARTIALLY_RECEIVED')
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.poNumber} — {o.vendorName}
                    </option>
                  ))}
              </select>
              <select className="w-full border rounded-lg px-2 py-1.5 text-xs" value={receiptWhId} onChange={(e) => setReceiptWhId(e.target.value)}>
                <option value="">اختر المستودع</option>
                {warehouses.map((w: any) => (
                  <option key={w.id} value={w.id}>
                    {w.nameAr || w.code || w.id}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="w-full border rounded-lg px-2 py-1.5 text-xs"
                value={receiptQty}
                onChange={(e) => setReceiptQty(e.target.value)}
                placeholder="كمية الاستلام للبند"
              />
              <div className="flex justify-end gap-2">
                <button type="button" className="px-3 py-1.5 text-xs border rounded-lg" onClick={() => setShowReceiptForm(false)}>
                  إلغاء
                </button>
                <button type="button" className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-bold" onClick={createReceipt}>
                  حفظ الاستلام
                </button>
              </div>
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">الرقم</th>
                  <th className="px-3 py-2 font-semibold">المورد</th>
                  <th className="px-3 py-2 font-semibold">الحالة</th>
                  <th className="px-3 py-2 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                      لا توجد أوامر شراء
                    </td>
                  </tr>
                )}
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">{o.poNumber}</td>
                    <td className="px-3 py-2">{o.vendorName}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBadge(o.status)}`}>{o.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      {o.status === 'DRAFT' && (
                        <button type="button" className="text-[10px] font-bold text-blue-600" onClick={() => openPo(o.id)}>
                          فتح الأمر
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RECEIPTS */}
      {activeTab === 'receipts' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">الرقم</th>
                <th className="px-3 py-2 font-semibold">أمر الشراء</th>
                <th className="px-3 py-2 font-semibold">الحالة</th>
                <th className="px-3 py-2 font-semibold">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {receipts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                    لا توجد إذونات استلام
                  </td>
                </tr>
              )}
              {receipts.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold">{r.receiptNumber}</td>
                  <td className="px-3 py-2">{r.poNumber}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBadge(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{(r.createdAt || '').slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">رقم الفاتورة</th>
                <th className="px-3 py-2 font-semibold">أمر الشراء</th>
                <th className="px-3 py-2 font-semibold">المورد</th>
                <th className="px-3 py-2 font-semibold">الحالة</th>
                <th className="px-3 py-2 font-semibold">الإجمالي</th>
                <th className="px-3 py-2 font-semibold">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                    لا توجد فواتير موردين
                  </td>
                </tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold">{inv.invoiceNumber || inv.id}</td>
                  <td className="px-3 py-2">{inv.poNumber || inv.poId || '—'}</td>
                  <td className="px-3 py-2">{inv.vendorName || inv.vendorId || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBadge(inv.status)}`}>{inv.status}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{inv.totalAmount != null ? Number(inv.totalAmount).toLocaleString('ar') : (inv.grandTotal != null ? Number(inv.grandTotal).toLocaleString('ar') : '—')}</td>
                  <td className="px-3 py-2 text-slate-500">{(inv.invoiceDate || inv.createdAt || '').toString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'returns' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">رقم المرتجع</th>
                <th className="px-3 py-2 font-semibold">المستند الأصلي</th>
                <th className="px-3 py-2 font-semibold">الكمية</th>
                <th className="px-3 py-2 font-semibold">الحالة</th>
                <th className="px-3 py-2 font-semibold">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {returns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                    لا توجد مرتجعات مشتريات
                  </td>
                </tr>
              )}
              {returns.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold">{r.documentNumber || r.id}</td>
                  <td className="px-3 py-2 text-slate-600">{r.referenceId || '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{r.totalQuantity != null ? Number(r.totalQuantity).toLocaleString('ar') : '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBadge(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{(r.postedAt || r.createdAt || '').toString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};