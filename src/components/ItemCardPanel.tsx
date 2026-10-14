/**
 * INV-ITEM-CARD — بطاقة صنف (عرض فقط + اختصارات)
 * يستهلك: GET /api/inventory/items/:id | ledger | prices و أرصدة ممرَّرة من الأب
 */
import React, { useEffect, useState } from 'react';
import { X, Package, Warehouse, ArrowUpRight, ArrowDownRight, ArrowRightLeft, ClipboardList, RefreshCw } from 'lucide-react';

export interface ItemCardItem {
  id: string;
  itemCode: string;
  nameAr: string;
  category?: string;
  uom?: string;
  valuationMethod?: string;
  averageCost?: number;
  standardCost?: number;
  reorderPoint?: number;
  minStockLevel?: number;
  maxStockLevel?: number;
  inventoryAccountCode?: string;
  cogsAccountCode?: string;
  trackBatch?: boolean;
  trackSerial?: boolean;
  isActive?: boolean;
}

export interface ItemCardStock {
  id: string;
  warehouseId: string;
  warehouseNameAr?: string;
  currentQty: number;
  availableQty: number;
  reservedQty?: number;
  averageCost?: number;
  totalValue?: number;
}

interface Props {
  itemId: string;
  stocks: ItemCardStock[];
  warehouses: Array<{ id: string; nameAr: string }>;
  onClose: () => void;
  onIssue?: (itemId: string) => void;
  onReceive?: (itemId: string) => void;
  onTransfer?: (itemId: string) => void;
  onCount?: (itemId: string) => void;
}

type CardTab = 'info' | 'stock' | 'ledger' | 'prices';

