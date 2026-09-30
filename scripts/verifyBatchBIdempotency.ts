import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import {
  TenantCompany,
  CashCustody,
  Warehouse,
  StockItem,
  OrgNode,
  User,
} from '../src/core/storage/StoragePort';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  console.log('========================================================================');
  console.log('       A.N ERP v7.2 — INV-001 BATCH (B) IDEMPOTENCY VERIFICATION        ');
  console.log('========================================================================\n');

  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const pool = (adapter as any).pool;
  const tenantId = 'tenant-main';

  // ---------------------------------------------------------------------------
  // 1) اختبارات الدوال الست: طلبان متوازيان وإعادة متتابعة
  // ---------------------------------------------------------------------------
  console.log('--- 1. SIX FUNCTIONS: PARALLEL & SEQUENTIAL TESTS ---');

  // 1.1 saveTenant
  console.log('Testing 1.1: saveTenant...');
  const tKey = `tenant-test-key-${Date.now()}`;
  const tId = `tenant-b-${Date.now()}`;
  const tenantData: TenantCompany = {
    id: tId,
    code: `TCODE-${Date.now()}`.slice(0, 16),
    nameAr: 'منشأة اختبار الدفعة ب',
    nameEn: 'Batch B Test Tenant',
    status: 'ACTIVE',
    backendConfig: { adapterType: 'postgresql', connectionRef: 'DATABASE_URL', isolationLevel: 'Shared' },
    createdAt: new Date().toISOString(),
  };
  const [tRes1, tRes2] = await Promise.all([
    adapter.saveTenant(tenantData, tKey),
    adapter.saveTenant(tenantData, tKey),
  ]);
  const tRes3 = await adapter.saveTenant(tenantData, tKey);
  const tCount = (await pool.query('SELECT count(*)::int as c FROM an_tenants WHERE id = $1', [tId])).rows[0].c;
  console.log(`saveTenant -> Parallel: ${tRes1.success && tRes2.success}, Replay: ${tRes3.success}, DB Count: ${tCount}`);
  if (!tRes1.success || !tRes2.success || !tRes3.success || tCount !== 1) {
    throw new Error('saveTenant test failed');
  }

  // 1.2 saveOrgNode
  console.log('Testing 1.2: saveOrgNode...');
  const orgKey = `org-test-key-${Date.now()}`;
  const orgId = `org-node-${Date.now()}`;
  const orgData: OrgNode = {
    id: orgId,
    tenantId,
    code: `ORG-${Date.now()}`.slice(0, 16),
    nameAr: 'إدارة العمليات المركزية',
    nameEn: 'Central Operations',
    type: 'DEPARTMENT',
    status: 'ACTIVE',
  };
  const [orgRes1, orgRes2] = await Promise.all([
    adapter.saveOrgNode(tenantId, orgData, orgKey),
    adapter.saveOrgNode(tenantId, orgData, orgKey),
  ]);
  const orgRes3 = await adapter.saveOrgNode(tenantId, orgData, orgKey);
  const orgCount = (await pool.query('SELECT count(*)::int as c FROM an_org_nodes WHERE id = $1', [orgId])).rows[0].c;
  console.log(`saveOrgNode -> Parallel: ${orgRes1.success && orgRes2.success}, Replay: ${orgRes3.success}, DB Count: ${orgCount}`);
  if (!orgRes1.success || !orgRes2.success || !orgRes3.success || orgCount !== 1) {
    throw new Error('saveOrgNode test failed');
  }

  // 1.3 anonymizeUserPii (pre-create user first)
  console.log('Testing 1.3: anonymizeUserPii (Parallel & Sequential)...');
  const anonUserId = `usr-anon-test-${Date.now()}`;
  await pool.query(
    `INSERT INTO an_users (id, tenant_id, username, email, full_name, role, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 'accountant', 'ACTIVE', NOW())`,
    [anonUserId, tenantId, `user_${Date.now()}`, `user_${Date.now()}@test.sa`, 'مستخدم تجريبي للخصوصية']
  );
  const anonKey = `anon-key-${Date.now()}`;
  const [anonRes1, anonRes2] = await Promise.all([
    adapter.anonymizeUserPii(tenantId, anonUserId, 'USR-ADMIN', anonKey),
    adapter.anonymizeUserPii(tenantId, anonUserId, 'USR-ADMIN', anonKey),
  ]);
  const anonRes3 = await adapter.anonymizeUserPii(tenantId, anonUserId, 'USR-ADMIN', anonKey);
  const userRow = (await pool.query('SELECT status, full_name FROM an_users WHERE id = $1', [anonUserId])).rows[0];
  console.log(`anonymizeUserPii -> Parallel: ${anonRes1.success && anonRes2.success}, Replay: ${anonRes3.success}, Status: ${userRow?.status}`);
  if (!anonRes1.success || !anonRes2.success || !anonRes3.success || userRow?.status !== 'INACTIVE') {
    throw new Error('anonymizeUserPii test failed');
  }

  // 1.4 createCashCustody
  console.log('Testing 1.4: createCashCustody...');
  const cstKey = `custody-key-${Date.now()}`;
  const cstId = `cst-test-${Date.now()}`;
  const custodyData: CashCustody = {
    id: cstId,
    tenantId,
    companyId: tenantId,
    custodyCode: `CST-${Date.now()}`.slice(0, 16),
    employeeId: 'USR-001',
    employeeName: 'أحمد المنصور',
    costCenterId: 'cc-ops-01',
    currency: 'SAR',
    allocatedAmount: 5000,
    currentBalance: 5000,
    maxLimitPerRole: 10000,
    status: 'OPEN',
    openedBy: 'USR-ADMIN',
    openedByName: 'مدير النظام',
    openedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const [cstRes1, cstRes2] = await Promise.all([
    adapter.createCashCustody(tenantId, custodyData, cstKey),
    adapter.createCashCustody(tenantId, custodyData, cstKey),
  ]);
  const cstRes3 = await adapter.createCashCustody(tenantId, custodyData, cstKey);
  const cstCount = (await pool.query('SELECT count(*)::int as c FROM an_cash_custodies WHERE id = $1', [cstId])).rows[0].c;
  console.log(`createCashCustody -> Parallel: ${cstRes1.success && cstRes2.success}, Replay: ${cstRes3.success}, DB Count: ${cstCount}`);
  if (!cstRes1.success || !cstRes2.success || !cstRes3.success || cstCount !== 1) {
    throw new Error('createCashCustody test failed');
  }

  // 1.5 saveWarehouse
  console.log('Testing 1.5: saveWarehouse...');
  const whKey = `wh-key-${Date.now()}`;
  const whId = `wh-test-${Date.now()}`;
  const whData: Warehouse = {
    id: whId,
    tenantId,
    companyId: tenantId,
    code: `WH-${Date.now()}`.slice(0, 16),
    nameAr: 'مستودع الاختبار المركزي',
    isDefault: false,
    isActive: true,
    valuationMethod: 'WEIGHTED_AVERAGE',
    createdAt: new Date().toISOString(),
  };
  const [whRes1, whRes2] = await Promise.all([
    adapter.saveWarehouse(tenantId, whData, whKey),
    adapter.saveWarehouse(tenantId, whData, whKey),
  ]);
  const whRes3 = await adapter.saveWarehouse(tenantId, whData, whKey);
  const whCount = (await pool.query('SELECT count(*)::int as c FROM an_warehouses WHERE id = $1', [whId])).rows[0].c;
  console.log(`saveWarehouse -> Parallel: ${whRes1.success && whRes2.success}, Replay: ${whRes3.success}, DB Count: ${whCount}`);
  if (!whRes1.success || !whRes2.success || !whRes3.success || whCount !== 1) {
    throw new Error('saveWarehouse test failed');
  }

  // 1.6 saveStockItem
  console.log('Testing 1.6: saveStockItem...');
  const itmKey = `item-key-${Date.now()}`;
  const itmId = `itm-test-${Date.now()}`;
  const itmData: StockItem = {
    id: itmId,
    tenantId,
    companyId: tenantId,
    itemCode: `ITM-${Date.now()}`.slice(0, 16),
    nameAr: 'مضخة هيدروليكية صناعية',
    category: 'SPARE_PARTS',
    uom: 'حبة',
    inventoryAccountCode: '1040',
    cogsAccountCode: '5010',
    adjustmentExpenseAccountCode: '5090',
    adjustmentGainAccountCode: '4090',
    valuationMethod: 'WEIGHTED_AVERAGE',
    standardCost: 150,
    averageCost: 150,
    sellingPrice: 220,
    reorderPoint: 5,
    minStockLevel: 2,
    maxStockLevel: 50,
    trackBatch: false,
    trackSerial: false,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  const [itmRes1, itmRes2] = await Promise.all([
    adapter.saveStockItem(tenantId, itmData, itmKey),
    adapter.saveStockItem(tenantId, itmData, itmKey),
  ]);
  const itmRes3 = await adapter.saveStockItem(tenantId, itmData, itmKey);
  const itmCount = (await pool.query('SELECT count(*)::int as c FROM an_stock_items WHERE id = $1', [itmId])).rows[0].c;
  console.log(`saveStockItem -> Parallel: ${itmRes1.success && itmRes2.success}, Replay: ${itmRes3.success}, DB Count: ${itmCount}`);
  if (!itmRes1.success || !itmRes2.success || !itmRes3.success || itmCount !== 1) {
    throw new Error('saveStockItem test failed');
  }
  console.log('[PASS] All 6 functions passed Parallel and Sequential Replay tests cleanly.\n');

  // ---------------------------------------------------------------------------
  // 2) فشل منطقي مرتجع ثم إعادة بعد إصلاح السبب -> ينفّذ فعلاً (لا REPLAY فارغ)
  // ---------------------------------------------------------------------------
  console.log('--- 2. LOGICAL FAILURE RETURNED THEN CLEAN RETRY AFTER FIX ---');
  const ghostUserId = `usr-ghost-404-${Date.now()}`;
  const failRetryKey = `fail-then-retry-key-${Date.now()}`;

  // Call on non-existent user -> should return 404
  const failRes = await adapter.anonymizeUserPii(tenantId, ghostUserId, 'USR-ADMIN', failRetryKey);
  console.log('Attempt 1 (Non-existent user):', { success: failRes.success, status: failRes.error?.status });
  if (failRes.success || failRes.error?.status !== 404) {
    throw new Error('Expected 404 for ghost user');
  }

  // Check that NO in-progress or poisoned key remained
  const keyCheckFail = await pool.query(
    'SELECT * FROM an_idempotency_keys WHERE tenant_id = $1 AND idempotency_key = $2',
    [tenantId, failRetryKey]
  );
  console.log(`Idempotency keys table count after 404 failure: ${keyCheckFail.rows.length}`);
  if (keyCheckFail.rows.length !== 0) {
    throw new Error('Poisoned key remained after failure!');
  }

  // Now create the user in database
  await pool.query(
    `INSERT INTO an_users (id, tenant_id, username, email, full_name, role, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 'accountant', 'ACTIVE', NOW())`,
    [ghostUserId, tenantId, `fixed_${Date.now()}`, `fixed_${Date.now()}@test.sa`, 'مستخدم تم إصلاحه']
  );

  // Retry with the EXACT SAME key -> must execute for real!
  const fixedRes = await adapter.anonymizeUserPii(tenantId, ghostUserId, 'USR-ADMIN', failRetryKey);
  console.log('Attempt 2 (With same key after fixing user):', { success: fixedRes.success, data: fixedRes.data });
  const fixedUserDb = (await pool.query('SELECT status, full_name FROM an_users WHERE id = $1', [ghostUserId])).rows[0];
  console.log('User status in DB after retry:', fixedUserDb?.status);

  if (!fixedRes.success || !fixedRes.data?.anonymizedAt || fixedUserDb?.status !== 'INACTIVE') {
    throw new Error('Retry after fix failed or returned empty payload!');
  }
  console.log('[PASS] Logical failure did not poison key; retry executed for real.\n');

  // ---------------------------------------------------------------------------
  // 3) فشل داخلي (منطقي وخطأ SQL) داخل withTenantScope خارجي -> كتابة لاحقة تنجح وتُحفظ
  // ---------------------------------------------------------------------------
  console.log('--- 3. NESTED withTenantScope WITH INTERNAL FAILURES & SUBSEQUENT COMMIT ---');
  const committedWhId = `wh-nested-commit-${Date.now()}`;
  const subsequentKey = `subsequent-valid-key-${Date.now()}`;

  await adapter.withTenantScope(tenantId, async () => {
    // 3a. Internal Logical Failure (404)
    const nestedFail1 = await adapter.anonymizeUserPii(tenantId, 'usr-non-existent-nested', 'USR-ADMIN', `nested-fail-1-${Date.now()}`);
    console.log('Nested Failure 1 (Logical 404):', { success: nestedFail1.success, status: nestedFail1.error?.status });

    // 3b. Internal SQL Error (FK Violation on saveOrgNode with invalid parent_id)
    const badNodeId = `node-fk-fail-${Date.now()}`;
    const badNode: OrgNode = {
      id: badNodeId,
      tenantId,
      code: `BAD-${Date.now()}`.slice(0, 16),
      nameAr: 'عقدة بمخالفة قيد خارجي',
      type: 'BRANCH',
      parentId: 'non-existent-parent-fk-violates-constraint',
      status: 'ACTIVE',
    };
    const nestedFail2 = await adapter.saveOrgNode(tenantId, badNode, `nested-fail-2-${Date.now()}`);
    console.log('Nested Failure 2 (SQL FK Error):', { success: nestedFail2.success, errorType: nestedFail2.error?.type });

    // 3c. Subsequent valid write inside the SAME outer withTenantScope
    const validWh: Warehouse = {
      id: committedWhId,
      tenantId,
      companyId: tenantId,
      code: `WH-NEST-${Date.now()}`.slice(0, 16),
      nameAr: 'مستودع محفوظ بعد فشل داخلي محتوى',
      isDefault: false,
      isActive: true,
      valuationMethod: 'WEIGHTED_AVERAGE',
      createdAt: new Date().toISOString(),
    };
    const validRes = await adapter.saveWarehouse(tenantId, validWh, subsequentKey);
    console.log('Subsequent Write in same outer scope:', { success: validRes.success, id: validRes.data?.id });
    if (!validRes.success) {
      throw new Error(`Subsequent write failed: ${JSON.stringify(validRes.error)}`);
    }
    return validRes;
  });

  // Verify DB state after outer transaction COMMIT
  const savedWhCount = (await pool.query('SELECT count(*)::int as c FROM an_warehouses WHERE id = $1', [committedWhId])).rows[0].c;
  console.log(`Database count for subsequent warehouse ${committedWhId}: ${savedWhCount}`);
  if (savedWhCount !== 1) {
    throw new Error('Subsequent write was not committed after nested savepoint rollback!');
  }
  console.log('[PASS] Nested savepoints contained failures; outer scope committed subsequent write cleanly.\n');

  // ---------------------------------------------------------------------------
  // 4) كتابة صف بالدالة القديمة recordIdempotency ثم استدعاء الدالة الجديدة بنفس المفتاح -> REPLAY ناجح لا 409
  // ---------------------------------------------------------------------------
  console.log('--- 4. BACKWARD COMPATIBILITY: recordIdempotency -> REPLAY ON NEW FUNCTION ---');
  const legacyKey = `legacy-test-key-${Date.now()}`;
  const legacyWhPayload: Warehouse = {
    id: `wh-legacy-${Date.now()}`,
    tenantId,
    companyId: tenantId,
    code: `WH-LEG-${Date.now()}`.slice(0, 16),
    nameAr: 'مستودع محفوظ بالدالة القديمة',
    isDefault: false,
    isActive: true,
    valuationMethod: 'WEIGHTED_AVERAGE',
    createdAt: new Date().toISOString(),
  };

  // Write row via legacy recordIdempotency
  const recRes = await (adapter as any).recordIdempotency(tenantId, legacyKey, 'saveWarehouse', legacyWhPayload);
  console.log('Legacy recordIdempotency call:', { success: recRes.success });

  // Call new saveWarehouse with SAME key and different payload
  const differentWh: Warehouse = {
    ...legacyWhPayload,
    id: `wh-different-${Date.now()}`,
    nameAr: 'محاولة كتابة مختلفة بنفس المفتاح القديم',
  };
  const newCallRes = await adapter.saveWarehouse(tenantId, differentWh, legacyKey);
  console.log('New function call with legacy key:', {
    success: newCallRes.success,
    returnedId: newCallRes.data?.id,
    expectedId: legacyWhPayload.id,
    matches: newCallRes.data?.id === legacyWhPayload.id,
  });

  if (!newCallRes.success || newCallRes.data?.id !== legacyWhPayload.id) {
    throw new Error('Legacy idempotency record was not cleanly replayed!');
  }
  console.log('[PASS] Backward compatibility verified: legacy record cleanly replayed without 409.\n');

  // ---------------------------------------------------------------------------
  // 5) فحص نهائي: SELECT count(*) FROM an_idempotency_keys WHERE status='IN_PROGRESS' يساوي 0
  // ---------------------------------------------------------------------------
  console.log('--- 5. FINAL AUDIT: ZERO IN_PROGRESS IDEMPOTENCY KEYS ---');
  const inProgressRes = await pool.query(`SELECT count(*)::int as c FROM an_idempotency_keys WHERE status = 'IN_PROGRESS'`);
  const inProgressCount = inProgressRes.rows[0].c;
  console.log(`Total rows with status = 'IN_PROGRESS' across database: ${inProgressCount}`);
  if (inProgressCount !== 0) {
    throw new Error(`Found ${inProgressCount} poisoned IN_PROGRESS keys!`);
  }
  console.log('[PASS] Zero IN_PROGRESS keys found in database. All keys completed or rolled back cleanly.\n');

  await adapter.close();

  console.log('========================================================================');
  console.log('           ALL BATCH (B) IDEMPOTENCY TESTS PASSED (5/5)                 ');
  console.log('========================================================================');
}

run().catch((err) => {
  console.error('Batch B Test execution error:', err);
  process.exit(1);
});
