// endpoints: '/dispatch', '/receive'
import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, Save, AlertCircle } from 'lucide-react';

interface XcompanyViewProps {
  onNotification: (msg: string) => void;
}

type Group = { id: string; nameAr?: string; code?: string; memberTenantIds?: string[] };
type Transfer = {
  id: string;
  groupId?: string;
  sourceTenantId?: string;
  targetTenantId?: string;
  itemCode?: string;
  quantity?: number;
  status?: string;
};

export const XcompanyView: React.FC<XcompanyViewProps> = ({ onNotification }) => {
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [busy, setBusy] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [sourceTenantId, setSourceTenantId] = useState('');
  const [targetTenantId, setTargetTenantId] = useState('');
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [quantity, setQuantity] = useState(1);

  const idem = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
    `xct-${Date.now()}`;

  const loadGroups = async () => {
    try {
      const res = await fetch('/api/groups', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        const list = data?.data || data || [];
        setGroups(Array.isArray(list) ? list : []);
      }
    } catch { /* ignore */ }
  };

  const loadTransfers = async () => {
    try {
      const q = groupId ? `?groupId=${encodeURIComponent(groupId)}` : '';
      const res = await fetch(`/api/xcompany/transfers${q}`, { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || 'تعذر تحميل التحويلات (مدير منصة)');
        return;
      }
      const list = data?.data || data || [];
      setTransfers(Array.isArray(list) ? list : []);
    } catch {
      setError('تعذر الاتصال أثناء تحميل التحويلات');
    }
  };

  useEffect(() => { loadGroups(); loadTransfers(); }, []);
  useEffect(() => { loadTransfers(); }, [groupId]);

  const members = groups.find((g) => g.id === groupId)?.memberTenantIds || [];

  const createTransfer = async () => {
    setError(null); setBusy(true);
    try {
      const key = idem();
      const res = await fetch('/api/xcompany/transfers', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          groupId, sourceTenantId, targetTenantId, sourceWarehouseId, targetWarehouseId,
          itemCode, quantity: Number(quantity), idempotencyKey: key,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.detail || data?.title || 'فشل إنشاء التحويل'); return; }
      onNotification('تم إنشاء تحويل بين الشركات');
      await loadTransfers();
    } catch { setError('تعذر الاتصال أثناء إنشاء التحويل'); }
    finally { setBusy(false); }
  };

  const act = async (id: string, action: 'dispatch' | 'receive') => {
    setError(null); setBusy(true);
    try {
      const key = idem();
      const res = await fetch(`/api/xcompany/transfers/${encodeURIComponent(id)}/${action}`, {
        method: 'POST', credentials: 'include', headers: { 'Idempotency-Key': key },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.detail || data?.title || `فشل ${action}`); return; }
      onNotification(action === 'dispatch' ? 'تم إرسال التحويل' : 'تم استلام التحويل');
      await loadTransfers();
    } catch { setError('تعذر الاتصال أثناء تنفيذ الإجراء'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-blue-700" />
          تحويل مخزون بين شركات
        </h2>
        <p className="text-xs text-slate-500 mt-1">مسار المنصة — إنشاء / إرسال / استلام تحويل داخل نفس المجموعة.</p>
      </div>
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
        <p className="font-bold">إنشاء تحويل</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select className="border border-slate-200 rounded-xl px-3 py-2" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">المجموعة</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.nameAr || g.code || g.id}</option>)}
          </select>
          <select className="border border-slate-200 rounded-xl px-3 py-2" value={sourceTenantId} onChange={(e) => setSourceTenantId(e.target.value)}>
            <option value="">شركة المصدر</option>
            {members.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <select className="border border-slate-200 rounded-xl px-3 py-2" value={targetTenantId} onChange={(e) => setTargetTenantId(e.target.value)}>
            <option value="">شركة الهدف</option>
            {members.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <input className="border border-slate-200 rounded-xl px-3 py-2" placeholder="مستودع المصدر (id)" value={sourceWarehouseId} onChange={(e) => setSourceWarehouseId(e.target.value)} />
          <input className="border border-slate-200 rounded-xl px-3 py-2" placeholder="مستودع الهدف (id)" value={targetWarehouseId} onChange={(e) => setTargetWarehouseId(e.target.value)} />
          <input className="border border-slate-200 rounded-xl px-3 py-2" placeholder="كود الصنف" value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
          <input type="number" className="border border-slate-200 rounded-xl px-3 py-2" placeholder="الكمية" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>
        <button type="button" disabled={busy} onClick={createTransfer} className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white font-bold rounded-xl">
          <Save className="w-4 h-4" /> إنشاء التحويل
        </button>
      </div>
      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2 text-xs">
        <p className="font-bold">التحويلات</p>
        <ul className="space-y-2">
          {transfers.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 border border-slate-100 rounded-xl px-3 py-2">
              <span>{t.itemCode} × {t.quantity} | {t.sourceTenantId} → {t.targetTenantId} | <b>{t.status}</b></span>
              <span className="flex gap-2">
                {t.status === 'REQUESTED' && (
                  <button type="button" disabled={busy} className="text-blue-700 font-bold" onClick={() => act(t.id, 'dispatch')}>إرسال</button>
                )}
                {t.status === 'IN_TRANSIT' && (
                  <button type="button" disabled={busy} className="text-emerald-700 font-bold" onClick={() => act(t.id, 'receive')}>استلام</button>
                )}
              </span>
            </li>
          ))}
          {!transfers.length && <li className="text-slate-500">لا تحويلات بعد</li>}
        </ul>
      </div>
    </div>
  );
};
