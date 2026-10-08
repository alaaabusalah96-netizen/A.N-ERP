/**
 * Phase 15 (PO-001): Purchase Orders + Goods Receipts with policy-based approvals.
 */
import {
  StoragePort, StorageResult, PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine,
  PurchaseOrderStatus, GoodsReceiptStatus, MasterPartner, StockItem,
  PurchaseRequest, PurchaseRequestLine, RequestForQuote, RfqLine, SupplierQuote, SupplierQuoteLine,
} from '../storage/StoragePort';
import { DomainEventBus } from '../events/DomainEventBus';
import { ApprovalEngine } from '../engines/ApprovalEngine';
import { NumberingEngine } from '../engines/NumberingEngine';
import { InventoryService } from '../inventory/InventoryService';
import { parsePositiveQuantity, parseNonNegativeMoney } from '../utils/validation';

export type SvcResult<T> = StorageResult<T>;

export class PurchasingService {
  constructor(
    private storage: StoragePort,
    private approvals: ApprovalEngine,
    private numbering: NumberingEngine,
    private inventory: InventoryService,
  ) {}

  private fail(status: number, type: string, title: string, detail: string): SvcResult<any> {
    return { success: false, error: { type: `https://api.an-erp.local/errors/${type}`, title, status, detail } };
  }

