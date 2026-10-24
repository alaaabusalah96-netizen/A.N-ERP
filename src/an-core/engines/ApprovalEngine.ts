/**
 * @file ApprovalEngine.ts
 * @description Core Approval Engine for A.N ERP (v7.1)
 * Enforces workflow states and Segregation of Duties (SoD).
 * Dependency injection of StoragePort only.
 * NO internal Map, Set, or in-memory state permitted in class.
 */

import * as crypto from 'node:crypto';
import { StoragePort, StorageResult, ApprovalRequest, ApprovalPolicy, ApprovalDocumentType, ApprovalStep } from '../storage/StoragePort';
import { ROLE_PERMISSION_MATRIX } from '../auth/PermissionMatrix';

export const APPROVAL_DOCUMENT_TYPES: ReadonlyArray<ApprovalDocumentType> = ['GOODS_RECEIPT_SUPPLIER', 'STOCK_ISSUE', 'STOCK_TRANSFER_RECEIPT'];
const APPROVAL_STEP_KINDS = ['ARRIVAL_CONFIRM', 'TECHNICAL_INSPECTION', 'FINAL_CONFIRM', 'REVIEW', 'GENERAL'] as const;

export class ApprovalEngine {
  private readonly port: StoragePort;

  constructor(port: StoragePort) {
    this.port = port;
  }

  /**
   * Initializes approval request for an operational document.
   */
  public async submitRequest(
    tenantId: string,
    request: ApprovalRequest,
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>> {
    if (!tenantId || !request.initiatorId || !request.documentId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-parameter',
          title: 'بيانات طلب الاعتماد غير مكتملة',
          status: 400,
          detail: 'معرف المستأجر، منشئ المستند، ومعرف الوثيقة حقول إلزامية.',
        },
      };
    }

