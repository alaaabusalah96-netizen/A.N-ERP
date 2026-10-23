import { WarehouseTemplate, WarehouseTemplateNode, Warehouse, InstantiateWarehouseTemplateParams } from '../types/inventory';
import { StorageEngine } from './storage';
import { WarehouseHierarchyEngine } from './warehouseHierarchyEngine';
import { syncWriteWithOfflineFallback } from './offlineQueue';
import { UsersModule } from './users';
import { LogsModule } from './logs';

export const DEFAULT_WAREHOUSE_TEMPLATES: WarehouseTemplate[] = [
  {
    id: 'wh-tpl-factory',
    code: 'FACTORY',
    nameAr: 'قالب الهيكل المخزني للمصانع والإنتاج',
    nameEn: 'Manufacturing & Factory Template',
    descriptionAr: 'هيكل متكامل يشمل خامات، صالة إنتاج، منتج تام، مرتجعات، هالك، وقطع غيار',
    descriptionEn: 'Full manufacturing layout: raw materials, production line, finished goods, returns, scrap, and spares',
    isPredefined: true,
    companyId: null,
    isActive: true,
    nodes: [
      {
        codeSuffix: 'MAIN',
        nameAr: 'المستودع الرئيسي للمصنع',
        nameEn: 'Main Factory Central Warehouse',
        typeCode: 'MAIN',
        receivingApprovalWorkflow: true,
        children: [
          {
            codeSuffix: 'RAW',
            nameAr: 'مستودع المواد الخام والمستلزمات',
            nameEn: 'Raw Materials & Components Store',
            typeCode: 'RAW_MATERIAL',
            receivingApprovalWorkflow: false,
          },
          {
            codeSuffix: 'PROD',
            nameAr: 'مستودع صالة خطوط الإنتاج',
            nameEn: 'Production Line Shopfloor Store',
            typeCode: 'PRODUCTION',
            receivingApprovalWorkflow: false,
          },
          {
            codeSuffix: 'FG',
            nameAr: 'مستودع المنتجات التامة والجاهزة',
            nameEn: 'Finished Goods Storage',
            typeCode: 'FINISHED_GOODS',
            receivingApprovalWorkflow: false,
          },
          {
            codeSuffix: 'QA_RETURNS',
            nameAr: 'مستودع الجودة والمرتجعات تحت الفحص',
            nameEn: 'Quarantine & Returns Inspection Store',
            typeCode: 'RETURNS',
            receivingApprovalWorkflow: true,
          },
          {
            codeSuffix: 'SCRAP',
            nameAr: 'مستودع الهالك والخردة',
            nameEn: 'Scrap & Damaged Items Warehouse',
            typeCode: 'DAMAGED',
            receivingApprovalWorkflow: false,
          },
          {
            codeSuffix: 'SPARES',
            nameAr: 'مستودع قطع غيار الصيانة والآلات',
            nameEn: 'Machinery Spare Parts Store',
            typeCode: 'SPARE_PARTS',
            receivingApprovalWorkflow: false,
          },
        ],
      },
    ],
  },
  {
    id: 'wh-tpl-trading',
    code: 'TRADING',
    nameAr: 'قالب الهيكل المخزني للشركات التجارية والتوزيع',
    nameEn: 'Trading & Wholesale Distribution Template',
    descriptionAr: 'هيكل للشركات التجارية يشمل مستودع مركزي، بالجملة، ترانزيت، ومرتجعات',
    descriptionEn: 'Trading structure: central hub, wholesale reserve, transit stock, and returns store',
    isPredefined: true,
    companyId: null,
    isActive: true,
    nodes: [
      {
        codeSuffix: 'HUB',
        nameAr: 'المستودع المركزي للتوزيع',
        nameEn: 'Central Distribution Hub',
        typeCode: 'MAIN',
        receivingApprovalWorkflow: true,
        children: [
          {
            codeSuffix: 'BULK',
            nameAr: 'مستودع التخزين بالجمُلة',
            nameEn: 'Wholesale Bulk Reserve Store',
            typeCode: 'SUB',
            receivingApprovalWorkflow: false,
          },
          {
            codeSuffix: 'TRANSIT',
            nameAr: 'مستودع الترانزيت والشحن',
            nameEn: 'In-Transit & Shipping Warehouse',
            typeCode: 'TRANSIT',
            receivingApprovalWorkflow: false,
          },
          {
            codeSuffix: 'RETURNS',
            nameAr: 'مستودع مرتجعات العملاء',
            nameEn: 'Customer Returns Warehouse',
            typeCode: 'RETURNS',
            receivingApprovalWorkflow: true,
          },
          {
            codeSuffix: 'DAMAGED',
            nameAr: 'مستودع البضاعة التالفة',
            nameEn: 'Damaged Stock Store',
            typeCode: 'DAMAGED',
            receivingApprovalWorkflow: false,
          },
        ],
      },
    ],
  },
  {
    id: 'wh-tpl-retail',
    code: 'RETAIL',
    nameAr: 'قالب الهيكل المخزني للتجزئة والمعارض',
    nameEn: 'Retail & Showrooms Template',
    descriptionAr: 'هيكل للفروع والمعارض يشمل صالة العرض والمخزن الخلفي ومرتجعات المعرض',
    descriptionEn: 'Retail layout: showroom floor, backroom reserve, and store returns',
    isPredefined: true,
    companyId: null,
    isActive: true,
    nodes: [
      {
        codeSuffix: 'STORE_MAIN',
        nameAr: 'مستودع المعرض/الفرع الرئيسي',
        nameEn: 'Main Retail Store Warehouse',
        typeCode: 'MAIN',
        receivingApprovalWorkflow: false,
        children: [
          {
            codeSuffix: 'SHOWROOM',
            nameAr: 'مستودع صالة العرض والرفوف',
            nameEn: 'Showroom Floor Display Store',
            typeCode: 'SUB',
            receivingApprovalWorkflow: false,
          },
          {
            codeSuffix: 'BACKROOM',
            nameAr: 'مستودع المخزن الخلفي والاحتياطي',
            nameEn: 'Backroom Reserve Storage',
            typeCode: 'SUB',
            receivingApprovalWorkflow: false,
          },
          {
            codeSuffix: 'RETURNS',
            nameAr: 'مستودع مرتجعات المعرض',
            nameEn: 'Retail Store Returns',
            typeCode: 'RETURNS',
            receivingApprovalWorkflow: true,
          },
        ],
      },
    ],
  },
  {
    id: 'wh-tpl-restaurant',
    code: 'RESTAURANT',
    nameAr: 'قالب الهيكل المخزني للمطاعم والأغذية',
    nameEn: 'Restaurant & Food Service Template',
    descriptionAr: 'هيكل مخصص للمطاعم والأغذية: تبريد وتجميد، تجهيز مطبخ، ومواد جافة',
    descriptionEn: 'Food service setup: cold storage/freezer, kitchen prep, dry stores, and food waste',
    isPredefined: true,
    companyId: null,
    isActive: true,
    nodes: [
      {
        codeSuffix: 'COMMISSARY',
        nameAr: 'المستودع المركزي للمطبخ/الفرع',
        nameEn: 'Central Kitchen Commissary Store',
        typeCode: 'MAIN',
        receivingApprovalWorkflow: true,
        children: [
          {
            codeSuffix: 'FREEZER_COLD',
            nameAr: 'مستودع التبريد والتجميد (لحوم وألبان)',
            nameEn: 'Cold Storage & Freezers Store',
            typeCode: 'RAW_MATERIAL',
            receivingApprovalWorkflow: false,
          },
          {
            codeSuffix: 'PREP_KITCHEN',
            nameAr: 'مستودع خط التجهيز والمطبخ',
            nameEn: 'Kitchen Assembly & Line Store',
            typeCode: 'PRODUCTION',
            receivingApprovalWorkflow: false,
          },
          {
            codeSuffix: 'DRY_GOODS',
            nameAr: 'مستودع المواد الجافة والتعليب',
            nameEn: 'Dry Goods & Packaging Store',
            typeCode: 'RAW_MATERIAL',
            receivingApprovalWorkflow: false,
          },
          {
            codeSuffix: 'WASTE',
            nameAr: 'مستودع الهالك والتالف الغذائي',
            nameEn: 'Food Spoilage & Damaged Store',
            typeCode: 'DAMAGED',
            receivingApprovalWorkflow: false,
          },
        ],
      },
    ],
  },
  {
    id: 'wh-tpl-poultry',
    code: 'POULTRY',
    nameAr: 'قالب الهيكل المخزني للمزارع والدواجن',
    nameEn: 'Poultry & Farm Agriculture Template',
    descriptionAr: 'هيكل للمزارع: أعلاف وصوامع، أدوية وبيطرة، فرز وتعبئة البيض/الإنتاج، وموتيات',
    descriptionEn: 'Farm structure: feed & silos, veterinary supplies, egg/produce packing, and mortality store',
    isPredefined: true,
    companyId: null,
    isActive: true,
    nodes: [
      {
        codeSuffix: 'FARM_HUB',
        nameAr: 'مستودع مجمع المزرعة الرئيسي',
        nameEn: 'Main Farm Compound Warehouse',
        typeCode: 'MAIN',
        receivingApprovalWorkflow: true,
        children: [
          {
            codeSuffix: 'FEED_SILO',
            nameAr: 'مستودع الأعلاف والخامات والصوامع',
            nameEn: 'Feed & Ingredients Silo Store',
            typeCode: 'RAW_MATERIAL',
            receivingApprovalWorkflow: false,
          },
          {
            codeSuffix: 'VET_MEDS',
            nameAr: 'مستودع الأدوية واللقاحات والمستلزمات البيطرية',
            nameEn: 'Veterinary & Medication Store',
            typeCode: 'SPARE_PARTS',
            receivingApprovalWorkflow: false,
          },
          {
            codeSuffix: 'PACKING_FG',
            nameAr: 'مستودع الفرز والتعبئة والإنتاج التام',
            nameEn: 'Grading, Packing & Output Warehouse',
            typeCode: 'FINISHED_GOODS',
            receivingApprovalWorkflow: false,
          },
          {
            codeSuffix: 'MORTALITY_SCRAP',
            nameAr: 'مستودع النافق والمخلّفات',
            nameEn: 'Mortality & Farm Scrap Store',
            typeCode: 'DAMAGED',
            receivingApprovalWorkflow: false,
          },
        ],
      },
    ],
  },
  {
    id: 'wh-tpl-custom',
    code: 'CUSTOM',
    nameAr: 'قالب مرن قابل للتخصيص الكامل',
    nameEn: 'Customizable Flexible Warehouse Template',
    descriptionAr: 'هيكل مرن أساسي يتيح للمشرف تخصيص المستودعات يدوياً',
    descriptionEn: 'Basic customizable template for custom organizational requirements',
    isPredefined: true,
    companyId: null,
    isActive: true,
    nodes: [
      {
        codeSuffix: 'GEN_MAIN',
        nameAr: 'المستودع الرئيسي العام',
        nameEn: 'General Main Warehouse',
        typeCode: 'MAIN',
        receivingApprovalWorkflow: false,
        children: [
          {
            codeSuffix: 'GEN_SUB',
            nameAr: 'المستودع الفرعي العام',
            nameEn: 'General Sub Warehouse',
            typeCode: 'SUB',
            receivingApprovalWorkflow: false,
          },
        ],
      },
    ],
  },
];

