import React, { useEffect, useState } from 'react';
import { Settings2, Save, AlertCircle, Barcode } from 'lucide-react';

interface InvConfigViewProps {
  onNotification: (msg: string) => void;
}

export const InvConfigView: React.FC<InvConfigViewProps> = ({ onNotification }) => {
  const [tab, setTab] = useState<'settings' | 'accounting' | 'barcode'>('settings');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [defaultValuationMethod, setDefaultValuationMethod] = useState('FIFO');
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [overReceiptTolerancePct, setOverReceiptTolerancePct] = useState(0);

  const [autoPostEnabled, setAutoPostEnabled] = useState(false);
  const [grirAccountCode, setGrirAccountCode] = useState('');
  const [inTransitAccountCode, setInTransitAccountCode] = useState('');
  const [defaultInventoryAccountCode, setDefaultInventoryAccountCode] = useState('');
  const [defaultCogsAccountCode, setDefaultCogsAccountCode] = useState('');

  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [barcodeResult, setBarcodeResult] = useState<string>('');

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/inventory/settings', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.data) {
        const d = data.data;
        setDefaultValuationMethod(d.defaultValuationMethod || d.default_valuation_method || 'FIFO');
        setAllowNegativeStock(!!(d.allowNegativeStock ?? d.allow_negative_stock));
        setOverReceiptTolerancePct(Number(d.overReceiptTolerancePct ?? d.over_receipt_tolerance_pct ?? 0));
      }
    } catch {
      /* ignore */
    }
  };

  const loadAccounting = async () => {
    try {
      const res = await fetch('/api/inventory/accounting-config', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.data) {
        const d = data.data;
        setAutoPostEnabled(!!(d.autoPostEnabled ?? d.auto_post_enabled));
        setGrirAccountCode(d.grirAccountCode || d.grir_account_code || '');
        setInTransitAccountCode(d.inTransitAccountCode || d.in_transit_account_code || '');
        setDefaultInventoryAccountCode(d.defaultInventoryAccountCode || d.default_inventory_account_code || '');
        setDefaultCogsAccountCode(d.defaultCogsAccountCode || d.default_cogs_account_code || '');
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadSettings();
    loadAccounting();
  }, []);

  const idem = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
    `invcfg-${Date.now()}`;

  const saveSettings = async () => {
    setError(null);
    setBusy(true);
    try {
      const key = idem();
      const res = await fetch('/api/inventory/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          defaultValuationMethod,
          allowNegativeStock,
          overReceiptTolerancePct: Number(overReceiptTolerancePct) || 0,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || data?.title || 'فشل حفظ إعدادات المخزون');
        return;
      }
      onNotification('تم حفظ إعدادات المخزون');
      await loadSettings();
    } catch {
      setError('تعذر الاتصال أثناء حفظ إعدادات المخزون');
    } finally {
      setBusy(false);
    }
  };

  const saveAccounting = async () => {
    setError(null);
    setBusy(true);
    try {
      const key = idem();
      const res = await fetch('/api/inventory/accounting-config', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          autoPostEnabled,
          grirAccountCode,
          inTransitAccountCode,
          defaultInventoryAccountCode,
          defaultCogsAccountCode,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || data?.title || 'فشل حفظ الربط المحاسبي');
        return;
      }
      onNotification('تم حفظ إعدادات محاسبة المخزون');
      await loadAccounting();
    } catch {
      setError('تعذر الاتصال أثناء حفظ الربط المحاسبي');
    } finally {
      setBusy(false);
    }
  };

  const searchBarcode = async () => {
    setError(null);
    setBarcodeResult('');
    if (!barcodeQuery.trim()) {
      setError('أدخل رمز باركود');
      return;
    }
    try {
      const res = await fetch(
        `/api/inventory/items/search/barcode?barcode=${encodeURIComponent(barcodeQuery.trim())}`,
        { credentials: 'include' },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || data?.error || 'لم يُعثر على الصنف');
        return;
      }
      setBarcodeResult(JSON.stringify(data?.data ?? data, null, 2));
    } catch {
      setError('تعذر الاتصال أثناء بحث الباركود');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-blue-700" />
          إعدادات المخزون والربط المحاسبي
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          إعدادات التقييم والسالب والتحمل، وحسابات المخزون، وبحث الباركود — فوق الـ API الحالي.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['settings', 'إعدادات المخزون'],
            ['accounting', 'الربط المحاسبي'],
            ['barcode', 'بحث باركود'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold ${
              tab === id ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {tab === 'settings' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 text-xs">
          <label className="block space-y-1">
            <span className="font-bold">طريقة التقييم الافتراضية</span>
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2"
              value={defaultValuationMethod}
              onChange={(e) => setDefaultValuationMethod(e.target.value)}
            >
              <option value="FIFO">FIFO</option>
              <option value="WEIGHTED_AVERAGE">متوسط مرجح</option>
              <option value="STANDARD">تكلفة معيارية</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowNegativeStock}
              onChange={(e) => setAllowNegativeStock(e.target.checked)}
            />
            <span className="font-bold">السماح برصيد سالب</span>
          </label>
          <label className="block space-y-1">
            <span className="font-bold">نسبة تحمل زيادة الاستلام %</span>
            <input
              type="number"
              className="w-full border border-slate-200 rounded-xl px-3 py-2"
              value={overReceiptTolerancePct}
              onChange={(e) => setOverReceiptTolerancePct(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={saveSettings}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 text-white font-bold rounded-xl"
          >
            <Save className="w-4 h-4" />
            {busy ? 'جارٍ الحفظ...' : 'حفظ إعدادات المخزون'}
          </button>
        </div>
      )}

      {tab === 'accounting' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoPostEnabled}
              onChange={(e) => setAutoPostEnabled(e.target.checked)}
            />
            <span className="font-bold">ترحيل قيود المخزون تلقائيًا</span>
          </label>
          {(
            [
              ['حساب GR/IR', grirAccountCode, setGrirAccountCode],
              ['حساب البضاعة في الطريق', inTransitAccountCode, setInTransitAccountCode],
              ['حساب المخزون الافتراضي', defaultInventoryAccountCode, setDefaultInventoryAccountCode],
              ['حساب تكلفة البضاعة المباعة', defaultCogsAccountCode, setDefaultCogsAccountCode],
            ] as const
          ).map(([label, val, set]) => (
            <label key={label} className="block space-y-1">
              <span className="font-bold">{label}</span>
              <input
                className="w-full border border-slate-200 rounded-xl px-3 py-2 font-mono"
                value={val}
                onChange={(e) => set(e.target.value)}
              />
            </label>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={saveAccounting}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 text-white font-bold rounded-xl"
          >
            <Save className="w-4 h-4" />
            {busy ? 'جارٍ الحفظ...' : 'حفظ الربط المحاسبي'}
          </button>
        </div>
      )}

      {tab === 'barcode' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3 text-xs">
          <label className="block space-y-1">
            <span className="font-bold flex items-center gap-2">
              <Barcode className="w-4 h-4" /> رمز الباركود
            </span>
            <input
              className="w-full border border-slate-200 rounded-xl px-3 py-2"
              value={barcodeQuery}
              onChange={(e) => setBarcodeQuery(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={searchBarcode}
            className="px-5 py-2.5 bg-blue-700 text-white font-bold rounded-xl"
          >
            بحث
          </button>
          {barcodeResult && (
            <pre className="text-[11px] bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-auto max-h-64">
              {barcodeResult}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