    return this.port.createApprovalRequest(tenantId, request, idempotencyKey);
  }

  /**
   * Approves step with mandatory Segregation of Duties (SoD) check:
   * Rule: Creator of document is strictly forbidden from approving it.
   */
  public async executeApproval(
    tenantId: string,
    requestId: string,
    approverId: string,
    idempotencyKey: string,
    approverRole?: string
  ): Promise<StorageResult<ApprovalRequest>> {
    return this.port.approveStep(tenantId, requestId, approverId, idempotencyKey, approverRole);
  }

  // ===========================================================================
  // Phase 12 (APR-001): per-company configurable approvals
  // ===========================================================================

  private problem(status: number, type: string, title: string, detail: string): StorageResult<any> {
    return { success: false, error: { type: `https://api.an-erp.local/errors/${type}`, title, status, detail } };
  }

  /**
   * Reads the company policy for a document type. No policy / inactive / DIRECT / no steps => the caller proceeds immediately.
   * Otherwise creates a request holding a SNAPSHOT of the steps (later policy edits never touch running requests).
   */
  public async submitWithPolicy(
    tenantId: string,
    input: { documentType: ApprovalDocumentType; documentId: string; documentCode: string; initiatorId: string },
    idempotencyKey: string
  ): Promise<StorageResult<{ mode: 'DIRECT' } | { mode: 'STEPS'; request: ApprovalRequest }>> {
    if (!tenantId || !input.documentType || !input.documentId || !input.initiatorId) {
      return this.problem(400, 'invalid-parameter', 'بيانات طلب الاعتماد غير مكتملة', 'المنشأة ونوع المستند ومعرّفه ومنشئه حقول إلزامية.');
    }
    const pol = await this.port.getApprovalPolicy(tenantId, input.documentType);
    if (!pol.success) return pol as any;
    const policy = pol.data;
    if (!policy || !policy.isActive || policy.mode === 'DIRECT' || !policy.steps || policy.steps.length === 0) {
      return { success: true, data: { mode: 'DIRECT' } };
    }
    // One open request per document: repeating the call returns the same request
    const open = await this.port.listApprovalRequests(tenantId, { documentType: input.documentType, documentId: input.documentId, status: 'PENDING' });
    if (open.success && open.data && open.data.length > 0) {
      return { success: true, data: { mode: 'STEPS', request: open.data[0] } };
    }
    const steps: ApprovalStep[] = policy.steps.map((st, i) => ({
      stepNumber: i + 1,
      roleRequired: st.approverType === 'ROLE' ? st.approverRef : `user:${st.approverRef}`,
      status: 'PENDING' as const,
      approverType: st.approverType,
      approverRef: st.approverRef,
      label: st.label,
      stepKind: st.stepKind,
    }));
    const request: ApprovalRequest = {
      id: `appr-${crypto.randomUUID()}`,
      tenantId,
      documentType: input.documentType,
      documentId: input.documentId,
      documentCode: input.documentCode,
      initiatorId: input.initiatorId,
      currentStep: 1,
      steps,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      enforceDistinctApprovers: policy.enforceDistinctApprovers,
    };
    const created = await this.port.createApprovalRequest(tenantId, request, idempotencyKey);
    if (!created.success || !created.data) return created as any;
    return { success: true, data: { mode: 'STEPS', request: created.data } };
  }

  public async approve(tenantId: string, requestId: string, approverId: string, approverRole: string, idempotencyKey: string): Promise<StorageResult<ApprovalRequest>> {
    return this.port.approveStep(tenantId, requestId, approverId, idempotencyKey, approverRole);
  }

  public async reject(tenantId: string, requestId: string, approverId: string, approverRole: string, reason: string, idempotencyKey: string): Promise<StorageResult<ApprovalRequest>> {
    return this.port.rejectApprovalStep(tenantId, requestId, approverId, approverRole, reason, idempotencyKey);
  }

  /** Pending requests whose CURRENT step is assigned to this user (by id or role) and that the user did not create. */
  public async listInbox(tenantId: string, userId: string, role: string): Promise<StorageResult<ApprovalRequest[]>> {
    const res = await this.port.listApprovalRequests(tenantId, { status: 'PENDING' });
    if (!res.success || !res.data) return res;
    const lowerRole = (role || '').toLowerCase();
    const mine = res.data.filter(r => {
      if (r.initiatorId === userId) return false;
      const pending = r.steps.filter(x => x.status === 'PENDING').sort((a, b) => a.stepNumber - b.stepNumber);
      const step = pending[0];
      if (!step || !step.approverType) return false;
      const assigned = step.approverType === 'USER' ? step.approverRef === userId : !!lowerRole && (step.approverRef || '').toLowerCase() === lowerRole;
      if (!assigned) return false;
      if (r.enforceDistinctApprovers && r.steps.some(x => x.status === 'APPROVED' && x.approverId === userId)) return false;
      return true;
    });
    return { success: true, data: mine };
  }

  /** Validates a policy before it is saved. Roles come from ROLE_PERMISSION_MATRIX; users must be ACTIVE in the same tenant. */
  public async validatePolicy(
    policy: { tenantId: string; documentType: string; mode: string; steps: any; enforceDistinctApprovers: any; isActive: any },
    tenantStorage: StoragePort
  ): Promise<StorageResult<true>> {
    const bad = (detail: string) => this.problem(400, 'invalid-approval-policy', 'سياسة الاعتماد غير صالحة', detail) as StorageResult<true>;
    if (!APPROVAL_DOCUMENT_TYPES.includes(policy.documentType as ApprovalDocumentType)) return bad('نوع المستند غير مدعوم في سياسات الاعتماد.');
    if (policy.mode !== 'DIRECT' && policy.mode !== 'STEPS') return bad('نمط الاعتماد يجب أن يكون DIRECT أو STEPS.');
    if (typeof policy.enforceDistinctApprovers !== 'boolean' || typeof policy.isActive !== 'boolean') return bad('enforceDistinctApprovers وisActive يجب أن يكونا قيمتين منطقيتين.');
    if (!Array.isArray(policy.steps)) return bad('الخطوات يجب أن تكون قائمة.');
    if (policy.steps.length > 10) return bad('الحد الأقصى لعدد الخطوات هو 10.');
    if (policy.mode === 'DIRECT' && policy.steps.length !== 0) return bad('نمط DIRECT لا يقبل خطوات.');
    if (policy.mode === 'STEPS' && policy.steps.length < 1) return bad('نمط STEPS يتطلب خطوة واحدة على الأقل.');
    const knownRoles = new Set(Object.keys(ROLE_PERMISSION_MATRIX).map(r => r.toLowerCase()));
    for (let i = 0; i < policy.steps.length; i++) {
      const st = policy.steps[i];
      const n = i + 1;
      const label = typeof st?.label === 'string' ? st.label.trim() : '';
      if (label.length < 1 || label.length > 80) return bad(`الخطوة ${n}: اسم الخطوة مطلوب (1 إلى 80 حرفًا).`);
      if (st.approverType !== 'ROLE' && st.approverType !== 'USER') return bad(`الخطوة ${n}: نوع الموافق يجب أن يكون ROLE أو USER.`);
      if (typeof st.approverRef !== 'string' || st.approverRef.trim().length < 1 || st.approverRef.length > 64) return bad(`الخطوة ${n}: مرجع الموافق مطلوب.`);
      if (!(APPROVAL_STEP_KINDS as readonly string[]).includes(st.stepKind)) return bad(`الخطوة ${n}: نوع الخطوة غير معروف.`);
      if (st.approverType === 'ROLE') {
        if (!knownRoles.has(st.approverRef.toLowerCase())) return bad(`الخطوة ${n}: الدور (${st.approverRef}) غير معرّف في النظام.`);
      } else {
        const u = await tenantStorage.getUser(policy.tenantId, st.approverRef);
        if (!u.success || !u.data || u.data.status !== 'ACTIVE' || (u.data.tenantId && u.data.tenantId !== policy.tenantId)) {
          return bad(`الخطوة ${n}: المستخدم (${st.approverRef}) غير موجود أو غير نشط في هذه المنشأة.`);
        }
      }
    }
    return { success: true, data: true };
  }

  /**
   * Phase 3C: Official Emergency Break-Glass Override Protocol (Section 7 / 13.3)
   * The single authorized emergency override pathway within ApprovalEngine.
   * Mandates dual authorization from at least two distinct privileged roles.
   * Automatically records an immutable entry into SystemChangeLog with changeType 'SECURITY'.
   */
  public async executeBreakGlassOverride(params: {
    tenantId: string;
    requestId: string;
    actor1: { userId: string; role: string; username: string };
    actor2: { userId: string; role: string; username: string };
    emergencyReasonAr: string;
    ticketRef: string;
    idempotencyKey: string;
  }): Promise<StorageResult<ApprovalRequest>> {
    const { tenantId, requestId, actor1, actor2, emergencyReasonAr, ticketRef, idempotencyKey } = params;

    // 1. Parameter completeness
    if (!tenantId || !requestId || !actor1 || !actor2 || !emergencyReasonAr || !ticketRef) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/break-glass-invalid-params',
          title: 'بيانات التجاوز الطارئ غير مكتملة',
          status: 400,
          detail: 'معرف المستأجر، الطلب، المفوض الأول، المفوض الثاني، سبب الطوارئ، ورقم التذكرة حقول إلزامية.',
        },
      };
    }

    // 2. Strict Dual-Control: Must be two distinct persons
    if (actor1.userId === actor2.userId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/break-glass-dual-control-violation',
          title: 'انتهاك مبدأ الرقابة الثنائية في التجاوز الطارئ',
          status: 403,
          detail: 'ممنوع أمنياً: لا يجوز لمستخدم واحد تنفيذ التجاوز الطارئ بمفرده؛ يلزم اعتماد مستخدمين اثنين بهويتين منفصلتين.',
        },
      };
    }

    // 3. Role validation: Must be at least two distinct authorized roles
    const authorizedRoles = ['financial_approver', 'cfo', 'system_admin', 'auditor', 'general_manager'];
    const isActor1Auth = authorizedRoles.includes(actor1.role.toLowerCase());
    const isActor2Auth = authorizedRoles.includes(actor2.role.toLowerCase());

    if (!isActor1Auth || !isActor2Auth) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/break-glass-unauthorized-role',
          title: 'صلاحيات التجاوز الطارئ غير مستوفاة',
          status: 403,
          detail: 'يلزم أن يحمل كلا المفوضين دوراً قيادياً مخولاً (مدير مالي، مدير نظام، مدقق حسابات، مدير عام).',
        },
      };
    }

    if (actor1.role.toLowerCase() === actor2.role.toLowerCase()) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/break-glass-duplicate-roles',
          title: 'اشتراط تنوع الأدوار في التجاوز الطارئ',
          status: 403,
          detail: 'يلزم موافقة دورين وظيفيين مختلفين على الأقل (مثال: المدير المالي ومدير النظام) لضمان فصل الصلاحيات.',
        },
      };
    }

    const breakGlassDetails = {
      executed: true,
      actor1Id: actor1.userId,
      actor1Role: actor1.role,
      actor2Id: actor2.userId,
      actor2Role: actor2.role,
      reasonAr: emergencyReasonAr,
      ticketRef,
      executedAt: new Date().toISOString(),
    };

    // 4. Update request status in storage port
    const overrideRes = await this.port.approveBreakGlass(
      tenantId,
      requestId,
      breakGlassDetails,
      idempotencyKey
    );

    if (!overrideRes.success || !overrideRes.data) {
      return overrideRes;
    }

    const updatedRequest = overrideRes.data;

    // 5. Mandatory automatic SystemChangeLog entry with changeType: 'SECURITY'
    await this.port.appendSystemChangeLog({
      id: `SCL-BG-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      actor: `${actor1.username} (${actor1.role}) & ${actor2.username} (${actor2.role}) [Break-Glass]`,
      changeType: 'SECURITY',
      module: 'APPROVAL_ENGINE',
      entitiesAffected: [updatedRequest.documentId, updatedRequest.id],
      summaryAr: `تجاوز طارئ مخوّل (Break-Glass) لمسار الاعتماد المستندي [${updatedRequest.documentCode}] برقم التذكرة (${ticketRef}): ${emergencyReasonAr}`,
      beforeState: { status: 'PENDING', step: updatedRequest.currentStep },
      afterState: {
        status: 'APPROVED',
        breakGlass: true,
        approvers: [actor1.username, actor2.username],
        ticketRef,
      },
      evidenceRef: ticketRef,
      version: 'v7.2',
    });

    return {
      success: true,
      data: updatedRequest,
    };
  }
}
