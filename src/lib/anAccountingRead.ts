/**
 * AN-MODULE-ACC-C3 — read-only accounting summary via A.N StorageRouter.
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import { probeDefaultProcessPlane, type DataPlaneProbe } from './anDataPlane';

export interface AccountingSummaryResult {
  ok: boolean;
  source: 'an-postgresql' | 'an-inmemory' | 'unwired';
  tenantId: string;
  accountCount: number | null;
  journalCount: number | null;
  probe: Pick<DataPlaneProbe, 'adapterType' | 'envRefPresent' | 'certifiedNote' | 'ok'>;
  detail: string;
  detailAr: string;
  kemitAccountingPage: 'unchanged-custodydb';
}

async function countFromAdapter(adapter: any, tenantId: string): Promise<{
  accountCount: number | null;
  journalCount: number | null;
  ok: boolean;
}> {
  let accountCount: number | null = null;
  let journalCount: number | null = null;
  let ok = false;
  if (typeof adapter.listAccounts === 'function') {
    const acc = await adapter.listAccounts(tenantId);
    if (acc?.success && Array.isArray(acc.data)) {
      accountCount = acc.data.length;
      ok = true;
    }
  }
  if (typeof adapter.listJournalEntries === 'function') {
    const j = await adapter.listJournalEntries(tenantId);
    if (j?.success && Array.isArray(j.data)) {
      journalCount = j.data.length;
      ok = true;
    }
  }
  return { accountCount, journalCount, ok };
}

export async function readAccountingSummary(
  router: StorageRouter,
  opts?: { companyId?: string; env?: NodeJS.ProcessEnv }
): Promise<AccountingSummaryResult> {
  const env = opts?.env || process.env;
  const tenantId = (opts?.companyId || 'default').trim() || 'default';
  const probe = probeDefaultProcessPlane(env);
  const base = {
    tenantId,
    probe: {
      adapterType: probe.adapterType,
      envRefPresent: probe.envRefPresent,
      certifiedNote: probe.certifiedNote,
      ok: probe.ok,
    },
    kemitAccountingPage: 'unchanged-custodydb' as const,
  };

  if (probe.adapterType === 'postgresql' && probe.ok && probe.envRefPresent) {
    try {
      const adapter = router.getPrimaryAdapter();
      const counts = await countFromAdapter(adapter, tenantId);
      return {
        ...base,
        ok: counts.ok,
        source: 'an-postgresql',
        accountCount: counts.accountCount,
        journalCount: counts.journalCount,
        detail: 'primary_adapter_accounting_list',
        detailAr: 'قراءة محاسبة عبر محول PostgreSQL',
      };
    } catch (e: any) {
      const msg = (e?.message || String(e)).replace(/postgres(ql)?:\/\/[^\s]+/gi, '[redacted]').slice(0, 160);
      return {
        ...base,
        ok: false,
        source: 'unwired',
        accountCount: null,
        journalCount: null,
        detail: `pg_read_failed:${msg}`,
        detailAr: `فشل قراءة المحاسبة: ${msg}`,
      };
    }
  }

  try {
    const mem = router.getDevInMemoryAdapter();
    const counts = await countFromAdapter(mem, tenantId);
    return {
      ...base,
      ok: true,
      source: 'an-inmemory',
      accountCount: counts.accountCount ?? 0,
      journalCount: counts.journalCount ?? 0,
      detail: 'inmemory_accounting_list',
      detailAr: 'قراءة محاسبة عبر محول الذاكرة',
    };
  } catch (e: any) {
    return {
      ...base,
      ok: false,
      source: 'unwired',
      accountCount: null,
      journalCount: null,
      detail: e?.message || 'inmemory_failed',
      detailAr: 'فشل محول الذاكرة',
    };
  }
}
