import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import {
  StockMovement,
  StockTransfer,
  StockTransferLine,
  StockCount,
  StockCountLine,
  StockDocument,
  StockDocumentLine,
} from '../src/core/storage/StoragePort';
import dotenv from 'dotenv';
dotenv.config();

function randSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function run() {
  console.log('========================================================================');
  console.log('    A.N ERP v7.2 — BATCH (C) GROUP 2 IDEMPOTENCY VERIFICATION SUITE     ');
  console.log('========================================================================\n');

  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const pool = (adapter as any).pool;
  const tenantId = 'tenant-main';

  // Helper setup: Create warehouses and items
  const sufInit = randSuffix();
  const whId1 = `wh-1-${sufInit}`;
  const whId2 = `wh-2-${sufInit}`;
  const itemId1 = `itm-1-${sufInit}`;
  const itemId2 = `itm-2-${sufInit}`;

  await pool.query(
    `INSERT INTO an_warehouses (id, tenant_id, company_id, code, name_ar, name_en, is_active, is_default, valuation_method, created_at, updated_at)
     VALUES 
      ($1, $2, $2, $3, 'المستودع الرئيسي', 'Main WH', true, true, 'WAC', NOW(), NOW()),
      ($4, $2, $2, $5, 'مستودع الفرع', 'Branch WH', true, false, 'WAC', NOW(), NOW())`,
    [whId1, tenantId, `WH-M-${sufInit}`.slice(0, 32), whId2, `WH-B-${sufInit}`.slice(0, 32)]
  );

  await pool.query(
    `INSERT INTO an_stock_items (id, tenant_id, company_id, item_code, name_ar, name_en, category, uom, average_cost, is_active, created_at, updated_at)
     VALUES 
      ($1, $2, $2, $3, 'صنف اختباري 1', 'Test Item 1', 'مخزون', 'حبه', 10.00, true, NOW(), NOW()),
      ($4, $2, $2, $5, 'صنف اختباري 2', 'Test Item 2', 'مخزون', 'حبه', 20.00, true, NOW(), NOW())`,
    [itemId1, tenantId, `ITM-1-${sufInit}`.slice(0, 32), itemId2, `ITM-2-${sufInit}`.slice(0, 32)]
  );

  // ---------------------------------------------------------------------------
  // 1) اختبار recordStockMovement
  // ---------------------------------------------------------------------------
  console.log('--- 1. TESTING recordStockMovement ---');
  const sufMv = randSuffix();
  const mvKey = `mv-key-parallel-${sufMv}`;
  const movement1: StockMovement = {
    id: `mv-${sufMv}-1`,
    tenantId,
    companyId: tenantId,
    movementNumber: `MV-${sufMv}-1`.slice(0, 32),
    movementType: 'RECEIPT',
    warehouseId: whId1,
    warehouseNameAr: 'المستودع الرئيسي',
    itemId: itemId1,
    itemCode: `ITM-1-${sufInit}`.slice(0, 32),
    itemNameAr: 'صنف اختباري 1',
    quantity: 10,
    unitCost: 15.00,
    totalCost: 150.00,
    balanceAfterQty: 0,
    performedBy: 'USR-01',
    performedByName: 'أمين المستودع',
    idempotencyKey: mvKey,
    timestamp: new Date().toISOString(),
  };

  const [mvRes1, mvRes2] = await Promise.all([
    adapter.recordStockMovement(tenantId, movement1, mvKey),
    adapter.recordStockMovement(tenantId, movement1, mvKey),
  ]);

  const stockRow1 = (await pool.query(
    'SELECT current_qty, average_cost FROM an_warehouse_stock WHERE tenant_id = $1 AND warehouse_id = $2 AND item_id = $3',
    [tenantId, whId1, itemId1]
  )).rows[0];
  const mvCountParallel = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_stock_movements WHERE id = $1',
    [movement1.id]
  )).rows[0].c);

  console.log(`[1.A Parallel] Result 1 success: ${mvRes1.success}, Result 2 success: ${mvRes2.success}`);
  console.log(`[1.A Parallel] Stock Qty: ${stockRow1?.current_qty} (Expected 10), Avg Cost: ${stockRow1?.average_cost} (Expected 15)`);
  console.log(`[1.A Parallel] Movement rows count: ${mvCountParallel} (Expected 1)`);

  if (!mvRes1.success || !mvRes2.success || Number(stockRow1?.current_qty) !== 10 || mvCountParallel !== 1) {
    throw new Error('recordStockMovement parallel test failed');
  }

  // 1.B Sequential Replay
  const mvRes3 = await adapter.recordStockMovement(tenantId, movement1, mvKey);
  const stockRowReplay = (await pool.query(
    'SELECT current_qty, average_cost FROM an_warehouse_stock WHERE tenant_id = $1 AND warehouse_id = $2 AND item_id = $3',
    [tenantId, whId1, itemId1]
  )).rows[0];
  const mvCountReplay = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_stock_movements WHERE id = $1',
    [movement1.id]
  )).rows[0].c);

  console.log(`[1.B Replay] Replay success: ${mvRes3.success}`);
  console.log(`[1.B Replay] Stock Qty After Replay: ${stockRowReplay?.current_qty} (No change: ${Number(stockRowReplay?.current_qty) === 10})`);
  console.log(`[1.B Replay] Movement rows count: ${mvCountReplay} (No duplicate: ${mvCountReplay === 1})`);

  if (!mvRes3.success || Number(stockRowReplay?.current_qty) !== 10 || mvCountReplay !== 1) {
    throw new Error('recordStockMovement sequential replay test failed');
  }

  // 1.C Failure & Retry with same key
  const sufMvFail = randSuffix();
  const mvFailKey = `mv-key-fail-${sufMvFail}`;
  const failMovement: StockMovement = {
    ...movement1,
    id: `mv-fail-${sufMvFail}`,
    movementNumber: `MV-F-${sufMvFail}`.slice(0, 32),
    warehouseId: 'non-existent-warehouse-id', // Causes FK failure on warehouse_id
    idempotencyKey: mvFailKey,
  };

  const failMvRes = await adapter.recordStockMovement(tenantId, failMovement, mvFailKey);
  console.log(`[1.C Failure] Non-existent warehouse movement success: ${failMvRes.success} (Expected false)`);
  if (failMvRes.success) throw new Error('recordStockMovement should fail for non-existent warehouse');

  const mvKeyInProg = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_idempotency_keys WHERE idempotency_key = $1',
    [mvFailKey]
  )).rows[0].c);
  console.log(`[1.C Failure] Idempotency key poisoned in DB: ${mvKeyInProg} (Expected 0)`);
  if (mvKeyInProg !== 0) throw new Error('Idempotency key was poisoned after failure');

  // Fix cause: set valid warehouse
  const fixedMovement: StockMovement = {
    ...failMovement,
    warehouseId: whId1,
  };
  const retryMvRes = await adapter.recordStockMovement(tenantId, fixedMovement, mvFailKey);
  const mvCountAfterRetry = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_stock_movements WHERE id = $1',
    [failMovement.id]
  )).rows[0].c);

  console.log(`[1.C Retry] Retry with same key success: ${retryMvRes.success} (Expected true)`);
  console.log(`[1.C Retry] Movement rows count: ${mvCountAfterRetry} (Expected 1)`);

  if (!retryMvRes.success || mvCountAfterRetry !== 1) {
    throw new Error('recordStockMovement retry with same key failed');
  }
  console.log('✓ recordStockMovement: ALL TESTS PASSED\n');

  // ---------------------------------------------------------------------------
  // 2) اختبار createStockTransfer
  // ---------------------------------------------------------------------------
  console.log('--- 2. TESTING createStockTransfer ---');
  const sufTr = randSuffix();
  const trKey = `tr-key-parallel-${sufTr}`;
  const transfer1: StockTransfer = {
    id: `tr-${sufTr}-1`,
    tenantId,
    companyId: tenantId,
    transferNumber: `TR-${sufTr}-1`.slice(0, 32),
    sourceWarehouseId: whId1,
    sourceWarehouseNameAr: 'المستودع الرئيسي',
    targetWarehouseId: whId2,
    targetWarehouseNameAr: 'مستودع الفرع',
    status: 'DRAFT',
    requestedBy: 'USR-01',
    requestedByName: 'أمين المستودع',
    requestedAt: new Date().toISOString(),
    totalItemsCount: 1,
    totalQuantity: 5,
    totalCost: 75.00,
    idempotencyKey: trKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const linesTr: StockTransferLine[] = [
    {
      id: `trl-${sufTr}-1`,
      tenantId,
      companyId: tenantId,
      transferId: transfer1.id,
      itemId: itemId1,
      itemCode: `ITM-1-${sufInit}`.slice(0, 32),
      itemNameAr: 'صنف اختباري 1',
      quantity: 5,
      unitCost: 15.00,
      totalCost: 75.00,
    },
  ];

  const [trRes1, trRes2] = await Promise.all([
    adapter.createStockTransfer(tenantId, transfer1, linesTr, trKey),
    adapter.createStockTransfer(tenantId, transfer1, linesTr, trKey),
  ]);

  const trCountParallel = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_transfers WHERE id = $1', [transfer1.id])).rows[0].c);
  const trLineCountParallel = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_transfer_lines WHERE transfer_id = $1', [transfer1.id])).rows[0].c);

  console.log(`[2.A Parallel] Result 1 success: ${trRes1.success}, Result 2 success: ${trRes2.success}`);
  console.log(`[2.A Parallel] Transfer count: ${trCountParallel} (Expected 1), Line count: ${trLineCountParallel} (Expected 1)`);

  if (!trRes1.success || !trRes2.success || trCountParallel !== 1 || trLineCountParallel !== 1) {
    throw new Error('createStockTransfer parallel test failed');
  }

  // 2.B Sequential Replay
  const trRes3 = await adapter.createStockTransfer(tenantId, transfer1, linesTr, trKey);
  const trCountReplay = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_transfers WHERE id = $1', [transfer1.id])).rows[0].c);

  console.log(`[2.B Replay] Replay success: ${trRes3.success}`);
  console.log(`[2.B Replay] Transfer rows count: ${trCountReplay} (No duplicate: ${trCountReplay === 1})`);

  if (!trRes3.success || trCountReplay !== 1) {
    throw new Error('createStockTransfer sequential replay test failed');
  }

  // 2.C Failure & Retry with same key
  const sufTrFail = randSuffix();
  const trFailKey = `tr-key-fail-${sufTrFail}`;
  const failTransfer: StockTransfer = {
    ...transfer1,
    id: `tr-fail-${sufTrFail}`,
    transferNumber: `TR-F-${sufTrFail}`.slice(0, 32),
    sourceWarehouseId: 'non-existent-src-wh', // FK failure
    idempotencyKey: trFailKey,
  };

  const linesTrFail: StockTransferLine[] = [
    {
      ...linesTr[0],
      id: `trl-f-${sufTrFail}`,
      transferId: failTransfer.id,
    },
  ];

  const failTrRes = await adapter.createStockTransfer(tenantId, failTransfer, linesTrFail, trFailKey);
  console.log(`[2.C Failure] Non-existent warehouse transfer success: ${failTrRes.success} (Expected false)`);
  if (failTrRes.success) throw new Error('createStockTransfer should fail for non-existent warehouse');

  const trKeyInProg = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_idempotency_keys WHERE idempotency_key = $1',
    [trFailKey]
  )).rows[0].c);
  console.log(`[2.C Failure] Idempotency key poisoned in DB: ${trKeyInProg} (Expected 0)`);
  if (trKeyInProg !== 0) throw new Error('Idempotency key was poisoned after failure');

  // Fix cause: valid warehouse
  const fixedTransfer: StockTransfer = {
    ...failTransfer,
    sourceWarehouseId: whId1,
  };
  const retryTrRes = await adapter.createStockTransfer(tenantId, fixedTransfer, linesTrFail, trFailKey);
  if (!retryTrRes.success) {
    console.log('retryTrRes error:', retryTrRes.error);
  }
  const trCountAfterRetry = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_transfers WHERE id = $1', [failTransfer.id])).rows[0].c);

  console.log(`[2.C Retry] Retry with same key success: ${retryTrRes.success} (Expected true)`);
  console.log(`[2.C Retry] Transfer rows count: ${trCountAfterRetry} (Expected 1)`);

  if (!retryTrRes.success || trCountAfterRetry !== 1) {
    throw new Error('createStockTransfer retry with same key failed');
  }
  console.log('✓ createStockTransfer: ALL TESTS PASSED\n');

  // ---------------------------------------------------------------------------
  // 3) اختبار updateStockTransferStatus
  // ---------------------------------------------------------------------------
  console.log('--- 3. TESTING updateStockTransferStatus ---');
  const sufUpTr = randSuffix();
  const upTrKey = `uptr-key-parallel-${sufUpTr}`;

  const [uptrRes1, uptrRes2] = await Promise.all([
    adapter.updateStockTransferStatus(tenantId, transfer1.id, 'IN_TRANSIT', 'USR-DISPATCH', 'سائق النقل', upTrKey),
    adapter.updateStockTransferStatus(tenantId, transfer1.id, 'IN_TRANSIT', 'USR-DISPATCH', 'سائق النقل', upTrKey),
  ]);

  const trStatusInDb = (await pool.query('SELECT status, dispatched_by FROM an_stock_transfers WHERE id = $1', [transfer1.id])).rows[0];

  console.log(`[3.A Parallel] Result 1 success: ${uptrRes1.success}, Result 2 success: ${uptrRes2.success}`);
  console.log(`[3.A Parallel] Status in DB: ${trStatusInDb.status} (Expected IN_TRANSIT), Dispatched By: ${trStatusInDb.dispatched_by}`);

  if (!uptrRes1.success || !uptrRes2.success || trStatusInDb.status !== 'IN_TRANSIT') {
    throw new Error('updateStockTransferStatus parallel test failed');
  }

  // 3.B Sequential Replay
  const uptrRes3 = await adapter.updateStockTransferStatus(tenantId, transfer1.id, 'IN_TRANSIT', 'USR-DISPATCH', 'سائق النقل', upTrKey);
  console.log(`[3.B Replay] Replay success: ${uptrRes3.success}, Status: ${uptrRes3.data?.status}`);

  if (!uptrRes3.success || uptrRes3.data?.status !== 'IN_TRANSIT') {
    throw new Error('updateStockTransferStatus sequential replay test failed');
  }

  // 3.C Failure (404 Not Found) & Retry with same key
  const sufUptrFail = randSuffix();
  const uptrFailKey = `uptr-key-fail-${sufUptrFail}`;
  const failUptrRes = await adapter.updateStockTransferStatus(tenantId, 'non-existent-transfer-id', 'RECEIVED', 'USR-02', 'مستلم', uptrFailKey);
  console.log(`[3.C Failure] Non-existent transfer status update success: ${failUptrRes.success} (Expected false), status: ${failUptrRes.error?.status}`);
  if (failUptrRes.success || failUptrRes.error?.status !== 404) {
    throw new Error('updateStockTransferStatus should fail with 404 for non-existent transfer');
  }

  const uptrKeyInProg = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_idempotency_keys WHERE idempotency_key = $1',
    [uptrFailKey]
  )).rows[0].c);
  console.log(`[3.C Failure] Idempotency key poisoned in DB: ${uptrKeyInProg} (Expected 0)`);
  if (uptrKeyInProg !== 0) throw new Error('Idempotency key was poisoned after failure');

  // Retry with SAME key on valid transfer
  const retryUptrRes = await adapter.updateStockTransferStatus(tenantId, transfer1.id, 'RECEIVED', 'USR-02', 'مستلم الفرع', uptrFailKey);
  const statusAfterRetry = (await pool.query('SELECT status, received_by FROM an_stock_transfers WHERE id = $1', [transfer1.id])).rows[0];

  console.log(`[3.C Retry] Retry with same key success: ${retryUptrRes.success} (Expected true)`);
  console.log(`[3.C Retry] Status After Retry: ${statusAfterRetry.status} (Expected RECEIVED)`);

  if (!retryUptrRes.success || statusAfterRetry.status !== 'RECEIVED') {
    throw new Error('updateStockTransferStatus retry with same key failed');
  }
  console.log('✓ updateStockTransferStatus: ALL TESTS PASSED\n');

  // ---------------------------------------------------------------------------
  // 4) اختبار createStockCount
  // ---------------------------------------------------------------------------
  console.log('--- 4. TESTING createStockCount ---');
  const sufCnt = randSuffix();
  const cntKey = `cnt-key-parallel-${sufCnt}`;
  const count1: StockCount = {
    id: `cnt-${sufCnt}-1`,
    tenantId,
    companyId: tenantId,
    countNumber: `CNT-${sufCnt}-1`.slice(0, 32),
    countType: 'PERIODIC',
    warehouseId: whId1,
    warehouseNameAr: 'المستودع الرئيسي',
    status: 'IN_PROGRESS',
    performedBy: 'USR-PERF-01',
    performedByName: 'مسؤول الجرد الميداني',
    performedAt: new Date().toISOString(),
    totalItemsCount: 1,
    hasVariance: true,
    netVarianceAmount: 50.00,
    idempotencyKey: cntKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const linesCnt: StockCountLine[] = [
    {
      id: `cntl-${sufCnt}-1`,
      tenantId,
      companyId: tenantId,
      countId: count1.id,
      itemId: itemId1,
      itemCode: `ITM-1-${sufInit}`.slice(0, 32),
      itemNameAr: 'صنف اختباري 1',
      systemQty: 10,
      countedQty: 12,
      varianceQty: 2,
      unitCost: 25.00,
      varianceAmount: 50.00,
    },
  ];

  const [cntRes1, cntRes2] = await Promise.all([
    adapter.createStockCount(tenantId, count1, linesCnt, cntKey),
    adapter.createStockCount(tenantId, count1, linesCnt, cntKey),
  ]);

  const cntCountParallel = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_counts WHERE id = $1', [count1.id])).rows[0].c);
  const cntLineCountParallel = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_count_lines WHERE count_id = $1', [count1.id])).rows[0].c);

  console.log(`[4.A Parallel] Result 1 success: ${cntRes1.success}, Result 2 success: ${cntRes2.success}`);
  console.log(`[4.A Parallel] Count rows: ${cntCountParallel} (Expected 1), Line rows: ${cntLineCountParallel} (Expected 1)`);

  if (!cntRes1.success || !cntRes2.success || cntCountParallel !== 1 || cntLineCountParallel !== 1) {
    throw new Error('createStockCount parallel test failed');
  }

  // 4.B Sequential Replay
  const cntRes3 = await adapter.createStockCount(tenantId, count1, linesCnt, cntKey);
  const cntCountReplay = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_counts WHERE id = $1', [count1.id])).rows[0].c);

  console.log(`[4.B Replay] Replay success: ${cntRes3.success}`);
  console.log(`[4.B Replay] Count rows count: ${cntCountReplay} (No duplicate: ${cntCountReplay === 1})`);

  if (!cntRes3.success || cntCountReplay !== 1) {
    throw new Error('createStockCount sequential replay test failed');
  }

  // 4.C Failure & Retry with same key
  const sufCntFail = randSuffix();
  const cntFailKey = `cnt-key-fail-${sufCntFail}`;
  const failCount: StockCount = {
    ...count1,
    id: `cnt-fail-${sufCntFail}`,
    countNumber: `CNT-F-${sufCntFail}`.slice(0, 32),
    warehouseId: 'non-existent-wh-for-count', // FK failure
    idempotencyKey: cntFailKey,
  };

  const linesCntFail: StockCountLine[] = [
    {
      ...linesCnt[0],
      id: `cntl-f-${sufCntFail}`,
      countId: failCount.id,
    },
  ];

  const failCntRes = await adapter.createStockCount(tenantId, failCount, linesCntFail, cntFailKey);
  console.log(`[4.C Failure] Non-existent warehouse count success: ${failCntRes.success} (Expected false)`);
  if (failCntRes.success) throw new Error('createStockCount should fail for non-existent warehouse');

  const cntKeyInProg = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_idempotency_keys WHERE idempotency_key = $1',
    [cntFailKey]
  )).rows[0].c);
  console.log(`[4.C Failure] Idempotency key poisoned in DB: ${cntKeyInProg} (Expected 0)`);
  if (cntKeyInProg !== 0) throw new Error('Idempotency key was poisoned after failure');

  // Fix cause: valid warehouse
  const fixedCount: StockCount = {
    ...failCount,
    warehouseId: whId1,
  };
  const retryCntRes = await adapter.createStockCount(tenantId, fixedCount, linesCntFail, cntFailKey);
  const cntCountAfterRetry = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_counts WHERE id = $1', [failCount.id])).rows[0].c);

  console.log(`[4.C Retry] Retry with same key success: ${retryCntRes.success} (Expected true)`);
  console.log(`[4.C Retry] Count rows count: ${cntCountAfterRetry} (Expected 1)`);

  if (!retryCntRes.success || cntCountAfterRetry !== 1) {
    throw new Error('createStockCount retry with same key failed');
  }
  console.log('✓ createStockCount: ALL TESTS PASSED\n');

  // ---------------------------------------------------------------------------
  // 5) اختبار updateStockCountStatus
  // ---------------------------------------------------------------------------
  console.log('--- 5. TESTING updateStockCountStatus ---');
  const sufUpCnt = randSuffix();
  const upCntKey = `upcnt-key-parallel-${sufUpCnt}`;

  // 5.A Parallel (Independent approver != performer USR-PERF-01)
  const [upcntRes1, upcntRes2] = await Promise.all([
    adapter.updateStockCountStatus(tenantId, count1.id, 'APPROVED', 'USR-APPROVER-02', 'مدير التدقيق المخزني', undefined, upCntKey),
    adapter.updateStockCountStatus(tenantId, count1.id, 'APPROVED', 'USR-APPROVER-02', 'مدير التدقيق المخزني', undefined, upCntKey),
  ]);

  const countStatusInDb = (await pool.query('SELECT status, approved_by FROM an_stock_counts WHERE id = $1', [count1.id])).rows[0];

  console.log(`[5.A Parallel] Result 1 success: ${upcntRes1.success}, Result 2 success: ${upcntRes2.success}`);
  console.log(`[5.A Parallel] Status in DB: ${countStatusInDb.status} (Expected APPROVED), Approved By: ${countStatusInDb.approved_by}`);

  if (!upcntRes1.success || !upcntRes2.success || countStatusInDb.status !== 'APPROVED') {
    throw new Error('updateStockCountStatus parallel test failed');
  }

  // 5.B Sequential Replay
  const upcntRes3 = await adapter.updateStockCountStatus(tenantId, count1.id, 'APPROVED', 'USR-APPROVER-02', 'مدير التدقيق المخزني', undefined, upCntKey);
  console.log(`[5.B Replay] Replay success: ${upcntRes3.success}, Status: ${upcntRes3.data?.status}`);

  if (!upcntRes3.success || upcntRes3.data?.status !== 'APPROVED') {
    throw new Error('updateStockCountStatus sequential replay test failed');
  }

  // 5.C Failure (SoD 403: Performer cannot approve) & Retry with same key
  // Create another in-progress count performed by USR-PERF-02
  const countToSod: StockCount = {
    id: `cnt-sod-${Date.now()}`,
    tenantId,
    companyId: tenantId,
    countNumber: `CNT-SOD-${Date.now()}`.slice(0, 32),
    countType: 'PERIODIC',
    warehouseId: whId1,
    warehouseNameAr: 'المستودع الرئيسي',
    status: 'IN_PROGRESS',
    performedBy: 'USR-PERF-02',
    performedByName: 'مسؤول الجرد',
    performedAt: new Date().toISOString(),
    totalItemsCount: 1,
    hasVariance: false,
    netVarianceAmount: 0,
    idempotencyKey: `cnt-sod-key-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await adapter.createStockCount(tenantId, countToSod, [], `cnt-sod-key-${Date.now()}`);

  const upcntFailKey = `upcnt-key-sod-${Date.now()}`;
  const sodFailRes = await adapter.updateStockCountStatus(
    tenantId,
    countToSod.id,
    'APPROVED',
    'USR-PERF-02', // Same as performedBy -> SoD 403 Violation
    'نفس القائم بالجرد',
    undefined,
    upcntFailKey
  );

  console.log(`[5.C Failure] SoD violation attempt success: ${sodFailRes.success} (Expected false), status: ${sodFailRes.error?.status}`);
  if (sodFailRes.success || sodFailRes.error?.status !== 403) {
    throw new Error('updateStockCountStatus should fail with 403 on SoD violation');
  }

  const upcntKeyInProg = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_idempotency_keys WHERE idempotency_key = $1',
    [upcntFailKey]
  )).rows[0].c);
  console.log(`[5.C Failure] Idempotency key poisoned in DB: ${upcntKeyInProg} (Expected 0)`);
  if (upcntKeyInProg !== 0) throw new Error('Idempotency key was poisoned after failure');

  // Fix cause: authorized distinct manager approves with SAME key
  const retryUpcntRes = await adapter.updateStockCountStatus(
    tenantId,
    countToSod.id,
    'APPROVED',
    'USR-MANAGER-99',
    'المدير المالي المعتمد',
    undefined,
    upcntFailKey
  );
  const statusAfterSodRetry = (await pool.query('SELECT status, approved_by FROM an_stock_counts WHERE id = $1', [countToSod.id])).rows[0];

  console.log(`[5.C Retry] Retry with same key after SoD fix success: ${retryUpcntRes.success} (Expected true)`);
  console.log(`[5.C Retry] Status After Retry: ${statusAfterSodRetry.status} (Expected APPROVED)`);

  if (!retryUpcntRes.success || statusAfterSodRetry.status !== 'APPROVED') {
    throw new Error('updateStockCountStatus retry with same key failed');
  }
  console.log('✓ updateStockCountStatus: ALL TESTS PASSED\n');

  // ---------------------------------------------------------------------------
  // 6) اختبار saveStockDocument
  // ---------------------------------------------------------------------------
  console.log('--- 6. TESTING saveStockDocument ---');
  const sufDoc = randSuffix();
  const docKey = `doc-key-parallel-${sufDoc}`;
  const doc1: StockDocument = {
    id: `doc-${sufDoc}-1`,
    tenantId,
    companyId: tenantId,
    documentNumber: `DOC-${sufDoc}-1`.slice(0, 32),
    documentType: 'RECEIPT',
    warehouseId: whId1,
    warehouseNameAr: 'المستودع الرئيسي',
    status: 'POSTED',
    totalQuantity: 15,
    totalCost: 150.00,
    performedBy: 'USR-01',
    performedByName: 'أمين المستودع',
    idempotencyKey: docKey,
    createdAt: new Date().toISOString(),
    postedAt: new Date().toISOString(),
    lines: [
      {
        id: `docl-${sufDoc}-1`,
        tenantId,
        companyId: tenantId,
        documentId: `doc-${sufDoc}-1`,
        lineNumber: 1,
        itemId: itemId1,
        itemCode: `ITM-1-${sufInit}`.slice(0, 32),
        itemNameAr: 'صنف اختباري 1',
        uom: 'حبه',
        quantity: 15,
        unitCost: 10.00,
        totalCost: 150.00,
      },
    ],
  };

  const [docRes1, docRes2] = await Promise.all([
    adapter.saveStockDocument(tenantId, doc1, docKey),
    adapter.saveStockDocument(tenantId, doc1, docKey),
  ]);

  const docCountParallel = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_documents WHERE id = $1', [doc1.id])).rows[0].c);
  const docLineCountParallel = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_document_lines WHERE document_id = $1', [doc1.id])).rows[0].c);

  console.log(`[6.A Parallel] Result 1 success: ${docRes1.success}, Result 2 success: ${docRes2.success}`);
  console.log(`[6.A Parallel] Document count: ${docCountParallel} (Expected 1), Line count: ${docLineCountParallel} (Expected 1)`);

  if (!docRes1.success || !docRes2.success || docCountParallel !== 1 || docLineCountParallel !== 1) {
    throw new Error('saveStockDocument parallel test failed');
  }

  // 6.B Sequential Replay
  const docRes3 = await adapter.saveStockDocument(tenantId, doc1, docKey);
  const docCountReplay = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_documents WHERE id = $1', [doc1.id])).rows[0].c);

  console.log(`[6.B Replay] Replay success: ${docRes3.success}`);
  console.log(`[6.B Replay] Document rows count: ${docCountReplay} (No duplicate: ${docCountReplay === 1})`);

  if (!docRes3.success || docCountReplay !== 1) {
    throw new Error('saveStockDocument sequential replay test failed');
  }

  // 6.C Failure & Retry with same key
  const sufDocFail = randSuffix();
  const docFailKey = `doc-key-fail-${sufDocFail}`;
  const failDoc: StockDocument = {
    ...doc1,
    id: `doc-fail-${sufDocFail}`,
    documentNumber: `DOC-F-${sufDocFail}`.slice(0, 32),
    warehouseId: 'non-existent-warehouse-id', // FK failure
    idempotencyKey: docFailKey,
    lines: [
      {
        ...doc1.lines[0],
        id: `docl-fail-${sufDocFail}`,
        documentId: `doc-fail-${sufDocFail}`,
      },
    ],
  };

  const failDocRes = await adapter.saveStockDocument(tenantId, failDoc, docFailKey);
  console.log(`[6.C Failure] Non-existent warehouse document success: ${failDocRes.success} (Expected false)`);
  if (failDocRes.success) throw new Error('saveStockDocument should fail for non-existent warehouse');

  const docKeyInProg = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_idempotency_keys WHERE idempotency_key = $1',
    [docFailKey]
  )).rows[0].c);
  console.log(`[6.C Failure] Idempotency key poisoned in DB: ${docKeyInProg} (Expected 0)`);
  if (docKeyInProg !== 0) throw new Error('Idempotency key was poisoned after failure');

  // Fix cause: valid warehouse
  const fixedDoc: StockDocument = {
    ...failDoc,
    warehouseId: whId1,
  };
  const retryDocRes = await adapter.saveStockDocument(tenantId, fixedDoc, docFailKey);
  const docCountAfterRetry = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_documents WHERE id = $1', [failDoc.id])).rows[0].c);

  console.log(`[6.C Retry] Retry with same key success: ${retryDocRes.success} (Expected true)`);
  console.log(`[6.C Retry] Document rows count: ${docCountAfterRetry} (Expected 1)`);

  if (!retryDocRes.success || docCountAfterRetry !== 1) {
    throw new Error('saveStockDocument retry with same key failed');
  }
  console.log('✓ saveStockDocument: ALL TESTS PASSED\n');

  // ---------------------------------------------------------------------------
  // 7) الفحص النهائي: count(*) من an_idempotency_keys بحالة IN_PROGRESS = 0
  // ---------------------------------------------------------------------------
  console.log('--- 7. FINAL CHECK: IN_PROGRESS IDEMPOTENCY KEYS ---');
  const inProgressCount = Number((await pool.query(
    "SELECT count(*)::int as c FROM an_idempotency_keys WHERE status = 'IN_PROGRESS'"
  )).rows[0].c);

  console.log(`Final IN_PROGRESS keys in database: ${inProgressCount} (Expected 0)`);
  if (inProgressCount !== 0) {
    throw new Error(`Found ${inProgressCount} dangling IN_PROGRESS idempotency keys!`);
  }
  console.log('✓ IN_PROGRESS CHECK: EXACTLY ZERO DANGLING KEYS\n');

  console.log('========================================================================');
  console.log('       ALL BATCH (C) GROUP 2 IDEMPOTENCY TESTS COMPLETED: 100% PASS     ');
  console.log('========================================================================');
  process.exit(0);
}

run().catch((err) => {
  console.error('TEST SUITE RUNTIME ERROR:', err);
  process.exit(1);
});
