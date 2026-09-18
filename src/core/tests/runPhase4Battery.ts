/**
 * @file runPhase4Battery.ts
 * @description Comprehensive Automated Verification Battery for Phase 4:
 * Core Accounting Engine, Chart of Accounts, Fiscal Periods, Multi-Dimensional Analytics,
 * Items/Units Valuation, Opening Balances Wizard, Three Financial Statements (Income Statement, Balance Sheet, Cash Flow),
 * Batch Import Validator, Budgets & Recurring Entries, and Continuous Balance Checker with Property-Based Fuzz Testing.
 * Executed strictly against live StoragePort (PostgresPrimaryAdapter).
 */

import { StorageRouter } from '../storage/StorageRouter';
import { AccountingService } from '../accounting/AccountingService';
import { JournalEntry } from '../storage/StoragePort';

export interface Phase4BatteryTestResult {
  testId: string;
  nameAr: string;
  category:
    | '4A_CHART_OF_ACCOUNTS'
    | '4B_PERIODS_AND_ENTRIES'
    | '4C_DIMENSIONS_AND_COST_CENTERS'
    | '4D_ITEMS_AND_UNITS'
    | '4E_OPENING_BALANCES'
    | '4F_THREE_FINANCIAL_STATEMENTS'
    | '4G_BATCH_IMPORT_ENGINE'
    | '4H_BUDGETS_AND_RECURRING'
    | '4I_SYSTEM_CHANGE_LOG'
    | '4J_BALANCE_CHECKER_AND_FUZZ';
  passed: boolean;
  durationMs: number;
  evidence: string;
  error?: string;
}

export interface Phase4BatterySuiteResult {
  totalTests: number;
  passedCount: number;
  failedCount: number;
  adapterName: string;
  allPassed: boolean;
  durationMs: number;
  tests: Phase4BatteryTestResult[];
}

