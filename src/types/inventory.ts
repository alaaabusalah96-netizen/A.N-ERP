import { BaseMetadata } from './enterprise';

export type InventoryDocType =
  | 'Receipt'          // إذن استلام / الاستلامات
  | 'Addition'         // إذن إضافة
  | 'Issue'            // إذن صرف
  | 'Transfer'         // إذن تحويل بين المخازن
  | 'BranchTransfer'   // إذن تحويل إلى فرع
  | 'StationTransfer'  // إذن تحويل إلى محطة
  | 'BranchReturn'     // مرتجع من فرع أو محطة
  | 'SupplierReturn'   // مرتجع إلى مورد
  | 'Adjustment'       // تسوية جرد
  | 'Damage';          // إذن إتلاف / خردة

export type InventoryDocStatus = 'Draft' | 'Pending' | 'Approved' | 'Posted' | 'Rejected' | 'Cancelled' | 'Dispatched';

export interface WarehouseType {
  id: string;
  code: string;           // MAIN, SUB, PRODUCTION, RAW_MATERIAL, FINISHED_GOODS, RETURNS, DAMAGED, TRANSIT, SPARE_PARTS, CUSTOM
  nameAr: string;
  nameEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  companyId?: string | null;
  isPredefined: boolean;
  isActive: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  company_id: string;
  location?: string;
  receiving_approval_workflow: boolean; // whether it requires approval before stock updates
  max_capacity_qty?: number;            // Maximum total item units allowed (optional)
  max_capacity_volume?: number;         // Maximum volume allowed in m³ (optional)
  is_capacity_enforced?: boolean;       // Enable physical limit validation on postings

  // Phase 5: Hierarchical & Enterprise Organization Links
  parent_id?: string | null;            // Parent warehouse ID
  type_id?: string;                     // ID of the WarehouseType
  type_code?: string;                   // 'MAIN' | 'SUB' | 'PRODUCTION' | 'RAW_MATERIAL' | 'FINISHED_GOODS' | 'RETURNS' | 'DAMAGED' | 'TRANSIT' | 'SPARE_PARTS' | string
  org_unit_id?: string | null;          // Linked Organization Unit ID (from Phase 2/3/4)
  path?: string;                        // Materialized path, e.g. '/wh-main/wh-sub1'
  level?: number;                       // Hierarchy depth level (0 for root)
  metadata?: Record<string, any>;       // Custom attributes & metadata
}

export interface WarehouseTreeNode extends Warehouse {
  typeNameAr?: string;
  typeNameEn?: string;
  children: WarehouseTreeNode[];
}

export interface WarehouseHierarchyValidationResult {
  isValid: boolean;
  totalWarehouses: number;
  maxDepth: number;
  orphanIds: string[];
  cycleIds: string[];
  errors: string[];
}

// Phase 6: Dynamic Warehouse Templates
export interface WarehouseTemplateNode {
  codeSuffix: string;
  nameAr: string;
  nameEn: string;
  typeCode: string;                   // 'MAIN' | 'SUB' | 'PRODUCTION' | 'RAW_MATERIAL' | 'FINISHED_GOODS' | 'RETURNS' | 'DAMAGED' | 'TRANSIT' | 'SPARE_PARTS' | string
  receivingApprovalWorkflow?: boolean;
  maxCapacityQty?: number;
  children?: WarehouseTemplateNode[];
}

export interface WarehouseTemplate {
  id: string;
  code: string;                       // 'FACTORY' | 'TRADING' | 'RETAIL' | 'RESTAURANT' | 'POULTRY' | 'CUSTOM' | string
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  isPredefined: boolean;
  companyId?: string | null;
  isActive: boolean;
  nodes: WarehouseTemplateNode[];
}

export interface InstantiateWarehouseTemplateParams {
  templateId: string;
  companyId: string;
  org_unit_id?: string | null;
  namePrefixAr?: string;
  namePrefixEn?: string;
  codePrefix?: string;
  parentWarehouseId?: string | null;
}

export interface Product {
  id: string;
  name: string;
  code: string;
  barcode?: string;
  unit: string;
  min_stock: number;
  last_purchase_price?: number;
  is_active: boolean;
  company_id: string;
  description?: string;
}

export interface BinAllocation {
  bin_id: string;
  bin_code: string;
  qty: number;
}

export interface InventoryDocItem {
  product_id: string;
  product_code: string;
  product_name: string;
  unit: string;
  qty: number;
  batch_no?: string;
  expiry_date?: string;
  notes?: string;
  last_purchase_price?: number;
  qty_received?: number;
  qty_variance?: number;
  variance_reason?: string;
  bin_allocations?: BinAllocation[]; // Multi-bin distribution for this item
}

