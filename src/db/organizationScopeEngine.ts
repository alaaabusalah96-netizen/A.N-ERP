import { AppUser } from '../types';
import { OrganizationUnit } from '../types/organization';
import { OrganizationEngine } from './organizationEngine';
import { PermissionContext } from '../types/enterprise';
import { PermissionEngine } from '../lib/enterprise/permission';

export class OrganizationScopeEngine {
  private static _accessibleIdsCache = new Map<string, string[]>();
  private static _cacheVersion: string = '';

  static invalidateScopeCache(): void {
    OrganizationScopeEngine._accessibleIdsCache.clear();
    OrganizationScopeEngine._cacheVersion = '';
  }

  /**
   * Calculates all organization unit IDs accessible by the user, incorporating tree inheritance.
   * If a user is assigned to a parent node (e.g. Region or Sector), they automatically inherit
   * access to all descendant nodes (Branches, Stations, Sub-units) under that parent.
   */
  static getAccessibleOrgUnitIds(user: AppUser, companyId?: string): string[] {
    const targetCompanyId = companyId || user.company_id;
    if (!targetCompanyId) {
      return [];
    }
    const currentVersion = OrganizationEngine.getUnitsVersionKey();
    if (OrganizationScopeEngine._cacheVersion !== currentVersion) {
      OrganizationScopeEngine._accessibleIdsCache.clear();
      OrganizationScopeEngine._cacheVersion = currentVersion;
    }
    const cacheKey = `${user.id || ''}_${user.role || ''}_${user.org_unit_id || ''}_${(user.assigned_org_unit_ids || []).join(',')}_${user.region_id || ''}_${user.station_id || ''}_${targetCompanyId}`;
    const cached = OrganizationScopeEngine._accessibleIdsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const allUnits = OrganizationEngine.getOrganizationUnits(targetCompanyId);

    // Full administrative or company-wide scope
    const isFullAdmin = user.role === 'Admin' || user.role === 'SystemAdmin' || !!user.is_platform_owner;
    const hasNoRestrictedScope = !user.org_unit_id && (!user.assigned_org_unit_ids || user.assigned_org_unit_ids.length === 0) && !user.region_id && !user.station_id;

    if (isFullAdmin || hasNoRestrictedScope) {
      const result = allUnits.map(u => u.id);
      OrganizationScopeEngine._accessibleIdsCache.set(cacheKey, result);
      return result;
    }

    const assignedUnitIds = new Set<string>();

    if (user.org_unit_id) {
      assignedUnitIds.add(user.org_unit_id);
    }
    if (user.assigned_org_unit_ids && Array.isArray(user.assigned_org_unit_ids)) {
      user.assigned_org_unit_ids.forEach(id => assignedUnitIds.add(id));
    }

    // Backward compatibility resolution for legacy region_id / station_id
    if (assignedUnitIds.size === 0) {
      if (user.region_id) {
        // Find units matching region_id or metadata.legacy_region_id
        const matchingRegionUnits = allUnits.filter(u => 
          u.id === user.region_id || 
          u.code === user.region_id || 
          u.metadata?.legacy_region_id === user.region_id
        );
        if (matchingRegionUnits.length > 0) {
          matchingRegionUnits.forEach(u => assignedUnitIds.add(u.id));
        } else {
          assignedUnitIds.add(`legacy-region-${user.region_id}`);
        }
      }

      if (user.station_id) {
        const matchingStationUnits = allUnits.filter(u => 
          u.id === user.station_id || 
          u.code === user.station_id || 
          u.metadata?.legacy_station_id === user.station_id
        );
        if (matchingStationUnits.length > 0) {
          matchingStationUnits.forEach(u => assignedUnitIds.add(u.id));
        } else {
          assignedUnitIds.add(`legacy-station-${user.station_id}`);
        }
      }
    }

    const accessibleIds = new Set<string>();

    // For every explicitly assigned unit, find itself and all its descendant units in the tree
    assignedUnitIds.forEach(rootUnitId => {
      accessibleIds.add(rootUnitId);

      const rootUnit = allUnits.find(u => u.id === rootUnitId);
      if (rootUnit) {
        // Collect descendant units via path prefix matching or parent recursion
        allUnits.forEach(unit => {
          if (unit.path && rootUnit.path && unit.path.startsWith(rootUnit.path)) {
            accessibleIds.add(unit.id);
          } else if (unit.parentId === rootUnit.id) {
            accessibleIds.add(unit.id);
          }
        });

        // Additional recursive search in case path isn't formatted
        const descendants = OrganizationEngine.getDescendantUnits(rootUnit.id, targetCompanyId);
        descendants.forEach(d => accessibleIds.add(d.id));
      }
    });

    const result = Array.from(accessibleIds);
    OrganizationScopeEngine._accessibleIdsCache.set(cacheKey, result);
    return result;
  }

