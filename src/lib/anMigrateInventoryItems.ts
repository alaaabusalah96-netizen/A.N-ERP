/**
 * AN-MIGRATE-WRITE-F3 — gated stock item upsert into A.N storage.
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import type { StockItem } from '../an-core/storage/StoragePort';
import { probeDefaultProcessPlane } from './anDataPlane';

const DEFAULT_INV = '1105';
const DEFAULT_COGS = '5101';
const DEFAULT_ADJ_EXP = '5209';
const DEFAULT_ADJ_GAIN = '4203';

export interface KemitProductRaw {
  id?: string;
  company_id?: string;
  code?: string;
  itemCode?: string;
  sku?: string;
  name?: string;
  nameAr?: string;
  name_ar?: string;
  nameEn?: string;
  category?: string;
  uom?: string;
  unit?: string;
  barcode?: string;
  isActive?: boolean;
  is_active?: boolean;
  valuationMethod?: string;
  standardCost?: number;
  averageCost?: number;
  sellingPrice?: number;
  reorderPoint?: number;
  [key: string]: unknown;
}

export function mapKemitProductToAn(
  raw: KemitProductRaw,
  companyId: string,
  nowIso: string
): StockItem {
  const id = String(raw.id || '').trim() || `item-${companyId}-${String(raw.code || raw.sku || 'x')}`;
  const itemCode = String(raw.itemCode || raw.code || raw.sku || id).slice(0, 64);
  const nameAr = String(raw.nameAr || raw.name_ar || raw.name || itemCode).trim() || itemCode;
  const vmRaw = String(raw.valuationMethod || 'WEIGHTED_AVERAGE').toUpperCase();
  const valuationMethod =
    vmRaw === 'FIFO' || vmRaw === 'SPECIFIC_LOT' || vmRaw === 'STANDARD_COST'
      ? (vmRaw as StockItem['valuationMethod'])
      : 'WEIGHTED_AVERAGE';

  return {
    id,
    tenantId: companyId,
    companyId,
    itemCode,
    barcode: raw.barcode ? String(raw.barcode) : undefined,
    nameAr,
    nameEn: raw.nameEn ? String(raw.nameEn) : undefined,
    category: String(raw.category || 'general'),
    uom: String(raw.uom || raw.unit || 'unit'),
    inventoryAccountCode: DEFAULT_INV,
    cogsAccountCode: DEFAULT_COGS,
    adjustmentExpenseAccountCode: DEFAULT_ADJ_EXP,
    adjustmentGainAccountCode: DEFAULT_ADJ_GAIN,
    valuationMethod,
    standardCost: Number(raw.standardCost || 0) || 0,
    averageCost: Number(raw.averageCost || 0) || 0,
    sellingPrice: Number(raw.sellingPrice || 0) || 0,
    reorderPoint: Number(raw.reorderPoint || 0) || 0,
    minStockLevel: 0,
    maxStockLevel: 0,
    trackBatch: false,
    trackSerial: false,
    isActive: raw.isActive !== false && raw.is_active !== false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export interface ItemMigrateResult {
  ok: boolean;
  plane: 'an-migrate-write-f3';
  writesEnabled: boolean;
  writesPerformed: boolean;
  cutoverApproved: false;
  companyId: string;
  attempted: number;
  inserted: number;
  skippedExisting: number;
  failed: number;
  errors: string[];
  detail: string;
  detailAr: string;
}

export async function migrateStockItemsToAn(
  router: StorageRouter,
  opts: { companyId: string; rows: KemitProductRaw[]; env?: NodeJS.ProcessEnv }
): Promise<ItemMigrateResult> {
  const env = opts.env || process.env;
  const companyId = opts.companyId.trim() || 'default';
  const writesEnabled = env.AN_MIGRATE_WRITES === '1' || env.AN_MIGRATE_WRITES === 'true';
  const base = {
    plane: 'an-migrate-write-f3' as const,
    writesEnabled,
    cutoverApproved: false as const,
    companyId,
  };

  if (!writesEnabled) {
    return {
      ...base,
      ok: false,
      writesPerformed: false,
      attempted: 0,
      inserted: 0,
      skippedExisting: 0,
      failed: 0,
      errors: ['AN_MIGRATE_WRITES not enabled'],
      detail: 'writes_disabled',
      detailAr: 'الكتابة معطّلة — AN_MIGRATE_WRITES=1',
    };
  }

  const plane = probeDefaultProcessPlane(env);
  if (!(plane.adapterType === 'postgresql' && plane.ok && plane.envRefPresent)) {
    return {
      ...base,
      ok: false,
      writesPerformed: false,
      attempted: 0,
      inserted: 0,
      skippedExisting: 0,
      failed: 0,
      errors: ['postgresql env not ready'],
      detail: plane.certifiedNote,
      detailAr: plane.errorAr || 'PostgreSQL غير جاهز',
    };
  }

  const adapter = router.getPrimaryAdapter();
  const existing = await adapter.listStockItems(companyId);
  const existingIds = new Set(
    existing.success && Array.isArray(existing.data) ? existing.data.map((i) => i.id) : []
  );
  const nowIso = new Date().toISOString();
  let inserted = 0;
  let skippedExisting = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const raw of opts.rows) {
    const mapped = mapKemitProductToAn(raw, companyId, nowIso);
    if (existingIds.has(mapped.id)) {
      skippedExisting++;
      continue;
    }
    try {
      const res = await adapter.saveStockItem(companyId, mapped, `migrate-item-${mapped.id}`);
      if (res.success) {
        inserted++;
        existingIds.add(mapped.id);
      } else {
        failed++;
        errors.push(`${mapped.id}:${res.error || 'save_failed'}`);
      }
    } catch (e: any) {
      failed++;
      errors.push(`${mapped.id}:${(e?.message || String(e)).slice(0, 120)}`);
    }
  }

  return {
    ...base,
    ok: failed === 0,
    writesPerformed: inserted > 0,
    attempted: opts.rows.length,
    inserted,
    skippedExisting,
    failed,
    errors: errors.slice(0, 20),
    detail: 'stock_items_migrate_done',
    detailAr: 'انتهى ترحيل الأصناف (إن وُجدت)',
  };
}
