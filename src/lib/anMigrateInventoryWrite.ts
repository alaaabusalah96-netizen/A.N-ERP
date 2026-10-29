/**
 * AN-MIGRATE-WRITE-F2 — gated warehouse upsert into A.N storage.
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import type { Warehouse, StoragePort } from '../an-core/storage/StoragePort';
import { probeDefaultProcessPlane } from './anDataPlane';

export interface KemitWarehouseRaw {
  id?: string;
  company_id?: string;
  code?: string;
  name?: string;
  nameAr?: string;
  name_ar?: string;
  nameEn?: string;
  isActive?: boolean;
  is_active?: boolean;
  location?: string;
  [key: string]: unknown;
}

export function mapKemitWarehouseToAn(
  raw: KemitWarehouseRaw,
  companyId: string,
  nowIso: string
): Warehouse {
  const id = String(raw.id || '').trim() || `wh-${companyId}-${String(raw.code || 'x')}`;
  const nameAr =
    String(raw.nameAr || raw.name_ar || raw.name || raw.code || id).trim() || id;
  return {
    id,
    tenantId: companyId,
    companyId,
    code: String(raw.code || id).slice(0, 64),
    nameAr,
    nameEn: raw.nameEn ? String(raw.nameEn) : undefined,
    location: raw.location ? String(raw.location) : undefined,
    valuationMethod: 'WEIGHTED_AVERAGE', // StoragePort uses WEIGHTED_AVERAGE
    isActive: raw.isActive !== false && raw.is_active !== false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export interface WarehouseMigrateResult {
  ok: boolean;
  plane: 'an-migrate-write-f2';
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

export async function migrateWarehousesToAn(
  router: StorageRouter,
  opts: {
    companyId: string;
    rows: KemitWarehouseRaw[];
    env?: NodeJS.ProcessEnv;
    adapter?: StoragePort;
  }
): Promise<WarehouseMigrateResult> {
  const env = opts.env || process.env;
  const companyId = opts.companyId.trim() || 'default';
  const writesEnabled =
    env.AN_MIGRATE_WRITES === '1' || env.AN_MIGRATE_WRITES === 'true';

  const base = {
    plane: 'an-migrate-write-f2' as const,
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
      detailAr: 'الكتابة معطّلة — اضبط AN_MIGRATE_WRITES=1',
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
      detailAr: plane.errorAr || 'مستوى PostgreSQL غير جاهز',
    };
  }

  // opts.adapter if provided; else primary for backward compat in unit tests
  const adapter = opts.adapter || router.getPrimaryAdapter();
  const existing = await adapter.listWarehouses(companyId);
  const existingIds = new Set(
    existing.success && Array.isArray(existing.data)
      ? existing.data.map((w) => w.id)
      : []
  );

  const nowIso = new Date().toISOString();
  let inserted = 0;
  let skippedExisting = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const raw of opts.rows) {
    const mapped = mapKemitWarehouseToAn(raw, companyId, nowIso);
    if (existingIds.has(mapped.id)) {
      skippedExisting++;
      continue;
    }
    try {
      const key = `migrate-wh-${mapped.id}`;
      const res = await adapter.saveWarehouse(companyId, mapped, key);
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
    detail: 'warehouse_migrate_done',
    detailAr: 'انتهى ترحيل المستودعات (إن وُجدت صفوف)',
  };
}
