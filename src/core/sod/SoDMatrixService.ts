/**
 * @file SoDMatrixService.ts
 * @description Phase 3B: Enterprise Segregation of Duties (SoD) Matrix & Conflict Engine
 * Strictly prevents financial posting and audit operations from accountants,
 * mandates them for the CFO / Financial Approver, and performs automated conflict checks.
 */

import { RFC7807Problem } from '../storage/StoragePort';

export type SystemPermission =
  | 'ENTRY_CREATE'          // إنشاء القيود اليومية (محاسب)
  | 'ENTRY_DRAFT_EDIT'     // تعديل مسودات القيود (محاسب)
  | 'ENTRY_POST'           // ترحيل القيود المالية (المدير المالي فقط)
  | 'ENTRY_APPROVE'        // اعتماد القيود المالية (المدير المالي فقط)
  | 'FINANCIAL_AUDIT'      // التدقيق المالي وفحص الامتثال (المدقق فقط)
  | 'AUDIT_LOG_VIEW'       // استعراض سجل التدقيق وسلاسل الإثبات (المدقق فقط)
  | 'REPORT_VIEW_ASSIGNED' // تقارير الفرع المعيّن
  | 'REPORT_VIEW_ALL'      // التقارير والقوائم المالية الشاملة (المدير المالي)
  | 'USER_MANAGE'          // إدارة المستخدمين والصلاحيات (مدير النظام)
  | 'BREAK_GLASS_AUTHORIZE' // تخويل التجاوز الطارئ (مدير مالي / مدير نظام)
  | 'CUSTODY_OPEN'          // فتح العهدة النقدية وتخصيص رصيدها
  | 'CUSTODY_RECORD_EXPENSE' // تسجيل مصروفات من العهدة مع المرفقات
  | 'CUSTODY_SETTLE'        // اعتماد وتسوية العهدة دورياً وتوليد قيدها عبر المحرك
  | 'EXPENSE_SUBMIT'        // تقديم طلب صرف مصروفات مباشرة
  | 'EXPENSE_APPROVE_L1'    // اعتماد المستوى الأول لطلب الصرف (المدير المباشر)
  | 'EXPENSE_APPROVE_L2';   // اعتماد المستوى الثاني لطلب الصرف (المدير المالي)

export interface RoleMatrixDefinition {
  role: string;
  roleTitleAr: string;
  allowedPermissions: SystemPermission[];
  forbiddenPermissions: SystemPermission[];
  descriptionAr: string;
}

export interface IncompatiblePair {
  roles: [string, string];
  conflictKey: string;
  reasonAr: string;
  riskSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}

