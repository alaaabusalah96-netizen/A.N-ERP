/**
 * @file ApprovalEngine.ts
 * @description Core Approval Engine for A.N ERP (v7.1)
 * Enforces workflow states and Segregation of Duties (SoD).
 * Dependency injection of StoragePort only.
 * NO internal Map, Set, or in-memory state permitted in class.
 */

import { StoragePort, StorageResult, ApprovalRequest } from '../storage/StoragePort';

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
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>> {
    return this.port.approveStep(tenantId, requestId, approverId, idempotencyKey);
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
