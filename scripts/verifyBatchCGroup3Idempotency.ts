import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import {
  ExpenseRequest,
  ExpenseLine,
  ExpenseAttachment,
} from '../src/core/storage/StoragePort';
import { ExpenseService } from '../src/core/modules/expenses/ExpenseService';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { ApprovalEngine } from '../src/core/engines/ApprovalEngine';
import dotenv from 'dotenv';
dotenv.config();

function randSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function main() {
  console.log('========================================================================');
  console.log('    A.N ERP v7.2 — BATCH (C) GROUP 3 IDEMPOTENCY & EFFECTS SUITE       ');
  console.log('         (createExpenseRequest & updateExpenseRequestStatus)            ');
  console.log('========================================================================\n');

  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const pool = (adapter as any).pool;
  const tenantId = 'tenant-main';

  const postingEngine = new PostingEngine(adapter);
  const numberingEngine = new NumberingEngine(adapter);
  const approvalEngine = new ApprovalEngine(adapter);
  const expenseService = new ExpenseService(adapter, postingEngine, numberingEngine, approvalEngine);

  // ---------------------------------------------------------------------------
  // 1) TEST createExpenseRequest: Parallel calls, single persistence, replay
  // ---------------------------------------------------------------------------
  console.log('--- 1. TESTING createExpenseRequest (Parallel requests, exact counts, replay) ---');
  const suf1 = randSuffix();
  const keyCreate = `key-exp-create-${suf1}`;
  const reqId1 = `exp-req-${suf1}`;
  const reqCode1 = `EXP-${suf1}`.slice(0, 32);

  const requestObj1: ExpenseRequest = {
    id: reqId1,
    tenantId,
    companyId: tenantId,
    requestCode: reqCode1,
    titleAr: 'شراء قرطاسية ومستلزمات مكتبية',
    employeeId: 'EMP-01',
    employeeName: 'أحمد المحاسب',
    department: 'المالية',
    costCenterId: 'CC-HQ',
    projectId: 'PRJ-OPS',
    totalAmount: 1500.00,
    currency: 'SAR',
    paymentMethod: 'DIRECT_BANK_TRANSFER',
    disbursementAccountCode: '1020',
    status: 'SUBMITTED',
    currentApprovalTier: 'L1',
    submittedBy: 'USR-AHMED',
    submittedByName: 'أحمد المحاسب',
    submittedAt: new Date().toISOString(),
    notes: 'مستلزمات للربع الأول',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    idempotencyKey: keyCreate,
  };

  const linesObj1: ExpenseLine[] = [
    {
      id: `expl-${suf1}-1`,
      tenantId,
      companyId: tenantId,
      requestId: reqId1,
      categoryId: 'cat-office',
      categoryNameAr: 'أدوات مكتبية',
      expenseAccountCode: '5040',
      description: 'أوراق تصوير وأحبار طابعات',
      amount: 900.00,
      costCenterId: 'CC-HQ',
      projectId: 'PRJ-OPS',
      invoiceNumber: 'INV-OFF-01',
      invoiceDate: '2026-09-30',
      createdAt: new Date().toISOString(),
    },
    {
      id: `expl-${suf1}-2`,
      tenantId,
      companyId: tenantId,
      requestId: reqId1,
      categoryId: 'cat-office',
      categoryNameAr: 'أدوات مكتبية',
      expenseAccountCode: '5040',
      description: 'ملفات وأدوات حفظ مستندات',
      amount: 600.00,
      costCenterId: 'CC-HQ',
      projectId: 'PRJ-OPS',
      invoiceNumber: 'INV-OFF-02',
      invoiceDate: '2026-09-30',
      createdAt: new Date().toISOString(),
    },
  ];

  const attachmentsObj1: ExpenseAttachment[] = [
    {
      id: `att-${suf1}-1`,
      tenantId,
      companyId: tenantId,
      requestId: reqId1,
      lineId: `expl-${suf1}-1`,
      fileName: 'فاتورة_مكتبية.pdf',
      fileUrl: '/uploads/inv-off.pdf',
      fileType: 'application/pdf',
      fileSizeBytes: 125000,
      uploadedBy: 'USR-AHMED',
      uploadedAt: new Date().toISOString(),
    },
  ];

  // Two parallel calls with the exact same idempotency key
  const [resCreate1, resCreate2] = await Promise.all([
    adapter.createExpenseRequest(tenantId, requestObj1, linesObj1, attachmentsObj1, keyCreate),
    adapter.createExpenseRequest(tenantId, requestObj1, linesObj1, attachmentsObj1, keyCreate),
  ]);

  const countReqInDb = Number((await pool.query('SELECT count(*)::int as c FROM an_expense_requests WHERE id = $1', [reqId1])).rows[0].c);
  const countLinesInDb = Number((await pool.query('SELECT count(*)::int as c FROM an_expense_lines WHERE request_id = $1', [reqId1])).rows[0].c);
  const countAttsInDb = Number((await pool.query('SELECT count(*)::int as c FROM an_expense_attachments WHERE request_id = $1', [reqId1])).rows[0].c);

  console.log(`[createExpenseRequest Parallel] Call 1 Success: ${resCreate1.success}, Call 2 Success: ${resCreate2.success}`);
  console.log(`[createExpenseRequest Parallel] DB Requests: ${countReqInDb} (Expected 1), Lines: ${countLinesInDb} (Expected 2), Attachments: ${countAttsInDb} (Expected 1)`);

  if (!resCreate1.success || !resCreate2.success || countReqInDb !== 1 || countLinesInDb !== 2 || countAttsInDb !== 1) {
    throw new Error('createExpenseRequest parallel test failed: duplicated request rows, lines, or attachments in DB');
  }

  // Sequential replay with the same key
  const resCreateReplay = await adapter.createExpenseRequest(tenantId, requestObj1, linesObj1, attachmentsObj1, keyCreate);
  const countReqAfterReplay = Number((await pool.query('SELECT count(*)::int as c FROM an_expense_requests WHERE id = $1', [reqId1])).rows[0].c);
  const countLinesAfterReplay = Number((await pool.query('SELECT count(*)::int as c FROM an_expense_lines WHERE request_id = $1', [reqId1])).rows[0].c);
  const countAttsAfterReplay = Number((await pool.query('SELECT count(*)::int as c FROM an_expense_attachments WHERE request_id = $1', [reqId1])).rows[0].c);

  console.log(`[createExpenseRequest Replay] Success: ${resCreateReplay.success}, DB Requests: ${countReqAfterReplay} (Constant 1), Lines: ${countLinesAfterReplay} (Constant 2), Attachments: ${countAttsAfterReplay} (Constant 1)`);
  if (!resCreateReplay.success || countReqAfterReplay !== 1 || countLinesAfterReplay !== 2 || countAttsAfterReplay !== 1) {
    throw new Error('createExpenseRequest sequential replay distorted database counts or failed');
  }
  console.log('✓ createExpenseRequest: SAVED EXACTLY ONCE WITH CORRECT LINES & ATTACHMENTS (ZERO DUPLICATION)\n');

  // ---------------------------------------------------------------------------
  // 2) TEST updateExpenseRequestStatus (Approval with Automated Posting via PostingEngine)
  // ---------------------------------------------------------------------------
  console.log('--- 2. TESTING updateExpenseRequestStatus with Auto-Posting (Parallel, Status, Balanced GL, Single Entry) ---');

  // Helper to get balances of debit (5040) and credit (1020) accounts
  const getBalances = async () => {
    const expRow = (await pool.query("SELECT debit_balance, credit_balance FROM an_accounts WHERE tenant_id = $1 AND code = '5040'", [tenantId])).rows[0];
    const bnkRow = (await pool.query("SELECT debit_balance, credit_balance FROM an_accounts WHERE tenant_id = $1 AND code = '1020'", [tenantId])).rows[0];
    return {
      expenseDebit: Number(expRow.debit_balance),
      bankCredit: Number(bnkRow.credit_balance),
    };
  };

  const initialBalances = await getBalances();
  console.log(`[Before Approval] Expense 5040 Debit: ${initialBalances.expenseDebit.toFixed(2)}, Bank 1020 Credit: ${initialBalances.bankCredit.toFixed(2)}`);

  // Approval payload via ExpenseService
  const keyApprove = `key-exp-approve-${suf1}`;
  const approveCall = () => expenseService.approveL1(tenantId, {
    requestId: reqId1,
    approverId: 'USR-MGR-SALAH', // Independent approver (SoD compliant)
    approverName: 'صلاح مدير الإدارة',
    notes: 'معتمد نظامياً بعد مراجعة المرفقات',
    idempotencyKey: keyApprove,
  });

  // Run 2 parallel approvals with the same idempotency key
  const [resAppr1, resAppr2] = await Promise.all([approveCall(), approveCall()]);

  const finalReqRow = (await pool.query('SELECT status, approved_by, journal_entry_id FROM an_expense_requests WHERE id = $1', [reqId1])).rows[0];
  const finalBalances = await getBalances();

  // Check journal entries associated with this expense request
  const jeRows = (await pool.query(
    "SELECT id, total_amount, status FROM an_journal_entries WHERE tenant_id = $1 AND id = $2",
    [tenantId, finalReqRow.journal_entry_id]
  )).rows;

  // Check lines of the auto-posted journal entry
  const jeLineRows = (await pool.query(
    "SELECT account_code, debit, credit FROM an_journal_lines WHERE entry_id = $1",
    [finalReqRow.journal_entry_id]
  )).rows;

  const totalDebitLines = jeLineRows.reduce((sum: number, l: any) => sum + Number(l.debit), 0);
  const totalCreditLines = jeLineRows.reduce((sum: number, l: any) => sum + Number(l.credit), 0);

  console.log(`[Approval Parallel] Call 1 Success: ${resAppr1.success}, Call 2 Success: ${resAppr2.success}`);
  console.log(`[Approval Parallel] Request Status: ${finalReqRow.status} (Expected POSTED), Journal Entry ID: ${finalReqRow.journal_entry_id}`);
  console.log(`[Approval Parallel] Journal Entries in DB: ${jeRows.length} (Expected 1), Entry Status: ${jeRows[0]?.status}`);
  console.log(`[Approval Parallel] Entry Balanced Lines: Total Debit = ${totalDebitLines.toFixed(2)}, Total Credit = ${totalCreditLines.toFixed(2)} (Expected 1500.00 each)`);
  console.log(`[Approval Parallel] New Expense 5040 Debit: ${finalBalances.expenseDebit.toFixed(2)} (Delta: +${(finalBalances.expenseDebit - initialBalances.expenseDebit).toFixed(2)})`);
  console.log(`[Approval Parallel] New Bank 1020 Credit: ${finalBalances.bankCredit.toFixed(2)} (Delta: +${(finalBalances.bankCredit - initialBalances.bankCredit).toFixed(2)})`);

  if (
    !resAppr1.success ||
    !resAppr2.success ||
    finalReqRow.status !== 'POSTED' ||
    !finalReqRow.journal_entry_id ||
    jeRows.length !== 1 ||
    totalDebitLines !== 1500.00 ||
    totalCreditLines !== 1500.00 ||
    finalBalances.expenseDebit - initialBalances.expenseDebit !== 1500.00 ||
    finalBalances.bankCredit - initialBalances.bankCredit !== 1500.00
  ) {
    throw new Error('updateExpenseRequestStatus with auto-posting failed: duplicate journal entries or incorrect ledger balances');
  }

  // Sequential replay of updateExpenseRequestStatus with the approval key
  const resApprReplay = await adapter.updateExpenseRequestStatus(
    tenantId,
    reqId1,
    { status: 'APPROVED' },
    keyApprove
  );
  const balancesAfterReplay = await getBalances();
  const jeCountAfterReplay = Number((await pool.query(
    "SELECT count(*)::int as c FROM an_journal_entries WHERE tenant_id = $1 AND id = $2",
    [tenantId, finalReqRow.journal_entry_id]
  )).rows[0].c);

  console.log(`[Approval Replay] Success: ${resApprReplay.success}, Journal Entries Count: ${jeCountAfterReplay} (Constant 1)`);
  console.log(`[Approval Replay] Balances Constant: Expense Debit = ${balancesAfterReplay.expenseDebit.toFixed(2)}, Bank Credit = ${balancesAfterReplay.bankCredit.toFixed(2)}`);

  if (!resApprReplay.success || jeCountAfterReplay !== 1 || balancesAfterReplay.expenseDebit !== finalBalances.expenseDebit || balancesAfterReplay.bankCredit !== finalBalances.bankCredit) {
    throw new Error('updateExpenseRequestStatus sequential replay modified balances or duplicated journal entries');
  }
  console.log('✓ updateExpenseRequestStatus + AUTO-POSTING: STATUS POSTED, JOURNAL ENTRY CREATED ONCE, BALANCES EXACT\n');

  // ---------------------------------------------------------------------------
  // 2.B) Standalone Direct Parallel updateExpenseRequestStatus & Replay
  // ---------------------------------------------------------------------------
  console.log('--- 2.B TESTING DIRECT STANDALONE updateExpenseRequestStatus (Parallel & Replay) ---');
  const sufDirect = randSuffix();
  const reqIdDirect = `exp-dir-${sufDirect}`;
  const keyDirect = `key-dir-update-${sufDirect}`;

  const directReq: ExpenseRequest = {
    id: reqIdDirect,
    tenantId,
    companyId: tenantId,
    requestCode: `DIR-${sufDirect}`.slice(0, 32),
    titleAr: 'طلب فحص التحديث المباشر',
    employeeId: 'EMP-DIR',
    employeeName: 'سعيد التجربة',
    totalAmount: 500.00,
    currency: 'SAR',
    paymentMethod: 'DIRECT_BANK_TRANSFER',
    status: 'SUBMITTED',
    currentApprovalTier: 'L1',
    submittedBy: 'EMP-DIR',
    submittedByName: 'سعيد التجربة',
    submittedAt: new Date().toISOString(),
    notes: 'ملاحظة أولية',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    idempotencyKey: `seed-${keyDirect}`,
  };
  await adapter.createExpenseRequest(tenantId, directReq, [], [], `seed-${keyDirect}`);

  // Two parallel update calls with the same key
  const [resDir1, resDir2] = await Promise.all([
    adapter.updateExpenseRequestStatus(
      tenantId,
      reqIdDirect,
      { notes: 'ملاحظة محدثة ذرياً بالتوازي', currentApprovalTier: 'L2' },
      keyDirect
    ),
    adapter.updateExpenseRequestStatus(
      tenantId,
      reqIdDirect,
      { notes: 'ملاحظة محدثة ذرياً بالتوازي', currentApprovalTier: 'L2' },
      keyDirect
    ),
  ]);

  const rowDirectAfter = (await pool.query('SELECT notes, current_approval_tier, updated_at FROM an_expense_requests WHERE id = $1', [reqIdDirect])).rows[0];
  console.log(`[Direct Update Parallel] Call 1 Success: ${resDir1.success}, Call 2 Success: ${resDir2.success}`);
  console.log(`[Direct Update Parallel] DB Notes: "${rowDirectAfter.notes}", Tier: "${rowDirectAfter.current_approval_tier}"`);

  if (!resDir1.success || !resDir2.success || rowDirectAfter.notes !== 'ملاحظة محدثة ذرياً بالتوازي' || rowDirectAfter.current_approval_tier !== 'L2') {
    throw new Error('Direct updateExpenseRequestStatus parallel call failed');
  }

  // Replay
  const resDirReplay = await adapter.updateExpenseRequestStatus(
    tenantId,
    reqIdDirect,
    { notes: 'ملاحظة محدثة ذرياً بالتوازي', currentApprovalTier: 'L2' },
    keyDirect
  );
  console.log(`[Direct Update Replay] Success: ${resDirReplay.success}, Cached Notes: "${resDirReplay.data?.notes}", Cached Tier: "${resDirReplay.data?.currentApprovalTier}"`);
  if (!resDirReplay.success || resDirReplay.data?.notes !== 'ملاحظة محدثة ذرياً بالتوازي' || resDirReplay.data?.currentApprovalTier !== 'L2') {
    throw new Error('Direct updateExpenseRequestStatus replay failed');
  }
  console.log('✓ DIRECT updateExpenseRequestStatus: PARALLEL CALLS & REPLAY ATOMICALLY VERIFIED\n');

  // ---------------------------------------------------------------------------
  // 3) TEST FAILURES AFTER RESERVATION & RETRY
  // ---------------------------------------------------------------------------
  console.log('--- 3. TESTING FAILURES AFTER RESERVATION (404, SoD 403 L1, SoD 403 Final) & RETRY ---');

  // (3.A) Failure 1: Request not found 404
  const sufFail404 = randSuffix();
  const key404 = `key-fail-404-${sufFail404}`;
  const nonExistentId = `exp-ghost-${sufFail404}`;

  const res404 = await adapter.updateExpenseRequestStatus(
    tenantId,
    nonExistentId,
    { status: 'APPROVED' },
    key404
  );

  console.log(`[3.A Failure 404] Result success: ${res404.success} (Expected false), Error status: ${res404.error?.status} (Expected 404)`);
  if (res404.success || res404.error?.status !== 404) {
    throw new Error('updateExpenseRequestStatus did not return 404 for nonexistent request');
  }

  // Check key is NOT poisoned with IN_PROGRESS
  const inProg404 = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_idempotency_keys WHERE idempotency_key = $1',
    [key404]
  )).rows[0].c);
  console.log(`[3.A Failure 404] Stored idempotency keys in DB: ${inProg404} (Expected 0 - rolled back cleanly)`);
  if (inProg404 !== 0) {
    throw new Error('Idempotency key was poisoned with IN_PROGRESS after 404 error');
  }

  // Now create the missing request
  const ghostRequest: ExpenseRequest = {
    id: nonExistentId,
    tenantId,
    companyId: tenantId,
    requestCode: `GHOST-${sufFail404}`.slice(0, 32),
    titleAr: 'طلب مصروف بديل للتجربة',
    employeeId: 'EMP-GHOST',
    employeeName: 'موظف تجربة',
    totalAmount: 300.00,
    currency: 'SAR',
    paymentMethod: 'DIRECT_BANK_TRANSFER',
    status: 'SUBMITTED',
    currentApprovalTier: 'L1',
    submittedBy: 'USR-GHOST',
    submittedByName: 'موظف تجربة',
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    idempotencyKey: `seed-${key404}`,
  };
  await adapter.createExpenseRequest(tenantId, ghostRequest, [], [], `seed-${key404}`);

  // Retry with the EXACT SAME KEY key404
  const retry404Res = await adapter.updateExpenseRequestStatus(
    tenantId,
    nonExistentId,
    { status: 'APPROVED' },
    key404
  );
  const statusAfterRetry404 = (await pool.query('SELECT status FROM an_expense_requests WHERE id = $1', [nonExistentId])).rows[0]?.status;
  const keyStatus404 = (await pool.query('SELECT status FROM an_idempotency_keys WHERE idempotency_key = $1', [key404])).rows[0]?.status;

  console.log(`[3.A Retry 404] Success: ${retry404Res.success} (Expected true), Status in DB: ${statusAfterRetry404} (Expected APPROVED), Key Status: ${keyStatus404} (Expected COMPLETED)`);
  if (!retry404Res.success || statusAfterRetry404 !== 'APPROVED' || keyStatus404 !== 'COMPLETED') {
    throw new Error('updateExpenseRequestStatus failed on retry with same key after resolving 404');
  }
  console.log('✓ 3.A 404 NOT FOUND: Clean rollback & successful retry with same key verified.\n');

  // (3.B) Failure 2: SoD 403 on L1 Approval (Creator cannot approve their own request)
  const sufSodL1 = randSuffix();
  const keySodL1 = `key-sod-l1-${sufSodL1}`;
  const reqIdSodL1 = `exp-sod-l1-${sufSodL1}`;

  const sodL1Req: ExpenseRequest = {
    id: reqIdSodL1,
    tenantId,
    companyId: tenantId,
    requestCode: `SOD-L1-${sufSodL1}`.slice(0, 32),
    titleAr: 'طلب فحص فصل الصلاحيات L1',
    employeeId: 'EMP-MAKER-01',
    employeeName: 'سامي المنشئ',
    totalAmount: 800.00,
    currency: 'SAR',
    paymentMethod: 'DIRECT_BANK_TRANSFER',
    status: 'SUBMITTED',
    currentApprovalTier: 'L1',
    submittedBy: 'EMP-MAKER-01', // Stored creator
    submittedByName: 'سامي المنشئ',
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    idempotencyKey: `seed-${keySodL1}`,
  };
  await adapter.createExpenseRequest(tenantId, sodL1Req, [], [], `seed-${keySodL1}`);

  // Attempt SoD violation: Creator approves L1
  const resSodL1 = await adapter.updateExpenseRequestStatus(
    tenantId,
    reqIdSodL1,
    {
      status: 'APPROVED_L1',
      currentApprovalTier: 'L2',
      approvedL1By: 'EMP-MAKER-01', // VIOLATION! Creator cannot approve
      approvedL1ByName: 'سامي المنشئ',
      approvedL1At: new Date().toISOString(),
    },
    keySodL1
  );

  console.log(`[3.B SoD L1 Violation] Success: ${resSodL1.success} (Expected false), Error status: ${resSodL1.error?.status} (Expected 403)`);
  if (resSodL1.success || resSodL1.error?.status !== 403) {
    throw new Error('updateExpenseRequestStatus did not enforce SoD 403 on L1 creator approval');
  }

  // Check key is NOT poisoned with IN_PROGRESS
  const inProgSodL1 = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_idempotency_keys WHERE idempotency_key = $1',
    [keySodL1]
  )).rows[0].c);
  console.log(`[3.B SoD L1 Violation] Stored idempotency keys in DB: ${inProgSodL1} (Expected 0 - rolled back cleanly)`);
  if (inProgSodL1 !== 0) {
    throw new Error('Idempotency key was poisoned with IN_PROGRESS after SoD 403 violation on L1');
  }

  // Retry with the EXACT SAME KEY keySodL1 by a legitimate, independent manager
  const retrySodL1 = await adapter.updateExpenseRequestStatus(
    tenantId,
    reqIdSodL1,
    {
      status: 'APPROVED_L1',
      currentApprovalTier: 'L2',
      approvedL1By: 'MGR-INDEP-01', // Legitimate independent approver
      approvedL1ByName: 'طارق المدير المباشر المستقل',
      approvedL1At: new Date().toISOString(),
    },
    keySodL1
  );
  const statusAfterSodL1 = (await pool.query('SELECT status, approved_l1_by FROM an_expense_requests WHERE id = $1', [reqIdSodL1])).rows[0];
  const keyStatusSodL1 = (await pool.query('SELECT status FROM an_idempotency_keys WHERE idempotency_key = $1', [keySodL1])).rows[0]?.status;

  console.log(`[3.B Retry SoD L1] Success: ${retrySodL1.success} (Expected true), Status in DB: ${statusAfterSodL1.status} (Expected APPROVED_L1), Approver: ${statusAfterSodL1.approved_l1_by}, Key Status: ${keyStatusSodL1} (Expected COMPLETED)`);
  if (!retrySodL1.success || statusAfterSodL1.status !== 'APPROVED_L1' || statusAfterSodL1.approved_l1_by !== 'MGR-INDEP-01' || keyStatusSodL1 !== 'COMPLETED') {
    throw new Error('updateExpenseRequestStatus failed on retry with same key after resolving SoD L1 violation');
  }
  console.log('✓ 3.B SoD L1 VIOLATION: Clean rollback & successful retry with same key verified.\n');

  // (3.C) Failure 3: SoD 403 on Final Approval (Creator cannot approve final approval)
  const sufSodFinal = randSuffix();
  const keySodFinal = `key-sod-final-${sufSodFinal}`;
  const reqIdSodFinal = `exp-sod-final-${sufSodFinal}`;

  const sodFinalReq: ExpenseRequest = {
    id: reqIdSodFinal,
    tenantId,
    companyId: tenantId,
    requestCode: `SOD-FIN-${sufSodFinal}`.slice(0, 32),
    titleAr: 'طلب فحص فصل الصلاحيات النهائي',
    employeeId: 'EMP-MAKER-02',
    employeeName: 'خالد المنشئ',
    totalAmount: 12000.00,
    currency: 'SAR',
    paymentMethod: 'DIRECT_BANK_TRANSFER',
    status: 'APPROVED_L1',
    currentApprovalTier: 'L2',
    submittedBy: 'EMP-MAKER-02', // Stored creator
    submittedByName: 'خالد المنشئ',
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    idempotencyKey: `seed-${keySodFinal}`,
  };
  await adapter.createExpenseRequest(tenantId, sodFinalReq, [], [], `seed-${keySodFinal}`);

  // Attempt SoD violation: Creator approves Final
  const resSodFinal = await adapter.updateExpenseRequestStatus(
    tenantId,
    reqIdSodFinal,
    {
      status: 'APPROVED',
      currentApprovalTier: 'COMPLETED',
      approvedBy: 'EMP-MAKER-02', // VIOLATION! Creator cannot approve final
      approvedByName: 'خالد المنشئ',
      approvedAt: new Date().toISOString(),
    },
    keySodFinal
  );

  console.log(`[3.C SoD Final Violation] Success: ${resSodFinal.success} (Expected false), Error status: ${resSodFinal.error?.status} (Expected 403)`);
  if (resSodFinal.success || resSodFinal.error?.status !== 403) {
    throw new Error('updateExpenseRequestStatus did not enforce SoD 403 on final creator approval');
  }

  // Check key is NOT poisoned with IN_PROGRESS
  const inProgSodFinal = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_idempotency_keys WHERE idempotency_key = $1',
    [keySodFinal]
  )).rows[0].c);
  console.log(`[3.C SoD Final Violation] Stored idempotency keys in DB: ${inProgSodFinal} (Expected 0 - rolled back cleanly)`);
  if (inProgSodFinal !== 0) {
    throw new Error('Idempotency key was poisoned with IN_PROGRESS after SoD 403 violation on Final');
  }

  // Retry with the EXACT SAME KEY keySodFinal by a legitimate, independent CFO
  const retrySodFinal = await adapter.updateExpenseRequestStatus(
    tenantId,
    reqIdSodFinal,
    {
      status: 'APPROVED',
      currentApprovalTier: 'COMPLETED',
      approvedBy: 'CFO-INDEP-02', // Legitimate independent approver
      approvedByName: 'منصور المدير المالي المستقل',
      approvedAt: new Date().toISOString(),
    },
    keySodFinal
  );
  const statusAfterSodFinal = (await pool.query('SELECT status, approved_by FROM an_expense_requests WHERE id = $1', [reqIdSodFinal])).rows[0];
  const keyStatusSodFinal = (await pool.query('SELECT status FROM an_idempotency_keys WHERE idempotency_key = $1', [keySodFinal])).rows[0]?.status;

  console.log(`[3.C Retry SoD Final] Success: ${retrySodFinal.success} (Expected true), Status in DB: ${statusAfterSodFinal.status} (Expected APPROVED), Approver: ${statusAfterSodFinal.approved_by}, Key Status: ${keyStatusSodFinal} (Expected COMPLETED)`);
  if (!retrySodFinal.success || statusAfterSodFinal.status !== 'APPROVED' || statusAfterSodFinal.approved_by !== 'CFO-INDEP-02' || keyStatusSodFinal !== 'COMPLETED') {
    throw new Error('updateExpenseRequestStatus failed on retry with same key after resolving SoD Final violation');
  }
  console.log('✓ 3.C SoD FINAL VIOLATION: Clean rollback & successful retry with same key verified.\n');

  // ---------------------------------------------------------------------------
  // 4) FINAL CHECK: IN_PROGRESS IDEMPOTENCY KEYS
  // ---------------------------------------------------------------------------
  console.log('--- 4. FINAL CHECK: IN_PROGRESS IDEMPOTENCY KEYS ---');
  const inProgressTotal = Number((await pool.query(
    "SELECT count(*)::int as c FROM an_idempotency_keys WHERE status = 'IN_PROGRESS'"
  )).rows[0].c);

  console.log(`Final IN_PROGRESS keys in an_idempotency_keys: ${inProgressTotal} (Expected 0)`);
  if (inProgressTotal !== 0) {
    throw new Error(`Integrity breach: Found ${inProgressTotal} dangling IN_PROGRESS idempotency keys!`);
  }
  console.log('✓ FINAL CHECK PASSED: ZERO DANGLING IN_PROGRESS KEYS IN DATABASE\n');

  console.log('========================================================================');
  console.log('       ALL BATCH (C) GROUP 3 IDEMPOTENCY TESTS PASSED (100%)            ');
  console.log('========================================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('TEST RUNTIME FAILURE:', err);
  process.exit(1);
});