export class WarehouseTemplateEngine {
  static getWarehouseTemplates(companyId?: string): WarehouseTemplate[] {
    const list = StorageEngine.getStored<WarehouseTemplate[]>('warehouse_templates', DEFAULT_WAREHOUSE_TEMPLATES);
    const effectiveList = (list && list.length > 0) ? list : DEFAULT_WAREHOUSE_TEMPLATES;
    if (!companyId) return effectiveList;
    return effectiveList.filter(t => t.companyId === null || t.companyId === companyId);
  }

  static async saveWarehouseTemplatesAsync(templates: WarehouseTemplate[]): Promise<{ success: boolean; error?: string }> {
    const existing = StorageEngine.getStored<WarehouseTemplate[]>('warehouse_templates', DEFAULT_WAREHOUSE_TEMPLATES);
    const changed = templates.filter(t => {
      const old = existing.find(ex => ex.id === t.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(t);
    });

    for (const t of changed) {
      const res = await syncWriteWithOfflineFallback('warehouse_templates', t.id, t);
      if (!res.success) {
        console.warn(`[saveWarehouseTemplatesAsync] Warning: ${res.error}`);
        return { success: false, error: res.error };
      }
    }

    StorageEngine.setStored('warehouse_templates', templates);
    return { success: true };
  }

  static saveWarehouseTemplates(templates: WarehouseTemplate[]): void {
    const existing = StorageEngine.getStored<WarehouseTemplate[]>('warehouse_templates', DEFAULT_WAREHOUSE_TEMPLATES);
    const changed = templates.filter(t => {
      const old = existing.find(ex => ex.id === t.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(t);
    });

    StorageEngine.setStored('warehouse_templates', templates);
    changed.forEach(t => {
      syncWriteWithOfflineFallback('warehouse_templates', t.id, t).catch(err => {
        console.warn(`[saveWarehouseTemplates] Background sync warning for template ${t.id}:`, err);
      });
    });
  }

  static addWarehouseTemplate(templateData: Omit<WarehouseTemplate, 'id' | 'isPredefined'>): WarehouseTemplate {
    const templates = StorageEngine.getStored<WarehouseTemplate[]>('warehouse_templates', DEFAULT_WAREHOUSE_TEMPLATES);
    const newTemplate: WarehouseTemplate = {
      ...templateData,
      id: crypto.randomUUID(),
      isPredefined: false,
    };

    templates.push(newTemplate);
    WarehouseTemplateEngine.saveWarehouseTemplates(templates);

    const activeUser = UsersModule.getActiveUser();
    LogsModule.addLog(
      activeUser?.id || 'system',
      activeUser?.full_name || 'System',
      'Add Warehouse Template',
      `Created custom template: ${newTemplate.nameAr} (${newTemplate.code})`
    );

    return newTemplate;
  }

  /**
   * Instantiates a warehouse template into concrete hierarchical Warehouse records.
   */
  static async instantiateWarehouseTemplate(params: InstantiateWarehouseTemplateParams): Promise<Warehouse[]> {
    const templates = WarehouseTemplateEngine.getWarehouseTemplates(params.companyId);
    const template = templates.find(t => t.id === params.templateId || t.code === params.templateId);
    if (!template) {
      throw new Error(`Warehouse template ${params.templateId} not found.`);
    }

    const createdWarehouses: Warehouse[] = [];

    const namePrefixAr = params.namePrefixAr ? `${params.namePrefixAr} - ` : '';
    const namePrefixEn = params.namePrefixEn ? `${params.namePrefixEn} - ` : '';
    const codePrefix = params.codePrefix ? `${params.codePrefix}-` : '';

    async function instantiateNode(
      node: WarehouseTemplateNode,
      parentId: string | null
    ): Promise<void> {
      const name = `${namePrefixAr}${node.nameAr}`;
      const code = `${codePrefix}${node.codeSuffix}`;

      const created = await WarehouseHierarchyEngine.addWarehouse({
        name,
        code,
        is_active: true,
        company_id: params.companyId,
        receiving_approval_workflow: node.receivingApprovalWorkflow ?? false,
        max_capacity_qty: node.maxCapacityQty,
        parent_id: parentId,
        type_code: node.typeCode,
        org_unit_id: params.org_unit_id || null,
      });

      createdWarehouses.push(created);

      if (node.children && node.children.length > 0) {
        for (const childNode of node.children) {
          await instantiateNode(childNode, created.id);
        }
      }
    }

    for (const rootNode of template.nodes) {
      await instantiateNode(rootNode, params.parentWarehouseId || null);
    }

    const activeUser = UsersModule.getActiveUser();
    LogsModule.addLog(
      activeUser?.id || 'system',
      activeUser?.full_name || 'System',
      'Instantiate Warehouse Template',
      `Instantiated template ${template.nameEn} for company ${params.companyId}. Created ${createdWarehouses.length} warehouses.`
    );

    return createdWarehouses;
  }
}
