/**
 * @file PermissionMatrix.ts
 * @description Centralized Enterprise Role-Based Permission Matrix (RBAC) & Middleware.
 * Implements Rule 5-2: Single central table (Role × Permission Group) and single requirePermission middleware.
 * Zero duplicate role checks inside routes.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Standard System Operations / Permission Keys
 */
export type PermissionGroup =
  // Financial & General Accounting
  | 'ENTRY_VIEW'
  | 'ENTRY_CREATE'
  | 'ENTRY_EDIT_DRAFT'
  | 'ENTRY_POST'
  | 'ENTRY_APPROVE'
  | 'PERIOD_CLOSE'
  | 'FINANCIAL_REPORTS'
  
  // Cash Custody & Expenses
  | 'CUSTODY_VIEW'
  | 'CUSTODY_OPEN'
  | 'CUSTODY_EXPENSE_RECORD'
  | 'CUSTODY_SETTLE'
  | 'EXPENSE_SUBMIT'
  | 'EXPENSE_APPROVE'

  // Warehouses & Inventory
  | 'STOCK_VIEW'
  | 'STOCK_RECEIVE'
  | 'STOCK_ISSUE'
  | 'STOCK_TRANSFER'
  | 'STOCK_COUNT_APPROVE'
  | 'STOCK_RETURN'
  | 'PURCHASE_VIEW'
  | 'PURCHASE_MANAGE'
  | 'SUPPLIER_INVOICE_APPROVE'

  // Audit & Observability
  | 'AUDIT_LOG_VIEW'
  | 'SYSTEM_HEALTH_VIEW'

  // Identity / password self-service (explicit grant only — not default on operational roles)
  | 'PASSWORD_CHANGE_SELF'

  // System Administration & Governance
  | 'USER_MANAGE'
  | 'COMPANY_SETTINGS_MANAGE'
  | 'BREAK_GLASS_AUTHORIZE'
  | 'PURCHASE_VIEW'
  | 'PURCHASE_MANAGE'
  | 'SUPPLIER_INVOICE_APPROVE'
  | 'APPROVAL_POLICY_MANAGE'
  | 'PLATFORM_ADMIN';

/**
 * Centralized Role-Permission Matrix (Table: Role -> Set of Allowed Permission Groups)
 * Covers all system roles recognized in code, database, and SoD policy:
 * - super_admin / SUPER_ADMIN / platform_admin / admin
 * - accountant
 * - financial_approver
 * - warehouse_manager / warehouse_keeper
 * - auditor / developer
 * - branch_manager
 * - sales_officer / fleet_supervisor
 */
