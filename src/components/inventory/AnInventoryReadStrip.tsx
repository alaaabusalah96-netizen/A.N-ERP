import React, { useEffect, useState } from 'react';
import { fetchInventorySummary } from '../../lib/anBridge';

export default function AnInventoryReadStrip(props: {
  language: 'en' | 'ar';
  companyId?: string;
}) {
  const isRtl = props.language === 'ar';
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const s = await fetchInventorySummary(props.companyId);
      if (!cancelled) {
        setSummary(s);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.companyId]);

  return (
    <div
      className="mb-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 px-3 py-2 text-sm text-slate-700 dark:text-slate-200"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="font-medium text-emerald-800 dark:text-emerald-300">
        {isRtl ? 'طبقة قراءة A.N (المخزون)' : 'A.N inventory read plane'}
      </div>
      {loading ? (
        <div className="opacity-70">{isRtl ? 'جاري التحميل…' : 'Loading…'}</div>
      ) : summary?.ok ? (
        <ul className="mt-1 flex flex-wrap gap-3 text-xs">
          <li>ok={String(!!summary.ok)}</li>
          <li>source={summary.source || '—'}</li>
          <li>
            {isRtl ? 'مستودعات' : 'warehouses'}={summary.warehouses ?? summary.warehouseCount ?? '—'}
          </li>
          <li>
            {isRtl ? 'أصناف' : 'items'}={summary.items ?? summary.itemCount ?? '—'}
          </li>
        </ul>
      ) : (
        <div className="text-amber-700 dark:text-amber-300 text-xs mt-1">
          {summary?.error || summary?.detail || (isRtl ? 'تعذر قراءة ملخص A.N' : 'A.N summary unavailable')}
        </div>
      )}
      <div className="text-[11px] opacity-70 mt-1">
        {isRtl
          ? 'التشغيل اليومي للمستندات ما زال على KEMIT/CustodyDB حتى حزم الكتابة/القطع.'
          : 'Operational documents still use KEMIT/CustodyDB until write/cutover packages.'}
      </div>
    </div>
  );
}
