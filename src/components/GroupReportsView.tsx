import React, { useEffect, useState } from 'react';
import { BarChart3, AlertCircle } from 'lucide-react';

interface GroupReportsViewProps {
  onNotification: (msg: string) => void;
}

type Group = { id: string; nameAr?: string; code?: string };

export const GroupReportsView: React.FC<GroupReportsViewProps> = ({ onNotification }) => {
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState('');
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<string>('');
  const [trial, setTrial] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/groups', { credentials: 'include' });
        const data = await res.json().catch(() => null);
        if (res.ok) {
          const list = data?.data || data || [];
          setGroups(Array.isArray(list) ? list : []);
        }
      } catch {
        setError('تعذر تحميل المجموعات');
      }
    })();
  }, []);

  const loadReports = async () => {
    if (!groupId) {
      setError('اختر مجموعة');
      return;
    }
    setError(null);
    setBusy(true);
    setSummary('');
    setTrial('');
    try {
      const [sRes, tRes] = await Promise.all([
        fetch(`/api/groups/${encodeURIComponent(groupId)}/report/summary`, { credentials: 'include' }),
        fetch(
          `/api/groups/${encodeURIComponent(groupId)}/consol/trial-balance?asOfDate=${encodeURIComponent(asOfDate)}`,
          { credentials: 'include' },
        ),
      ]);
      const sData = await sRes.json().catch(() => null);
      const tData = await tRes.json().catch(() => null);
      if (!sRes.ok) {
        setError(sData?.detail || 'فشل ملخص المجموعة');
      } else {
        setSummary(JSON.stringify(sData?.data ?? sData, null, 2));
      }
      if (!tRes.ok) {
        setError((prev) => prev || tData?.detail || 'فشل الميزان المجمّع');
      } else {
        setTrial(JSON.stringify(tData?.data ?? tData, null, 2));
      }
      if (sRes.ok && tRes.ok) onNotification('تم تحميل تقارير المجموعة');
    } catch {
      setError('تعذر الاتصال أثناء تحميل التقارير');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-700" />
          تقارير المجموعة والتجميع
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          ملخص KPI للمجموعة وميزان مراجعة مجمّع — قراءة فقط لمدير المنصة.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-wrap gap-3 items-end text-xs">
        <label className="space-y-1">
          <span className="font-bold">المجموعة</span>
          <select
            className="block border border-slate-200 rounded-xl px-3 py-2 min-w-[12rem]"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">— اختر —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nameAr || g.code || g.id}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="font-bold">تاريخ الميزان</span>
          <input
            type="date"
            className="block border border-slate-200 rounded-xl px-3 py-2"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={loadReports}
          className="px-5 py-2.5 bg-blue-700 text-white font-bold rounded-xl"
        >
          {busy ? 'جارٍ التحميل...' : 'تحميل التقارير'}
        </button>
      </div>

      {summary && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <p className="text-xs font-bold mb-2">ملخص المجموعة</p>
          <pre className="text-[11px] bg-slate-50 border border-slate-100 rounded-xl p-3 overflow-auto max-h-72">
            {summary}
          </pre>
        </div>
      )}
      {trial && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <p className="text-xs font-bold mb-2">ميزان المراجعة المجمّع</p>
          <pre className="text-[11px] bg-slate-50 border border-slate-100 rounded-xl p-3 overflow-auto max-h-96">
            {trial}
          </pre>
        </div>
      )}
    </div>
  );
};