export const ROLE_PERMISSION_MATRIX: Record<string, ReadonlySet<PermissionGroup>> = {
  super_admin: new Set<PermissionGroup>([
    'ENTRY_VIEW', 'ENTRY_CREATE', 'ENTRY_EDIT_DRAFT', 'ENTRY_POST', 'ENTRY_APPROVE',
    'PERIOD_CLOSE', 'FINANCIAL_REPORTS', 'CUSTODY_VIEW', 'CUSTODY_OPEN', 'CUSTODY_EXPENSE_RECORD',
    'CUSTODY_SETTLE', 'EXPENSE_SUBMIT', 'EXPENSE_APPROVE', 'STOCK_VIEW', 'STOCK_RECEIVE',
    'STOCK_ISSUE', 'STOCK_TRANSFER', 'STOCK_COUNT_APPROVE', 'STOCK_RETURN', 'AUDIT_LOG_VIEW',
    'SYSTEM_HEALTH_VIEW', 'USER_MANAGE', 'COMPANY_SETTINGS_MANAGE', 'BREAK_GLASS_AUTHORIZE',
    'PLATFORM_ADMIN',
    'PURCHASE_VIEW', 'PURCHASE_MANAGE', 'APPROVAL_POLICY_MANAGE',
    'SUPPLIER_INVOICE_APPROVE',
  ]),
  admin: new Set<PermissionGroup>([
    'ENTRY_VIEW', 'ENTRY_CREATE', 'ENTRY_EDIT_DRAFT', 'ENTRY_POST', 'ENTRY_APPROVE',
    'PERIOD_CLOSE', 'FINANCIAL_REPORTS', 'CUSTODY_VIEW', 'CUSTODY_OPEN', 'CUSTODY_EXPENSE_RECORD',
    'CUSTODY_SETTLE', 'EXPENSE_SUBMIT', 'EXPENSE_APPROVE', 'STOCK_VIEW', 'STOCK_RECEIVE',
    'STOCK_ISSUE', 'STOCK_TRANSFER', 'STOCK_COUNT_APPROVE', 'STOCK_RETURN', 'AUDIT_LOG_VIEW',
    'SYSTEM_HEALTH_VIEW', 'USER_MANAGE', 'COMPANY_SETTINGS_MANAGE', 'BREAK_GLASS_AUTHORIZE',
    'PURCHASE_VIEW', 'PURCHASE_MANAGE', 'APPROVAL_POLICY_MANAGE',
    'SUPPLIER_INVOICE_APPROVE',
  ]),
  platform_admin: new Set<PermissionGroup>([
    'SYSTEM_HEALTH_VIEW', 'USER_MANAGE', 'COMPANY_SETTINGS_MANAGE', 'PLATFORM_ADMIN', 'AUDIT_LOG_VIEW',
    'PURCHASE_VIEW', 'PURCHASE_MANAGE', 'APPROVAL_POLICY_MANAGE',
    'SUPPLIER_INVOICE_APPROVE',
  ]),
  accountant: new Set<PermissionGroup>([
    'ENTRY_VIEW', 'ENTRY_CREATE', 'ENTRY_EDIT_DRAFT', 'FINANCIAL_REPORTS',
    'CUSTODY_VIEW', 'CUSTODY_OPEN', 'CUSTODY_EXPENSE_RECORD',
    'EXPENSE_SUBMIT',
    'STOCK_VIEW', 'PURCHASE_VIEW', 'PURCHASE_MANAGE',
  ]),
  financial_approver: new Set<PermissionGroup>([
    'ENTRY_VIEW', 'ENTRY_POST', 'ENTRY_APPROVE', 'PERIOD_CLOSE', 'FINANCIAL_REPORTS',
    'CUSTODY_VIEW', 'CUSTODY_OPEN', 'CUSTODY_SETTLE',
    'EXPENSE_SUBMIT', 'EXPENSE_APPROVE',
    'STOCK_VIEW', 'STOCK_COUNT_APPROVE',
    'BREAK_GLASS_AUTHORIZE',
    'PURCHASE_VIEW', 'SUPPLIER_INVOICE_APPROVE',
  ]),
  warehouse_manager: new Set<PermissionGroup>([
    'STOCK_VIEW', 'STOCK_RECEIVE', 'STOCK_ISSUE', 'STOCK_TRANSFER', 'STOCK_RETURN', 'PURCHASE_VIEW', 'PURCHASE_MANAGE',
    'EXPENSE_SUBMIT',
  ]),
  warehouse_keeper: new Set<PermissionGroup>([
    'STOCK_VIEW', 'STOCK_RECEIVE', 'STOCK_ISSUE', 'STOCK_TRANSFER', 'STOCK_RETURN',
    'EXPENSE_SUBMIT',
  ]),
  warehouse: new Set<PermissionGroup>([
    'STOCK_VIEW', 'STOCK_RECEIVE', 'STOCK_ISSUE', 'STOCK_TRANSFER', 'STOCK_RETURN',
    'EXPENSE_SUBMIT',
  ]),
  system_admin: new Set<PermissionGroup>([
    'ENTRY_VIEW', 'ENTRY_CREATE', 'ENTRY_EDIT_DRAFT', 'ENTRY_POST', 'ENTRY_APPROVE',
    'PERIOD_CLOSE', 'FINANCIAL_REPORTS', 'CUSTODY_VIEW', 'CUSTODY_OPEN', 'CUSTODY_EXPENSE_RECORD',
    'CUSTODY_SETTLE', 'EXPENSE_SUBMIT', 'EXPENSE_APPROVE', 'STOCK_VIEW', 'STOCK_RECEIVE',
    'STOCK_ISSUE', 'STOCK_TRANSFER', 'STOCK_COUNT_APPROVE', 'STOCK_RETURN', 'AUDIT_LOG_VIEW',
    'SYSTEM_HEALTH_VIEW', 'USER_MANAGE', 'COMPANY_SETTINGS_MANAGE', 'BREAK_GLASS_AUTHORIZE',
    'PLATFORM_ADMIN',
    'PURCHASE_VIEW', 'PURCHASE_MANAGE', 'APPROVAL_POLICY_MANAGE',
    'SUPPLIER_INVOICE_APPROVE',
  ]),
  branch_manager: new Set<PermissionGroup>([
    'ENTRY_VIEW', 'FINANCIAL_REPORTS',
    'CUSTODY_VIEW', 'CUSTODY_EXPENSE_RECORD',
    'EXPENSE_SUBMIT', 'EXPENSE_APPROVE',
    'STOCK_VIEW', 'STOCK_TRANSFER',
  ]),
  auditor: new Set<PermissionGroup>([
    'PURCHASE_VIEW',
    'ENTRY_VIEW', 'FINANCIAL_REPORTS',
    'CUSTODY_VIEW', 'STOCK_VIEW',
    'AUDIT_LOG_VIEW', 'SYSTEM_HEALTH_VIEW',
  ]),
  developer: new Set<PermissionGroup>([
    'AUDIT_LOG_VIEW', 'SYSTEM_HEALTH_VIEW',
  ]),
  sales_officer: new Set<PermissionGroup>([
    'STOCK_VIEW', 'EXPENSE_SUBMIT',
  ]),
  fleet_supervisor: new Set<PermissionGroup>([
    'STOCK_VIEW', 'EXPENSE_SUBMIT',
  ]),
};

