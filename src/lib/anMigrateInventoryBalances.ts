/**
 * AN-MIGRATE-WRITE-F4 — gated opening stock via RECEIPT atomic posts.
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import type {
  StockDocument,
  StockDocumentLine,
  StockMovement,
  PostStockDocumentAtomicInput,
} from '../an-core/storage/StoragePort';
import { probeDefaultProcessPlane } from './anDataPlane';

export interface KemitBalanceRaw {
  id?: string;
  company_id?: string;
  warehouse_id?: string;
  warehouseId?: string;
  item_id?: string;
  itemId?: string;
  product_id?: string;
  qty?: number;
  quantity?: number;
  current_qty?: number;
  unit_cost?: number;
  unitCost?: number;
  average_cost?: number;
  itemCode?: string;
  item_code?: string;
  itemNameAr?: string;
  item_name?: string;
  [key: string]: unknown;
}

export interface BalanceMigrateResult {
  ok: boolean;
  plane: 'an-migrate-write-f4';
  writesEnabled: boolean;
  writesPerformed: boolean;
  cutoverApproved: false;
  companyId: string;
  attempted: number;
  inserted: number;
  skippedExisting: number;
  skippedNonPositive: number;
  failed: number;
  errors: string[];
  detail: string;
  detailAr: string;
}

function num(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export async function migrateOpeningBalancesToAn(
  router: StorageRouter,
  opts: { companyId: string; rows: KemitBalanceRaw[]; env?: NodeJS.ProcessEnv; actorId?: string }
): Promise<BalanceMigrateResult> {
  const env = opts.env || process.env;
  const companyId = opts.companyId.trim() || 'default';
  const actorId = opts.actorId || 'migrate-f4';
  const writesEnabled = env.AN_MIGRATE_WRITES === '1' || env.AN_MIGRATE_WRITES === 'true';
  const base = {
    plane: 'an-migrate-write-f4' as const,
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
      skippedNonPositive: 0,
      failed: 0,
      errors: ['AN_MIGRATE_WRITES not enabled'],
      detail: 'writes_disabled',
      detailAr: 'الكتابة معطّلة',
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
      skippedNonPositive: 0,
      failed: 0,
      errors: ['postgresql env not ready'],
      detail: plane.certifiedNote,
      detailAr: plane.errorAr || 'PostgreSQL غير جاهز',
    };
  }

  const adapter = router.getPrimaryAdapter();
  const nowIso = new Date().toISOString();
  let inserted = 0;
  let skippedExisting = 0;
  let skippedNonPositive = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const raw of opts.rows) {
    const warehouseId = String(raw.warehouse_id || raw.warehouseId || '').trim();
    const itemId = String(raw.item_id || raw.itemId || raw.product_id || '').trim();
    const qty = num(raw.qty ?? raw.quantity ?? raw.current_qty, 0);
    const unitCost = num(raw.unit_cost ?? raw.unitCost ?? raw.average_cost, 0);
    if (!warehouseId || !itemId) {
      failed++;
      errors.push('missing warehouseId/itemId');
      continue;
    }
    if (qty <= 0) {
      skippedNonPositive++;
      continue;
    }
    try {
      const existing = await adapter.getWarehouseStock(companyId, warehouseId, itemId);
      if (existing.success && existing.data && existing.data.currentQty > 0) {
        skippedExisting++;
        continue;
      }
      const docId = `mig-open-${companyId}-${warehouseId}-${itemId}`.slice(0, 120);
      const lineId = `${docId}-L1`;
      const movId = `${docId}-M1`;
      const itemCode = String(raw.itemCode || raw.item_code || itemId);
      const itemNameAr = String(raw.itemNameAr || raw.item_name || itemCode);
      const totalCost = Math.round(qty * unitCost * 100) / 100;
      const line: StockDocumentLine = {
        id: lineId,
        tenantId: companyId,
        companyId,
        documentId: docId,
        lineNumber: 1,
        itemId,
        itemCode,
        itemNameAr,
        uom: 'unit',
        quantity: qty,
        unitCost,
        totalCost,
      };
      const movement: StockMovement = {
        id: movId,
        tenantId: companyId,
        companyId,
        movementNumber: movId,
        movementType: 'RECEIPT',
        warehouseId,
        itemId,
        itemCode,
        itemNameAr,
        quantity: qty,
        unitCost,
        totalCost,
        balanceAfterQty: qty,
        sourceDocumentType: 'StockDocument',
        sourceDocumentId: docId,
        sourceDocumentNumber: docId,
        performedBy: actorId,
        performedByName: 'migrate-f4',
        timestamp: nowIso,
        idempotencyKey: `migrate-bal-${docId}`,
      };
      const doc: StockDocument = {
        id: docId,
        tenantId: companyId,
        companyId,
        documentNumber: docId,
        documentType: 'RECEIPT',
        warehouseId,
        status: 'POSTED',
        totalQuantity: qty,
        totalCost,
        referenceType: 'MIGRATE_OPENING',
        referenceId: docId,
        notes: 'Opening balance migrate F4',
        lines: [line],
        movements: [movement],
        performedBy: actorId,
        performedByName: 'migrate-f4',
        idempotencyKey: `migrate-bal-${docId}`,
        postedAt: nowIso,
        createdAt: nowIso,
      };

      const input: PostStockDocumentAtomicInput = {
        doc,
        movements: [movement],
        allowNegative: false,
        useProvidedCost: true,
      };
      const res = await adapter.postStockDocumentAtomic(
        companyId,
        input,
        `migrate-bal-${docId}`
      );
      if (res.success) inserted++;
      else {
        failed++;
        errors.push(`${warehouseId}/${itemId}:${res.error || 'post_failed'}`);
      }
    } catch (e: any) {
      failed++;
      errors.push(
        `${warehouseId}/${itemId}:${(e?.message || String(e)).slice(0, 120)}`
      );
    }
  }

  return {
    ...base,
    ok: failed === 0,
    writesPerformed: inserted > 0,
    attempted: opts.rows.length,
    inserted,
    skippedExisting,
    skippedNonPositive,
    failed,
    errors: errors.slice(0, 30),
    detail: 'opening_balances_migrate_done',
    detailAr: 'انتهى ترحيل الأرصدة الافتتاحية (إن وُجدت)',
  };
}
