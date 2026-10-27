/**
 * AnCoreStatusPanel — MERGE-M5
 * Surfaces A.N core status (storage + route catalog) inside Settings only.
 * Does not add a second sidebar product tree.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, Network } from 'lucide-react';
import { Language } from '../../types';
import { getAnStorageStatus, AN_CORE_VERSION, fetchSessionPlane, fetchInventorySummary, fetchAccountingSummary, fetchPurchasingSummary, fetchModulesOverview } from '../../lib/anBridge';
import { AN_API_PREFIX } from '../../lib/anApi';

type RouteRow = { method: string; path: string; phase: string; purpose: string };

export default function AnCoreStatusPanel({ language }: { language: Language }) {
  const isRtl = language === 'ar';
  const [loading, setLoading] = useState(false);
  const [storage, setStorage] = useState<{
    ok: boolean;
    adapterName?: string;
    tenants?: number;
    version?: string;
    error?: string;
  } | null>(null);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [sessionPlane, setSessionPlane] = useState<{
    ok?: boolean;
    adapter?: string;
    envRef?: string;
    authPath?: string;
    liveDetail?: string;
  } | null>(null);
  const [invSummary, setInvSummary] = useState<{
    ok?: boolean;
    source?: string;
    warehouses?: string;
    items?: string;
    detail?: string;
  } | null>(null);
  const [accSummary, setAccSummary] = useState<{
    ok?: boolean;
    source?: string;
    accounts?: string;
    journals?: string;
    detail?: string;
  } | null>(null);
  const [purSummary, setPurSummary] = useState<{
    ok?: boolean;
    source?: string;
    po?: string;
    gr?: string;
    pr?: string;
    detail?: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const st = await getAnStorageStatus();
      setStorage(st);
      const res = await fetch(`${AN_API_PREFIX}/routes`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRoutes(Array.isArray(data?.routes) ? data.routes : []);
      } else {
        setRoutes([]);
      }
      const sp = await fetchSessionPlane(undefined, { live: true });
      setSessionPlane({
        ok: sp.ok,
        adapter: sp.probe?.adapterType,
        envRef: sp.probe?.envRefPresent ? 'present' : 'missing',
        authPath: sp.auth?.activePath,
        liveDetail: sp.live
          ? `${sp.live.ok ? 'live-ok' : 'live-fail'}:${sp.live.detail || ''}`
          : 'live-skipped',
      });
      const overview = await fetchModulesOverview();
      if (overview?.inventory) {
        setInvSummary({
          ok: overview.inventory.ok,
          source: overview.inventory.source,
          warehouses: overview.inventory.warehouseCount == null ? '—' : String(overview.inventory.warehouseCount),
          items: overview.inventory.itemCount == null ? '—' : String(overview.inventory.itemCount),
        });
      }
      if (overview?.accounting) {
        setAccSummary({
          ok: overview.accounting.ok,
          source: overview.accounting.source,
          accounts: overview.accounting.accountCount == null ? '—' : String(overview.accounting.accountCount),
          journals: overview.accounting.journalCount == null ? '—' : String(overview.accounting.journalCount),
        });
      }
      if (overview?.purchasing) {
        setPurSummary({
          ok: overview.purchasing.ok,
          source: overview.purchasing.source,
          po: overview.purchasing.purchaseOrderCount == null ? '—' : String(overview.purchasing.purchaseOrderCount),
          gr: overview.purchasing.goodsReceiptCount == null ? '—' : String(overview.purchasing.goodsReceiptCount),
          pr: overview.purchasing.purchaseRequestCount == null ? '—' : String(overview.purchasing.purchaseRequestCount),
        });
      }
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-white/70 dark:bg-slate-900/50 p-4 md:col-span-2">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-violet-500/15 text-violet-500 flex items-center justify-center">
            <Activity size={18} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              {isRtl ? 'حالة نواة A.N' : 'A.N core status'}
            </h3>
            <p className="text-[11px] text-slate-500 font-mono">
              bridge {AN_CORE_VERSION} · prefix {AN_API_PREFIX}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {isRtl ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      {err && (
        <p className="text-xs text-rose-500 mb-2">{err}</p>
      )}

      <div className="grid gap-3 md:grid-cols-2 mb-3">
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-700 p-3 text-xs">
          <div className="font-bold text-slate-500 mb-1">
            {isRtl ? 'التخزين' : 'Storage'}
          </div>
          {storage == null ? (
            <span className="text-slate-400">…</span>
          ) : storage.ok ? (
            <ul className="space-y-0.5 text-slate-700 dark:text-slate-200 font-mono">
              <li>ok=true</li>
              <li>adapter={storage.adapterName || '—'}</li>
              <li>tenants={storage.tenants ?? '—'}</li>
              <li>version={storage.version || '—'}</li>
            </ul>
          ) : (
            <span className="text-rose-500">{storage.error || 'unavailable'}</span>
          )}
        </div>
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-700 p-3 text-xs">
          <div className="flex items-center gap-1 font-bold text-slate-500 mb-1">
            <Network size={12} />
            {isRtl ? 'مسارات /api/an' : '/api/an routes'}
          </div>
          <p className="text-slate-600 dark:text-slate-300">
            {isRtl
              ? `${routes.length} مسار مسجّل — لا تكرار مع /api/auth أو /api/admin`
              : `${routes.length} registered — no overlap with /api/auth or /api/admin`}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-700 p-3 text-xs md:col-span-2">
          <div className="font-bold text-slate-500 mb-1">
            {isRtl ? 'مستوى البيانات / الجلسة' : 'Data / session plane'}
          </div>
          {sessionPlane == null ? (
            <span className="text-slate-400">…</span>
          ) : (
            <ul className="space-y-0.5 text-slate-700 dark:text-slate-200 font-mono">
              <li>ok={String(!!sessionPlane.ok)}</li>
              <li>auth={sessionPlane.authPath || '—'}</li>
              <li>adapter={sessionPlane.adapter || '—'}</li>
              <li>envRef={sessionPlane.envRef || '—'}</li>
              <li>live={sessionPlane.liveDetail || '—'}</li>
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-700 p-3 text-xs md:col-span-2">
          <div className="font-bold text-slate-500 mb-1">
            {isRtl ? 'ملخص مخزون A.N (قراءة فقط)' : 'A.N inventory summary (read-only)'}
          </div>
          {invSummary == null ? (
            <span className="text-slate-400">…</span>
          ) : (
            <ul className="space-y-0.5 text-slate-700 dark:text-slate-200 font-mono">
              <li>ok={String(!!invSummary.ok)}</li>
              <li>source={invSummary.source || '—'}</li>
              <li>warehouses={invSummary.warehouses || '—'}</li>
              <li>items={invSummary.items || '—'}</li>
              <li className="whitespace-normal">{invSummary.detail || '—'}</li>
            </ul>
          )}
          <p className="mt-2 text-[10px] text-slate-400">
            {isRtl
              ? 'شاشة المخزون التشغيلية ما زالت على CustodyDB/Firestore'
              : 'Operational Inventory page still uses CustodyDB/Firestore'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-700 p-3 text-xs md:col-span-2">
          <div className="font-bold text-slate-500 mb-1">
            {isRtl ? 'ملخص المحاسبة A.N (قراءة فقط)' : 'A.N accounting summary (read-only)'}
          </div>
          {accSummary == null ? (
            <span className="text-slate-400">…</span>
          ) : (
            <ul className="space-y-0.5 text-slate-700 dark:text-slate-200 font-mono">
              <li>ok={String(!!accSummary.ok)}</li>
              <li>source={accSummary.source || '—'}</li>
              <li>accounts={accSummary.accounts || '—'}</li>
              <li>journals={accSummary.journals || '—'}</li>
              <li className="whitespace-normal">{accSummary.detail || '—'}</li>
            </ul>
          )}
          <p className="mt-2 text-[10px] text-slate-400">
            {isRtl
              ? 'شاشة المحاسبة التشغيلية ما زالت على CustodyDB/Firestore'
              : 'Operational Accounting page still uses CustodyDB/Firestore'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-700 p-3 text-xs md:col-span-2">
          <div className="font-bold text-slate-500 mb-1">
            {isRtl ? 'ملخص المشتريات A.N (قراءة فقط)' : 'A.N purchasing summary (read-only)'}
          </div>
          {purSummary == null ? (
            <span className="text-slate-400">…</span>
          ) : (
            <ul className="space-y-0.5 text-slate-700 dark:text-slate-200 font-mono">
              <li>ok={String(!!purSummary.ok)}</li>
              <li>source={purSummary.source || '—'}</li>
              <li>po={purSummary.po || '—'}</li>
              <li>gr={purSummary.gr || '—'}</li>
              <li>pr={purSummary.pr || '—'}</li>
              <li className="whitespace-normal">{purSummary.detail || '—'}</li>
            </ul>
          )}
          <p className="mt-2 text-[10px] text-slate-400">
            {isRtl
              ? 'شاشة المشتريات التشغيلية ما زالت على CustodyDB/Firestore'
              : 'Operational Purchasing page still uses CustodyDB/Firestore'}
          </p>
        </div>
      </div>

      {routes.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-[11px] text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500">
              <tr>
                <th className="px-2 py-1.5 font-bold">Phase</th>
                <th className="px-2 py-1.5 font-bold">Method</th>
                <th className="px-2 py-1.5 font-bold">Path</th>
                <th className="px-2 py-1.5 font-bold">{isRtl ? 'الغرض' : 'Purpose'}</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={`${r.method}-${r.path}`} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1 font-mono text-violet-600">{r.phase}</td>
                  <td className="px-2 py-1 font-mono">{r.method}</td>
                  <td className="px-2 py-1 font-mono text-slate-700 dark:text-slate-200">{r.path}</td>
                  <td className="px-2 py-1 text-slate-500">{r.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
