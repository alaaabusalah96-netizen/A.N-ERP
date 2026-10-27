/**
 * AN-MODULE-OVERVIEW-C5 — aggregate read-only module summaries.
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import { readInventorySummary } from './anInventoryRead';
import { readAccountingSummary } from './anAccountingRead';
import { readPurchasingSummary } from './anPurchasingRead';

export async function readModulesOverview(
  router: StorageRouter,
  opts?: { companyId?: string; env?: NodeJS.ProcessEnv }
) {
  const companyId = opts?.companyId || 'default';
  const env = opts?.env;
  const [inventory, accounting, purchasing] = await Promise.all([
    readInventorySummary(router, { companyId, env }),
    readAccountingSummary(router, { companyId, env }),
    readPurchasingSummary(router, { companyId, env }),
  ]);
  const ok = inventory.ok || accounting.ok || purchasing.ok;
  return {
    ok,
    plane: 'an-module-overview-c5' as const,
    companyId,
    inventory: {
      ok: inventory.ok,
      source: inventory.source,
      warehouseCount: inventory.warehouseCount,
      itemCount: inventory.itemCount,
    },
    accounting: {
      ok: accounting.ok,
      source: accounting.source,
      accountCount: accounting.accountCount,
      journalCount: accounting.journalCount,
    },
    purchasing: {
      ok: purchasing.ok,
      source: purchasing.source,
      purchaseOrderCount: purchasing.purchaseOrderCount,
      goodsReceiptCount: purchasing.goodsReceiptCount,
      purchaseRequestCount: purchasing.purchaseRequestCount,
    },
    kemitPages: {
      inventory: 'unchanged-custodydb',
      accounting: 'unchanged-custodydb',
      purchasing: 'unchanged-custodydb',
    },
  };
}
