/**
 * AnCoreStatusPanel — MERGE-M5
 * Surfaces A.N core status (storage + route catalog) inside Settings only.
 * Does not add a second sidebar product tree.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, Network } from 'lucide-react';
import { Language } from '../../types';
import { getAnStorageStatus, AN_CORE_VERSION } from '../../lib/anBridge';
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
