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

async function main() {
  console.log('========================================================================');
  console.log('    A.N ERP v7.2 — BATCH (C) GROUP 2 EFFECTS & IDEMPOTENCY VERIFICATION');
  console.log('========================================================================\n');

  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const pool = (adapter as any).pool;
  const tenantId = 'tenant-main';

  // Ensure non-negative stock constraint exists
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_an_warehouse_stock_non_negative'
      ) THEN
        ALTER TABLE an_warehouse_stock ADD CONSTRAINT chk_an_warehouse_stock_non_negative CHECK (current_qty >= 0);
      END IF;
    END $$;
  `);

  // Helper setup: Create test warehouses and item
  const suf = randSuffix();
  const whSrcId = `wh-src-${suf}`;
  const whTgtId = `wh-tgt-${suf}`;
  const itemId = `itm-${suf}`;

  await pool.query(
    `INSERT INTO an_warehouses (id, tenant_id, company_id, code, name_ar, name_en, is_active, is_default, valuation_method, created_at, updated_at)
     VALUES 
      ($1, $2, $2, $3, 'المستودع الرئيسي - المصدر', 'Main Source WH', true, true, 'WAC', NOW(), NOW()),
      ($4, $2, $2, $5, 'مستودع الفرع - الوجهة', 'Branch Target WH', true, false, 'WAC', NOW(), NOW())`,
    [whSrcId, tenantId, `WH-S-${suf}`.slice(0, 32), whTgtId, `WH-T-${suf}`.slice(0, 32)]
  );

  await pool.query(
    `INSERT INTO an_stock_items (id, tenant_id, company_id, item_code, name_ar, name_en, category, uom, average_cost, is_active, created_at, updated_at)
     VALUES 
      ($1, $2, $2, $3, 'صنف اختباري موحد', 'Unified Test Item', 'مخزون', 'حبه', 50.00, true, NOW(), NOW())`,
    [itemId, tenantId, `SKU-${suf}`.slice(0, 32)]
  );

  // Initial stock injection: 100 units @ 50.00 into whSrcId
  const initKey = `init-stock-${suf}`;
  const initRes = await adapter.recordStockMovement(tenantId, {
    id: `mv-init-${suf}`,
    tenantId,
    companyId: tenantId,
    movementNumber: `MV-INIT-${suf}`.slice(0, 32),
    movementType: 'RECEIPT',
    warehouseId: whSrcId,
    warehouseNameAr: 'المستودع الرئيسي - المصدر',
    itemId,
    itemCode: `SKU-${suf}`.slice(0, 32),
    itemNameAr: 'صنف اختباري موحد',
    quantity: 100,
    unitCost: 50.00,
    totalCost: 5000.00,
    balanceAfterQty: 0,
    performedBy: 'USR-SEED',
    performedByName: 'أمين المستودع الرئيسي',
    timestamp: new Date().toISOString(),
    idempotencyKey: initKey,
  }, initKey);

  if (!initRes.success) {
    throw new Error(`Failed to initialize stock: ${JSON.stringify(initRes.error)}`);
  }

  // ---------------------------------------------------------------------------
  // 1) createStockTransfer + updateStockTransferStatus (شحن ثم استلام)
  // ---------------------------------------------------------------------------
  console.log('--- 1. TESTING createStockTransfer + updateStockTransferStatus (شحن ثم استلام) ---');

  // Verify stock before transfer
  const getQty = async (whId: string): Promise<number> => {
    const r = await pool.query(
      'SELECT current_qty FROM an_warehouse_stock WHERE tenant_id = $1 AND warehouse_id = $2 AND item_id = $3',
      [tenantId, whId, itemId]
    );
    return r.rows.length > 0 ? Number(r.rows[0].current_qty) : 0;
  };

  const srcQtyBeforeTransfer = await getQty(whSrcId);
  const tgtQtyBeforeTransfer = await getQty(whTgtId);
  console.log(`[Before Transfer] Source WH Qty: ${srcQtyBeforeTransfer} (Expected 100), Target WH Qty: ${tgtQtyBeforeTransfer} (Expected 0)`);
  if (srcQtyBeforeTransfer !== 100 || tgtQtyBeforeTransfer !== 0) {
    throw new Error('Initial stock quantity mismatch before transfer');
  }

  // Step 1: Dispatch (شحن) with 2 parallel calls sharing same idempotency key
  const trfKey = `trf-key-${suf}`;
  const transferId = `trf-${suf}`;
  const transferNumber = `TRF-NUM-${suf}`.slice(0, 32);

  const transferDoc: StockTransfer = {
    id: transferId,
    tenantId,
    companyId: tenantId,
    transferNumber,
    sourceWarehouseId: whSrcId,
    sourceWarehouseNameAr: 'المستودع الرئيسي - المصدر',
    targetWarehouseId: whTgtId,
    targetWarehouseNameAr: 'مستودع الفرع - الوجهة',
    status: 'IN_TRANSIT',
    requestedBy: 'USR-DISPATCH',
    requestedByName: 'مشرف التحويل المخزني',
    requestedAt: new Date().toISOString(),
    dispatchedBy: 'USR-DISPATCH',
    dispatchedByName: 'مشرف التحويل المخزني',
    dispatchedAt: new Date().toISOString(),
    totalItemsCount: 1,
    totalQuantity: 25,
    totalCost: 1250.00,
    idempotencyKey: trfKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const transferLines: StockTransferLine[] = [
    {
      id: `trfl-${suf}-1`,
      tenantId,
      companyId: tenantId,
      transferId,
      itemId,
      itemCode: `SKU-${suf}`.slice(0, 32),
      itemNameAr: 'صنف اختباري موحد',
      quantity: 25,
      unitCost: 50.00,
      totalCost: 1250.00,
    },
  ];

  const dispatchMovement: StockMovement = {
    id: `mv-trf-out-${suf}`,
    tenantId,
    companyId: tenantId,
    movementNumber: `MV-TRF-OUT-${suf}`.slice(0, 32),
    movementType: 'TRANSFER_OUT',
    warehouseId: whSrcId,
    warehouseNameAr: 'المستودع الرئيسي - المصدر',
    itemId,
    itemCode: `SKU-${suf}`.slice(0, 32),
    itemNameAr: 'صنف اختباري موحد',
    quantity: 25,
    unitCost: 50.00,
    totalCost: 1250.00,
    balanceAfterQty: 0,
    sourceDocumentType: 'STOCK_TRANSFER',
    sourceDocumentId: transferId,
    sourceDocumentNumber: transferNumber,
    performedBy: 'USR-DISPATCH',
    performedByName: 'مشرف التحويل المخزني',
    timestamp: new Date().toISOString(),
    idempotencyKey: `${trfKey}-dispatch`,
  };

  const executeDispatch = async () => {
    const mvRes = await adapter.recordStockMovement(tenantId, dispatchMovement, `${trfKey}-dispatch`);
    const trRes = await adapter.createStockTransfer(tenantId, transferDoc, transferLines, trfKey);
    return { mvRes, trRes };
  };

  // Run two parallel dispatch requests with same key
  const [dispRes1, dispRes2] = await Promise.all([executeDispatch(), executeDispatch()]);

  const srcQtyAfterDispatch = await getQty(whSrcId);
  const tgtQtyAfterDispatch = await getQty(whTgtId);
  const transferCountInDb = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_transfers WHERE id = $1', [transferId])).rows[0].c);
  const dispatchMvCountInDb = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_movements WHERE id = $1', [dispatchMovement.id])).rows[0].c);

  console.log(`[Dispatch Parallel] Res1: ${dispRes1.trRes.success}, Res2: ${dispRes2.trRes.success}`);
  console.log(`[Dispatch Parallel] Source WH Qty: ${srcQtyAfterDispatch} (Expected 75: 100 - 25)` );
  console.log(`[Dispatch Parallel] Target WH Qty: ${tgtQtyAfterDispatch} (Expected 0)`);
  console.log(`[Dispatch Parallel] DB Transfers: ${transferCountInDb} (Expected 1), Movements: ${dispatchMvCountInDb} (Expected 1)`);

  if (!dispRes1.trRes.success || !dispRes2.trRes.success || srcQtyAfterDispatch !== 75 || tgtQtyAfterDispatch !== 0 || transferCountInDb !== 1 || dispatchMvCountInDb !== 1) {
    throw new Error('createStockTransfer parallel dispatch failed: stock deducted incorrectly or duplicates created');
  }

  // Sequential replay of dispatch
  const dispReplay = await executeDispatch();
  const srcQtyAfterDispReplay = await getQty(whSrcId);
  const tgtQtyAfterDispReplay = await getQty(whTgtId);
  console.log(`[Dispatch Replay] Success: ${dispReplay.trRes.success}, Source Qty: ${srcQtyAfterDispReplay} (Constant 75), Target Qty: ${tgtQtyAfterDispReplay} (Constant 0)`);
  if (!dispReplay.trRes.success || srcQtyAfterDispReplay !== 75 || tgtQtyAfterDispReplay !== 0) {
    throw new Error('createStockTransfer sequential replay modified stock or failed');
  }

  // Step 2: Receipt (استلام) with 2 parallel calls sharing same idempotency key
  const recvKey = `recv-key-${suf}`;
  const receiveMovement: StockMovement = {
    id: `mv-trf-in-${suf}`,
    tenantId,
    companyId: tenantId,
    movementNumber: `MV-TRF-IN-${suf}`.slice(0, 32),
    movementType: 'TRANSFER_IN',
    warehouseId: whTgtId,
    warehouseNameAr: 'مستودع الفرع - الوجهة',
    itemId,
    itemCode: `SKU-${suf}`.slice(0, 32),
    itemNameAr: 'صنف اختباري موحد',
    quantity: 25,
    unitCost: 50.00,
    totalCost: 1250.00,
    balanceAfterQty: 0,
    sourceDocumentType: 'STOCK_TRANSFER',
    sourceDocumentId: transferId,
    sourceDocumentNumber: transferNumber,
    performedBy: 'USR-RECEIVER',
    performedByName: 'أمين مستودع الفرع',
    timestamp: new Date().toISOString(),
    idempotencyKey: `${recvKey}-recv`,
  };

  const executeReceive = async () => {
    const mvRes = await adapter.recordStockMovement(tenantId, receiveMovement, `${recvKey}-recv`);
    const upRes = await adapter.updateStockTransferStatus(
      tenantId,
      transferId,
      'RECEIVED',
      'USR-RECEIVER',
      'أمين مستودع الفرع',
      recvKey
    );
    return { mvRes, upRes };
  };

  const [recvRes1, recvRes2] = await Promise.all([executeReceive(), executeReceive()]);

  const srcQtyAfterReceive = await getQty(whSrcId);
  const tgtQtyAfterReceive = await getQty(whTgtId);
  const finalTransferRow = (await pool.query('SELECT status, received_by FROM an_stock_transfers WHERE id = $1', [transferId])).rows[0];
  const receiveMvCountInDb = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_movements WHERE id = $1', [receiveMovement.id])).rows[0].c);

  console.log(`[Receive Parallel] Res1: ${recvRes1.upRes.success}, Res2: ${recvRes2.upRes.success}`);
  console.log(`[Receive Parallel] Source WH Qty: ${srcQtyAfterReceive} (Expected 75), Target WH Qty: ${tgtQtyAfterReceive} (Expected 25: 0 + 25)`);
  console.log(`[Receive Parallel] Status in DB: ${finalTransferRow.status} (Expected RECEIVED), Receive Movements: ${receiveMvCountInDb} (Expected 1)`);

  if (!recvRes1.upRes.success || !recvRes2.upRes.success || srcQtyAfterReceive !== 75 || tgtQtyAfterReceive !== 25 || finalTransferRow.status !== 'RECEIVED' || receiveMvCountInDb !== 1) {
    throw new Error('updateStockTransferStatus parallel receive failed: quantities moved more than once');
  }

  // Sequential replay of receive
  const recvReplay = await executeReceive();
  const srcQtyAfterRecvReplay = await getQty(whSrcId);
  const tgtQtyAfterRecvReplay = await getQty(whTgtId);
  console.log(`[Receive Replay] Success: ${recvReplay.upRes.success}, Source Qty: ${srcQtyAfterRecvReplay} (Constant 75), Target Qty: ${tgtQtyAfterRecvReplay} (Constant 25)`);
  if (!recvReplay.upRes.success || srcQtyAfterRecvReplay !== 75 || tgtQtyAfterRecvReplay !== 25) {
    throw new Error('updateStockTransferStatus sequential replay modified stock or failed');
  }
  console.log('✓ createStockTransfer + updateStockTransferStatus: QUANTITY MOVED EXACTLY ONCE IN EACH WAREHOUSE\n');

  // ---------------------------------------------------------------------------
  // 2) createStockCount + updateStockCountStatus (اعتماد)
  // ---------------------------------------------------------------------------
  console.log('--- 2. TESTING createStockCount + updateStockCountStatus (اعتماد) ---');
  const cntSuf = randSuffix();
  const countKey = `cnt-key-${cntSuf}`;
  const countId = `cnt-${cntSuf}`;
  const countNumber = `CNT-${cntSuf}`.slice(0, 32);

  // Count in whSrcId: system has 75, actual count found 70 (variance = -5 deficit, amount = -250.00)
  const stockCountDoc: StockCount = {
    id: countId,
    tenantId,
    companyId: tenantId,
    countNumber,
    countType: 'PERIODIC',
    warehouseId: whSrcId,
    warehouseNameAr: 'المستودع الرئيسي - المصدر',
    status: 'IN_PROGRESS',
    performedBy: 'USR-PERFORMER',
    performedByName: 'عضو لجنة الجرد',
    performedAt: new Date().toISOString(),
    totalItemsCount: 1,
    hasVariance: true,
    netVarianceAmount: -250.00,
    idempotencyKey: countKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const stockCountLines: StockCountLine[] = [
    {
      id: `cntl-${cntSuf}-1`,
      tenantId,
      companyId: tenantId,
      countId,
      itemId,
      itemCode: `SKU-${suf}`.slice(0, 32),
      itemNameAr: 'صنف اختباري موحد',
      systemQty: 75,
      countedQty: 70,
      varianceQty: -5,
      unitCost: 50.00,
      varianceAmount: -250.00,
    },
  ];

  // Create count
  const createCntRes = await adapter.createStockCount(tenantId, stockCountDoc, stockCountLines, countKey);
  if (!createCntRes.success) throw new Error('createStockCount failed');

  // Approval & variance adjustment: 2 parallel calls with approveKey
  const approveKey = `cnt-approve-key-${cntSuf}`;
  const adjMovement: StockMovement = {
    id: `mv-adj-cnt-${cntSuf}`,
    tenantId,
    companyId: tenantId,
    movementNumber: `MV-ADJ-${cntSuf}`.slice(0, 32),
    movementType: 'COUNT_ADJUSTMENT_LOSS',
    warehouseId: whSrcId,
    warehouseNameAr: 'المستودع الرئيسي - المصدر',
    itemId,
    itemCode: `SKU-${suf}`.slice(0, 32),
    itemNameAr: 'صنف اختباري موحد',
    quantity: 5,
    unitCost: 50.00,
    totalCost: 250.00,
    balanceAfterQty: 70,
    sourceDocumentType: 'STOCK_COUNT',
    sourceDocumentId: countId,
    sourceDocumentNumber: countNumber,
    performedBy: 'USR-APPROVER-INDEP',
    performedByName: 'المدير المالي المعتمد',
    timestamp: new Date().toISOString(),
    idempotencyKey: `${approveKey}-adj`,
  };

  const executeCountApproval = async () => {
    const mvRes = await adapter.recordStockMovement(tenantId, adjMovement, `${approveKey}-adj`);
    const upRes = await adapter.updateStockCountStatus(
      tenantId,
      countId,
      'APPROVED',
      'USR-APPROVER-INDEP',
      'المدير المالي المعتمد',
      undefined,
      approveKey
    );
    return { mvRes, upRes };
  };

  const [apRes1, apRes2] = await Promise.all([executeCountApproval(), executeCountApproval()]);

  const srcQtyAfterCountApproval = await getQty(whSrcId);
  const countRowInDb = (await pool.query('SELECT status, approved_by FROM an_stock_counts WHERE id = $1', [countId])).rows[0];
  const adjMvCountInDb = Number((await pool.query(
    "SELECT count(*)::int as c FROM an_stock_movements WHERE source_document_type = 'STOCK_COUNT' AND source_document_id = $1",
    [countId]
  )).rows[0].c);

  console.log(`[Count Approval Parallel] Res1: ${apRes1.upRes.success}, Res2: ${apRes2.upRes.success}`);
  console.log(`[Count Approval Parallel] Final WH Qty: ${srcQtyAfterCountApproval} (Expected 70: 75 - 5 settled once)`);
  console.log(`[Count Approval Parallel] Status: ${countRowInDb.status} (Expected APPROVED), Adjustment Movements: ${adjMvCountInDb} (Expected 1)`);

  if (!apRes1.upRes.success || !apRes2.upRes.success || srcQtyAfterCountApproval !== 70 || countRowInDb.status !== 'APPROVED' || adjMvCountInDb !== 1) {
    throw new Error('updateStockCountStatus parallel approval failed: variance adjusted more than once');
  }

  // Sequential replay of count approval
  const apReplay = await executeCountApproval();
  const srcQtyAfterCountReplay = await getQty(whSrcId);
  const adjMvCountAfterReplay = Number((await pool.query(
    "SELECT count(*)::int as c FROM an_stock_movements WHERE source_document_type = 'STOCK_COUNT' AND source_document_id = $1",
    [countId]
  )).rows[0].c);

  console.log(`[Count Approval Replay] Success: ${apReplay.upRes.success}, Final WH Qty: ${srcQtyAfterCountReplay} (Constant 70), Movements: ${adjMvCountAfterReplay} (Constant 1)`);
  if (!apReplay.upRes.success || srcQtyAfterCountReplay !== 70 || adjMvCountAfterReplay !== 1) {
    throw new Error('updateStockCountStatus replay modified stock or duplicated settlement');
  }
  console.log('✓ createStockCount + updateStockCountStatus: INVENTORY VARIANCE SETTLED EXACTLY ONCE\n');

  // ---------------------------------------------------------------------------
  // 3) saveStockDocument (حركات المخزون والكمية ومتوسط التكلفة)
  // ---------------------------------------------------------------------------
  console.log('--- 3. TESTING saveStockDocument (Movements count, Final Qty, and WAC) ---');
  // Current in whSrcId: Qty = 70, Cost = 50.00, Value = 3500.00
  // Receipt of 30 units @ 100.00 = 3000.00
  // New Qty = 100, New Total Value = 6500.00, New Average Cost = 65.00
  const docSuf = randSuffix();
  const docKey = `doc-key-${docSuf}`;
  const docId = `doc-${docSuf}`;
  const docNumber = `DOC-${docSuf}`.slice(0, 32);

  const stockDoc: StockDocument = {
    id: docId,
    tenantId,
    companyId: tenantId,
    documentNumber: docNumber,
    documentType: 'RECEIPT',
    warehouseId: whSrcId,
    warehouseNameAr: 'المستودع الرئيسي - المصدر',
    status: 'POSTED',
    totalQuantity: 30,
    totalCost: 3000.00,
    performedBy: 'USR-WAREHOUSE',
    performedByName: 'أمين المستودع الرئيسي',
    idempotencyKey: docKey,
    createdAt: new Date().toISOString(),
    postedAt: new Date().toISOString(),
    lines: [
      {
        id: `docl-${docSuf}-1`,
        tenantId,
        companyId: tenantId,
        documentId: docId,
        lineNumber: 1,
        itemId,
        itemCode: `SKU-${suf}`.slice(0, 32),
        itemNameAr: 'صنف اختباري موحد',
        uom: 'حبه',
        quantity: 30,
        unitCost: 100.00,
        totalCost: 3000.00,
      },
    ],
  };

  const docMovement: StockMovement = {
    id: `mv-doc-${docSuf}-1`,
    tenantId,
    companyId: tenantId,
    movementNumber: `MV-DOC-${docSuf}`.slice(0, 32),
    movementType: 'RECEIPT',
    warehouseId: whSrcId,
    warehouseNameAr: 'المستودع الرئيسي - المصدر',
    itemId,
    itemCode: `SKU-${suf}`.slice(0, 32),
    itemNameAr: 'صنف اختباري موحد',
    quantity: 30,
    unitCost: 100.00,
    totalCost: 3000.00,
    balanceAfterQty: 0,
    sourceDocumentType: 'STOCK_RECEIPT',
    sourceDocumentId: docId,
    sourceDocumentNumber: docNumber,
    performedBy: 'USR-WAREHOUSE',
    performedByName: 'أمين المستودع الرئيسي',
    timestamp: new Date().toISOString(),
    idempotencyKey: `${docKey}-line-1`,
  };

  const executeSaveDocument = async () => {
    const mvRes = await adapter.recordStockMovement(tenantId, docMovement, `${docKey}-line-1`);
    const docRes = await adapter.saveStockDocument(tenantId, stockDoc, docKey);
    return { mvRes, docRes };
  };

  const [docRes1, docRes2] = await Promise.all([executeSaveDocument(), executeSaveDocument()]);

  const stockRowAfterDoc = (await pool.query(
    'SELECT current_qty, average_cost, total_value FROM an_warehouse_stock WHERE tenant_id = $1 AND warehouse_id = $2 AND item_id = $3',
    [tenantId, whSrcId, itemId]
  )).rows[0];

  const docCountInDb = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_documents WHERE id = $1', [docId])).rows[0].c);
  const docMvCountInDb = Number((await pool.query(
    "SELECT count(*)::int as c FROM an_stock_movements WHERE source_document_id = $1",
    [docId]
  )).rows[0].c);

  console.log(`[StockDocument Parallel] Res1: ${docRes1.docRes.success}, Res2: ${docRes2.docRes.success}`);
  console.log(`[StockDocument Parallel] Document rows: ${docCountInDb} (Expected 1), Linked movements: ${docMvCountInDb} (Expected 1)`);
  console.log(`[StockDocument Parallel] Final Qty: ${Number(stockRowAfterDoc.current_qty)} (Expected 100: 70 + 30)`);
  console.log(`[StockDocument Parallel] Average Cost: ${Number(stockRowAfterDoc.average_cost)} (Expected 65.00), Total Value: ${Number(stockRowAfterDoc.total_value)} (Expected 6500.00)`);

  if (!docRes1.docRes.success || !docRes2.docRes.success || docCountInDb !== 1 || docMvCountInDb !== 1 || Number(stockRowAfterDoc.current_qty) !== 100 || Number(stockRowAfterDoc.average_cost) !== 65) {
    throw new Error('saveStockDocument parallel test failed: duplicated document or stock/WAC distorted');
  }

  // Sequential replay
  const docReplay = await executeSaveDocument();
  const stockRowAfterDocReplay = (await pool.query(
    'SELECT current_qty, average_cost, total_value FROM an_warehouse_stock WHERE tenant_id = $1 AND warehouse_id = $2 AND item_id = $3',
    [tenantId, whSrcId, itemId]
  )).rows[0];
  const docMvCountAfterReplay = Number((await pool.query(
    "SELECT count(*)::int as c FROM an_stock_movements WHERE source_document_id = $1",
    [docId]
  )).rows[0].c);

  console.log(`[StockDocument Replay] Success: ${docReplay.docRes.success}, Movements: ${docMvCountAfterReplay} (Constant 1), Qty: ${Number(stockRowAfterDocReplay.current_qty)} (Constant 100), Avg Cost: ${Number(stockRowAfterDocReplay.average_cost)} (Constant 65.00)`);
  if (!docReplay.docRes.success || docMvCountAfterReplay !== 1 || Number(stockRowAfterDocReplay.current_qty) !== 100 || Number(stockRowAfterDocReplay.average_cost) !== 65) {
    throw new Error('saveStockDocument sequential replay distorted stock or movements');
  }
  console.log('✓ saveStockDocument: DOCUMENT SAVED AND STOCK/WAC UPDATED ONCE\n');

  // ---------------------------------------------------------------------------
  // 4) recordStockMovement: فشل بكمية غير كافية (صرف أكبر من الرصيد) ثم إعادة بعد التوريد
  // ---------------------------------------------------------------------------
  console.log('--- 4. TESTING recordStockMovement: Insufficient stock failure & retry after supply ---');
  // Target warehouse (whTgtId) currently has exactly 25 units.
  const tgtCurrentQty = await getQty(whTgtId);
  console.log(`Current Target WH Qty: ${tgtCurrentQty} (Expected 25)`);

  const failSuf = randSuffix();
  const issueKey = `issue-key-${failSuf}`;
  const overIssueMovement: StockMovement = {
    id: `mv-issue-fail-${failSuf}`,
    tenantId,
    companyId: tenantId,
    movementNumber: `MV-ISS-F-${failSuf}`.slice(0, 32),
    movementType: 'ISSUE',
    warehouseId: whTgtId,
    warehouseNameAr: 'مستودع الفرع - الوجهة',
    itemId,
    itemCode: `SKU-${suf}`.slice(0, 32),
    itemNameAr: 'صنف اختباري موحد',
    quantity: 50, // 50 > 25 (insufficient stock!)
    unitCost: 50.00,
    totalCost: 2500.00,
    balanceAfterQty: 0,
    performedBy: 'USR-DISPATCH',
    performedByName: 'مسؤول الصرف',
    timestamp: new Date().toISOString(),
    idempotencyKey: issueKey,
  };

  // Attempt issue exceeding available stock
  const overIssueRes = await adapter.recordStockMovement(tenantId, overIssueMovement, issueKey);
  console.log(`[Insufficient Stock Attempt] Result success: ${overIssueRes.success} (Expected false)`);
  if (overIssueRes.success) {
    throw new Error('recordStockMovement unexpectedly succeeded when issuing quantity greater than stock balance');
  }

  // Verify idempotency key is NOT poisoned with IN_PROGRESS
  const inProgForIssueKey = Number((await pool.query(
    'SELECT count(*)::int as c FROM an_idempotency_keys WHERE idempotency_key = $1',
    [issueKey]
  )).rows[0].c);
  console.log(`[Insufficient Stock Attempt] Idempotency key stored rows in DB: ${inProgForIssueKey} (Expected 0 - rolled back cleanly)`);
  if (inProgForIssueKey !== 0) {
    throw new Error('Idempotency key was poisoned with IN_PROGRESS after insufficient stock failure');
  }

  // Now supply new stock to whTgtId (Tawreed): +100 units
  console.log('Supplying 100 units to Target WH to cover the required issue quantity...');
  const supplyKey = `supply-key-${failSuf}`;
  const supplyRes = await adapter.recordStockMovement(tenantId, {
    id: `mv-supply-${failSuf}`,
    tenantId,
    companyId: tenantId,
    movementNumber: `MV-SUP-${failSuf}`.slice(0, 32),
    movementType: 'RECEIPT',
    warehouseId: whTgtId,
    warehouseNameAr: 'مستودع الفرع - الوجهة',
    itemId,
    itemCode: `SKU-${suf}`.slice(0, 32),
    itemNameAr: 'صنف اختباري موحد',
    quantity: 100,
    unitCost: 50.00,
    totalCost: 5000.00,
    balanceAfterQty: 0,
    performedBy: 'USR-SUPPLIER',
    performedByName: 'أمين المستودع',
    timestamp: new Date().toISOString(),
    idempotencyKey: supplyKey,
  }, supplyKey);

  if (!supplyRes.success) throw new Error('Failed to supply stock to target warehouse');

  const tgtQtyAfterSupply = await getQty(whTgtId);
  console.log(`Target WH Qty after supply: ${tgtQtyAfterSupply} (Expected 125: 25 + 100)`);

  // Retry the exact same issue movement with the EXACT SAME idempotency key
  console.log('Retrying the original issue with the SAME idempotency key after supply...');
  const retryIssueRes = await adapter.recordStockMovement(tenantId, overIssueMovement, issueKey);
  const tgtQtyAfterRetry = await getQty(whTgtId);
  const issueMvCount = Number((await pool.query('SELECT count(*)::int as c FROM an_stock_movements WHERE id = $1', [overIssueMovement.id])).rows[0].c);
  const issueKeyStatus = (await pool.query('SELECT status FROM an_idempotency_keys WHERE idempotency_key = $1', [issueKey])).rows[0]?.status;

  console.log(`[Retry Issue] Success: ${retryIssueRes.success} (Expected true)`);
  console.log(`[Retry Issue] Target WH Final Qty: ${tgtQtyAfterRetry} (Expected 75: 125 - 50)`);
  console.log(`[Retry Issue] Movement rows in DB: ${issueMvCount} (Expected 1), Key status: ${issueKeyStatus} (Expected COMPLETED)`);

  if (!retryIssueRes.success || tgtQtyAfterRetry !== 75 || issueMvCount !== 1 || issueKeyStatus !== 'COMPLETED') {
    throw new Error('recordStockMovement retry with same key failed or stock quantity calculated incorrectly');
  }
  console.log('✓ recordStockMovement: INSUFFICIENT STOCK ROLLBACK & RETRY SUCCEEDED WITH ACCURATE BALANCE\n');

  // ---------------------------------------------------------------------------
  // 5) فحص نهائي: count(*) من an_idempotency_keys بحالة IN_PROGRESS = 0
  // ---------------------------------------------------------------------------
  console.log('--- 5. FINAL CHECK: IN_PROGRESS IDEMPOTENCY KEYS ---');
  const inProgressTotal = Number((await pool.query(
    "SELECT count(*)::int as c FROM an_idempotency_keys WHERE status = 'IN_PROGRESS'"
  )).rows[0].c);

  console.log(`Final IN_PROGRESS keys in an_idempotency_keys: ${inProgressTotal} (Expected 0)`);
  if (inProgressTotal !== 0) {
    throw new Error(`Integrity breach: Found ${inProgressTotal} dangling IN_PROGRESS idempotency keys!`);
  }
  console.log('✓ FINAL CHECK PASSED: ZERO DANGLING IN_PROGRESS KEYS IN DATABASE\n');

  console.log('========================================================================');
  console.log('       ALL BATCH (C) GROUP 2 EFFECTS VERIFICATION TESTS PASSED (100%)    ');
  console.log('========================================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('TEST RUNTIME FAILURE:', err);
  process.exit(1);
});