  public async createPurchaseOrder(
    tenantId: string,
    input: {
      vendorId: string;
      orderDate?: string;
      expectedDate?: string;
      notes?: string;
      lines: Array<{ itemId: string; orderedQty: number; unitCost: number }>;
      createdBy: string;
      idempotencyKey: string;
    },
  ): Promise<SvcResult<{ po: PurchaseOrder; lines: PurchaseOrderLine[] }>> {
    if (!input.lines?.length) return this.fail(400, 'empty-po', 'أمر شراء فارغ', 'يجب إضافة سطر واحد على الأقل.');
    const vendors = await this.storage.listMasterPartners(tenantId, 'VENDOR');
    if (!vendors.success) return vendors as any;
    const vendor = (vendors.data || []).find((v: MasterPartner) => v.id === input.vendorId);
    if (!vendor) return this.fail(404, 'vendor-not-found', 'المورد غير موجود', 'المورد غير مسجّل أو ليس من نوع VENDOR.');
    if (vendor.status === 'PENDING_APPROVAL' || vendor.status === 'REJECTED') {
      return this.fail(409, 'vendor-not-approved', 'المورد غير معتمد', 'لا يمكن إنشاء أمر شراء لمورد لم يُعتمد بعد (حوكمة البيانات / Dual-Control).');
    }

    const lines: PurchaseOrderLine[] = [];
    let i = 0;
    for (const raw of input.lines) {
      const qty = parsePositiveQuantity(raw.orderedQty, 'الكمية المطلوبة');
      if (!qty.ok) return this.fail(400, 'invalid-qty', 'كمية غير صالحة', qty.detail);
      const cost = parseNonNegativeMoney(raw.unitCost, 'تكلفة الوحدة');
      if (!cost.ok) return this.fail(400, 'invalid-cost', 'تكلفة غير صالحة', cost.detail);
      const itemRes = await this.storage.getStockItem(tenantId, raw.itemId);
      if (!itemRes.success || !itemRes.data || (itemRes.data as any).isActive === false) {
        return this.fail(404, 'item-not-found', 'صنف غير موجود', `الصنف ${raw.itemId} غير موجود أو غير فعّال.`);
      }
      i++;
      lines.push({
        id: `pol-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId,
        poId: '', // filled below
        lineNumber: i,
        itemId: itemRes.data.id,
        orderedQty: qty.value,
        unitCost: cost.value,
        receivedQty: 0,
        rejectedQty: 0,
      });
    }

    const num = await this.numbering.generateNumber(tenantId, 'PO', 'PO', input.idempotencyKey);
    const poNumber = num.success && num.data ? num.data.formattedCode : `PO-${Date.now()}`;
    const poId = `po-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    for (const l of lines) l.poId = poId;
    const po: PurchaseOrder = {
      id: poId,
      tenantId,
      poNumber,
      vendorId: vendor.id,
      vendorName: (vendor as any).nameAr || (vendor as any).name || vendor.id,
      status: 'DRAFT',
      orderDate: (input.orderDate || new Date().toISOString()).slice(0, 10),
      expectedDate: input.expectedDate?.slice(0, 10),
      notes: input.notes,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.storage.savePurchaseOrder(tenantId, po, lines, input.idempotencyKey);
    if (!saved.success) return saved as any;
    return { success: true, data: { po: saved.data!, lines } };
  }

  public async openPurchaseOrder(tenantId: string, poId: string, actorId: string): Promise<SvcResult<PurchaseOrder>> {
    const full = await this.storage.getPurchaseOrder(tenantId, poId);
    if (!full.success || !full.data) return this.fail(404, 'po-not-found', 'أمر الشراء غير موجود', 'تعذر العثور على أمر الشراء.');
    if (full.data.po.status !== 'DRAFT') return this.fail(409, 'invalid-po-status', 'حالة غير صالحة', 'لا يمكن فتح أمر ليس في حالة مسودة.');
    return this.storage.updatePurchaseOrderStatus(tenantId, poId, 'OPEN', actorId) as any;
  }

  public async closePurchaseOrder(tenantId: string, poId: string, actorId: string): Promise<SvcResult<PurchaseOrder>> {
    return this.storage.updatePurchaseOrderStatus(tenantId, poId, 'CLOSED', actorId) as any;
  }

  public async cancelPurchaseOrder(tenantId: string, poId: string, actorId: string): Promise<SvcResult<PurchaseOrder>> {
    const full = await this.storage.getPurchaseOrder(tenantId, poId);
    if (!full.success || !full.data) return this.fail(404, 'po-not-found', 'أمر الشراء غير موجود', 'تعذر العثور على أمر الشراء.');
    if (['RECEIVED', 'CLOSED', 'CANCELLED'].includes(full.data.po.status)) {
      return this.fail(409, 'invalid-po-status', 'حالة غير صالحة', 'لا يمكن إلغاء أمر في هذه الحالة.');
    }
    return this.storage.updatePurchaseOrderStatus(tenantId, poId, 'CANCELLED', actorId) as any;
  }

  public async getPurchaseOrder(tenantId: string, poId: string) {
    return this.storage.getPurchaseOrder(tenantId, poId);
  }
  public async listPurchaseOrders(tenantId: string, filter?: { status?: string; vendorId?: string }) {
    return this.storage.listPurchaseOrders(tenantId, filter);
  }

  private async tolerancePct(tenantId: string): Promise<number> {
    const s = await this.storage.getInventorySettings(tenantId);
    if (s.success && s.data) return Number(s.data.overReceiptTolerancePct) || 0;
    return 0;
  }

  public async createGoodsReceipt(
    tenantId: string,
    input: {
      poId: string;
      warehouseId: string;
      lines: Array<{ poLineId: string; receivedQty: number; batchNumber?: string; serialNumber?: string; expiryDate?: string }>;
      createdBy: string;
      idempotencyKey: string;
    },
  ): Promise<SvcResult<{ receipt: GoodsReceipt; lines: GoodsReceiptLine[]; mode: 'DIRECT' | 'STEPS' }>> {
    if (!input.lines?.length) return this.fail(400, 'empty-receipt', 'إيصال فارغ', 'يجب إضافة سطر واحد على الأقل.');
    const full = await this.storage.getPurchaseOrder(tenantId, input.poId);
    if (!full.success || !full.data) return this.fail(404, 'po-not-found', 'أمر الشراء غير موجود', 'تعذر العثور على أمر الشراء.');
    const { po, lines: poLines } = full.data;
    if (po.status !== 'OPEN' && po.status !== 'PARTIALLY_RECEIVED') {
      return this.fail(422, 'po-not-open', 'الأمر غير مفتوح للاستلام', `حالة الأمر ${po.status} لا تسمح بالاستلام.`);
    }
    const wh = await this.storage.getWarehouse(tenantId, input.warehouseId);
    if (!wh.success || !wh.data) return this.fail(404, 'warehouse-not-found', 'المستودع غير موجود', 'المستودع غير موجود.');

    const tol = await this.tolerancePct(tenantId);
    const grLines: GoodsReceiptLine[] = [];
    let li = 0;
    for (const raw of input.lines) {
      const qty = parsePositiveQuantity(raw.receivedQty, 'كمية الاستلام');
      if (!qty.ok) return this.fail(400, 'invalid-qty', 'كمية غير صالحة', qty.detail);
      const poLine = poLines.find((l) => l.id === raw.poLineId);
      if (!poLine) return this.fail(404, 'po-line-not-found', 'سطر الأمر غير موجود', `سطر ${raw.poLineId} غير موجود.`);
      const openRes = await this.storage.sumOpenReceiptQtyForPoLine(tenantId, poLine.id);
      const openQty = openRes.success ? Number(openRes.data) : 0;
      const remaining = Number(poLine.orderedQty) - Number(poLine.receivedQty) - openQty;
      const maxAllowed = remaining * (1 + tol / 100);
      if (qty.value > maxAllowed + 1e-6) {
        return this.fail(422, 'over-receipt', 'تجاوز كمية الأمر', `المتبقي ${remaining} (بسماح ${tol}%)؛ المطلوب ${qty.value}.`);
      }
      li++;
      grLines.push({
        id: `grl-${Date.now()}-${li}-${Math.random().toString(36).slice(2, 5)}`,
        tenantId,
        receiptId: '',
        poLineId: poLine.id,
        itemId: poLine.itemId,
        receivedQty: qty.value,
        batchNumber: raw.batchNumber,
        serialNumber: raw.serialNumber,
        expiryDate: raw.expiryDate,
      });
    }

    const num = await this.numbering.generateNumber(tenantId, 'GRN', 'GRN', input.idempotencyKey);
    const receiptNumber = num.success && num.data ? num.data.formattedCode : `GRN-${Date.now()}`;
    const receiptId = `gr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    for (const l of grLines) l.receiptId = receiptId;

    const receipt: GoodsReceipt = {
      id: receiptId,
      tenantId,
      receiptNumber,
      poId: po.id,
      poNumber: po.poNumber,
      warehouseId: input.warehouseId,
      status: 'IN_APPROVAL',
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };

    const sub = await this.approvals.submitWithPolicy(
      tenantId,
      { documentType: 'GOODS_RECEIPT_SUPPLIER', documentId: receiptId, documentCode: receiptNumber, initiatorId: input.createdBy },
      `${input.idempotencyKey}-appr`,
    );
    if (!sub.success || !sub.data) return sub as any;

    if (sub.data.mode === 'DIRECT') {
      receipt.status = 'APPROVED';
      const saved = await this.storage.saveGoodsReceipt(tenantId, receipt, grLines, input.idempotencyKey, { tolerancePct: tol });
      if (!saved.success) return saved as any;
      const posted = await this.postReceiptToStock(tenantId, receipt, grLines, po, poLines, input.idempotencyKey);
      if (!posted.success) {
        receipt.status = 'POSTING_FAILED';
        await this.storage.updateGoodsReceipt(tenantId, receipt);
        return posted as any;
      }
      return { success: true, data: { receipt: posted.data!.receipt, lines: grLines, mode: 'DIRECT' } };
    }

    receipt.status = 'IN_APPROVAL';
    receipt.approvalRequestId = sub.data.request.id;
    const saved = await this.storage.saveGoodsReceipt(tenantId, receipt, grLines, input.idempotencyKey, { tolerancePct: tol });
    if (!saved.success) return saved as any;
    return { success: true, data: { receipt: saved.data!, lines: grLines, mode: 'STEPS' } };
  }

  private async postReceiptToStock(
    tenantId: string,
    receipt: GoodsReceipt,
    grLines: GoodsReceiptLine[],
    po: PurchaseOrder,
    poLines: PurchaseOrderLine[],
    idemBase: string,
  ): Promise<SvcResult<{ receipt: GoodsReceipt }>> {
    const stockLines = grLines.map((gl) => {
      const pl = poLines.find((p) => p.id === gl.poLineId)!;
      return {
        itemId: gl.itemId,
        quantity: gl.receivedQty,
        unitCost: pl.unitCost,
        batchNumber: gl.batchNumber,
        serialNumber: gl.serialNumber,
        expiryDate: gl.expiryDate,
        sourcePoNumber: po.poNumber,
      };
    });
    const recv = await this.inventory.receiveStock(tenantId, {
      warehouseId: receipt.warehouseId,
      idempotencyKey: `gr-post-${receipt.id}`,
      sourceDocumentType: 'PURCHASE_ORDER',
      sourceDocumentNumber: po.poNumber,
      sourceDocumentId: po.id,
      lines: stockLines,
      performedBy: receipt.createdBy,
      performedByName: receipt.createdBy,
    } as any);
    if (!recv.success || !recv.data) {
      return this.fail(recv.error?.status || 500, 'stock-post-failed', 'فشل ترحيل المخزون', recv.error?.detail || 'تعذر ترحيل الاستلام للمخزون.');
    }

    const qtyUpdates = grLines.map((gl) => ({ poLineId: gl.poLineId, addReceived: gl.receivedQty, addRejected: 0 }));
    // recompute po status
    const refreshed = await this.storage.getPurchaseOrder(tenantId, po.id);
    const linesNow = refreshed.success && refreshed.data ? refreshed.data.lines : poLines;
    // simulate after update
    const simulated = linesNow.map((l) => {
      const add = qtyUpdates.find((u) => u.poLineId === l.id);
      return { ...l, receivedQty: Number(l.receivedQty) + (add?.addReceived || 0) };
    });
    const allDone = simulated.every((l) => Number(l.receivedQty) + 1e-6 >= Number(l.orderedQty));
    const anyRecv = simulated.some((l) => Number(l.receivedQty) > 0);
    const newPoStatus: PurchaseOrderStatus = allDone ? 'RECEIVED' : anyRecv ? 'PARTIALLY_RECEIVED' : po.status;

    receipt.status = 'APPROVED';
    receipt.stockDocumentId = recv.data.id;
    receipt.completedAt = new Date().toISOString();

    const done = await this.storage.completeGoodsReceiptAtomic(
      tenantId,
      { receipt, lines: grLines, poId: po.id, qtyUpdates, newPoStatus },
      `gr-complete-${receipt.id}`,
    );
    if (!done.success) return done as any;
    return { success: true, data: { receipt: done.data! } };
  }

  public async approveReceipt(
    tenantId: string,
    receiptId: string,
    approverId: string,
    approverRole: string,
    idempotencyKey: string,
  ): Promise<SvcResult<{ receipt: GoodsReceipt; approval?: any }>> {
    const full = await this.storage.getGoodsReceipt(tenantId, receiptId);
    if (!full.success || !full.data) return this.fail(404, 'receipt-not-found', 'الإيصال غير موجود', 'تعذر العثور على إيصال الاستلام.');
    let { receipt, lines } = full.data;
    if (receipt.status !== 'IN_APPROVAL' || !receipt.approvalRequestId) {
      return this.fail(409, 'invalid-receipt-status', 'حالة غير صالحة', 'الإيصال ليس قيد الاعتماد.');
    }
    const appr = await this.approvals.approve(tenantId, receipt.approvalRequestId, approverId, approverRole, idempotencyKey);
    if (!appr.success || !appr.data) return appr as any;

    if (appr.data.status === 'APPROVED') {
      const poFull = await this.storage.getPurchaseOrder(tenantId, receipt.poId);
      if (!poFull.success || !poFull.data) return this.fail(404, 'po-not-found', 'أمر الشراء غير موجود', 'تعذر العثور على أمر الشراء.');
      const posted = await this.postReceiptToStock(tenantId, receipt, lines, poFull.data.po, poFull.data.lines, idempotencyKey);
      if (!posted.success) {
        receipt.status = 'POSTING_FAILED';
        await this.storage.updateGoodsReceipt(tenantId, receipt);
        return posted as any;
      }
      return { success: true, data: { receipt: posted.data!.receipt, approval: appr.data } };
    }
    return { success: true, data: { receipt, approval: appr.data } };
  }

  public async rejectReceipt(
    tenantId: string,
    receiptId: string,
    approverId: string,
    approverRole: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<SvcResult<{ receipt: GoodsReceipt }>> {
    if (!reason || !String(reason).trim()) return this.fail(400, 'reject-reason-required', 'سبب الرفض مطلوب', 'يجب إدخال سبب الرفض.');
    const full = await this.storage.getGoodsReceipt(tenantId, receiptId);
    if (!full.success || !full.data) return this.fail(404, 'receipt-not-found', 'الإيصال غير موجود', 'تعذر العثور على إيصال الاستلام.');
    let { receipt, lines } = full.data;
    if (receipt.status !== 'IN_APPROVAL' || !receipt.approvalRequestId) {
      return this.fail(409, 'invalid-receipt-status', 'حالة غير صالحة', 'الإيصال ليس قيد الاعتماد.');
    }
    const rej = await this.approvals.reject(tenantId, receipt.approvalRequestId, approverId, approverRole, reason, idempotencyKey);
    if (!rej.success || !rej.data) return rej as any;

    // detect technical inspection step
    const steps = rej.data.steps || [];
    const rejectedStep = steps.find((s: any) => s.status === 'REJECTED');
    const isTech = rejectedStep?.stepKind === 'TECHNICAL_INSPECTION';
    receipt.status = isTech ? 'RETURNED_TO_SUPPLIER' : 'REJECTED';
    receipt.rejectReason = reason;
    receipt.completedAt = new Date().toISOString();

    if (isTech) {
      const qtyUpdates = lines.map((gl) => ({ poLineId: gl.poLineId, addReceived: 0, addRejected: gl.receivedQty }));
      const poFull = await this.storage.getPurchaseOrder(tenantId, receipt.poId);
      const poStatus = poFull.success && poFull.data ? poFull.data.po.status : 'OPEN';
      await this.storage.completeGoodsReceiptAtomic(
        tenantId,
        { receipt, lines, poId: receipt.poId, qtyUpdates, newPoStatus: poStatus as PurchaseOrderStatus },
        `gr-reject-${receipt.id}`,
      );
    } else {
      await this.storage.updateGoodsReceipt(tenantId, receipt);
    }
    return { success: true, data: { receipt } };
  }

  public async retryPostReceipt(tenantId: string, receiptId: string, idempotencyKey: string): Promise<SvcResult<{ receipt: GoodsReceipt }>> {
    const full = await this.storage.getGoodsReceipt(tenantId, receiptId);
    if (!full.success || !full.data) return this.fail(404, 'receipt-not-found', 'الإيصال غير موجود', 'تعذر العثور على إيصال الاستلام.');
    const { receipt, lines } = full.data;
    if (receipt.status === 'APPROVED' && receipt.stockDocumentId) {
      return { success: true, data: { receipt } };
    }
    if (receipt.status !== 'POSTING_FAILED' && receipt.status !== 'APPROVED') {
      return this.fail(409, 'invalid-receipt-status', 'حالة غير صالحة', 'إعادة الترحيل متاحة لحالة POSTING_FAILED فقط.');
    }
    const poFull = await this.storage.getPurchaseOrder(tenantId, receipt.poId);
    if (!poFull.success || !poFull.data) return this.fail(404, 'po-not-found', 'أمر الشراء غير موجود', 'تعذر العثور على أمر الشراء.');
    return this.postReceiptToStock(tenantId, receipt, lines, poFull.data.po, poFull.data.lines, idempotencyKey);
  }

  public async getGoodsReceipt(tenantId: string, id: string) { return this.storage.getGoodsReceipt(tenantId, id); }
  public async listGoodsReceipts(tenantId: string, filter?: { poId?: string; status?: string }) { return this.storage.listGoodsReceipts(tenantId, filter); }

  // ===========================================================================
  // Phase 8a (P2P-001): Purchase Request → RFQ → Supplier Quote → PO
  // ===========================================================================

  public async createPurchaseRequest(
    tenantId: string,
    input: {
      lines: Array<{ itemId: string; quantity: number; uom?: string; neededBy?: string; costCenterId?: string; projectId?: string; notes?: string }>;
      requestedBy: string;
      neededBy?: string;
      notes?: string;
      costCenterId?: string;
      projectId?: string;
      sourceReorderEventId?: string;
      idempotencyKey: string;
    },
  ): Promise<SvcResult<{ pr: PurchaseRequest; lines: PurchaseRequestLine[] }>> {
    if (!input.lines?.length) return this.fail(400, 'empty-pr', 'طلب شراء فارغ', 'يجب إضافة سطر واحد على الأقل.');
    const lines: PurchaseRequestLine[] = [];
    let i = 0;
    for (const raw of input.lines) {
      const qty = parsePositiveQuantity(raw.quantity, 'الكمية');
      if (!qty.ok) return this.fail(400, 'invalid-qty', 'كمية غير صالحة', qty.detail);
      const itemRes = await this.storage.getStockItem(tenantId, raw.itemId);
      if (!itemRes.success || !itemRes.data) return this.fail(404, 'item-not-found', 'صنف غير موجود', `الصنف ${raw.itemId} غير موجود.`);
      i += 1;
      lines.push({
        id: `prl-${input.idempotencyKey}-${i}`.slice(0, 80),
        tenantId,
        prId: '',
        lineNumber: i,
        itemId: raw.itemId,
        quantity: qty.value,
        uom: raw.uom,
        neededBy: raw.neededBy?.slice(0, 10),
        costCenterId: raw.costCenterId,
        projectId: raw.projectId,
        notes: raw.notes,
      });
    }
    const seq = await this.numbering.generateNumber(tenantId, 'PURCHASE_REQUEST', 'PR', `${input.idempotencyKey}-num`);
    if (!seq.success || !seq.data) return seq as any;
    const prId = `pr-${input.idempotencyKey}`.slice(0, 60);
    for (const l of lines) l.prId = prId;
    const pr: PurchaseRequest = {
      id: prId,
      tenantId,
      prNumber: seq.data.formattedCode,
      status: 'DRAFT',
      requestedBy: input.requestedBy,
      neededBy: input.neededBy?.slice(0, 10),
      notes: input.notes,
      costCenterId: input.costCenterId,
      projectId: input.projectId,
      sourceReorderEventId: input.sourceReorderEventId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.storage.savePurchaseRequest(tenantId, pr, lines, input.idempotencyKey);
    if (!saved.success) return saved as any;
    await DomainEventBus.publish({
      eventType: 'PURCHASE_REQUESTED',
      tenantId,
      actorId: input.requestedBy,
      actorName: input.requestedBy,
      payload: { prId: pr.id, prNumber: pr.prNumber, lineCount: lines.length },
      idempotencyKey: input.idempotencyKey,
    });
    return { success: true, data: { pr: saved.data!, lines } };
  }

  public async submitPurchaseRequest(tenantId: string, prId: string, actorId: string): Promise<SvcResult<PurchaseRequest>> {
    const full = await this.storage.getPurchaseRequest(tenantId, prId);
    if (!full.success || !full.data) return this.fail(404, 'pr-not-found', 'طلب الشراء غير موجود', 'تعذر العثور على طلب الشراء.');
    if (full.data.pr.status !== 'DRAFT') return this.fail(409, 'invalid-pr-status', 'حالة غير صالحة', 'لا يمكن تقديم طلب ليس في حالة مسودة.');
    const updated: PurchaseRequest = { ...full.data.pr, status: 'PENDING_APPROVAL', updatedAt: new Date().toISOString() };
    return this.storage.updatePurchaseRequest(tenantId, updated);
  }

  public async approvePurchaseRequest(tenantId: string, prId: string, approverId: string): Promise<SvcResult<PurchaseRequest>> {
    const full = await this.storage.getPurchaseRequest(tenantId, prId);
    if (!full.success || !full.data) return this.fail(404, 'pr-not-found', 'طلب الشراء غير موجود', 'تعذر العثور على طلب الشراء.');
    const pr = full.data.pr;
    if (pr.status !== 'PENDING_APPROVAL' && pr.status !== 'DRAFT') {
      return this.fail(409, 'invalid-pr-status', 'حالة غير صالحة', 'لا يمكن اعتماد طلب في هذه الحالة.');
    }
    if (pr.requestedBy === approverId) {
      return this.fail(403, 'sod-violation', 'تعارض فصل المهام', 'منشئ طلب الشراء لا يجوز له اعتماده بنفسه.');
    }
    const updated: PurchaseRequest = {
      ...pr,
      status: 'APPROVED',
      approvedBy: approverId,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return this.storage.updatePurchaseRequest(tenantId, updated);
  }

  public async rejectPurchaseRequest(tenantId: string, prId: string, actorId: string, reason: string): Promise<SvcResult<PurchaseRequest>> {
    const full = await this.storage.getPurchaseRequest(tenantId, prId);
    if (!full.success || !full.data) return this.fail(404, 'pr-not-found', 'طلب الشراء غير موجود', 'تعذر العثور على طلب الشراء.');
    if (full.data.pr.status === 'CONVERTED' || full.data.pr.status === 'CANCELLED') {
      return this.fail(409, 'invalid-pr-status', 'حالة غير صالحة', 'لا يمكن رفض طلب محوّل أو ملغى.');
    }
    const updated: PurchaseRequest = {
      ...full.data.pr,
      status: 'REJECTED',
      rejectionReason: reason || 'مرفوض',
      updatedAt: new Date().toISOString(),
    };
    return this.storage.updatePurchaseRequest(tenantId, updated);
  }

  public async convertPurchaseRequestToPO(
    tenantId: string,
    input: { prId: string; vendorId: string; actorId: string; unitCosts: Record<string, number>; idempotencyKey: string },
  ): Promise<SvcResult<{ po: PurchaseOrder; lines: PurchaseOrderLine[]; pr: PurchaseRequest }>> {
    const full = await this.storage.getPurchaseRequest(tenantId, input.prId);
    if (!full.success || !full.data) return this.fail(404, 'pr-not-found', 'طلب الشراء غير موجود', 'تعذر العثور على طلب الشراء.');
    const pr = full.data.pr;
    if (pr.status !== 'APPROVED') return this.fail(409, 'pr-not-approved', 'طلب غير معتمد', 'يجب اعتماد طلب الشراء قبل تحويله لأمر شراء.');
    if (pr.convertedPoId) return this.fail(409, 'pr-already-converted', 'طلب محوّل مسبقًا', 'تم تحويل هذا الطلب مسبقًا.');
    const poLines = full.data.lines.map((l) => {
      const cost = input.unitCosts[l.itemId] ?? input.unitCosts[l.id] ?? 0;
      return { itemId: l.itemId, orderedQty: l.quantity, unitCost: cost };
    });
    const poRes = await this.createPurchaseOrder(tenantId, {
      vendorId: input.vendorId,
      lines: poLines,
      createdBy: input.actorId,
      notes: `من طلب شراء ${pr.prNumber}`,
      idempotencyKey: input.idempotencyKey,
    });
    if (!poRes.success || !poRes.data) return poRes as any;
    const updatedPr: PurchaseRequest = {
      ...pr,
      status: 'CONVERTED',
      convertedPoId: poRes.data.po.id,
      updatedAt: new Date().toISOString(),
    };
    const up = await this.storage.updatePurchaseRequest(tenantId, updatedPr);
    if (!up.success) return up as any;
    await DomainEventBus.publish({
      eventType: 'PO_ISSUED',
      tenantId,
      actorId: input.actorId,
      actorName: input.actorId,
      payload: { poId: poRes.data.po.id, poNumber: poRes.data.po.poNumber, prId: pr.id },
      idempotencyKey: input.idempotencyKey,
    });
    return { success: true, data: { po: poRes.data.po, lines: poRes.data.lines, pr: up.data! } };
  }

  public async createRfq(
    tenantId: string,
    input: {
      prId?: string;
      lines?: Array<{ itemId: string; quantity: number; uom?: string; notes?: string }>;
      createdBy: string;
      notes?: string;
      idempotencyKey: string;
    },
  ): Promise<SvcResult<{ rfq: RequestForQuote; lines: RfqLine[] }>> {
    let rawLines = input.lines || [];
    if (input.prId) {
      const prFull = await this.storage.getPurchaseRequest(tenantId, input.prId);
      if (!prFull.success || !prFull.data) return this.fail(404, 'pr-not-found', 'طلب الشراء غير موجود', 'تعذر ربط RFQ بطلب شراء.');
      if (prFull.data.pr.status !== 'APPROVED' && prFull.data.pr.status !== 'CONVERTED') {
        return this.fail(409, 'pr-not-approved', 'طلب غير معتمد', 'إنشاء RFQ من طلب شراء يتطلب اعتماده أولًا.');
      }
      if (!rawLines.length) {
        rawLines = prFull.data.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, uom: l.uom, notes: l.notes }));
      }
    }
    if (!rawLines.length) return this.fail(400, 'empty-rfq', 'طلب عرض سعر فارغ', 'يجب إضافة سطر واحد على الأقل.');
    const lines: RfqLine[] = [];
    let i = 0;
    for (const raw of rawLines) {
      const qty = parsePositiveQuantity(raw.quantity, 'الكمية');
      if (!qty.ok) return this.fail(400, 'invalid-qty', 'كمية غير صالحة', qty.detail);
      const itemRes = await this.storage.getStockItem(tenantId, raw.itemId);
      if (!itemRes.success || !itemRes.data) return this.fail(404, 'item-not-found', 'صنف غير موجود', `الصنف ${raw.itemId} غير موجود.`);
      i += 1;
      lines.push({
        id: `rfql-${input.idempotencyKey}-${i}`.slice(0, 80),
        tenantId,
        rfqId: '',
        lineNumber: i,
        itemId: raw.itemId,
        quantity: qty.value,
        uom: raw.uom,
        notes: raw.notes,
      });
    }
    const seq = await this.numbering.generateNumber(tenantId, 'RFQ', 'RFQ', `${input.idempotencyKey}-num`);
    if (!seq.success || !seq.data) return seq as any;
    const rfqId = `rfq-${input.idempotencyKey}`.slice(0, 60);
    for (const l of lines) l.rfqId = rfqId;
    const rfq: RequestForQuote = {
      id: rfqId,
      tenantId,
      rfqNumber: seq.data.formattedCode,
      status: 'DRAFT',
      prId: input.prId,
      notes: input.notes,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.storage.saveRfq(tenantId, rfq, lines, input.idempotencyKey);
    if (!saved.success) return saved as any;
    return { success: true, data: { rfq: saved.data!, lines } };
  }

  public async sendRfq(tenantId: string, rfqId: string, actorId: string): Promise<SvcResult<RequestForQuote>> {
    const full = await this.storage.getRfq(tenantId, rfqId);
    if (!full.success || !full.data) return this.fail(404, 'rfq-not-found', 'طلب عرض السعر غير موجود', 'تعذر العثور على RFQ.');
    if (full.data.rfq.status !== 'DRAFT') return this.fail(409, 'invalid-rfq-status', 'حالة غير صالحة', 'لا يمكن إرسال RFQ ليس مسودة.');
    const updated: RequestForQuote = {
      ...full.data.rfq,
      status: 'SENT',
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const res = await this.storage.updateRfq(tenantId, updated);
    if (!res.success) return res;
    await DomainEventBus.publish({
      eventType: 'RFQ_SENT',
      tenantId,
      actorId,
      actorName: actorId,
      payload: { rfqId, rfqNumber: updated.rfqNumber },
    });
    return res;
  }

  public async recordSupplierQuote(
    tenantId: string,
    input: {
      rfqId: string;
      vendorId: string;
      lines: Array<{ rfqLineId: string; itemId: string; quantity: number; unitPrice: number; leadTimeDays?: number; notes?: string }>;
      quoteDate?: string;
      validUntil?: string;
      notes?: string;
      createdBy: string;
      idempotencyKey: string;
    },
  ): Promise<SvcResult<{ quote: SupplierQuote; lines: SupplierQuoteLine[] }>> {
    const rfqFull = await this.storage.getRfq(tenantId, input.rfqId);
    if (!rfqFull.success || !rfqFull.data) return this.fail(404, 'rfq-not-found', 'طلب عرض السعر غير موجود', 'تعذر ربط العرض بـ RFQ.');
    if (rfqFull.data.rfq.status !== 'SENT' && rfqFull.data.rfq.status !== 'DRAFT') {
      return this.fail(409, 'invalid-rfq-status', 'حالة RFQ غير صالحة', 'لا تُقبل عروض على RFQ مغلق أو ملغى.');
    }
    const vendors = await this.storage.listMasterPartners(tenantId, 'VENDOR');
    if (!vendors.success) return vendors as any;
    const vendor = (vendors.data || []).find((v: MasterPartner) => v.id === input.vendorId);
    if (!vendor) return this.fail(404, 'vendor-not-found', 'المورد غير موجود', 'المورد غير مسجّل.');
    if (vendor.status === 'PENDING_APPROVAL' || vendor.status === 'REJECTED') {
      return this.fail(409, 'vendor-not-approved', 'المورد غير معتمد', 'لا تُقبل عروض من مورد غير معتمد.');
    }
    if (!input.lines?.length) return this.fail(400, 'empty-quote', 'عرض فارغ', 'يجب إضافة سطر واحد على الأقل.');
    const lines: SupplierQuoteLine[] = [];
    let i = 0;
    for (const raw of input.lines) {
      const qty = parsePositiveQuantity(raw.quantity, 'الكمية');
      if (!qty.ok) return this.fail(400, 'invalid-qty', 'كمية غير صالحة', qty.detail);
      const price = parseNonNegativeMoney(raw.unitPrice, 'سعر الوحدة');
      if (!price.ok) return this.fail(400, 'invalid-price', 'سعر غير صالح', price.detail);
      i += 1;
      lines.push({
        id: `sql-${input.idempotencyKey}-${i}`.slice(0, 80),
        tenantId,
        quoteId: '',
        rfqLineId: raw.rfqLineId,
        lineNumber: i,
        itemId: raw.itemId,
        quantity: qty.value,
        unitPrice: price.value,
        leadTimeDays: raw.leadTimeDays,
        notes: raw.notes,
      });
    }
    const seq = await this.numbering.generateNumber(tenantId, 'SUPPLIER_QUOTE', 'SQ', `${input.idempotencyKey}-num`);
    if (!seq.success || !seq.data) return seq as any;
    const quoteId = `sq-${input.idempotencyKey}`.slice(0, 60);
    for (const l of lines) l.quoteId = quoteId;
    const quote: SupplierQuote = {
      id: quoteId,
      tenantId,
      quoteNumber: seq.data.formattedCode,
      rfqId: input.rfqId,
      vendorId: vendor.id,
      vendorName: vendor.nameAr,
      status: 'RECEIVED',
      quoteDate: (input.quoteDate || new Date().toISOString()).slice(0, 10),
      validUntil: input.validUntil?.slice(0, 10),
      notes: input.notes,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.storage.saveSupplierQuote(tenantId, quote, lines, input.idempotencyKey);
    if (!saved.success) return saved as any;
    await DomainEventBus.publish({
      eventType: 'SUPPLIER_QUOTE_RECEIVED',
      tenantId,
      actorId: input.createdBy,
      actorName: input.createdBy,
      payload: { quoteId, rfqId: input.rfqId, vendorId: vendor.id },
      idempotencyKey: input.idempotencyKey,
    });
    return { success: true, data: { quote: saved.data!, lines } };
  }

  public async selectSupplierQuote(tenantId: string, quoteId: string, actorId: string): Promise<SvcResult<SupplierQuote>> {
    const full = await this.storage.getSupplierQuote(tenantId, quoteId);
    if (!full.success || !full.data) return this.fail(404, 'quote-not-found', 'عرض المورد غير موجود', 'تعذر العثور على العرض.');
    if (full.data.quote.status !== 'RECEIVED') {
      return this.fail(409, 'invalid-quote-status', 'حالة غير صالحة', 'لا يمكن اختيار عرض ليس في حالة RECEIVED.');
    }
    // reject siblings on same RFQ
    const siblings = await this.storage.listSupplierQuotes(tenantId, { rfqId: full.data.quote.rfqId });
    if (siblings.success && siblings.data) {
      for (const s of siblings.data) {
        if (s.id !== quoteId && s.status === 'RECEIVED') {
          await this.storage.updateSupplierQuote(tenantId, { ...s, status: 'REJECTED', updatedAt: new Date().toISOString() });
        }
      }
    }
    const updated: SupplierQuote = {
      ...full.data.quote,
      status: 'SELECTED',
      selectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return this.storage.updateSupplierQuote(tenantId, updated);
  }

  public async convertQuoteToPO(
    tenantId: string,
    input: { quoteId: string; actorId: string; idempotencyKey: string },
  ): Promise<SvcResult<{ po: PurchaseOrder; lines: PurchaseOrderLine[]; quote: SupplierQuote }>> {
    const full = await this.storage.getSupplierQuote(tenantId, input.quoteId);
    if (!full.success || !full.data) return this.fail(404, 'quote-not-found', 'عرض المورد غير موجود', 'تعذر العثور على العرض.');
    const quote = full.data.quote;
    if (quote.status !== 'SELECTED' && quote.status !== 'RECEIVED') {
      return this.fail(409, 'invalid-quote-status', 'حالة غير صالحة', 'يجب اختيار العرض قبل التحويل لأمر شراء.');
    }
    if (quote.convertedPoId) return this.fail(409, 'quote-already-converted', 'عرض محوّل مسبقًا', 'تم تحويل هذا العرض مسبقًا.');
    if (quote.status === 'RECEIVED') {
      const sel = await this.selectSupplierQuote(tenantId, quote.id, input.actorId);
      if (!sel.success) return sel as any;
    }
    const poRes = await this.createPurchaseOrder(tenantId, {
      vendorId: quote.vendorId,
      lines: full.data.lines.map((l) => ({ itemId: l.itemId, orderedQty: l.quantity, unitCost: l.unitPrice })),
      createdBy: input.actorId,
      notes: `من عرض مورد ${quote.quoteNumber}`,
      idempotencyKey: input.idempotencyKey,
    });
    if (!poRes.success || !poRes.data) return poRes as any;
    const updatedQuote: SupplierQuote = {
      ...quote,
      status: 'SELECTED',
      convertedPoId: poRes.data.po.id,
      selectedAt: quote.selectedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const up = await this.storage.updateSupplierQuote(tenantId, updatedQuote);
    if (!up.success) return up as any;
    // close RFQ
    const rfqFull = await this.storage.getRfq(tenantId, quote.rfqId);
    if (rfqFull.success && rfqFull.data) {
      await this.storage.updateRfq(tenantId, {
        ...rfqFull.data.rfq,
        status: 'CLOSED',
        closedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    await DomainEventBus.publish({
      eventType: 'PO_ISSUED',
      tenantId,
      actorId: input.actorId,
      actorName: input.actorId,
      payload: { poId: poRes.data.po.id, poNumber: poRes.data.po.poNumber, quoteId: quote.id },
      idempotencyKey: input.idempotencyKey,
    });
    return { success: true, data: { po: poRes.data.po, lines: poRes.data.lines, quote: up.data! } };
  }

  public async getPurchaseRequest(tenantId: string, prId: string) { return this.storage.getPurchaseRequest(tenantId, prId); }
  public async listPurchaseRequests(tenantId: string, filter?: { status?: string; requestedBy?: string }) { return this.storage.listPurchaseRequests(tenantId, filter); }
  public async getRfq(tenantId: string, rfqId: string) { return this.storage.getRfq(tenantId, rfqId); }
  public async listRfqs(tenantId: string, filter?: { status?: string; prId?: string }) { return this.storage.listRfqs(tenantId, filter); }
  public async getSupplierQuote(tenantId: string, quoteId: string) { return this.storage.getSupplierQuote(tenantId, quoteId); }
  public async listSupplierQuotes(tenantId: string, filter?: { rfqId?: string; vendorId?: string; status?: string }) { return this.storage.listSupplierQuotes(tenantId, filter); }

}
