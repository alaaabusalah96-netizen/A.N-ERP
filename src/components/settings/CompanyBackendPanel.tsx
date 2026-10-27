/**
 * CompanyBackendPanel — MERGE-M2
 * Lets Admin/SystemAdmin set per-company db_backend + isolation + connection_ref.
 * Persists via CustodyDB.updateCompany. Does NOT switch live traffic off Firebase
 * until later merge phases; it stores the binding contract only.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Database, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Company, Language } from '../../types';
import { CustodyDB } from '../../db';
import {
  ALLOWED_DB_BACKENDS,
  ALLOWED_ISOLATION,
  CompanyBackendSettings,
  getCompanyBackendSettings,
  validateCompanyBackendSettings,
  resolveCompanyBackend,
  fetchSessionPlane,
  type AdapterType,
  type IsolationLevel,
  type AuthDriver,
} from '../../lib/anBridge';

interface Props {
  language: Language;
  /** When empty, uses selected company from CustodyDB */
  companyId?: string;
}

export default function CompanyBackendPanel({ language, companyId }: Props) {
  const isRtl = language === 'ar';
  const companies = CustodyDB.getCompanies();
  const selectedId =
    companyId ||
    CustodyDB.getSelectedCompanyId() ||
    (companies[0] && companies[0].id) ||
    '';
  const company: Company | undefined = companies.find((c) => c.id === selectedId);

  const initial = useMemo(() => getCompanyBackendSettings(company), [company?.id, company?.db_backend, company?.auth_driver, company?.isolation_level, company?.connection_ref]);
  const [authDriver, setAuthDriver] = useState<AuthDriver>(initial.auth_driver);
  const [dbBackend, setDbBackend] = useState<AdapterType>(initial.db_backend);
  const [isolation, setIsolation] = useState<IsolationLevel>(initial.isolation_level);
  const [connectionRef, setConnectionRef] = useState(initial.connection_ref);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [planeInfo, setPlaneInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = getCompanyBackendSettings(company);
    setAuthDriver(s.auth_driver);
    setDbBackend(s.db_backend);
    setIsolation(s.isolation_level);
    setConnectionRef(s.connection_ref);
    setMsg(null);
    setPlaneInfo(null);
  }, [selectedId]);

  if (!company) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 p-4 text-sm text-slate-500">
        {isRtl ? 'لا توجد شركة محددة لربط قاعدة البيانات.' : 'No company selected for backend binding.'}
      </div>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const settings: CompanyBackendSettings = {
      auth_driver: authDriver,
      db_backend: dbBackend,
      isolation_level: isolation,
      connection_ref: connectionRef.trim(),
    };
    const v = validateCompanyBackendSettings(settings);
    if (!v.valid) {
      setMsg({ type: 'err', text: isRtl ? (v.errorAr || 'خطأ') : (v.errorEn || 'Invalid') });
      return;
    }
    setBusy(true);
    try {
      const server = await resolveCompanyBackend(company!.id, settings);
      if (!server.ok) {
        setMsg({
          type: 'err',
          text: isRtl
            ? `رفض الخادم الإعداد: ${server.error || 'unknown'}`
            : `Server rejected settings: ${server.error || 'unknown'}`,
        });
        setBusy(false);
        return;
      }
      const res = await CustodyDB.updateCompany(company!.id, {
        auth_driver: settings.auth_driver,
        db_backend: settings.db_backend,
        isolation_level: settings.isolation_level,
        connection_ref: settings.connection_ref,
      });
      if (!res.success) {
        setMsg({
          type: 'err',
          text: res.error || (isRtl ? 'فشل الحفظ' : 'Save failed'),
        });
      } else {
        const plane = await fetchSessionPlane(company!.id, { live: false });
        const persistedBit =
          typeof (server as any).persisted === 'boolean'
            ? (server as any).persisted
              ? isRtl
                ? 'حُفظ على الخادم'
                : 'Server persisted'
              : isRtl
                ? 'لم يُحفظ على الخادم'
                : 'Not persisted on server'
            : '';
        const probeBit = plane.probe
          ? `${plane.probe.adapterType || ''} / env:${plane.probe.envRefPresent ? 'yes' : 'no'}`
          : '';
        setPlaneInfo(
          [persistedBit, probeBit, plane.auth?.activePath ? `auth:${plane.auth.activePath}` : '']
            .filter(Boolean)
            .join(' · ')
        );
        setMsg({
          type: 'ok',
          text: isRtl ? 'تم حفظ ربط قاعدة البيانات' : 'Backend binding saved',
        });
      }
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message || String(err) });
    }
    setBusy(false);
  }

  const needsRef = dbBackend === 'postgresql' || dbBackend === 'mysql' || dbBackend === 'mongodb';

  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-white/70 dark:bg-slate-900/50 p-4 md:col-span-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-9 w-9 rounded-xl bg-indigo-500/15 text-indigo-500 flex items-center justify-center">
          <Database size={18} />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
            {isRtl ? 'ربط قاعدة بيانات الشركة' : 'Company database binding'}
          </h3>
          <p className="text-[11px] text-slate-500">
            {company.name} · <span className="font-mono">{company.id}</span>
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-bold text-slate-500">
          {isRtl ? 'محرك المصادقة' : 'Auth driver'}
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            value={authDriver}
            onChange={(e) => setAuthDriver(e.target.value as AuthDriver)}
          >
            <option value="firebase">firebase (default)</option>
            <option value="an-jwt">an-jwt (A.N core — later phases)</option>
          </select>
        </label>

        <label className="block text-xs font-bold text-slate-500">
          {isRtl ? 'نوع قاعدة البيانات' : 'Database backend'}
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            value={dbBackend}
            onChange={(e) => setDbBackend(e.target.value as AdapterType)}
          >
            {ALLOWED_DB_BACKENDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-bold text-slate-500">
          {isRtl ? 'مستوى العزل' : 'Isolation level'}
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            value={isolation}
            onChange={(e) => setIsolation(e.target.value as IsolationLevel)}
          >
            {ALLOWED_ISOLATION.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-bold text-slate-500">
          {isRtl ? 'مرجع الاتصال (اسم متغير البيئة فقط)' : 'Connection ref (env var name only)'}
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono"
            value={connectionRef}
            disabled={!needsRef}
            placeholder={needsRef ? 'DATABASE_URL' : '—'}
            onChange={(e) => setConnectionRef(e.target.value)}
          />
        </label>

        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-4 py-2 disabled:opacity-50"
          >
            <Save size={16} />
            {isRtl ? 'حفظ الربط' : 'Save binding'}
          </button>
          {msg && (
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                msg.type === 'ok' ? 'text-emerald-600' : 'text-rose-500'
              }`}
            >
              {msg.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {msg.text}
            </span>
          )}
          {planeInfo && (
            <p className="md:col-span-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 break-all">
              {planeInfo}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
