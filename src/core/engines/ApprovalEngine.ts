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
    request: ApprovalRequest,
    approverId: string,
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>> {
    // Strict SoD validation: initiator cannot approve
    if (request.initiatorId === approverId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/sod-violation',
          title: 'تعارض مصالح - فصل الصلاحيات والواجبات',
          status: 403,
          detail: 'ممنوع نظامياً: لا يجوز لمنشئ المستند اعتماده بنفسه (قاعدة فصل المهام والرقابة الثنائية).',
        },
      };
    }

    return this.port.approveStep(tenantId, request.id, approverId, idempotencyKey);
  }
}
