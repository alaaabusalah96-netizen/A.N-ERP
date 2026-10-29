/**
 * AN-INV-PILOT-1 — gated single-line stock movement (RECEIPT | ISSUE) on the A.N inventory engine.
 * Writes only when AN_INV_PILOT_WRITES=1. Never touches KEMIT / CustodyDB / Firestore. No UI cutover.
 */
import type {
  StockDocument,
  StockDocumentLine,
  StockMovement,
  PostStockDocumentAtomicInput,
  StoragePort,
} from '../an-core/storage/StoragePort';
import { rowIdempotencyKey } from './anMigrateIdempotency';

export type PilotMovementType = 'RECEIPT' | 'ISSUE';
export const PILOT_MOVEMENT_TYPES: readonly PilotMovementType[] = ['RECEIPT', 'ISSUE'];

export interface PilotMovementInput {
  companyId: string;
  warehouseId?: unknown;
  itemId?: unknown;
  movementType?: unknown;
  quantity?: unknown;
  unitCost?: unknown;
  notes?: unknown;
}

export interface PilotMovementResult {
  ok: boolean;
  plane: 'an-inv-pilot-1';
  httpStatus: number;
  writesEnabled: boolean;
  writesPerformed: boolean;
  cutoverApproved: false;
  companyId: string;
  code?: string;
  message: string;
  messageAr: string;
  idempotencyKey?: string;
  documentId?: string;
  movementType?: PilotMovementType;
  quantity?: number;
  balanceAfterQty?: number;
}

export function isPilotWritesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AN_INV_PILOT_WRITES === '1' || env.AN_INV_PILOT_WRITES === 'true';
}

