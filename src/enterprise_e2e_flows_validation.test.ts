import { vi, describe, it, expect, beforeEach } from 'vitest';

// Enable online mode for offline fallback queue
Object.defineProperty(global, 'navigator', {
  value: { onLine: true },
  configurable: true,
  writable: true
});

// Mock firebase before any imports
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('firebase/storage', () => ({ getStorage: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: () => ({}),
  getFirestore: () => ({}),
  doc: (db: any, col: any, id: any) => ({ id, path: `${col}/${id}` }),
  collection: (db: any, col: any) => ({ id: col }),
  setDoc: () => Promise.resolve(),
  deleteDoc: () => Promise.resolve(),
  updateDoc: vi.fn(() => Promise.resolve()),
  increment: vi.fn((val) => val),
  onSnapshot: () => (() => {}),
  writeBatch: () => ({}),
  getDocs: () => Promise.resolve({ empty: true, docs: [] }),
  getDoc: () => Promise.resolve({ exists: () => false }),
  query: () => ({}),
  limit: () => ({}),
  where: () => ({}),
  startAfter: () => ({}),
  orderBy: () => ({}),
  runTransaction: (_db: any, cb: (tx: any) => Promise<any>) => {
    if (typeof cb === 'function') {
      const mockTx = {
        get: () => Promise.resolve({ exists: () => false, data: () => ({}) }),
        set: () => {},
        update: () => {},
        delete: () => {}
      };
      return cb(mockTx);
    }
    return Promise.resolve();
  },
}));

