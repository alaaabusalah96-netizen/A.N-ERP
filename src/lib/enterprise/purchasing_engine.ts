import { Firestore } from 'firebase/firestore';
import { EventEnvelope, FsmConfig } from '../../types/enterprise';
import { BusinessEngineContract, EngineExecutionResult } from './warehouse_contracts';
import { DocumentLifecycleEngine } from './lifecycle';
import { SequenceEngine } from './sequence';
import { AuditLogEngine } from './audit';
import { createBaseMetadata, updateBaseMetadata } from './metadata';
import { PurchaseRequest, PurchaseOrder, Vendor, PRStatus, POStatus, RFQ, VendorQuotation, PurchasingWorkflowConfig, VendorAPStatementItem } from '../../types/purchasing';
import { StorageEngine } from '../../db/storage';
import { db } from '../../firebase';
import { syncWriteWithOfflineFallback } from '../../db/offlineQueue';
import { InventoryModule } from '../../db/inventory';
import { AccountingBusinessEngine } from './accounting_engine';
import { InventoryDocument } from '../../types/inventory';
import { CashVoucher } from '../../types';
import { ApprovalEngine } from '../../db/approvalEngine';
import { DocumentNumberEngine } from '../../db/documentNumberEngine';
import { CostCenterEngine } from '../../db/costCenterEngine';
import { OrganizationEngine } from '../../db/organizationEngine';

export const PURCHASING_COLLECTIONS = {
  WORKFLOW_CONFIGS: 'purchasing_workflow_configs',
  VENDORS: 'vendors',
  PURCHASE_REQUESTS: 'purchase_requests',
  PURCHASE_ORDERS: 'purchase_orders',
  RFQS: 'rfqs',
  VENDOR_QUOTATIONS: 'vendor_quotations',
  INVENTORY_DOCUMENTS: 'inventory_documents',
};

const DEFAULT_WORKFLOW_TEMPLATE: Omit<PurchasingWorkflowConfig, 'companyId'> = {
  prPrefix: 'PR',
  poPrefix: 'PO',
  rfqPrefix: 'RFQ',
  vendorPrefix: 'VND',
  requirePrApproval: true,
  prApprovalThresholds: [
    { maxAmount: 10000, requiredRoles: ['Admin', 'RegionalManager', 'SystemAdmin', 'StationAdmin'], labelAr: 'اعتماد مدير الفرع المباشر', labelEn: 'Direct Branch Manager Approval' },
    { maxAmount: 50000, requiredRoles: ['Admin', 'RegionalManager', 'SystemAdmin'], labelAr: 'اعتماد مدير المنطقة', labelEn: 'Regional Manager Approval' },
    { maxAmount: 999999999, requiredRoles: ['Admin', 'SystemAdmin'], labelAr: 'اعتماد المدير العام / التموين المركزي', labelEn: 'GM / Central Procurement Approval' }
  ],
  autoCreatePoOnPrApprove: false,
  requireRfqAboveAmount: 20000,
  allowDirectPoWithoutPr: true
};

const prFsmConfig: FsmConfig<PRStatus, string, any> = {
  documentType: 'PurchaseRequest',
  initialState: 'PENDING_APPROVAL',
  states: {
    DRAFT: { name: 'DRAFT', labelAr: 'مسودة', labelEn: 'Draft' },
    PENDING_APPROVAL: { name: 'PENDING_APPROVAL', labelAr: 'قيد الاعتماد', labelEn: 'Pending Approval' },
    APPROVED: { name: 'APPROVED', labelAr: 'معتمد', labelEn: 'Approved', isTerminal: true },
    REJECTED: { name: 'REJECTED', labelAr: 'مرفوض', labelEn: 'Rejected', isTerminal: true }
  },
  transitions: [
    {
      event: 'SUBMIT',
      from: 'DRAFT',
      to: 'PENDING_APPROVAL',
      labelAr: 'تقديم الطلب',
      labelEn: 'Submit Request',
      authorizedRoles: ['Admin', 'RegionalManager', 'SystemAdmin', 'StationAdmin']
    },
    {
      event: 'APPROVE',
      from: 'PENDING_APPROVAL',
      to: 'APPROVED',
      labelAr: 'اعتماد',
      labelEn: 'Approve',
      authorizedRoles: ['Admin', 'RegionalManager', 'SystemAdmin']
    },
    {
      event: 'REJECT',
      from: 'PENDING_APPROVAL',
      to: 'REJECTED',
      labelAr: 'رفض',
      labelEn: 'Reject',
      authorizedRoles: ['Admin', 'RegionalManager', 'SystemAdmin']
    }
  ]
};

const poFsmConfig: FsmConfig<POStatus, string, any> = {
  documentType: 'PurchaseOrder',
  initialState: 'ISSUED',
  states: {
    DRAFT: { name: 'DRAFT', labelAr: 'مسودة', labelEn: 'Draft' },
    ISSUED: { name: 'ISSUED', labelAr: 'صادر', labelEn: 'Issued' },
    RECEIVED: { name: 'RECEIVED', labelAr: 'مستلم', labelEn: 'Received', isTerminal: true },
    CANCELLED: { name: 'CANCELLED', labelAr: 'ملغى', labelEn: 'Cancelled', isTerminal: true }
  },
  transitions: [
    {
      event: 'ISSUE',
      from: 'DRAFT',
      to: 'ISSUED',
      labelAr: 'إصدار أمر الشراء',
      labelEn: 'Issue PO',
      authorizedRoles: ['Admin', 'RegionalManager', 'SystemAdmin']
    },
    {
      event: 'RECEIVE',
      from: 'ISSUED',
      to: 'RECEIVED',
      labelAr: 'استلام',
      labelEn: 'Receive',
      authorizedRoles: ['Admin', 'RegionalManager', 'SystemAdmin', 'StationAdmin']
    },
    {
      event: 'CANCEL',
      from: 'ISSUED',
      to: 'CANCELLED',
      labelAr: 'إلغاء أمر الشراء',
      labelEn: 'Cancel PO',
      authorizedRoles: ['Admin', 'RegionalManager', 'SystemAdmin']
    }
  ]
};

