/**
 * AN-MIGRATE-DRY-F1 — inventory migration dry-run report (no writes).
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import type { StoragePort } from '../an-core/storage/StoragePort';
import { readInventorySummary } from './anInventoryRead';
import { probeDefaultProcessPlane } from './anDataPlane';

export interface InventoryDryRunReport {
  ok: boolean;
  plane: 'an-migrate-dry-f1';
  dryRun: true;
  writesPerformed: false;
  cutoverApproved: false;
  companyId: string;
  processPlane: {
    adapterType: string;
    envRefPresent: boolean;
    ok: boolean;
  };
  an: {
    source: string;
    warehouseCount: number | null;
    itemCount: number | null;
  };
  kemit: {
    source: 'firestore-admin' | 'unavailable' | 'error';
    warehouseCount: number | null;
    productCount: number | null;
    detail?: string;
  };
  delta: {
    warehouses: number | null;
    productsVsItems: number | null;
  };
  plan: string[];
  planAr: string[];
}

/** Optional adminDb-like reader injected by server to avoid hard import cycles. */
export type KemitInventoryCounter = (companyId: string) => Promise<{
  warehouseCount: number | null;
  productCount: number | null;
  detail?: string;
}>;

export async function buildInventoryMigrateDryRun(
  router: StorageRouter,
  opts: {
    companyId?: string;
    env?: NodeJS.ProcessEnv;
    countKemit?: KemitInventoryCounter;
    adapter?: StoragePort;
  }
): Promise<InventoryDryRunReport> {
  const env = opts.env || process.env;
  const companyId = (opts.companyId || 'default').trim() || 'default';
  const processPlane = probeDefaultProcessPlane(env);
  let anSummary = await readInventorySummary(router, { companyId, env });

  if (opts.adapter) {
    try {
      const wh = await opts.adapter.listWarehouses(companyId);
      const items = await opts.adapter.listStockItems(companyId);
      const warehouseCount = wh.success && Array.isArray(wh.data) ? wh.data.length : null;
      const itemCount = items.success && Array.isArray(items.data) ? items.data.length : null;
      anSummary = {
        ...anSummary,
        warehouseCount,
        itemCount,
      };
    } catch {
      /* keep default anSummary */
    }
  }

  let kemit: InventoryDryRunReport['kemit'] = {
    source: 'unavailable',
    warehouseCount: null,
    productCount: null,
    detail: 'no_kemit_counter',
  };
  if (opts.countKemit) {
    try {
      const k = await opts.countKemit(companyId);
      kemit = {
        source: 'firestore-admin',
        warehouseCount: k.warehouseCount,
        productCount: k.productCount,
        detail: k.detail,
      };
    } catch (e: any) {
      kemit = {
        source: 'error',
        warehouseCount: null,
        productCount: null,
        detail: (e?.message || String(e)).slice(0, 160),
      };
    }
  }

  const whAn = anSummary.warehouseCount;
  const whKe = kemit.warehouseCount;
  const itAn = anSummary.itemCount;
  const prKe = kemit.productCount;

  const plan = [
    'Dry-run only: no SQL writes performed',
    'Next package (F2) may upsert warehouses when AN_MIGRATE_WRITES=1 and readiness gates allow',
    'Inventory.tsx remains on CustodyDB until explicit UI cutover package',
    'Reconcile company_id partitioning before any write migrate',
  ];
  const planAr = [
    'تجريبي فقط: لم تُكتب صفوف SQL',
    'الحزمة التالية (F2) قد ترفع المستودعات عند AN_MIGRATE_WRITES=1 وبعد بوابات الجاهزية',
    'Inventory.tsx يبقى على CustodyDB حتى حزمة قطع واجهة صريحة',
    'راجع عزل company_id قبل أي ترحيل كتابة',
  ];

  return {
    ok: true,
    plane: 'an-migrate-dry-f1',
    dryRun: true,
    writesPerformed: false,
    cutoverApproved: false,
    companyId,
    processPlane: {
      adapterType: processPlane.adapterType,
      envRefPresent: processPlane.envRefPresent,
      ok: processPlane.ok,
    },
    an: {
      source: anSummary.source,
      warehouseCount: whAn,
      itemCount: itAn,
    },
    kemit,
    delta: {
      warehouses:
        whAn != null && whKe != null ? whAn - whKe : null,
      productsVsItems:
        itAn != null && prKe != null ? itAn - prKe : null,
    },
    plan,
    planAr,
  };
}
