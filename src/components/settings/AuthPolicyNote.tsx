/**
 * AuthPolicyNote — MERGE-M3
 * Explains the single active login path (Firebase by default).
 */
import React, { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { Language } from '../../types';
import { resolveAuthPolicyClient, type AuthPolicy } from '../../lib/authPolicy';
import { CustodyDB } from '../../db';

export default function AuthPolicyNote({ language }: { language: Language }) {
  const isRtl = language === 'ar';
  const [policy, setPolicy] = useState<AuthPolicy>(() =>
    resolveAuthPolicyClient(CustodyDB.getCompanies().find((c) => c.id === CustodyDB.getSelectedCompanyId()))
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/an/auth-policy', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.policy) setPolicy(data.policy);
      } catch {
        /* keep client default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 md:col-span-2 text-sm">
      <div className="flex items-start gap-2">
        <div className="h-9 w-9 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
          <Shield size={18} />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1">
            {isRtl ? 'سياسة تسجيل الدخول (مسار واحد)' : 'Login policy (single path)'}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {isRtl ? policy.reasonAr : policy.reason}
          </p>
          <p className="mt-2 text-[11px] font-mono text-slate-500">
            activePath={policy.activePath} · anJwtEnabled={String(policy.anJwtEnabled)} · driver={policy.auth_driver}
          </p>
        </div>
      </div>
    </div>
  );
}
