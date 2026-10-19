// endpoints: '/members', '/items', '/publish'
import React, { useEffect, useState } from 'react';
import { Network, Package, Save, AlertCircle } from 'lucide-react';

interface OrgGroupsViewProps {
  onNotification: (msg: string) => void;
}

type Group = { id: string; code?: string; nameAr?: string; memberTenantIds?: string[] };
type TenantRow = { id: string; code?: string; nameAr?: string };
type Gmi = { id: string; itemCode: string; nameAr: string; category?: string; uom?: string };

export const OrgGroupsView: React.FC<OrgGroupsViewProps> = ({ onNotification }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [items, setItems] = useState<Gmi[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [memberTenantId, setMemberTenantId] = useState('');

  const [itemCode, setItemCode] = useState('');
  const [itemNameAr, setItemNameAr] = useState('');
  const [category, setCategory] = useState('');
  const [uom, setUom] = useState('EA');

  const loadGroups = async () => {
    try {
      const res = await fetch('/api/groups', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (res.ok) setGroups(Array.isArray(data?.data) ? data.data : []);
    } catch {
      /* ignore */
    }
  };

  const loadTenants = async () => {
    try {
      const res = await fetch('/api/tenants', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (res.ok) setTenants(Array.isArray(data?.data) ? data.data : []);
    } catch {
      /* ignore */
    }
  };

  const loadItems = async (groupId: string) => {
    if (!groupId) {
      setItems([]);
      return;
    }
    try {
      const res = await fetch('/api/groups/' + encodeURIComponent(groupId) + '/items', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (res.ok) setItems(Array.isArray(data?.data) ? data.data : []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadGroups();
    loadTenants();
  }, []);

  useEffect(() => {
    if (selectedId) loadItems(selectedId);
    else setItems([]);
  }, [selectedId]);

  const idem = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
    `grp-${Date.now()}`;

  const createGroup = async () => {
    if (!code.trim() || !nameAr.trim()) {
      setError('الرمز والاسم العربي مطلوبان');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const key = idem();
      const res = await fetch('/api/groups', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ code: code.trim(), nameAr: nameAr.trim(), idempotencyKey: key }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || data?.title || 'فشل إنشاء المجموعة');
        return;
      }
      onNotification('تم إنشاء المجموعة بنجاح');
      setCode('');
      setNameAr('');
      await loadGroups();
    } catch {
      setError('تعذر الاتصال أثناء إنشاء المجموعة');
    } finally {
      setBusy(false);
    }
  };

  const addMember = async () => {
    if (!selectedId || !memberTenantId) {
      setError('اختر المجموعة والشركة');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const key = idem();
      const res = await fetch('/api/groups/' + encodeURIComponent(selectedId) + '/members', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ tenantId: memberTenantId, idempotencyKey: key }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || data?.title || 'فشل إضافة العضو');
        return;
      }
      onNotification('تمت إضافة الشركة للمجموعة');
      setMemberTenantId('');
      await loadGroups();
    } catch {
      setError('تعذر الاتصال أثناء إضافة العضو');
    } finally {
      setBusy(false);
    }
  };

  const createItem = async () => {
    if (!selectedId || !itemCode.trim() || !itemNameAr.trim()) {
      setError('اختر مجموعة وأدخل كود واسم الصنف');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const key = idem();
      const res = await fetch('/api/groups/' + encodeURIComponent(selectedId) + '/items', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          itemCode: itemCode.trim(),
          nameAr: itemNameAr.trim(),
          category: category.trim() || undefined,
          uom: uom.trim() || 'EA',
          idempotencyKey: key,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || data?.title || 'فشل إنشاء صنف المجموعة');
        return;
      }
      onNotification('تم إنشاء صنف المجموعة');
      setItemCode('');
      setItemNameAr('');
      setCategory('');
      await loadItems(selectedId);
    } catch {
      setError('تعذر الاتصال أثناء إنشاء الصنف');
    } finally {
      setBusy(false);
    }
  };

  const publishItem = async (itemId: string) => {
    if (!selectedId || !itemId) return;
    setError(null);
    setBusy(true);
    try {
      const key = idem();
      const res = await fetch(
        '/api/groups/' + encodeURIComponent(selectedId) + '/items/' + encodeURIComponent(itemId) + '/publish',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
          body: JSON.stringify({ idempotencyKey: key }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || data?.title || 'فشل نشر الصنف');
        return;
      }
      const pub = data?.data?.published?.length ?? 0;
      const skip = data?.data?.skipped?.length ?? 0;
      onNotification(`نشر الصنف: نُشر لـ ${pub}، تخطي ${skip}`);
    } catch {
      setError('تعذر الاتصال أثناء النشر');
    } finally {
      setBusy(false);
    }
  };

  const selected = groups.find((g) => g.id === selectedId);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Network className="w-5 h-5 text-blue-700" />
          مجموعات الشركات وأصناف المجموعة
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          شاشة مدير المنصة — مجموعات، أعضاء، أصناف موحّدة، ونشر للشركاء.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
          <p className="font-bold text-slate-800">إنشاء مجموعة</p>
          <input
            className="w-full border border-slate-200 rounded-xl px-3 py-2"
            placeholder="الرمز (CODE)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <input
            className="w-full border border-slate-200 rounded-xl px-3 py-2"
            placeholder="الاسم العربي"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={createGroup}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white font-bold rounded-xl"
          >
            <Save className="w-4 h-4" /> إنشاء
          </button>

          <p className="font-bold text-slate-800 pt-2">المجموعات</p>
          <select
            className="w-full border border-slate-200 rounded-xl px-3 py-2"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">— اختر —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nameAr || g.code || g.id} ({(g.memberTenantIds || []).length} أعضاء)
              </option>
            ))}
          </select>
          {selected && (
            <p className="text-slate-500">
              أعضاء: {(selected.memberTenantIds || []).join(', ') || 'لا يوجد'}
            </p>
          )}
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
          <p className="font-bold text-slate-800">إضافة شركة للمجموعة</p>
          <select
            className="w-full border border-slate-200 rounded-xl px-3 py-2"
            value={memberTenantId}
            onChange={(e) => setMemberTenantId(e.target.value)}
          >
            <option value="">— شركة —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nameAr || t.code || t.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !selectedId}
            onClick={addMember}
            className="px-4 py-2 bg-blue-700 text-white font-bold rounded-xl disabled:opacity-50"
          >
            إضافة عضو
          </button>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
        <p className="font-bold text-slate-800 flex items-center gap-2">
          <Package className="w-4 h-4" /> أصناف المجموعة
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input
            className="border border-slate-200 rounded-xl px-3 py-2"
            placeholder="كود الصنف"
            value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
          />
          <input
            className="border border-slate-200 rounded-xl px-3 py-2"
            placeholder="الاسم العربي"
            value={itemNameAr}
            onChange={(e) => setItemNameAr(e.target.value)}
          />
          <input
            className="border border-slate-200 rounded-xl px-3 py-2"
            placeholder="التصنيف"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <input
            className="border border-slate-200 rounded-xl px-3 py-2"
            placeholder="وحدة القياس"
            value={uom}
            onChange={(e) => setUom(e.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={busy || !selectedId}
          onClick={createItem}
          className="px-4 py-2 bg-blue-700 text-white font-bold rounded-xl disabled:opacity-50"
        >
          إنشاء صنف مجموعة
        </button>

        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between border border-slate-100 rounded-xl px-3 py-2"
            >
              <span>
                {it.itemCode} — {it.nameAr}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => publishItem(it.id)}
                className="text-blue-700 font-bold"
              >
                نشر للأعضاء
              </button>
            </li>
          ))}
          {!items.length && selectedId && (
            <li className="text-slate-500">لا أصناف بعد لهذه المجموعة</li>
          )}
        </ul>
      </div>
    </div>
  );
};
