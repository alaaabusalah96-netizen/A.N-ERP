import { Warehouse, WarehouseType, WarehouseTreeNode, WarehouseHierarchyValidationResult } from '../types/inventory';
import { StorageEngine } from './storage';
import { InventoryModule } from './inventory';
import { syncWriteWithOfflineFallback } from './offlineQueue';
import { UsersModule } from './users';
import { LogsModule } from './logs';

// Default predefined warehouse types for all industries
export const DEFAULT_WAREHOUSE_TYPES: WarehouseType[] = [
  {
    id: 'wh-type-main',
    code: 'MAIN',
    nameAr: 'مستودع رئيسي',
    nameEn: 'Main Warehouse',
    descriptionAr: 'المستودع الرئيسي للشركة أو الفرع الرئيسي',
    descriptionEn: 'Main central warehouse for company or region',
    companyId: null,
    isPredefined: true,
    isActive: true,
  },
  {
    id: 'wh-type-sub',
    code: 'SUB',
    nameAr: 'مستودع فرعي',
    nameEn: 'Sub Warehouse',
    descriptionAr: 'مستودع فرعي ألمؤقت أو تابع لموقع/فرع محدد',
    descriptionEn: 'Secondary or branch sub-warehouse',
    companyId: null,
    isPredefined: true,
    isActive: true,
  },
  {
    id: 'wh-type-prod',
    code: 'PRODUCTION',
    nameAr: 'مستودع صالة إنتاج',
    nameEn: 'Production Warehouse',
    descriptionAr: 'مستودع صالة الإنتاج وخطوط التشغيل الفعلي',
    descriptionEn: 'Shopfloor or production line stage warehouse',
    companyId: null,
    isPredefined: true,
    isActive: true,
  },
  {
    id: 'wh-type-raw',
    code: 'RAW_MATERIAL',
    nameAr: 'مستودع مواد خام',
    nameEn: 'Raw Material Warehouse',
    descriptionAr: 'مستودع خامات ومستلزمات ومكونات التصنيع والزراعة',
    descriptionEn: 'Raw materials, ingredients, and feed stock warehouse',
    companyId: null,
    isPredefined: true,
    isActive: true,
  },
  {
    id: 'wh-type-fg',
    code: 'FINISHED_GOODS',
    nameAr: 'مستودع منتجات تامة',
    nameEn: 'Finished Goods Warehouse',
    descriptionAr: 'مستودع البضائع والمنتجات الجاهزة للبيع والتوزيع',
    descriptionEn: 'Finished goods ready for dispatch and sales',
    companyId: null,
    isPredefined: true,
    isActive: true,
  },
  {
    id: 'wh-type-returns',
    code: 'RETURNS',
    nameAr: 'مستودع مرتجعات',
    nameEn: 'Returns Warehouse',
    descriptionAr: 'مستودع بضاعة المرتجعات تحت الجرد والفحص',
    descriptionEn: 'Quarantine and customer returns inspection store',
    companyId: null,
    isPredefined: true,
    isActive: true,
  },
  {
    id: 'wh-type-damaged',
    code: 'DAMAGED',
    nameAr: 'مستودع هالك وخردة',
    nameEn: 'Damaged & Scrap Warehouse',
    descriptionAr: 'مستودع البضائع التالفة أو المكهنة والخردة',
    descriptionEn: 'Scrap, damaged, and obsolete items warehouse',
    companyId: null,
    isPredefined: true,
    isActive: true,
  },
  {
    id: 'wh-type-transit',
    code: 'TRANSIT',
    nameAr: 'مستودع ترانزيت (بالتحويل)',
    nameEn: 'Transit Warehouse',
    descriptionAr: 'مستودع افتراضي وسيط للبضائع المحولة بين الفروع والمواقع',
    descriptionEn: 'In-transit virtual stock warehouse',
    companyId: null,
    isPredefined: true,
    isActive: true,
  },
  {
    id: 'wh-type-spares',
    code: 'SPARE_PARTS',
    nameAr: 'مستودع قطع غيار ومهمات',
    nameEn: 'Spare Parts Warehouse',
    descriptionAr: 'مستودع قطع الغيار والعدد والمهمات الفنية والصيانة',
    descriptionEn: 'Maintenance spare parts and machinery supplies',
    companyId: null,
    isPredefined: true,
    isActive: true,
  },
];