/**
 * Enterprise Purchasing & Procurement Business Engine
 * محرك المشتريات والتموين المركزي للمؤسسة
 * 
 * Manages Vendors, Purchase Requests (PR), Purchase Orders (PO), RFQs, Vendor Quotations,
 * Vendor Accounts Payable (AP) Ledgers, and Workflow Matrix configuration.
 */
export class PurchasingBusinessEngine implements BusinessEngineContract {
  engineId = 'purchasing_business_engine';
  supportedEvents = [
    'PR_SUBMITTED',
    'PR_APPROVED',
    'PR_REJECTED',
    'PO_ISSUED',
    'PO_RECEIVED',
    'RFQ_CREATED',
    'QUOTATION_SUBMITTED',
    'QUOTATION_ACCEPTED'
  ];

  private auditEngine = new AuditLogEngine();

  // Standard in-memory / local storage helper methods
  static getWorkflowConfig(companyId: string): PurchasingWorkflowConfig {
    if (!companyId || !companyId.trim()) {
      throw new Error('Valid companyId is required to retrieve purchasing workflow configuration.');
    }
    const list = StorageEngine.getStored<PurchasingWorkflowConfig[]>('purchasing_workflow_configs', []);
    const found = list.find(c => c.companyId === companyId);
    if (found) return found;

    return { ...DEFAULT_WORKFLOW_TEMPLATE, companyId };
  }

  static async saveWorkflowConfig(config: PurchasingWorkflowConfig): Promise<{ success: boolean; error?: string }> {
    const res = await syncWriteWithOfflineFallback(PURCHASING_COLLECTIONS.WORKFLOW_CONFIGS, config.companyId, config);
    if (!res.success) {
      return { success: false, error: res.error || 'فشل مزامنة إعدادات المشتريات مع السحابة' };
    }
    const list = StorageEngine.getStored<PurchasingWorkflowConfig[]>('purchasing_workflow_configs', []);
    const idx = list.findIndex(c => c.companyId === config.companyId);
    if (idx !== -1) {
      list[idx] = config;
    } else {
      list.push(config);
    }
    StorageEngine.setStored('purchasing_workflow_configs', list);
    return { success: true };
  }

  static getVendors(companyId: string): Vendor[] {
    const list = StorageEngine.getStored<Vendor[]>('vendors', []);
    return list.filter(v => v.company_id === companyId);
  }

  static async addVendor(companyId: string, nameAr: string, nameEn: string, phone?: string, email?: string, taxNo?: string, address?: string): Promise<{ success: boolean; vendor?: Vendor; error?: string }> {
    const list = StorageEngine.getStored<Vendor[]>('vendors', []);
    const config = PurchasingBusinessEngine.getWorkflowConfig(companyId);
    const prefix = config.vendorPrefix || 'VND';

    const newVendor: Vendor = {
      id: `vnd-${crypto.randomUUID()}`,
      company_id: companyId,
      nameAr,
      nameEn,
      code: `${prefix}-${list.length + 1001}`,
      phone,
      email,
      taxNo,
      address,
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };

    const res = await syncWriteWithOfflineFallback(PURCHASING_COLLECTIONS.VENDORS, newVendor.id, newVendor);
    if (!res.success) {
      return { success: false, error: res.error || 'فشل مزامنة المورد مع السحابة' };
    }

    list.push(newVendor);
    StorageEngine.setStored('vendors', list);
    return { success: true, vendor: newVendor };
  }

  static getPurchaseRequests(companyId: string): PurchaseRequest[] {
    const list = StorageEngine.getStored<PurchaseRequest[]>('purchase_requests', []);
    return list.filter(pr => pr.company_id === companyId);
  }

  static getPurchaseRequestsByOrgUnit(companyId: string, org_unit_id: string, includeSubtree = true): PurchaseRequest[] {
    const all = PurchasingBusinessEngine.getPurchaseRequests(companyId);
    if (!org_unit_id) return all;

    if (!includeSubtree) {
      return all.filter(pr => pr.org_unit_id === org_unit_id);
    }

    const descendants = OrganizationEngine.getDescendantUnits(org_unit_id, companyId);
    const validUnitIds = new Set([org_unit_id, ...descendants.map(u => u.id)]);
    return all.filter(pr => pr.org_unit_id && validUnitIds.has(pr.org_unit_id));
  }

  static getPurchaseOrders(companyId: string): PurchaseOrder[] {
    const list = StorageEngine.getStored<PurchaseOrder[]>('purchase_orders', []);
    return list.filter(po => po.company_id === companyId);
  }

  static getPurchaseOrdersByOrgUnit(companyId: string, org_unit_id: string, includeSubtree = true): PurchaseOrder[] {
    const all = PurchasingBusinessEngine.getPurchaseOrders(companyId);
    if (!org_unit_id) return all;

    if (!includeSubtree) {
      return all.filter(po => po.org_unit_id === org_unit_id);
    }

    const descendants = OrganizationEngine.getDescendantUnits(org_unit_id, companyId);
    const validUnitIds = new Set([org_unit_id, ...descendants.map(u => u.id)]);
    return all.filter(po => po.org_unit_id && validUnitIds.has(po.org_unit_id));
  }

