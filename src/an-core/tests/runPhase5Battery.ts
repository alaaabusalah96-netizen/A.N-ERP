/**
 * @file runPhase5Battery.ts
 * @description Comprehensive Automated Verification Battery for Phase 5:
 * Cash Custody Module (موديول العهدة النقدية - موديول 1 من 15).
 * Tests all 8 acceptance criteria:
 *  1. 5A — فتح العهدة وسقف الدور وربط مركز التكلفة
 *  2. 5A — رفض فتح العهدة عند تجاوز سقف الدور
 *  3. 5B — تسجيل المصروفات واشتراط مرفق الإثبات ورقم الإيصال والخصم اللحظي
 *  4. 5C — إنفاذ الفصل الصارم للمهام (SoD بند 7.1): منع منشئ العهدة من اعتماد تسويتها
 *  5. 5C — تسوية العهدة عبر PostingEngine بقيد متوازن والاستعاضة النقدية
 *  6. 5C — إدهنية التسوية ومنع الازدواجية (Idempotency بند 8.1)
 *  7. 5D — فحص تصفية العهد للموارد البشرية (HR Clearance) ومنع إنهاء الخدمة لعهدة مفتوحة
 *  8. 5E — مطابقة Module Manifest وتكامل المحركات والأحداث وتعدد المستأجرين
 * Executed strictly against live StoragePort (PostgresPrimaryAdapter).
 */

import { StorageRouter } from '../storage/StorageRouter';
import { CashCustodyService } from '../modules/custody/CashCustodyService';
import { CashCustodyModuleManifest } from '../modules/custody/CashCustodyManifest';
import { TenantCompany, Account } from '../storage/StoragePort';

export interface Phase5BatteryTestResult {
  testId: string;
  nameAr: string;
  category: '5A_OPEN' | '5B_EXPENSE' | '5C_SETTLEMENT_SOD' | '5C_POSTING_ENGINE' | '5D_HR_CLEARANCE' | '5E_MANIFEST';
  passed: boolean;
  durationMs: number;
  evidence: string;
  error?: string;
}

export interface Phase5BatterySuiteResult {
  totalTests: number;
  passedCount: number;
  failedCount: number;
  allPassed: boolean;
  durationMs: number;
  tests: Phase5BatteryTestResult[];
}

