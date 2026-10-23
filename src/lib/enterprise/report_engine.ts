import { StorageEngine } from '../../db/storage';
import { OrganizationEngine } from '../../db/organizationEngine';
import { WarehouseHierarchyEngine } from '../../db/warehouseHierarchyEngine';
import { CostCenterEngine } from '../../db/costCenterEngine';
import { Transaction } from '../../types';
import { InventoryDocument } from '../../types/inventory';
import { JournalEntry } from '../../types/accounting';
import { PurchaseOrder } from '../../types/purchasing';
import { SalesInvoice } from '../../types/sales';
import { Vehicle, MaintenanceLog, FuelLog } from '../../types/fleet';

export interface ReportFilterCriteria {
  companyId: string;
  org_unit_id?: string; // ALL or specific unit (with subtree inclusion)
  warehouseId?: string; // ALL or specific warehouse
  costCenterId?: string; // ALL or specific cost center
  projectId?: string; // ALL or specific project
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

export class EnterpriseReportEngine {
  /**
   * Resolves set of valid Organization Unit IDs considering subtree inheritance
   */
  public static getValidOrgUnitIds(companyId: string, org_unit_id?: string): Set<string> | null {
    const targetUnit = org_unit_id;
    if (!targetUnit || targetUnit === 'ALL' || targetUnit === 'all') {
      return null; // Null means no filtering (all units allowed)
    }
    return new Set(OrganizationEngine.getSubtreeUnitIds(targetUnit, companyId));
  }

  /**
   * Filters Cash Custody Transactions by dynamic 6-dimensional criteria
   */
  public static getCustodyReport(criteria: ReportFilterCriteria): Transaction[] {
    let list = StorageEngine.getStored<Transaction[]>('custody_transactions', []);
    
    // Filter by company
    list = list.filter(t => (t as any).company_id === criteria.companyId || !((t as any).company_id));

    // Filter by Organization Unit Subtree
    const validOrgUnits = this.getValidOrgUnitIds(criteria.companyId, criteria.org_unit_id);
    if (validOrgUnits) {
      list = list.filter(t => (t as any).org_unit_id && validOrgUnits.has((t as any).org_unit_id));
    }

    // Filter by Cost Center
    if (criteria.costCenterId && criteria.costCenterId !== 'ALL' && criteria.costCenterId !== 'all') {
      list = list.filter(t => (t as any).cost_center_id === criteria.costCenterId);
    }

    // Filter by Project
    if (criteria.projectId && criteria.projectId !== 'ALL' && criteria.projectId !== 'all') {
      list = list.filter(t => (t as any).project_id === criteria.projectId);
    }

    // Filter by Date Range
    if (criteria.startDate) {
      list = list.filter(t => t.date >= criteria.startDate!);
    }
    if (criteria.endDate) {
      list = list.filter(t => t.date <= criteria.endDate!);
    }

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Filters Inventory Documents by dynamic 6-dimensional criteria
   */
  public static getInventoryReport(criteria: ReportFilterCriteria): InventoryDocument[] {
    let list = StorageEngine.getStored<InventoryDocument[]>('inventory_documents', []);

    // Filter by company
    list = list.filter(d => d.company_id === criteria.companyId || !d.company_id);

    // Filter by Org Unit
    const validOrgUnits = this.getValidOrgUnitIds(criteria.companyId, criteria.org_unit_id);
    if (validOrgUnits) {
      list = list.filter(d => d.org_unit_id && validOrgUnits.has(d.org_unit_id));
    }

    // Filter by Warehouse
    if (criteria.warehouseId && criteria.warehouseId !== 'ALL' && criteria.warehouseId !== 'all') {
      list = list.filter(d => d.source_warehouse_id === criteria.warehouseId || d.dest_entity_id === criteria.warehouseId);
    }

    // Filter by Cost Center
    if (criteria.costCenterId && criteria.costCenterId !== 'ALL' && criteria.costCenterId !== 'all') {
      list = list.filter(d => d.cost_center_id === criteria.costCenterId);
    }

    // Filter by Project
    if (criteria.projectId && criteria.projectId !== 'ALL' && criteria.projectId !== 'all') {
      list = list.filter(d => (d as any).project_id === criteria.projectId);
    }

    // Filter by Date
    if (criteria.startDate) {
      list = list.filter(d => d.date >= criteria.startDate!);
    }
    if (criteria.endDate) {
      list = list.filter(d => d.date <= criteria.endDate!);
    }

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Filters Accounting General Ledger Journal Entries by dynamic 6-dimensional criteria
   */
  public static getAccountingGLReport(criteria: ReportFilterCriteria): JournalEntry[] {
    let list = StorageEngine.getStored<JournalEntry[]>('accounting_journal_entries', []);

    list = list.filter(e => e.company_id === criteria.companyId);

    const validOrgUnits = this.getValidOrgUnitIds(criteria.companyId, criteria.org_unit_id);
    if (validOrgUnits) {
      list = list.filter(e => e.org_unit_id && validOrgUnits.has(e.org_unit_id));
    }

    if (criteria.costCenterId && criteria.costCenterId !== 'ALL' && criteria.costCenterId !== 'all') {
      list = list.filter(e => e.cost_center_id === criteria.costCenterId || (e as any).costCenterId === criteria.costCenterId);
    }

    if (criteria.projectId && criteria.projectId !== 'ALL' && criteria.projectId !== 'all') {
      list = list.filter(e => (e as any).project_id === criteria.projectId || (e as any).projectId === criteria.projectId);
    }

    if (criteria.startDate) {
      list = list.filter(e => e.date >= criteria.startDate!);
    }
    if (criteria.endDate) {
      list = list.filter(e => e.date <= criteria.endDate!);
    }

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Filters Fleet Fuel & Maintenance Expenses by dynamic 6-dimensional criteria
   */
  public static getFleetReport(criteria: ReportFilterCriteria): { maintenance: MaintenanceLog[]; fuel: FuelLog[] } {
    let maint = StorageEngine.getStored<MaintenanceLog[]>('fleet_maintenance_logs', []);
    let fuel = StorageEngine.getStored<FuelLog[]>('fleet_fuel_logs', []);

    maint = maint.filter(m => m.company_id === criteria.companyId);
    fuel = fuel.filter(f => f.company_id === criteria.companyId);

    const validOrgUnits = this.getValidOrgUnitIds(criteria.companyId, criteria.org_unit_id);
    if (validOrgUnits) {
      maint = maint.filter(m => m.org_unit_id && validOrgUnits.has(m.org_unit_id));
      fuel = fuel.filter(f => f.org_unit_id && validOrgUnits.has(f.org_unit_id));
    }

    if (criteria.costCenterId && criteria.costCenterId !== 'ALL' && criteria.costCenterId !== 'all') {
      maint = maint.filter(m => m.cost_center_id === criteria.costCenterId);
      fuel = fuel.filter(f => f.cost_center_id === criteria.costCenterId);
    }

    if (criteria.startDate) {
      maint = maint.filter(m => m.maintenanceDate >= criteria.startDate!);
      fuel = fuel.filter(f => f.logDate >= criteria.startDate!);
    }
    if (criteria.endDate) {
      maint = maint.filter(m => m.maintenanceDate <= criteria.endDate!);
      fuel = fuel.filter(f => f.logDate <= criteria.endDate!);
    }

    return {
      maintenance: maint.sort((a, b) => b.maintenanceDate.localeCompare(a.maintenanceDate)),
      fuel: fuel.sort((a, b) => b.logDate.localeCompare(a.logDate))
    };
  }
}
