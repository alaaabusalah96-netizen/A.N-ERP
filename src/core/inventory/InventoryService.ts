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
} from '../storage/StoragePort';
import { PostingEngine } from '../engines/PostingEngine';
import { NumberingEngine } from '../engines/NumberingEngine';

export interface StockLineItemInput {
  itemId: string;
  quantity: number;
  uom?: string;
  unitCost?: number;
  batchNumber?: string;
  serialNumber?: string;
  expiryDate?: string;
  notes?: string;
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

    const item: StockItem = {
      id: itemData.id || `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      tenantId,
      companyId: tenantId,
      itemCode: itemData.itemCode,
      barcode: itemData.barcode,
      nameAr: itemData.nameAr,
      nameEn: itemData.nameEn,
      category: itemData.category,
      uom: itemData.uom || 'قطعة',
      inventoryAccountCode: itemData.inventoryAccountCode || '110301',
      cogsAccountCode: itemData.cogsAccountCode || '510101',
      adjustmentExpenseAccountCode: itemData.adjustmentExpenseAccountCode || '520101',
      adjustmentGainAccountCode: itemData.adjustmentGainAccountCode || '410101',
      valuationMethod: itemData.valuationMethod || 'WEIGHTED_AVERAGE',
      standardCost: Number(itemData.standardCost) || 0,
      averageCost: Number(itemData.averageCost) || 0,
      lastPurchaseCost: Number(itemData.lastPurchaseCost) || 0,
      sellingPrice: Number(itemData.sellingPrice) || 0,
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
      if (line.quantity <= 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/invalid-quantity',
            title: 'كمية التوريد غير صحيحة',
            status: 400,
            detail: `الكمية للصنف ${line.itemId} يجب أن تكون أكبر من صفر.`,
          },
        };
      }
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
        idempotencyKey: `${idempotencyKey}-line-${idx}`,
      };

      const movRes = await this.storage.recordStockMovement(tenantId, movement, `${idempotencyKey}-line-${idx}`);
      if (!movRes.success) return movRes as any;
      movements.push(movement);

      // Track Batch if provided
      if (item.trackBatch && line.batchNumber) {
        await this.storage.saveItemBatch(tenantId, {
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
        await this.storage.saveItemSerial(tenantId, {
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

    const saveRes = await this.storage.saveStockDocument(tenantId, stockDoc, finalIdempotencyKey);
    const finalDoc = (saveRes.success && saveRes.data) ? saveRes.data : stockDoc;
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
    const resolvedItems: Array<{ item: StockItem; line: StockLineItemInput; availableQty: number; avgCost: number }> = [];
    for (const line of lines) {
      if (line.quantity <= 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/invalid-quantity',
            title: 'كمية الصرف غير صحيحة',
            status: 400,
            detail: `الكمية للصنف ${line.itemId} يجب أن تكون أكبر من صفر.`,
          },
        };
      }
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

      if (availableQty < line.quantity) {
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

      const movRes = await this.storage.recordStockMovement(tenantId, movement, `${finalIdempotencyKey}-line-${idx}`);
      if (!movRes.success) return movRes as any;
      movements.push(movement);

      // Check reorder point
      if ((availableQty - line.quantity) <= item.reorderPoint) {
        await this.storage.appendSystemChangeLog({
          id: `reorder-${Date.now()}-${idx}`,
          timestamp: new Date().toISOString(),
          actor: performedBy,
          changeType: 'SECURITY',
          module: 'INVENTORY',
          entitiesAffected: [`StockItem:${item.id}`, `Warehouse:${warehouseId}`],
          summaryAr: `تنبيه: وصل رصيد الصنف ${item.nameAr} في ${warehouse.nameAr} إلى حد إعادة الطلب (${availableQty - line.quantity} <= ${item.reorderPoint})`,
          version: '1.0',
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

    const saveRes = await this.storage.saveStockDocument(tenantId, stockDoc, finalIdempotencyKey);
    const finalDoc = (saveRes.success && saveRes.data) ? saveRes.data : stockDoc;
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
      if (rLine.quantity <= 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/invalid-quantity',
            title: 'كمية المرتجع غير صحيحة',
            status: 400,
            detail: `الكمية المرتجعة للصنف ${rLine.itemId} يجب أن تكون أكبر من صفر.`,
          },
        };
      }
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

      const movRes = await this.storage.recordStockMovement(tenantId, movement, `${input.idempotencyKey}-${idx}`);
      if (!movRes.success) {
        return movRes as any;
      }
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

    await this.storage.saveStockDocument(tenantId, returnDoc, input.idempotencyKey);

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

    return { success: true, data: returnDoc };
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

    for (const l of input.lines) {
      if (l.quantity <= 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/invalid-line-quantity',
            title: 'كمية التحويل غير صحيحة',
            status: 400,
            detail: 'يجب أن تكون كمية جميع الأصناف المحولة أكبر من صفر.',
          },
        };
      }

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

    // Deduct stock from source warehouse immediately upon dispatch
    for (const l of linesToSave) {
      await this.storage.recordStockMovement(tenantId, {
        id: `mov-trf-out-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        tenantId,
        companyId: tenantId,
        movementNumber: `MOV-${transferNumber}-OUT`,
        movementType: 'TRANSFER_OUT',
        warehouseId: input.sourceWarehouseId,
        warehouseNameAr: srcWhRes.data.nameAr,
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemNameAr: l.itemNameAr,
        quantity: l.quantity,
        unitCost: l.unitCost,
        totalCost: l.totalCost,
        balanceAfterQty: 0,
        sourceDocumentType: 'STOCK_TRANSFER',
        sourceDocumentId: transferId,
        sourceDocumentNumber: transferNumber,
        performedBy: input.requestedBy,
        performedByName: input.requestedByName,
        timestamp: new Date().toISOString(),
        idempotencyKey: `${input.idempotencyKey}-line-${l.itemId}`,
      }, `${input.idempotencyKey}-line-${l.itemId}`);
    }

    const savedTransfer = await this.storage.createStockTransfer(tenantId, transfer, linesToSave, input.idempotencyKey);
    return savedTransfer;
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

    const { transfer, lines } = existing.data;
    if (transfer.status !== 'IN_TRANSIT') {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-transfer-status',
          title: 'حالة التحويل لا تسمح بالاستلام',
          status: 400,
          detail: `المستند حالياً في حالة (${transfer.status}) ولا يمكن استلامه مجدداً.`,
        },
      };
    }

    // Add items to target warehouse
    for (const l of lines) {
      await this.storage.recordStockMovement(tenantId, {
        id: `mov-trf-in-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        tenantId,
        companyId: tenantId,
        movementNumber: `MOV-${transfer.transferNumber}-IN`,
        movementType: 'TRANSFER_IN',
        warehouseId: transfer.targetWarehouseId,
        warehouseNameAr: transfer.targetWarehouseNameAr,
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemNameAr: l.itemNameAr,
        quantity: l.quantity,
        unitCost: l.unitCost,
        totalCost: l.totalCost,
        balanceAfterQty: 0,
        sourceDocumentType: 'STOCK_TRANSFER',
        sourceDocumentId: transfer.id,
        sourceDocumentNumber: transfer.transferNumber,
        performedBy: actorId,
        performedByName: actorName,
        timestamp: new Date().toISOString(),
        idempotencyKey: `${idempotencyKey}-recv-${l.itemId}`,
      }, `${idempotencyKey}-recv-${l.itemId}`);
    }

    const updateRes = await this.storage.updateStockTransferStatus(
      tenantId,
      transferId,
      'RECEIVED',
      actorId,
      actorName,
      idempotencyKey
    );

    return updateRes;
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

    for (const l of input.lines) {
      const itemRes = await this.storage.getStockItem(tenantId, l.itemId);
      if (!itemRes.success || !itemRes.data) continue;
      const item = itemRes.data;

      const stockRes = await this.storage.getWarehouseStock(tenantId, input.warehouseId, l.itemId);
      const systemQty = stockRes.success && stockRes.data ? stockRes.data.currentQty : 0;
      const unitCost = stockRes.success && stockRes.data ? stockRes.data.averageCost : item.averageCost;

      const countedQty = Math.max(0, Number(l.countedQty) || 0);
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
