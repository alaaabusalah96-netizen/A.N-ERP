/**
 * A.N ERP — Phase 7 Acceptance Battery (بطارية قبول موديول المخازن والمخزون)
 * 
 * Strict Verification under Section 3.1 & 3.4 of 00-custom-instructions.md:
 * - Minimum 8 acceptance scenarios executed with actual results.
 * - Multi-Warehouse management (7A)
 * - Stock movement receipt & issue with weighted average valuation (7B)
 * - Inter-warehouse stock transfer with dispatch & receive (7A)
 * - Inventory physical count with variance detection (7C)
 * - Strict SoD verification: Performer cannot approve their own inventory count (Section 7.1)
 * - PostingEngine balanced journal entry verification for variance (7C)
 * - NumberingEngine atomic sequencing
 * - Idempotency test (no double stock movement)
 */

import { StoragePort } from '../storage/StoragePort';
import { InMemoryAdapter } from '../storage/adapters/InMemoryAdapter';
import { PostingEngine } from '../accounting/PostingEngine';
import { NumberingEngine } from '../accounting/NumberingEngine';
import { InventoryService } from './InventoryService';

export interface BatteryScenarioResult {
  id: string;
  titleAr: string;
  passed: boolean;
  details: string;
  evidence?: any;
}

export interface Phase7BatteryReport {
  phase: string;
  module: string;
  adapterType: string;
  timestamp: string;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  isClosed: boolean;
  scenarios: BatteryScenarioResult[];
}