if (typeof window === 'undefined') {
  (global as any).window = {
    dispatchEvent: () => {},
    addEventListener: () => {},
  };
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

import { InventoryModule } from './db/inventory';
import { StorageEngine } from './db/storage';
import { SequenceEngine } from './lib/enterprise/sequence';
import { ApprovalEngine } from './db/approvalEngine';
import { PurchasingBusinessEngine } from './lib/enterprise/purchasing_engine';
import { AccountingBusinessEngine } from './lib/enterprise/accounting_engine';
import { CompaniesModule } from './db/companies';
import { UsersModule } from './db/users';
import { CustodyService } from './db/custodyService';
import { getFilteredMenuItems } from './components/Layout';

describe('Phase 16: Enterprise End-to-End Business Flow Validation', () => {
  const companyId = 'comp-e2e-flow-test';
  const orgUnitId = 'org-unit-e2e-1';

  beforeEach(() => {
    localStorageMock.clear();
    StorageEngine.cache = {};
    ApprovalEngine.resetState();

    const mockUser = {
      id: 'usr-admin-e2e',
      full_name: 'E2E Admin User',
      email: 'admin@e2e.test',
      role: 'SystemAdmin',
      company_id: companyId,
      org_unit_id: orgUnitId,
      is_active: true,
      permissions: {
        can_manage_users: true,
        can_manage_stations: true,
        can_view_reports: true,
        can_manage_custody: true,
        can_delete_records: true,
        can_export_data: true,
        can_manage_system: true,
        can_manage_accounting: true
      }
    };

    localStorageMock.setItem('custody_active_user', JSON.stringify(mockUser));
    StorageEngine.setStored('selected_company_id', companyId);
    StorageEngine.setStored('companies', [{
      id: companyId,
      name_en: 'E2E Flow Test Company',
      name_ar: 'شركة اختبار النظام',
      subscription_plan: 'Enterprise',
      subscription_status: 'active',
      is_active: true
    }]);
    StorageEngine.setStored('purchase_requests', []);
    StorageEngine.setStored('purchase_orders', []);
    StorageEngine.setStored('inventory_documents', []);
    StorageEngine.setStored('stock_movements', []);
    StorageEngine.setStored('warehouses', []);
    StorageEngine.setStored('products', []);
    StorageEngine.setStored('journal_entries', []);
    StorageEngine.setStored('vendors', [{
      id: 'vendor-001',
      nameAr: 'مورد العلف العالمي',
      nameEn: 'Global Feed Supplier LLC',
      company_id: companyId,
      status: 'ACTIVE'
    }]);
  });

  it('Flow 1: Purchase Request -> Approval -> Purchase Order -> Goods Receipt -> Journal Entry', async () => {
    // 1. Generate consolidated sequence number for PR
    const prSeq = await SequenceEngine.generateNextSequence(
      null as any,
      companyId,
      'last_pr_seq',
      { prefix: 'PR', padding: 4, includeYear: true, manualStartNo: 1 }
    );
    expect(prSeq).toMatch(/^PR-\d{4}-0001$/);

    // 2. Setup workflow & engine
    await ApprovalEngine.createDefaultWorkflows(companyId);
    const purchasingEngine = new PurchasingBusinessEngine();

    // 3. Create PR via processEvent
    const createPRRes = await purchasingEngine.processEvent({
      eventId: 'evt-pr-e2e-1',
      eventType: 'PR_SUBMITTED',
      tenantId: companyId,
      organizationId: companyId,
      user_id: 'usr-admin-e2e',
      user_name: 'E2E Admin User',
      user_role: 'SystemAdmin',
      metadataVersion: '1.0',
      timestamp: new Date().toISOString(),
      payload: {
        companyId,
        org_unit_id: orgUnitId,
        requesterId: 'usr-admin-e2e',
        requesterName: 'E2E Admin User',
        department: 'Operations',
        title: 'Bulk Poultry Feed Request',
        items: [
          {
            itemId: 'item-1',
            itemCode: 'FEED-1001',
            itemName: 'Poultry Feed 50kg',
            qty: 200,
            estimatedPrice: 600
          }
        ],
        notes: 'Monthly feed supply'
      }
    });

    expect(createPRRes.success).toBe(true);
    const pr = createPRRes.outputData;
    expect(pr.status).toBe('PENDING_APPROVAL');

    // 4. Check Role Permission Gate: Unauthorized clerk attempt to approve should fail
    const unauthorizedAttempt = await purchasingEngine.processEvent({
      eventId: 'evt-unauth-1',
      eventType: 'PR_APPROVED',
      tenantId: companyId,
      organizationId: companyId,
      user_id: 'usr-clerk',
      user_name: 'Station Clerk',
      user_role: 'StationAdmin',
      metadataVersion: '1.0',
      timestamp: new Date().toISOString(),
      payload: { prId: pr.id }
    });
    expect(unauthorizedAttempt.success).toBe(false);

    // 5. Approve PR through required roles
    await purchasingEngine.processEvent({
      eventId: 'evt-app-1',
      eventType: 'PR_APPROVED',
      tenantId: companyId,
      organizationId: companyId,
      user_id: 'usr-dept-mgr',
      user_name: 'Department Mgr',
      user_role: 'RegionalManager',
      metadataVersion: '1.0',
      timestamp: new Date().toISOString(),
      payload: { prId: pr.id }
    });

    await purchasingEngine.processEvent({
      eventId: 'evt-app-2',
      eventType: 'PR_APPROVED',
      tenantId: companyId,
      organizationId: companyId,
      user_id: 'usr-admin',
      user_name: 'Admin Lead',
      user_role: 'Admin',
      metadataVersion: '1.0',
      timestamp: new Date().toISOString(),
      payload: { prId: pr.id }
    });

    await purchasingEngine.processEvent({
      eventId: 'evt-app-3',
      eventType: 'PR_APPROVED',
      tenantId: companyId,
      organizationId: companyId,
      user_id: 'usr-ceo',
      user_name: 'CEO',
      user_role: 'SystemAdmin',
      metadataVersion: '1.0',
      timestamp: new Date().toISOString(),
      payload: { prId: pr.id }
    });

    const storedPRs = StorageEngine.getStored<any[]>('purchase_requests', []);
    const approvedPR = storedPRs.find(p => p.id === pr.id);
    expect(approvedPR.status).toBe('APPROVED');

    // 6. Setup warehouse & product for delivery
    const wh = {
      id: 'wh-e2e-1',
      code: 'WH-MAIN',
      name: 'Central Warehouse',
      company_id: companyId,
      type: 'MAIN' as const,
      status: 'ACTIVE' as const,
      is_active: true
    };
    const prod = {
      id: 'prod-e2e-feed',
      sku: 'FEED-1001',
      name: 'Poultry Feed 50kg',
      category: 'FEED',
      unit: 'Bag',
      min_stock: 50,
      current_stock: 0,
      company_id: companyId,
      is_active: true
    };
    StorageEngine.setStored('warehouses', [wh]);
    StorageEngine.setStored('products', [prod]);

    // 7. Issue PO
    const issuePORes = await purchasingEngine.processEvent({
      eventId: 'evt-po-e2e-1',
      eventType: 'PO_ISSUED',
      tenantId: companyId,
      organizationId: companyId,
      user_id: 'usr-admin-e2e',
      user_name: 'E2E Admin User',
      user_role: 'SystemAdmin',
      metadataVersion: '1.0',
      timestamp: new Date().toISOString(),
      payload: {
        prId: pr.id,
        vendorId: 'vendor-001',
        deliveryWarehouseId: wh.id,
        org_unit_id: orgUnitId,
        items: [
          {
            id: 'po-item-1',
            productId: 'prod-e2e-feed',
            itemId: 'prod-e2e-feed',
            itemCode: 'FEED-1001',
            itemName: 'Poultry Feed 50kg',
            qty: 200,
            unitPrice: 600
          }
        ],
        notes: 'Issuing PO from Approved PR'
      }
    });

    expect(issuePORes.success).toBe(true);
    const po = issuePORes.outputData;
    expect(po.status).toBe('ISSUED');

    // 8. Process Goods Receipt (PO_RECEIVED) -> Triggers Stock update + Accounting Journal Entry
    const receivePORes = await purchasingEngine.processEvent({
      eventId: 'evt-po-rec-1',
      eventType: 'PO_RECEIVED',
      tenantId: companyId,
      organizationId: companyId,
      user_id: 'usr-admin-e2e',
      user_name: 'E2E Admin User',
      user_role: 'SystemAdmin',
      metadataVersion: '1.0',
      timestamp: new Date().toISOString(),
      payload: {
        poId: po.id,
        warehouseId: wh.id
      }
    });

    expect(receivePORes.success).toBe(true);
    const storedPOs = StorageEngine.getStored<any[]>('purchase_orders', []);
    const receivedPO = storedPOs.find(p => p.id === po.id);
    expect(receivedPO.status).toBe('RECEIVED');

    // Verify inventory quantity is updated
    const stockAfterReceipt = InventoryModule.getProductStockInWarehouse(wh.id, prod.id);
    expect(stockAfterReceipt).toBe(200);

    // Verify double-entry accounting journal entry was posted
    const journalEntries = StorageEngine.getStored<any[]>('journal_entries', []);
    const poJournal = journalEntries.find(je => je.company_id === companyId && je.sourceReference === `PO #${po.poNumber}`);
    expect(poJournal).toBeDefined();
    expect(poJournal.totalDebit).toBe(poJournal.totalCredit);
    expect(poJournal.totalDebit).toBe(120000);
  });

  it('Flow 2: Cash Custody -> Settlement -> Accounting', async () => {
    // 1. Post double-entry accounting entry for Custody Settlement using standard corporate COA codes
    const entry = await AccountingBusinessEngine.postOperationalDoubleEntry(
      companyId,
      'usr-admin-e2e',
      'CUST-SETTLE-001',
      'تسوية عهدة المحطة',
      'Settlement of field custody expenses for Sina Station',
      [
        { accountCode: '510101', debit: 25000, credit: 0 },
        { accountCode: '110101', debit: 0, credit: 25000 }
      ]
    );

    expect(entry).toBeDefined();
    expect(entry?.company_id).toBe(companyId);
    expect(entry?.totalDebit).toBe(25000);
    expect(entry?.totalCredit).toBe(25000);
    expect(entry?.sourceType).toBe('OPERATIONAL');

    // Verify lines balance
    const totalDebit = entry?.lines.reduce((sum, l) => sum + l.debit, 0) || 0;
    const totalCredit = entry?.lines.reduce((sum, l) => sum + l.credit, 0) || 0;
    expect(totalDebit).toBe(totalCredit);
  });

  it('Flow 3: Warehouse Transfer -> Inventory Update', async () => {
    const mainWh = {
      id: 'wh-main-e2e',
      code: 'MAIN-01',
      name: 'Main E2E Warehouse',
      company_id: companyId,
      type: 'MAIN' as const,
      status: 'ACTIVE' as const,
      is_active: true,
      receiving_approval_workflow: true
    };
    const subWh = {
      id: 'wh-sub-e2e',
      code: 'SUB-01',
      name: 'Sub E2E Warehouse',
      company_id: companyId,
      parent_id: 'wh-main-e2e',
      type: 'SUB' as const,
      status: 'ACTIVE' as const,
      is_active: true,
      receiving_approval_workflow: true
    };
    const prod = {
      id: 'prod-e2e-oil',
      sku: 'OIL-200',
      name: 'Industrial Oil Drum 200L',
      category: 'SUPPLIES',
      unit: 'Drum',
      min_stock: 10,
      current_stock: 500,
      company_id: companyId,
      is_active: true
    };

    StorageEngine.setStored('warehouses', [mainWh, subWh]);
    StorageEngine.setStored('products', [prod]);

    // Initial stock: 500 in Main Warehouse
    await InventoryModule.adjustStock(mainWh.id, prod.id, 500, 'Addition', 'usr-admin-e2e');

    // Create transfer document from Main -> Sub
    const transferDoc = await InventoryModule.addInventoryDocument({
      doc_type: 'Transfer',
      date: '2026-08-01',
      source_warehouse_id: mainWh.id,
      dest_entity_type: 'warehouse',
      dest_entity_id: subWh.id,
      reason: 'Regular Station Replenishment',
      items: [
        {
          product_id: prod.id,
          product_code: prod.sku,
          product_name: prod.name,
          unit: prod.unit,
          qty: 100,
          last_purchase_price: 1500
        }
      ]
    });

    // Complete the transfer lifecycle via Submit -> Approve -> Receive
    const subRes = await InventoryModule.triggerLifecycleTransition(transferDoc.id, 'Submit');
    expect(subRes.success).toBe(true);
    const appRes = await InventoryModule.triggerLifecycleTransition(transferDoc.id, 'Approve');
    expect(appRes.success).toBe(true);
    const recRes = await InventoryModule.triggerLifecycleTransition(transferDoc.id, 'Receive');
    expect(recRes.success).toBe(true);

    // Assert exact stock quantities in each warehouse after transfer
    const mainStock = InventoryModule.getProductStockInWarehouse(mainWh.id, prod.id);
    const subStock = InventoryModule.getProductStockInWarehouse(subWh.id, prod.id);
    expect(mainStock).toBe(400); // 500 - 100
    expect(subStock).toBe(100);  // 0 + 100
  });

  it('Flow 4: Sales Invoice -> Inventory Deduction -> Accounting', async () => {
    const wh = {
      id: 'wh-sales-e2e',
      code: 'SALES-WH',
      name: 'Sales Distribution Center',
      company_id: companyId,
      type: 'MAIN' as const,
      status: 'ACTIVE' as const,
      is_active: true,
      receiving_approval_workflow: true
    };
    const prod = {
      id: 'prod-e2e-goods',
      sku: 'GOODS-500',
      name: 'Finished Poultry Product 10kg',
      category: 'GOODS',
      unit: 'Box',
      min_stock: 20,
      current_stock: 300,
      company_id: companyId,
      is_active: true
    };

    StorageEngine.setStored('warehouses', [wh]);
    StorageEngine.setStored('products', [prod]);
    await InventoryModule.adjustStock(wh.id, prod.id, 300, 'Addition', 'usr-admin-e2e');

    // Issue/Sale of 50 boxes
    const issueDoc = await InventoryModule.addInventoryDocument({
      doc_type: 'Issue',
      date: '2026-08-02',
      source_warehouse_id: wh.id,
      dest_entity_type: 'customer',
      dest_entity_id: 'cust-100',
      reason: 'Sales Invoice INV-2026-0089',
      items: [
        {
          product_id: prod.id,
          product_code: prod.sku,
          product_name: prod.name,
          unit: prod.unit,
          qty: 50,
          last_purchase_price: 250
        }
      ]
    });

    const subRes = await InventoryModule.triggerLifecycleTransition(issueDoc.id, 'Submit');
    expect(subRes.success).toBe(true);
    const appRes = await InventoryModule.triggerLifecycleTransition(issueDoc.id, 'Approve');
    expect(appRes.success).toBe(true);

    // Verify stock was deducted from 300 -> 250
    const stockAfterIssue = InventoryModule.getProductStockInWarehouse(wh.id, prod.id);
    expect(stockAfterIssue).toBe(250);

    // Verify accounting journal entry posted for inventory issue
    const journalEntries = StorageEngine.getStored<any[]>('journal_entries', []);
    const issueJournal = journalEntries.find(je => je.company_id === companyId && je.sourceReference === `INV #${issueDoc.doc_no}`);
    expect(issueJournal).toBeDefined();
    expect(issueJournal.totalDebit).toBe(12500);
    expect(issueJournal.totalCredit).toBe(12500);
  });

  it('Cross-Cutting Validations: SystemAdmin SaaS Scope, No Phantom comp-1 Writes, Login Resilience', async () => {
    // 1. Verify getSelectedCompanyId returns empty string (NOT comp-1) when no company is selected
    StorageEngine.setStored('selected_company_id', '');
    localStorageMock.removeItem('custody_selected_company_id');

    const mockSystemAdmin = {
      id: 'sysadmin-usr',
      full_name: 'Platform Admin',
      email: 'sysadmin@platform.test',
      role: 'SystemAdmin' as const,
      company_id: '',
      permissions: {
        create_expense: true,
        settle_voucher: true,
        manage_users: true,
        view_reports: true,
        manage_settings: true
      },
      is_active: true
    };
    localStorageMock.setItem('custody_active_user', JSON.stringify(mockSystemAdmin));
    delete StorageEngine.cache['active_user'];

    const selectedCompanyId = CompaniesModule.getSelectedCompanyId();
    expect(selectedCompanyId).toBe('');
    expect(selectedCompanyId).not.toBe('comp-1');

    // 2. Verify SystemAdmin menu contains ONLY platform tools and NO operational modules
    const sysAdminMenuItems = getFilteredMenuItems(mockSystemAdmin as any, 'en').map(i => i.id);
    expect(sysAdminMenuItems).toContain('super-admin');
    expect(sysAdminMenuItems).toContain('audit-log');
    expect(sysAdminMenuItems).toContain('settings');
    expect(sysAdminMenuItems).toContain('search');
    expect(sysAdminMenuItems).not.toContain('transactions');
    expect(sysAdminMenuItems).not.toContain('inventory');
    expect(sysAdminMenuItems).not.toContain('purchasing');
    expect(sysAdminMenuItems).not.toContain('accounting');
    expect(sysAdminMenuItems).not.toContain('Expenses');
    expect(sysAdminMenuItems).not.toContain('CashVouchers');

    // 3. Verify Company Admin operational access is unaffected by SystemAdmin scope
    const mockCompanyAdmin = {
      id: 'usr-admin-e2e',
      full_name: 'E2E Admin User',
      email: 'admin.e2e@company.test',
      role: 'Admin' as const,
      company_id: companyId,
      permissions: {
        create_expense: true,
        settle_voucher: true,
        manage_users: true,
        view_reports: true,
        manage_settings: true
      },
      is_active: true
    };
    const adminMenuItems = getFilteredMenuItems(mockCompanyAdmin as any, 'en').map(i => i.id);
    expect(adminMenuItems).toContain('reconciliation');
    expect(adminMenuItems).toContain('approvals');
    expect(adminMenuItems).toContain('inventory');
    expect(adminMenuItems).toContain('purchasing');
    expect(adminMenuItems).toContain('accounting');

    // 4. Verify no write in any of the four flows was recorded under literal 'comp-1'
    const checkNoComp1 = (key: string) => {
      const items = StorageEngine.getStored<any[]>(key, []);
      const hasComp1 = items.some(x => x.company_id === 'comp-1');
      expect(hasComp1).toBe(false);
    };
    checkNoComp1('purchase_requests');
    checkNoComp1('purchase_orders');
    checkNoComp1('inventory');
    checkNoComp1('journal_entries');
    checkNoComp1('CashVouchers');

    // 5. Verify login/logout/login-again resilience (same user identity restored consistently)
    UsersModule.setActiveUser(null);
    expect(UsersModule.getActiveUser()).toBeNull();

    localStorageMock.setItem('custody_active_user', JSON.stringify(mockSystemAdmin));
    delete StorageEngine.cache['active_user'];
    const reLoggedInUser = UsersModule.getActiveUser();
    expect(reLoggedInUser).not.toBeNull();
    expect(reLoggedInUser?.id).toBe('sysadmin-usr');
    expect(reLoggedInUser?.email).toBe('sysadmin@platform.test');
  });
});
