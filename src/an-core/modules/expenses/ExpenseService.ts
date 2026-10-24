/**
 * @file ExpenseService.ts
 * @description Core Domain Service for General & Operating Expenses (Phase 6 - Module 2 of 15)
 * Conforms to:
 * - 6A: Expense request by category + mandatory attachments above threshold.
 * - 6B: Independent approval workflow with amount-based multi-tier escalation (L1 -> L2).
 * - 6C: Automatic accounting integration (PostingEngine) with dimensions (cost center/project).
 * - 6D: Strict segregation from Cash Custody (petty cash expenses directed to Module 5).
 * - Section 7.1: Strict Segregation of Duties (SoD) evaluated against database records.
 * - Section 8.1: Strict Idempotency on all operations.
 */

import {
  StoragePort,
  StorageResult,
  ExpenseRequest,
  ExpenseLine,
  ExpenseAttachment,
  ExpenseCategory,
  ExpensePaymentMethod,
  JournalEntry,
  JournalLine,
} from '../../storage/StoragePort';
import { PostingEngine } from '../../engines/PostingEngine';
import { NumberingEngine } from '../../engines/NumberingEngine';
import { ApprovalEngine } from '../../engines/ApprovalEngine';
import { DomainEventBus } from '../../events/DomainEventBus';
import { SoDMatrixService } from '../../sod/SoDMatrixService';

export interface SubmitExpensePayload {
  titleAr: string;
  employeeId: string;
  employeeName: string;
  department?: string;
  costCenterId?: string;
  projectId?: string;
  paymentMethod: ExpensePaymentMethod;
  disbursementAccountCode?: string;
  fundingSource?: 'DIRECT_PAYMENT' | 'PETTY_CUSTODY';
  lines: Array<{
    categoryId: string;
    categoryNameAr?: string;
    expenseAccountCode?: string;
    description: string;
    amount: number;
    costCenterId?: string;
    projectId?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
  }>;
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileType?: string;
    fileSizeBytes?: number;
    lineId?: string;
  }>;
  notes?: string;
  submittedBy: string;
  submittedByName: string;
  idempotencyKey: string;
}

export interface ApproveL1Payload {
  requestId: string;
  approverId: string;
  approverName: string;
  approverRole?: string;
  notes?: string;
  comment?: string;
  idempotencyKey: string;
}

export interface ApproveL2Payload {
  requestId: string;
  approverId: string;
  approverName: string;
  approverRole?: string;
  notes?: string;
  comment?: string;
  disbursementAccountCode?: string;
  idempotencyKey: string;
}

export interface RejectExpensePayload {
  requestId: string;
  actorId?: string;
  actorName?: string;
  rejectedBy?: string;
  rejectedByName?: string;
  reason?: string;
  reasonAr?: string;
  idempotencyKey: string;
}

export class ExpenseService {
  public static readonly DEFAULT_ESCALATION_THRESHOLD = 5000; // مبالغ فوق 5,000 ر.س تتطلب تصعيد لمدير مالي (L2)
  public static readonly DEFAULT_ATTACHMENT_THRESHOLD = 500;  // مبالغ فوق 500 ر.س تتطلب مرفقات إثبات إلزامية

  constructor(
    private readonly port: StoragePort,
    private readonly postingEngine: PostingEngine,
    private readonly numberingEngine: NumberingEngine,
    private readonly approvalEngine: ApprovalEngine
  ) {}

