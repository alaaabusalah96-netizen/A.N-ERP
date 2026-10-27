/**
 * AN-MODULE-INV-C1 — read-only inventory summary via A.N StorageRouter adapters.
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import { probeDefaultProcessPlane, type DataPlaneProbe } from './anDataPlane';

export interface InventorySummaryResult {
  ok: boolean;
  source: 'an-postgresql' | 'an-inmemory' | 'unwired';
  tenantId: string;
  warehouseCount: number | null;
  itemCount: number | null;
  probe: Pick<DataPlaneProbe, 'adapterType' | 'envRefPresent' | 'certifiedNote' | 'ok'>;
  detail: string;
  detailAr: string;
  kemitInventoryPage: 'unchanged-custodydb';
}

export async function readInventorySummary(
  router: StorageRouter,
  opts?: { companyId?: string; env?: NodeJS.ProcessEnv }
): Promise<InventorySummaryResult> {
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
    kemitInventoryPage: 'unchanged-custodydb' as const,
  };

  // Prefer postgresql primary when env wired
  if (probe.adapterType === 'postgresql' && probe.ok && probe.envRefPresent) {
    try {
      const adapter = router.getPrimaryAdapter();
      const wh = await adapter.listWarehouses(tenantId);
      const items = await adapter.listStockItems(tenantId);
      const warehouseCount = wh.success && Array.isArray(wh.data) ? wh.data.length : null;
      const itemCount = items.success && Array.isArray(items.data) ? items.data.length : null;
      return {
        ...base,
        ok: !!(wh.success || items.success),
        source: 'an-postgresql',
        warehouseCount,
        itemCount,
        detail: 'primary_adapter_list_ok',
        detailAr: 'قراءة عبر محول PostgreSQL الأساسي',
      };
    } catch (e: any) {
      const msg = (e?.message || String(e)).replace(/postgres(ql)?:\/\/[^\s]+/gi, '[redacted]').slice(0, 160);
      return {
        ...base,
        ok: false,
        source: 'unwired',
        warehouseCount: null,
        itemCount: null,
        detail: `pg_read_failed:${msg}`,
        detailAr: `فشلت قراءة PostgreSQL: ${msg}`,
      };
    }
  }

  // Fallback: in-memory adapter (dev / no DATABASE_URL)
  try {
    const mem = router.getDevInMemoryAdapter();
    const wh = await mem.listWarehouses(tenantId);
    const items = await mem.listStockItems(tenantId);
    return {
      ...base,
      ok: true,
      source: 'an-inmemory',
      warehouseCount: wh.success && Array.isArray(wh.data) ? wh.data.length : 0,
      itemCount: items.success && Array.isArray(items.data) ? items.data.length : 0,
      detail: 'inmemory_list_ok',
      detailAr: 'قراءة عبر محول الذاكرة (لا يوجد DATABASE_URL أو غير PostgreSQL)',
    };
  } catch (e: any) {
    return {
      ...base,
      ok: false,
      source: 'unwired',
      warehouseCount: null,
      itemCount: null,
      detail: e?.message || 'inmemory_failed',
      detailAr: 'فشل محول الذاكرة',
    };
  }
}
