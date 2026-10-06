/**
 * A.N ERP — Phase 7: Inventory & Warehouses Service (موديول المخازن والمخزون - موديول 3 من 15)
 * 
 * Strict Adherence:
 * - 00-custom-instructions.md v7 & Phase 7 Guidelines.
 * - StoragePort abstraction (PostgreSQL, MySQL, MongoDB, Firebase, InMemory).
 * - Multi-Warehouse management with bins, branches, and weighted average valuation.
 * - Stock movements (Receipt, Issue, Transfer, Adjustment) with real-time balance tracking.
 * - Batch and Serial number tracking.
 * - Physical count (Periodic & Surprise) with blind comparison.
 * - Strict SoD enforcement: Physical count performer CANNOT approve or post the variance (Section 7.1).
 * - PostingEngine integration: Balanced double-entry journal posting for variances and COGS impacts.
 * - NumberingEngine integration: Atomic document numbering for transfers and counts.
 * - Absolute zero business terms in UI or leaks of engineering jargon.
 */

import {
  StoragePort,
  Warehouse,
  WarehouseBin,
  StockItem,
  WarehouseStock,
  StockMovement,
  StockMovementType,
  StockTransfer,
  StockTransferLine,
  StockTransferStatus,
  StockCount,
  StockCountLine,
  StockCountStatus,
  ItemBatch,
  ItemSerial,
  JournalLine,
  JournalEntry,
  StockDocument,
  StockDocumentLine,
  StockDocumentType,
  DocumentAttachment,
  ItemPrice,
  ItemLedgerReport,
  ItemLedgerEntry,
  InventorySettings,
} from '../storage/StoragePort';
import { PostingEngine } from '../engines/PostingEngine';
import { NumberingEngine } from '../engines/NumberingEngine';
import {
  parsePositiveQuantity,
  parseNonNegativeQuantity,
  parseNonNegativeMoney,
  parseIsoDate,
  parseBoundedString,
  parseEnum,
  validationError,
} from '../utils/validation';

export interface StockLineItemInput {
  itemId: string;
  quantity: number;
  uom?: string;
  unitCost?: number;
  batchNumber?: string;
  serialNumber?: string;
  expiryDate?: string;
  notes?: string;
  // Phase 13 (COST-001): purchase-order tag (entry: tags the cost layer; exit of a SPECIFIC_LOT item: selects that PO's layers)
  sourcePoNumber?: string;
}

export interface ReceiveStockInput {
  warehouseId?: string;
  itemId?: string; // WARN [ADR-011/Phase7.6]: مسار توافقي فردي — يرجى استخدام lines[] المتعددة
  quantity?: number;
  unitCost?: number;
  batchNumber?: string;
  serialNumber?: string;
  expiryDate?: string;
  header?: {
    warehouseId: string;
    sourceDocumentType?: string;
    sourceDocumentId?: string;
    sourceDocumentNumber?: string;
    notes?: string;
    performedBy: string;
    performedByName: string;
    idempotencyKey: string;
  };
  lines?: StockLineItemInput[];
  sourceDocumentType?: string;
  sourceDocumentId?: string;
  sourceDocumentNumber?: string;
  notes?: string;
  performedBy?: string;
  performedByName?: string;
  idempotencyKey?: string;
}

export interface IssueStockInput {
  warehouseId?: string;
  itemId?: string; // WARN [ADR-011/Phase7.6]: مسار توافقي فردي — يرجى استخدام lines[] المتعددة
  quantity?: number;
  batchNumber?: string;
  serialNumber?: string;
  header?: {
    warehouseId: string;
    sourceDocumentType?: string;
    sourceDocumentId?: string;
    sourceDocumentNumber?: string;
    notes?: string;
    performedBy: string;
    performedByName: string;
    idempotencyKey: string;
  };
  lines?: StockLineItemInput[];
  sourceDocumentType?: string;
  sourceDocumentId?: string;
  sourceDocumentNumber?: string;
  notes?: string;
  performedBy?: string;
  performedByName?: string;
  idempotencyKey?: string;
}

export interface StockReturnInput {
  originalDocumentId: string;
  returnType: 'RETURN_RECEIPT' | 'RETURN_ISSUE';
  reason?: string;
  lines: Array<{
    itemId: string;
    quantity: number;
    unitCost?: number;
    notes?: string;
  }>;
  performedBy: string;
  performedByName: string;
  idempotencyKey: string;
}

export interface CreateTransferInput {
  sourceWarehouseId: string;
  targetWarehouseId: string;
  lines: Array<{
    itemId: string;
    quantity: number;
    batchNumber?: string;
    serialNumber?: string;
  }>;
  requestedBy: string;
  requestedByName: string;
  notes?: string;
  idempotencyKey: string;
}

export interface CreateStockCountInput {
  countType: 'PERIODIC' | 'SURPRISE';
  warehouseId: string;
  lines: Array<{
    itemId: string;
    countedQty: number;
    batchNumber?: string;
    serialNumber?: string;
    notes?: string;
  }>;
  performedBy: string;
  performedByName: string;
  notes?: string;
  idempotencyKey: string;
}

export interface ApproveStockCountInput {
  countId: string;
  approvedBy: string;
  approvedByName: string;
  idempotencyKey: string;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    type: string;
    title: string;
    status: number;
    detail: string;
  };
}

export class InventoryService {
  constructor(
    private storage: StoragePort,
    private postingEngine: PostingEngine,
    private numberingEngine: NumberingEngine
  ) {}

  // ============================================================================
  // Phase 9 (VAL-001): input validation helpers — rejection happens BEFORE any write / number generation
  // ============================================================================

  private invalid(detail: string): { success: false; error: NonNullable<ServiceResult<never>['error']> } {
    return { success: false, error: validationError(detail) };
  }

  /** Optional bounded text: undefined/null → undefined; anything else must pass parseBoundedString. */
  private optText(v: unknown, label: string, max: number, multiline = false): { ok: true; value: string | undefined; detail?: string } | { ok: false; detail: string; value?: string | undefined } {
    if (v === undefined || v === null) return { ok: true, value: undefined };
    const r = parseBoundedString(v, label, { max, allowNewlines: multiline });
    return r.ok ? { ok: true, value: r.value } : { ok: false, detail: r.detail };
  }

  /**
   * Validates one stock line and returns a normalized copy (quantity/unitCost as numbers, texts trimmed).
   * `opts.cost` validates unitCost when sent; `opts.expiry` validates expiryDate when sent.
   */
  private normalizeStockLine<T extends { quantity: any; unitCost?: any; batchNumber?: any; serialNumber?: any; expiryDate?: any; notes?: any; itemId?: any; sourcePoNumber?: any }>(
    raw: T,
    opts: { cost?: boolean; expiry?: boolean } = {}
  ): { ok: true; line: T; detail?: string } | { ok: false; detail: string; line?: T } {
    const who = raw && raw.itemId !== undefined ? ` للصنف ${raw.itemId}` : '';
    const q = parsePositiveQuantity(raw?.quantity, `الكمية (quantity)${who}`);
    if (!q.ok) return { ok: false, detail: q.detail };
    const line: any = { ...raw, quantity: q.value };
    if (opts.cost && raw.unitCost !== undefined && raw.unitCost !== null) {
      const c = parseNonNegativeMoney(raw.unitCost, `تكلفة الوحدة (unitCost)${who}`);
      if (!c.ok) return { ok: false, detail: c.detail };
      line.unitCost = c.value;
    }
    if (opts.expiry && raw.expiryDate !== undefined && raw.expiryDate !== null && raw.expiryDate !== '') {
      const d = parseIsoDate(raw.expiryDate, `تاريخ الصلاحية (expiryDate)${who}`);
      if (!d.ok) return { ok: false, detail: d.detail };
      line.expiryDate = d.value;
    }
    for (const [key, label, max, multi] of [
      ['batchNumber', 'رقم الدفعة (batchNumber)', 64, false],
      ['serialNumber', 'الرقم التسلسلي (serialNumber)', 128, false],
      ['sourcePoNumber', 'رقم أمر الشراء (sourcePoNumber)', 64, false],
      ['notes', 'الملاحظات (notes)', 2000, true],
    ] as const) {
      if (raw[key] === undefined || raw[key] === null || raw[key] === '') continue;
      const t = this.optText(raw[key], `${label}${who}`, max, multi);
      if (!t.ok) return { ok: false, detail: t.detail };
      line[key] = t.value;
    }
    return { ok: true, line: line as T };
  }

  /** Validates header notes and every line; returns the normalized lines (same order) or the first error. */
  private normalizeLines(
    lines: StockLineItemInput[],
    headerNotes: unknown[],
    opts: { cost?: boolean; expiry?: boolean }
  ): { ok: true; lines: StockLineItemInput[]; detail?: string } | { ok: false; detail: string; lines?: StockLineItemInput[] } {
    for (const n of headerNotes) {
      const t = this.optText(n, 'الملاحظات (notes)', 2000, true);
      if (!t.ok) return { ok: false, detail: t.detail };
    }
    const out: StockLineItemInput[] = [];
    for (const raw of lines) {
      const norm = this.normalizeStockLine(raw, opts);
      if (!norm.ok) return { ok: false, detail: norm.detail };
      out.push(norm.line);
    }
    return { ok: true, lines: out };
  }