export const ItemCardPanel: React.FC<Props> = ({
  itemId, stocks, warehouses, onClose, onIssue, onReceive, onTransfer, onCount,
}) => {
  const [tab, setTab] = useState<CardTab>('info');
  const [item, setItem] = useState<ItemCardItem | null>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const itemStocks = stocks.filter((s: any) => s.itemId === itemId);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const opts = { credentials: 'include' as RequestCredentials };
      const [rItem, rLed, rPr] = await Promise.all([
        fetch(`/api/inventory/items/${encodeURIComponent(itemId)}`, opts),
        fetch(`/api/inventory/items/${encodeURIComponent(itemId)}/ledger`, opts),
        fetch(`/api/inventory/items/${encodeURIComponent(itemId)}/prices`, opts),
      ]);
      if (rItem.ok) {
        const j = await rItem.json();
        setItem(j.data || j);
      } else {
        setError('تعذر تحميل بطاقة الصنف');
      }
      if (rLed.ok) {
        const j = await rLed.json();
        const data = j.data || j;
        const entries = data.entries || data.lines || data.movements || (Array.isArray(data) ? data : []);
        setLedger(Array.isArray(entries) ? entries : []);
      }
      if (rPr.ok) {
        const j = await rPr.json();
        setPrices(j.data || j.prices || []);
      }
    } catch (e: any) {
      setError(e.message || 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const whName = (id: string) => warehouses.find((w) => w.id === id)?.nameAr || id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" dir="rtl" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">
                {item?.nameAr || 'بطاقة صنف'}
              </h2>
              <p className="text-[11px] text-slate-500 font-mono">
                {item?.itemCode || itemId}
                {item?.isActive === false ? ' · متوقف' : ''}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500" aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-slate-100">
          <button type="button" disabled={!onReceive} onClick={() => onReceive?.(itemId)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-100 disabled:opacity-40">
            <ArrowDownRight className="w-3.5 h-3.5" /> استلام
          </button>
          <button type="button" disabled={!onIssue} onClick={() => onIssue?.(itemId)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-100 disabled:opacity-40">
            <ArrowUpRight className="w-3.5 h-3.5" /> صرف
          </button>
          <button type="button" disabled={!onTransfer} onClick={() => onTransfer?.(itemId)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-100 disabled:opacity-40">
            <ArrowRightLeft className="w-3.5 h-3.5" /> تحويل
          </button>
          <button type="button" disabled={!onCount} onClick={() => onCount?.(itemId)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-50 text-slate-700 border border-slate-200 disabled:opacity-40">
            <ClipboardList className="w-3.5 h-3.5" /> جرد
          </button>
          <button type="button" onClick={load}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-600 mr-auto">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-2 border-b border-slate-100">
          {([
            ['info', 'البيانات'],
            ['stock', 'الأرصدة'],
            ['ledger', 'الحركات'],
            ['prices', 'الأسعار'],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={`px-3 py-2 text-xs font-bold rounded-t-lg ${tab === id ? 'bg-white text-blue-700 border border-b-0 border-slate-200' : 'text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 text-sm">
          {loading && <p className="text-slate-400 text-center py-8">جاري التحميل…</p>}
          {error && <p className="text-red-600 text-center py-4">{error}</p>}

          {!loading && tab === 'info' && item && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50"><div className="text-slate-500">التصنيف</div><div className="font-bold">{item.category || '—'}</div></div>
              <div className="p-3 rounded-xl bg-slate-50"><div className="text-slate-500">وحدة القياس</div><div className="font-bold">{item.uom || '—'}</div></div>
              <div className="p-3 rounded-xl bg-slate-50"><div className="text-slate-500">طريقة التقييم</div><div className="font-bold">{item.valuationMethod || '—'}</div></div>
              <div className="p-3 rounded-xl bg-slate-50"><div className="text-slate-500">متوسط التكلفة</div><div className="font-bold">{Number(item.averageCost || 0).toLocaleString('ar')}</div></div>
              <div className="p-3 rounded-xl bg-slate-50"><div className="text-slate-500">نقطة إعادة الطلب</div><div className="font-bold">{item.reorderPoint ?? '—'}</div></div>
              <div className="p-3 rounded-xl bg-slate-50"><div className="text-slate-500">حد أدنى / أقصى</div><div className="font-bold">{item.minStockLevel ?? '—'} / {item.maxStockLevel ?? '—'}</div></div>
              <div className="p-3 rounded-xl bg-slate-50"><div className="text-slate-500">حساب المخزون</div><div className="font-mono font-bold">{item.inventoryAccountCode || '—'}</div></div>
              <div className="p-3 rounded-xl bg-slate-50"><div className="text-slate-500">حساب التكلفة</div><div className="font-mono font-bold">{item.cogsAccountCode || '—'}</div></div>
              <div className="p-3 rounded-xl bg-slate-50 col-span-2"><div className="text-slate-500">تتبع</div><div className="font-bold">دفعة: {item.trackBatch ? 'نعم' : 'لا'} · تسلسلي: {item.trackSerial ? 'نعم' : 'لا'}</div></div>
            </div>
          )}

          {!loading && tab === 'stock' && (
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="py-2 px-2">المستودع</th>
                  <th className="py-2 px-2 text-center">الرصيد</th>
                  <th className="py-2 px-2 text-center">المتاح</th>
                  <th className="py-2 px-2 text-center">محجوز</th>
                  <th className="py-2 px-2 text-left">القيمة</th>
                </tr>
              </thead>
              <tbody>
                {itemStocks.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400">لا يوجد رصيد لهذا الصنف</td></tr>
                )}
                {itemStocks.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="py-2 px-2 font-semibold">{s.warehouseNameAr || whName(s.warehouseId)}</td>
                    <td className="py-2 px-2 text-center tabular-nums">{Number(s.currentQty).toLocaleString('ar')}</td>
                    <td className="py-2 px-2 text-center tabular-nums">{Number(s.availableQty).toLocaleString('ar')}</td>
                    <td className="py-2 px-2 text-center tabular-nums">{Number(s.reservedQty || 0).toLocaleString('ar')}</td>
                    <td className="py-2 px-2 text-left tabular-nums">{Number(s.totalValue || 0).toLocaleString('ar')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && tab === 'ledger' && (
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="py-2 px-2">التاريخ</th>
                  <th className="py-2 px-2">النوع</th>
                  <th className="py-2 px-2">المستودع</th>
                  <th className="py-2 px-2 text-center">الكمية</th>
                  <th className="py-2 px-2 text-center">الرصيد بعد</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400">لا حركات مسجّلة</td></tr>
                )}
                {ledger.slice(0, 100).map((e: any, idx: number) => (
                  <tr key={e.id || idx} className="border-t border-slate-100">
                    <td className="py-2 px-2 text-slate-500">{(e.timestamp || e.postedAt || e.date || '').toString().slice(0, 19)}</td>
                    <td className="py-2 px-2 font-semibold">{e.movementType || e.documentType || e.type || '—'}</td>
                    <td className="py-2 px-2">{e.warehouseNameAr || e.warehouseId || '—'}</td>
                    <td className="py-2 px-2 text-center tabular-nums">{e.quantity != null ? Number(e.quantity).toLocaleString('ar') : '—'}</td>
                    <td className="py-2 px-2 text-center tabular-nums">{e.balanceAfterQty != null ? Number(e.balanceAfterQty).toLocaleString('ar') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && tab === 'prices' && (
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="py-2 px-2">النوع</th>
                  <th className="py-2 px-2">السعر</th>
                  <th className="py-2 px-2">من</th>
                  <th className="py-2 px-2">إلى</th>
                </tr>
              </thead>
              <tbody>
                {(!prices || prices.length === 0) && (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-400">لا أسعار مسجّلة</td></tr>
                )}
                {(prices || []).map((p: any, idx: number) => (
                  <tr key={p.id || idx} className="border-t border-slate-100">
                    <td className="py-2 px-2">{p.priceType || p.type || '—'}</td>
                    <td className="py-2 px-2 tabular-nums font-bold">{Number(p.amount ?? p.price ?? 0).toLocaleString('ar')}</td>
                    <td className="py-2 px-2">{(p.validFrom || '').toString().slice(0, 10)}</td>
                    <td className="py-2 px-2">{(p.validTo || '').toString().slice(0, 10) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ItemCardPanel;
