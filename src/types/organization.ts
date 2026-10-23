/**
 * Enterprise Organization Engine Types (Phase 2)
 * Dynamic Organization Structure Definitions
 */

export interface OrganizationUnitType {
  id: string;
  companyId?: string | null;  // null for global default types
  code: string;
  nameAr: string;
  nameEn: string;
  level: number;
  description?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrganizationUnit {
  id: string;
  companyId: string;         // Company / Tenant identifier
  company_id?: string;        // Backward compatibility alias
  parentId: string | null;   // Parent OrganizationUnit ID
  parent_id?: string | null;  // Backward compatibility alias
  typeId: string;            // OrganizationUnitType ID
  type_id?: string;           // Backward compatibility alias
  code: string;              // Unique unit code within company
  name: string;              // Unit display name
  nameAr?: string;           // Optional Arabic name
  nameEn?: string;           // Optional English name
  path: string;              // Materialized path, e.g., "/root-id/child-id"
  level: number;             // Depth level in hierarchy (0 = root)
  metadata?: Record<string, any>; // Arbitrary domain metadata
  isActive: boolean;         // Unit active flag
  is_active?: boolean;       // Backward compatibility alias
  max_accounts_allowed?: number; // Per-unit account headcount ceiling (default 1, max 5)
  createdAt?: string;
  updatedAt?: string;
}

export interface OrganizationPath {
  id: string;                // Identical to unitId
  unitId: string;            // OrganizationUnit ID
  companyId: string;         // Company ID
  path: string;              // Full materialized path, e.g. "/u1/u2/u3"
  ancestorIds: string[];     // Ordered list of parent/ancestor unit IDs
  depth: number;             // Hierarchy level depth
  updatedAt: string;         // ISO timestamp
}

export interface OrganizationTemplateUnitSpec {
  tempKey: string;           // Temporary key for parent-child linking within template
  parentTempKey: string | null;
  typeCode: string;          // e.g. 'HOLDING', 'COMPANY', 'SECTOR', 'REGION', 'BRANCH', 'STATION', 'DEPARTMENT', 'FARM', 'FACTORY'
  codePrefix: string;
  nameAr: string;
  nameEn: string;
  metadata?: Record<string, any>;
}

export type OrganizationTemplateCategory =
  | 'Trading'
  | 'Manufacturing'
  | 'Poultry'
  | 'Construction'
  | 'Healthcare'
  | 'Retail'
  | 'Restaurants'
  | 'Holding Company'
  | 'Educational'
  | 'Custom';

export interface OrganizationTemplate {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  category: OrganizationTemplateCategory;
  units: OrganizationTemplateUnitSpec[];
  isPredefined: boolean;
  companyId?: string | null;  // null for global templates, or companyId for custom company templates
  createdAt?: string;
  updatedAt?: string;
}

export interface OrganizationTreeNode extends OrganizationUnit {
  typeName?: string;
  typeCode?: string;
  levelName?: string;
  children: OrganizationTreeNode[];
}

export interface OrganizationHierarchyValidationResult {
  isValid: boolean;
  totalUnits: number;
  maxDepth: number;
  orphanUnitIds: string[];
  cycleUnitIds: string[];
  errors: string[];
}

