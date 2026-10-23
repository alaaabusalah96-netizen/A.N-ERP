import { describe, it, expect, beforeEach } from 'vitest';
import { AccountingBusinessEngine } from './lib/enterprise/accounting_engine';
import { StorageEngine } from './db/storage';
import { WarehouseHierarchyEngine } from './db/warehouseHierarchyEngine';

describe('Phase 10: Accounting Integration Unit & Integration Tests', () => {
  const companyId = 'comp-phase10-test';
  const operatorId = 'user-phase10-op';

  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
    StorageEngine.setStored('journal_entries', []);
    StorageEngine.setStored('gl_accounts', []);
    StorageEngine.setStored('warehouses', []);
  });

  it('should post a balanced journal entry with organizational dimensions at header level', async () => {
    const je = await AccountingBusinessEngine.postOperationalDoubleEntry(
      companyId,
      operatorId,
      'INV-2026-0001',
      'إصدار فاتورة مبيعات فرع القاهرة',
      'Sales invoice issued for Cairo Branch',
      [
        { accountCode: '110301', debit: 15000, credit: 0, notes: 'Debit Accounts Receivable' },
        { accountCode: '410101', debit: 0, credit: 15000, notes: 'Credit Sales Revenue' }
      ],
      {
        org_unit_id: 'org-cairo-branch',
        warehouseId: 'wh-cairo-main',
        projectId: 'proj-expansion',
        costCenterId: 'cc-sales-01'
      }
    );

    expect(je.id).toBeDefined();
    expect(je.totalDebit).toBe(15000);
    expect(je.totalCredit).toBe(15000);
    expect(je.org_unit_id).toBe('org-cairo-branch');
    expect(je.warehouse_id).toBe('wh-cairo-main');
    expect(je.project_id).toBe('proj-expansion');
    expect(je.cost_center_id).toBe('cc-sales-01');

    // Verify dimensions propagated to ledger lines
    expect(je.lines.length).toBe(2);
    expect(je.lines[0].org_unit_id).toBe('org-cairo-branch');
    expect(je.lines[0].warehouseId).toBe('wh-cairo-main');
    expect(je.lines[1].projectId).toBe('proj-expansion');
    expect(je.lines[1].costCenterId).toBe('cc-sales-01');
  });

  it('should auto-derive org_unit_id from warehouse if warehouse is provided but org_unit_id is missing', async () => {
    // Set up a warehouse linked to an org unit
    await WarehouseHierarchyEngine.addWarehouse({
      id: 'wh-auto-derive',
      code: 'WH-AUTO',
      name: 'Auto Wh',
      company_id: companyId,
      org_unit_id: 'org-derived-unit',
      is_active: true,
      receiving_approval_workflow: false
    });

    const je = await AccountingBusinessEngine.postOperationalDoubleEntry(
      companyId,
      operatorId,
      'PO-2026-1002',
      'شراء خامات لمستودع المواد الخام',
      'Raw materials purchase for warehouse',
      [
        { accountCode: '120101', debit: 8000, credit: 0 },
        { accountCode: '210101', debit: 0, credit: 8000 }
      ],
      {
        warehouseId: 'wh-auto-derive'
      }
    );

    expect(je.warehouse_id).toBe('wh-auto-derive');
    expect(je.org_unit_id).toBe('org-derived-unit');
    expect(je.lines[0].org_unit_id).toBe('org-derived-unit');
  });

  it('should support line-specific dimensions overriding header-level defaults', async () => {
    const je = await AccountingBusinessEngine.postOperationalDoubleEntry(
      companyId,
      operatorId,
      'JV-2026-0099',
      'توزيع مصاريف مشتركة بين الموقعين',
      'Shared expense allocation between sites',
      [
        { accountCode: '510101', debit: 5000, credit: 0, org_unit_id: 'org-site-north', costCenterId: 'cc-north' },
        { accountCode: '510101', debit: 3000, credit: 0, org_unit_id: 'org-site-south', costCenterId: 'cc-south' },
        { accountCode: '110101', debit: 0, credit: 8000, org_unit_id: 'org-hq' }
      ],
      {
        org_unit_id: 'org-hq'
      }
    );

    expect(je.org_unit_id).toBe('org-hq');
    expect(je.lines[0].org_unit_id).toBe('org-site-north');
    expect(je.lines[0].costCenterId).toBe('cc-north');
    expect(je.lines[1].org_unit_id).toBe('org-site-south');
    expect(je.lines[1].costCenterId).toBe('cc-south');
    expect(je.lines[2].org_unit_id).toBe('org-hq');
  });

  it('should filter journal entries accurately by org unit, warehouse, project, and cost center', async () => {
    // Post JE 1: North Branch
    await AccountingBusinessEngine.postOperationalDoubleEntry(
      companyId,
      operatorId,
      'REF-1',
      'قيد الفرع الشمالي',
      'North branch entry',
      [
        { accountCode: '510101', debit: 1000, credit: 0 },
        { accountCode: '110101', debit: 0, credit: 1000 }
      ],
      { org_unit_id: 'org-north', costCenterId: 'cc-100' }
    );

    // Post JE 2: South Branch
    await AccountingBusinessEngine.postOperationalDoubleEntry(
      companyId,
      operatorId,
      'REF-2',
      'قيد الفرع الجنوبي',
      'South branch entry',
      [
        { accountCode: '510101', debit: 2000, credit: 0 },
        { accountCode: '110101', debit: 0, credit: 2000 }
      ],
      { org_unit_id: 'org-south', costCenterId: 'cc-200' }
    );

    const northEntries = AccountingBusinessEngine.getJournalEntriesFiltered({
      companyId,
      org_unit_id: 'org-north'
    });
    expect(northEntries.length).toBe(1);
    expect(northEntries[0].sourceReference).toBe('REF-1');

    const cc200Entries = AccountingBusinessEngine.getJournalEntriesFiltered({
      companyId,
      costCenterId: 'cc-200'
    });
    expect(cc200Entries.length).toBe(1);
    expect(cc200Entries[0].sourceReference).toBe('REF-2');
  });

  it('should maintain 100% backward compatibility for legacy entries posted without dimensions', async () => {
    const legacyJE = await AccountingBusinessEngine.postOperationalDoubleEntry(
      companyId,
      operatorId,
      'REF-LEGACY',
      'قيد عادي بدون أبعاد',
      'Standard entry without dimensions',
      [
        { accountCode: '510101', debit: 500, credit: 0 },
        { accountCode: '110101', debit: 0, credit: 500 }
      ]
    );

    expect(legacyJE.id).toBeDefined();
    expect(legacyJE.org_unit_id).toBeUndefined();
    expect(legacyJE.totalDebit).toBe(500);
    expect(legacyJE.totalCredit).toBe(500);
  });
});
