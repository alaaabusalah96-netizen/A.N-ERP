/**
 * @file verifyBatchAIdempotency.ts
 * @description Verification script for Phase 1 (INV-001) Batch (A)
 * Runs Tests 1-4 on real PostgreSQL with the real connection role.
 */

import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { JournalEntry } from '../src/core/storage/StoragePort';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://127.0.0.1:3000';

async function run() {
  console.log('========================================================================');
  console.log('       A.N ERP v7.2 — INV-001 BATCH (A) IDEMPOTENCY VERIFICATION        ');
  console.log('========================================================================\n');

  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const tenantId = 'tenant-main';

  // ---------------------------------------------------------------------------
  // TEST 1: طلبان متوازيان على createJournalEntry بنفس المفتاح -> قيد واحد، نفس id
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Concurrent Parallel Execution on createJournalEntry ---');
  const t1Key = `test-concurrent-key-${Date.now()}`;
  const t1EntryId = `JE-T1-${Date.now()}`;
  const t1Entry: JournalEntry = {
    id: t1EntryId,
    code: `CODE-${Date.now()}`,
    tenantId,
    date: '2026-09-30',
    type: 'قيد يدوي عام',
    description: 'اختبار التزامن المتوازي INV-001',
    totalAmount: 1000,
    status: 'DRAFT',
    createdBy: 'USR-ADMIN',
    lines: [
      { id: `${t1EntryId}-L1`, accountCode: '1010', debit: 1000, credit: 0, description: 'مدين' },
      { id: `${t1EntryId}-L2`, accountCode: '2010', debit: 0, credit: 1000, description: 'دائن' },
    ],
  };

  const [res1, res2] = await Promise.all([
    adapter.createJournalEntry(tenantId, t1Entry, t1Key),
    adapter.createJournalEntry(tenantId, t1Entry, t1Key),
  ]);

  console.log('Call 1 Result:', { success: res1.success, id: res1.data?.id });
  console.log('Call 2 Result:', { success: res2.success, id: res2.data?.id });

  const t1IdMatch = res1.success && res2.success && res1.data?.id === res2.data?.id;
  
  // Verify rows in DB count = exactly 1
  const countRes = await (adapter as any).pool.query(
    'SELECT COUNT(*)::int as count FROM an_journal_entries WHERE id = $1',
    [t1EntryId]
  );
  const t1DbCount = countRes.rows[0].count;
  console.log(`Database row count for ${t1EntryId}: ${t1DbCount}`);

  if (t1IdMatch && t1DbCount === 1) {
    console.log('[PASS] TEST 1: Same ID returned, exactly 1 row persisted in database.\n');
  } else {
    console.error('[FAIL] TEST 1 failed');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: إعادة متتابعة على createJournalEntry
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Sequential Replay on createJournalEntry ---');
  const res3 = await adapter.createJournalEntry(tenantId, t1Entry, t1Key);
  console.log('Sequential Replay Result:', { success: res3.success, id: res3.data?.id });
  
  const countRes2 = await (adapter as any).pool.query(
    'SELECT COUNT(*)::int as count FROM an_journal_entries WHERE id = $1',
    [t1EntryId]
  );
  if (res3.success && res3.data?.id === t1EntryId && countRes2.rows[0].count === 1) {
    console.log('[PASS] TEST 2: Sequential replay returns exact same data with zero additional rows.\n');
  } else {
    console.error('[FAIL] TEST 2 failed');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: HTTP API: POST /api/accounting/journal-entries
  // نفس المفتاح + body مختلف -> 409
  // نفس المفتاح + نفس الـ body -> نفس id بلا 409 وسجل واحد
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: HTTP API POST /api/accounting/journal-entries ---');
  // First, obtain auth cookie by logging in as admin
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-code': 'MAIN' },
    body: JSON.stringify({
      tenantCode: 'MAIN',
      username: 'admin',
      password: process.env.SEED_ADMIN_PASSWORD || process.env.INITIAL_USER_PASSWORD,
    }),
  });
  const cookieHeader = loginRes.headers.get('set-cookie') || '';
  const tokenMatch = cookieHeader.match(/an_access_token=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : '';

  if (!token) {
    console.error('Failed to authenticate for HTTP test. Login response:', loginRes.status);
    process.exit(1);
  }

  const httpKey = `http-idem-key-${Date.now()}`;
  const httpEntryId = `JE-HTTP-${Date.now()}`;
  const validBody = {
    id: httpEntryId,
    code: `JE-CODE-${Date.now()}`,
    type: 'قيد يدوي عام',
    description: 'قيد محاسبي عبر HTTP',
    date: '2026-09-30',
    lines: [
      { accountCode: '1010', debit: 500, credit: 0, description: 'نقدية' },
      { accountCode: '2010', debit: 0, credit: 500, description: 'موردون' },
    ],
  };

  // 3a. First request -> 200 OK
  const http1 = await fetch(`${BASE_URL}/api/accounting/journal-entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'idempotency-key': httpKey,
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(validBody),
  });
  const http1Data = await http1.json();
  console.log(`HTTP 1 (First Call) Status: ${http1.status}, ID:`, http1Data.data?.id);

  // 3b. Repeat with SAME key and SAME body -> 200 OK Replay (not 409, same id)
  const http2 = await fetch(`${BASE_URL}/api/accounting/journal-entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'idempotency-key': httpKey,
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(validBody),
  });
  const http2Data = await http2.json();
  console.log(`HTTP 2 (Same Key + Same Body) Status: ${http2.status}, ID:`, http2Data.data?.id);

  // 3c. Repeat with SAME key and DIFFERENT body -> 409 Conflict
  const differentBody = {
    ...validBody,
    description: 'وصف مختلف تماماً يؤدي لتعارض في بصمة الطلب',
  };
  const http3 = await fetch(`${BASE_URL}/api/accounting/journal-entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'idempotency-key': httpKey,
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(differentBody),
  });
  const http3Data = await http3.json();
  console.log(`HTTP 3 (Same Key + Different Body) Status: ${http3.status}, Type:`, http3Data.type);

  // Check DB count for httpEntryId
  const httpCountRes = await (adapter as any).pool.query(
    'SELECT COUNT(*)::int as count FROM an_journal_entries WHERE id = $1',
    [httpEntryId]
  );
  const httpDbCount = httpCountRes.rows[0].count;
  console.log(`Database count for HTTP entry ${httpEntryId}: ${httpDbCount}`);

  const test3Pass = (
    http1.status === 200 &&
    http2.status === 200 &&
    http1Data.data?.id === http2Data.data?.id &&
    http3.status === 409 &&
    httpDbCount === 1
  );

  if (test3Pass) {
    console.log('[PASS] TEST 3: Same key + same body -> 200 Replay. Same key + different body -> 409 Conflict. Exactly 1 row in DB.\n');
  } else {
    console.error('[FAIL] TEST 3 failed');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: فشل متعمد ثم إعادة -> أثر = 1
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Intentional Mid-Transaction Failure then Retry ---');
  const t4Key = `test-failure-recovery-${Date.now()}`;
  const t4EntryId = `JE-FAIL-${Date.now()}`;
  
  // Entry with invalid non-existent account or invalid lines to trigger SQL error in the middle
  const client = await (adapter as any).pool.connect();
  try {
    await client.query('BEGIN');
    const resv = await (adapter as any).reserveIdempotency(client, tenantId, t4Key, 'createJournalEntry');
    console.log('Reservation in failing attempt:', resv.action);
    // Deliberate SQL syntax error
    await client.query('INSERT INTO non_existent_table_fails_now VALUES (1)');
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.log('Transaction 1 deliberately failed and rolled back cleanly.');
  } finally {
    client.release();
  }

  // Check that no in-progress row remains poisoned
  const keyCheck = await (adapter as any).pool.query(
    'SELECT * FROM an_idempotency_keys WHERE tenant_id = $1 AND idempotency_key = $2',
    [tenantId, t4Key]
  );
  console.log(`Idempotency keys table rows for ${t4Key} after rollback: ${keyCheck.rows.length}`);

  // Now perform clean retry with the SAME key
  const t4ValidEntry: JournalEntry = {
    id: t4EntryId,
    code: `JE-T4-VALID-${Date.now()}`,
    tenantId,
    date: '2026-09-30',
    type: 'قيد يدوي عام',
    description: 'قيد صحيح بعد تعافي الفشل',
    totalAmount: 500,
    status: 'DRAFT',
    createdBy: 'USR-ADMIN',
    lines: [
      { id: `${t4EntryId}-L1`, accountCode: '1010', debit: 500, credit: 0, description: 'نقدية' },
      { id: `${t4EntryId}-L2`, accountCode: '2010', debit: 0, credit: 500, description: 'موردون' },
    ],
  };

  const t4RetryRes = await adapter.createJournalEntry(tenantId, t4ValidEntry, t4Key);
  console.log('Retry attempt with same key after failure:', { success: t4RetryRes.success, id: t4RetryRes.data?.id });

  const t4CountRes = await (adapter as any).pool.query(
    'SELECT COUNT(*)::int as count FROM an_journal_entries WHERE id = $1',
    [t4EntryId]
  );
  const t4DbCount = t4CountRes.rows[0].count;
  console.log(`Database count for ${t4EntryId}: ${t4DbCount}`);

  if (keyCheck.rows.length === 0 && t4RetryRes.success && t4DbCount === 1) {
    console.log('[PASS] TEST 4: Zero poisoned keys, clean retry succeeded with business effect = 1.\n');
  } else {
    console.error('[FAIL] TEST 4 failed');
    process.exit(1);
  }

  await adapter.close();

  console.log('========================================================================');
  console.log('               ALL BATCH (A) TESTS PASSED (4/4)                         ');
  console.log('========================================================================');
}

run().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