  /**
   * 6A & 6D — تقديم طلب صرف (Submit Expense Request)
   */
  public async submitExpenseRequest(
    tenantId: string,
    payload: SubmitExpensePayload
  ): Promise<StorageResult<{ request: ExpenseRequest; lines: ExpenseLine[]; attachments: ExpenseAttachment[] }>> {
    // 1. Parameter completeness
    if (!payload.titleAr || !payload.titleAr.trim()) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-parameter',
          title: 'عنوان طلب الصرف مطلوب',
          status: 400,
          detail: 'يجب تحديد الغرض من المصروف بعنوان وصفي واضح.',
        },
      };
    }

    if (!payload.lines || payload.lines.length === 0) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/empty-lines',
          title: 'بنود المصروف فارغة',
          status: 400,
          detail: 'يجب إضافة بند واحد على الأقل في طلب المصروفات.',
        },
      };
    }

    // 2. Rule 6D: Strict Segregation from Cash Custody
    if (payload.fundingSource === 'PETTY_CUSTODY') {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/custody-segregation-violation',
          title: 'الفصل الصارم عن العهدة النقدية (بند 6D)',
          status: 400,
          detail: 'المصروفات الممولة من العهدة النقدية تُسجل وتُسوى في موديول العهدة النقدية (موديول 5) حصرًا وتُمنع في هذا الموديول. هذا الموديول مخصص للمصروفات المباشرة (تحويل بنكي / شيك) أو رد النفقات للموظف.',
        },
      };
    }

    // 3. Calculate total amount & validate lines
    let totalAmount = 0;
    for (const line of payload.lines) {
      const amt = Number(line.amount);
      if (isNaN(amt) || amt <= 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/invalid-amount',
            title: 'مبلغ البند غير صالح',
            status: 400,
            detail: `مبلغ البند "${line.description}" يجب أن يكون أكبر من الصفر.`,
          },
        };
      }
      totalAmount += amt;
    }

    // 4. Rule 6A: Mandatory attachments above threshold
    const attachments = payload.attachments || [];
    const categoriesRes = await this.port.listExpenseCategories(tenantId);
    const categoryMap = new Map<string, ExpenseCategory>();
    if (categoriesRes.success && categoriesRes.data) {
      categoriesRes.data.forEach((c) => categoryMap.set(c.id, c));
    }

    // Check if any category strictly demands attachments or if total exceeds threshold
    let requiresAttachment = totalAmount >= ExpenseService.DEFAULT_ATTACHMENT_THRESHOLD;
    for (const line of payload.lines) {
      const cat = categoryMap.get(line.categoryId);
      if (cat && cat.requiresAttachment && line.amount >= cat.attachmentThresholdAmount) {
        requiresAttachment = true;
        break;
      }
    }

    if (requiresAttachment && attachments.length === 0) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/attachment-required',
          title: 'المرفقات الثبوتية إلزامية لطلب الصرف (بند 6A)',
          status: 400,
          detail: `تتطلب اللائحة المالية إرفاق فواتير أو مستندات إثبات رسمية لطلبات الصرف التي تتجاوز ${ExpenseService.DEFAULT_ATTACHMENT_THRESHOLD} ر.س أو ذات التصنيفات الخاصة.`,
        },
      };
    }

    // 5. Early Idempotency Check (8.1)
    const existingRequests = await this.port.listExpenseRequests(tenantId);
    if (existingRequests.success && existingRequests.data) {
      const cached = existingRequests.data.find((r) => r.idempotencyKey === payload.idempotencyKey);
      if (cached) {
        const full = await this.port.getExpenseRequest(tenantId, cached.id);
        if (full.success && full.data) {
          return { success: true, data: full.data };
        }
      }
    }

    // 6. Generate request code via NumberingEngine
    const numRes = await this.numberingEngine.generateNumber(
      tenantId,
      'EXP',
      'EXP',
      `${payload.idempotencyKey}-code`
    );
    const requestCode = numRes.success && numRes.data ? numRes.data.formattedCode : `EXP-${Date.now()}`;

    // 7. Rule 6B: Determine Escalation Workflow based on amount
    const requiresL2Escalation = totalAmount > ExpenseService.DEFAULT_ESCALATION_THRESHOLD;
    const initialApprovalTier = 'L1';

    const requestId = `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const request: ExpenseRequest = {
      id: requestId,
      tenantId,
      companyId: tenantId,
      requestCode,
      titleAr: payload.titleAr,
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      department: payload.department,
      costCenterId: payload.costCenterId,
      projectId: payload.projectId,
      totalAmount,
      currency: 'SAR',
      paymentMethod: payload.paymentMethod || 'DIRECT_BANK_TRANSFER',
      disbursementAccountCode: payload.disbursementAccountCode || (payload.paymentMethod === 'EMPLOYEE_REIMBURSEMENT' ? '2010' : '1020'),
      status: 'SUBMITTED',
      currentApprovalTier: initialApprovalTier,
      submittedBy: payload.submittedBy,
      submittedByName: payload.submittedByName,
      submittedAt: nowIso,
      notes: payload.notes,
      createdAt: nowIso,
      updatedAt: nowIso,
      idempotencyKey: payload.idempotencyKey,
    };

    // Construct lines
    const lines: ExpenseLine[] = payload.lines.map((l, idx) => {
      const cat = categoryMap.get(l.categoryId);
      return {
        id: `expl-${requestId}-${idx + 1}`,
        tenantId,
        companyId: tenantId,
        requestId,
        categoryId: l.categoryId,
        categoryNameAr: l.categoryNameAr || cat?.nameAr || 'مصروف عام',
        expenseAccountCode: l.expenseAccountCode || cat?.defaultAccountCode || '5040',
        description: l.description,
        amount: Number(l.amount),
        costCenterId: l.costCenterId || payload.costCenterId,
        projectId: l.projectId || payload.projectId,
        invoiceNumber: l.invoiceNumber,
        invoiceDate: l.invoiceDate,
        createdAt: nowIso,
      };
    });

    // Construct attachments
    const expenseAttachments: ExpenseAttachment[] = attachments.map((a, idx) => ({
      id: `att-${requestId}-${idx + 1}`,
      tenantId,
      companyId: tenantId,
      requestId,
      lineId: a.lineId,
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      fileType: a.fileType || 'application/pdf',
      fileSizeBytes: a.fileSizeBytes || 0,
      uploadedBy: payload.submittedBy,
      uploadedAt: nowIso,
    }));

    // Persist via StoragePort
    const createRes = await this.port.createExpenseRequest(
      tenantId,
      request,
      lines,
      expenseAttachments,
      payload.idempotencyKey
    );

    if (!createRes.success) {
      return createRes as any;
    }

    // Submit request to ApprovalEngine with appropriate escalation threshold metadata
    const approvalSteps = [
      {
        stepNumber: 1,
        roleRequired: 'direct_manager',
        status: 'PENDING' as const,
      },
    ];
    if (requiresL2Escalation) {
      approvalSteps.push({
        stepNumber: 2,
        roleRequired: 'cfo',
        status: 'PENDING' as const,
      });
    }

    await this.approvalEngine.submitRequest(
      tenantId,
      {
        id: `appr-${requestId}`,
        tenantId,
        documentId: requestId,
        documentCode: requestCode,
        documentType: 'EXPENSE_REQUEST',
        initiatorId: payload.submittedBy,
        currentStep: 1,
        steps: approvalSteps,
        status: 'PENDING',
        createdAt: nowIso,
      },
      `${payload.idempotencyKey}-appr-submit`
    );

    // Publish Domain Event
    await DomainEventBus.publish({
      eventType: 'EXPENSE_REQUESTED',
      tenantId,
      actorId: payload.submittedBy,
      actorName: payload.submittedByName,
      payload: {
        requestId,
        requestCode,
        totalAmount,
        requiresL2Escalation,
      },
      idempotencyKey: payload.idempotencyKey,
    });

    return {
      success: true,
      data: {
        request: createRes.data,
        lines,
        attachments: expenseAttachments,
      },
    };
  }

  /**
   * 6B — اعتماد المستوى الأول (L1 Approval: Direct Manager)
   * If totalAmount <= threshold: automatically posts to GL (6C).
   * If totalAmount > threshold: advances to L2 (CFO).
   * Strict SoD (7.1): Evaluated using database-loaded record!
   */
  public async approveL1(
    tenantId: string,
    payload: ApproveL1Payload
  ): Promise<StorageResult<ExpenseRequest>> {
    // 1. Fetch persistent record from database
    const fullRes = await this.port.getExpenseRequest(tenantId, payload.requestId);
    if (!fullRes.success || !fullRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/expense-not-found',
          title: 'طلب الصرف غير موجود',
          status: 404,
          detail: 'تعذر العثور على طلب الصرف المطلوب اعتماده.',
        },
      };
    }
    const { request, lines } = fullRes.data;

    // 2. Strict SoD Check (Clause 7.1): Creator cannot approve!
    if (request.submittedBy === payload.approverId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/sod-conflict',
          title: 'تعارض صلاحيات الرقابة الثنائية (SoD)',
          status: 403,
          detail: `لا يجوز للمستخدم (${request.submittedByName}) الذي قدم طلب الصرف أن يعتمد طلبه (بند 7.1). يتطلب الاعتماد مديراً ومسؤولاً مستقلاً.`,
        },
      };
    }

    if (request.status !== 'SUBMITTED') {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-state',
          title: 'حالة الطلب لا تسمح باعتماد المستوى الأول',
          status: 400,
          detail: `حالة الطلب الحالية هي (${request.status}). لا يمكن اعتماد طلب تم اعتماده أو رفضه مسبقاً.`,
        },
      };
    }

    const nowIso = new Date().toISOString();
    const requiresL2Escalation = request.totalAmount > ExpenseService.DEFAULT_ESCALATION_THRESHOLD;

    if (requiresL2Escalation) {
      // Advance to Tier 2 (L2 CFO Approval)
      const updateRes = await this.port.updateExpenseRequestStatus(
        tenantId,
        request.id,
        {
          status: 'APPROVED_L1',
          currentApprovalTier: 'L2',
          approvedL1By: payload.approverId,
          approvedL1ByName: payload.approverName,
          approvedL1At: nowIso,
          notes: payload.notes || request.notes,
        },
        payload.idempotencyKey
      );

      if (!updateRes.success) return updateRes;

      await DomainEventBus.publish({
        eventType: 'EXPENSE_APPROVED',
        tenantId,
        actorId: payload.approverId,
        actorName: payload.approverName,
        payload: {
          requestId: request.id,
          tier: 'L1',
          nextTier: 'L2',
          totalAmount: request.totalAmount,
        },
        idempotencyKey: payload.idempotencyKey,
      });

      return updateRes;
    } else {
      // Amount is within L1 limit -> Final Approval and Auto-Post (6C)!
      const updateRes = await this.port.updateExpenseRequestStatus(
        tenantId,
        request.id,
        {
          status: 'APPROVED',
          currentApprovalTier: 'COMPLETED',
          approvedL1By: payload.approverId,
          approvedL1ByName: payload.approverName,
          approvedL1At: nowIso,
          approvedBy: payload.approverId,
          approvedByName: payload.approverName,
          approvedAt: nowIso,
          notes: payload.notes || request.notes,
        },
        payload.idempotencyKey
      );

      if (!updateRes.success) return updateRes;

      // 6C: Automatic Posting via PostingEngine
      const postRes = await this.postApprovedExpense(
        tenantId,
        request,
        lines,
        payload.approverId,
        `${payload.idempotencyKey}-post`
      );

      if (!postRes.success) {
        return {
          success: false,
          error: postRes.error,
        };
      }

      return { success: true, data: postRes.data };
    }
  }

  /**
   * 6B — اعتماد المستوى الثاني (L2 Approval: CFO / Financial Approver)
   * Mandated for amounts exceeding the escalation threshold.
   * Triggers automatic balanced posting via PostingEngine (6C).
   */
  public async approveL2(
    tenantId: string,
    payload: ApproveL2Payload
  ): Promise<StorageResult<ExpenseRequest>> {
    // 1. Fetch persistent record from database
    const fullRes = await this.port.getExpenseRequest(tenantId, payload.requestId);
    if (!fullRes.success || !fullRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/expense-not-found',
          title: 'طلب الصرف غير موجود',
          status: 404,
          detail: 'تعذر العثور على طلب الصرف المطلوب اعتماده.',
        },
      };
    }
    const { request, lines } = fullRes.data;

    // 2. Strict SoD Check (7.1): Creator cannot approve!
    if (request.submittedBy === payload.approverId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/sod-conflict',
          title: 'تعارض صلاحيات الرقابة الثنائية (SoD)',
          status: 403,
          detail: `لا يجوز للمستخدم (${request.submittedByName}) الذي أنشأ طلب الصرف أن يعتمد الموافقة المالية النهائية (بند 7.1).`,
        },
      };
    }

    if (request.status !== 'APPROVED_L1') {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-state',
          title: 'الطلب غير جاهز للاعتماد المالي',
          status: 400,
          detail: `يجب اعتماد المستوى الأول (L1) من المدير المباشر قبل الاعتماد المالي النهائي (حالة الطلب: ${request.status}).`,
        },
      };
    }

    const nowIso = new Date().toISOString();

    const updateRes = await this.port.updateExpenseRequestStatus(
      tenantId,
      request.id,
      {
        status: 'APPROVED',
        currentApprovalTier: 'COMPLETED',
        approvedBy: payload.approverId,
        approvedByName: payload.approverName,
        approvedAt: nowIso,
        notes: payload.notes || request.notes,
      },
      payload.idempotencyKey
    );

    if (!updateRes.success) return updateRes;

    // 6C: Automatic Posting via PostingEngine
    const postRes = await this.postApprovedExpense(
      tenantId,
      request,
      lines,
      payload.approverId,
      `${payload.idempotencyKey}-post`
    );

    if (!postRes.success) {
      return {
        success: false,
        error: postRes.error,
      };
    }

    return { success: true, data: postRes.data };
  }

  /**
   * رفض طلب الصرف (Reject Expense Request)
   */
  public async rejectExpenseRequest(
    tenantId: string,
    payload: RejectExpensePayload
  ): Promise<StorageResult<ExpenseRequest>> {
    const fullRes = await this.port.getExpenseRequest(tenantId, payload.requestId);
    if (!fullRes.success || !fullRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/expense-not-found',
          title: 'طلب الصرف غير موجود',
          status: 404,
          detail: 'تعذر العثور على طلب الصرف.',
        },
      };
    }
    const { request } = fullRes.data;

    if (request.status === 'POSTED') {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/already-posted',
          title: 'الطلب مرحل محاسبياً بالفعل',
          status: 400,
          detail: 'لا يمكن رفض طلب تم ترحيل قيده إلى الدفاتر المحاسبية. يتم التصحيح بقيد عكسي فقط (بند 13.1).',
        },
      };
    }

    const nowIso = new Date().toISOString();
    const actorId = payload.actorId || payload.rejectedBy || 'system';
    const actorName = payload.actorName || payload.rejectedByName || 'المسؤول';
    const reason = payload.reason || payload.reasonAr || 'تم رفض الطلب';

    const updateRes = await this.port.updateExpenseRequestStatus(
      tenantId,
      request.id,
      {
        status: 'REJECTED',
        rejectedBy: actorId,
        rejectedByName: actorName,
        rejectedAt: nowIso,
        rejectionReason: reason,
      },
      payload.idempotencyKey
    );

    if (!updateRes.success) return updateRes;

    await DomainEventBus.publish({
      eventType: 'EXPENSE_REJECTED',
      tenantId,
      actorId,
      actorName,
      payload: {
        requestId: request.id,
        reason,
      },
      idempotencyKey: payload.idempotencyKey,
    });

    return updateRes;
  }

  /**
   * 7.6D — عكس / مرتجع مصروف معتمد بقيد عكسي
   */
  public async reverseExpense(
    tenantId: string,
    input: {
      requestId: string;
      reason: string;
      reversedBy: string;
      reversedByName: string;
      idempotencyKey: string;
    }
  ): Promise<StorageResult<ExpenseRequest>> {
    const fullRes = await this.port.getExpenseRequest(tenantId, input.requestId);
    if (!fullRes.success || !fullRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/not-found',
          title: 'طلب المصروف غير موجود',
          status: 404,
          detail: 'تعذر العثور على طلب المصروف المراد إلغاؤه.',
        },
      };
    }
    const { request, lines } = fullRes.data;
    if (request.status !== 'POSTED' && request.status !== 'APPROVED') {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-state',
          title: 'حالة الطلب لا تسمح بالإلغاء',
          status: 400,
          detail: `لا يمكن إلغاء طلب بحالة (${request.status}).`,
        },
      };
    }

    // Balanced Reversal Journal Entry via PostingEngine
    if (this.postingEngine && request.journalEntryId) {
      const journalLines: JournalLine[] = [];
      let idx = 1;
      const paymentAccount = request.disbursementAccountCode || '1010';
      journalLines.push({
        id: `rev-exp-${idx++}-${request.id}`,
        accountCode: paymentAccount,
        debit: request.totalAmount,
        credit: 0,
        description: `إلغاء قيد المصروف ${request.requestCode}`,
      });

      for (const line of lines) {
        const lineAccount = line.expenseAccountCode || '5040';
        journalLines.push({
          id: `rev-exp-${idx++}-${request.id}`,
          accountCode: lineAccount,
          debit: 0,
          credit: line.amount,
          costCenter: line.costCenterId,
          description: `عكس بند ${line.description}`,
        });
      }

      const revEntryId = `je-exp-rev-${request.id}`;
      const draftRes = await this.postingEngine.draftEntry(
        tenantId,
        {
          id: revEntryId,
          code: `JE-EXP-REV-${request.requestCode}`,
          tenantId,
          date: new Date().toISOString().split('T')[0],
          type: 'عكس قيد مصروف',
          description: `قيد عكسي لإلغاء طلب المصروف رقم ${request.requestCode} - ${input.reason}`,
          lines: journalLines,
          totalAmount: request.totalAmount,
          status: 'APPROVED',
          createdBy: input.reversedBy,
        },
        `exp-rev-draft-${input.idempotencyKey}`
      );
      // Repair batch 1 (DEF-P1-003): the request is never marked cancelled unless the reversal journal really posted
      if (!draftRes.success || !draftRes.data) {
        return {
          success: false,
          error: draftRes.error || {
            type: 'https://api.an-erp.local/errors/draft-failed',
            title: 'فشل إنشاء مسودة القيد العكسي',
            status: 500,
            detail: 'لم يُلغَ طلب المصروف لأن مسودة القيد العكسي تعذّر إنشاؤها.',
          },
        };
      }
      const revPost = await this.postingEngine.postEntry(tenantId, revEntryId, `exp-rev-post-${input.idempotencyKey}`);
      if (!revPost.success || !revPost.data) {
        return {
          success: false,
          error: revPost.error || {
            type: 'https://api.an-erp.local/errors/posting-failed',
            title: 'فشل ترحيل القيد العكسي',
            status: 500,
            detail: 'لم يُلغَ طلب المصروف لأن ترحيل القيد العكسي فشل.',
          },
        };
      }
    }

    const updateRes = await this.port.updateExpenseRequestStatus(
      tenantId,
      request.id,
      {
        status: 'REJECTED',
        notes: `${request.notes ? request.notes + '\n' : ''}تم الإلغاء بقيد عكسي: ${input.reason}`,
      },
      input.idempotencyKey
    );

    return updateRes;
  }

  /**
   * 6C — الربط المحاسبي التلقائي (Automated GL Integration via PostingEngine)
   * Debits expense accounts grouped by category with dimensions (cost center / project).
   * Credits disbursement account (bank / accounts payable / reimbursement).
   * ZERO manual intervention in journal entry.
   */
  private async postApprovedExpense(
    tenantId: string,
    request: ExpenseRequest,
    lines: ExpenseLine[],
    actorId: string,
    idempotencyKey: string
  ): Promise<StorageResult<ExpenseRequest>> {
    const entryId = `je-exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const creditAccount = request.disbursementAccountCode || (request.paymentMethod === 'EMPLOYEE_REIMBURSEMENT' ? '2010' : '1020');

    // Group debit lines by expenseAccountCode and costCenterId/projectId
    const journalLines: Array<{
      id: string;
      accountCode: string;
      costCenter?: string;
      project?: string;
      debit: number;
      credit: number;
      description: string;
    }> = [];

    let lineIdx = 1;
    let totalDebit = 0;

    for (const line of lines) {
      const amt = Number(line.amount);
      totalDebit += amt;
      journalLines.push({
        id: `line-${entryId}-${lineIdx++}`,
        accountCode: line.expenseAccountCode || '5040',
        costCenter: line.costCenterId || request.costCenterId,
        project: line.projectId || request.projectId,
        debit: amt,
        credit: 0,
        description: `إثبات مصروف: ${line.categoryNameAr} - ${line.description}`,
      });
    }

    // Credit disbursement account
    journalLines.push({
      id: `line-${entryId}-${lineIdx++}`,
      accountCode: creditAccount,
      costCenter: request.costCenterId,
      project: request.projectId,
      debit: 0,
      credit: totalDebit,
      description: `استحقاق / صرف طلب مصروفات: ${request.requestCode} لصالح ${request.employeeName}`,
    });

    const journalEntry: JournalEntry = {
      id: entryId,
      code: `JE-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`,
      tenantId,
      date: new Date().toISOString().split('T')[0],
      type: 'قيد مصروفات تشغيلية',
      description: `قيد آلي معتمد لطلب المصروفات رقم ${request.requestCode}: ${request.titleAr}`,
      totalAmount: totalDebit,
      status: 'APPROVED',
      createdBy: actorId,
      lines: journalLines,
    };

    // 1. Draft Entry via PostingEngine
    const draftRes = await this.postingEngine.draftEntry(
      tenantId,
      journalEntry,
      `${idempotencyKey}-draft`
    );
    if (!draftRes.success || !draftRes.data) {
      return {
        success: false,
        error: draftRes.error || {
          type: 'https://api.an-erp.local/errors/draft-failed',
          title: 'فشل إنشاء مسودة القيد الآلي',
          status: 500,
          detail: 'تعذر إنشاء مسودة القيد اليومي للمصروف عبر PostingEngine.',
        },
      };
    }

    // 2. Post Entry via PostingEngine (enforcing five core accounting invariants)
    const postRes = await this.postingEngine.postEntry(
      tenantId,
      draftRes.data.id,
      `${idempotencyKey}-post-execute`
    );
    if (!postRes.success || !postRes.data) {
      return {
        success: false,
        error: postRes.error || {
          type: 'https://api.an-erp.local/errors/posting-failed',
          title: 'فشل ترحيل قيد المصروف',
          status: 500,
          detail: 'فشل ترحيل قيد المصروفات إلى دفتر الأستاذ العام.',
        },
      };
    }

    // 3. Update ExpenseRequest to POSTED with journalEntryId
    const updateRes = await this.port.updateExpenseRequestStatus(
      tenantId,
      request.id,
      {
        status: 'POSTED',
        journalEntryId: postRes.data.id,
      },
      `${idempotencyKey}-status-posted`
    );

    if (!updateRes.success) return updateRes;

    // Publish EXPENSE_POSTED domain event
    await DomainEventBus.publish({
      eventType: 'EXPENSE_POSTED',
      tenantId,
      actorId,
      actorName: 'PostingEngine',
      payload: {
        requestId: request.id,
        requestCode: request.requestCode,
        journalEntryId: postRes.data.id,
        totalAmount: totalDebit,
      },
      idempotencyKey,
    });

    return updateRes;
  }

  // Read / Query Helpers
  public async getExpenseRequest(
    tenantId: string,
    requestId: string
  ): Promise<StorageResult<{ request: ExpenseRequest; lines: ExpenseLine[]; attachments: ExpenseAttachment[] } | null>> {
    return this.port.getExpenseRequest(tenantId, requestId);
  }

  public async listExpenseRequests(
    tenantId: string,
    filter?: { status?: string; employeeId?: string }
  ): Promise<StorageResult<ExpenseRequest[]>> {
    return this.port.listExpenseRequests(tenantId, filter);
  }

  public async listCategories(tenantId: string): Promise<StorageResult<ExpenseCategory[]>> {
    return this.port.listExpenseCategories(tenantId);
  }

  public async saveCategory(
    tenantId: string,
    category: ExpenseCategory,
    idempotencyKey: string
  ): Promise<StorageResult<ExpenseCategory>> {
    return this.port.saveExpenseCategory(tenantId, category, idempotencyKey);
  }
}
