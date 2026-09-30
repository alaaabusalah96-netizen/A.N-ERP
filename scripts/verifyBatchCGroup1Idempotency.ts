import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import {
  CashCustodyTransaction,
  CashCustodySettlement,
  CustodyExpenseVoucher,
} from '../src/core/storage/StoragePort';
import dotenv from 'dotenv';
dotenv.config();

function randSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function run() {
  console.log('========================================================================');
  console.log('    A.N ERP v7.2 — BATCH (C) GROUP 1 IDEMPOTENCY VERIFICATION SUITE     ');
  console.log('========================================================================\n');

  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const pool = (adapter as any).pool;
  const tenantId = 'tenant-main';

  // ---------------------------------------------------------------------------
  // 1) اختبار recordCustodyExpense
  // ---------------------------------------------------------------------------
  console.log('--- 1. TESTING recordCustodyExpense ---');
  const suf1 = randSuffix();
  const custodyId1 = `cust-rce-${suf1}`;
  await pool.query(
    `INSERT INTO an_cash_custodies (
      id, tenant_id, company_id, custody_code, employee_id, employee_name,
      currency, allocated_amount, current_balance, max_limit_per_role, cost_center_id, status, opened_by, opened_by_name, opened_at, created_at, updated_at
    ) VALUES ($1, $2, $2, $3, 'EMP-01', 'موظف تجربة', 'SAR', 5000, 5000, 50000, 'CC-01', 'OPEN', 'USR-01', 'أدمن', NOW(), NOW(), NOW())`,
    [custodyId1, tenantId, `C-RCE-${suf1}`.slice(0, 32)]
  );

  const rceKey = `rce-key-parallel-${suf1}`;
  const tx1: CashCustodyTransaction = {
    id: `ctx-${suf1}-1`,
    tenantId,
    companyId: tenantId,
    transactionCode: `TX-${suf1}-1`.slice(0, 32),
    custodyId: custodyId1,
    amount: 500,
    expenseCategory: 'نثريات',
    expenseAccountCode: '5040',
    description: 'صرف تجربة توازي',
    receiptNumber: 'REC-01',
    attachmentUrl: '/test.pdf',
    recordedBy: 'USR-01',
    recordedByName: 'أدمن',
    status: 'RECORDED',
    transactionDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    idempotencyKey: rceKey,
  };

  const balBeforeRce = Number((await pool.query('SELECT current_balance FROM an_cash_custodies WHERE id = $1', [custodyId1])).rows[0].current_balance);
  console.log(`[1.A Parallel] Initial Balance: ${balBeforeRce}`);

  const [rceRes1, rceRes2] = await Promise.all([
    adapter.recordCustodyExpense(tenantId, tx1, rceKey),
    adapter.recordCustodyExpense(tenantId, tx1, rceKey),
  ]);

  const balAfterRceParallel = Number((await pool.query('SELECT current_balance FROM an_cash_custodies WHERE id = $1', [custodyId1])).rows[0].current_balance);
  const txCountParallel = Number((await pool.query('SELECT count(*)::int as c FROM an_cash_custody_transactions WHERE id = $1', [tx1.id])).rows[0].c);

  console.log(`[1.A Parallel] Result 1 success: ${rceRes1.success}, Result 2 success: ${rceRes2.success}`);
  console.log(`[1.A Parallel] Balance After: ${balAfterRceParallel} (Expected 4500, deducted once: ${balBeforeRce - balAfterRceParallel === 500})`);
  console.log(`[1.A Parallel] Transaction rows count: ${txCountParallel} (Expected 1)`);

  if (!rceRes1.success || !rceRes2.success || balAfterRceParallel !== 4500 || txCountParallel !== 1) {
    throw new Error('recordCustodyExpense parallel test failed');
  }

  // 1.B Sequential Replay
  const rceRes3 = await adapter.recordCustodyExpense(tenantId, tx1, rceKey);
  const balAfterRceReplay = Number((await pool.query('SELECT current_balance FROM an_cash_custodies WHERE id = $1', [custodyId1])).rows[0].current_balance);
  const txCountReplay = Number((await pool.query('SELECT count(*)::int as c FROM an_cash_custody_transactions WHERE id = $1', [tx1.id])).rows[0].c);

  console.log(`[1.B Replay] Replay success: ${rceRes3.success}`);
  console.log(`[1.B Replay] Balance After Replay: ${balAfterRceReplay} (No change: ${balAfterRceReplay === 4500})`);
  console.log(`[1.B Replay] Transaction rows count: ${txCountReplay} (No duplicate: ${txCountReplay === 1})`);

  if (!rceRes3.success || balAfterRceReplay !== 4500 || txCountReplay !== 1) {
    throw new Error('recordCustodyExpense sequential replay test failed');
  }

  // 1.C Failure & Retry with same key
  const sufFail = randSuffix();
  const custodyIdFail = `cust-rce-f-${sufFail}`;
  await pool.query(
    `INSERT INTO an_cash_custodies (
      id, tenant_id, company_id, custody_code, employee_id, employee_name,
      currency, allocated_amount, current_balance, max_limit_per_role, cost_center_id, status, opened_by, opened_by_name, opened_at, created_at, updated_at
    ) VALUES ($1, $2, $2, $3, 'EMP-01', 'موظف تجربة', 'SAR', 200, 200, 50000, 'CC-01', 'OPEN', 'USR-01', 'أدمن', NOW(), NOW(), NOW())`,
    [custodyIdFail, tenantId, `C-FAIL-${sufFail}`.slice(0, 32)]
  );

  const rceFailKey = `rce-key-fail-${sufFail}`;
  const failTx: CashCustodyTransaction = {
    ...tx1,
    id: `ctx-fail-${sufFail}`,
    transactionCode: `TX-FAIL-${sufFail}`.slice(0, 32),
    custodyId: custodyIdFail,
    amount: 500, // exceeds 200
    idempotencyKey: rceFailKey,
  };

  const failRes = await adapter.recordCustodyExpense(tenantId, failTx, rceFailKey);
  console.log(`[1.C Failure] Attempt with insufficient balance success: ${failRes.success} (Expected false)`);
  if (failRes.success) throw new Error('recordCustodyExpense should have failed due to insufficient balance');

  const keyInProgressAfterFail = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_idempotency_keys WHERE idempotency_key = $1',
    [rceFailKey]
  )).rows[0].c);
  console.log(`[1.C Failure] Idempotency key poisoned in DB: ${keyInProgressAfterFail} (Expected 0)`);
  if (keyInProgressAfterFail !== 0) throw new Error('Idempotency key was poisoned after failure');

  // Fix cause: top up balance
  await pool.query('UPDATE an_cash_custodies SET current_balance = 1000 WHERE id = $1', [custodyIdFail]);

  // Retry with SAME key
  const retryRes = await adapter.recordCustodyExpense(tenantId, failTx, rceFailKey);
  const balAfterRetry = Number((await pool.query('SELECT current_balance FROM an_cash_custodies WHERE id = $1', [custodyIdFail])).rows[0].current_balance);
  const txCountAfterRetry = Number((await pool.query('SELECT count(*)::int as c FROM an_cash_custody_transactions WHERE id = $1', [failTx.id])).rows[0].c);

  console.log(`[1.C Retry] Retry with same key success: ${retryRes.success} (Expected true)`);
  console.log(`[1.C Retry] Balance After Retry: ${balAfterRetry} (Expected 500: ${balAfterRetry === 500})`);
  console.log(`[1.C Retry] Transaction rows count: ${txCountAfterRetry} (Expected 1: ${txCountAfterRetry === 1})`);

  if (!retryRes.success || balAfterRetry !== 500 || txCountAfterRetry !== 1) {
    throw new Error('recordCustodyExpense retry with same key failed');
  }
  console.log('✓ recordCustodyExpense: ALL TESTS PASSED\n');

  // ---------------------------------------------------------------------------
  // 2) اختبار saveCustodyExpenseVoucher
  // ---------------------------------------------------------------------------
  console.log('--- 2. TESTING saveCustodyExpenseVoucher ---');
  const suf2 = randSuffix();
  const custodyId2 = `cust-vch-${suf2}`;
  await pool.query(
    `INSERT INTO an_cash_custodies (
      id, tenant_id, company_id, custody_code, employee_id, employee_name,
      currency, allocated_amount, current_balance, max_limit_per_role, cost_center_id, status, opened_by, opened_by_name, opened_at, created_at, updated_at
    ) VALUES ($1, $2, $2, $3, 'EMP-02', 'موظف سندات', 'SAR', 8000, 8000, 50000, 'CC-01', 'OPEN', 'USR-01', 'أدمن', NOW(), NOW(), NOW())`,
    [custodyId2, tenantId, `C-VCH-${suf2}`.slice(0, 32)]
  );

  const vchKey = `vch-key-parallel-${suf2}`;
  const vch1: CustodyExpenseVoucher = {
    id: `vch-${suf2}-1`,
    tenantId,
    companyId: tenantId,
    voucherNumber: `VCH-${suf2}-1`.slice(0, 32),
    custodyId: custodyId2,
    totalAmount: 1200,
    recordedBy: 'USR-01',
    recordedByName: 'أدمن',
    status: 'POSTED',
    createdAt: new Date().toISOString(),
    idempotencyKey: vchKey,
    lines: [
      {
        id: `vchl-${suf2}-1`,
        tenantId,
        voucherId: `vch-${suf2}-1`,
        lineNumber: 1,
        expenseCategory: 'صيانة',
        expenseAccountCode: '5020',
        amount: 1200,
        description: 'فاتورة صيانة أجهزة',
      },
    ],
  };

  const balBeforeVch = Number((await pool.query('SELECT current_balance FROM an_cash_custodies WHERE id = $1', [custodyId2])).rows[0].current_balance);
  console.log(`[2.A Parallel] Initial Balance: ${balBeforeVch}`);

  const [vchRes1, vchRes2] = await Promise.all([
    adapter.saveCustodyExpenseVoucher(tenantId, vch1, vchKey),
    adapter.saveCustodyExpenseVoucher(tenantId, vch1, vchKey),
  ]);

  const balAfterVchParallel = Number((await pool.query('SELECT current_balance FROM an_cash_custodies WHERE id = $1', [custodyId2])).rows[0].current_balance);
  const vchCountParallel = Number((await pool.query('SELECT count(*)::int as c FROM an_custody_expense_vouchers WHERE id = $1', [vch1.id])).rows[0].c);
  const lineCountParallel = Number((await pool.query('SELECT count(*)::int as c FROM an_custody_expense_lines WHERE voucher_id = $1', [vch1.id])).rows[0].c);

  console.log(`[2.A Parallel] Result 1 success: ${vchRes1.success}, Result 2 success: ${vchRes2.success}`);
  console.log(`[2.A Parallel] Balance After: ${balAfterVchParallel} (Expected 6800, deducted once: ${balBeforeVch - balAfterVchParallel === 1200})`);
  console.log(`[2.A Parallel] Voucher count: ${vchCountParallel} (Expected 1), Line count: ${lineCountParallel} (Expected 1)`);

  if (!vchRes1.success || !vchRes2.success || balAfterVchParallel !== 6800 || vchCountParallel !== 1 || lineCountParallel !== 1) {
    throw new Error('saveCustodyExpenseVoucher parallel test failed');
  }

  // 2.B Sequential Replay
  const vchRes3 = await adapter.saveCustodyExpenseVoucher(tenantId, vch1, vchKey);
  const balAfterVchReplay = Number((await pool.query('SELECT current_balance FROM an_cash_custodies WHERE id = $1', [custodyId2])).rows[0].current_balance);
  const vchCountReplay = Number((await pool.query('SELECT count(*)::int as c FROM an_custody_expense_vouchers WHERE id = $1', [vch1.id])).rows[0].c);

  console.log(`[2.B Replay] Replay success: ${vchRes3.success}`);
  console.log(`[2.B Replay] Balance After Replay: ${balAfterVchReplay} (No change: ${balAfterVchReplay === 6800})`);
  console.log(`[2.B Replay] Voucher rows count: ${vchCountReplay} (No duplicate: ${vchCountReplay === 1})`);

  if (!vchRes3.success || balAfterVchReplay !== 6800 || vchCountReplay !== 1) {
    throw new Error('saveCustodyExpenseVoucher sequential replay test failed');
  }

  // 2.C Failure & Retry with same key
  const sufVchFail = randSuffix();
  const custodyIdVchFail = `cust-vch-f-${sufVchFail}`;
  await pool.query(
    `INSERT INTO an_cash_custodies (
      id, tenant_id, company_id, custody_code, employee_id, employee_name,
      currency, allocated_amount, current_balance, max_limit_per_role, cost_center_id, status, opened_by, opened_by_name, opened_at, created_at, updated_at
    ) VALUES ($1, $2, $2, $3, 'EMP-02', 'موظف سندات', 'SAR', 300, 300, 50000, 'CC-01', 'OPEN', 'USR-01', 'أدمن', NOW(), NOW(), NOW())`,
    [custodyIdVchFail, tenantId, `C-VCHF-${sufVchFail}`.slice(0, 32)]
  );

  const vchFailKey = `vch-key-fail-${sufVchFail}`;
  const failVch: CustodyExpenseVoucher = {
    ...vch1,
    id: `vch-fail-${sufVchFail}`,
    voucherNumber: `VCH-FAIL-${sufVchFail}`.slice(0, 32),
    custodyId: custodyIdVchFail,
    totalAmount: 1000, // exceeds 300
    idempotencyKey: vchFailKey,
    lines: [
      {
        ...vch1.lines[0],
        id: `vchl-fail-${sufVchFail}`,
        voucherId: `vch-fail-${sufVchFail}`,
        amount: 1000,
      },
    ],
  };

  const failVchRes = await adapter.saveCustodyExpenseVoucher(tenantId, failVch, vchFailKey);
  console.log(`[2.C Failure] Attempt with insufficient balance success: ${failVchRes.success} (Expected false)`);
  if (failVchRes.success) throw new Error('saveCustodyExpenseVoucher should have failed due to insufficient balance');

  const vchKeyInProgAfterFail = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_idempotency_keys WHERE idempotency_key = $1',
    [vchFailKey]
  )).rows[0].c);
  console.log(`[2.C Failure] Idempotency key poisoned in DB: ${vchKeyInProgAfterFail} (Expected 0)`);
  if (vchKeyInProgAfterFail !== 0) throw new Error('Idempotency key was poisoned after failure');

  // Fix cause: top up balance
  await pool.query('UPDATE an_cash_custodies SET current_balance = 2000 WHERE id = $1', [custodyIdVchFail]);

  // Retry with SAME key
  const retryVchRes = await adapter.saveCustodyExpenseVoucher(tenantId, failVch, vchFailKey);
  const balAfterVchRetry = Number((await pool.query('SELECT current_balance FROM an_cash_custodies WHERE id = $1', [custodyIdVchFail])).rows[0].current_balance);
  const vchCountAfterRetry = Number((await pool.query('SELECT count(*)::int as c FROM an_custody_expense_vouchers WHERE id = $1', [failVch.id])).rows[0].c);

  console.log(`[2.C Retry] Retry with same key success: ${retryVchRes.success} (Expected true)`);
  console.log(`[2.C Retry] Balance After Retry: ${balAfterVchRetry} (Expected 1000: ${balAfterVchRetry === 1000})`);
  console.log(`[2.C Retry] Voucher count: ${vchCountAfterRetry} (Expected 1)`);

  if (!retryVchRes.success || balAfterVchRetry !== 1000 || vchCountAfterRetry !== 1) {
    throw new Error('saveCustodyExpenseVoucher retry with same key failed');
  }
  console.log('✓ saveCustodyExpenseVoucher: ALL TESTS PASSED\n');

  // ---------------------------------------------------------------------------
  // 3) اختبار reverseCustodyExpenseVoucher
  // ---------------------------------------------------------------------------
  console.log('--- 3. TESTING reverseCustodyExpenseVoucher ---');
  // Use vch1 created on custodyId2 (balance is currently 6800, totalAmount 1200)
  const sufRev = randSuffix();
  const revKey = `rev-key-parallel-${sufRev}`;
  const balBeforeRev = Number((await pool.query('SELECT current_balance FROM an_cash_custodies WHERE id = $1', [custodyId2])).rows[0].current_balance);
  console.log(`[3.A Parallel] Balance Before Reverse: ${balBeforeRev} (Expected 6800)`);

  const [revRes1, revRes2] = await Promise.all([
    adapter.reverseCustodyExpenseVoucher(tenantId, vch1.id, 'USR-01', revKey),
    adapter.reverseCustodyExpenseVoucher(tenantId, vch1.id, 'USR-01', revKey),
  ]);

  const balAfterRevParallel = Number((await pool.query('SELECT current_balance FROM an_cash_custodies WHERE id = $1', [custodyId2])).rows[0].current_balance);
  const vchStatusInDb = (await pool.query('SELECT status FROM an_custody_expense_vouchers WHERE id = $1', [vch1.id])).rows[0].status;

  console.log(`[3.A Parallel] Result 1 success: ${revRes1.success}, Result 2 success: ${revRes2.success}`);
  console.log(`[3.A Parallel] Balance After Reverse: ${balAfterRevParallel} (Expected 8000, refunded once: ${balAfterRevParallel === 8000})`);
  console.log(`[3.A Parallel] Voucher Status: ${vchStatusInDb} (Expected REVERSED)`);

  if (!revRes1.success || !revRes2.success || balAfterRevParallel !== 8000 || vchStatusInDb !== 'REVERSED') {
    throw new Error('reverseCustodyExpenseVoucher parallel test failed');
  }

  // 3.B Sequential Replay
  const revRes3 = await adapter.reverseCustodyExpenseVoucher(tenantId, vch1.id, 'USR-01', revKey);
  const balAfterRevReplay = Number((await pool.query('SELECT current_balance FROM an_cash_custodies WHERE id = $1', [custodyId2])).rows[0].current_balance);

  console.log(`[3.B Replay] Replay success: ${revRes3.success}`);
  console.log(`[3.B Replay] Balance After Replay: ${balAfterRevReplay} (No double refund: ${balAfterRevReplay === 8000})`);

  if (!revRes3.success || balAfterRevReplay !== 8000) {
    throw new Error('reverseCustodyExpenseVoucher sequential replay test failed');
  }

  // 3.C Failure & Retry with same key
  // Scenario 1: Voucher not found
  const sufRevFail = randSuffix();
  const revFailKey = `rev-key-fail-${sufRevFail}`;
  const failRevRes = await adapter.reverseCustodyExpenseVoucher(tenantId, 'non-existent-voucher-id', 'USR-01', revFailKey);
  console.log(`[3.C Failure] Non-existent voucher reverse success: ${failRevRes.success} (Expected false)`);
  if (failRevRes.success) throw new Error('Reversing non-existent voucher should fail');

  const revKeyInProg = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_idempotency_keys WHERE idempotency_key = $1',
    [revFailKey]
  )).rows[0].c);
  console.log(`[3.C Failure] Idempotency key poisoned in DB: ${revKeyInProg} (Expected 0)`);
  if (revKeyInProg !== 0) throw new Error('Idempotency key was poisoned after failure');

  // Create a real voucher to reverse
  const vchToRev: CustodyExpenseVoucher = {
    id: `vch-torev-${sufRevFail}`,
    tenantId,
    companyId: tenantId,
    voucherNumber: `VCH-REV-${sufRevFail}`.slice(0, 32),
    custodyId: custodyId2,
    totalAmount: 500,
    recordedBy: 'USR-01',
    recordedByName: 'أدمن',
    status: 'POSTED',
    createdAt: new Date().toISOString(),
    idempotencyKey: `save-torev-${sufRevFail}`,
    lines: [
      {
        id: `vchl-torev-${sufRevFail}`,
        tenantId,
        voucherId: `vch-torev-${sufRevFail}`,
        lineNumber: 1,
        expenseCategory: 'مطبوعات',
        expenseAccountCode: '5030',
        amount: 500,
        description: 'طباعة عقود',
      },
    ],
  };
  await adapter.saveCustodyExpenseVoucher(tenantId, vchToRev, `save-torev-${sufRevFail}`);
  const balBeforeRetryRev = Number((await pool.query('SELECT current_balance FROM an_cash_custodies WHERE id = $1', [custodyId2])).rows[0].current_balance);
  console.log(`[3.C Retry] Custody balance before reversal retry: ${balBeforeRetryRev} (8000 - 500 = 7500)`);

  // Retry with SAME revFailKey on the real voucher
  const retryRevRes = await adapter.reverseCustodyExpenseVoucher(tenantId, vchToRev.id, 'USR-01', revFailKey);
  const balAfterRetryRev = Number((await pool.query('SELECT current_balance FROM an_cash_custodies WHERE id = $1', [custodyId2])).rows[0].current_balance);
  console.log(`[3.C Retry] Reversal with same key success: ${retryRevRes.success} (Expected true)`);
  console.log(`[3.C Retry] Balance After Reversal Retry: ${balAfterRetryRev} (Expected 8000, refunded: ${balAfterRetryRev === 8000})`);

  if (!retryRevRes.success || balAfterRetryRev !== 8000) {
    throw new Error('reverseCustodyExpenseVoucher retry with same key failed');
  }

  // Scenario 2: Already reversed voucher fails
  const alreadyRevRes = await adapter.reverseCustodyExpenseVoucher(tenantId, vchToRev.id, 'USR-01', `new-key-${sufRevFail}`);
  console.log(`[3.C Already Reversed] Attempt on already reversed voucher success: ${alreadyRevRes.success} (Expected false)`);
  if (alreadyRevRes.success) throw new Error('Reversing an already reversed voucher should fail');
  console.log('✓ reverseCustodyExpenseVoucher: ALL TESTS PASSED\n');

  // ---------------------------------------------------------------------------
  // 4) اختبار saveCustodySettlement
  // ---------------------------------------------------------------------------
  console.log('--- 4. TESTING saveCustodySettlement ---');
  const suf4 = randSuffix();
  const custodyId4 = `cust-set-${suf4}`;
  const openerUser = `usr-opener-${suf4}`;
  const settlerUser = `usr-settler-${suf4}`;

  await pool.query(
    `INSERT INTO an_cash_custodies (
      id, tenant_id, company_id, custody_code, employee_id, employee_name,
      currency, allocated_amount, current_balance, max_limit_per_role, cost_center_id, status, opened_by, opened_by_name, opened_at, created_at, updated_at
    ) VALUES ($1, $2, $2, $3, 'EMP-04', 'موظف عهدة تسوية', 'SAR', 5000, 3000, 50000, 'CC-01', 'OPEN', $4, 'منشئ العهدة', NOW(), NOW(), NOW())`,
    [custodyId4, tenantId, `C-SET-${suf4}`.slice(0, 32), openerUser]
  );

  // Insert a recorded transaction to be settled
  const txToSettleId = `ctx-tosettle-${suf4}`;
  await pool.query(
    `INSERT INTO an_cash_custody_transactions (
      id, tenant_id, company_id, transaction_code, custody_id, amount,
      expense_category, expense_account_code, description, receipt_number,
      attachment_url, recorded_by, recorded_by_name, status, transaction_date, created_at
    ) VALUES ($1, $2, $2, $3, $4, 2000, 'نثريات', '5040', 'مصروف للتسوية', 'R-01', '/url', 'USR-01', 'أدمن', 'RECORDED', NOW(), NOW())`,
    [txToSettleId, tenantId, `CTX-SET-${suf4}`.slice(0, 32), custodyId4]
  );

  const setKey = `set-key-parallel-${suf4}`;
  const settlement1: CashCustodySettlement = {
    id: `cst-${suf4}-1`,
    tenantId,
    companyId: tenantId,
    settlementCode: `SET-${suf4}-1`.slice(0, 32),
    custodyId: custodyId4,
    settlementDate: new Date().toISOString(),
    totalExpenses: 2000,
    replenishmentAmount: 2000,
    varianceAmount: 0,
    varianceType: 'NONE',
    status: 'APPROVED',
    settledBy: settlerUser, // different from openerUser -> Passes SoD
    settledByName: 'معتمد التسوية',
    createdAt: new Date().toISOString(),
    idempotencyKey: setKey,
  };

  const [setRes1, setRes2] = await Promise.all([
    adapter.saveCustodySettlement(tenantId, settlement1, setKey),
    adapter.saveCustodySettlement(tenantId, settlement1, setKey),
  ]);

  const setCountParallel = Number((await pool.query('SELECT count(*)::int as c FROM an_cash_custody_settlements WHERE id = $1', [settlement1.id])).rows[0].c);
  const txStatusInDb = (await pool.query('SELECT status, settlement_id FROM an_cash_custody_transactions WHERE id = $1', [txToSettleId])).rows[0];

  console.log(`[4.A Parallel] Result 1 success: ${setRes1.success}, Result 2 success: ${setRes2.success}`);
  console.log(`[4.A Parallel] Settlement count: ${setCountParallel} (Expected 1)`);
  console.log(`[4.A Parallel] Tx status: ${txStatusInDb.status} (Expected INCLUDED_IN_SETTLEMENT), settlement_id set: ${txStatusInDb.settlement_id === settlement1.id}`);

  if (!setRes1.success || !setRes2.success || setCountParallel !== 1 || txStatusInDb.status !== 'INCLUDED_IN_SETTLEMENT') {
    throw new Error('saveCustodySettlement parallel test failed');
  }

  // 4.B Sequential Replay
  const setRes3 = await adapter.saveCustodySettlement(tenantId, settlement1, setKey);
  const setCountReplay = Number((await pool.query('SELECT count(*)::int as c FROM an_cash_custody_settlements WHERE id = $1', [settlement1.id])).rows[0].c);

  console.log(`[4.B Replay] Replay success: ${setRes3.success}`);
  console.log(`[4.B Replay] Settlement count: ${setCountReplay} (No duplicate: ${setCountReplay === 1})`);

  if (!setRes3.success || setCountReplay !== 1) {
    throw new Error('saveCustodySettlement sequential replay test failed');
  }

  // 4.C Failure (SoD 403) & Retry with same key
  const sufSodFail = randSuffix();
  const setFailKey = `set-key-fail-${sufSodFail}`;
  const sodViolatingSettlement: CashCustodySettlement = {
    ...settlement1,
    id: `cst-sod-${sufSodFail}`,
    settlementCode: `SET-SOD-${sufSodFail}`.slice(0, 32),
    settledBy: openerUser, // Same as openerUser -> Violates SoD
    settledByName: 'نفس منشئ العهدة',
    idempotencyKey: setFailKey,
  };

  const sodFailRes = await adapter.saveCustodySettlement(tenantId, sodViolatingSettlement, setFailKey);
  console.log(`[4.C Failure] SoD violation attempt success: ${sodFailRes.success} (Expected false), Status: ${sodFailRes.error?.status}`);
  if (sodFailRes.success || sodFailRes.error?.status !== 403) {
    throw new Error('saveCustodySettlement should fail with 403 on SoD violation');
  }

  const setKeyInProg = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_idempotency_keys WHERE idempotency_key = $1',
    [setFailKey]
  )).rows[0].c);
  console.log(`[4.C Failure] Idempotency key poisoned in DB: ${setKeyInProg} (Expected 0)`);
  if (setKeyInProg !== 0) throw new Error('Idempotency key was poisoned after failure');

  // Fix cause: Assign independent authorized settler
  const fixedSettlement: CashCustodySettlement = {
    ...sodViolatingSettlement,
    settledBy: `usr-manager-${sufSodFail}`,
    settledByName: 'مدير مالي مستقل',
  };

  const retrySetRes = await adapter.saveCustodySettlement(tenantId, fixedSettlement, setFailKey);
  const setCountAfterRetry = Number((await pool.query('SELECT count(*)::int as c FROM an_cash_custody_settlements WHERE id = $1', [fixedSettlement.id])).rows[0].c);

  console.log(`[4.C Retry] Retry with same key after SoD fix success: ${retrySetRes.success} (Expected true)`);
  console.log(`[4.C Retry] Settlement rows count: ${setCountAfterRetry} (Expected 1: ${setCountAfterRetry === 1})`);

  if (!retrySetRes.success || setCountAfterRetry !== 1) {
    throw new Error('saveCustodySettlement retry with same key failed');
  }
  console.log('✓ saveCustodySettlement: ALL TESTS PASSED\n');

  // ---------------------------------------------------------------------------
  // 5) الفحص النهائي: count(*) من an_idempotency_keys بحالة IN_PROGRESS = 0
  // ---------------------------------------------------------------------------
  console.log('--- 5. FINAL CHECK: IN_PROGRESS IDEMPOTENCY KEYS ---');
  const inProgressCount = Number((await pool.query(
    "SELECT count(*)::int as c FROM an_idempotency_keys WHERE status = 'IN_PROGRESS'"
  )).rows[0].c);

  console.log(`Final IN_PROGRESS keys in database: ${inProgressCount} (Expected 0)`);
  if (inProgressCount !== 0) {
    throw new Error(`Found ${inProgressCount} dangling IN_PROGRESS idempotency keys!`);
  }
  console.log('✓ IN_PROGRESS CHECK: EXACTLY ZERO DANGLING KEYS\n');

  console.log('========================================================================');
  console.log('       ALL BATCH (C) GROUP 1 IDEMPOTENCY TESTS COMPLETED: 100% PASS     ');
  console.log('========================================================================');
  process.exit(0);
}

run().catch((err) => {
  console.error('TEST SUITE RUNTIME ERROR:', err);
  process.exit(1);
});
