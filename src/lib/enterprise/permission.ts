import { RolePermission, PermissionContext } from '../../types/enterprise';

/**
 * 3.4 Permission Engine
 * محرك الصلاحيات والأمان المشترك للمؤسسات
 * 
 * Provides an isolated, highly reusable component to handle permission checks.
 * Implements Role-Based Access Control (RBAC) as the core operational code.
 * Prepares structures for User Overrides and Temporary Overrides.
 * Implements Lazy Expiry for Temporary Overrides.
 * Adheres strictly to the "Additive Only", "KISS", and "Zero-Disruption" guidelines.
 */
export class PermissionEngine {
  private rolePermissions: RolePermission[];

  constructor(rolePermissions: RolePermission[] = []) {
    this.rolePermissions = rolePermissions;
  }

  /**
   * Evaluates if a permission is granted under a given context, incorporating:
   * 1. Temporary Overrides (highest precedence, evaluated with Lazy Expiry)
   * 2. User Overrides (second precedence)
   * 3. Role Permissions (baseline permissions)
   * 
   * @param permissionId The unique ID of the permission to check (e.g., 'create_expense')
   * @param context Context containing user, role, tenant, and optional overrides
   * @returns boolean indicating whether the permission is granted
   */
  hasPermission(permissionId: string, context: PermissionContext): boolean {
    const referenceTime = context.currentTime || new Date().toISOString();

    // 1. Evaluate Temporary Overrides (Highest Precedence)
    if (context.temporaryOverrides && context.temporaryOverrides.length > 0) {
      // Find active temporary overrides for this user and permission
      const relevantOverrides = context.temporaryOverrides.filter(
        (o) => o.userId === context.userId && o.permissionId === permissionId
      );

      for (const override of relevantOverrides) {
        // Implement Lazy Expiry logic: Check if the override is currently valid
        const isValidStart = !override.validFrom || referenceTime >= override.validFrom;
        const isValidEnd = !override.expiresAt || referenceTime <= override.expiresAt;

        if (isValidStart && isValidEnd) {
          // Found an active temporary override. It overrides any other setting.
          return override.granted;
        }
        // If expired (Lazy Expiry), we ignore this override and check next rules.
      }
    }

    // 2. Evaluate User Overrides (Second Precedence)
    if (context.userOverrides && context.userOverrides.length > 0) {
      const userOverride = context.userOverrides.find(
        (o) => o.userId === context.userId && o.permissionId === permissionId
      );
      if (userOverride !== undefined) {
        return userOverride.granted;
      }
    }

    // 3. Evaluate Role Permissions (Baseline)
    const roleConfig = this.rolePermissions.find((rp) => rp.role === context.role);
    if (roleConfig) {
      return roleConfig.permissions.includes(permissionId);
    }

    return false;
  }

  /**
   * Updates or registers role permissions.
   */
  setRolePermissions(rolePermissions: RolePermission[]): void {
    this.rolePermissions = rolePermissions;
  }

  /**
   * Retrieves active role permissions.
   */
  getRolePermissions(): RolePermission[] {
    return this.rolePermissions;
  }
}