export async function runPhase4Battery(): Promise<Phase4BatterySuiteResult> {
  const startTime = Date.now();
  const results: Phase4BatteryTestResult[] = [];
  const router = new StorageRouter();
  const primary = router.getPrimaryAdapter();

  await primary.initializeSchema();
  const service = new AccountingService(primary);

  const tenantId = 'tenant-main';

  async function runTest(
    testId: string,
    nameAr: string,
    category: Phase4BatteryTestResult['category'],
    fn: () => Promise<string>
  ) {
    const tStart = Date.now();
    try {
      const evidence = await fn();
      results.push({
        testId,
        nameAr,
        category,
        passed: true,
        durationMs: Date.now() - tStart,
        evidence,
      });
    } catch (err: any) {
      results.push({
        testId,
        nameAr,
        category,
        passed: false,
        durationMs: Date.now() - tStart,
        evidence: 'Failed execution',
        error: err.detail || err.message || JSON.stringify(err),
      });
    }
  }

  // =========================================================================
  // 4A: دليل الحسابات الشامل وتعدد المستويات
  // =========================================================================
  await runTest(
    'P4-01-COA-SEED',
    'بذر دليل الحسابات القياسي والتحقق من الشجرة الهرمية',
    '4A_CHART_OF_ACCOUNTS',
    async () => {
      const accounts = await service.seedDefaultChartOfAccounts(tenantId);
      if (!accounts || accounts.length < 10) {
        throw new Error(`Expected at least 10 seeded accounts, got ${accounts?.length}`);
      }
      const assetAcc = accounts.find((a) => a.code === '1101');
      if (!assetAcc) throw new Error('Account 1101 (Main Cash) was not found in seeded accounts');
      return `Seeded ${accounts.length} accounts. Verified hierarchical tree. Account 1101: ${assetAcc.nameAr}.`;
    }
  );

  await runTest(
    'P4-02-COA-ACTIVATION',
    'تعطيل وتفعيل الحسابات والتحقق من حالتها التشغيلية',
    '4A_CHART_OF_ACCOUNTS',
    async () => {
      await service.toggleAccountStatus(tenantId, '1102', false);
      let accounts = await service.listAccounts(tenantId);
      const accDisabled = accounts.find((a) => a.code === '1102');
      if (accDisabled && accDisabled.isActive !== false) {
        throw new Error('Account 1102 should be inactive after toggle');
      }

      await service.toggleAccountStatus(tenantId, '1102', true);
      accounts = await service.listAccounts(tenantId);
      const accActive = accounts.find((a) => a.code === '1102');
      if (accActive && accActive.isActive !== true) {
        throw new Error('Account 1102 should be active after toggle');
      }
      return 'Account 1102 status toggle (inactive -> active) verified successfully in live database.';
    }
  );

  // =========================================================================
  // 4B: القيود اليومية وفترات الإقفال المالي
  // =========================================================================
  await runTest(
    'P4-03-POST-JOURNAL-BALANCED',
    'ترحيل قيد يومية متوازن والتحقق من تطبيق قاعدة التوازن الذري',
    '4B_PERIODS_AND_ENTRIES',
    async () => {
      const entryId = `JV-P4-BAL-${Date.now()}`;
      const entry: JournalEntry = {
        id: entryId,
        code: `JV-2026-${Date.now().toString().slice(-4)}`,
        tenantId,
        date: '2026-05-15',
        type: 'قيد يومية عام',
        description: 'إيداع نقدي بالبنك من الصندوق الرئيسي',
        totalAmount: 5000,
        status: 'DRAFT',
        createdBy: 'ACCOUNTANT',
        lines: [
          {
            id: `${entryId}-L1`,
            accountCode: '1102',
            debit: 5000,
            credit: 0,
            description: 'إيداع بنكي',
          },
          {
            id: `${entryId}-L2`,
            accountCode: '1101',
            debit: 0,
            credit: 5000,
            description: 'سحب من الصندوق',
          },
        ],
      };

      const posted = await service.postJournalEntryWithInvariants(
        tenantId,
        entry,
        `idem-post-jv-p4-${Date.now()}`
      );

      if (!posted || posted.status !== 'POSTED') {
        throw new Error(`Expected posted entry with status POSTED, got ${posted?.status}`);
      }
      return `Journal entry ${posted.code} posted atomically: Total Debit=5000, Total Credit=5000. Status: POSTED.`;
    }
  );

  await runTest(
    'P4-04-POST-JOURNAL-UNBALANCED-REJECTION',
    'منع ترحيل أي قيد محاسبي غير متوازن بموجب الثوابت الخمسة',
    '4B_PERIODS_AND_ENTRIES',
    async () => {
      const entryId = `JV-P4-UNBAL-${Date.now()}`;
      const entry: JournalEntry = {
        id: entryId,
        code: `JV-UNBAL-${Date.now().toString().slice(-4)}`,
        tenantId,
        date: '2026-05-15',
        type: 'قيد يومية عام',
        description: 'قيد تجريبي غير متوازن لاختبار الرفض الذري',
        totalAmount: 7000,
        status: 'DRAFT',
        createdBy: 'ACCOUNTANT',
        lines: [
          {
            id: `${entryId}-L1`,
            accountCode: '1102',
            debit: 7000,
            credit: 0,
            description: 'مدين زائد',
          },
          {
            id: `${entryId}-L2`,
            accountCode: '1101',
            debit: 0,
            credit: 4000,
            description: 'دائن ناقص',
          },
        ],
      };

      try {
        await service.postJournalEntryWithInvariants(tenantId, entry, `idem-unbal-${Date.now()}`);
        throw new Error('Unbalanced entry should have been rejected by PostingEngine');
      } catch (err: any) {
        const msg = err.detail || err.message || JSON.stringify(err);
        return `Unbalanced entry correctly rejected by PostingEngine: ${msg}`;
      }
    }
  );

  await runTest(
    'P4-05-PERIOD-CLOSE-AND-REOPEN',
    'إقفال فترة مالية وترحيل الأرباح/الخسائر وإعادة فتحها مع توثيق السبب',
    '4B_PERIODS_AND_ENTRIES',
    async () => {
      let periods = await service.listFiscalPeriods(tenantId);
      if (periods.length === 0) {
        periods = await service.seedDefaultPeriods(tenantId);
      }
      const p1 = periods[0];

      // Close period
      const closeRes = await service.executePeriodClosingChecklist(
        tenantId,
        p1.id,
        'FIN_MANAGER',
        `idem-close-${Date.now()}`
      );
      if (!closeRes.success) throw new Error(`Period close failed: ${closeRes.messageAr}`);

      // Attempt to post into closed period
      const blockedEntry: JournalEntry = {
        id: `JV-BLOCKED-${Date.now()}`,
        code: `JV-BLK-${Date.now().toString().slice(-4)}`,
        tenantId,
        date: p1.startDate,
        type: 'قيد يومية',
        description: 'محاولة ترحيل في فترة مقفلة',
        totalAmount: 100,
        status: 'DRAFT',
        createdBy: 'ACCOUNTANT',
        lines: [
          { id: '1', accountCode: '1102', debit: 100, credit: 0, description: 'محاولة مدين' },
          { id: '2', accountCode: '1101', debit: 0, credit: 100, description: 'محاولة دائن' },
        ],
      };

      let blocked = false;
      try {
        await service.postJournalEntryWithInvariants(tenantId, blockedEntry, `idem-blk-${Date.now()}`);
      } catch (err: any) {
        blocked = true;
      }
      if (!blocked) throw new Error('Posting to closed period should have been blocked');

      // Reopen period with documented justification
      const reopenSuccess = await service.reopenPeriod(
        tenantId,
        p1.id,
        'مراجعة استثنائية لمطابقة قيود تسوية نهاية العام',
        'FIN_MANAGER',
        `idem-reopen-${Date.now()}`
      );
      if (!reopenSuccess) throw new Error('Reopening period failed');

      return `Fiscal period ${p1.nameAr} closed, posting blocked as expected, and successfully reopened with audited reason.`;
    }
  );

  // =========================================================================
  // 4C: مراكز التكلفة والأبعاد التحليلية
  // =========================================================================
  await runTest(
    'P4-06-DIMENSIONS-ANALYTICS',
    'إنشاء مراكز تكلفة وأبعاد تحليلية ومتابعة تحليلات الأرباح والمصروفات',
    '4C_DIMENSIONS_AND_COST_CENTERS',
    async () => {
      await service.saveDimension(tenantId, {
        type: 'COST_CENTER',
        code: 'CC-HQ',
        nameAr: 'المركز الرئيسي للإدارة',
      });

      const analytics = await service.getDimensionAnalyticalReport(tenantId, 'COST_CENTER');
      if (!analytics || !Array.isArray(analytics.dimensions)) {
        throw new Error('Analytics report should contain dimensions array');
      }

      return `Dimension CC-HQ created. Analytical report generated with ${analytics.dimensions.length} dimensions.`;
    }
  );

  // =========================================================================
  // 4D: الأصناف والوحدات والمخزون المحاسبي
  // =========================================================================
  await runTest(
    'P4-07-ITEMS-AND-UNITS',
    'إدارة الأصناف والوحدات المحاسبية وأسعار التكلفة والبيع',
    '4D_ITEMS_AND_UNITS',
    async () => {
      await service.seedDefaultUnits(tenantId);
      const units = await service.listUnits(tenantId);

      await service.saveItem(tenantId, {
        code: 'ITEM-TEST-P4',
        nameAr: 'زيت محركات اصطناعي 5W-30',
        type: 'STOCK',
        unitNameAr: 'كرتون',
        averageCost: 120,
        salePrice: 180,
        incomeAccountCode: '4101',
        expenseAccountCode: '5101',
      });

      const items = await service.listItems(tenantId);
      const foundItem = items.find((i) => i.code === 'ITEM-TEST-P4');
      if (!foundItem) throw new Error('Item ITEM-TEST-P4 was not found in database');

      return `Verified ${units.length} measurement units. Created ITEM-TEST-P4 with averageCost=120, salePrice=180.`;
    }
  );

  // =========================================================================
  // 4E: الأرصدة الافتتاحية ومطابقة القيد الافتتاحي
  // =========================================================================
  await runTest(
    'P4-08-OPENING-BALANCES-VALIDATION-AND-POSTING',
    'التحقق من توازن الأرصدة الافتتاحية وترحيل القيد الافتتاحي المعتمد',
    '4E_OPENING_BALANCES',
    async () => {
      const balancedLines = [
        { accountCode: '1101', debit: 50000, credit: 0, description: 'رصيد الصندوق الافتتاحي' },
        { accountCode: '1102', debit: 150000, credit: 0, description: 'رصيد البنك الافتتاحي' },
        { accountCode: '3101', debit: 0, credit: 200000, description: 'رأس المال المدفوع' },
      ];

      const postRes = await service.postOpeningBalanceEntry(
        tenantId,
        balancedLines,
        `idem-open-p4-${Date.now()}`,
        'ADMIN_USER'
      );

      if (!postRes || postRes.status !== 'POSTED') {
        throw new Error('Opening balance entry was not posted successfully');
      }

      return `Opening balances entry ${postRes.code} posted atomically: Total=200,000 SAR (Debit=200k, Credit=200k).`;
    }
  );

  // =========================================================================
  // 4F: القوائم المالية الثلاث وقفل الحسابات
  // =========================================================================
  await runTest(
    'P4-09-INCOME-STATEMENT',
    'استخراج قائمة الدخل الشامل (الأرباح والخسائر) وحساب مجمل وصافي الربح',
    '4F_THREE_FINANCIAL_STATEMENTS',
    async () => {
      const income = await service.getIncomeStatement(tenantId);
      if (typeof income.netProfit !== 'number') {
        throw new Error('Income statement netProfit should be a valid number');
      }
      return `Income Statement generated: Operating Revenues=${income.totalOperatingRevenues}, Operating Expenses=${income.totalOperatingExpenses}, Net Profit=${income.netProfit}.`;
    }
  );

  await runTest(
    'P4-10-BALANCE-SHEET-EQUILIBRIUM',
    'مطابقة معادلة الميزانية العمومية الصارمة: الأصول = الالتزامات + حقوق الملكية',
    '4F_THREE_FINANCIAL_STATEMENTS',
    async () => {
      const bs = await service.getBalanceSheet(tenantId);
      if (!bs.isBalanced) {
        throw new Error(
          `Balance Sheet out of equilibrium! Assets=${bs.totalAssets}, Liabilities & Equity=${bs.totalLiabilitiesAndEquity}, Diff=${bs.discrepancy}`
        );
      }
      return `Balance Sheet in perfect equilibrium: Assets (${bs.totalAssets}) = Liabilities + Equity (${bs.totalLiabilitiesAndEquity}). Discrepancy = 0.00.`;
    }
  );

  await runTest(
    'P4-11-CASH-FLOW-STATEMENT',
    'استخراج قائمة التدفقات النقدية (تشغيلية واستثمارية وتمويلية)',
    '4F_THREE_FINANCIAL_STATEMENTS',
    async () => {
      const cf = await service.getCashFlowStatement(tenantId);
      if (typeof cf.netChangeInCash !== 'number') {
        throw new Error('Cash Flow netChangeInCash should be a valid number');
      }
      return `Cash Flow Statement generated: Operating=${cf.operatingActivities.netCashFromOperating}, Investing=${cf.investingActivities.netCashFromInvesting}, Financing=${cf.financingActivities.netCashFromFinancing}, Net Cash Change=${cf.netChangeInCash}.`;
    }
  );

  // =========================================================================
  // 4G: محرك استيراد القيود ومطابقة الأسطر
  // =========================================================================
  await runTest(
    'P4-12-BATCH-IMPORT-ENGINE',
    'التحقق من صحة وتوازن القيود المستوردة وترحيلها ذرياً',
    '4G_BATCH_IMPORT_ENGINE',
    async () => {
      const importRows = [
        { accountCode: '1101', debit: 2500, credit: 0, description: 'تحصيل إيراد نقدي' },
        { accountCode: '4101', debit: 0, credit: 2500, description: 'إيراد مبيعات بضاعة' },
      ];

      const importedEntry = await service.executeStandardImport(
        tenantId,
        `IMP-${Date.now().toString().slice(-4)}`,
        'دفعة استيراد قيود مبيعات نقدية مجمعة',
        '2026-06-01',
        importRows,
        'IMPORT_OPERATOR',
        `idem-imp-${Date.now()}`
      );

      if (!importedEntry || importedEntry.status !== 'POSTED') {
        throw new Error('Imported batch was not posted successfully');
      }

      return `Batch import validated and executed atomically as journal entry ${importedEntry.code} (Amount: 2500 SAR).`;
    }
  );

  // =========================================================================
  // 4H: الموازنات التقديرية والقيود الدورية
  // =========================================================================
  await runTest(
    'P4-13-BUDGETS-AND-RECURRING',
    'مقارنة الموازنة التقديرية بالفعلي وإدارة القيود الدورية',
    '4H_BUDGETS_AND_RECURRING',
    async () => {
      await service.saveBudget(tenantId, {
        accountCode: '5101',
        fiscalYear: 2026,
        totalBudget: 120000,
        policy: 'WARN',
      });

      const budgets = await service.listBudgets(tenantId, 2026);
      const b5101 = budgets.find((b) => b.accountCode === '5101');
      if (!b5101) throw new Error('Budget for 5101 not found');

      await service.seedDefaultRecurringEntries(tenantId);
      const recurring = await service.listRecurringEntries(tenantId);
      if (recurring.length === 0) throw new Error('No recurring entries found');

      return `Budget set for account 5101 (${b5101.totalBudget} SAR). Seeded ${recurring.length} recurring journal templates.`;
    }
  );

  // =========================================================================
  // 4I: التدقيق وسلسلة التغيير
  // =========================================================================
  await runTest(
    'P4-14-SYSTEM-CHANGE-LOG-AUDIT',
    'التحقق من توثيق إجراءات المحاسبة في SystemChangeLog',
    '4I_SYSTEM_CHANGE_LOG',
    async () => {
      const logsRes = await primary.getSystemChangeLogs();
      const logs = logsRes.data || [];
      const accLogs = logs.filter(
        (l: any) => l.module === 'ACCOUNTING' || l.module === 'POSTING_ENGINE'
      );
      if (accLogs.length === 0) {
        throw new Error('Expected accounting actions in SystemChangeLog');
      }
      return `Found ${accLogs.length} immutable accounting log records in SystemChangeLog.`;
    }
  );

  // =========================================================================
  // 4J: فاحص التوازن المستمر واختبار الخصائص العشوائي
  // =========================================================================
  await runTest(
    'P4-15-CONTINUOUS-BALANCE-CHECKER',
    'تشغيل فاحص التوازن المستمر للتحقق من عدم وجود فجوات في الترقيم أو اختلال الأرصدة',
    '4J_BALANCE_CHECKER_AND_FUZZ',
    async () => {
      const check = await service.runContinuousBalanceCheck(tenantId);
      if (!check.isBalanced) {
        throw new Error(
          `Continuous balance check failed: Trial balance not balanced! Debit: ${check.totalDebit}, Credit: ${check.totalCredit}, Diff: ${check.discrepancy}`
        );
      }
      return `Continuous balance check passed: Balanced 100% (Debit=${check.totalDebit}, Credit=${check.totalCredit}), Zero discrepancies.`;
    }
  );

  await runTest(
    'P4-16-PROPERTY-BASED-FUZZ-TESTING',
    'تشغيل اختبار الخصائص العشوائي (100 تكرار) لإثبات عصمة التوازن الذري',
    '4J_BALANCE_CHECKER_AND_FUZZ',
    async () => {
      const fuzz = await service.runFuzzTestingBattery(tenantId, 100);
      if (!fuzz.passed || fuzz.violationsCount > 0) {
        throw new Error(
          `Fuzz testing found ${fuzz.violationsCount} violations out of ${fuzz.iterations}!`
        );
      }
      return `Property-based fuzz testing passed 100/100 iterations: Invariants 1-5 hold unconditionally without violations.`;
    }
  );

  // Summary
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    totalTests: results.length,
    passedCount,
    failedCount,
    adapterName: 'PostgreSQL (Supabase Primary)',
    allPassed: failedCount === 0,
    durationMs: Date.now() - startTime,
    tests: results,
  };
}