function toNum(v: unknown): number {
  if (typeof v === 'string' && v.trim() === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function postPilotMovement(
  adapter: StoragePort,
  opts: {
    input: PilotMovementInput;
    batchIdempotencyKey: string;
    env?: NodeJS.ProcessEnv;
    actorId?: string;
    actorName?: string;
  }
): Promise<PilotMovementResult> {
  const env = opts.env || process.env;
  const companyId = String(opts.input.companyId || '').trim() || 'default';
  const writesEnabled = isPilotWritesEnabled(env);
  const idemBase = opts.batchIdempotencyKey;
  const base = {
    plane: 'an-inv-pilot-1' as const,
    writesEnabled,
    writesPerformed: false,
    cutoverApproved: false as const,
    companyId,
    idempotencyKey: idemBase,
  };
  const fail = (httpStatus: number, code: string, message: string, messageAr: string): PilotMovementResult => ({
    ...base,
    ok: false,
    httpStatus,
    code,
    message,
    messageAr,
  });

  if (!writesEnabled) {
    return fail(403, 'pilot_writes_disabled', 'AN_INV_PILOT_WRITES not enabled', 'كتابة الطيار معطّلة');
  }

  const movementType = String(opts.input.movementType || '').trim().toUpperCase() as PilotMovementType;
  if (!PILOT_MOVEMENT_TYPES.includes(movementType)) {
    return fail(400, 'invalid_movement_type', 'movementType must be RECEIPT or ISSUE', 'نوع الحركة يجب أن يكون RECEIPT أو ISSUE');
  }
  const warehouseId = String(opts.input.warehouseId || '').trim();
  const itemId = String(opts.input.itemId || '').trim();
  if (!warehouseId || !itemId) {
    return fail(400, 'warehouse_item_required', 'warehouseId and itemId required', 'المستودع والصنف مطلوبان');
  }
  const qty = toNum(opts.input.quantity);
  if (!(qty > 0)) {
    return fail(400, 'invalid_quantity', 'quantity must be a positive number', 'الكمية يجب أن تكون رقمًا موجبًا');
  }
  const hasCost = opts.input.unitCost !== undefined && opts.input.unitCost !== null && opts.input.unitCost !== '';
  const providedCost = hasCost ? toNum(opts.input.unitCost) : NaN;
  if (hasCost && !(providedCost >= 0)) {
    return fail(400, 'invalid_unit_cost', 'unitCost must be a non-negative number', 'تكلفة الوحدة يجب أن تكون صفرًا أو أكثر');
  }
  const notes = typeof opts.input.notes === 'string' ? opts.input.notes.trim().slice(0, 500) : '';

  const actorId = opts.actorId || 'inv-pilot-1';
  const actorName = opts.actorName || 'inv-pilot-1';
  const docId = `pilot-${movementType.toLowerCase()}-${companyId}-${idemBase}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);

  try {
    // Idempotent replay: same key => same document, never a second posting.
    const prior = await adapter.getStockDocument(companyId, docId);
    if (prior.success && prior.data && prior.data.status === 'POSTED') {
      return {
        ...base,
        ok: true,
        httpStatus: 200,
        code: 'idempotent_replay',
        message: 'already posted for this Idempotency-Key',
        messageAr: 'تم الترحيل مسبقًا بنفس مفتاح عدم التكرار',
        documentId: docId,
        movementType,
        quantity: qty,
      };
    }

    const whRes = await adapter.getWarehouse(companyId, warehouseId);
    if (!whRes.success || !whRes.data || whRes.data.isActive === false) {
      return fail(404, 'warehouse_not_found', 'warehouse not found or inactive', 'المستودع غير موجود أو غير نشط');
    }
    const itemRes = await adapter.getStockItem(companyId, itemId);
    if (!itemRes.success || !itemRes.data) {
      return fail(404, 'item_not_found', 'item not found', 'الصنف غير موجود');
    }
    const item = itemRes.data;
    const stockRes = await adapter.getWarehouseStock(companyId, warehouseId, itemId);
    const currentQty = stockRes.success && stockRes.data ? Number(stockRes.data.currentQty) || 0 : 0;
    const avgCost = stockRes.success && stockRes.data ? Number(stockRes.data.averageCost) || 0 : Number(item.averageCost) || 0;

    if (movementType === 'ISSUE' && qty > currentQty) {
      return fail(422, 'insufficient_stock', `available ${currentQty} < requested ${qty}`, 'الرصيد غير كافٍ للصرف');
    }

    const unitCost = movementType === 'RECEIPT' ? (hasCost ? providedCost : Number(item.averageCost) || 0) : avgCost;
    const totalCost = round2(qty * unitCost);
    const balanceAfterQty = movementType === 'RECEIPT' ? currentQty + qty : currentQty - qty;
    const nowIso = new Date().toISOString();
    const lineId = `${docId}-L1`.slice(0, 128);
    const movId = `${docId}-M1`.slice(0, 128);
    const rowKey = rowIdempotencyKey(idemBase, `${warehouseId}:${itemId}`);

    const line: StockDocumentLine = {
      id: lineId,
      tenantId: companyId,
      companyId,
      documentId: docId,
      lineNumber: 1,
      itemId,
      itemCode: item.itemCode,
      itemNameAr: item.nameAr,
      uom: item.uom || 'unit',
      quantity: qty,
      unitCost,
      totalCost,
      notes: notes || undefined,
    };
    const movement: StockMovement = {
      id: movId,
      tenantId: companyId,
      companyId,
      movementNumber: movId,
      movementType,
      warehouseId,
      warehouseNameAr: whRes.data.nameAr,
      itemId,
      itemCode: item.itemCode,
      itemNameAr: item.nameAr,
      quantity: qty,
      unitCost,
      totalCost,
      balanceAfterQty,
      sourceDocumentType: 'StockDocument',
      sourceDocumentId: docId,
      sourceDocumentNumber: docId,
      notes: notes || undefined,
      performedBy: actorId,
      performedByName: actorName,
      timestamp: nowIso,
      idempotencyKey: rowKey,
    };
    const doc: StockDocument = {
      id: docId,
      tenantId: companyId,
      companyId,
      documentNumber: docId,
      documentType: movementType,
      warehouseId,
      warehouseNameAr: whRes.data.nameAr,
      status: 'POSTED',
      totalQuantity: qty,
      totalCost,
      referenceType: 'AN_INV_PILOT',
      referenceId: docId,
      notes: notes || 'A.N inventory pilot movement',
      lines: [line],
      movements: [movement],
      performedBy: actorId,
      performedByName: actorName,
      idempotencyKey: rowKey,
      createdAt: nowIso,
      postedAt: nowIso,
    };
    const input: PostStockDocumentAtomicInput = {
      doc,
      movements: [movement],
      allowNegative: false,
      useProvidedCost: movementType === 'RECEIPT',
    };
    const res = await adapter.postStockDocumentAtomic(companyId, input, rowKey);
    if (!res.success) {
      const status = res.error?.status && res.error.status >= 400 ? res.error.status : 500;
      return fail(status, 'post_failed', (res.error?.detail || 'post failed').slice(0, 200), 'فشل ترحيل حركة المخزون');
    }
    return {
      ...base,
      ok: true,
      httpStatus: 200,
      writesPerformed: true,
      message: 'pilot movement posted',
      messageAr: 'تم ترحيل حركة الطيار',
      documentId: docId,
      movementType,
      quantity: qty,
      balanceAfterQty,
    };
  } catch (e: any) {
    return fail(500, 'pilot_exception', String(e?.message || e).slice(0, 200), 'خطأ غير متوقع في حركة الطيار');
  }
}