/**
 * Normalizes role string to lowercase for safe matrix lookup
 */
export function normalizeRole(role?: string): string {
  if (!role) return '';
  return role.trim().toLowerCase();
}

/**
 * Checks whether a given role is granted a specific permission group
 */
export function hasPermission(role: string | undefined, permission: PermissionGroup): boolean {
  if (!role) return false;
  const normalized = normalizeRole(role);
  const permissions = ROLE_PERMISSION_MATRIX[normalized];
  if (!permissions) return false;
  return permissions.has(permission);
}

/**
 * Single centralized Express Middleware: requirePermission
 * Usage: router.post('/path', requirePermission('ENTRY_POST'), handler)
 * Behavior:
 * - Unauthenticated (no authContext or userId) => 401 Unauthorized
 * - Authenticated but role lacks required permission => 403 Forbidden with clear Arabic message
 * - Permitted => calls next()
 */
export function requirePermission(permission: PermissionGroup) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authContext = (req as any).authContext;
    if (!authContext || !authContext.userId) {
      return res.status(401).json({
        type: 'https://api.an-erp.local/errors/unauthorized',
        title: 'غير مصرح',
        status: 401,
        detail: 'جلسة العمل غير صالحة أو منتهية. يرجى تسجيل الدخول أولاً.',
      });
    }

    const userRole = authContext.role;
    if (!hasPermission(userRole, permission)) {
      return res.status(403).json({
        type: 'https://api.an-erp.local/errors/forbidden',
        title: 'صلاحيات غير كافية',
        status: 403,
        detail: `دور المستخدم (${userRole || 'غير محدد'}) لا يملك صلاحية تنفيذ هذه العملية (${permission}).`,
      });
    }

    return next();
  };
}
