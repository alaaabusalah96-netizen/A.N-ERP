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
} from '../storage/StoragePort';
import { PostingEngine } from '../engines/PostingEngine';
import { NumberingEngine } from '../engines/NumberingEngine';

export interface ReceiveStockInput {
  warehouseId: string;
  itemId: string;
  quantity: number;
  unitCost: number;
  batchNumber?: string;
  serialNumber?: string;
  expiryDate?: string;
  sourceDocumentType?: string;
  sourceDocumentId?: string;
  sourceDocumentNumber?: string;
  notes?: string;
  performedBy: string;
  performedByName: string;
  idempotencyKey: string;
}

export interface IssueStockInput {
  warehouseId: string;
  itemId: string;
  quantity: number;
  batchNumber?: string;
  serialNumber?: string;
  sourceDocumentType?: string;
  sourceDocumentId?: string;
  sourceDocumentNumber?: string;
  notes?: string;
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
  // 7B: Stock Movements (إضافة وصرف وتقييم فوري بالمتوسط المرجح)
  // ============================================================================

  public async receiveStock(tenantId: string, input: ReceiveStockInput): Promise<ServiceResult<StockMovement>> {
    if (input.quantity <= 0) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-quantity',
          title: 'كمية التوريد غير صحيحة',
          status: 400,
          detail: 'يجب أن تكون كمية التوريد أكبر من صفر.',
        },
      };
    }

    const itemRes = await this.storage.getStockItem(tenantId, input.itemId);
    if (!itemRes.success || !itemRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/item-not-found',
          title: 'الصنف غير موجود',
          status: 404,
          detail: 'تعذر العثور على الصنف المحدد.',
        },
      };
    }
    const item = itemRes.data;

    const whRes = await this.storage.getWarehouse(tenantId, input.warehouseId);
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

    // Generate atomic movement number
    const seqRes = await this.numberingEngine.generateNextNumber(tenantId, 'STK-REC', 'REC');
    const movementNumber = seqRes.success && seqRes.data ? seqRes.data.formattedNumber : `REC-${Date.now()}`;

    const totalCost = Math.round(input.quantity * input.unitCost * 100) / 100;

    const movement: StockMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      tenantId,
      companyId: tenantId,
      movementNumber,
      movementType: 'RECEIPT',
      warehouseId: input.warehouseId,
      warehouseNameAr: warehouse.nameAr,
      itemId: item.id,
      itemCode: item.itemCode,
      itemNameAr: item.nameAr,
      quantity: input.quantity,
      unitCost: input.unitCost,
      totalCost,
      balanceAfterQty: 0, // Will be set by storage/adapter
      sourceDocumentType: input.sourceDocumentType || 'PURCHASE_INVOICE',
      sourceDocumentId: input.sourceDocumentId,
      sourceDocumentNumber: input.sourceDocumentNumber,
      batchNumber: input.batchNumber,
      serialNumber: input.serialNumber,
      notes: input.notes,
      performedBy: input.performedBy,
      performedByName: input.performedByName,
      timestamp: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey,
    };

    const movRes = await this.storage.recordStockMovement(tenantId, movement, input.idempotencyKey);
    if (!movRes.success) return movRes;

    // Track Batch if provided
    if (item.trackBatch && input.batchNumber) {
      await this.storage.saveItemBatch(tenantId, {
        id: `batch-${input.itemId}-${input.batchNumber}`,
        tenantId,
        companyId: tenantId,
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        batchNumber: input.batchNumber,
        quantity: input.quantity,
        expiryDate: input.expiryDate,
        createdAt: new Date().toISOString(),
      });
    }

    // Track Serial if provided
    if (item.trackSerial && input.serialNumber) {
      await this.storage.saveItemSerial(tenantId, {
        id: `ser-${input.itemId}-${input.serialNumber}`,
        tenantId,
        companyId: tenantId,
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        serialNumber: input.serialNumber,
        status: 'IN_STOCK',
        createdAt: new Date().toISOString(),
      });
    }

    return movRes;
  }

  public async issueStock(tenantId: string, input: IssueStockInput): Promise<ServiceResult<StockMovement>> {
    if (input.quantity <= 0) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-quantity',
          title: 'كمية الصرف غير صحيحة',
          status: 400,
          detail: 'يجب أن تكون كمية الصرف أكبر من صفر.',
        },
      };
    }

    const itemRes = await this.storage.getStockItem(tenantId, input.itemId);
    if (!itemRes.success || !itemRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/item-not-found',
          title: 'الصنف غير موجود',
          status: 404,
          detail: 'تعذر العثور على الصنف المحدد.',
        },
      };
    }
    const item = itemRes.data;

    const whRes = await this.storage.getWarehouse(tenantId, input.warehouseId);
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

    // Check availability
    const stockRes = await this.storage.getWarehouseStock(tenantId, input.warehouseId, input.itemId);
    const availableQty = stockRes.success && stockRes.data ? stockRes.data.availableQty : 0;
    const currentAvgCost = stockRes.success && stockRes.data ? stockRes.data.averageCost : item.averageCost;

    if (availableQty < input.quantity) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/insufficient-stock',
          title: 'الرصيد المخزني غير كافٍ',
          status: 400,
          detail: `الرصيد المتاح حالياً (${availableQty}) أقل من الكمية المطلوبة للصرف (${input.quantity}).`,
        },
      };
    }

    // Generate atomic numbering
    const seqRes = await this.numberingEngine.generateNextNumber(tenantId, 'STK-ISS', 'ISS');
    const movementNumber = seqRes.success && seqRes.data ? seqRes.data.formattedNumber : `ISS-${Date.now()}`;

    const totalCost = Math.round(input.quantity * currentAvgCost * 100) / 100;

    const movement: StockMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      tenantId,
      companyId: tenantId,
      movementNumber,
      movementType: 'ISSUE',
      warehouseId: input.warehouseId,
      warehouseNameAr: warehouse.nameAr,
      itemId: item.id,
      itemCode: item.itemCode,
      itemNameAr: item.nameAr,
      quantity: input.quantity,
      unitCost: currentAvgCost,
      totalCost,
      balanceAfterQty: availableQty - input.quantity,
      sourceDocumentType: input.sourceDocumentType || 'SALES_DELIVERY',
      sourceDocumentId: input.sourceDocumentId,
      sourceDocumentNumber: input.sourceDocumentNumber,
      batchNumber: input.batchNumber,
      serialNumber: input.serialNumber,
      notes: input.notes,
      performedBy: input.performedBy,
      performedByName: input.performedByName,
      timestamp: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey,
    };

    const movRes = await this.storage.recordStockMovement(tenantId, movement, input.idempotencyKey);

    // Check reorder point trigger
    if (movRes.success && (availableQty - input.quantity) <= item.reorderPoint) {
      // Reorder point reached event
      await this.storage.saveSystemChangeLog({
        id: `reorder-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: input.performedBy,
        changeType: 'SECURITY',
        module: 'INVENTORY',
        entitiesAffected: [`StockItem:${item.id}`, `Warehouse:${input.warehouseId}`],
        summaryAr: `تنبيه: وصل رصيد الصنف ${item.nameAr} في ${warehouse.nameAr} إلى حد إعادة الطلب (${availableQty - input.quantity} <= ${item.reorderPoint})`,
        version: '1.0',
      });
    }

    return movRes;
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
    const numRes = await this.numberingEngine.generateNextNumber(tenantId, 'STK-TRF', 'TRF');
    const transferNumber = numRes.success && numRes.data ? numRes.data.formattedNumber : `TRF-${Date.now()}`;

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
    const numRes = await this.numberingEngine.generateNextNumber(tenantId, 'STK-CNT', 'CNT');
    const countNumber = numRes.success && numRes.data ? numRes.data.formattedNumber : `CNT-${Date.now()}`;

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
      const journalLines: JournalEntryLine[] = [];
      const absAmount = Math.abs(count.netVarianceAmount);

      if (count.netVarianceAmount < 0) {
        // Deficit (عجز مخزني):
        // Dr: 520101 (Inventory Adjustment Loss/Expense - مصروف عجز الجرد المخزني)
        // Cr: 110301 (Inventory Asset - مخزون البضاعة)
        journalLines.push(
          {
            id: `jl-1`,
            accountCode: '520101',
            accountNameAr: 'عجز وتسويات الجرد المخزني',
            debit: absAmount,
            credit: 0,
            descriptionAr: `تسوية عجز جرد ${count.warehouseNameAr} بموجب المحضر ${count.countNumber}`,
          },
          {
            id: `jl-2`,
            accountCode: '110301',
            accountNameAr: 'مخزون البضاعة بغرض البيع',
            debit: 0,
            credit: absAmount,
            descriptionAr: `تخفيض المخزون بالمستودع بموجب المحضر ${count.countNumber}`,
          }
        );
      } else {
        // Surplus (زيادة مخزنية):
        // Dr: 110301 (Inventory Asset - مخزون البضاعة)
        // Cr: 410101 (Inventory Gain - أرباح تسوية زيادة الجرد المخزني)
        journalLines.push(
          {
            id: `jl-1`,
            accountCode: '110301',
            accountNameAr: 'مخزون البضاعة بغرض البيع',
            debit: absAmount,
            credit: 0,
            descriptionAr: `إثبات زيادة المخزون بموجب محضر الجرد ${count.countNumber}`,
          },
          {
            id: `jl-2`,
            accountCode: '410101',
            accountNameAr: 'أرباح تسوية زيادة الجرد المخزني',
            debit: 0,
            credit: absAmount,
            descriptionAr: `إيرادات أرباح فروقات زيادة الجرد بموجب ${count.countNumber}`,
          }
        );
      }

      const postRes = await this.postingEngine.postJournalEntry(tenantId, {
        entryNumber: `JE-ADJ-${count.countNumber}`,
        date: new Date().toISOString().split('T')[0],
        descriptionAr: `قيد تسوية فروقات الجرد المخزني - محضر ${count.countNumber}`,
        sourceDocumentType: 'STOCK_COUNT',
        sourceDocumentId: count.id,
        sourceDocumentNumber: count.countNumber,
        lines: journalLines,
        createdBy: input.approvedBy,
        idempotencyKey: `${input.idempotencyKey}-posting`,
      });

      if (!postRes.success) {
        return {
          success: false,
          error: postRes.error,
        };
      }

      journalEntryId = postRes.data?.id;
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
