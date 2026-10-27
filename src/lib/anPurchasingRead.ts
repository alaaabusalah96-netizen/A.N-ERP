/**
 * AN-MODULE-PUR-C4 — read-only purchasing summary via A.N StorageRouter.
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import { probeDefaultProcessPlane, type DataPlaneProbe } from './anDataPlane';

export interface PurchasingSummaryResult {
  ok: boolean;
  source: 'an-postgresql' | 'an-inmemory' | 'unwired';
  tenantId: string;
  purchaseOrderCount: number | null;
  goodsReceiptCount: number | null;
  purchaseRequestCount: number | null;
  probe: Pick<DataPlaneProbe, 'adapterType' | 'envRefPresent' | 'certifiedNote' | 'ok'>;
  detail: string;
  detailAr: string;
  kemitPurchasingPage: 'unchanged-custodydb';
}

async function countFromAdapter(adapter: any, tenantId: string) {
  let purchaseOrderCount: number | null = null;
  let goodsReceiptCount: number | null = null;
  let purchaseRequestCount: number | null = null;
  let ok = false;
  if (typeof adapter.listPurchaseOrders === 'function') {
    const r = await adapter.listPurchaseOrders(tenantId);
    if (r?.success && Array.isArray(r.data)) {
      purchaseOrderCount = r.data.length;
      ok = true;
    }
  }
  if (typeof adapter.listGoodsReceipts === 'function') {
    const r = await adapter.listGoodsReceipts(tenantId);
    if (r?.success && Array.isArray(r.data)) {
      goodsReceiptCount = r.data.length;
      ok = true;
    }
  }
  if (typeof adapter.listPurchaseRequests === 'function') {
    const r = await adapter.listPurchaseRequests(tenantId);
    if (r?.success && Array.isArray(r.data)) {
      purchaseRequestCount = r.data.length;
      ok = true;
    }
  }
  return { purchaseOrderCount, goodsReceiptCount, purchaseRequestCount, ok };
}

export async function readPurchasingSummary(
  router: StorageRouter,
  opts?: { companyId?: string; env?: NodeJS.ProcessEnv }
): Promise<PurchasingSummaryResult> {
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
    kemitPurchasingPage: 'unchanged-custodydb' as const,
  };

  if (probe.adapterType === 'postgresql' && probe.ok && probe.envRefPresent) {
    try {
      const adapter = router.getPrimaryAdapter();
      const c = await countFromAdapter(adapter, tenantId);
      return {
        ...base,
        ok: c.ok,
        source: 'an-postgresql',
        purchaseOrderCount: c.purchaseOrderCount,
        goodsReceiptCount: c.goodsReceiptCount,
        purchaseRequestCount: c.purchaseRequestCount,
        detail: 'primary_adapter_purchasing_list',
        detailAr: 'قراءة مشتريات عبر محول PostgreSQL',
      };
    } catch (e: any) {
      const msg = (e?.message || String(e)).replace(/postgres(ql)?:\/\/[^\s]+/gi, '[redacted]').slice(0, 160);
      return {
        ...base,
        ok: false,
        source: 'unwired',
        purchaseOrderCount: null,
        goodsReceiptCount: null,
        purchaseRequestCount: null,
        detail: `pg_read_failed:${msg}`,
        detailAr: `فشل قراءة المشتريات: ${msg}`,
      };
    }
  }

  try {
    const mem = router.getDevInMemoryAdapter();
    const c = await countFromAdapter(mem, tenantId);
    return {
      ...base,
      ok: true,
      source: 'an-inmemory',
      purchaseOrderCount: c.purchaseOrderCount ?? 0,
      goodsReceiptCount: c.goodsReceiptCount ?? 0,
      purchaseRequestCount: c.purchaseRequestCount ?? 0,
      detail: 'inmemory_purchasing_list',
      detailAr: 'قراءة مشتريات عبر محول الذاكرة',
    };
  } catch (e: any) {
    return {
      ...base,
      ok: false,
      source: 'unwired',
      purchaseOrderCount: null,
      goodsReceiptCount: null,
      purchaseRequestCount: null,
      detail: e?.message || 'inmemory_failed',
      detailAr: 'فشل محول الذاكرة',
    };
  }
}