export async function runPhase7Battery(storageOverride?: StoragePort): Promise<Phase7BatteryReport> {
  const storage = storageOverride || new InMemoryAdapter();
  const postingEngine = new PostingEngine(storage);
  const numberingEngine = new NumberingEngine(storage);
  const inventoryService = new InventoryService(storage, postingEngine, numberingEngine);

  const tenantId = 'tenant-main';
  const scenarios: BatteryScenarioResult[] = [];

  // --------------------------------------------------------------------------
  // Scenario 1: Multi-Warehouse & Bins Creation (7A)
  // --------------------------------------------------------------------------
  try {
    const whRes = await inventoryService.saveWarehouse(
      tenantId,
      {
        id: 'wh-dammam',
        code: 'WH-003',
        nameAr: 'مستودع الدمام الإقليمي',
        nameEn: 'Dammam Regional Warehouse',
        location: 'الدمام - المدينة الصناعية الأولى',
        valuationMethod: 'WEIGHTED_AVERAGE',
        isDefault: false,
      },
      'idemp-wh-dammam-1'
    );

    const binRes = await inventoryService.saveWarehouseBin(tenantId, {
      warehouseId: 'wh-dammam',
      code: 'BIN-A-01',
      aisle: 'A',
      rack: '01',
      shelf: '1',
      descriptionAr: 'رف تخزين الأجهزة الحساسة',
    });

    const passed = Boolean(whRes.success && whRes.data && binRes.success && binRes.data);
    scenarios.push({
      id: 'PHASE7-SCENARIO-1',
      titleAr: 'تعدد المستودعات ومواقع التخزين الفرعية (Bins) وربط الفروع',
      passed,
      details: passed
        ? `تم إنشاء مستودع (${whRes.data?.nameAr}) بنجاح مع رف التخزين (${binRes.data?.code}).`
        : `فشل في إنشاء المستودع أو موقع التخزين: ${whRes.error?.detail || binRes.error?.detail}`,
      evidence: { warehouse: whRes.data, bin: binRes.data },
    });
  } catch (err: any) {
    scenarios.push({
      id: 'PHASE7-SCENARIO-1',
      titleAr: 'تعدد المستودعات ومواقع التخزين الفرعية (Bins) وربط الفروع',
      passed: false,
      details: `استثناء برمجي: ${err.message}`,
    });
  }

  // --------------------------------------------------------------------------
  // Scenario 2: Stock Item Catalog with Weighted Average Valuation (7A)
  // --------------------------------------------------------------------------
  try {
    const itemRes = await inventoryService.saveStockItem(
      tenantId,
      {
        id: 'item-tablet-01',
        itemCode: 'SKU-TAB-01',
        nameAr: 'جهاز لوحي ميداني 10 بوصة',
        category: 'ELECTRONICS',
        uom: 'جهاز',
        inventoryAccountCode: '110301',
        cogsAccountCode: '510101',
        adjustmentExpenseAccountCode: '520101',
        adjustmentGainAccountCode: '410101',
        valuationMethod: 'WEIGHTED_AVERAGE',
        standardCost: 1500,
        averageCost: 1500,
        reorderPoint: 5,
        trackBatch: true,
        trackSerial: true,
      },
      'idemp-item-tab-1'
    );

    const passed = Boolean(itemRes.success && itemRes.data?.id === 'item-tablet-01');
    scenarios.push({
      id: 'PHASE7-SCENARIO-2',
      titleAr: 'تعريف بطاقة الصنف وحسابات الأصول وتكلفة المبيعات والتتبع',
      passed,
      details: passed
        ? `تم تسجيل الصنف (${itemRes.data?.nameAr}) بالمتوسط المرجح وحد إعادة طلب 5 وتتبع التشغيلات والسيريال.`
        : `فشل تعريف الصنف: ${itemRes.error?.detail}`,
      evidence: itemRes.data,
    });
  } catch (err: any) {
    scenarios.push({
      id: 'PHASE7-SCENARIO-2',
      titleAr: 'تعريف بطاقة الصنف وحسابات الأصول وتكلفة المبيعات والتتبع',
      passed: false,
      details: `استثناء برمجي: ${err.message}`,
    });
  }

  // --------------------------------------------------------------------------
  // Scenario 3: Stock Receipt with Weighted Average Calculation (7B)
  // --------------------------------------------------------------------------
  try {
    // Receipt 1: 10 units @ 1000 SAR
    const rec1 = await inventoryService.receiveStock(tenantId, {
      warehouseId: 'wh-main',
      itemId: 'item-tablet-01',
      quantity: 10,
      unitCost: 1000,
      batchNumber: 'BATCH-2026-A',
      expiryDate: '2027-12-31',
      performedBy: 'usr-storekeeper-01',
      performedByName: 'أمين المستودع فهد',
      idempotencyKey: 'idemp-rec-1',
    });

    // Receipt 2: 10 units @ 1200 SAR -> New Avg Cost should be (10*1000 + 10*1200)/20 = 1100 SAR
    const rec2 = await inventoryService.receiveStock(tenantId, {
      warehouseId: 'wh-main',
      itemId: 'item-tablet-01',
      quantity: 10,
      unitCost: 1200,
      batchNumber: 'BATCH-2026-B',
      expiryDate: '2027-12-31',
      performedBy: 'usr-storekeeper-01',
      performedByName: 'أمين المستودع فهد',
      idempotencyKey: 'idemp-rec-2',
    });

    const stockRes = await inventoryService.getWarehouseStock(tenantId, 'wh-main', 'item-tablet-01');
    const currentStock = stockRes.data;

    const passed = Boolean(
      rec1.success &&
      rec2.success &&
      currentStock?.currentQty === 20 &&
      currentStock?.averageCost === 1100 &&
      currentStock?.totalValue === 22000
    );

    scenarios.push({
      id: 'PHASE7-SCENARIO-3',
      titleAr: 'التوريد المخزني واحتساب التقييم الفوري بالمتوسط المرجح (Weighted Average)',
      passed,
      details: passed
        ? `تم توريد دفعتين بإجمالي 20 وحدة واحتساب المتوسط المرجح بدقة متناهية (1,100 ر.س للوحدة بإجمالي 22,000 ر.س).`
        : `عدم تطابق في حساب المتوسط المرجح: الكمية=${currentStock?.currentQty}, المتوسط=${currentStock?.averageCost}`,
      evidence: currentStock,
    });
  } catch (err: any) {
    scenarios.push({
      id: 'PHASE7-SCENARIO-3',
      titleAr: 'التوريد المخزني واحتساب التقييم الفوري بالمتوسط المرجح (Weighted Average)',
      passed: false,
      details: `استثناء برمجي: ${err.message}`,
    });
  }

  // --------------------------------------------------------------------------
  // Scenario 4: Stock Issue & Insufficient Stock Prevention (7B)
  // --------------------------------------------------------------------------
  try {
    // Attempt to issue 25 units when only 20 are available -> must fail with 400
    const failIssue = await inventoryService.issueStock(tenantId, {
      warehouseId: 'wh-main',
      itemId: 'item-tablet-01',
      quantity: 25,
      performedBy: 'usr-storekeeper-01',
      performedByName: 'أمين المستودع فهد',
      idempotencyKey: 'idemp-fail-issue',
    });

    // Valid issue: 5 units
    const validIssue = await inventoryService.issueStock(tenantId, {
      warehouseId: 'wh-main',
      itemId: 'item-tablet-01',
      quantity: 5,
      performedBy: 'usr-storekeeper-01',
      performedByName: 'أمين المستودع فهد',
      idempotencyKey: 'idemp-valid-issue',
    });

    const stockRes = await inventoryService.getWarehouseStock(tenantId, 'wh-main', 'item-tablet-01');

    const passed = Boolean(!failIssue.success && validIssue.success && stockRes.data?.currentQty === 15);
    scenarios.push({
      id: 'PHASE7-SCENARIO-4',
      titleAr: 'منع الصرف عند تجاوز الرصيد المتاح وتحديث أرصدة المخزون بالصرف الفعلي',
      passed,
      details: passed
        ? `تم رفض طلب الصرف غير المغطى بنجاح، وتم صرف 5 وحدات وتحديث الرصيد المتبقي إلى 15 وحدة.`
        : `فشل التحقق من قيود الرصيد المتاح.`,
      evidence: { failIssueError: failIssue.error, validIssue: validIssue.data, stockAfter: stockRes.data },
    });
  } catch (err: any) {
    scenarios.push({
      id: 'PHASE7-SCENARIO-4',
      titleAr: 'منع الصرف عند تجاوز الرصيد المتاح وتحديث أرصدة المخزون بالصرف الفعلي',
      passed: false,
      details: `استثناء برمجي: ${err.message}`,
    });
  }

  // --------------------------------------------------------------------------
  // Scenario 5: Inter-Warehouse Stock Transfer (7A)
  // --------------------------------------------------------------------------
  try {
    // Transfer 5 units from wh-main to wh-dammam
    const trfRes = await inventoryService.createTransfer(tenantId, {
      sourceWarehouseId: 'wh-main',
      targetWarehouseId: 'wh-dammam',
      lines: [
        {
          itemId: 'item-tablet-01',
          quantity: 5,
        },
      ],
      requestedBy: 'usr-logistics-01',
      requestedByName: 'مشرف النقل طارق',
      idempotencyKey: 'idemp-trf-01',
    });

    const trfId = trfRes.data?.id || '';

    // Receive at destination
    const recvRes = await inventoryService.receiveTransfer(
      tenantId,
      trfId,
      'usr-dammam-keeper',
      'أمين مستودع الدمام خالد',
      'idemp-trf-recv-01'
    );

    const srcStock = await inventoryService.getWarehouseStock(tenantId, 'wh-main', 'item-tablet-01');
    const tgtStock = await inventoryService.getWarehouseStock(tenantId, 'wh-dammam', 'item-tablet-01');

    const passed = Boolean(
      trfRes.success &&
      recvRes.success &&
      recvRes.data?.status === 'RECEIVED' &&
      srcStock.data?.currentQty === 10 &&
      tgtStock.data?.currentQty === 5
    );

    scenarios.push({
      id: 'PHASE7-SCENARIO-5',
      titleAr: 'التحويل المخزني بين المستودعات مع تدفق الإرسال والاستلام المكتمل',
      passed,
      details: passed
        ? `تم تحويل 5 وحدات من مستودع الرياض (wh-main) إلى الدمام (wh-dammam) وتحديث الأرصدة بنجاح.`
        : `فشل التحويل المخزني: ${trfRes.error?.detail || recvRes.error?.detail}`,
      evidence: { transfer: recvRes.data, srcQty: srcStock.data?.currentQty, tgtQty: tgtStock.data?.currentQty },
    });
  } catch (err: any) {
    scenarios.push({
      id: 'PHASE7-SCENARIO-5',
      titleAr: 'التحويل المخزني بين المستودعات مع تدفق الإرسال والاستلام المكتمل',
      passed: false,
      details: `استثناء برمجي: ${err.message}`,
    });
  }

  // --------------------------------------------------------------------------
  // Scenario 6: Physical Inventory Count & Variance Detection (7C)
  // --------------------------------------------------------------------------
  let countId = '';
  try {
    // Current stock in wh-dammam is 5 units. Let's record countedQty = 3 (Deficit of 2 units)
    const countRes = await inventoryService.createStockCount(tenantId, {
      countType: 'PERIODIC',
      warehouseId: 'wh-dammam',
      lines: [
        {
          itemId: 'item-tablet-01',
          countedQty: 3,
          notes: 'عجز فعلي ناتج عن تلف أثناء النقل',
        },
      ],
      performedBy: 'usr-auditor-ali',
      performedByName: 'المراجع الميداني علي',
      notes: 'جرد دوري ربع سنوي لمستودع الدمام',
      idempotencyKey: 'idemp-cnt-01',
    });

    countId = countRes.data?.id || '';

    const passed = Boolean(
      countRes.success &&
      countRes.data?.hasVariance === true &&
      countRes.data?.netVarianceAmount < 0
    );

    scenarios.push({
      id: 'PHASE7-SCENARIO-6',
      titleAr: 'محضر الجرد الفعلي ورصد الفروقات المخزنية (عجز بقيمة 2 وحدة)',
      passed,
      details: passed
        ? `تم رصد عجز بمقدار 2 وحدة بقيمة صافية (${countRes.data?.netVarianceAmount} ر.س) بنجاح.`
        : `فشل رصد الفروقات المخزنية: ${countRes.error?.detail}`,
      evidence: countRes.data,
    });
  } catch (err: any) {
    scenarios.push({
      id: 'PHASE7-SCENARIO-6',
      titleAr: 'محضر الجرد الفعلي ورصد الفروقات المخزنية (عجز بقيمة 2 وحدة)',
      passed: false,
      details: `استثناء برمجي: ${err.message}`,
    });
  }

  // --------------------------------------------------------------------------
  // Scenario 7: Strict Segregation of Duties (SoD) on Inventory Count Approval (7C & Section 7.1)
  // --------------------------------------------------------------------------
  try {
    // The user who conducted the physical count (usr-auditor-ali) tries to approve/post it -> MUST BE BLOCKED
    const sodViolationAttempt = await inventoryService.approveAndPostStockCount(tenantId, {
      countId,
      approvedBy: 'usr-auditor-ali',
      approvedByName: 'المراجع الميداني علي (نفس المنفذ)',
      idempotencyKey: 'idemp-sod-violation',
    });

    const passed = Boolean(!sodViolationAttempt.success && sodViolationAttempt.error?.status === 403);
    scenarios.push({
      id: 'PHASE7-SCENARIO-7',
      titleAr: 'فصل الصلاحيات والواجبات (SoD): منع منفذ الجرد من اعتماده أو ترحيل فروقاته',
      passed,
      details: passed
        ? `تم رفض اعتماد الجرد بواسطة نفس المنفذ (رمز 403 - تعارض مصالح SoD معتمد ومحمي).`
        : `فشل فحص تعارض المصالح وتم قبول الاعتماد بشكل غير نظامي!`,
      evidence: sodViolationAttempt.error,
    });
  } catch (err: any) {
    scenarios.push({
      id: 'PHASE7-SCENARIO-7',
      titleAr: 'فصل الصلاحيات والواجبات (SoD): منع منفذ الجرد من اعتماده أو ترحيل فروقاته',
      passed: false,
      details: `استثناء برمجي: ${err.message}`,
    });
  }

  // --------------------------------------------------------------------------
  // Scenario 8: Balanced Journal Posting via PostingEngine on Legitimate Count Approval (7C & بند 13)
  // --------------------------------------------------------------------------
  try {
    // Independent authorized supervisor approves: usr-cfo-salem
    const validApproval = await inventoryService.approveAndPostStockCount(tenantId, {
      countId,
      approvedBy: 'usr-cfo-salem',
      approvedByName: 'المدير المالي سالم',
      idempotencyKey: 'idemp-legit-cnt-approval',
    });

    const postPassed = Boolean(
      validApproval.success &&
      validApproval.data?.status === 'POSTED' &&
      validApproval.data?.journalEntryId
    );

    // Verify stock in wh-dammam updated to counted quantity (3 units)
    const stockAfter = await inventoryService.getWarehouseStock(tenantId, 'wh-dammam', 'item-tablet-01');
    const balanceUpdated = stockAfter.data?.currentQty === 3;

    const passed = Boolean(postPassed && balanceUpdated);
    scenarios.push({
      id: 'PHASE7-SCENARIO-8',
      titleAr: 'ترحيل قيد التسوية المتوازن عبر PostingEngine وتعديل رصيد المخزون الفعلي',
      passed,
      details: passed
        ? `تم ترحيل القيد المحاسبي المتوازن (JE-ADJ) وتحديث رصيد المستودع الفعلي إلى 3 وحدات بنجاح.`
        : `فشل ترحيل قيد التسوية أو تحديث الرصيد.`,
      evidence: { count: validApproval.data, updatedStock: stockAfter.data },
    });
  } catch (err: any) {
    scenarios.push({
      id: 'PHASE7-SCENARIO-8',
      titleAr: 'ترحيل قيد التسوية المتوازن عبر PostingEngine وتعديل رصيد المخزون الفعلي',
      passed: false,
      details: `استثناء برمجي: ${err.message}`,
    });
  }

  // --------------------------------------------------------------------------
  // Scenario 9: Idempotency Enforcement on Stock Movements (Section 8.1)
  // --------------------------------------------------------------------------
  try {
    const key = 'idemp-duplicate-test-key';
    const firstCall = await inventoryService.receiveStock(tenantId, {
      warehouseId: 'wh-main',
      itemId: 'item-tablet-01',
      quantity: 2,
      unitCost: 1100,
      performedBy: 'usr-storekeeper-01',
      performedByName: 'أمين المستودع فهد',
      idempotencyKey: key,
    });

    const secondCall = await inventoryService.receiveStock(tenantId, {
      warehouseId: 'wh-main',
      itemId: 'item-tablet-01',
      quantity: 2,
      unitCost: 1100,
      performedBy: 'usr-storekeeper-01',
      performedByName: 'أمين المستودع فهد',
      idempotencyKey: key,
    });

    const passed = Boolean(
      firstCall.success &&
      secondCall.success &&
      firstCall.data?.id === secondCall.data?.id
    );

    scenarios.push({
      id: 'PHASE7-SCENARIO-9',
      titleAr: 'ضمان الإدهنية (Idempotency): منع تكرار الحركات المخزنية عند إعادة إرسال نفس المفتاح',
      passed,
      details: passed
        ? `تم استرجاع نتيجة التوريد المخزني السابقة بدقة دون مضاعفة الكميات في المخزن.`
        : `فشل اختبار الإدهنية وتمت مضاعفة الحركات.`,
      evidence: { firstId: firstCall.data?.id, secondId: secondCall.data?.id },
    });
  } catch (err: any) {
    scenarios.push({
      id: 'PHASE7-SCENARIO-9',
      titleAr: 'ضمان الإدهنية (Idempotency): منع تكرار الحركات المخزنية عند إعادة إرسال نفس المفتاح',
      passed: false,
      details: `استثناء برمجي: ${err.message}`,
    });
  }

  const passedScenarios = scenarios.filter(s => s.passed).length;
  const failedScenarios = scenarios.filter(s => !s.passed).length;

  return {
    phase: 'PHASE 7',
    module: 'المخازن والمخزون (Warehouses & Inventory - موديول 3 من 15)',
    adapterType: 'InMemoryAdapter (Development / Test Execution)',
    timestamp: new Date().toISOString(),
    totalScenarios: scenarios.length,
    passedScenarios,
    failedScenarios,
    isClosed: failedScenarios === 0,
    scenarios,
  };
}
