import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { JournalEntry } from '../src/core/storage/StoragePort';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const pool = (adapter as any).pool;

  console.log('========================================================================');
  console.log('1) DATABASE ROLE & RLS ATTRIBUTES CHECK');
  console.log('========================================================================');

  const q1 = await pool.query(`SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;`);
  console.log('QUERY 1: SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;');
  console.table(q1.rows);

  const q2 = await pool.query(`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('an_idempotency_keys','an_journal_entries') ORDER BY relname;`);
  console.log('QUERY 2: SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN (\'an_idempotency_keys\',\'an_journal_entries\');');
  console.table(q2.rows);

  console.log('\n========================================================================');
  console.log('2) TEST postJournalEntry IDEMPOTENCY (PARALLEL & SEQUENTIAL)');
  console.log('========================================================================');

  const tenantId = 'tenant-main';
  const entryId = `JE-POST-IDEM-${Date.now()}`;
  const createKey = `create-draft-${Date.now()}`;
  const postKey = `post-idem-key-${Date.now()}`;

  // 1. Initial Account Balances
  const accBefore = await pool.query(
    `SELECT code, debit_balance::numeric as debit, credit_balance::numeric as credit FROM an_accounts WHERE tenant_id = $1 AND code IN ('1010', '1020') ORDER BY code`,
    [tenantId]
  );
  console.log('Account balances before post:', accBefore.rows);

  // 2. Create DRAFT Journal Entry
  const draftEntry: JournalEntry = {
    id: entryId,
    code: `CODE-POST-${Date.now()}`,
    tenantId,
    date: '2026-09-30',
    type: 'قيد يومية',
    description: 'قيد تجربة ترحيل متزامن لإثبات الإدهنية',
    totalAmount: 250,
    status: 'DRAFT',
    createdBy: 'USR-ADMIN',
    lines: [
      { id: `${entryId}-L1`, accountCode: '1010', debit: 250, credit: 0, description: 'طرف مدين' },
      { id: `${entryId}-L2`, accountCode: '1020', debit: 0, credit: 250, description: 'طرف دائن' },
    ],
  };

  const createRes = await adapter.createJournalEntry(tenantId, draftEntry, createKey);
  if (!createRes.success) {
    throw new Error(`Failed to create initial draft entry: ${JSON.stringify(createRes.error)}`);
  }
  console.log('Draft Journal Entry created with status:', createRes.data?.status, 'ID:', createRes.data?.id);

  // 3. Two concurrent parallel post requests with SAME idempotency key
  console.log('\nExecuting 2 parallel postJournalEntry requests with same idempotency key...');
  const [postRes1, postRes2] = await Promise.all([
    adapter.postJournalEntry(tenantId, entryId, postKey),
    adapter.postJournalEntry(tenantId, entryId, postKey),
  ]);

  console.log('Parallel Call 1:', { success: postRes1.success, status: postRes1.data?.status, id: postRes1.data?.id });
  console.log('Parallel Call 2:', { success: postRes2.success, status: postRes2.data?.status, id: postRes2.data?.id });

  // 4. Verify DB state of journal entry
  const entryDb = await pool.query(
    `SELECT id, status, posted_at FROM an_journal_entries WHERE id = $1`,
    [entryId]
  );
  console.log('DB Entry row after parallel posts:', entryDb.rows[0]);

  // 5. Verify DB state of accounts after parallel posts
  const accAfterParallel = await pool.query(
    `SELECT code, debit_balance::numeric as debit, credit_balance::numeric as credit FROM an_accounts WHERE tenant_id = $1 AND code IN ('1010', '1020') ORDER BY code`,
    [tenantId]
  );
  console.log('Account balances after parallel posts:', accAfterParallel.rows);

  // 6. Sequential replay with SAME key
  console.log('\nExecuting sequential replay on postJournalEntry with same idempotency key...');
  const postRes3 = await adapter.postJournalEntry(tenantId, entryId, postKey);
  console.log('Sequential Replay Call:', { success: postRes3.success, status: postRes3.data?.status, id: postRes3.data?.id });

  // 7. Verify DB state of accounts after sequential replay
  const accAfterReplay = await pool.query(
    `SELECT code, debit_balance::numeric as debit, credit_balance::numeric as credit FROM an_accounts WHERE tenant_id = $1 AND code IN ('1010', '1020') ORDER BY code`,
    [tenantId]
  );
  console.log('Account balances after sequential replay:', accAfterReplay.rows);

  // 8. Verify Idempotency records in an_idempotency_keys
  const idemDb = await pool.query(
    `SELECT idempotency_key, operation, status FROM an_idempotency_keys WHERE tenant_id = $1 AND idempotency_key = $2`,
    [tenantId, postKey]
  );
  console.log('Idempotency keys table rows:', idemDb.rows);

  // Assertions
  const parallelMatches = (
    postRes1.success &&
    postRes2.success &&
    postRes1.data?.status === 'POSTED' &&
    postRes2.data?.status === 'POSTED' &&
    postRes1.data?.id === entryId &&
    postRes2.data?.id === entryId
  );

  const sequentialMatches = (
    postRes3.success &&
    postRes3.data?.status === 'POSTED' &&
    postRes3.data?.id === entryId
  );

  const dbSinglePosted = entryDb.rows[0].status === 'POSTED';
  const debitDiff1010 = Number(accAfterReplay.rows.find((r: any) => r.code === '1010').debit) - Number(accBefore.rows.find((r: any) => r.code === '1010').debit);
  const creditDiff1020 = Number(accAfterReplay.rows.find((r: any) => r.code === '1020').credit) - Number(accBefore.rows.find((r: any) => r.code === '1020').credit);
  const balanceMutationOnce = debitDiff1010 === 250 && creditDiff1020 === 250;

  console.log('\n--- VERIFICATION CHECKS ---');
  console.log('Parallel responses match and both report POSTED:', parallelMatches);
  console.log('Sequential response matches and reports POSTED:', sequentialMatches);
  console.log('Single POSTED status in database:', dbSinglePosted);
  console.log(`Balance change: 1010 debit +${debitDiff1010}, 1020 credit +${creditDiff1020} (Mutation applied exactly once):`, balanceMutationOnce);
  console.log('Exactly 1 idempotency key record in COMPLETED state:', idemDb.rows.length === 1 && idemDb.rows[0].status === 'COMPLETED');

  if (parallelMatches && sequentialMatches && dbSinglePosted && balanceMutationOnce && idemDb.rows.length === 1) {
    console.log('\n[PASS] postJournalEntry Idempotency Test SUCCEEDED completely.');
  } else {
    console.error('\n[FAIL] postJournalEntry Idempotency Test failed.');
    process.exit(1);
  }

  await adapter.close();
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