export class SoDMatrixService {
  /**
   * Authoritative Enterprise Role-Permission Matrix (Section 3B)
   */
  public static readonly ROLE_MATRIX: Record<string, RoleMatrixDefinition> = {
    accountant: {
      role: 'accountant',
      roleTitleAr: 'محاسب عام',
      allowedPermissions: [
        'ENTRY_CREATE',
        'ENTRY_DRAFT_EDIT',
        'REPORT_VIEW_ASSIGNED',
        'CUSTODY_OPEN',
        'CUSTODY_RECORD_EXPENSE',
        'EXPENSE_SUBMIT',
      ],
      forbiddenPermissions: [
        'ENTRY_POST',
        'ENTRY_APPROVE',
        'FINANCIAL_AUDIT',
        'AUDIT_LOG_VIEW',
        'BREAK_GLASS_AUTHORIZE',
        'CUSTODY_SETTLE',
        'EXPENSE_APPROVE_L2',
      ],
      descriptionAr: 'يختص بإدخال ومراجعة المسودات؛ محظور عليه تماماً ترحيل القيود، اعتمادها، أو تدقيقها مالياً.',
    },
    financial_approver: {
      role: 'financial_approver',
      roleTitleAr: 'المدير المالي / معتمد مالي (CFO)',
      allowedPermissions: [
        'ENTRY_POST',
        'ENTRY_APPROVE',
        'REPORT_VIEW_ALL',
        'REPORT_VIEW_ASSIGNED',
        'BREAK_GLASS_AUTHORIZE',
        'CUSTODY_OPEN',
        'CUSTODY_SETTLE',
        'EXPENSE_SUBMIT',
        'EXPENSE_APPROVE_L1',
        'EXPENSE_APPROVE_L2',
      ],
      forbiddenPermissions: [
        'ENTRY_CREATE',
        'ENTRY_DRAFT_EDIT',
        'FINANCIAL_AUDIT',
        'CUSTODY_RECORD_EXPENSE',
      ],
      descriptionAr: 'المسؤول المالي المخول باعتماد وترحيل القيود المالية؛ محظور عليه إنشاء القيود لتجنب التعارض.',
    },
    auditor: {
      role: 'auditor',
      roleTitleAr: 'مدقق حسابات ومفتش مالي',
      allowedPermissions: ['FINANCIAL_AUDIT', 'AUDIT_LOG_VIEW', 'REPORT_VIEW_ALL'],
      forbiddenPermissions: [
        'ENTRY_CREATE',
        'ENTRY_DRAFT_EDIT',
        'ENTRY_POST',
        'ENTRY_APPROVE',
        'CUSTODY_OPEN',
        'CUSTODY_RECORD_EXPENSE',
        'CUSTODY_SETTLE',
        'EXPENSE_SUBMIT',
        'EXPENSE_APPROVE_L1',
        'EXPENSE_APPROVE_L2',
      ],
      descriptionAr: 'رقابة استرجاعية مستقلة؛ يُمنع من أي صلاحية كتابة أو ترحيل أو اعتماد على الدفاتر المالية.',
    },
    branch_manager: {
      role: 'branch_manager',
      roleTitleAr: 'مدير فرع',
      allowedPermissions: [
        'REPORT_VIEW_ASSIGNED',
        'CUSTODY_RECORD_EXPENSE',
        'EXPENSE_SUBMIT',
        'EXPENSE_APPROVE_L1',
      ],
      forbiddenPermissions: [
        'ENTRY_POST',
        'FINANCIAL_AUDIT',
        'BREAK_GLASS_AUTHORIZE',
        'CUSTODY_SETTLE',
        'EXPENSE_APPROVE_L2',
      ],
      descriptionAr: 'صلاحيات تشغيلية محصورة في نطاق الفرع المعين.',
    },
    system_admin: {
      role: 'system_admin',
      roleTitleAr: 'مدير النظام المؤسسي',
      allowedPermissions: ['USER_MANAGE', 'BREAK_GLASS_AUTHORIZE'],
      forbiddenPermissions: [
        'ENTRY_CREATE',
        'ENTRY_POST',
        'ENTRY_APPROVE',
        'FINANCIAL_AUDIT',
        'CUSTODY_RECORD_EXPENSE',
        'CUSTODY_SETTLE',
      ],
      descriptionAr: 'حوكمة المستخدمين والبنية التحتية؛ لا يملك أي صلاحيات محاسبية تشغيلية.',
    },
  };

  /**
   * Incompatible Role Combinations (Toxic Combinations)
   */
  public static readonly TOXIC_COMBINATIONS: IncompatiblePair[] = [
    {
      roles: ['accountant', 'financial_approver'],
      conflictKey: 'POST_AND_APPROVE',
      reasonAr: 'لا يجوز الجمع بين صلاحية إعداد القيود وصلاحية الاعتماد أو الترحيل المالي لمنع التحريف المالي المستقل.',
      riskSeverity: 'CRITICAL',
    },
    {
      roles: ['accountant', 'auditor'],
      conflictKey: 'RECORD_AND_AUDIT',
      reasonAr: 'لا يجوز الجمع بين التسجيل المحاسبي والتدقيق المالي؛ لا يمكن للمحاسب أن يدقق على أعماله بنفسه.',
      riskSeverity: 'CRITICAL',
    },
    {
      roles: ['financial_approver', 'auditor'],
      conflictKey: 'APPROVE_AND_AUDIT',
      reasonAr: 'لا يجوز الجمع بين سلطة الاعتماد المالي والرقابة التفتيشية المستقلة.',
      riskSeverity: 'CRITICAL',
    },
    {
      roles: ['warehouse_keeper', 'accountant'],
      conflictKey: 'CUSTODY_AND_RECORDING',
      reasonAr: 'لا يجوز الجمع بين العهدة المادية للمخزون والتسجيل المحاسبي لقيود التسوية والتالف.',
      riskSeverity: 'HIGH',
    },
    {
      roles: ['warehouse_keeper', 'purchaser'],
      conflictKey: 'PURCHASE_AND_RECEIVE',
      reasonAr: 'لا يجوز الجمع بين طلب الشراء واستلام المواد لمنع تضارب المصالح وتمرير استلامات وهمية.',
      riskSeverity: 'CRITICAL',
    },
    {
      roles: ['cashier', 'accountant'],
      conflictKey: 'CASH_AND_LEDGER',
      reasonAr: 'لا يجوز الجمع بين القبض النقدي المباشر وترحيل القيود في الأستاذ العام.',
      riskSeverity: 'HIGH',
    },
  ];

