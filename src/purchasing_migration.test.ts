import { describe, test, expect, beforeEach } from 'vitest';
import { StorageEngine } from './db/storage';
import { OrganizationEngine } from './db/organizationEngine';
import { CostCenterEngine } from './db/costCenterEngine';
import { DocumentNumberEngine } from './db/documentNumberEngine';
import { PurchasingBusinessEngine } from './lib/enterprise/purchasing_engine';
import { InventoryModule } from './db/inventory';
import { AccountingBusinessEngine } from './lib/enterprise/accounting_engine';
import { createEventEnvelope } from './lib/enterprise/metadata';
import { OrganizationUnit } from './types/organization';
import { Product, Warehouse, InventoryDocument } from './types/inventory';
import { PurchaseRequest, PurchaseOrder } from './types/purchasing';

describe('Phase 13: Purchasing Module Organization Unit Migration & Integration', () => {
  const companyId = 'test-comp-p13';
  const userId = 'user-admin-p13';
  const userName = 'Admin Tester';
  const userRole = 'SystemAdmin';

  let hqUnit: OrganizationUnit;
  let cairoUnit: OrganizationUnit;
  let testWarehouse: Warehouse;
  let testProduct: Product;

  beforeEach(async () => {
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
    }
    // Reset local state
    StorageEngine.setStored('organization_units', []);
    StorageEngine.setStored('cost_centers', []);
    StorageEngine.setStored('document_number_configs', []);
    StorageEngine.setStored('vendors', []);
    StorageEngine.setStored('purchase_requests', []);
    StorageEngine.setStored('purchase_orders', []);
    StorageEngine.setStored('inventory_documents', []);
    StorageEngine.setStored('products', []);
    StorageEngine.setStored('warehouses', []);
    StorageEngine.setStored('stock_balances', []);
    StorageEngine.setStored('journal_entries', []);
    StorageEngine.setStored('accounting_accounts', []);
    DocumentNumberEngine.resetState();

    // 1. Initialize Chart of Accounts for company
    await AccountingBusinessEngine.getAccounts(companyId);

    // 2. Setup Organization Tree: HQ -> Cairo Branch
    hqUnit = await OrganizationEngine.addUnit({
      companyId,
      code: 'HQ',
      name: 'المقر الرئيسي',
      nameAr: 'المقر الرئيسي',
      nameEn: 'Headquarters',
      typeId: 'out-company',
      isActive: true
    });

    cairoUnit = await OrganizationEngine.addUnit({
      companyId,
      code: 'CAI',
      name: 'فرع القاهرة',
      nameAr: 'فرع القاهرة',
      nameEn: 'Cairo Branch',
      typeId: 'out-branch',
      parentId: hqUnit.id,
      isActive: true
    });

    // Auto-create cost centers for org units
    await CostCenterEngine.autoCreateOrLinkCostCenterForOrgUnit(hqUnit);
    await CostCenterEngine.autoCreateOrLinkCostCenterForOrgUnit(cairoUnit);

    // 3. Setup Warehouse linked to Cairo Branch
    testWarehouse = await InventoryModule.addWarehouse({
      code: 'WH-CAI-01',
      name: 'مستودع القاهرة المركزية',
      type_id: 'wt-central',
      org_unit_id: cairoUnit.id,
      company_id: companyId,
      is_active: true,
      receiving_approval_workflow: false
    });

    // 4. Setup Product
    testProduct = await InventoryModule.addProduct({
      company_id: companyId,
      code: 'PRD-RAW-01',
      name: 'مواد خام بلاستيك',
      unit: 'كجم',
      min_stock: 10,
      is_active: true,
      last_purchase_price: 150
    });

    // 5. Setup Vendor
    PurchasingBusinessEngine.addVendor(
      companyId,
      'شركة النصر للتوريدات',
      'Al-Nasr Supplies Co.',
      '0100000000',
      'info@alnasr.com',
      '300123456',
      'القاهرة'
    );
  });

  test('1. Submit PR with org_unit_id auto-assigns cost center and generates configured doc number', async () => {
    // Configure Document Numbering for PR under Cairo Branch
    DocumentNumberEngine.saveConfig({
      company_id: companyId,
      org_unit_id: cairoUnit.id,
      documentType: 'PR',
      prefix: 'PR-CAI',
      pattern: '{PREFIX}-{YEAR}-{SEQ:4}',
      padding: 4,
      resetFrequency: 'YEARLY',
      includeYear: true,
      includeOrgCode: false,
      currentSequence: 0,
      manualStartNo: 1001
    });

    const engine = new PurchasingBusinessEngine();
    const prEvent = createEventEnvelope({
      eventType: 'PR_SUBMITTED',
      tenantId: companyId,
      userId,
      userName,
      userRole,
      payload: {
        requesterId: userId,
        requesterName: userName,
        department: 'قسم المشتريات',
        org_unit_id: cairoUnit.id,
        items: [
          {
            productId: testProduct.id,
            productCode: testProduct.code,
            productName: testProduct.name,
            unit: testProduct.unit,
            qty: 50,
            estimatedPrice: 150
          }
        ],
        notes: 'شراء مواد خام لفرع القاهرة'
      }
    });

    const res = await engine.processEvent(prEvent);
    expect(res.success).toBe(true);

    const prs = PurchasingBusinessEngine.getPurchaseRequests(companyId);
    expect(prs.length).toBe(1);
    const createdPR = prs[0];

    expect(createdPR.org_unit_id).toBe(cairoUnit.id);
    expect(createdPR.cost_center_id).toBeDefined();

    const expectedCostCenter = await CostCenterEngine.resolveCostCenterForOrgUnit(cairoUnit.id, companyId);
    expect(createdPR.cost_center_id).toBe(expectedCostCenter?.id);
    expect(createdPR.prNumber).toContain('PR-CAI');
  });

  test('2. Issue PO inherits org_unit_id from PR / delivery warehouse and links cost center', async () => {
    const engine = new PurchasingBusinessEngine();
    const vendor = PurchasingBusinessEngine.getVendors(companyId)[0];

    // Submit PR for Cairo branch
    const prEvent = createEventEnvelope({
      eventType: 'PR_SUBMITTED',
      tenantId: companyId,
      userId,
      userName,
      userRole,
      payload: {
        requesterId: userId,
        requesterName: userName,
        department: 'الصيانة',
        org_unit_id: cairoUnit.id,
        items: [
          {
            productId: testProduct.id,
            productCode: testProduct.code,
            productName: testProduct.name,
            unit: testProduct.unit,
            qty: 20,
            estimatedPrice: 150
          }
        ]
      }
    });
    await engine.processEvent(prEvent);
    const createdPR = PurchasingBusinessEngine.getPurchaseRequests(companyId)[0];

    // Issue PO from PR
    const poEvent = createEventEnvelope({
      eventType: 'PO_ISSUED',
      tenantId: companyId,
      userId,
      userName,
      userRole,
      payload: {
        prId: createdPR.id,
        vendorId: vendor.id,
        deliveryWarehouseId: testWarehouse.id,
        items: [
          {
            productId: testProduct.id,
            productCode: testProduct.code,
            productName: testProduct.name,
            unit: testProduct.unit,
            qty: 20,
            unitPrice: 150
          }
        ],
        notes: 'أمر شراء صادر بناء على الطلب'
      }
    });

    const poRes = await engine.processEvent(poEvent);
    expect(poRes.success).toBe(true);

    const pos = PurchasingBusinessEngine.getPurchaseOrders(companyId);
    expect(pos.length).toBe(1);
    const createdPO = pos[0];

    expect(createdPO.org_unit_id).toBe(cairoUnit.id);
    expect(createdPO.cost_center_id).toBeDefined();
  });

  test('3. Receive PO stamps org_unit_id and cost_center_id on Goods Receipt and GL Journal Entry', async () => {
    const engine = new PurchasingBusinessEngine();
    const vendor = PurchasingBusinessEngine.getVendors(companyId)[0];

    // Issue Direct PO for Cairo branch
    const poEvent = createEventEnvelope({
      eventType: 'PO_ISSUED',
      tenantId: companyId,
      userId,
      userName,
      userRole,
      payload: {
        vendorId: vendor.id,
        deliveryWarehouseId: testWarehouse.id,
        org_unit_id: cairoUnit.id,
        items: [
          {
            productId: testProduct.id,
            productCode: testProduct.code,
            productName: testProduct.name,
            unit: testProduct.unit,
            qty: 100,
            unitPrice: 150
          }
        ]
      }
    });
    await engine.processEvent(poEvent);
    const po = PurchasingBusinessEngine.getPurchaseOrders(companyId)[0];

    // Receive PO
    const receiveEvent = createEventEnvelope({
      eventType: 'PO_RECEIVED',
      tenantId: companyId,
      userId,
      userName,
      userRole,
      payload: {
        poId: po.id,
        warehouseId: testWarehouse.id
      }
    });

    const recRes = await engine.processEvent(receiveEvent);
    expect(recRes.success).toBe(true);

    // Verify Goods Receipt document
    const invDocs = StorageEngine.getStored<InventoryDocument[]>('inventory_documents', []);
    expect(invDocs.length).toBe(1);
    const receiptDoc = invDocs[0];
    expect(receiptDoc.org_unit_id).toBe(cairoUnit.id);
    expect(receiptDoc.cost_center_id).toBeDefined();

    // Verify Double-Entry Accounting Journal Entry
    const jes = AccountingBusinessEngine.getJournalEntries(companyId);
    expect(jes.length).toBeGreaterThan(0);
    const poJE = jes.find(j => j.statementAr.includes(po.poNumber));
    expect(poJE).toBeDefined();
    expect(poJE?.org_unit_id).toBe(cairoUnit.id);
    expect(poJE?.costCenterId).toBeDefined();
    expect(poJE?.lines[0].org_unit_id).toBe(cairoUnit.id);
  });

  test('4. Subtree filtering queries PRs and POs across organizational hierarchy', async () => {
    const engine = new PurchasingBusinessEngine();
    const vendor = PurchasingBusinessEngine.getVendors(companyId)[0];

    // Create PR for HQ
    await engine.processEvent(createEventEnvelope({
      eventType: 'PR_SUBMITTED',
      tenantId: companyId,
      userId, userName, userRole,
      payload: {
        requesterId: userId,
        requesterName: userName,
        org_unit_id: hqUnit.id,
        items: [{ productId: testProduct.id, productCode: testProduct.code, productName: testProduct.name, unit: testProduct.unit, qty: 10, estimatedPrice: 150 }]
      }
    }));

    // Create PR for Cairo Branch
    await engine.processEvent(createEventEnvelope({
      eventType: 'PR_SUBMITTED',
      tenantId: companyId,
      userId, userName, userRole,
      payload: {
        requesterId: userId,
        requesterName: userName,
        org_unit_id: cairoUnit.id,
        items: [{ productId: testProduct.id, productCode: testProduct.code, productName: testProduct.name, unit: testProduct.unit, qty: 20, estimatedPrice: 150 }]
      }
    }));

    // Query HQ subtree (should return both HQ and Cairo branch PRs)
    const hqSubtreePRs = PurchasingBusinessEngine.getPurchaseRequestsByOrgUnit(companyId, hqUnit.id, true);
    expect(hqSubtreePRs.length).toBe(2);

    // Query HQ exact unit only (should return 1 PR)
    const hqExactPRs = PurchasingBusinessEngine.getPurchaseRequestsByOrgUnit(companyId, hqUnit.id, false);
    expect(hqExactPRs.length).toBe(1);

    // Query Cairo branch (should return 1 PR)
    const cairoPRs = PurchasingBusinessEngine.getPurchaseRequestsByOrgUnit(companyId, cairoUnit.id, true);
    expect(cairoPRs.length).toBe(1);
  });
});