  // ============================================================================
  // 7A: Warehouses & Bins (تعدد المخازن ومواقع التخزين الفرعية)
  // ============================================================================

  public async saveWarehouse(
    tenantId: string,
    warehouseData: Partial<Warehouse>,
    idempotencyKey: string
  ): Promise<ServiceResult<Warehouse>> {
    if (!warehouseData.code || !warehouseData.nameAr) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-warehouse',
          title: 'بيانات المستودع غير مكتملة',
          status: 400,
          detail: 'كود واسم المستودع بالعربية حقول إلزامية.',
        },
      };
    }

    const warehouse: Warehouse = {
      id: warehouseData.id || `wh-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      tenantId,
      companyId: tenantId,
      code: warehouseData.code,
      nameAr: warehouseData.nameAr,
      nameEn: warehouseData.nameEn,
      branchId: warehouseData.branchId,
      branchName: warehouseData.branchName,
      location: warehouseData.location,
      isDefault: Boolean(warehouseData.isDefault),
      valuationMethod: warehouseData.valuationMethod || 'WEIGHTED_AVERAGE',
      isActive: warehouseData.isActive !== undefined ? warehouseData.isActive : true,
      createdAt: warehouseData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.storage.saveWarehouse(tenantId, warehouse, idempotencyKey);
    return saved;
  }

  public async getWarehouse(tenantId: string, warehouseId: string): Promise<ServiceResult<Warehouse | null>> {
    return this.storage.getWarehouse(tenantId, warehouseId);
  }

  public async listWarehouses(
    tenantId: string,
    filter?: { isActive?: boolean; branchId?: string }
  ): Promise<ServiceResult<Warehouse[]>> {
    return this.storage.listWarehouses(tenantId, filter);
  }

  public async saveWarehouseBin(tenantId: string, binData: Partial<WarehouseBin>): Promise<ServiceResult<WarehouseBin>> {
    if (!binData.warehouseId || !binData.code) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-bin',
          title: 'بيانات موقع التخزين الفرعي غير مكتملة',
          status: 400,
          detail: 'معرف المستودع وكود الرف/الموقع حقول إلزامية.',
        },
      };
    }

    const bin: WarehouseBin = {
      id: binData.id || `bin-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      tenantId,
      companyId: tenantId,
      warehouseId: binData.warehouseId,
      code: binData.code,
      aisle: binData.aisle,
      rack: binData.rack,
      shelf: binData.shelf,
      bin: binData.bin,
      descriptionAr: binData.descriptionAr,
      isActive: binData.isActive !== undefined ? binData.isActive : true,
      createdAt: binData.createdAt || new Date().toISOString(),
    };

    return this.storage.saveWarehouseBin(tenantId, bin);
  }

  public async listWarehouseBins(tenantId: string, warehouseId: string): Promise<ServiceResult<WarehouseBin[]>> {
    return this.storage.listWarehouseBins(tenantId, warehouseId);
  }

  // ============================================================================
  // 7A: Items & Catalog (بطاقة الصنف ودليل الأصناف)
  // ============================================================================

  // Phase 13 (COST-001): inventory settings (default valuation method, negative stock, over-receipt tolerance)
  public async getInventorySettings(tenantId: string): Promise<ServiceResult<InventorySettings>> {
    return this.storage.getInventorySettings(tenantId);
  }

  public async saveInventorySettings(
    tenantId: string,
    input: { defaultValuationMethod?: unknown; allowNegativeStock?: unknown; overReceiptTolerancePct?: unknown },
    actorId: string,
    idempotencyKey: string
  ): Promise<ServiceResult<InventorySettings>> {
    const patch: Partial<Omit<InventorySettings, 'tenantId'>> = {};
    if (input.defaultValuationMethod !== undefined) {
      const vm = parseEnum(input.defaultValuationMethod, 'طريقة التقييم الافتراضية (default_valuation_method)', ['WEIGHTED_AVERAGE', 'FIFO', 'SPECIFIC_LOT'] as const);
      if (!vm.ok) return this.invalid(vm.detail);
      patch.defaultValuationMethod = vm.value;
    }
    if (input.allowNegativeStock !== undefined) {
      if (typeof input.allowNegativeStock !== 'boolean') return this.invalid('السماح بالرصيد السالب (allow_negative_stock) يجب أن يكون true أو false.');
      patch.allowNegativeStock = input.allowNegativeStock;
    }
    if (input.overReceiptTolerancePct !== undefined) {
      const n = typeof input.overReceiptTolerancePct === 'number' ? input.overReceiptTolerancePct : NaN;
      if (!Number.isFinite(n) || n < 0 || n > 100) return this.invalid('نسبة سماح الزيادة في الاستلام (over_receipt_tolerance_pct) يجب أن تكون رقماً بين 0 و100.');
      patch.overReceiptTolerancePct = n;
    }
    if (Object.keys(patch).length === 0) return this.invalid('لا توجد أي إعدادات للتحديث.');
    return this.storage.saveInventorySettings(tenantId, patch, actorId, idempotencyKey);
  }

  public async saveStockItem(
    tenantId: string,
    itemData: Partial<StockItem>,
    idempotencyKey: string
  ): Promise<ServiceResult<StockItem>> {
    if (!itemData.itemCode || !itemData.nameAr || !itemData.category) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-item',
          title: 'بيانات الصنف غير مكتملة',
          status: 400,
          detail: 'كود الصنف واسم الصنف وتصنيفه حقول إلزامية.',
        },
      };
    }

    // Phase 9: validate before building / saving anything
    const vCode = parseBoundedString(itemData.itemCode, 'كود الصنف (itemCode)', { min: 1, max: 64 });
    if (!vCode.ok) return this.invalid(vCode.detail);
    const vName = parseBoundedString(itemData.nameAr, 'اسم الصنف (nameAr)', { min: 1, max: 200 });
    if (!vName.ok) return this.invalid(vName.detail);
    const money: Record<string, number | undefined> = {};
    for (const [key, label] of [
      ['standardCost', 'التكلفة المعيارية (standardCost)'],
      ['averageCost', 'متوسط التكلفة (averageCost)'],
      ['lastPurchaseCost', 'آخر تكلفة شراء (lastPurchaseCost)'],
      ['sellingPrice', 'سعر البيع (sellingPrice)'],
    ] as const) {
      const raw = (itemData as any)[key];
      if (raw === undefined || raw === null || raw === '') continue;
      const m = parseNonNegativeMoney(raw, label);
      if (!m.ok) return this.invalid(m.detail);
      money[key] = m.value;
    }
    // Phase 13 (COST-001): supported methods = WEIGHTED_AVERAGE | FIFO | SPECIFIC_LOT. STANDARD_COST is rejected on save.
    let valuationMethod: StockItem['valuationMethod'] = 'WEIGHTED_AVERAGE';
    if (itemData.valuationMethod !== undefined && itemData.valuationMethod !== null && (itemData.valuationMethod as any) !== '') {
      const vm = parseEnum(itemData.valuationMethod, 'طريقة التقييم (valuationMethod)', ['WEIGHTED_AVERAGE', 'FIFO', 'SPECIFIC_LOT', 'STANDARD_COST'] as const);
      if (!vm.ok) return this.invalid(vm.detail);
      if (vm.value === 'STANDARD_COST') {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/valuation-method-unsupported',
            title: 'طريقة التقييم غير مدعومة',
            status: 400,
            detail: 'طريقة التكلفة المعيارية (STANDARD_COST) غير مدعومة حالياً. الطرق المدعومة: WEIGHTED_AVERAGE | FIFO | SPECIFIC_LOT.',
          },
        };
      }
      valuationMethod = vm.value;
    } else {
      // No method given: an existing item keeps its method; a NEW item takes the tenant default from the inventory settings
      const existingRes = await this.storage.getStockItem(tenantId, (itemData.id || itemData.itemCode) as string);
      if (existingRes.success && existingRes.data) {
        valuationMethod = existingRes.data.valuationMethod;
      } else {
        const st = await this.storage.getInventorySettings(tenantId);
        if (st.success && st.data) valuationMethod = st.data.defaultValuationMethod;
      }
    }

    const item: StockItem = {
      id: itemData.id || `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      tenantId,
      companyId: tenantId,
      itemCode: vCode.value,
      barcode: itemData.barcode,
      nameAr: vName.value,
      nameEn: itemData.nameEn,
      category: itemData.category,
      uom: itemData.uom || 'قطعة',
      inventoryAccountCode: itemData.inventoryAccountCode || '110301',
      cogsAccountCode: itemData.cogsAccountCode || '510101',
      adjustmentExpenseAccountCode: itemData.adjustmentExpenseAccountCode || '520101',
      adjustmentGainAccountCode: itemData.adjustmentGainAccountCode || '410101',
      valuationMethod,
      standardCost: money.standardCost ?? 0,
      averageCost: money.averageCost ?? 0,
      lastPurchaseCost: money.lastPurchaseCost ?? 0,
      sellingPrice: money.sellingPrice ?? 0,
      reorderPoint: Number(itemData.reorderPoint) || 0,
      minStockLevel: Number(itemData.minStockLevel) || 0,
      maxStockLevel: Number(itemData.maxStockLevel) || 1000,
      trackBatch: Boolean(itemData.trackBatch),
      trackSerial: Boolean(itemData.trackSerial),
      isActive: itemData.isActive !== undefined ? itemData.isActive : true,
      createdAt: itemData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.storage.saveStockItem(tenantId, item, idempotencyKey);
  }

  public async getStockItem(tenantId: string, itemId: string): Promise<ServiceResult<StockItem | null>> {
    return this.storage.getStockItem(tenantId, itemId);
  }

  public async listStockItems(
    tenantId: string,
    filter?: { category?: string; isActive?: boolean }
  ): Promise<ServiceResult<StockItem[]>> {
    return this.storage.listStockItems(tenantId, filter);
  }

  public async getWarehouseStock(
    tenantId: string,
    warehouseId: string,
    itemId: string
  ): Promise<ServiceResult<WarehouseStock | null>> {
    return this.storage.getWarehouseStock(tenantId, warehouseId, itemId);
  }

  public async listWarehouseStock(
    tenantId: string,
    warehouseId?: string,
    itemId?: string
  ): Promise<ServiceResult<WarehouseStock[]>> {
    return this.storage.listWarehouseStock(tenantId, warehouseId, itemId);
  }

  // ============================================================================
  // 7B: Stock Movements & Documents (إضافة وصرف متعدد البنود وتقييم فوري بالمتوسط المرجح)
  // ============================================================================

  public async receiveStock(tenantId: string, input: ReceiveStockInput): Promise<ServiceResult<StockDocument>> {
    const idempotencyKey = input.idempotencyKey || input.header?.idempotencyKey;
    if (idempotencyKey) {
      const cached = await this.storage.checkIdempotencyRecord(tenantId, idempotencyKey, 'receiveStock');
      if (cached.success && cached.data) {
        return { success: true, data: cached.data };
      }
    }

    const warehouseId = input.warehouseId || input.header?.warehouseId;
    if (!warehouseId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-warehouse',
          title: 'المستودع مطلوب',
          status: 400,
          detail: 'يجب تحديد المستودع المستلم.',
        },
      };
    }

    let lines: StockLineItemInput[] = [];
    if (input.lines && input.lines.length > 0) {
      lines = input.lines;
    } else if (input.itemId) {
      console.warn('WARN [ADR-011/Phase7.6]: مسار توافقي فردي (single itemId) مستخدم في receiveStock — يرجى استخدام مصفوفة lines[] المتعددة.');
      lines = [
        {
          itemId: input.itemId,
          quantity: input.quantity || 0,
          unitCost: input.unitCost,
          batchNumber: input.batchNumber,
          serialNumber: input.serialNumber,
          expiryDate: input.expiryDate,
          notes: input.notes,
        },
      ];
    }

    if (lines.length === 0) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/empty-lines',
          title: 'أسطر التوريد فارغة',
          status: 400,
          detail: 'يجب أن يحتوي إذن التوريد على صنف واحد على الأقل.',
        },
      };
    }

    // Phase 9: validate + normalize every line (and the notes) BEFORE any lookup, number generation or write
    const normReceipt = this.normalizeLines(lines, [input.notes, input.header?.notes], { cost: true, expiry: true });
    if (!normReceipt.ok) return this.invalid(normReceipt.detail);
    lines = normReceipt.lines;

    // Validate warehouse
    const whRes = await this.storage.getWarehouse(tenantId, warehouseId);
    if (!whRes.success || !whRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/warehouse-not-found',
          title: 'المستودع غير موجود',
          status: 404,
          detail: 'تعذر العثور على المستودع المحدد.',
        },
      };
    }
    const warehouse = whRes.data;

    // Validate all items exist and quantities > 0 (Atomic validation)
    const resolvedItems: Array<{ item: StockItem; line: StockLineItemInput }> = [];
    for (const line of lines) {
      const itemRes = await this.storage.getStockItem(tenantId, line.itemId);
      if (!itemRes.success || !itemRes.data) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/item-not-found',
            title: 'الصنف غير موجود',
            status: 404,
            detail: `تعذر العثور على الصنف ${line.itemId} في دليل الأصناف.`,
          },
        };
      }
      resolvedItems.push({ item: itemRes.data, line });
    }

    const finalIdempotencyKey = idempotencyKey || input.header?.idempotencyKey || `rec-${Date.now()}`;
    const performedBy = input.performedBy || input.header?.performedBy || 'system';
    const performedByName = input.performedByName || input.header?.performedByName || 'أمين المستودع';
    const sourceDocType = input.sourceDocumentType || input.header?.sourceDocumentType || 'PURCHASE_INVOICE';
    const sourceDocId = input.sourceDocumentId || input.header?.sourceDocumentId;
    const sourceDocNumber = input.sourceDocumentNumber || input.header?.sourceDocumentNumber;
    const generalNotes = input.notes || input.header?.notes;

    // Generate atomic document number for the entire receipt
    const seqRes = await this.numberingEngine.generateNumber(tenantId, 'STK-REC', 'REC', finalIdempotencyKey);
    const documentNumber = seqRes.success && seqRes.data ? seqRes.data.formattedCode : `REC-${Date.now()}`;
    const docId = `sdoc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    const docLines: StockDocumentLine[] = [];
    const movements: StockMovement[] = [];
    const batchesToSave: ItemBatch[] = [];
    const serialsToSave: ItemSerial[] = [];
    let totalQuantity = 0;
    let totalCost = 0;

    for (let idx = 0; idx < resolvedItems.length; idx++) {
      const { item, line } = resolvedItems[idx];
      const unitCost = line.unitCost !== undefined ? Number(line.unitCost) : item.lastPurchaseCost || item.standardCost || 0;
      const lineTotalCost = Math.round(line.quantity * unitCost * 100) / 100;
      totalQuantity += line.quantity;
      totalCost += lineTotalCost;

      const lineId = `sline-${Date.now()}-${idx}`;
      docLines.push({
        id: lineId,
        tenantId,
        companyId: tenantId,
        documentId: docId,
        lineNumber: idx + 1,
        itemId: item.id,
        itemCode: item.itemCode,
        itemNameAr: item.nameAr,
        uom: line.uom || item.uom || 'قطعة',
        quantity: line.quantity,
        unitCost,
        totalCost: lineTotalCost,
        batchNumber: line.batchNumber,
        serialNumber: line.serialNumber,
        expiryDate: line.expiryDate,
        notes: line.notes,
      });

      const movement: StockMovement = {
        id: `mov-${Date.now()}-${idx}`,
        tenantId,
        companyId: tenantId,
        movementNumber: `${documentNumber}-${idx + 1}`,
        movementType: 'RECEIPT',
        sourcePoNumber: line.sourcePoNumber || (sourceDocType === 'PURCHASE_ORDER' ? sourceDocNumber : undefined),
        warehouseId,
        warehouseNameAr: warehouse.nameAr,
        itemId: item.id,
        itemCode: item.itemCode,
        itemNameAr: item.nameAr,
        quantity: line.quantity,
        unitCost,
        totalCost: lineTotalCost,
        balanceAfterQty: 0,
        sourceDocumentType: sourceDocType,
        sourceDocumentId: docId,
        sourceDocumentNumber: documentNumber,
        batchNumber: line.batchNumber,
        serialNumber: line.serialNumber,
        notes: line.notes || generalNotes,
        performedBy,
        performedByName,
        timestamp: new Date().toISOString(),
        idempotencyKey: `${finalIdempotencyKey}-line-${idx}`,
      };

      movements.push(movement);

      // Track Batch if provided (saved in the SAME transaction as the document — Phase 10)
      if (item.trackBatch && line.batchNumber) {
        batchesToSave.push({
          id: `batch-${item.id}-${line.batchNumber}`,
          tenantId,
          companyId: tenantId,
          itemId: item.id,
          warehouseId,
          batchNumber: line.batchNumber,
          currentQty: line.quantity,
          unitCost,
          expiryDate: line.expiryDate,
          createdAt: new Date().toISOString(),
        });
      }

      // Track Serial if provided
      if (item.trackSerial && line.serialNumber) {
        serialsToSave.push({
          id: `ser-${item.id}-${line.serialNumber}`,
          tenantId,
          companyId: tenantId,
          itemId: item.id,
          warehouseId,
          serialNumber: line.serialNumber,
          status: 'IN_STOCK',
          createdAt: new Date().toISOString(),
        });
      }
    }

    const stockDoc: StockDocument & Record<string, any> = {
      id: docId,
      tenantId,
      companyId: tenantId,
      documentNumber,
      documentType: 'RECEIPT',
      warehouseId,
      warehouseNameAr: warehouse.nameAr,
      status: 'POSTED',
      totalQuantity,
      totalCost,
      referenceType: sourceDocType,
      referenceId: sourceDocId,
      referenceNumber: sourceDocNumber,
      notes: generalNotes,
      lines: docLines,
      movements,
      performedBy,
      performedByName,
      idempotencyKey: finalIdempotencyKey,
      createdAt: new Date().toISOString(),
      postedAt: new Date().toISOString(),
      // Backward compatibility fields for legacy tests/code
      movementNumber: documentNumber,
      quantity: totalQuantity,
      itemId: docLines[0]?.itemId,
      unitCost: docLines[0]?.unitCost,
    };

    // Phase 10 (STK-ATOMIC-001): movements + document + batches + serials in ONE transaction. The only result is the one returned
    // by the storage layer (no more "success" when saving the document failed).
    const postRes = await this.storage.postStockDocumentAtomic(
      tenantId,
      { doc: stockDoc, movements, batches: batchesToSave, serials: serialsToSave },
      finalIdempotencyKey
    );
    if (!postRes.success || !postRes.data) return postRes as any;
    const finalDoc = postRes.data;
    if (finalIdempotencyKey) {
      await this.storage.saveIdempotencyRecord(tenantId, finalIdempotencyKey, 'receiveStock', finalDoc);
    }
    return { success: true, data: finalDoc };
  }

  public async issueStock(tenantId: string, input: IssueStockInput): Promise<ServiceResult<StockDocument>> {
    const idempotencyKey = input.idempotencyKey || input.header?.idempotencyKey;
    if (idempotencyKey) {
      const cached = await this.storage.checkIdempotencyRecord(tenantId, idempotencyKey, 'issueStock');
      if (cached.success && cached.data) {
        return { success: true, data: cached.data };
      }
    }

    const warehouseId = input.warehouseId || input.header?.warehouseId;
    if (!warehouseId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-warehouse',
          title: 'المستودع مطلوب',
          status: 400,
          detail: 'يجب تحديد المستودع المراد الصرف منه.',
        },
      };
    }

    let lines: StockLineItemInput[] = [];
    if (input.lines && input.lines.length > 0) {
      lines = input.lines;
    } else if (input.itemId) {
      console.warn('WARN [ADR-011/Phase7.6]: مسار توافقي فردي (single itemId) مستخدم في issueStock — يرجى استخدام مصفوفة lines[] المتعددة.');
      lines = [
        {
          itemId: input.itemId,
          quantity: input.quantity || 0,
          batchNumber: input.batchNumber,
          serialNumber: input.serialNumber,
          notes: input.notes,
        },
      ];
    }

    if (lines.length === 0) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/empty-lines',
          title: 'أسطر الصرف فارغة',
          status: 400,
          detail: 'يجب أن يحتوي إذن الصرف على صنف واحد على الأقل.',
        },
      };
    }

    // Phase 9: validate + normalize every line (and the notes) BEFORE any lookup, number generation or write
    const normIssue = this.normalizeLines(lines, [input.notes, input.header?.notes], {});
    if (!normIssue.ok) return this.invalid(normIssue.detail);
    lines = normIssue.lines;

    const whRes = await this.storage.getWarehouse(tenantId, warehouseId);
    if (!whRes.success || !whRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/warehouse-not-found',
          title: 'المستودع غير موجود',
          status: 404,
          detail: 'تعذر العثور على المستودع المحدد.',
        },
      };
    }
    const warehouse = whRes.data;

    // ATOMIC VALIDATION: Check that ALL items exist AND have sufficient stock.
    // If ANY item has insufficient stock, fail immediately before ANY modification.
    // Phase 13 (COST-001): allow_negative_stock from the tenant settings (default false)
    const invSettings = await this.storage.getInventorySettings(tenantId);
    const allowNegative = invSettings.success && !!invSettings.data?.allowNegativeStock;
    const resolvedItems: Array<{ item: StockItem; line: StockLineItemInput; availableQty: number; avgCost: number }> = [];
    for (const line of lines) {
      const itemRes = await this.storage.getStockItem(tenantId, line.itemId);
      if (!itemRes.success || !itemRes.data) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/item-not-found',
            title: 'الصنف غير موجود',
            status: 404,
            detail: `تعذر العثور على الصنف ${line.itemId} في دليل الأصناف.`,
          },
        };
      }
      const item = itemRes.data;
      const stockRes = await this.storage.getWarehouseStock(tenantId, warehouseId, line.itemId);
      const availableQty = stockRes.success && stockRes.data ? stockRes.data.availableQty : 0;
      const avgCost = stockRes.success && stockRes.data ? stockRes.data.averageCost : item.averageCost;

      if (availableQty < line.quantity && !allowNegative) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/insufficient-stock',
            title: 'الرصيد المخزني غير كافٍ',
            status: 400,
            detail: `الرصيد المتاح للصنف ${item.nameAr} (${availableQty}) أقل من الكمية المطلوبة للصرف (${line.quantity}). فشلت العملية بالكامل ذرياً.`,
          },
        };
      }

      resolvedItems.push({ item, line, availableQty, avgCost });
    }

    const finalIdempotencyKey = idempotencyKey || input.header?.idempotencyKey || `iss-${Date.now()}`;
    const performedBy = input.performedBy || input.header?.performedBy || 'system';
    const performedByName = input.performedByName || input.header?.performedByName || 'أمين المستودع';
    const sourceDocType = input.sourceDocumentType || input.header?.sourceDocumentType || 'SALES_DELIVERY';
    const sourceDocId = input.sourceDocumentId || input.header?.sourceDocumentId;
    const sourceDocNumber = input.sourceDocumentNumber || input.header?.sourceDocumentNumber;
    const generalNotes = input.notes || input.header?.notes;

    // Generate atomic numbering for the issue document
    const seqRes = await this.numberingEngine.generateNumber(tenantId, 'STK-ISS', 'ISS', finalIdempotencyKey);
    const documentNumber = seqRes.success && seqRes.data ? seqRes.data.formattedCode : `ISS-${Date.now()}`;
    const docId = `sdoc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    const docLines: StockDocumentLine[] = [];
    const movements: StockMovement[] = [];
    const reorderAlerts: Array<{ id: string; entities: string[]; summaryAr: string }> = [];
    let totalQuantity = 0;
    let totalCost = 0;

    for (let idx = 0; idx < resolvedItems.length; idx++) {
      const { item, line, availableQty, avgCost } = resolvedItems[idx];
      const lineTotalCost = Math.round(line.quantity * avgCost * 100) / 100;
      totalQuantity += line.quantity;
      totalCost += lineTotalCost;

      const lineId = `sline-${Date.now()}-${idx}`;
      docLines.push({
        id: lineId,
        tenantId,
        companyId: tenantId,
        documentId: docId,
        lineNumber: idx + 1,
        itemId: item.id,
        itemCode: item.itemCode,
        itemNameAr: item.nameAr,
        uom: line.uom || item.uom || 'قطعة',
        quantity: line.quantity,
        unitCost: avgCost,
        totalCost: lineTotalCost,
        batchNumber: line.batchNumber,
        serialNumber: line.serialNumber,
        notes: line.notes,
      });

      const movement: StockMovement = {
        id: `mov-${Date.now()}-${idx}`,
        tenantId,
        companyId: tenantId,
        movementNumber: `${documentNumber}-${idx + 1}`,
        movementType: 'ISSUE',
        sourcePoNumber: line.sourcePoNumber,
        warehouseId,
        warehouseNameAr: warehouse.nameAr,
        itemId: item.id,
        itemCode: item.itemCode,
        itemNameAr: item.nameAr,
        quantity: line.quantity,
        unitCost: avgCost,
        totalCost: lineTotalCost,
        balanceAfterQty: availableQty - line.quantity,
        sourceDocumentType: sourceDocType,
        sourceDocumentId: docId,
        sourceDocumentNumber: documentNumber,
        batchNumber: line.batchNumber,
        serialNumber: line.serialNumber,
        notes: line.notes || generalNotes,
        performedBy,
        performedByName,
        timestamp: new Date().toISOString(),
        idempotencyKey: `${finalIdempotencyKey}-line-${idx}`,
      };

      movements.push(movement);

      // Reorder-point alerts are collected here and written only AFTER the atomic post succeeded (Phase 10)
      if ((availableQty - line.quantity) <= item.reorderPoint) {
        reorderAlerts.push({
          id: `reorder-${Date.now()}-${idx}`,
          entities: [`StockItem:${item.id}`, `Warehouse:${warehouseId}`],
          summaryAr: `تنبيه: وصل رصيد الصنف ${item.nameAr} في ${warehouse.nameAr} إلى حد إعادة الطلب (${availableQty - line.quantity} <= ${item.reorderPoint})`,
        });
      }
    }

    const stockDoc: StockDocument & Record<string, any> = {
      id: docId,
      tenantId,
      companyId: tenantId,
      documentNumber,
      documentType: 'ISSUE',
      warehouseId,
      warehouseNameAr: warehouse.nameAr,
      status: 'POSTED',
      totalQuantity,
      totalCost,
      referenceType: sourceDocType,
      referenceId: sourceDocId,
      referenceNumber: sourceDocNumber,
      notes: generalNotes,
      lines: docLines,
      movements,
      performedBy,
      performedByName,
      idempotencyKey: finalIdempotencyKey,
      createdAt: new Date().toISOString(),
      postedAt: new Date().toISOString(),
      // Backward compatibility fields
      movementNumber: documentNumber,
      quantity: totalQuantity,
      itemId: docLines[0]?.itemId,
      unitCost: docLines[0]?.unitCost,
    };

    // Phase 10: the early balance check above gives a fast message; the FINAL authority is the locked check inside the transaction
    const postRes = await this.storage.postStockDocumentAtomic(tenantId, { doc: stockDoc, movements, allowNegative }, finalIdempotencyKey);
    if (!postRes.success || !postRes.data) return postRes as any;
    const finalDoc = postRes.data;
    for (const alert of reorderAlerts) {
      await this.storage.appendSystemChangeLog({
        id: alert.id,
        timestamp: new Date().toISOString(),
        actor: performedBy,
        changeType: 'SECURITY',
        module: 'INVENTORY',
        entitiesAffected: alert.entities,
        summaryAr: alert.summaryAr,
        version: '1.0',
      });
    }
    if (finalIdempotencyKey) {
      await this.storage.saveIdempotencyRecord(tenantId, finalIdempotencyKey, 'issueStock', finalDoc);
    }
    return { success: true, data: finalDoc };
  }

  // ============================================================================
  // 7.6D: Stock Returns (مرتجعات التوريد والصرف المتعددة البنود مع قيد عكسي)
  // ============================================================================

  public async returnStock(tenantId: string, input: StockReturnInput): Promise<ServiceResult<StockDocument>> {
    if (!input.lines || input.lines.length === 0) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/empty-lines',
          title: 'الأسطر فارغة',
          status: 400,
          detail: 'يجب تحديد بند واحد على الأقل في مستند المرتجع.',
        },
      };
    }

    // Phase 9: validate and normalize every line (and the reason) before reading or writing anything
    const reasonCheck = this.optText(input.reason, 'سبب المرتجع (reason)', 2000, true);
    if (!reasonCheck.ok) return this.invalid(reasonCheck.detail);
    const normalizedReturnLines: StockReturnInput['lines'] = [];
    for (const rl of input.lines) {
      const norm = this.normalizeStockLine(rl, { cost: true });
      if (!norm.ok) return this.invalid(norm.detail);
      normalizedReturnLines.push(norm.line);
    }
    input = { ...input, lines: normalizedReturnLines };

    const origRes = await this.storage.getStockDocument(tenantId, input.originalDocumentId);
    if (!origRes.success || !origRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/document-not-found',
          title: 'المستند الأصلي غير موجود',
          status: 404,
          detail: 'تعذر العثور على مستند المخزون الأصلي المراد إرجاعه.',
        },
      };
    }
    const origDoc = origRes.data;

    // Validate quantities against original document
    for (const rLine of input.lines) {
      const matchOrig = origDoc.lines.find(l => l.itemId === rLine.itemId);
      if (!matchOrig) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/item-not-in-original',
            title: 'الصنف غير وارد بالأصل',
            status: 400,
            detail: `الصنف ${rLine.itemId} ليس جزءاً من المستند الأصلي ${origDoc.documentNumber}.`,
          },
        };
      }
      if (rLine.quantity > matchOrig.quantity) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/quantity-exceeds-original',
            title: 'الكمية تتجاوز الأصل',
            status: 400,
            detail: `الكمية المرتجعة (${rLine.quantity}) تتجاوز كمية المستند الأصلي (${matchOrig.quantity}).`,
          },
        };
      }
    }

    // If RETURN_RECEIPT (returning received goods back to supplier), check stock availability
    if (input.returnType === 'RETURN_RECEIPT') {
      for (const rLine of input.lines) {
        const stockRes = await this.storage.getWarehouseStock(tenantId, origDoc.warehouseId, rLine.itemId);
        const availableQty = stockRes.success && stockRes.data ? stockRes.data.availableQty : 0;
        if (availableQty < rLine.quantity) {
          return {
            success: false,
            error: {
              type: 'https://api.an-erp.local/errors/insufficient-stock',
              title: 'الرصيد غير كافٍ للإرجاع',
              status: 400,
              detail: `الرصيد المتاح حالياً بالمستودع (${availableQty}) لا يكفي لإرجاع كمية (${rLine.quantity}).`,
            },
          };
        }
      }
    }

    const prefix = input.returnType === 'RETURN_RECEIPT' ? 'RET-REC' : 'RET-ISS';
    const seqRes = await this.numberingEngine.generateNumber(tenantId, prefix, prefix, input.idempotencyKey);
    const docNumber = seqRes.success && seqRes.data ? seqRes.data.formattedCode : `${prefix}-${Date.now()}`;

    const docId = `sdoc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const docLines: StockDocumentLine[] = [];
    const movements: StockMovement[] = [];
    let totalQuantity = 0;
    let totalCost = 0;

    for (let idx = 0; idx < input.lines.length; idx++) {
      const rLine = input.lines[idx];
      const matchOrig = origDoc.lines.find(l => l.itemId === rLine.itemId)!;
      const unitCost = rLine.unitCost !== undefined ? rLine.unitCost : matchOrig.unitCost;
      const lineTotalCost = Math.round(rLine.quantity * unitCost * 100) / 100;
      totalQuantity += rLine.quantity;
      totalCost += lineTotalCost;

      const lineId = `sline-${Date.now()}-${idx}`;
      docLines.push({
        id: lineId,
        tenantId,
        companyId: origDoc.companyId,
        documentId: docId,
        lineNumber: idx + 1,
        itemId: rLine.itemId,
        itemCode: matchOrig.itemCode,
        itemNameAr: matchOrig.itemNameAr,
        uom: matchOrig.uom,
        quantity: rLine.quantity,
        unitCost,
        totalCost: lineTotalCost,
        notes: rLine.notes || input.reason,
      });

      const movementType: StockMovementType = input.returnType === 'RETURN_RECEIPT' ? 'ISSUE' : 'RECEIPT';
      const movement: StockMovement = {
        id: `mov-${Date.now()}-${idx}`,
        tenantId,
        companyId: origDoc.companyId,
        movementNumber: `${docNumber}-${idx + 1}`,
        movementType,
        warehouseId: origDoc.warehouseId,
        warehouseNameAr: origDoc.warehouseNameAr,
        itemId: rLine.itemId,
        itemCode: matchOrig.itemCode,
        itemNameAr: matchOrig.itemNameAr,
        quantity: rLine.quantity,
        unitCost,
        totalCost: lineTotalCost,
        balanceAfterQty: 0,
        sourceDocumentType: input.returnType,
        sourceDocumentId: docId,
        sourceDocumentNumber: docNumber,
        notes: input.reason || `مرتجع للمستند ${origDoc.documentNumber}`,
        performedBy: input.performedBy,
        performedByName: input.performedByName,
        timestamp: new Date().toISOString(),
        idempotencyKey: `${input.idempotencyKey}-${idx}`,
      };

      movements.push(movement);
    }

    const returnDoc: StockDocument = {
      id: docId,
      tenantId,
      companyId: origDoc.companyId,
      documentNumber: docNumber,
      documentType: input.returnType,
      warehouseId: origDoc.warehouseId,
      warehouseNameAr: origDoc.warehouseNameAr,
      status: 'POSTED',
      totalQuantity,
      totalCost,
      referenceType: origDoc.documentType,
      referenceId: origDoc.id,
      referenceNumber: origDoc.documentNumber,
      notes: input.reason || `مرتجع للمستند ${origDoc.documentNumber}`,
      lines: docLines,
      movements,
      performedBy: input.performedBy,
      performedByName: input.performedByName,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date().toISOString(),
      postedAt: new Date().toISOString(),
    };

    // Phase 10: atomic post. The cost stays AS PROVIDED (original document cost) so the reversal journal below keeps matching the
    // stock value exactly as before; only the document/movement/balance writes became all-or-nothing.
    const returnPost = await this.storage.postStockDocumentAtomic(tenantId, { doc: returnDoc, movements, useProvidedCost: true }, input.idempotencyKey);
    if (!returnPost.success || !returnPost.data) return returnPost as any;

    // Balanced Reversal Journal Entry via PostingEngine
    if (this.postingEngine && totalCost > 0) {
      const journalLines: JournalLine[] = [];
      if (input.returnType === 'RETURN_RECEIPT') {
        // Return to vendor: Debit Accounts Payable, Credit Inventory
        journalLines.push({
          id: `line-1-${docId}`,
          accountCode: '210101',
          debit: totalCost,
          credit: 0,
          description: `إثبات مرتجع مشتريات/توريد ${docNumber} للمستند ${origDoc.documentNumber}`,
        });
        journalLines.push({
          id: `line-2-${docId}`,
          accountCode: '110301',
          debit: 0,
          credit: totalCost,
          description: `تخفيض المخزون بموجب إذن مرتجع توريد ${docNumber}`,
        });
      } else {
        // Return from issue: Debit Inventory, Credit COGS
        journalLines.push({
          id: `line-1-${docId}`,
          accountCode: '110301',
          debit: totalCost,
          credit: 0,
          description: `إعادة إدخال المخزون بموجب مرتجع صرف ${docNumber}`,
        });
        journalLines.push({
          id: `line-2-${docId}`,
          accountCode: '510101',
          debit: 0,
          credit: totalCost,
          description: `تخفيض تكلفة المنصرف بموجب مرتجع صرف ${docNumber}`,
        });
      }

      const entryId = `je-ret-${docId}-${Date.now()}`;
      const draftRes = await this.postingEngine.draftEntry(
        tenantId,
        {
          id: entryId,
          code: `JE-${docNumber}`,
          tenantId,
          date: new Date().toISOString().split('T')[0],
          type: 'قيد تسوية مرتجع مخزني',
          description: `قيد تسوية مرتجع مخزني ${docNumber} - الأصل ${origDoc.documentNumber}`,
          lines: journalLines,
          totalAmount: totalCost,
          status: 'APPROVED',
          createdBy: input.performedBy,
        },
        `draft-${input.idempotencyKey}`
      );
      if (draftRes.success && draftRes.data) {
        await this.postingEngine.postEntry(tenantId, draftRes.data.id, `post-${input.idempotencyKey}`);
      }
    }

    return { success: true, data: returnPost.data };
  }

  // ============================================================================
  // 7.6E: Item Ledger / Stock Card (كارت الصنف وسجل الحركات المستمر)
  // ============================================================================

  public async getItemLedger(
    tenantId: string,
    itemId: string,
    filter?: { fromDate?: string; toDate?: string; warehouseId?: string }
  ): Promise<ServiceResult<ItemLedgerReport>> {
    const itemRes = await this.storage.getStockItem(tenantId, itemId);
    if (!itemRes.success || !itemRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/item-not-found',
          title: 'الصنف غير موجود',
          status: 404,
          detail: 'تعذر العثور على الصنف المطلوب لعرض كارت الصنف.',
        },
      };
    }
    const item = itemRes.data;

    const movRes = await this.storage.listStockMovements(tenantId, {
      itemId,
      warehouseId: filter?.warehouseId,
    });
    const allMovements = (movRes.success && movRes.data ? movRes.data : []).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let openingQty = 0;
    let openingTotalValue = 0;
    const entries: ItemLedgerEntry[] = [];
    let runningQty = 0;
    let runningTotalValue = 0;

    const fromTime = filter?.fromDate ? new Date(filter.fromDate).getTime() : 0;
    const toTime = filter?.toDate ? new Date(filter.toDate).getTime() : Infinity;

    for (const mov of allMovements) {
      const movTime = new Date(mov.timestamp).getTime();
      const isPositive =
        mov.movementType === 'RECEIPT' ||
        mov.movementType === 'TRANSFER_IN' ||
        mov.movementType === 'COUNT_ADJUSTMENT_GAIN';
      const qtyChange = isPositive ? mov.quantity : -mov.quantity;
      const valChange = isPositive
        ? mov.totalCost
        : -(mov.quantity * (runningQty > 0 ? runningTotalValue / runningQty : mov.unitCost));

      if (movTime < fromTime) {
        openingQty += qtyChange;
        openingTotalValue += valChange;
      } else if (movTime <= toTime) {
        const qtyIn = isPositive ? mov.quantity : 0;
        const qtyOut = !isPositive ? mov.quantity : 0;
        runningQty = (entries.length === 0 ? openingQty : runningQty) + qtyChange;
        runningTotalValue = (entries.length === 0 ? openingTotalValue : runningTotalValue) + valChange;
        const runningAvgCost =
          runningQty > 0 ? Math.round((runningTotalValue / runningQty) * 100) / 100 : mov.unitCost;

        entries.push({
          id: mov.id,
          timestamp: mov.timestamp,
          documentType: mov.sourceDocumentType || mov.movementType,
          documentNumber: mov.movementNumber,
          warehouseId: mov.warehouseId,
          warehouseNameAr: mov.warehouseNameAr,
          movementType: mov.movementType,
          quantityIn: qtyIn,
          quantityOut: qtyOut,
          unitCost: mov.unitCost,
          totalCost: mov.totalCost,
          runningQuantity: runningQty,
          runningAverageCost: runningAvgCost,
          runningTotalValue: Math.round(runningTotalValue * 100) / 100,
          batchNumber: mov.batchNumber,
          notes: mov.notes,
          performedByName: mov.performedByName,
        });
      }
    }

    if (entries.length === 0) {
      runningQty = openingQty;
      runningTotalValue = openingTotalValue;
    }

    const openingAvgCost = openingQty > 0 ? Math.round((openingTotalValue / openingQty) * 100) / 100 : item.averageCost;
    const closingQty = runningQty;
    const closingAvgCost = closingQty > 0 ? Math.round((runningTotalValue / closingQty) * 100) / 100 : item.averageCost;
    const closingTotalValue = Math.round(runningTotalValue * 100) / 100;

    return {
      success: true,
      data: {
        itemId: item.id,
        itemCode: item.itemCode,
        itemNameAr: item.nameAr,
        uom: item.uom,
        openingQty,
        openingAvgCost,
        openingTotalValue: Math.round(openingTotalValue * 100) / 100,
        entries,
        closingQty,
        closingAvgCost,
        closingTotalValue,
      },
    };
  }

  // ============================================================================
  // 7.6F: Price Lists & Barcodes (قوائم الأسعار والباركود)
  // ============================================================================

  public async saveItemPrice(tenantId: string, price: ItemPrice): Promise<ServiceResult<ItemPrice>> {
    return this.storage.saveItemPrice(tenantId, price);
  }

  public async getItemPrices(tenantId: string, itemId: string): Promise<ServiceResult<ItemPrice[]>> {
    return this.storage.getItemPrices(tenantId, itemId);
  }

  public generateBarcodeSvg(barcodeValue: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="70" viewBox="0 0 220 70">
      <rect width="220" height="70" fill="#ffffff" />
      <g fill="#0f172a">
        <rect x="15" y="10" width="3" height="40" />
        <rect x="21" y="10" width="2" height="40" />
        <rect x="26" y="10" width="4" height="40" />
        <rect x="33" y="10" width="2" height="40" />
        <rect x="38" y="10" width="3" height="40" />
        <rect x="44" y="10" width="5" height="40" />
        <rect x="52" y="10" width="2" height="40" />
        <rect x="57" y="10" width="4" height="40" />
        <rect x="64" y="10" width="3" height="40" />
        <rect x="70" y="10" width="2" height="40" />
        <rect x="75" y="10" width="5" height="40" />
        <rect x="83" y="10" width="2" height="40" />
        <rect x="88" y="10" width="3" height="40" />
        <rect x="94" y="10" width="4" height="40" />
        <rect x="101" y="10" width="2" height="40" />
        <rect x="106" y="10" width="5" height="40" />
        <rect x="114" y="10" width="3" height="40" />
        <rect x="120" y="10" width="2" height="40" />
        <rect x="125" y="10" width="4" height="40" />
        <rect x="132" y="10" width="3" height="40" />
        <rect x="138" y="10" width="2" height="40" />
        <rect x="143" y="10" width="5" height="40" />
        <rect x="151" y="10" width="2" height="40" />
        <rect x="156" y="10" width="4" height="40" />
        <rect x="163" y="10" width="3" height="40" />
        <rect x="169" y="10" width="2" height="40" />
        <rect x="174" y="10" width="4" height="40" />
        <rect x="181" y="10" width="3" height="40" />
        <rect x="187" y="10" width="2" height="40" />
        <rect x="192" y="10" width="4" height="40" />
        <rect x="199" y="10" width="3" height="40" />
      </g>
      <text x="110" y="62" text-anchor="middle" font-family="monospace" font-size="12" fill="#334155">${barcodeValue}</text>
    </svg>`;
  }

  public async searchItemsByBarcode(tenantId: string, barcodeOrCode: string): Promise<ServiceResult<StockItem[]>> {
    const allItemsRes = await this.storage.listStockItems(tenantId);
    if (!allItemsRes.success || !allItemsRes.data) return allItemsRes;
    const q = barcodeOrCode.trim().toLowerCase();
    const matched = allItemsRes.data.filter(
      item =>
        (item.barcode && item.barcode.toLowerCase() === q) ||
        item.itemCode.toLowerCase() === q ||
        item.id.toLowerCase() === q
    );
    return { success: true, data: matched };
  }

  // ============================================================================
  // 7.6G: Document Attachments (المرفقات على مستندات المخزون)
  // ============================================================================

  public async addDocumentAttachment(
    tenantId: string,
    attachment: DocumentAttachment
  ): Promise<ServiceResult<DocumentAttachment>> {
    return this.storage.saveDocumentAttachment(tenantId, attachment);
  }

  public async listDocumentAttachments(
    tenantId: string,
    documentType: string,
    documentId: string
  ): Promise<ServiceResult<DocumentAttachment[]>> {
    return this.storage.listDocumentAttachments(tenantId, documentType, documentId);
  }

  // ============================================================================
  // 7A: Transfers Between Warehouses (التحويل بين المستودعات)
  // ============================================================================

  public async createTransfer(tenantId: string, input: CreateTransferInput): Promise<ServiceResult<StockTransfer>> {
    if (input.sourceWarehouseId === input.targetWarehouseId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-transfer-warehouses',
          title: 'مستودع المصدر والهدف متطابقان',
          status: 400,
          detail: 'لا يمكن التحويل من وإلى نفس المستودع.',
        },
      };
    }

    if (!input.lines || input.lines.length === 0) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/empty-transfer',
          title: 'مستند التحويل فارغ',
          status: 400,
          detail: 'يجب إضافة صنف واحد على الأقل للتحويل.',
        },
      };
    }
    const transferNotes = this.optText(input.notes, 'ملاحظات التحويل (notes)', 2000, true);
    if (!transferNotes.ok) return this.invalid(transferNotes.detail);

    const srcWhRes = await this.storage.getWarehouse(tenantId, input.sourceWarehouseId);
    const tgtWhRes = await this.storage.getWarehouse(tenantId, input.targetWarehouseId);
    if (!srcWhRes.success || !srcWhRes.data || !tgtWhRes.success || !tgtWhRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/warehouse-not-found',
          title: 'أحد المستودعات غير موجود',
          status: 404,
          detail: 'يرجى التحقق من صحة مستودع المصدر ومستودع الهدف.',
        },
      };
    }

    // Verify stock availability for each item in source warehouse
    const linesToSave: StockTransferLine[] = [];
    let totalCost = 0;
    let totalQuantity = 0;

    const transferId = `tr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    for (const lRaw of input.lines) {
      const norm = this.normalizeStockLine(lRaw);
      if (!norm.ok) return this.invalid(norm.detail);
      const l = norm.line;

      const itemRes = await this.storage.getStockItem(tenantId, l.itemId);
      if (!itemRes.success || !itemRes.data) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/item-not-found',
            title: 'أحد الأصناف غير موجود',
            status: 404,
            detail: `تعذر العثور على الصنف برقم ${l.itemId}.`,
          },
        };
      }
      const item = itemRes.data;

      const stockRes = await this.storage.getWarehouseStock(tenantId, input.sourceWarehouseId, l.itemId);
      const available = stockRes.success && stockRes.data ? stockRes.data.availableQty : 0;
      const unitCost = stockRes.success && stockRes.data ? stockRes.data.averageCost : item.averageCost;

      if (available < l.quantity) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/insufficient-transfer-stock',
            title: 'رصيد مستودع المصدر غير كافٍ',
            status: 400,
            detail: `رصيد الصنف "${item.nameAr}" في مستودع المصدر (${available}) لا يغطي كمية التحويل (${l.quantity}).`,
          },
        };
      }

      const lineTotal = Math.round(l.quantity * unitCost * 100) / 100;
      totalCost += lineTotal;
      totalQuantity += l.quantity;

      linesToSave.push({
        id: `trl-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        tenantId,
        companyId: tenantId,
        transferId,
        itemId: item.id,
        itemCode: item.itemCode,
        itemNameAr: item.nameAr,
        quantity: l.quantity,
        unitCost,
        totalCost: lineTotal,
        batchNumber: l.batchNumber,
        serialNumber: l.serialNumber,
      });
    }

    // NumberingEngine atomic generation
    const numRes = await this.numberingEngine.generateNumber(tenantId, 'STK-TRF', 'TRF', input.idempotencyKey || `trf-${Date.now()}`);
    const transferNumber = numRes.success && numRes.data ? numRes.data.formattedCode : `TRF-${Date.now()}`;

    const transfer: StockTransfer = {
      id: transferId,
      tenantId,
      companyId: tenantId,
      transferNumber,
      sourceWarehouseId: input.sourceWarehouseId,
      sourceWarehouseNameAr: srcWhRes.data.nameAr,
      targetWarehouseId: input.targetWarehouseId,
      targetWarehouseNameAr: tgtWhRes.data.nameAr,
      status: 'IN_TRANSIT',
      requestedBy: input.requestedBy,
      requestedByName: input.requestedByName,
      requestedAt: new Date().toISOString(),
      dispatchedBy: input.requestedBy,
      dispatchedByName: input.requestedByName,
      dispatchedAt: new Date().toISOString(),
      totalItemsCount: linesToSave.length,
      totalQuantity,
      totalCost: Math.round(totalCost * 100) / 100,
      notes: input.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey,
    };

    // Phase 11 (STK-ATOMIC-002): deduction from the source + the transfer document are ONE transaction.
    // The value that leaves the source is the locked weighted average, and it is stored on the lines/total of the document.
    const posted = await this.storage.postStockTransferAtomic(
      tenantId,
      { mode: 'DISPATCH', transfer, lines: linesToSave, actorId: input.requestedBy, actorName: input.requestedByName },
      input.idempotencyKey
    );
    return posted;
  }

  public async receiveTransfer(
    tenantId: string,
    transferId: string,
    actorId: string,
    actorName: string,
    idempotencyKey: string
  ): Promise<ServiceResult<StockTransfer>> {
    const existing = await this.storage.getStockTransfer(tenantId, transferId);
    if (!existing.success || !existing.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/transfer-not-found',
          title: 'مستند التحويل غير موجود',
          status: 404,
          detail: 'تعذر العثور على مستند التحويل المطلوب استلامه.',
        },
      };
    }

    const { transfer } = existing.data;
    // Phase 11: the status check, the movements and the status change happen under one row lock inside the transaction
    // (an already-received document answers 409 invalid-transfer-status from there).
    return this.storage.postStockTransferAtomic(
      tenantId,
      { mode: 'RECEIVE', transfer, lines: [], actorId, actorName },
      idempotencyKey
    );
  }

  public async getStockTransfer(
    tenantId: string,
    transferId: string
  ): Promise<ServiceResult<{ transfer: StockTransfer; lines: StockTransferLine[] } | null>> {
    return this.storage.getStockTransfer(tenantId, transferId);
  }

  public async listStockTransfers(
    tenantId: string,
    filter?: { status?: string; warehouseId?: string }
  ): Promise<ServiceResult<StockTransfer[]>> {
    return this.storage.listStockTransfers(tenantId, filter);
  }

  // ============================================================================
  // 7C: Inventory Count & Variances (الجرد الفعلي، احتساب الفروقات، والتسوية القيودية)
  // ============================================================================

  public async createStockCount(tenantId: string, input: CreateStockCountInput): Promise<ServiceResult<StockCount>> {
    if (!input.lines || input.lines.length === 0) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/empty-stock-count',
          title: 'قائمة الجرد فارغة',
          status: 400,
          detail: 'يجب إدراج صنف واحد على الأقل في محضر الجرد.',
        },
      };
    }
    const countNotes = this.optText(input.notes, 'ملاحظات الجرد (notes)', 2000, true);
    if (!countNotes.ok) return this.invalid(countNotes.detail);

    const whRes = await this.storage.getWarehouse(tenantId, input.warehouseId);
    if (!whRes.success || !whRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/warehouse-not-found',
          title: 'المستودع غير موجود',
          status: 404,
          detail: 'تعذر العثور على المستودع المحدد للجرد.',
        },
      };
    }
    const warehouse = whRes.data;

    const countId = `cnt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    const linesToSave: StockCountLine[] = [];
    let netVarianceAmount = 0;
    let hasVariance = false;

    for (const lRaw of input.lines) {
      const cq = parseNonNegativeQuantity(lRaw.countedQty, `الكمية المعدودة (countedQty) للصنف ${lRaw.itemId}`);
      if (!cq.ok) return this.invalid(cq.detail);
      const ex = this.normalizeStockLine({ itemId: lRaw.itemId, quantity: 1, batchNumber: lRaw.batchNumber, serialNumber: lRaw.serialNumber, notes: lRaw.notes });
      if (!ex.ok) return this.invalid(ex.detail);
      const l = { ...lRaw, countedQty: cq.value, batchNumber: ex.line.batchNumber, serialNumber: ex.line.serialNumber, notes: ex.line.notes };
      const itemRes = await this.storage.getStockItem(tenantId, l.itemId);
      if (!itemRes.success || !itemRes.data) continue;
      const item = itemRes.data;

      const stockRes = await this.storage.getWarehouseStock(tenantId, input.warehouseId, l.itemId);
      const systemQty = stockRes.success && stockRes.data ? stockRes.data.currentQty : 0;
      const unitCost = stockRes.success && stockRes.data ? stockRes.data.averageCost : item.averageCost;

      const countedQty = l.countedQty;
      const varianceQty = countedQty - systemQty;
      const varianceAmount = Math.round(varianceQty * unitCost * 100) / 100;

      if (varianceQty !== 0) {
        hasVariance = true;
      }
      netVarianceAmount += varianceAmount;

      linesToSave.push({
        id: `cntl-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        tenantId,
        companyId: tenantId,
        countId,
        itemId: item.id,
        itemCode: item.itemCode,
        itemNameAr: item.nameAr,
        systemQty,
        countedQty,
        varianceQty,
        unitCost,
        varianceAmount,
        batchNumber: l.batchNumber,
        serialNumber: l.serialNumber,
        notes: l.notes,
      });
    }

    // NumberingEngine atomic generation
    const numRes = await this.numberingEngine.generateNumber(tenantId, 'STK-CNT', 'CNT', input.idempotencyKey || `cnt-${Date.now()}`);
    const countNumber = numRes.success && numRes.data ? numRes.data.formattedCode : `CNT-${Date.now()}`;

    const stockCount: StockCount = {
      id: countId,
      tenantId,
      companyId: tenantId,
      countNumber,
      countType: input.countType,
      warehouseId: input.warehouseId,
      warehouseNameAr: warehouse.nameAr,
      status: 'COMPLETED', // Ready for review and approval
      performedBy: input.performedBy,
      performedByName: input.performedByName,
      performedAt: new Date().toISOString(),
      totalItemsCount: linesToSave.length,
      hasVariance,
      netVarianceAmount: Math.round(netVarianceAmount * 100) / 100,
      notes: input.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey,
    };

    const saved = await this.storage.createStockCount(tenantId, stockCount, linesToSave, input.idempotencyKey);
    return saved;
  }

  /**
   * 7C: Approve & Post Stock Count Adjustments
   * Enforces strict Segregation of Duties (SoD) per Section 7 & 7.1:
   * The user who performed the physical count CANNOT approve or post the variance!
   */
  public async approveAndPostStockCount(
    tenantId: string,
    input: ApproveStockCountInput
  ): Promise<ServiceResult<StockCount>> {
    const countRes = await this.storage.getStockCount(tenantId, input.countId);
    if (!countRes.success || !countRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/count-not-found',
          title: 'عملية الجرد غير موجودة',
          status: 404,
          detail: 'تعذر العثور على محضر الجرد المحدد.',
        },
      };
    }

    const { count, lines } = countRes.data;

    // Strict SoD Enforcement (Section 7.1):
    if (count.performedBy === input.approvedBy) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/sod-violation',
          title: 'تعارض مصالح - فصل الصلاحيات والواجبات (SoD)',
          status: 403,
          detail: 'ممنوع نظامياً: لا يجوز لمن قام بتنفيذ الجرد المخزني فعلياً اعتماده أو تسوية فروقاته (SoD).',
        },
      };
    }

    if (count.status === 'POSTED') {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/already-posted',
          title: 'محضر الجرد مرحل مسبقاً',
          status: 400,
          detail: 'تم ترحيل وتسوية محضر الجرد هذا بالفعل ولا يمكن إعادة ترحيله.',
        },
      };
    }

    let journalEntryId: string | undefined;

    // If there is any variance, post a balanced journal entry via PostingEngine
    if (count.hasVariance && count.netVarianceAmount !== 0) {
      const journalLines: JournalLine[] = [];
      const absAmount = Math.abs(count.netVarianceAmount);

      if (count.netVarianceAmount < 0) {
        // Deficit (عجز مخزني):
        // Dr: 520101 (Inventory Adjustment Loss/Expense - مصروف عجز الجرد المخزني)
        // Cr: 110301 (Inventory Asset - مخزون البضاعة)
        journalLines.push(
          {
            id: `jl-${count.id}-1`,
            accountCode: '520101',
            debit: absAmount,
            credit: 0,
            description: `تسوية عجز جرد ${count.warehouseNameAr} بموجب المحضر ${count.countNumber}`,
          },
          {
            id: `jl-${count.id}-2`,
            accountCode: '110301',
            debit: 0,
            credit: absAmount,
            description: `تخفيض المخزون بالمستودع بموجب المحضر ${count.countNumber}`,
          }
        );
      } else {
        // Surplus (زيادة مخزنية):
        // Dr: 110301 (Inventory Asset - مخزون البضاعة)
        // Cr: 410101 (Inventory Gain - أرباح تسوية زيادة الجرد المخزني)
        journalLines.push(
          {
            id: `jl-${count.id}-1`,
            accountCode: '110301',
            debit: absAmount,
            credit: 0,
            description: `إثبات زيادة المخزون بموجب محضر الجرد ${count.countNumber}`,
          },
          {
            id: `jl-${count.id}-2`,
            accountCode: '410101',
            debit: 0,
            credit: absAmount,
            description: `إيرادات أرباح فروقات زيادة الجرد بموجب ${count.countNumber}`,
          }
        );
      }

      const entryId = `je-adj-${count.id}-${Date.now()}`;
      const journalEntry: JournalEntry = {
        id: entryId,
        code: `JE-ADJ-${count.countNumber}`,
        tenantId,
        date: new Date().toISOString().split('T')[0],
        type: 'قيد تسوية فروقات الجرد المخزني',
        description: `قيد آلي معتمد لتسوية محضر الجرد ${count.countNumber} بمستودع ${count.warehouseNameAr}`,
        lines: journalLines,
        totalAmount: absAmount,
        status: 'APPROVED',
        createdBy: input.approvedBy,
      };

      const draftRes = await this.postingEngine.draftEntry(tenantId, journalEntry, `${input.idempotencyKey}-draft`);
      if (!draftRes.success || !draftRes.data) {
        return {
          success: false,
          error: draftRes.error || {
            type: 'https://api.an-erp.local/errors/draft-failed',
            title: 'فشل إنشاء مسودة قيد تسوية الجرد',
            status: 500,
            detail: 'تعذر إنشاء مسودة القيد اليومي لفروقات الجرد عبر PostingEngine.',
          },
        };
      }

      const postRes = await this.postingEngine.postEntry(tenantId, draftRes.data.id, `${input.idempotencyKey}-post`);
      if (!postRes.success || !postRes.data) {
        return {
          success: false,
          error: postRes.error || {
            type: 'https://api.an-erp.local/errors/posting-failed',
            title: 'فشل ترحيل قيد تسوية الجرد',
            status: 500,
            detail: 'تعذر ترحيل قيد التسوية إلى دفتر الأستاذ العام.',
          },
        };
      }

      journalEntryId = postRes.data.id;
    }

    // Apply adjustments to stock movements & levels
    for (const line of lines) {
      if (line.varianceQty !== 0) {
        const movementType: StockMovementType =
          line.varianceQty > 0 ? 'COUNT_ADJUSTMENT_GAIN' : 'COUNT_ADJUSTMENT_LOSS';

        await this.storage.recordStockMovement(tenantId, {
          id: `mov-adj-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          tenantId,
          companyId: tenantId,
          movementNumber: `MOV-${count.countNumber}-${line.itemCode}`,
          movementType,
          warehouseId: count.warehouseId,
          warehouseNameAr: count.warehouseNameAr,
          itemId: line.itemId,
          itemCode: line.itemCode,
          itemNameAr: line.itemNameAr,
          quantity: Math.abs(line.varianceQty),
          unitCost: line.unitCost,
          totalCost: Math.abs(line.varianceAmount),
          balanceAfterQty: line.countedQty,
          sourceDocumentType: 'STOCK_COUNT',
          sourceDocumentId: count.id,
          sourceDocumentNumber: count.countNumber,
          journalEntryId,
          performedBy: input.approvedBy,
          performedByName: input.approvedByName,
          timestamp: new Date().toISOString(),
          idempotencyKey: `${input.idempotencyKey}-adj-${line.itemId}`,
        }, `${input.idempotencyKey}-adj-${line.itemId}`);
      }
    }

    const updatedCount = await this.storage.updateStockCountStatus(
      tenantId,
      input.countId,
      'POSTED',
      input.approvedBy,
      input.approvedByName,
      journalEntryId,
      input.idempotencyKey
    );

    return updatedCount;
  }

  public async getStockCount(
    tenantId: string,
    countId: string
  ): Promise<ServiceResult<{ count: StockCount; lines: StockCountLine[] } | null>> {
    return this.storage.getStockCount(tenantId, countId);
  }

  public async listStockCounts(
    tenantId: string,
    filter?: { warehouseId?: string; status?: string }
  ): Promise<ServiceResult<StockCount[]>> {
    return this.storage.listStockCounts(tenantId, filter);
  }

  public async listStockMovements(
    tenantId: string,
    filter?: { warehouseId?: string; itemId?: string; movementType?: string; limit?: number }
  ): Promise<ServiceResult<StockMovement[]>> {
    return this.storage.listStockMovements(tenantId, filter);
  }
}