  /**
   * Verifies whether an accountant is attempting a forbidden operation:
   * Posting (ENTRY_POST), Approval (ENTRY_APPROVE), or Financial Audit (FINANCIAL_AUDIT).
   */
  public static validateAccountantOperation(
    userRole: string,
    operation: 'POST' | 'APPROVE' | 'AUDIT'
  ): { allowed: boolean; problem?: RFC7807Problem } {
    if (userRole.toLowerCase() === 'accountant') {
      const operationMap = {
        POST: 'ترحيل القيود المالية في الأستاذ العام',
        APPROVE: 'اعتماد المستندات والقيود المالية',
        AUDIT: 'التدقيق المالي الرقابي المستقل',
      };
      return {
        allowed: false,
        problem: {
          type: 'https://api.an-erp.local/errors/sod-accountant-restriction',
          title: 'انتهاك مصفوفة فصل المهام (SoD)',
          status: 403,
          detail: `محظور نظامياً: لا يملك دور المحاسب صلاحية ${operationMap[operation]}. هذه الصلاحية ملزمة للمدير المالي أو المدقق المستقل.`,
          invalidParams: [
            { name: 'role', reason: userRole },
            { name: 'attemptedOperation', reason: operation },
          ],
        },
      };
    }
    return { allowed: true };
  }

  /**
   * Automated Conflict Checker on Role Assignment
   */
  public static validateRoleAssignment(
    existingRoles: string[],
    newRole: string
  ): { allowed: boolean; conflict?: IncompatiblePair; problem?: RFC7807Problem } {
    const combined = Array.from(new Set([...existingRoles, newRole]));

    for (const rule of this.TOXIC_COMBINATIONS) {
      const hasRoleA = combined.includes(rule.roles[0]);
      const hasRoleB = combined.includes(rule.roles[1]);

      if (hasRoleA && hasRoleB) {
        return {
          allowed: false,
          conflict: rule,
          problem: {
            type: 'https://api.an-erp.local/errors/sod-toxic-combination',
            title: 'تعارض حرج في مصفوفة فصل المهام (SoD)',
            status: 409,
            detail: rule.reasonAr,
            invalidParams: [
              { name: 'roleA', reason: rule.roles[0] },
              { name: 'roleB', reason: rule.roles[1] },
              { name: 'severity', reason: rule.riskSeverity },
            ],
          },
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Automated Conflict Checker on User Permissions
   */
  public static validatePermissionAssignment(
    userRole: string,
    requestedPermissions: SystemPermission[]
  ): { allowed: boolean; violations?: SystemPermission[]; problem?: RFC7807Problem } {
    const definition = this.ROLE_MATRIX[userRole];
    if (!definition) {
      return { allowed: true };
    }

    const violations = requestedPermissions.filter((perm) =>
      definition.forbiddenPermissions.includes(perm)
    );

    if (violations.length > 0) {
      return {
        allowed: false,
        violations,
        problem: {
          type: 'https://api.an-erp.local/errors/forbidden-permission-for-role',
          title: 'صلاحيات محظورة لهذا الدور المؤسسي',
          status: 403,
          detail: `الدور (${definition.roleTitleAr}) محظور عليه صراحة الحصول على الصلاحيات التالية: ${violations.join(', ')}.`,
          invalidParams: violations.map((v) => ({ name: 'forbiddenPermission', reason: v })),
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Returns all enterprise role definitions from the authoritative matrix.
   */
  public static getAllRoleDefinitions(): RoleMatrixDefinition[] {
    return Object.values(this.ROLE_MATRIX);
  }

  public getAllRoleDefinitions(): RoleMatrixDefinition[] {
    return SoDMatrixService.getAllRoleDefinitions();
  }
}
