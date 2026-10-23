import { BaseMetadata } from './enterprise';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export type CoaTemplateId = 'standard' | 'poultry' | 'retail' | 'manufacturing' | 'transport';

export interface CoaTemplateMetadata {
  id: CoaTemplateId;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  industry: string;
}

export interface GLAccount {
  id: string;
  company_id: string;
  code: string; // e.g., "110101"
  nameAr: string;
  nameEn: string;
  type: AccountType;
  balance: number; // Current calculated running balance
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export interface LedgerLine {
  accountId: string;
  accountCode: string;
  accountNameAr: string;
  accountNameEn: string;
  debit: number;  // مدين
  credit: number; // دائن
  notes?: string;
  org_unit_id?: string;
  warehouse_id?: string;
  warehouseId?: string;
  project_id?: string;
  projectId?: string;
  cost_center_id?: string;
  costCenterId?: string;
}

export interface AccountingDimensions {
  org_unit_id?: string;
  warehouse_id?: string;
  warehouseId?: string;
  project_id?: string;
  projectId?: string;
  cost_center_id?: string;
  costCenterId?: string;
}

export interface JournalEntry {
  id: string;
  company_id: string;
  entryNumber: string; // e.g., "JE-2026-0001"
  date: string;
  sourceType: 'OPERATIONAL' | 'MANUAL';
  sourceReference?: string; // e.g., "Voucher #CF-2026-1002" or "PO #PO-2026-0001"
  statementAr: string;
  statementEn: string;
  lines: LedgerLine[];
  totalDebit: number;
  totalCredit: number;
  metadata: BaseMetadata;
  org_unit_id?: string;
  warehouse_id?: string;
  warehouseId?: string;
  project_id?: string;
  projectId?: string;
  cost_center_id?: string;
  costCenterId?: string;
}

export interface JournalEntryFilterOptions {
  companyId: string;
  org_unit_id?: string;
  warehouseId?: string;
  projectId?: string;
  costCenterId?: string;
  startDate?: string;
  endDate?: string;
  sourceType?: 'OPERATIONAL' | 'MANUAL';
}

export type CostCenterCategory = 'OPERATIONAL' | 'REVENUE' | 'EXPENSE' | 'OVERHEAD' | 'PROJECT';

export interface CostCenter {
  id: string;
  company_id: string;
  code: string; // e.g., "CC-1001"
  nameAr: string;
  nameEn: string;
  org_unit_id?: string; // Linkage to Organization Unit
  parent_id?: string; // Parent cost center ID
  parentId?: string;
  category?: CostCenterCategory;
  budget?: number; // Allocated budget
  isActive: boolean;
  notes?: string;
  metadata?: BaseMetadata;
}