  /**
   * Checks whether a specific organization unit is within the user's scope.
   */
  static isOrgUnitInScope(targetOrgUnitId: string | null | undefined, user: AppUser, companyId?: string): boolean {
    if (!targetOrgUnitId) {
      return true; // Unassigned or company-level items accessible
    }

    const accessibleIds = OrganizationScopeEngine.getAccessibleOrgUnitIds(user, companyId);
    return accessibleIds.includes(targetOrgUnitId);
  }

  /**
   * Evaluates scope access for any record with org_unit_id, region_id, or station_id.
   */
  static isTargetInUserScope(
    target: { company_id?: string; org_unit_id?: string; region_id?: string; station_id?: string },
    user: AppUser
  ): boolean {
    // Check company boundary
    if (target.company_id && user.company_id && target.company_id !== user.company_id && !user.is_platform_owner) {
      return false;
    }

    // Admins have full company scope
    if (user.role === 'Admin' || user.role === 'SystemAdmin' || !!user.is_platform_owner) {
      return true;
    }

    // If target has org_unit_id, evaluate org scope tree
    if (target.org_unit_id) {
      return OrganizationScopeEngine.isOrgUnitInScope(target.org_unit_id, user, target.company_id);
    }

    // Legacy fallback check for region_id and station_id
    if (user.region_id && target.region_id) {
      if (user.region_id === target.region_id) return true;
    }

    if (user.station_id && target.station_id) {
      if (user.station_id === target.station_id) return true;
    }

    // If user has org_unit_id and target has region_id/station_id without org_unit_id
    const targetCompanyId = target.company_id || user.company_id;
    if (!targetCompanyId) {
      return false;
    }
    const accessibleUnitIds = OrganizationScopeEngine.getAccessibleOrgUnitIds(user, targetCompanyId);
    const allUnits = OrganizationEngine.getOrganizationUnits(targetCompanyId);

    if (target.region_id) {
      if (accessibleUnitIds.includes(target.region_id) || accessibleUnitIds.includes(`legacy-region-${target.region_id}`)) {
        return true;
      }
      const resolvedUnit = OrganizationEngine.resolveOrgUnitForEntity({ region_id: target.region_id }, targetCompanyId);
      if (resolvedUnit && accessibleUnitIds.includes(resolvedUnit.id)) {
        return true;
      }
      const matchingRegionUnits = allUnits.filter(u =>
        u.id === target.region_id ||
        u.code === target.region_id ||
        u.metadata?.legacy_region_id === target.region_id ||
        u.id === `org-unit-region-${target.region_id}` ||
        u.id === `org-unit-${target.region_id}`
      );
      if (matchingRegionUnits.some(u => accessibleUnitIds.includes(u.id))) {
        return true;
      }
    }

    if (target.station_id) {
      if (accessibleUnitIds.includes(target.station_id) || accessibleUnitIds.includes(`legacy-station-${target.station_id}`)) {
        return true;
      }
      const resolvedUnit = OrganizationEngine.resolveOrgUnitForEntity({ station_id: target.station_id }, targetCompanyId);
      if (resolvedUnit && accessibleUnitIds.includes(resolvedUnit.id)) {
        return true;
      }
      const matchingStationUnits = allUnits.filter(u =>
        u.id === target.station_id ||
        u.code === target.station_id ||
        u.metadata?.legacy_station_id === target.station_id ||
        u.id === `org-unit-station-${target.station_id}` ||
        u.id === `org-unit-${target.station_id}`
      );
      if (matchingStationUnits.some(u => accessibleUnitIds.includes(u.id))) {
        return true;
      }
    }

    // If user has no scope restrictions, allow
    const hasNoRestrictedScope = !user.org_unit_id && (!user.assigned_org_unit_ids || user.assigned_org_unit_ids.length === 0) && !user.region_id && !user.station_id;
    return hasNoRestrictedScope;
  }

  /**
   * Filters an array of items according to the user's organization scope.
   */
  static filterByOrganizationScope<T extends { company_id?: string; org_unit_id?: string; region_id?: string; station_id?: string }>(
    items: T[],
    user: AppUser
  ): T[] {
    return items.filter(item => OrganizationScopeEngine.isTargetInUserScope(item, user));
  }

  /**
   * Combines RBAC permission checks with Organization Scope inheritance.
   */
  static hasScopedPermission(
    permissionId: string,
    context: PermissionContext,
    permissionEngine: PermissionEngine,
    user: AppUser,
    targetOrgUnitId?: string
  ): boolean {
    const hasRbac = permissionEngine.hasPermission(permissionId, context);
    if (!hasRbac) return false;

    if (!targetOrgUnitId) return true;

    return OrganizationScopeEngine.isOrgUnitInScope(targetOrgUnitId, user, context.tenantId || user.company_id);
  }
}