  static async savePurchaseRequests(list: PurchaseRequest[]): Promise<{ success: boolean; error?: string }> {
    for (const pr of list) {
      const res = await syncWriteWithOfflineFallback(PURCHASING_COLLECTIONS.PURCHASE_REQUESTS, pr.id, pr);
      if (!res.success) {
        return { success: false, error: res.error || `فشل مزامنة طلب الشراء ${pr.id} مع السحابة` };
      }
    }
    StorageEngine.setStored('purchase_requests', list);
    return { success: true };
  }

  static async savePurchaseOrders(list: PurchaseOrder[]): Promise<{ success: boolean; error?: string }> {
    for (const po of list) {
      const res = await syncWriteWithOfflineFallback(PURCHASING_COLLECTIONS.PURCHASE_ORDERS, po.id, po);
      if (!res.success) {
        return { success: false, error: res.error || `فشل مزامنة أمر الشراء ${po.id} مع السحابة` };
      }
    }
    StorageEngine.setStored('purchase_orders', list);
    return { success: true };
  }

  static getRFQs(companyId: string): RFQ[] {
    const list = StorageEngine.getStored<RFQ[]>('rfqs', []);
    return list.filter(r => r.company_id === companyId);
  }

  static async saveRFQs(list: RFQ[]): Promise<{ success: boolean; error?: string }> {
    for (const r of list) {
      const res = await syncWriteWithOfflineFallback(PURCHASING_COLLECTIONS.RFQS, r.id, r);
      if (!res.success) {
        return { success: false, error: res.error || `فشل مزامنة طلب عرض السعر ${r.id} مع السحابة` };
      }
    }
    StorageEngine.setStored('rfqs', list);
    return { success: true };
  }

  static getQuotations(companyId: string): VendorQuotation[] {
    const list = StorageEngine.getStored<VendorQuotation[]>('vendor_quotations', []);
    return list.filter(q => q.company_id === companyId);
  }

  static async saveQuotations(list: VendorQuotation[]): Promise<{ success: boolean; error?: string }> {
    for (const q of list) {
      const res = await syncWriteWithOfflineFallback(PURCHASING_COLLECTIONS.VENDOR_QUOTATIONS, q.id, q);
      if (!res.success) {
        return { success: false, error: res.error || `فشل مزامنة عرض السعر ${q.id} مع السحابة` };
      }
    }
    StorageEngine.setStored('vendor_quotations', list);
    return { success: true };
  }

  /**
   * Vendor AP Ledger Statement Calculation (كشف حساب المورد)
   * Calculates all purchases (invoices) and payments for a given vendor.
   */
  static getVendorAPStatement(companyId: string, vendorId: string): {
    vendor: Vendor | null;
    items: VendorAPStatementItem[];
    totalInvoiced: number;
    totalPaid: number;
    netBalance: number;
  } {
    const vendors = PurchasingBusinessEngine.getVendors(companyId);
    const vendor = vendors.find(v => v.id === vendorId) || null;
    if (!vendor) {
      return { vendor: null, items: [], totalInvoiced: 0, totalPaid: 0, netBalance: 0 };
    }

    const pos = PurchasingBusinessEngine.getPurchaseOrders(companyId).filter(po => po.vendorId === vendorId && po.status === 'RECEIVED');
    const cashVouchers = StorageEngine.getStored<CashVoucher[]>('CashVouchers', []).filter(v => 
      v.company_id === companyId && (
        v.recipient_name === vendor.nameAr ||
        v.recipient_name === vendor.nameEn ||
        v.notes?.includes(vendor.code) ||
        v.notes?.includes(vendor.nameAr)
      )
    );

    const statementItems: { date: string; docType: 'PO_RECEIPT' | 'PAYMENT_VOUCHER'; docNo: string; descriptionAr: string; descriptionEn: string; debit: number; credit: number }[] = [];

    // 1. PO Receipts (CREDIT -> Increases supplier liability/AP)
    pos.forEach(po => {
      statementItems.push({
        date: po.date,
        docType: 'PO_RECEIPT',
        docNo: po.poNumber,
        descriptionAr: `فاتورة توريد بضاعة - أمر شراء رقم ${po.poNumber}`,
        descriptionEn: `Goods Receipt Invoice - PO #${po.poNumber}`,
        debit: 0,
        credit: po.totalAmount
      });
    });

    // 2. Cash Payments to Vendor (DEBIT -> Reduces supplier liability/AP)
    cashVouchers.forEach(vc => {
      statementItems.push({
        date: vc.date,
        docType: 'PAYMENT_VOUCHER',
        docNo: vc.voucher_no,
        descriptionAr: `سند صرف نقدية للمورد - سند رقم ${vc.voucher_no}`,
        descriptionEn: `Supplier Cash Payment - Voucher #${vc.voucher_no}`,
        debit: vc.total_amount || vc.amount || 0,
        credit: 0
      });
    });

    // Sort chronologically
    statementItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    let totalInvoiced = 0;
    let totalPaid = 0;

    const items: VendorAPStatementItem[] = statementItems.map((item, idx) => {
      totalInvoiced += item.credit;
      totalPaid += item.debit;
      runningBalance += (item.credit - item.debit); // Positive balance means company owes the supplier

      return {
        id: `ap-stmt-${idx + 1}`,
        date: item.date,
        docType: item.docType,
        docNo: item.docNo,
        descriptionAr: item.descriptionAr,
        descriptionEn: item.descriptionEn,
        debit: item.debit,
        credit: item.credit,
        balance: runningBalance
      };
    });

    return {
      vendor,
      items,
      totalInvoiced,
      totalPaid,
      netBalance: runningBalance
    };
  }

