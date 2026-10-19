import React, { useEffect, useState } from 'react';
import { ShieldCheck, Warehouse, Save, AlertCircle } from 'lucide-react';

interface GovernanceViewProps {
  onNotification: (msg: string) => void;
}

type Policy = { documentType: string; mode?: string; isActive?: boolean };
type UserRow = { id: string; fullName?: string; username?: string; role?: string };
type Wh = { id: string; nameAr?: string; code?: string };

const DOC_TYPES = [
  { id: 'GOODS_RECEIPT_SUPPLIER', label: 'استلام بضاعة من مورد' },
  { id: 'STOCK_ISSUE', label: 'صرف مخزني' },
  { id: 'STOCK_TRANSFER_RECEIPT', label: 'استلام تحويل مخزني' },
];

export const GovernanceView: React.FC<GovernanceViewProps> = ({ onNotification }) => {
  const [tab, setTab] = useState<'policies' | 'warehouses'>('policies');
  const [error, setError] = useState<string | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [polBusy, setPolBusy] = useState(false);
  const [editType, setEditType] = useState('GOODS_RECEIPT_SUPPLIER');
  const [mode, setMode] = useState<'DIRECT' | 'STEPS'>('DIRECT');
  const [isActive, setIsActive] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [warehouses, setWarehouses] = useState<Wh[]>([]);
  const [userId, setUserId] = useState('');
  const [selectedWh, setSelectedWh] = useState<string[]>([]);
  const [whBusy, setWhBusy] = useState(false);

  const loadPolicies = async () => {
    try {
      const res = await fetch('/api/approvals/policies', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || 'تعذر تحميل سياسات الاعتماد');
        return;
      }
      setPolicies(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setError('تعذر الاتصال أثناء تحميل السياسات');
    }
  };

  const loadUsersAndWh = async () => {
    try {
      const [uRes, wRes] = await Promise.all([
        fetch('/api/users', { credentials: 'include' }),
        fetch('/api/inventory/warehouses', { credentials: 'include' }),
      ]);
      const uData = await uRes.json().catch(() => null);
      const wData = await wRes.json().catch(() => null);
      if (uRes.ok && Array.isArray(uData?.data)) setUsers(uData.data);
      if (wRes.ok) {
        const list = wData?.data || wData?.warehouses || wData || [];
        setWarehouses(Array.isArray(list) ? list : []);
      }
    } catch {
      onNotification('تعذر تحميل المستخدمين أو المستودعات');
    }
  };

  useEffect(() => {
    loadPolicies();
    loadUsersAndWh();
  }, []);

  useEffect(() => {
    if (!userId) {
      setSelectedWh([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/inventory/warehouse-access/${encodeURIComponent(userId)}`, {
          credentials: 'include',
        });
        const data = await res.json().catch(() => null);
        if (res.ok) {
          const ids = data?.data || [];
          setSelectedWh(Array.isArray(ids) ? ids.map(String) : []);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [userId]);

  const savePolicy = async () => {
    setError(null);
    setPolBusy(true);
    try {
      const idem =
        (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
        `apol-${Date.now()}`;
      const steps =
        mode === 'STEPS'
          ? [{ label: 'اعتماد', approverType: 'ROLE', approverRef: 'financial_approver', stepKind: 'GENERAL' }]
          : [];
      const res = await fetch(`/api/approvals/policies/${encodeURIComponent(editType)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem },
        body: JSON.stringify({ mode, steps, enforceDistinctApprovers: true, isActive, idempotencyKey: idem }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || data?.title || 'فشل حفظ السياسة');
        return;
      }
      onNotification('تم حفظ سياسة الاعتماد');
      await loadPolicies();
    } catch {
      setError('تعذر الاتصال أثناء حفظ السياسة');
    } finally {
      setPolBusy(false);
    }
  };

  const toggleWh = (id: string) => {
    setSelectedWh((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const saveWarehouseAccess = async () => {
    if (!userId) {
      setError('اختر مستخدمًا أولًا');
      return;
    }
    setError(null);
    setWhBusy(true);
    try {
      const idem =
        (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
        `whacc-${Date.now()}`;
      const res = await fetch(`/api/inventory/warehouse-access/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem },
        body: JSON.stringify({ warehouseIds: selectedWh }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || data?.title || 'فشل حفظ نطاق المستودعات');
        return;
      }
      onNotification('تم تحديث صلاحيات المستودع للمستخدم');
    } catch {
      setError('تعذر الاتصال أثناء حفظ نطاق المستودعات');
    } finally {
      setWhBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-700" />
          الحوكمة: سياسات الاعتماد ونطاق المستودعات
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          إدارة سياسات الموافقات وصلاحيات المستودع للمستخدم — مربوط بالـ API الحالي دون تغيير الخادم.
        </p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('policies')}
          className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === 'policies' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
          سياسات الاعتماد
        </button>
        <button type="button" onClick={() => setTab('warehouses')}
          className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === 'warehouses' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
          نطاق المستودعات
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {tab === 'policies' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
          <div className="text-xs text-slate-600">
            السياسات الحالية: {policies.length ? policies.map((p) => p.documentType).join(', ') : 'لا توجد بعد'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label className="space-y-1">
              <span className="font-bold">نوع المستند</span>
              <select className="w-full border border-slate-200 rounded-xl px-3 py-2" value={editType}
                onChange={(e) => setEditType(e.target.value)}>
                {DOC_TYPES.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-bold">الوضع</span>
              <select className="w-full border border-slate-200 rounded-xl px-3 py-2" value={mode}
                onChange={(e) => setMode(e.target.value as 'DIRECT' | 'STEPS')}>
                <option value="DIRECT">مباشر (DIRECT)</option>
                <option value="STEPS">خطوات (STEPS)</option>
              </select>
            </label>
            <label className="space-y-1 flex items-end gap-2 pb-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span className="font-bold">سياسة نشطة</span>
            </label>
          </div>
          <button type="button" disabled={polBusy} onClick={savePolicy}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 text-white text-xs font-bold rounded-xl">
            <Save className="w-4 h-4" />
            {polBusy ? 'جارٍ الحفظ...' : 'حفظ السياسة'}
          </button>
        </div>
      )}

      {tab === 'warehouses' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
          <label className="text-xs space-y-1 block">
            <span className="font-bold flex items-center gap-2">
              <Warehouse className="w-4 h-4" /> المستخدم
            </span>
            <select className="w-full border border-slate-200 rounded-xl px-3 py-2" value={userId}
              onChange={(e) => setUserId(e.target.value)}>
              <option value="">— اختر —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName || u.username} ({u.role})</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
            {warehouses.map((w) => {
              const id = String(w.id);
              return (
                <label key={id} className="flex items-center gap-2 text-xs border border-slate-100 rounded-xl px-3 py-2">
                  <input type="checkbox" checked={selectedWh.includes(id)} onChange={() => toggleWh(id)} />
                  <span>{w.nameAr || w.code || id}</span>
                </label>
              );
            })}
            {!warehouses.length && (
              <p className="text-xs text-slate-500">لا توجد مستودعات أو لا صلاحية STOCK_VIEW.</p>
            )}
          </div>
          <button type="button" disabled={whBusy || !userId} onClick={saveWarehouseAccess}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 text-white text-xs font-bold rounded-xl disabled:opacity-50">
            <Save className="w-4 h-4" />
            {whBusy ? 'جارٍ الحفظ...' : 'حفظ نطاق المستودعات'}
          </button>
        </div>
      )}
    </div>
  );
};
