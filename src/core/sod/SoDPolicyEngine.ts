/**
 * @file SoDPolicyEngine.ts
 * @description Segregation of Duties (SoD) Policy Engine for A.N ERP
 * Complies with Section 1C.
 * Enforces server-side incompatible role detection and returns standard RFC 7807 Problem Details.
 */

import { RFC7807Problem } from '../storage/StoragePort';

export interface IncompatiblePair {
  roles: [string, string];
  conflictKey: string;
  reasonAr: string;
  riskSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}

export class SoDPolicyEngine {
  /**
   * Enterprise SoD Conflict Matrix
   * Forbids toxic combinations that compromise internal financial control and fraud prevention.
   */
  private static readonly INCOMPATIBLE_PAIRS: IncompatiblePair[] = [
    {
      roles: ['accountant', 'financial_approver'],
      conflictKey: 'POST_AND_APPROVE',
      reasonAr: 'لا يجوز الجمع بين صلاحية إنشاء القيود وصلاحية الاعتماد المالي وفق قواعد الرقابة المالية والحوكمة المؤسسية.',
      riskSeverity: 'CRITICAL',
    },
    {
      roles: ['sales_officer', 'financial_approver'],
      conflictKey: 'SELL_AND_APPROVE_CREDIT',
      reasonAr: 'لا يجوز الجمع بين إدارة مبيعات العملاء واعتماد التسهيلات الائتمانية وسندات القبض.',
      riskSeverity: 'HIGH',
    },
    {
      roles: ['warehouse_keeper', 'accountant'],
      conflictKey: 'CUSTODY_AND_RECORDING',
      reasonAr: 'لا يجوز الجمع بين العهدة المادية للمخزون والتسجيل المحاسبي لقيود التسوية المخزنية.',
      riskSeverity: 'HIGH',
    },
    {
      roles: ['warehouse_keeper', 'purchaser'],
      conflictKey: 'PURCHASE_AND_RECEIVE',
      reasonAr: 'لا يجوز الجمع بين طلب الشراء واستلام المواد لمنع تضارب المصالح وإثبات الاستلام الوهمي.',
      riskSeverity: 'CRITICAL',
    },
  ];

  /**
   * Validates if assigning a set of roles to a single user violates Segregation of Duties
   */
  public static validateRoleAssignment(existingRoles: string[], newRole: string): {
    allowed: boolean;
    conflict?: IncompatiblePair;
    problem?: RFC7807Problem;
  } {
    const combinedRoles = Array.from(new Set([...existingRoles, newRole]));

    for (const rule of this.INCOMPATIBLE_PAIRS) {
      const hasRoleA = combinedRoles.includes(rule.roles[0]);
      const hasRoleB = combinedRoles.includes(rule.roles[1]);

      if (hasRoleA && hasRoleB) {
        const problem: RFC7807Problem = {
          type: 'https://api.an-erp.local/errors/sod-conflict',
          title: 'تعارض في مبدأ فصل المهام (SoD Conflict)',
          status: 409,
          detail: rule.reasonAr,
          invalidParams: [
            { name: 'roleA', reason: rule.roles[0] },
            { name: 'roleB', reason: rule.roles[1] },
            { name: 'severity', reason: rule.riskSeverity },
          ],
        };

        return {
          allowed: false,
          conflict: rule,
          problem,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Validates if a specific document action violates SoD (e.g. initiator cannot approve their own document)
   */
  public static validateDocumentApproval(initiatorId: string, approverId: string): {
    allowed: boolean;
    problem?: RFC7807Problem;
  } {
    if (initiatorId === approverId) {
      return {
        allowed: false,
        problem: {
          type: 'https://api.an-erp.local/errors/sod-self-approval-forbidden',
          title: 'حظر الاعتماد الذاتي (SoD Self-Approval Violation)',
          status: 403,
          detail: 'ممنوع نظامياً قيام منشئ السند أو القيد باعتماده شخصياً. يجب تحويل السند لمعتمد مالي مستقل.',
          invalidParams: [{ name: 'approverId', reason: 'مطابق لمُنشئ السند initiatorId' }],
        },
      };
    }

    return { allowed: true };
  }
}
