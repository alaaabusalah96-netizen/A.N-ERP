/**
 * Phase 15 (PO-001): Purchase Orders + Goods Receipts with policy-based approvals.
 */
import {
  StoragePort, StorageResult, PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine,
  PurchaseOrderStatus, GoodsReceiptStatus, MasterPartner, StockItem,
  PurchaseRequest, PurchaseRequestLine, RequestForQuote, RfqLine, SupplierQuote, SupplierQuoteLine,
  SupplierInvoice, SupplierInvoiceLine, ThreeWayMatchResult, ThreeWayMatchLineResult,
} from '../storage/StoragePort';
import { DomainEventBus } from '../events/DomainEventBus';
import { ApprovalEngine } from '../engines/ApprovalEngine';
import { NumberingEngine } from '../engines/NumberingEngine';
import { InventoryService } from '../inventory/InventoryService';
import { PostingEngine } from '../engines/PostingEngine';
import { AccountingPolicyRegistry } from '../standards/registries';
import { defaultStockAccountingConfig } from '../storage/StoragePort';
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


  // Phase 8c (P2P-002): Supplier Invoice + Three-Way Matching
  /** Invoiced quantity per PO line over OTHER live invoices (pending match, matched, approved or posted). Rejected / failed invoices do not count. */
  private async invoicedElsewhere(tenantId: string, poId: string, excludeInvoiceId: string): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const list = await this.storage.listSupplierInvoices(tenantId, { poId });
    if (!list.success) return out;
    for (const h of (list.data || [])) {
      if (h.id === excludeInvoiceId || !['MATCH_PENDING', 'MATCHED', 'APPROVED', 'POSTED'].includes(h.status)) continue;
      const f = await this.storage.getSupplierInvoice(tenantId, h.id);
      for (const l of (f.data?.lines || [])) out.set(l.poLineId, (out.get(l.poLineId) || 0) + Number(l.invoicedQty));
    }
    return out;
  }

  /** Account code from an effective-dated company policy, else the standard-chart default; null when neither exists. */
  private async policyAccount(tenantId: string, key: string, date: string, fallback: string | null): Promise<string | null> {
    try {
      const r = await new AccountingPolicyRegistry(this.storage).getEffective(tenantId, key, date);
      if (r.status === 'RESOLVED' && r.item.value) return String(r.item.value);
    } catch { /* fall through to default */ }
    return fallback;
  }

  private async usableAccount(tenantId: string, code: string, types: string[]): Promise<boolean> {
    const a = await this.storage.getAccount(tenantId, code);
    const acc: any = a.success ? a.data : null;
    return !!acc && acc.isActive !== false && acc.status !== 'INACTIVE' && types.includes(acc.type);
  }

  public async createSupplierInvoice(
    tenantId: string,
    input: {
      poId: string; receiptId?: string; vendorInvoiceRef: string; invoiceDate?: string; dueDate?: string;
      notes?: string; taxAmount?: number; autoMatch?: boolean;
      lines: Array<{ poLineId: string; itemId: string; invoicedQty: number; unitPrice: number; taxAmount?: number; notes?: string }>;
      createdBy: string; idempotencyKey: string;
    },
  ): Promise<SvcResult<{ invoice: SupplierInvoice; lines: SupplierInvoiceLine[]; match?: ThreeWayMatchResult }>> {
    if (!input.lines?.length) return this.fail(400, 'empty-invoice', 'فاتورة فارغة', 'يجب إضافة سطر واحد على الأقل.');
    if (!input.vendorInvoiceRef?.trim()) return this.fail(400, 'missing-ref', 'مرجع الفاتورة مطلوب', 'رقم فاتورة المورد إلزامي.');
    const poFull = await this.storage.getPurchaseOrder(tenantId, input.poId);
    if (!poFull.success || !poFull.data) return this.fail(404, 'po-not-found', 'أمر الشراء غير موجود', 'تعذر ربط الفاتورة بأمر شراء.');
    const { po, lines: poLines } = poFull.data;
    if (po.status === 'CANCELLED' || po.status === 'DRAFT') {
      return this.fail(409, 'invalid-po-status', 'حالة أمر الشراء غير صالحة', 'لا تُقبل فاتورة على أمر ملغى أو مسودة.');
    }
    const vendors = await this.storage.listMasterPartners(tenantId, 'VENDOR');
    if (!vendors.success) return vendors as any;
    const vendor = (vendors.data || []).find((v: MasterPartner) => v.id === po.vendorId);
    if (!vendor) return this.fail(404, 'vendor-not-found', 'المورد غير موجود', 'مورد أمر الشراء غير مسجّل.');
    if (vendor.status === 'PENDING_APPROVAL' || vendor.status === 'REJECTED') {
      return this.fail(409, 'vendor-not-approved', 'المورد غير معتمد', 'لا تُقبل فاتورة لمورد غير معتمد.');
    }
    const newInvId = `sinv-${input.idempotencyKey}`.slice(0, 60);
    const refKey = input.vendorInvoiceRef.trim().toLowerCase();
    const sameVendor = await this.storage.listSupplierInvoices(tenantId, { vendorId: po.vendorId });
    if (sameVendor.success && (sameVendor.data || []).some((x: any) => x.id !== newInvId && !['REJECTED', 'CANCELLED'].includes(x.status) && String(x.vendorInvoiceRef || '').trim().toLowerCase() === refKey)) {
      return this.fail(409, 'duplicate-vendor-invoice', 'فاتورة مورد مكررة', `رقم فاتورة المورد ${input.vendorInvoiceRef.trim()} مسجّل مسبقًا لنفس المورد.`);
    }
    const tol = await this.tolerancePct(tenantId);
    const invLines: SupplierInvoiceLine[] = [];
    let i = 0; let subtotal = 0;
    for (const raw of input.lines) {
      const qty = parsePositiveQuantity(raw.invoicedQty, 'كمية الفاتورة');
      if (!qty.ok) return this.fail(400, 'invalid-qty', 'كمية غير صالحة', qty.detail);
      const price = parseNonNegativeMoney(raw.unitPrice, 'سعر الوحدة');
      if (!price.ok) return this.fail(400, 'invalid-price', 'سعر غير صالح', price.detail);
      const pl = poLines.find((p) => p.id === raw.poLineId);
      if (!pl) return this.fail(400, 'invalid-po-line', 'سطر أمر شراء غير صالح', `السطر ${raw.poLineId} لا يتبع أمر الشراء.`);
      if (pl.itemId !== raw.itemId) return this.fail(400, 'item-mismatch', 'عدم تطابق الصنف', 'صنف سطر الفاتورة لا يطابق سطر أمر الشراء.');
      i += 1;
      const lineTotal = Number((qty.value * price.value).toFixed(4));
      subtotal += lineTotal;
      invLines.push({
        id: `sil-${input.idempotencyKey}-${i}`.slice(0, 80), tenantId, invoiceId: '', lineNumber: i,
        poLineId: raw.poLineId, itemId: raw.itemId, invoicedQty: qty.value, unitPrice: price.value, lineTotal,
        taxAmount: raw.taxAmount, notes: raw.notes,
      });
    }
    const lineTax = Number(invLines.reduce((t, l) => t + Number(l.taxAmount || 0), 0).toFixed(4));
    if (input.taxAmount != null && lineTax > 0 && Math.abs(Number(input.taxAmount) - lineTax) > 0.005) {
      return this.fail(400, 'tax-mismatch', 'عدم تطابق الضريبة', `ضريبة الرأس ${input.taxAmount} لا تساوي مجموع ضرائب البنود ${lineTax}.`);
    }
    const taxAmount = Number((input.taxAmount != null ? Number(input.taxAmount) : lineTax) || 0);
    const seq = await this.numbering.generateNumber(tenantId, 'SUPPLIER_INVOICE', 'SINV', `${input.idempotencyKey}-num`);
    if (!seq.success || !seq.data) return seq as any;
    const invId = `sinv-${input.idempotencyKey}`.slice(0, 60);
    for (const l of invLines) l.invoiceId = invId;
    const inv: SupplierInvoice = {
      id: invId, tenantId, invoiceNumber: seq.data.formattedCode, vendorInvoiceRef: input.vendorInvoiceRef.trim(),
      poId: po.id, poNumber: po.poNumber, vendorId: po.vendorId, vendorName: po.vendorName, receiptId: input.receiptId,
      status: 'MATCH_PENDING', invoiceDate: (input.invoiceDate || new Date().toISOString()).slice(0, 10),
      dueDate: input.dueDate?.slice(0, 10), subtotal: Number(subtotal.toFixed(4)), taxAmount,
      totalAmount: Number((subtotal + taxAmount).toFixed(4)), matchTolerancePct: tol, notes: input.notes,
      createdBy: input.createdBy, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const saved = await this.storage.saveSupplierInvoice(tenantId, inv, invLines, input.idempotencyKey);
    if (!saved.success) return saved as any;
    let match: ThreeWayMatchResult | undefined;
    if (input.autoMatch !== false) {
      const mr = await this.runThreeWayMatch(tenantId, invId);
      if (mr.success && mr.data) match = mr.data;
    }
    const fresh = await this.storage.getSupplierInvoice(tenantId, invId);
    return { success: true, data: { invoice: fresh.data?.invoice || saved.data!, lines: fresh.data?.lines || invLines, match } };
  }

  public async runThreeWayMatch(tenantId: string, invoiceId: string): Promise<SvcResult<ThreeWayMatchResult>> {
    const full = await this.storage.getSupplierInvoice(tenantId, invoiceId);
    if (!full.success || !full.data) return this.fail(404, 'invoice-not-found', 'فاتورة المورد غير موجودة', 'تعذر العثور على الفاتورة.');
    const { invoice, lines } = full.data;
    if (invoice.status === 'POSTED' || invoice.status === 'CANCELLED') {
      return this.fail(409, 'invalid-invoice-status', 'حالة غير صالحة', 'لا تُعاد مطابقة فاتورة مرحّلة أو ملغاة.');
    }
    const poFull = await this.storage.getPurchaseOrder(tenantId, invoice.poId);
    if (!poFull.success || !poFull.data) return this.fail(404, 'po-not-found', 'أمر الشراء غير موجود', 'تعذر تحميل أمر الشراء للمطابقة.');
    const poLines = poFull.data.lines;
    const tol = Number(invoice.matchTolerancePct) || 0;
    const tolFactor = 1 + tol / 100;
    const prior = await this.invoicedElsewhere(tenantId, invoice.poId, invoiceId);
    const lineResults: ThreeWayMatchLineResult[] = [];
    let allOk = true;
    for (const il of lines) {
      const pl = poLines.find((p) => p.id === il.poLineId);
      if (!pl) {
        allOk = false;
        lineResults.push({ poLineId: il.poLineId, itemId: il.itemId, orderedQty: 0, receivedQty: 0, invoicedQty: il.invoicedQty, poUnitCost: 0, invoiceUnitPrice: il.unitPrice, qtyOk: false, priceOk: false, detailAr: 'سطر أمر الشراء غير موجود' });
        continue;
      }
      const ordered = Number(pl.orderedQty), received = Number(pl.receivedQty), invoiced = Number(il.invoicedQty);
      const poCost = Number(pl.unitCost), invPrice = Number(il.unitPrice);
      const before = prior.get(il.poLineId) || 0;
      const cumulative = before + invoiced;
      const qtyOk = cumulative <= received * tolFactor + 1e-6 && cumulative <= ordered * tolFactor + 1e-6 && invoiced > 0;
      let priceOk = true;
      if (poCost === 0) priceOk = invPrice === 0;
      else priceOk = Math.abs(invPrice - poCost) / poCost <= (tol / 100) + 1e-9;
      if (!qtyOk || !priceOk) allOk = false;
      const parts: string[] = [];
      if (!qtyOk) parts.push(`الكمية المفوترة تراكميًا ${cumulative} (سابقًا ${before} + هذه ${invoiced}) خارج التسامح (مستلم ${received} / مطلوب ${ordered}، ±${tol}%)`);
      if (!priceOk) parts.push(`سعر ${invPrice} يختلف عن تكلفة الأمر ${poCost} بأكثر من ${tol}%`);
      if (qtyOk && priceOk) parts.push('مطابق ضمن التسامح');
      lineResults.push({ poLineId: il.poLineId, itemId: il.itemId, orderedQty: ordered, receivedQty: received, invoicedQty: invoiced, poUnitCost: poCost, invoiceUnitPrice: invPrice, qtyOk, priceOk, detailAr: parts.join('؛ ') });
    }
    const summaryAr = allOk ? `نجحت المطابقة الثلاثية ضمن تسامح ${tol}%` : `فشلت المطابقة الثلاثية: ${lineResults.filter((l) => !l.qtyOk || !l.priceOk).length} بند/بنود خارج التسامح`;
    const result: ThreeWayMatchResult = { invoiceId, passed: allOk, tolerancePct: tol, lines: lineResults, summaryAr };
    await this.storage.updateSupplierInvoice(tenantId, { ...invoice, status: allOk ? 'MATCHED' : 'MATCH_FAILED', matchSummary: summaryAr, updatedAt: new Date().toISOString() });
    if (!allOk) {
      await DomainEventBus.publish({ eventType: 'THREE_WAY_MATCH_FAILED', tenantId, actorId: invoice.createdBy, actorName: invoice.createdBy, payload: { invoiceId, poId: invoice.poId, summaryAr } });
    }
    return { success: true, data: result };
  }

  public async approveSupplierInvoice(tenantId: string, invoiceId: string, actorId: string, idempotencyKey: string): Promise<SvcResult<{ invoice: SupplierInvoice; journalEntryId?: string }>> {
    const full = await this.storage.getSupplierInvoice(tenantId, invoiceId);
    if (!full.success || !full.data) return this.fail(404, 'invoice-not-found', 'فاتورة المورد غير موجودة', 'تعذر العثور على الفاتورة.');
    let invoice = full.data.invoice;
    const lines = full.data.lines;
    if (invoice.status === 'POSTED') return { success: true, data: { invoice, journalEntryId: invoice.journalEntryId } };
    if (invoice.status === 'REJECTED' || invoice.status === 'CANCELLED') return this.fail(409, 'invalid-invoice-status', 'حالة غير صالحة', 'لا يمكن اعتماد فاتورة مرفوضة أو ملغاة.');
    if (actorId === invoice.createdBy) return this.fail(403, 'sod-violation', 'تعارض فصل المهام', 'منشئ فاتورة المورد لا يجوز له اعتمادها بنفسه.');
    // Always re-match right before posting: another invoice may have consumed the received quantity since this one was matched.
    const mr = await this.runThreeWayMatch(tenantId, invoiceId);
    if (!mr.success || !mr.data?.passed) {
      return this.fail(422, 'three-way-match-failed', 'فشل المطابقة الثلاثية', mr.data?.summaryAr || mr.error?.detail || 'لا يمكن اعتماد فاتورة غير متطابقة.');
    }
    const refreshed = await this.storage.getSupplierInvoice(tenantId, invoiceId);
    if (refreshed.success && refreshed.data) invoice = refreshed.data.invoice;

    // --- accounts (no hard-coded codes in the entry itself) -------------------------------------
    const po = await this.storage.getPurchaseOrder(tenantId, invoice.poId);
    if (!po.success || !po.data) return this.fail(404, 'po-not-found', 'أمر الشراء غير موجود', 'تعذر تحميل أمر الشراء لتحديد قيمة تسوية GR/IR.');
    const cfgRes = await this.storage.getStockAccountingConfig(tenantId);
    const grir = (cfgRes.success && cfgRes.data ? cfgRes.data : defaultStockAccountingConfig(tenantId)).grirAccountCode;
    const apCode = await this.policyAccount(tenantId, 'ap_account_code', invoice.invoiceDate, '2101');
    const vatCode = await this.policyAccount(tenantId, 'vat_input_account_code', invoice.invoiceDate, '1108');
    const varCode = await this.policyAccount(tenantId, 'purchase_price_variance_account_code', invoice.invoiceDate, null);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const clearing = r2(lines.reduce((t, l) => { const pl = po.data!.lines.find((p) => p.id === l.poLineId); return t + Number(l.invoicedQty) * Number(pl ? pl.unitCost : l.unitPrice); }, 0));
    const subtotal = r2(Number(invoice.subtotal)), tax = r2(Number(invoice.taxAmount || 0)), total = r2(subtotal + tax);
    const variance = r2(subtotal - clearing);
    if (Math.abs(variance) >= 0.01 && !varCode) {
      return this.fail(422, 'variance-account-missing', 'حساب فروق الأسعار غير مُعدّ', `الفاتورة تختلف عن تكلفة أمر الشراء بمقدار ${variance}. حدّد حساب فروق أسعار المشتريات (السياسة purchase_price_variance_account_code) قبل الاعتماد.`);
    }
    const need: Array<[string, string[], string]> = [[grir, ['LIABILITY'], 'GR/IR'], [apCode as string, ['LIABILITY'], 'الموردين']];
    if (tax > 0) need.push([vatCode as string, ['ASSET'], 'ضريبة المشتريات']);
    if (Math.abs(variance) >= 0.01) need.push([varCode as string, ['EXPENSE', 'ASSET'], 'فروق الأسعار']);
    for (const [code, types, label] of need) {
      if (!code || !(await this.usableAccount(tenantId, code, types))) return this.fail(422, 'account-not-usable', 'حساب غير صالح', `حساب ${label} (${code || 'غير محدد'}) غير موجود أو غير نشط أو من نوع غير مناسب في دليل حسابات المنشأة.`);
    }

    // --- one balanced entry, posted ONLY through PostingEngine; deterministic id => safe retry -----
    const jeId = `je-sinv-${invoice.id}`.slice(0, 60);
    const posting = new PostingEngine(this.storage);
    const existing = await this.storage.getJournalEntry(tenantId, jeId);
    let journalId = jeId;
    if (!existing.success || !existing.data) {
      const jl: any[] = [{ id: `${jeId}-grir`, accountCode: grir, debit: clearing, credit: 0, description: 'تسوية بضاعة مستلمة لم تُفوتر' }];
      if (tax > 0) jl.push({ id: `${jeId}-vat`, accountCode: vatCode, debit: tax, credit: 0, description: 'ضريبة مشتريات' });
      if (variance >= 0.01) jl.push({ id: `${jeId}-var`, accountCode: varCode, debit: variance, credit: 0, description: 'فرق سعر مشتريات' });
      if (variance <= -0.01) jl.push({ id: `${jeId}-var`, accountCode: varCode, debit: 0, credit: -variance, description: 'فرق سعر مشتريات' });
      jl.push({ id: `${jeId}-ap`, accountCode: apCode, debit: 0, credit: total, description: `ذمم ${invoice.vendorName}` });
      const entry: any = {
        id: jeId, code: invoice.invoiceNumber, tenantId, date: invoice.invoiceDate, type: 'SUPPLIER_INVOICE',
        description: `فاتورة مورد ${invoice.vendorInvoiceRef} / ${invoice.invoiceNumber} — أمر ${invoice.poNumber}`,
        status: 'APPROVED', totalAmount: r2(jl.reduce((t, l) => t + l.debit, 0)), lines: jl, createdBy: actorId,
      };
      const drafted = await posting.draftEntry(tenantId, entry, `${idempotencyKey}-je`);
      if (drafted.success && drafted.data) journalId = drafted.data.id;
      else {
        // A concurrent approval of the same invoice may have created the entry between our read and our insert: re-read before failing.
        const raced = await this.storage.getJournalEntry(tenantId, jeId);
        if (!raced.success || !raced.data) return this.fail(drafted.error?.status || 500, 'journal-failed', 'فشل إنشاء القيد', drafted.error?.detail || 'تعذر إنشاء قيد الفاتورة.');
        journalId = raced.data.id;
      }
    } else { journalId = existing.data.id; }
    const posted = await posting.postEntry(tenantId, journalId, `${idempotencyKey}-post`);
    if (!posted.success) {
      const now = await this.storage.getJournalEntry(tenantId, journalId);
      if (!(now.success && now.data && now.data.status === 'POSTED')) {
        // Entry exists but another request is still posting it: ask the caller to retry (clean 409), never a 5xx for a lost race.
        const inFlight = now.success && !!now.data;
        return this.fail(inFlight ? 409 : (posted.error?.status || 500), inFlight ? 'approval-in-progress' : 'journal-post-failed', inFlight ? 'اعتماد الفاتورة قيد التنفيذ' : 'فشل ترحيل القيد', inFlight ? 'طلب اعتماد آخر لنفس الفاتورة قيد التنفيذ. أعد المحاولة بعد لحظات.' : (posted.error?.detail || 'تعذر ترحيل قيد الفاتورة. أعد المحاولة: القيد محفوظ ولن يتكرر.'));
      }
    }
    const updated: SupplierInvoice = {
      ...invoice, status: 'POSTED', journalEntryId: journalId, approvedBy: actorId,
      approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const up = await this.storage.updateSupplierInvoice(tenantId, updated);
    if (!up.success) return this.fail(500, 'invoice-update-failed', 'القيد رُحّل لكن تحديث الفاتورة فشل', `القيد ${journalId} مرحّل. أعد استدعاء الاعتماد لإكمال تحديث حالة الفاتورة (لن يتكرر القيد).`);
    await DomainEventBus.publish({
      eventType: 'SUPPLIER_INVOICE_APPROVED', tenantId, actorId, actorName: actorId,
      payload: { invoiceId, journalEntryId: journalId, poId: invoice.poId, totalAmount: total }, idempotencyKey,
    });
    return { success: true, data: { invoice: up.data!, journalEntryId: journalId } };
  }

  public async rejectSupplierInvoice(tenantId: string, invoiceId: string, actorId: string, reason: string): Promise<SvcResult<SupplierInvoice>> {
    const full = await this.storage.getSupplierInvoice(tenantId, invoiceId);
    if (!full.success || !full.data) return this.fail(404, 'invoice-not-found', 'فاتورة المورد غير موجودة', 'تعذر العثور على الفاتورة.');
    if (full.data.invoice.status === 'POSTED') return this.fail(409, 'already-posted', 'فاتورة مرحّلة', 'لا يمكن رفض فاتورة مرحّلة محاسبيًا.');
    return this.storage.updateSupplierInvoice(tenantId, {
      ...full.data.invoice, status: 'REJECTED', rejectedReason: reason || 'مرفوضة', updatedAt: new Date().toISOString(),
    });
  }

  public async getSupplierInvoice(tenantId: string, id: string) { return this.storage.getSupplierInvoice(tenantId, id); }
  public async listSupplierInvoices(tenantId: string, filter?: { status?: string; poId?: string; vendorId?: string }) {
    return this.storage.listSupplierInvoices(tenantId, filter);
  }

}
