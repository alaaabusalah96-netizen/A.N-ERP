import { describe, it, expect, beforeEach } from 'vitest';
import { CostCenterEngine } from './db/costCenterEngine';
import { OrganizationEngine } from './db/organizationEngine';
import { AccountingBusinessEngine } from './lib/enterprise/accounting_engine';
import { StorageEngine } from './db/storage';

describe('Phase 11: Dynamic Cost Center Engine Unit & Integration Tests', () => {
  const companyId = 'comp-cc-test';
  const operatorId = 'user-cc-op';

  beforeEach(() => {
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
    }
    StorageEngine.setStored('cost_centers', []);
    StorageEngine.setStored('organization_units', []);
    StorageEngine.setStored('journal_entries', []);
    StorageEngine.setStored('gl_accounts', []);
  });

  it('should create, retrieve, update, and delete a dynamic cost center', async () => {
    const created = await CostCenterEngine.addCostCenter({
      code: 'CC-1001',
      nameAr: 'مركز تكلفة التسويق',
      nameEn: 'Marketing Cost Center',
      company_id: companyId,
      category: 'EXPENSE',
      budget: 50000,
      isActive: true
    });

    expect(created.id).toBeDefined();
    expect(created.code).toBe('CC-1001');

    const retrieved = CostCenterEngine.getCostCenter(created.id);
    expect(retrieved?.nameEn).toBe('Marketing Cost Center');

    const updated = await CostCenterEngine.updateCostCenter(created.id, { budget: 75000 });
    expect(updated.budget).toBe(75000);

    const deleted = await CostCenterEngine.deleteCostCenter(created.id);
    expect(deleted).toBe(true);
    expect(CostCenterEngine.getCostCenter(created.id)).toBeUndefined();
  });

  it('should automatically create and link a Cost Center when an Organization Unit is resolved', async () => {
    // 1. Create an Organization Unit
    const orgUnit = await OrganizationEngine.addUnit({
      companyId: companyId,
      typeId: 'out-branch',
      code: 'BR-ALEX',
      name: 'فرع الإسكندرية',
      nameAr: 'فرع الإسكندرية',
      nameEn: 'Alexandria Branch',
      isActive: true
    });

    // 2. Auto create & link cost center for the org unit
    const createdCC = await CostCenterEngine.autoCreateOrLinkCostCenterForOrgUnit(orgUnit);
    const linkedCC = await CostCenterEngine.resolveCostCenterForOrgUnit(orgUnit.id, companyId);

    expect(linkedCC).toBeDefined();
    expect(linkedCC?.org_unit_id).toBe(orgUnit.id);
    expect(linkedCC?.code).toBe('CC-BR-ALEX');
    expect(linkedCC?.nameAr).toContain('فرع الإسكندرية');

    // Calling resolveCostCenterForOrgUnit again should return the exact same cost center instance
    const secondCallCC = await CostCenterEngine.resolveCostCenterForOrgUnit(orgUnit.id, companyId);
    expect(secondCallCC?.id).toBe(linkedCC?.id);
  });

  it('should automatically populate costCenterId in Journal Entries when only org_unit_id is provided', async () => {
    // Create Org Unit
    const orgUnit = await OrganizationEngine.addUnit({
      companyId: companyId,
      typeId: 'out-branch',
      code: 'BR-CAIRO',
      name: 'فرع القاهرة',
      nameAr: 'فرع القاهرة',
      nameEn: 'Cairo Branch',
      isActive: true
    });

    // Post double entry providing ONLY org_unit_id
    const je = await AccountingBusinessEngine.postOperationalDoubleEntry(
      companyId,
      operatorId,
      'INV-CC-001',
      'إصدار فاتورة مبيعات فرع القاهرة',
      'Sales invoice Cairo branch',
      [
        { accountCode: '110301', debit: 12000, credit: 0 },
        { accountCode: '410101', debit: 0, credit: 12000 }
      ],
      { org_unit_id: orgUnit.id }
    );

    expect(je.org_unit_id).toBe(orgUnit.id);
    // Cost Center should have been auto-derived & populated!
    expect(je.cost_center_id).toBeDefined();
    
    const derivedCC = CostCenterEngine.getCostCenter(je.cost_center_id!);
    expect(derivedCC?.org_unit_id).toBe(orgUnit.id);
    expect(derivedCC?.code).toBe('CC-BR-CAIRO');
  });

  it('should automatically populate org_unit_id in Journal Entries when only costCenterId is provided', async () => {
    // Create Org Unit and Cost Center linked to it
    const orgUnit = await OrganizationEngine.addUnit({
      companyId: companyId,
      typeId: 'out-factory',
      code: 'FAC-01',
      name: 'المصنع الرئيسي',
      nameAr: 'المصنع الرئيسي',
      nameEn: 'Main Factory',
      isActive: true
    });

    const cc = await CostCenterEngine.autoCreateOrLinkCostCenterForOrgUnit(orgUnit);

    // Post double entry providing ONLY costCenterId
    const je = await AccountingBusinessEngine.postOperationalDoubleEntry(
      companyId,
      operatorId,
      'PO-FAC-001',
      'شراء قطع غيار المصنع',
      'Factory spare parts purchase',
      [
        { accountCode: '120101', debit: 4500, credit: 0 },
        { accountCode: '210101', debit: 0, credit: 4500 }
      ],
      { costCenterId: cc.id }
    );

    expect(je.cost_center_id).toBe(cc.id);
    // Org Unit should have been auto-derived from the cost center!
    expect(je.org_unit_id).toBe(orgUnit.id);
  });

  it('should build hierarchical Cost Center tree and subtrees correctly', async () => {
    const parent = await CostCenterEngine.addCostCenter({
      code: 'CC-HQ',
      nameAr: 'المركز الرئيسي',
      nameEn: 'HQ Cost Center',
      company_id: companyId,
      isActive: true
    });

    const sub1 = await CostCenterEngine.addCostCenter({
      code: 'CC-HQ-IT',
      nameAr: 'قسم تكنولوجيا المعلومات',
      nameEn: 'IT Department',
      company_id: companyId,
      parent_id: parent.id,
      isActive: true
    });

    const sub2 = await CostCenterEngine.addCostCenter({
      code: 'CC-HQ-HR',
      nameAr: 'قسم الموارد البشرية',
      nameEn: 'HR Department',
      company_id: companyId,
      parent_id: parent.id,
      isActive: true
    });

    const tree = CostCenterEngine.buildCostCenterTree(companyId);
    expect(tree.length).toBe(1);
    expect(tree[0].id).toBe(parent.id);
    expect(tree[0].children.length).toBe(2);

    const subtree = CostCenterEngine.getCostCenterSubtree(parent.id, companyId);
    expect(subtree.map(s => s.id)).toContain(parent.id);
    expect(subtree.map(s => s.id)).toContain(sub1.id);
    expect(subtree.map(s => s.id)).toContain(sub2.id);
  });
});