export class WarehouseHierarchyEngine {
  // --- Warehouse Types Management ---

  static getWarehouseTypes(companyId?: string): WarehouseType[] {
    const list = StorageEngine.getStored<WarehouseType[]>('warehouse_types', DEFAULT_WAREHOUSE_TYPES);
    const effectiveList = (list && list.length > 0) ? list : DEFAULT_WAREHOUSE_TYPES;
    if (!companyId) return effectiveList;
    return effectiveList.filter(t => t.companyId === null || t.companyId === companyId);
  }

  static async saveWarehouseTypes(types: WarehouseType[]): Promise<{ success: boolean; error?: string }> {
    const existing = StorageEngine.getStored<WarehouseType[]>('warehouse_types', DEFAULT_WAREHOUSE_TYPES);
    const changed = types.filter(t => {
      const old = existing.find(ex => ex.id === t.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(t);
    });

    for (const t of changed) {
      const res = await syncWriteWithOfflineFallback('warehouse_types', t.id, t);
      if (!res.success) {
        console.warn(`[saveWarehouseTypes] Warning: ${res.error}`);
        return { success: false, error: res.error };
      }
    }

    StorageEngine.setStored('warehouse_types', types);
    return { success: true };
  }

  static async addWarehouseType(typeData: Omit<WarehouseType, 'id' | 'isPredefined'>): Promise<WarehouseType> {
    const types = StorageEngine.getStored<WarehouseType[]>('warehouse_types', DEFAULT_WAREHOUSE_TYPES);
    const newType: WarehouseType = {
      ...typeData,
      id: `wh-type-custom-${crypto.randomUUID()}`,
      isPredefined: false,
    };

    types.push(newType);
    await WarehouseHierarchyEngine.saveWarehouseTypes(types);

    const activeUser = UsersModule.getActiveUser();
    LogsModule.addLog(
      activeUser?.id || 'system',
      activeUser?.full_name || 'System',
      'Add Warehouse Type',
      `Created warehouse type: ${newType.nameAr} (${newType.code})`
    );

    return newType;
  }

  // --- Warehouse Path & Level Calculation ---

  static computePathAndLevel(id: string, parentId: string | null, warehouses: Warehouse[]): { path: string; level: number } {
    if (!parentId) {
      return { path: `/${id}`, level: 0 };
    }

    const parent = warehouses.find(w => w.id === parentId);
    if (!parent) {
      return { path: `/${id}`, level: 0 };
    }

    const parentPath = parent.path || `/${parent.id}`;
    const parentLevel = parent.level ?? 0;
    return {
      path: `${parentPath}/${id}`,
      level: parentLevel + 1,
    };
  }

  // --- Add / Update Warehouse with Hierarchy Links ---

  static async addWarehouse(warehouseData: Omit<Warehouse, 'id'> & { id?: string }): Promise<Warehouse> {
    const companyId = warehouseData.company_id;
    const warehouses = InventoryModule.getWarehouses(companyId);
    const id = warehouseData.id || `wh-${crypto.randomUUID()}`;
    const parentId = warehouseData.parent_id || null;

    const { path, level } = WarehouseHierarchyEngine.computePathAndLevel(id, parentId, warehouses);

    const newWarehouse: Warehouse = {
      ...warehouseData,
      id,
      parent_id: parentId,
      path,
      level,
      is_active: warehouseData.is_active ?? true,
      receiving_approval_workflow: warehouseData.receiving_approval_workflow ?? false,
    };

    warehouses.push(newWarehouse);
    await InventoryModule.saveWarehouses(warehouses, companyId);

    const activeUser = UsersModule.getActiveUser();
    LogsModule.addLog(
      activeUser?.id || 'system',
      activeUser?.full_name || 'System',
      'Add Hierarchical Warehouse',
      `Created warehouse ${newWarehouse.name} (${newWarehouse.code}) at level ${newWarehouse.level}, path ${newWarehouse.path}`
    );

    return newWarehouse;
  }

  static async updateWarehouse(id: string, updates: Partial<Warehouse>): Promise<Warehouse> {
    const warehouses = InventoryModule.getWarehouses(updates.company_id);
    const index = warehouses.findIndex(w => w.id === id);
    if (index === -1) {
      throw new Error(`Warehouse ${id} not found.`);
    }

    const current = warehouses[index];
    const newParentId = updates.parent_id !== undefined ? updates.parent_id : current.parent_id;

    let path = current.path;
    let level = current.level;

    if (newParentId !== current.parent_id) {
      const computed = WarehouseHierarchyEngine.computePathAndLevel(id, newParentId, warehouses);
      path = computed.path;
      level = computed.level;
    }

    const updatedWarehouse: Warehouse = {
      ...current,
      ...updates,
      parent_id: newParentId,
      path,
      level,
    };

    warehouses[index] = updatedWarehouse;

    // Recalculate subtree paths if parent changed
    if (newParentId !== current.parent_id) {
      WarehouseHierarchyEngine.recalculateSubtreePaths(id, warehouses);
    }

    await InventoryModule.saveWarehouses(warehouses, current.company_id);
    return updatedWarehouse;
  }

  static recalculateSubtreePaths(rootId: string, warehouses: Warehouse[]): Warehouse[] {
    const root = warehouses.find(w => w.id === rootId);
    if (!root) return warehouses;

    const children = warehouses.filter(w => w.parent_id === rootId);
    for (const child of children) {
      const computed = WarehouseHierarchyEngine.computePathAndLevel(child.id, rootId, warehouses);
      child.path = computed.path;
      child.level = computed.level;
      WarehouseHierarchyEngine.recalculateSubtreePaths(child.id, warehouses);
    }

    return warehouses;
  }

  // --- Move Warehouse (Reparenting) ---

  static async moveWarehouse(warehouseId: string, newParentId: string | null, companyId?: string): Promise<Warehouse> {
    if (warehouseId === newParentId) {
      throw new Error(`Cannot set parent of warehouse ${warehouseId} to itself.`);
    }

    const warehouses = InventoryModule.getWarehouses(companyId);
    const wh = warehouses.find(w => w.id === warehouseId);
    if (!wh) {
      throw new Error(`Warehouse ${warehouseId} not found.`);
    }

    const effectiveCompanyId = companyId || wh.company_id;

    if (newParentId) {
      const newParent = warehouses.find(w => w.id === newParentId);
      if (!newParent) {
        throw new Error(`Target parent warehouse ${newParentId} not found.`);
      }

      // Check if newParent is in the subtree of warehouse (prevent cycle)
      const subtree = WarehouseHierarchyEngine.getWarehouseSubtree(warehouseId, effectiveCompanyId);
      if (subtree.some(w => w.id === newParentId)) {
        throw new Error(`Cannot move warehouse ${wh.name} under its descendant warehouse ${newParent.name}.`);
      }
    }

    return await WarehouseHierarchyEngine.updateWarehouse(warehouseId, { parent_id: newParentId, company_id: effectiveCompanyId });
  }

  // --- Hierarchy Query Navigation ---

  static getWarehouses(companyId?: string): Warehouse[] {
    return InventoryModule.getWarehouses(companyId);
  }

  static getWarehouseChildren(parentId: string, companyId?: string): Warehouse[] {
    const warehouses = InventoryModule.getWarehouses(companyId);
    return warehouses.filter(w => w.parent_id === parentId && (!companyId || w.company_id === companyId));
  }

  static getWarehouseSubtree(rootWarehouseId: string, companyId?: string): Warehouse[] {
    const warehouses = InventoryModule.getWarehouses(companyId);
    const root = warehouses.find(w => w.id === rootWarehouseId);
    if (!root) return [];

    const rootPath = root.path || `/${root.id}`;
    return warehouses.filter(w => w.path && w.path.startsWith(rootPath));
  }

  static getWarehouseAncestors(warehouseId: string, companyId?: string): Warehouse[] {
    const warehouses = InventoryModule.getWarehouses(companyId);
    const target = warehouses.find(w => w.id === warehouseId);
    if (!target || !target.path) return [];

    const pathSegments = target.path.split('/').filter(Boolean);
    pathSegments.pop(); // remove current warehouse
    return pathSegments.map(segId => warehouses.find(w => w.id === segId)).filter((w): w is Warehouse => Boolean(w));
  }

  // --- Tree View Construction ---

  static buildWarehouseTree(companyId: string): WarehouseTreeNode[] {
    const warehouses = InventoryModule.getWarehouses(companyId).filter(w => w.company_id === companyId);
    const types = WarehouseHierarchyEngine.getWarehouseTypes(companyId);
    const typeMap = new Map(types.map(t => [t.id, t]));

    const nodeMap = new Map<string, WarehouseTreeNode>();
    warehouses.forEach(w => {
      const typeObj = w.type_id ? typeMap.get(w.type_id) : undefined;
      nodeMap.set(w.id, {
        ...w,
        typeNameAr: typeObj ? typeObj.nameAr : undefined,
        typeNameEn: typeObj ? typeObj.nameEn : undefined,
        children: [],
      });
    });

    const rootNodes: WarehouseTreeNode[] = [];
    nodeMap.forEach(node => {
      if (!node.parent_id || !nodeMap.has(node.parent_id)) {
        rootNodes.push(node);
      } else {
        const parentNode = nodeMap.get(node.parent_id);
        if (parentNode) {
          parentNode.children.push(node);
        }
      }
    });

    return rootNodes;
  }

  // --- Stock Rollup Across Subtree ---

  /**
   * Returns total stock for a warehouse inclusive of all descendant sub-warehouses in its hierarchy.
   */
  static getWarehouseInclusiveStock(warehouseId: string, productId?: string, companyId?: string): number {
    const subtree = WarehouseHierarchyEngine.getWarehouseSubtree(warehouseId, companyId);
    const warehouseIds = subtree.map(w => w.id);
    if (warehouseIds.length === 0) {
      warehouseIds.push(warehouseId);
    }

    let totalStock = 0;
    for (const whId of warehouseIds) {
      if (productId) {
        totalStock += InventoryModule.getProductStockInWarehouse(whId, productId);
      } else {
        totalStock += InventoryModule.getWarehouseTotalStock(whId);
      }
    }
    return totalStock;
  }

  // --- Hierarchy Integrity Validation Audit ---

  static validateWarehouseHierarchy(companyId: string): WarehouseHierarchyValidationResult {
    const warehouses = InventoryModule.getWarehouses(companyId).filter(w => w.company_id === companyId);
    const whMap = new Map(warehouses.map(w => [w.id, w]));

    const orphanIds: string[] = [];
    const cycleIds: string[] = [];
    const errors: string[] = [];
    let maxDepth = 0;

    for (const wh of warehouses) {
      const level = wh.level ?? 0;
      if (level > maxDepth) maxDepth = level;

      // Check orphan
      if (wh.parent_id && !whMap.has(wh.parent_id)) {
        orphanIds.push(wh.id);
        errors.push(`Warehouse ${wh.name} (${wh.code}) references non-existent parent warehouse ID ${wh.parent_id}`);
      }

      // Check cycle
      const visited = new Set<string>();
      let currId: string | null = wh.id;
      while (currId && whMap.has(currId)) {
        if (visited.has(currId)) {
          cycleIds.push(wh.id);
          errors.push(`Cycle detected involving warehouse ${wh.name} (${wh.code})`);
          break;
        }
        visited.add(currId);
        currId = whMap.get(currId)?.parent_id || null;
      }
    }

    return {
      isValid: orphanIds.length === 0 && cycleIds.length === 0,
      totalWarehouses: warehouses.length,
      maxDepth,
      orphanIds,
      cycleIds,
      errors,
    };
  }
}
