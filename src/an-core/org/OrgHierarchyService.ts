/**
 * @file OrgHierarchyService.ts
 * @description Phase 3A: Enterprise Organizational Hierarchy & Strict Scoping Service
 * Hierarchy: REGION (منطقة) -> SITE (موقع) -> BRANCH (فرع) -> DEPARTMENT (قسم)
 * Enforces strict user visibility restriction based on assigned organizational node.
 * Built strictly on top of StoragePort aggregate contracts.
 */

import { StoragePort, StorageResult, OrgNode, OrgNodeType, RFC7807Problem } from '../storage/StoragePort';

export const HIERARCHY_LEVELS: Record<OrgNodeType, number> = {
  REGION: 1,
  SITE: 2,
  BRANCH: 3,
  DEPARTMENT: 4,
};

export const ALLOWED_PARENT_TYPE: Record<OrgNodeType, OrgNodeType | null> = {
  REGION: null,
  SITE: 'REGION',
  BRANCH: 'SITE',
  DEPARTMENT: 'BRANCH',
};

export class OrgHierarchyService {
  private readonly port: StoragePort;

  constructor(port: StoragePort) {
    this.port = port;
  }

  /**
   * Validates parent-child relationship according to the 4-tier hierarchy:
   * REGION (root) -> SITE -> BRANCH -> DEPARTMENT
   */
  public async createNode(
    tenantId: string,
    node: OrgNode,
    idempotencyKey: string
  ): Promise<StorageResult<OrgNode>> {
    if (!tenantId || !node.type || !node.code || !node.nameAr) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-org-node',
          title: 'بيانات العقدة التنظيمية غير مكتملة',
          status: 400,
          detail: 'معرف المستأجر، نوع العقدة، الرمز، والاسم بالعربية حقول إلزامية.',
        },
      };
    }

    const expectedParentType = ALLOWED_PARENT_TYPE[node.type];

    if (node.type === 'REGION') {
      if (node.parentId) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/invalid-parent-node',
            title: 'خطأ في الهيكل التنظيمي - العقدة الجذرية',
            status: 400,
            detail: 'المنطقة (REGION) هي قمة الهرم التنظيمي ويجب ألا ترتبط بعقدة أم.',
          },
        };
      }
    } else {
      if (!node.parentId) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/missing-parent-node',
            title: 'خطأ في الهيكل التنظيمي - العقدة الأم مفقودة',
            status: 400,
            detail: `العقدة من نوع ${node.type} يجب أن ترتبط بعقدة أم من نوع ${expectedParentType}.`,
          },
        };
      }

      // Verify parent existence and type
      const parentRes = await this.port.getOrgNode(tenantId, node.parentId);
      if (!parentRes.success || !parentRes.data) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/parent-node-not-found',
            title: 'العقدة الأم غير موجودة',
            status: 404,
            detail: `العقدة الأم المحددة (${node.parentId}) غير موجودة في سجلات المنشأة.`,
          },
        };
      }

      const parentNode = parentRes.data;
      if (parentNode.type !== expectedParentType) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/invalid-hierarchy-level',
            title: 'مستوى هرمي تنظيمي غير متوافق',
            status: 400,
            detail: `العقدة من نوع ${node.type} تتطلب عقدة أم من نوع ${expectedParentType}، ولكن العقدة الأم الحالية من نوع ${parentNode.type}.`,
          },
        };
      }
    }

    return this.port.saveOrgNode(tenantId, node, idempotencyKey);
  }

  /**
   * Retrieves the full organizational tree or a sub-tree for a tenant.
   */
  public async getHierarchy(tenantId: string, rootNodeId?: string): Promise<StorageResult<OrgNode[]>> {
    return this.port.listOrgHierarchy(tenantId, rootNodeId);
  }

  /**
   * Retrieves all nodes accessible to a user assigned to a specific node.
   * Returns the assigned node plus all of its recursive descendants.
   */
  public async getVisibleScope(tenantId: string, assignedNodeId: string): Promise<StorageResult<OrgNode[]>> {
    return this.port.getUserVisibleNodes(tenantId, assignedNodeId);
  }

  /**
   * Strict authorization check: Can a user assigned to assignedNodeId view or access targetNodeId?
   */
  public async canAccessNode(
    tenantId: string,
    assignedNodeId: string,
    targetNodeId: string
  ): Promise<boolean> {
    if (!assignedNodeId || !targetNodeId) return false;
    if (assignedNodeId === targetNodeId) return true;

    const visibleNodesRes = await this.port.getUserVisibleNodes(tenantId, assignedNodeId);
    if (!visibleNodesRes.success || !visibleNodesRes.data) return false;

    return visibleNodesRes.data.some((node) => node.id === targetNodeId);
  }
}
