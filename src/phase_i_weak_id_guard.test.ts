import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageEngine } from './db/storage';
import { CompaniesModule } from './db/companies';
import { StationsModule } from './db/stations';
import { ApprovalEngine } from './db/approvalEngine';
import { TransactionsModule } from './db/transactions';
import { BusinessGroupsModule } from './db/businessGroups';
import { WarehouseTemplateEngine } from './db/warehouseTemplateEngine';
import { DocumentNumberEngine } from './db/documentNumberEngine';
import { RestaurantEngine } from './db/restaurant';
import { OrganizationEngine } from './db/organizationEngine';
import { WarehouseHierarchyEngine } from './db/warehouseHierarchyEngine';
import { UsersModule } from './db/users';

describe('Phase I: Regression Protection — Weak-ID Guard', () => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const WEAK_ID_REGEX = /^\w+-\d{10,}-/;

  beforeEach(() => {
    localStorage.clear();
    CompaniesModule.setSelectedCompanyId('comp-test-guard');
    StorageEngine.setStored('companies', [{ id: 'comp-test-guard', name: 'Test Guard Co' }]);
    StorageEngine.setStored('stations', [{ id: 'stn-test', name: 'Test Station', company_id: 'comp-test-guard' }]);
    StorageEngine.setStored('categories', [{ id: 'cat-general', name: 'General', company_id: 'comp-test-guard' }]);
    UsersModule.setActiveUser({
      id: 'usr-1',
      full_name: 'Test User',
      role: 'SystemAdmin',
      company_id: 'comp-test-guard',
      station_id: 'stn-test',
      permissions: { create_expense: true, edit_expense: true }
    } as any);
  });

  it('generates UUIDs without weak timestamp prefixes for Companies, Stations, and Business Groups', async () => {
    const comp = await CompaniesModule.addCompany('Test Comp', 5);
    expect(comp).not.toBeNull();
    expect(comp!.id).toMatch(UUID_REGEX);
    expect(comp!.id).not.toMatch(WEAK_ID_REGEX);

    const reg = await StationsModule.addRegion('Test Region', 'REG01', comp!.id);
    expect(reg).not.toBeNull();
    expect(reg!.id).toMatch(UUID_REGEX);
    expect(reg!.id).not.toMatch(WEAK_ID_REGEX);

    const stn = await StationsModule.addStation('Test Station', 'STN01', 1000, reg!.id, comp!.id);
    expect(stn).not.toBeNull();
    expect(stn!.id).toMatch(UUID_REGEX);
    expect(stn!.id).not.toMatch(WEAK_ID_REGEX);

    const bg = await BusinessGroupsModule.addGroup('BG01', 'مجموعة 1', 'Group 1');
    expect(bg).not.toBeNull();
    expect(bg!.id).toMatch(UUID_REGEX);
    expect(bg!.id).not.toMatch(WEAK_ID_REGEX);
  });

  it('generates UUIDs for Approval Workflows and Instances', async () => {
    const wf = await ApprovalEngine.saveWorkflow({
      name: 'Test Workflow',
      companyId: 'comp-test-guard',
      module: 'expenses',
      steps: [{ stepOrder: 1, role: 'Manager', name: 'Step 1' }],
      isActive: true
    } as any);
    expect(wf.id).toMatch(UUID_REGEX);
    expect(wf.id).not.toMatch(WEAK_ID_REGEX);

    const res = await ApprovalEngine.evaluateAndStartWorkflow({
      companyId: 'comp-test-guard',
      documentType: 'expenses',
      documentId: 'doc-1',
      amount: 500,
      requesterId: 'user-1'
    });
    if (res.instance) {
      expect(res.instance.id).toMatch(UUID_REGEX);
      expect(res.instance.id).not.toMatch(WEAK_ID_REGEX);
    }
  });

  it('generates UUIDs for Transactions and Transaction History', async () => {
    const createRes = await TransactionsModule.addTransaction({
      company_id: 'comp-test-guard',
      station_id: 'stn-test',
      amount: 100,
      description: 'Test Tx',
      date: '2026-08-24',
      type: 'Expense',
      category: 'General',
      category_id: 'cat-general'
    } as any);

    expect(createRes.success).toBe(true);
    expect(createRes.data).toBeDefined();
    expect(createRes.data!.id).toMatch(UUID_REGEX);
    expect(createRes.data!.id).not.toMatch(WEAK_ID_REGEX);
  });

  it('generates UUIDs for Organization Units, Warehouse Types, Templates, Configs, and Restaurant entities', async () => {
    const unit = await OrganizationEngine.addUnit({
      name: 'Unit 1',
      nameAr: 'الوحدة 1',
      nameEn: 'Unit 1',
      code: 'U01',
      typeId: 'DEPARTMENT',
      companyId: 'comp-test-guard'
    } as any);
    // Unit IDs follow orgunit-<UUID>
    const pureUnitUUID = unit.id.replace(/^orgunit-/, '');
    expect(pureUnitUUID).toMatch(UUID_REGEX);
    expect(unit.id).not.toMatch(WEAK_ID_REGEX);

    const wht = await WarehouseHierarchyEngine.addWarehouseType({
      name_ar: 'رئيسي',
      name_en: 'Main',
      code: 'MAIN',
      company_id: 'comp-test-guard'
    } as any);
    const pureWhtUUID = wht.id.replace(/^wh-type-custom-/, '');
    expect(pureWhtUUID).toMatch(UUID_REGEX);
    expect(wht.id).not.toMatch(WEAK_ID_REGEX);

    const tpl = await WarehouseTemplateEngine.addWarehouseTemplate({
      name_ar: 'قالب',
      name_en: 'Template',
      code: 'TPL01',
      category: 'General',
      defaultZones: []
    } as any);
    expect(tpl.id).toMatch(UUID_REGEX);
    expect(tpl.id).not.toMatch(WEAK_ID_REGEX);

    const docCfg = await DocumentNumberEngine.saveConfig({
      company_id: 'comp-test-guard',
      module: 'inventory',
      doc_type: 'Issue',
      format: '{YYYY}-{SEQ:4}'
    } as any);
    expect(docCfg.id).toMatch(UUID_REGEX);
    expect(docCfg.id).not.toMatch(WEAK_ID_REGEX);

    const order = RestaurantEngine.createOrder({
      company_id: 'comp-test-guard',
      status: 'pending',
      items: [],
      total: 100,
      created_by: 'usr-1'
    } as any);
    expect(order.id).toMatch(UUID_REGEX);
    expect(order.id).not.toMatch(WEAK_ID_REGEX);
  });
});