export interface InventoryDocument extends BaseMetadata {
  id: string;
  doc_no: string;
  date: string;
  doc_type: InventoryDocType;
  company_id?: string;
  source_warehouse_id?: string; // From warehouse
  dest_entity_id?: string;       // To warehouse, branch, station, supplier, customer, etc.
  dest_entity_type?: 'warehouse' | 'branch' | 'station' | 'supplier' | 'customer' | 'scrap' | 'adjustment' | 'org_unit';
  org_unit_id?: string | null;   // Linked Source Organization Unit ID (Phase 12)
  dest_org_unit_id?: string | null; // Linked Destination Organization Unit ID (Phase 12)
  cost_center_id?: string | null; // Linked Cost Center ID (Phase 12 & 13)
  region_id?: string | null;    // Legacy Region ID
  station_id?: string | null;   // Legacy Station ID
  receipt_source_type?: 'supplier' | 'transfer'; // For Receipt doc: Supplier vs Internal Transfer
  receipt_transfer_entity_id?: string;
  supplier_name?: string;
  ref_no?: string;
  reason?: string;
  recipient?: string;
  statement?: string;
  notes?: string;
  items: InventoryDocItem[];
  status: InventoryDocStatus;
  scrap_action?: 'IN' | 'OUT';
  received_date?: string;
  received_by?: string;
  received_notes?: string;
}

export interface StockMovement {
  id: string;
  doc_id: string;
  doc_no: string;
  doc_type: InventoryDocType;
  product_id: string;
  warehouse_id: string;
  org_unit_id?: string | null; // Linked Organization Unit ID (Phase 12)
  region_id?: string | null;   // Legacy Region ID
  station_id?: string | null;  // Legacy Station ID
  qty_change: number; // Positive for IN, Negative for OUT
  type: 'IN' | 'OUT';
  current_balance_after: number;
  date: string;
  company_id: string;
  created_at: string;
  created_by: string;
  bin_id?: string;    // Specific bin targeted by this movement
  bin_code?: string;  // Specific bin code targeted
  batch_no?: string;  // Batch / Lot number
  expiry_date?: string; // Expiration date
}

export interface InventoryReportFilter {
  startDate?: string;
  endDate?: string;
  warehouseId?: string;
  org_unit_id?: string;
  productId?: string;
  docType?: InventoryDocType;
}

export interface InventoryLedgerEntry {
  id: string;
  company_id: string;
  warehouse_id: string;
  org_unit_id?: string | null;   // Linked Organization Unit ID (Phase 12)
  cost_center_id?: string | null; // Derived Cost Center ID (Phase 12)
  region_id?: string | null;     // Legacy Region ID
  station_id?: string | null;    // Legacy Station ID
  product_id: string;
  transaction_type: string; // e.g. Receipt, Issue, Transfer, etc.
  reference_document_id: string; // doc_id
  reference_document_no: string; // doc_no
  qty_in: number;
  qty_out: number;
  balance_before: number;
  balance_after: number;
  unit_cost: number;
  running_cost: number; // accumulated running cost (unit_cost * balance_after)
  timestamp: string; // ISO timestamp
  user_id: string;
  user_name?: string;
  audit_ref: string; // audit trace code
  bin_id?: string;    // Bin location of this ledger transaction
  bin_code?: string;  // Bin location code
  batch_no?: string;  // Batch / Lot number
  expiry_date?: string; // Expiration date
}

export interface WarehouseBin {
  id: string;
  warehouse_id: string;
  code: string;       // e.g., BIN-A1-S3
  name: string;       // e.g., Row A, Shelf 3
  max_capacity_qty: number; // Maximum units allowed in this bin
  is_active: boolean;
  zone?: string;      // e.g., Ambient, Cold Storage, Hazardous, etc.
}

export interface ProductBatchStock {
  batch_no: string;
  expiry_date?: string;
  available_qty: number;
}

export interface InventoryWorkflowConfig {
  valuation_method: 'FEFO' | 'FIFO' | 'LIFO' | 'MANUAL';
  allow_overdraft: 'STRICT' | 'WARNING' | 'ALLOWED';
  bin_tracking_policy: 'MANDATORY' | 'OPTIONAL' | 'DISABLED';
  batch_expiry_policy: 'MANDATORY' | 'WARNING' | 'OPTIONAL';
  transfer_approval_mode: 'TWO_STEP' | 'DIRECT';
  auto_post_accounting: boolean;
  require_approval_for_posting: boolean;
  reorder_alert_threshold_percent: number;
  default_inventory_account_code: string;
  default_ap_account_code: string;
  default_cogs_account_code: string;
  default_variance_account_code: string;
  default_scrap_account_code: string;
}