  // --- central event processor ---
  async processEvent(event: EventEnvelope<any>): Promise<EngineExecutionResult<any>> {
    if (!this.supportedEvents.includes(event.eventType)) {
      return {
        success: false,
        engineId: this.engineId,
        eventId: event.eventId,
        processedAt: new Date().toISOString(),
        statusCode: 'UNSUPPORTED_EVENT',
        messageEn: `Unsupported purchasing event: ${event.eventType}`,
        messageAr: `الحدث غير مدعوم في محرك المشتريات: ${event.eventType}`
      };
    }

    try {
      // Log to audit trial
      await this.auditEngine.appendAuditRecord(event);

      const dbInstance = db as Firestore;
      const companyId = event.tenantId;
      const config = PurchasingBusinessEngine.getWorkflowConfig(companyId);

      switch (event.eventType) {
        case 'PR_SUBMITTED': {
          const { requesterId, requesterName, items, notes, department, org_unit_id, cost_center_id, costCenterId } = event.payload;

          // Check Creation Permission for PR (BUG-10)
          const allowedCreatorRoles = ['Admin', 'RegionalManager', 'SystemAdmin', 'StationAdmin'];
          if (!allowedCreatorRoles.includes(event.user_role)) {
            throw new Error(`User role (${event.user_role}) is not authorized to submit a Purchase Request`);
          }

          const targetOrgUnit = org_unit_id || undefined;
          let targetCostCenter = cost_center_id || costCenterId || undefined;

          if (targetOrgUnit && !targetCostCenter) {
            const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
            if (cc) targetCostCenter = cc.id;
          }

          // 1. Generate sequence using DocumentNumberEngine or fallback
          let prNumber: string;
          try {
            const docNumRes = await DocumentNumberEngine.generateNextNumberAsync({
              companyId,
              documentType: 'PR',
              org_unit_id: targetOrgUnit
            }, dbInstance);
            prNumber = docNumRes.documentNumber;
          } catch {
            prNumber = await SequenceEngine.generateNextSequence(
              dbInstance,
              companyId,
              'last_purchase_request_no',
              { prefix: config.prPrefix || 'PR', padding: 4, includeYear: true }
            );
          }

          // 2. Create the document
          const totalAmount = items.reduce((sum: number, it: any) => sum + (it.qty * it.estimatedPrice), 0);
          
          // Evaluate & Start dynamic Approval Engine Workflow
          const approvalEval = await ApprovalEngine.evaluateAndStartWorkflow({
            companyId,
            documentType: 'PURCHASE_REQUEST',
            documentId: '',
            amount: totalAmount,
            requesterId,
            requesterName
          });

          const initialStatus: PRStatus = approvalEval.isAutoApproved ? 'APPROVED' : 'PENDING_APPROVAL';

          const pr: PurchaseRequest = {
            id: `pr-${crypto.randomUUID()}`,
            company_id: companyId,
            org_unit_id: targetOrgUnit,
            cost_center_id: targetCostCenter,
            prNumber,
            requesterId,
            requesterName,
            department,
            date: new Date().toISOString().split('T')[0],
            items,
            totalAmount,
            status: initialStatus,
            notes,
            metadata: createBaseMetadata(companyId, requesterId)
          };

          if (approvalEval.instance) {
            approvalEval.instance.documentId = pr.id;
          }

          const allPRs = StorageEngine.getStored<PurchaseRequest[]>('purchase_requests', []);
          allPRs.push(pr);
          const savePrRes = await PurchasingBusinessEngine.savePurchaseRequests(allPRs);
          if (!savePrRes.success) {
            throw new Error(savePrRes.error || 'فشل حفظ طلب الشراء في السحابة');
          }

          return {
            success: true,
            engineId: this.engineId,
            eventId: event.eventId,
            processedAt: new Date().toISOString(),
            statusCode: 'SUCCESS',
            messageEn: `Purchase Request ${prNumber} created successfully.`,
            messageAr: `تم إنشاء طلب الشراء ${prNumber} وإرساله للاعتماد بنجاح.`,
            outputData: pr
          };
        }

        case 'PR_APPROVED': {
          const { prId, version, comments } = event.payload;
          const allPRs = StorageEngine.getStored<PurchaseRequest[]>('purchase_requests', []);
          const idx = allPRs.findIndex(pr => pr.id === prId);
          if (idx === -1) throw new Error('Purchase Request not found');

          // Concurrency lock check (BUG-07)
          if (version !== undefined && allPRs[idx].metadata.version !== version) {
            throw new Error('⚠️ عذراً، تم تعديل هذا الطلب بواسطة مستخدم آخر. يرجى تحديث الصفحة والمحاولة مجدداً. / This Purchase Request has been modified by another user. Please refresh and try again.');
          }

          // Check if dynamic Approval Engine Instance exists for this PR
          const activeApprovalInstance = ApprovalEngine.getInstanceByDocumentId(prId);
          let isFinalApproval = true;

          if (activeApprovalInstance) {
            const stepResult = await ApprovalEngine.approveStep({
              instanceId: activeApprovalInstance.id,
              actor: { id: event.user_id, name: event.user_role, role: event.user_role },
              comments
            });
            isFinalApproval = stepResult.isFinalApproval;
          } else {
            // Fallback Threshold Authorization Check based on Config
            const prAmount = allPRs[idx].totalAmount;
            const requiredThreshold = config.prApprovalThresholds.find(t => prAmount <= t.maxAmount) || config.prApprovalThresholds[config.prApprovalThresholds.length - 1];
            if (requiredThreshold && !requiredThreshold.requiredRoles.includes(event.user_role)) {
              throw new Error(`⚠️ يتطلب اعتماد هذا الطلب (مبلغ ${prAmount.toLocaleString()} ج.م) صلاحية أعلى: ${requiredThreshold.labelAr}`);
            }

            // FSM Transition Check (BUG-10)
            const fsm = new DocumentLifecycleEngine(prFsmConfig);
            const clearance = await fsm.canTransition(allPRs[idx].status, 'APPROVE', event.user_role, allPRs[idx]);
            if (!clearance.can) {
              throw new Error(`Lifecycle check failed: ${clearance.reasonEn}`);
            }
          }

          if (isFinalApproval) {
            allPRs[idx].status = 'APPROVED';
          } else {
            allPRs[idx].status = 'PENDING_APPROVAL';
          }

          allPRs[idx].metadata = updateBaseMetadata(allPRs[idx].metadata, event.user_id);
          const saveApproveRes = await PurchasingBusinessEngine.savePurchaseRequests(allPRs);
          if (!saveApproveRes.success) {
            throw new Error(saveApproveRes.error || 'فشل اعتماد طلب الشراء في السحابة');
          }

          // Auto PO Creation if configured
          let createdPo: PurchaseOrder | null = null;
          if (config.autoCreatePoOnPrApprove) {
            const vendors = PurchasingBusinessEngine.getVendors(companyId);
            if (vendors.length > 0) {
              const defaultVendor = vendors[0];
              const poNum = await SequenceEngine.generateNextSequence(
                dbInstance,
                companyId,
                'last_purchase_order_no',
                { prefix: config.poPrefix || 'PO', padding: 4, includeYear: true }
              );

              createdPo = {
                id: `po-${crypto.randomUUID()}`,
                company_id: companyId,
                poNumber: poNum,
                prId: allPRs[idx].id,
                prNumber: allPRs[idx].prNumber,
                vendorId: defaultVendor.id,
                vendorName: defaultVendor.nameAr,
                date: new Date().toISOString().split('T')[0],
                items: allPRs[idx].items.map(it => ({
                  productId: it.productId,
                  productCode: it.productCode,
                  productName: it.productName,
                  unit: it.unit,
                  qty: it.qty,
                  unitPrice: it.estimatedPrice,
                  totalPrice: it.qty * it.estimatedPrice
                })),
                totalAmount: allPRs[idx].totalAmount,
                status: 'ISSUED',
                notes: `Auto-generated on PR ${allPRs[idx].prNumber} approval.`,
                metadata: createBaseMetadata(companyId, event.user_id)
              };

              const allPOs = StorageEngine.getStored<PurchaseOrder[]>('purchase_orders', []);
              allPOs.push(createdPo);
              const savePoRes = await PurchasingBusinessEngine.savePurchaseOrders(allPOs);
              if (!savePoRes.success) {
                console.error('Failed to auto-save generated Purchase Order:', savePoRes.error);
              }
            }
          }

          return {
            success: true,
            engineId: this.engineId,
            eventId: event.eventId,
            processedAt: new Date().toISOString(),
            statusCode: 'SUCCESS',
            messageEn: createdPo ? `PR approved and PO ${createdPo.poNumber} auto-generated.` : 'Purchase Request approved.',
            messageAr: createdPo ? `تم اعتماد طلب الشراء وإنشاء أمر التوريد ${createdPo.poNumber} أوتوماتيكياً.` : 'تم اعتماد طلب الشراء بنجاح.'
          };
        }

        case 'PR_REJECTED': {
          const { prId, version } = event.payload;
          const allPRs = StorageEngine.getStored<PurchaseRequest[]>('purchase_requests', []);
          const idx = allPRs.findIndex(pr => pr.id === prId);
          if (idx === -1) throw new Error('Purchase Request not found');

          // Concurrency lock check (BUG-07)
          if (version !== undefined && allPRs[idx].metadata.version !== version) {
            throw new Error('⚠️ عذراً، تم تعديل هذا الطلب بواسطة مستخدم آخر. يرجى تحديث الصفحة والمحاولة مجدداً. / This Purchase Request has been modified by another user. Please refresh and try again.');
          }

          // FSM Transition Check (BUG-10)
          const fsm = new DocumentLifecycleEngine(prFsmConfig);
          const clearance = await fsm.canTransition(allPRs[idx].status, 'REJECT', event.user_role, allPRs[idx]);
          if (!clearance.can) {
            throw new Error(`Lifecycle check failed: ${clearance.reasonEn}`);
          }

          allPRs[idx].status = 'REJECTED';
          allPRs[idx].metadata = updateBaseMetadata(allPRs[idx].metadata, event.user_id);
          const saveRejectRes = await PurchasingBusinessEngine.savePurchaseRequests(allPRs);
          if (!saveRejectRes.success) {
            throw new Error(saveRejectRes.error || 'فشل رفض طلب الشراء في السحابة');
          }

          return {
            success: true,
            engineId: this.engineId,
            eventId: event.eventId,
            processedAt: new Date().toISOString(),
            statusCode: 'SUCCESS',
            messageEn: 'Purchase Request rejected.',
            messageAr: 'تم رفض طلب الشراء.'
          };
        }

        case 'PO_ISSUED': {
          const { prId, vendorId, items, notes, deliveryWarehouseId, org_unit_id, cost_center_id, costCenterId } = event.payload;

          // Check Creation Permission for PO (BUG-10)
          const allowedIssuerRoles = ['Admin', 'RegionalManager', 'SystemAdmin'];
          if (!allowedIssuerRoles.includes(event.user_role)) {
            throw new Error(`User role (${event.user_role}) is not authorized to issue a Purchase Order`);
          }

          // Fetch vendor
          const vendors = StorageEngine.getStored<Vendor[]>('vendors', []);
          const vendor = vendors.find(v => v.id === vendorId);
          if (!vendor) throw new Error('Vendor not found');

          let prNum: string | undefined;
          let prOrgUnit: string | undefined;
          let prCostCenter: string | undefined;
          if (prId) {
            const allPRs = StorageEngine.getStored<PurchaseRequest[]>('purchase_requests', []);
            const prIdx = allPRs.findIndex(pr => pr.id === prId);
            if (prIdx !== -1) {
              prNum = allPRs[prIdx].prNumber;
              prOrgUnit = allPRs[prIdx].org_unit_id;
              prCostCenter = allPRs[prIdx].cost_center_id;
            }
          }

          const resolvedWhOrgUnit = deliveryWarehouseId ? InventoryModule.resolveWarehouseOrgUnit(deliveryWarehouseId, companyId) : undefined;
          const targetOrgUnit = org_unit_id || resolvedWhOrgUnit || prOrgUnit || undefined;
          let targetCostCenter = cost_center_id || costCenterId || prCostCenter || undefined;

          if (targetOrgUnit && !targetCostCenter) {
            const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
            if (cc) targetCostCenter = cc.id;
          }

          // Generate PO Sequence using DocumentNumberEngine or fallback SequenceEngine
          let poNumber: string;
          try {
            const docNumRes = await DocumentNumberEngine.generateNextNumberAsync({
              companyId,
              documentType: 'PO',
              org_unit_id: targetOrgUnit
            }, dbInstance);
            poNumber = docNumRes.documentNumber;
          } catch {
            poNumber = await SequenceEngine.generateNextSequence(
              dbInstance,
              companyId,
              'last_purchase_order_no',
              { prefix: config.poPrefix || 'PO', padding: 4, includeYear: true }
            );
          }

          const po: PurchaseOrder = {
            id: `po-${crypto.randomUUID()}`,
            company_id: companyId,
            org_unit_id: targetOrgUnit,
            cost_center_id: targetCostCenter,
            poNumber,
            prId,
            prNumber: prNum,
            vendorId,
            vendorName: vendor.nameAr,
            date: new Date().toISOString().split('T')[0],
            items: items.map((it: any) => ({
              ...it,
              totalPrice: it.qty * it.unitPrice
            })),
            totalAmount: items.reduce((sum: number, it: any) => sum + (it.qty * it.unitPrice), 0),
            status: 'ISSUED',
            notes,
            deliveryWarehouseId,
            metadata: createBaseMetadata(companyId, event.user_id)
          };

          const allPOs = StorageEngine.getStored<PurchaseOrder[]>('purchase_orders', []);
          allPOs.push(po);
          const saveIssueRes = await PurchasingBusinessEngine.savePurchaseOrders(allPOs);
          if (!saveIssueRes.success) {
            throw new Error(saveIssueRes.error || 'فشل حفظ أمر الشراء في السحابة');
          }

          return {
            success: true,
            engineId: this.engineId,
            eventId: event.eventId,
            processedAt: new Date().toISOString(),
            statusCode: 'SUCCESS',
            messageEn: `Purchase Order ${poNumber} issued successfully.`,
            messageAr: `تم إصدار أمر الشراء ${poNumber} بنجاح وإرساله للمورد.`,
            outputData: po
          };
        }

        case 'PO_RECEIVED': {
          const { poId, warehouseId, version } = event.payload;
          const allPOs = StorageEngine.getStored<PurchaseOrder[]>('purchase_orders', []);
          const idx = allPOs.findIndex(po => po.id === poId);
          if (idx === -1) throw new Error('Purchase Order not found');

          // Concurrency lock check (BUG-07)
          if (version !== undefined && allPOs[idx].metadata.version !== version) {
            throw new Error('⚠️ عذراً، تم تعديل هذا الأمر بواسطة مستخدم آخر. يرجى تحديث الصفحة والمحاولة مجدداً. / This Purchase Order has been modified by another user. Please refresh and try again.');
          }

          // FSM Transition Check (BUG-10)
          const fsm = new DocumentLifecycleEngine(poFsmConfig);
          const clearance = await fsm.canTransition(allPOs[idx].status, 'RECEIVE', event.user_role, allPOs[idx]);
          if (!clearance.can) {
            throw new Error(`Lifecycle check failed: ${clearance.reasonEn}`);
          }

          // 1. Change status
          allPOs[idx].status = 'RECEIVED';
          allPOs[idx].deliveryWarehouseId = warehouseId;
          allPOs[idx].metadata = updateBaseMetadata(allPOs[idx].metadata, event.user_id);
          const savePoRecRes = await PurchasingBusinessEngine.savePurchaseOrders(allPOs);
          if (!savePoRecRes.success) {
            throw new Error(savePoRecRes.error || 'فشل تحديث أمر الشراء في السحابة');
          }

          // 2. Automate stock receiving in specified Warehouse!
          const whs = InventoryModule.getWarehouses(companyId);
          const targetWh = whs.find(w => w.id === warehouseId);
          if (!targetWh) throw new Error('Target delivery warehouse not found');

          const resolvedWhOrgUnit = InventoryModule.resolveWarehouseOrgUnit(warehouseId, companyId);
          const targetOrgUnit = allPOs[idx].org_unit_id || resolvedWhOrgUnit || undefined;
          let targetCostCenter = allPOs[idx].cost_center_id || undefined;
          if (targetOrgUnit && !targetCostCenter) {
            const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
            if (cc) targetCostCenter = cc.id;
          }

          // Inject products directly into inventory via InventoryModule
          for (let itemIdx = 0; itemIdx < allPOs[idx].items.length; itemIdx++) {
            const item = allPOs[idx].items[itemIdx];
            const idempotencyKey = `po-rcv-${allPOs[idx].id}-${item.productId}-${itemIdx}`;
            await InventoryModule.adjustStock(
              warehouseId,
              item.productId,
              item.qty,
              'Receipt',
              event.user_id,
              undefined,
              idempotencyKey
            );
          }

          // 3. Save a formal Goods Receipt Document in Inventory Documents for unified ledger & history tracking!
          try {
            const receiptDocNo = await SequenceEngine.generateNextSequence(
              dbInstance,
              companyId,
              'last_receipt_doc_no',
              { prefix: 'REC', padding: 4, includeYear: true }
            );

            const newInvDoc: InventoryDocument = {
              id: `invdoc-${crypto.randomUUID()}`,
              doc_no: receiptDocNo,
              doc_type: 'Receipt',
              date: new Date().toISOString().split('T')[0],
              dest_entity_type: 'warehouse',
              dest_entity_id: warehouseId,
              org_unit_id: targetOrgUnit,
              cost_center_id: targetCostCenter,
              receipt_source_type: 'supplier',
              supplier_name: allPOs[idx].vendorName,
              ref_no: allPOs[idx].poNumber,
              reason: `استلام شحنة أمر شراء رقم ${allPOs[idx].poNumber} من المورد ${allPOs[idx].vendorName}`,
              status: 'Posted',
              company_id: companyId,
              tenantId: companyId,
              organizationId: companyId,
              version: 1,
              created_at: new Date().toISOString(),
              created_by: event.user_id,
              items: allPOs[idx].items.map(i => ({
                product_id: i.productId,
                product_code: i.productCode,
                product_name: i.productName,
                unit: i.unit || 'عدد',
                qty: i.qty,
                unit_price: i.unitPrice,
                total_price: i.totalPrice
              }))
            };

            const invDocRes = await syncWriteWithOfflineFallback(PURCHASING_COLLECTIONS.INVENTORY_DOCUMENTS, newInvDoc.id, newInvDoc);
            if (invDocRes.success) {
              const allInvDocs = StorageEngine.getStored<InventoryDocument[]>('inventory_documents', []);
              allInvDocs.push(newInvDoc);
              StorageEngine.setStored('inventory_documents', allInvDocs);
            }
          } catch (err) {
            console.error('Failed to create linked Inventory Goods Receipt document:', err);
          }

          // 4. Auto-post double-entry journal entry for stock receipt
          try {
            const amount = allPOs[idx].totalAmount;
            const poNum = allPOs[idx].poNumber;
            const statementAr = `قيد تلقائي: استلام بضاعة أمر الشراء ${poNum} للمستودع ${targetWh.name}`;
            const statementEn = `Auto-post: Stock Receipt for PO ${poNum} into warehouse ${targetWh.name}`;
            
            await AccountingBusinessEngine.postOperationalDoubleEntry(
              companyId,
              event.user_id,
              `PO #${poNum}`,
              statementAr,
              statementEn,
              [
                { accountCode: '120101', debit: amount, credit: 0, notes: `Debit: Warehouse Stock Inventory`, org_unit_id: targetOrgUnit, costCenterId: targetCostCenter, warehouseId },
                { accountCode: '210101', debit: 0, credit: amount, notes: `Credit: Accounts Payable (${allPOs[idx].vendorName})`, org_unit_id: targetOrgUnit, costCenterId: targetCostCenter }
              ],
              {
                org_unit_id: targetOrgUnit,
                warehouseId,
                costCenterId: targetCostCenter
              }
            );
          } catch (err) {
            console.error('Automated double-entry posting preparation for PO failed:', err);
          }

          return {
            success: true,
            engineId: this.engineId,
            eventId: event.eventId,
            processedAt: new Date().toISOString(),
            statusCode: 'SUCCESS',
            messageEn: 'Purchase Order items fully received. Warehouse stock updated and GL entries posted.',
            messageAr: 'تم استلام بنود أمر الشراء بالكامل، وتحديث المخزون وتوثيق إذن الاستلام المخزني وترحيل القيود المحاسبية.'
          };
        }

        case 'RFQ_CREATED': {
          const { prId, deadline, items, vendorIds, notes } = event.payload;

          const rfqNumber = await SequenceEngine.generateNextSequence(
            dbInstance,
            companyId,
            'last_rfq_no',
            { prefix: config.rfqPrefix || 'RFQ', padding: 4, includeYear: true }
          );

          let prNum: string | undefined;
          if (prId) {
            const allPRs = StorageEngine.getStored<PurchaseRequest[]>('purchase_requests', []);
            const foundPR = allPRs.find(p => p.id === prId);
            if (foundPR) prNum = foundPR.prNumber;
          }

          const rfq: RFQ = {
            id: `rfq-${crypto.randomUUID()}`,
            company_id: companyId,
            rfqNumber,
            prId,
            prNumber: prNum,
            date: new Date().toISOString().split('T')[0],
            deadline,
            items,
            vendorIds,
            status: 'SENT',
            notes,
            metadata: createBaseMetadata(companyId, event.user_id)
          };

          const allRFQs = StorageEngine.getStored<RFQ[]>('rfqs', []);
          allRFQs.push(rfq);
          const saveRfqRes = await PurchasingBusinessEngine.saveRFQs(allRFQs);
          if (!saveRfqRes.success) {
            throw new Error(saveRfqRes.error || 'فشل حفظ طلب عرض الأسعار في السحابة');
          }

          return {
            success: true,
            engineId: this.engineId,
            eventId: event.eventId,
            processedAt: new Date().toISOString(),
            statusCode: 'SUCCESS',
            messageEn: `RFQ ${rfqNumber} issued to vendors successfully.`,
            messageAr: `تم إصدار طلب عرض الأسعار ${rfqNumber} وتعميمه على الموردين بنجاح.`,
            outputData: rfq
          };
        }

        case 'QUOTATION_SUBMITTED': {
          const { rfqId, vendorId, quoteNumber, items, deliveryDays, paymentTerms, notes } = event.payload;
          const rfqs = PurchasingBusinessEngine.getRFQs(companyId);
          const rfq = rfqs.find(r => r.id === rfqId);
          if (!rfq) throw new Error('RFQ not found');

          const vendors = PurchasingBusinessEngine.getVendors(companyId);
          const vendor = vendors.find(v => v.id === vendorId);
          if (!vendor) throw new Error('Vendor not found');

          const totalAmount = items.reduce((sum: number, i: any) => sum + (i.qty * i.unitPrice), 0);

          const quote: VendorQuotation = {
            id: `quote-${crypto.randomUUID()}`,
            company_id: companyId,
            rfqId,
            rfqNumber: rfq.rfqNumber,
            vendorId,
            vendorName: vendor.nameAr,
            quoteNumber: quoteNumber || `QT-${Date.now().toString().substring(6)}`,
            date: new Date().toISOString().split('T')[0],
            deliveryDays,
            paymentTerms,
            items,
            totalAmount,
            status: 'SUBMITTED',
            notes,
            metadata: createBaseMetadata(companyId, event.user_id)
          };

          const quotes = StorageEngine.getStored<VendorQuotation[]>('vendor_quotations', []);
          quotes.push(quote);
          const saveQuoteRes = await PurchasingBusinessEngine.saveQuotations(quotes);
          if (!saveQuoteRes.success) {
            throw new Error(saveQuoteRes.error || 'فشل حفظ عرض السعر في السحابة');
          }

          return {
            success: true,
            engineId: this.engineId,
            eventId: event.eventId,
            processedAt: new Date().toISOString(),
            statusCode: 'SUCCESS',
            messageEn: `Vendor quotation ${quote.quoteNumber} recorded successfully.`,
            messageAr: `تم تسجيل عرض السعر المقدم من المورد ${vendor.nameAr} بنجاح.`,
            outputData: quote
          };
        }

        case 'QUOTATION_ACCEPTED': {
          const { quoteId } = event.payload;
          const quotes = StorageEngine.getStored<VendorQuotation[]>('vendor_quotations', []);
          const idx = quotes.findIndex(q => q.id === quoteId);
          if (idx === -1) throw new Error('Quotation not found');

          const quote = quotes[idx];
          quote.status = 'ACCEPTED';
          const saveAcceptRes = await PurchasingBusinessEngine.saveQuotations(quotes);
          if (!saveAcceptRes.success) {
            throw new Error(saveAcceptRes.error || 'فشل تحديث حالة عرض السعر في السحابة');
          }

          // Update RFQ status to completed
          const rfqs = StorageEngine.getStored<RFQ[]>('rfqs', []);
          const rfqIdx = rfqs.findIndex(r => r.id === quote.rfqId);
          if (rfqIdx !== -1) {
            rfqs[rfqIdx].status = 'COMPLETED';
            const saveRfqRes = await PurchasingBusinessEngine.saveRFQs(rfqs);
            if (!saveRfqRes.success) {
              console.error('Failed to update RFQ status in cloud:', saveRfqRes.error);
            }
          }

          // Automatically issue PO from the winning quote!
          const poNumber = await SequenceEngine.generateNextSequence(
            dbInstance,
            companyId,
            'last_purchase_order_no',
            { prefix: config.poPrefix || 'PO', padding: 4, includeYear: true }
          );

          const newPo: PurchaseOrder = {
            id: `po-${crypto.randomUUID()}`,
            company_id: companyId,
            poNumber,
            vendorId: quote.vendorId,
            vendorName: quote.vendorName,
            date: new Date().toISOString().split('T')[0],
            items: quote.items,
            totalAmount: quote.totalAmount,
            status: 'ISSUED',
            notes: `Issued automatically from accepted Vendor Quotation #${quote.quoteNumber} (RFQ #${quote.rfqNumber}).`,
            metadata: createBaseMetadata(companyId, event.user_id)
          };

          const allPOs = StorageEngine.getStored<PurchaseOrder[]>('purchase_orders', []);
          allPOs.push(newPo);
          const savePoRes = await PurchasingBusinessEngine.savePurchaseOrders(allPOs);
          if (!savePoRes.success) {
            throw new Error(savePoRes.error || 'فشل حفظ أمر الشراء المنشأ تلقائياً في السحابة');
          }

          return {
            success: true,
            engineId: this.engineId,
            eventId: event.eventId,
            processedAt: new Date().toISOString(),
            statusCode: 'SUCCESS',
            messageEn: `Quotation accepted. PO ${poNumber} issued to ${quote.vendorName}.`,
            messageAr: `تم قبول عرض السعر وإصدار أمر الشراء ${poNumber} للمورد ${quote.vendorName} بنجاح.`
          };
        }

        default:
          throw new Error(`Unimplemented purchasing event: ${event.eventType}`);
      }

    } catch (error: any) {
      const msg = error?.message || '';
      const parts = msg.includes(' / ') ? msg.split(' / ') : [msg, msg];
      return {
        success: false,
        engineId: this.engineId,
        eventId: event.eventId,
        processedAt: new Date().toISOString(),
        statusCode: 'EXECUTION_ERROR',
        messageEn: parts[1]?.trim() || msg || 'Unknown purchase processing error',
        messageAr: parts[0]?.trim() || msg || 'حدث خطأ مجهول أثناء معالجة المشتريات'
      };
    }
  }
}