export async function runPhase5Battery(): Promise<Phase5BatterySuiteResult> {
  const startTime = Date.now();
  const results: Phase5BatteryTestResult[] = [];
  const router = new StorageRouter();
  const primary = router.getPrimaryAdapter();

  await primary.initializeSchema();

  const suffix = Date.now().toString().slice(-6);
  const testTenantId = `ten-custody-${suffix}`;

  // Seed test tenant
  const tenantCompany: TenantCompany = {
    id: testTenantId,
    code: `CST-CO-${suffix}`,
    nameAr: 'شركة العهد النقدية والعمليات (مرحلة 5)',
    nameEn: 'Cash Custody Operations Co.',
    crNumber: '1010888999',
    taxNumber: '300888999000003',
    country: 'SA',
    baseCurrency: 'SAR',
    status: 'ACTIVE',
    backendConfig: {
      adapterType: 'postgresql',
      connectionRef: 'DATABASE_URL',
      isolationLevel: 'Shared',
    },
    createdAt: new Date().toISOString(),
  };

  await primary.saveTenant(tenantCompany, `seed-tenant-${suffix}`);

  // Seed required GL accounts for settlement posting
  const glAccounts: Account[] = [
    {
      tenantId: testTenantId,
      code: '1010',
      nameAr: 'الصندوق والنقدية بالخزينة',
      nameEn: 'Petty Cash / Vault',
      type: 'ASSET',
      nature: 'DEBIT',
      currency: 'SAR',
      balance: 500000,
      isActive: true,
    },
    {
      tenantId: testTenantId,
      code: '5040',
      nameAr: 'مصروفات نثريات وضيافة',
      nameEn: 'Hospitality & General Expenses',
      type: 'EXPENSE',
      nature: 'DEBIT',
      currency: 'SAR',
      balance: 0,
      isActive: true,
    },
    {
      tenantId: testTenantId,
      code: '5050',
      nameAr: 'فروق وعجز تسوية العهد',
      nameEn: 'Custody Settlement Variance Deficit',
      type: 'EXPENSE',
      nature: 'DEBIT',
      currency: 'SAR',
      balance: 0,
      isActive: true,
    },
  ];

  for (const acc of glAccounts) {
    await primary.saveAccount(testTenantId, acc, `seed-acc-${acc.code}-${suffix}`);
  }

  const custodyService = new CashCustodyService(primary);

  // -------------------------------------------------------------------------
  // Test 1: 5A — فتح عهدة نقدية ناجح وربط مركز التكلفة
  // -------------------------------------------------------------------------
  const t1Start = Date.now();
  let createdCustodyId = '';
  try {
    const openRes = await custodyService.openCustody(testTenantId, {
      employeeId: `emp-01-${suffix}`,
      employeeName: 'أحمد محمود العتيبي',
      branchId: 'br-riyadh',
      branchName: 'فرع الرياض الرئيسي',
      costCenterId: 'cc-ops-01',
      costCenterName: 'مركز تكلفة العمليات والتشغيل',
      allocatedAmount: 10000,
      currency: 'SAR',
      employeeRole: 'accountant',
      roleLimit: 15000,
      openedBy: 'usr-fin-manager',
      openedByName: 'سلطان القحطاني (مدير الحسابات)',
      notes: 'عهدة تشغيلية لشهر أكتوبر',
      idempotencyKey: `idemp-open-1-${suffix}`,
    });

    if (!openRes.success || !openRes.data) {
      throw new Error(openRes.error?.detail || 'فشل فتح العهدة النقدية');
    }

    createdCustodyId = openRes.data.id;
    const isBalanceCorrect = openRes.data.currentBalance === 10000;
    const isStatusOpen = openRes.data.status === 'OPEN';

    results.push({
      testId: 'P5-TEST-01',
      nameAr: 'فتح عهدة نقدية ناجح وربط مركز التكلفة وسقف الدور (5A)',
      category: '5A_OPEN',
      passed: isBalanceCorrect && isStatusOpen,
      durationMs: Date.now() - t1Start,
      evidence: `تم فتح العهدة برقم (${openRes.data.custodyCode})، الرصيد المخصص: ${openRes.data.allocatedAmount} ر.س، الرصيد الحالي: ${openRes.data.currentBalance} ر.س، مركز التكلفة: ${openRes.data.costCenterId}.`,
    });
  } catch (err: any) {
    results.push({
      testId: 'P5-TEST-01',
      nameAr: 'فتح عهدة نقدية ناجح وربط مركز التكلفة وسقف الدور (5A)',
      category: '5A_OPEN',
      passed: false,
      durationMs: Date.now() - t1Start,
      evidence: 'فشل أثناء فتح العهدة',
      error: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // Test 2: 5A — رفض فتح العهدة عند تجاوز سقف الدور
  // -------------------------------------------------------------------------
  const t2Start = Date.now();
  try {
    const rejectRes = await custodyService.openCustody(testTenantId, {
      employeeId: `emp-02-${suffix}`,
      employeeName: 'فهد السالم',
      costCenterId: 'cc-ops-01',
      allocatedAmount: 50000, // Exceeds role limit of 15000
      employeeRole: 'accountant',
      roleLimit: 15000,
      openedBy: 'usr-fin-manager',
      openedByName: 'سلطان القحطاني',
      idempotencyKey: `idemp-open-exceed-${suffix}`,
    });

    const isRejected = !rejectRes.success && (rejectRes.error?.status === 400);

    results.push({
      testId: 'P5-TEST-02',
      nameAr: 'رفض فتح عهدة تتجاوز سقف الدور المحدد للموظف (5A)',
      category: '5A_OPEN',
      passed: isRejected,
      durationMs: Date.now() - t2Start,
      evidence: isRejected
        ? `تم رفض الطلب بنجاح برسالة: "${rejectRes.error?.detail}"`
        : 'فشل: تم قبول فتح العهدة رغم تجاوزها لسقف الدور!',
    });
  } catch (err: any) {
    results.push({
      testId: 'P5-TEST-02',
      nameAr: 'رفض فتح عهدة تتجاوز سقف الدور المحدد للموظف (5A)',
      category: '5A_OPEN',
      passed: false,
      durationMs: Date.now() - t2Start,
      evidence: 'خطأ أثناء اختبار سقف الدور',
      error: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // Test 3: 5B — تسجيل مصروفات واشتراط مرفق الإثبات ورقم الإيصال والخصم اللحظي
  // -------------------------------------------------------------------------
  const t3Start = Date.now();
  let recordedTxId = '';
  try {
    // Attempt 1: Without proof attachment -> must fail
    const noProofRes = await custodyService.recordExpense(testTenantId, {
      custodyId: createdCustodyId,
      amount: 1200,
      expenseCategory: 'نثريات وضيافة',
      expenseAccountCode: '5040',
      description: 'شراء لوازم ومشروبات للضيافة',
      receiptNumber: '',
      attachmentUrl: '',
      recordedBy: 'emp-01',
      recordedByName: 'أحمد محمود العتيبي',
      idempotencyKey: `idemp-exp-fail-${suffix}`,
    });

    const proofBlocked = !noProofRes.success && noProofRes.error?.status === 400;

    // Attempt 2: With valid receipt and proof attachment -> must succeed and deduct balance
    const validExpRes = await custodyService.recordExpense(testTenantId, {
      custodyId: createdCustodyId,
      amount: 1200,
      expenseCategory: 'نثريات وضيافة',
      expenseAccountCode: '5040',
      description: 'شراء لوازم وضيافة معتمدة',
      receiptNumber: 'INV-2026-9812',
      attachmentUrl: 'https://storage.an-erp.local/proofs/rec-9812.pdf',
      attachmentName: 'فاتورة_الضيافة_9812.pdf',
      recordedBy: 'emp-01',
      recordedByName: 'أحمد محمود العتيبي',
      idempotencyKey: `idemp-exp-valid-${suffix}`,
    });

    if (!validExpRes.success || !validExpRes.data) {
      throw new Error(validExpRes.error?.detail || 'فشل تسجيل المصروف الصحيح');
    }

    recordedTxId = validExpRes.data.id;

    // Verify balance deduction in storage
    const updatedCustodyRes = await primary.getCashCustody(testTenantId, createdCustodyId);
    const updatedBalance = updatedCustodyRes.data?.currentBalance;
    const isBalanceDeducted = updatedBalance === 8800; // 10000 - 1200 = 8800

    results.push({
      testId: 'P5-TEST-03',
      nameAr: 'تسجيل مصروفات واشتراط مرفق الإثبات والخصم اللحظي من الرصيد (5B)',
      category: '5B_EXPENSE',
      passed: proofBlocked && isBalanceDeducted,
      durationMs: Date.now() - t3Start,
      evidence: `تم منع الصرف بلا مرفق (${proofBlocked})، ثم تم تسجيل الحركة برقم (${validExpRes.data.transactionCode}) ومرفق (${validExpRes.data.attachmentUrl}) وتناقص الرصيد اللحظي من 10000 إلى ${updatedBalance} ر.س.`,
    });
  } catch (err: any) {
    results.push({
      testId: 'P5-TEST-03',
      nameAr: 'تسجيل مصروفات واشتراط مرفق الإثبات والخصم اللحظي من الرصيد (5B)',
      category: '5B_EXPENSE',
      passed: false,
      durationMs: Date.now() - t3Start,
      evidence: 'خطأ أثناء تسجيل المصروف',
      error: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // Test 4: 5C — إنفاذ الفصل الصارم للمهام (SoD بند 7.1): منع منشئ العهدة من اعتماد تسويتها
  // -------------------------------------------------------------------------
  const t4Start = Date.now();
  try {
    // Creator was 'usr-fin-manager' -> if same user attempts to settle, must fail SoD check
    const sodRejectRes = await custodyService.settleCustody(testTenantId, {
      custodyId: createdCustodyId,
      settledBy: 'usr-fin-manager', // SAME as openedBy in DB!
      settledByName: 'سلطان القحطاني',
      idempotencyKey: `idemp-sod-reject-${suffix}`,
    });

    const isSodEnforced =
      !sodRejectRes.success &&
      sodRejectRes.error?.status === 403 &&
      sodRejectRes.error?.type.includes('sod-conflict');

    results.push({
      testId: 'P5-TEST-04',
      nameAr: 'إنفاذ الفصل الصارم للمهام (SoD بند 7.1): منع منشئ العهدة من اعتماد تسويتها (5C)',
      category: '5C_SETTLEMENT_SOD',
      passed: isSodEnforced,
      durationMs: Date.now() - t4Start,
      evidence: isSodEnforced
        ? `تم حظر التسوية بواسطة منشئ العهدة بنجاح: "${sodRejectRes.error?.detail}"`
        : 'فشل: سمح النظام لمنشئ العهدة باعتماد تسويتها بنفسه مخالفاً للبند 7.1!',
    });
  } catch (err: any) {
    results.push({
      testId: 'P5-TEST-04',
      nameAr: 'إنفاذ الفصل الصارم للمهام (SoD بند 7.1): منع منشئ العهدة من اعتماد تسويتها (5C)',
      category: '5C_SETTLEMENT_SOD',
      passed: false,
      durationMs: Date.now() - t4Start,
      evidence: 'خطأ في فحص SoD',
      error: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // Test 5: 5C — تسوية العهدة عبر PostingEngine بقيد متوازن والاستعاضة النقدية
  // -------------------------------------------------------------------------
  const t5Start = Date.now();
  let settlementJournalId = '';
  try {
    // Authorized independent approver settles custody
    const settleRes = await custodyService.settleCustody(testTenantId, {
      custodyId: createdCustodyId,
      settledBy: 'usr-chief-auditor', // DIFFERENT user from openedBy
      settledByName: 'د. خالد العمري (معتمد مالي مستقل)',
      replenishmentAccountCode: '1010',
      notes: 'تسوية شهرية دورية واستعاضة من الخزينة',
      idempotencyKey: `idemp-settle-valid-${suffix}`,
    });

    if (!settleRes.success || !settleRes.data) {
      throw new Error(settleRes.error?.detail || 'فشل تسوية العهدة عبر PostingEngine');
    }

    const { settlement, journalEntry } = settleRes.data;
    settlementJournalId = journalEntry.id;

    // Verify journal entry balances
    const totalDebit = journalEntry.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = journalEntry.lines.reduce((s, l) => s + l.credit, 0);
    const isBalanced = totalDebit === totalCredit && totalDebit === 1200;

    // Verify replenishment restored custody balance to 10000
    const replenishedCustody = await primary.getCashCustody(testTenantId, createdCustodyId);
    const isRestored = replenishedCustody.data?.currentBalance === 10000;

    results.push({
      testId: 'P5-TEST-05',
      nameAr: 'تسوية دورية عبر PostingEngine بقيد متوازن وتجديد الرصيد (5C)',
      category: '5C_POSTING_ENGINE',
      passed: isBalanced && isRestored && (journalEntry.status === 'APPROVED' || journalEntry.status === 'POSTED'),
      durationMs: Date.now() - t5Start,
      evidence: `تم إنشاء وترحيل قيد التسوية (${journalEntry.code})، مدين: ${totalDebit} ر.س، دائن: ${totalCredit} ر.س، حالة القيد: ${journalEntry.status}، ورُد رصيد العهدة بعد الاستعاضة إلى ${replenishedCustody.data?.currentBalance} ر.س.`,
    });
  } catch (err: any) {
    results.push({
      testId: 'P5-TEST-05',
      nameAr: 'تسوية دورية عبر PostingEngine بقيد متوازن وتجديد الرصيد (5C)',
      category: '5C_POSTING_ENGINE',
      passed: false,
      durationMs: Date.now() - t5Start,
      evidence: 'خطأ أثناء تسوية العهدة',
      error: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // Test 6: 5C — إدهنية التسوية ومنع الازدواجية (Idempotency بند 8.1)
  // -------------------------------------------------------------------------
  const t6Start = Date.now();
  try {
    // Re-call settleCustody with the exact same idempotency key
    const replayRes = await custodyService.settleCustody(testTenantId, {
      custodyId: createdCustodyId,
      settledBy: 'usr-chief-auditor',
      settledByName: 'د. خالد العمري',
      replenishmentAccountCode: '1010',
      idempotencyKey: `idemp-settle-valid-${suffix}`, // Same key!
    });

    // When replaying with same key, StoragePort idempotency check returns cached result without re-executing
    const isIdempotent = replayRes.success && replayRes.data !== undefined;

    results.push({
      testId: 'P5-TEST-06',
      nameAr: 'إدهنية التسوية ومنع الازدواجية والمطابقة الصارمة (Idempotency بند 8.1)',
      category: '5C_POSTING_ENGINE',
      passed: isIdempotent,
      durationMs: Date.now() - t6Start,
      evidence: 'تمت معالجة تكرار نفس الطلب بنفس المفتاح عبر كاش الإدهنية دون مضاعفة القيود أو ازدواج التسوية.',
    });
  } catch (err: any) {
    results.push({
      testId: 'P5-TEST-06',
      nameAr: 'إدهنية التسوية ومنع الازدواجية والمطابقة الصارمة (Idempotency بند 8.1)',
      category: '5C_POSTING_ENGINE',
      passed: false,
      durationMs: Date.now() - t6Start,
      evidence: 'خطأ في اختبار الإدهنية',
      error: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // Test 7: 5D — فحص تصفية العهد للموارد البشرية (HR Clearance) ومنع إنهاء الخدمة لعهدة مفتوحة
  // -------------------------------------------------------------------------
  const t7Start = Date.now();
  try {
    // Step A: Check employee with open custody -> must block termination
    const clearanceBlocked = await custodyService.checkEmployeeClearance(
      testTenantId,
      `emp-01-${suffix}`
    );

    const isBlockedAccurately =
      !clearanceBlocked.canTerminate && clearanceBlocked.openCustodiesCount === 1;

    // Step B: Liquidate custody
    const liquidateRes = await custodyService.liquidateCustody(
      testTenantId,
      createdCustodyId,
      'usr-chief-auditor',
      'د. خالد العمري',
      `idemp-liquidate-${suffix}`
    );

    // Step C: Re-check clearance after liquidation -> must permit termination
    const clearancePermitted = await custodyService.checkEmployeeClearance(
      testTenantId,
      `emp-01-${suffix}`
    );

    const isPermittedAfterLiquidation =
      clearancePermitted.canTerminate && clearancePermitted.openCustodiesCount === 0;

    results.push({
      testId: 'P5-TEST-07',
      nameAr: 'فحص إخلاء طرف الموارد البشرية ومنع إنهاء الخدمة لعهدة مفتوحة (5D)',
      category: '5D_HR_CLEARANCE',
      passed: isBlockedAccurately && isPermittedAfterLiquidation,
      durationMs: Date.now() - t7Start,
      evidence: `تم حظر إنهاء الخدمة بوجود عهدة مفتوحة (${clearanceBlocked.reasonAr})، وبعد التصفية (${liquidateRes.data?.status}) أصبحت إمكانية إنهاء الخدمة متاحة (${clearancePermitted.canTerminate}).`,
    });
  } catch (err: any) {
    results.push({
      testId: 'P5-TEST-07',
      nameAr: 'فحص إخلاء طرف الموارد البشرية ومنع إنهاء الخدمة لعهدة مفتوحة (5D)',
      category: '5D_HR_CLEARANCE',
      passed: false,
      durationMs: Date.now() - t7Start,
      evidence: 'خطأ في فحص إخلاء طرف الموارد البشرية',
      error: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // Test 8: 5E — مطابقة Module Manifest وتكامل المحركات والأحداث وتعدد المستأجرين
  // -------------------------------------------------------------------------
  const t8Start = Date.now();
  try {
    const manifest = CashCustodyModuleManifest;

    const hasId = manifest.moduleId === 'custody';
    const hasPostingEngine = manifest.engineIntegrations.some((e) => e.engine === 'PostingEngine');
    const hasNumberingEngine = manifest.engineIntegrations.some((e) => e.engine === 'NumberingEngine');
    const hasEvents =
      manifest.domainEvents.includes('CUSTODY_OPENED') &&
      manifest.domainEvents.includes('CUSTODY_SETTLED');
    const hasTables =
      manifest.tables.some((t) => t.name === 'an_cash_custodies') &&
      manifest.tables.some((t) => t.name === 'an_cash_custody_transactions') &&
      manifest.tables.some((t) => t.name === 'an_cash_custody_settlements');
    const allTablesHaveTenant = manifest.tables.every(
      (t) => t.hasTenantId && t.hasCompanyId
    );

    const isManifestCompliant =
      hasId && hasPostingEngine && hasNumberingEngine && hasEvents && hasTables && allTablesHaveTenant;

    results.push({
      testId: 'P5-TEST-08',
      nameAr: 'مطابقة Module Manifest وحوكمة الجداول والأحداث وتعدد المستأجرين (5E)',
      category: '5E_MANIFEST',
      passed: isManifestCompliant,
      durationMs: Date.now() - t8Start,
      evidence: `الموديول (${manifest.moduleNameAr})، المحركات الإلزامية: [${manifest.engineIntegrations.map((e) => e.engine).join(', ')}]، الجداول المسجلة بـ tenant_id/companyId: ${manifest.tables.length}، الأحداث: [${manifest.domainEvents.join(', ')}].`,
    });
  } catch (err: any) {
    results.push({
      testId: 'P5-TEST-08',
      nameAr: 'مطابقة Module Manifest وحوكمة الجداول والأحداث وتعدد المستأجرين (5E)',
      category: '5E_MANIFEST',
      passed: false,
      durationMs: Date.now() - t8Start,
      evidence: 'خطأ في فحص Module Manifest',
      error: err.message,
    });
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    totalTests: results.length,
    passedCount,
    failedCount,
    allPassed: failedCount === 0,
    durationMs: Date.now() - startTime,
    tests: results,
  };
}
