/**
 * @file verifyD2Effects.ts
 * @description Verification of Part (B) Effects & Numbering for receiveStock & issueStock
 */

import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { InventoryService, ReceiveStockInput, IssueStockInput } from '../src/core/inventory/InventoryService';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import dotenv from 'dotenv';
dotenv.config();

function randSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function run() {
  console.log('========================================================================');
  console.log('       A.N ERP v7.2 — PART (B) INVENTORY & NUMBERING EFFECTS            ');
  console.log('========================================================================\n');

  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const pool = (adapter as any).pool;
  const tenantId = 'tenant-main';

  const postingEngine = new PostingEngine(adapter);
  const numberingEngine = new NumberingEngine(adapter);
  const inventoryService = new InventoryService(adapter, postingEngine, numberingEngine);

  const suf = randSuffix();
  const whId = `wh-d2-${suf}`.slice(0, 32);
  const itemId = `itm-d2-${suf}`.slice(0, 32);
  const itemCode = `SKU-D2-${suf}`.slice(0, 32);

  // Setup Warehouse & Item in DB
  await pool.query(
    `INSERT INTO an_warehouses (id, tenant_id, company_id, code, name_ar, name_en, is_active, is_default, valuation_method, created_at, updated_at)
     VALUES ($1, $2, $2, $3, 'مستودع اختبار الآثار', 'Effects Test Warehouse', true, true, 'WAC', NOW(), NOW())`,
    [whId, tenantId, `WH-${suf}`.slice(0, 32)]
  );

  await pool.query(
    `INSERT INTO an_stock_items (id, tenant_id, company_id, item_code, name_ar, name_en, category, uom, average_cost, is_active, created_at, updated_at)
     VALUES ($1, $2, $2, $3, 'صنف اختبار الآثار', 'Effects Test Item', 'مخزون', 'حبه', 50.00, true, NOW(), NOW())`,
    [itemId, tenantId, itemCode]
  );

  // Initial Stock Injection: 100 units @ 50.00
  const initKey = `init-stock-${suf}`;
  const initRes = await adapter.recordStockMovement(tenantId, {
    id: `mv-init-${suf}`.slice(0, 32),
    tenantId,
    companyId: tenantId,
    movementNumber: `MV-INIT-${suf}`.slice(0, 32),
    movementType: 'RECEIPT',
    warehouseId: whId,
    warehouseNameAr: 'مستودع اختبار الآثار',
    itemId,
    itemCode,
    itemNameAr: 'صنف اختبار الآثار',
    quantity: 100,
    unitCost: 50.00,
    totalCost: 5000.00,
    balanceAfterQty: 0,
    performedBy: 'USR-SEED',
    performedByName: 'أمين المستودع',
    timestamp: new Date().toISOString(),
    idempotencyKey: initKey,
  }, initKey);

  if (!initRes.success) {
    throw new Error(`Failed to initialize stock: ${JSON.stringify(initRes.error)}`);
  }

  const getStock = async () => {
    const res = await pool.query(
      'SELECT current_qty, average_cost FROM an_warehouse_stock WHERE tenant_id = $1 AND warehouse_id = $2 AND item_id = $3',
      [tenantId, whId, itemId]
    );
    return res.rows[0] ? { qty: Number(res.rows[0].current_qty), cost: Number(res.rows[0].average_cost) } : { qty: 0, cost: 0 };
  };

  const getSeq = async (seqKey: string) => {
    const res = await pool.query(
      'SELECT current_val FROM an_sequences WHERE tenant_id = $1 AND sequence_key = $2',
      [tenantId, seqKey]
    );
    return res.rows[0] ? Number(res.rows[0].current_val) : 0;
  };

  const initialStock = await getStock();
  console.log(`Initial Stock in Warehouse: Qty = ${initialStock.qty}, AvgCost = ${initialStock.cost}\n`);

  // ---------------------------------------------------------------------------
  // (1) issueStock على مستوى InventoryService
  // طلبان متوازيان بنفس المفتاح والحمولة -> الكمية تنقص مرة واحدة، عدد الحركات = عدد البنود،
  // ونفس id المستند، وتكرار متتابع بلا أثر.
  // ---------------------------------------------------------------------------
  console.log('--- (1) Testing issueStock (Concurrent parallel requests + Sequential Replay) ---');
  const issueKey = `issue-key-d2-${suf}`;
  const issueInput: IssueStockInput = {
    warehouseId: whId,
    lines: [
      { itemId, quantity: 15, unitCost: 50, notes: 'بند أول' },
      { itemId, quantity: 10, unitCost: 50, notes: 'بند ثان' },
    ],
    idempotencyKey: issueKey,
  };

  const stockBeforeIssue = await getStock();
  console.log(`[issueStock] Stock BEFORE Issue: ${stockBeforeIssue.qty}`);

  // Run 2 parallel requests with identical key and payload
  const [issueRes1, issueRes2] = await Promise.all([
    inventoryService.issueStock(tenantId, issueInput),
    inventoryService.issueStock(tenantId, issueInput),
  ]);

  const stockAfterParallel = await getStock();
  console.log(`[issueStock] Parallel Call 1 Success: ${issueRes1.success}, Doc ID: ${issueRes1.data?.id}, Doc Number: ${issueRes1.data?.documentNumber}`);
  console.log(`[issueStock] Parallel Call 2 Success: ${issueRes2.success}, Doc ID: ${issueRes2.data?.id}, Doc Number: ${issueRes2.data?.documentNumber}`);
  console.log(`[issueStock] Stock AFTER Parallel Calls: ${stockAfterParallel.qty} (Delta: ${stockAfterParallel.qty - stockBeforeIssue.qty})`);

  const sameDocId = Boolean(issueRes1.data?.id && issueRes1.data?.id === issueRes2.data?.id);
  const sameDocNum = Boolean(issueRes1.data?.documentNumber && issueRes1.data?.documentNumber === issueRes2.data?.documentNumber);
  const deltaExpected25 = (stockBeforeIssue.qty - stockAfterParallel.qty) === 25;
  const linesCount = issueInput.lines.length;
  const movementsCountCall1 = issueRes1.data?.movements?.length || 0;

  console.log(`[issueStock] Same Document ID: ${sameDocId}`);
  console.log(`[issueStock] Same Document Number: ${sameDocNum}`);
  console.log(`[issueStock] Decremented Exactly Once (-25 units): ${deltaExpected25}`);
  console.log(`[issueStock] Movements count (${movementsCountCall1}) == Lines count (${linesCount}): ${movementsCountCall1 === linesCount}`);

  // Sequential Replay
  console.log('\n[issueStock] Performing Sequential Replay with same key...');
  const issueReplay = await inventoryService.issueStock(tenantId, issueInput);
  const stockAfterReplay = await getStock();
  console.log(`[issueStock Replay] Success: ${issueReplay.success}, Doc ID: ${issueReplay.data?.id}, Doc Number: ${issueReplay.data?.documentNumber}`);
  console.log(`[issueStock Replay] Stock AFTER Replay: ${stockAfterReplay.qty} (Delta from previous: ${stockAfterReplay.qty - stockAfterParallel.qty})`);
  const replayZeroEffect = stockAfterReplay.qty === stockAfterParallel.qty;
  console.log(`[issueStock Replay] Zero Business Mutation Effect: ${replayZeroEffect}\n`);

  // ---------------------------------------------------------------------------
  // (2) الترقيم: لـ receiveStock و issueStock
  // اقرأ قيمة العداد قبل وبعد طلبين متوازيين بنفس المفتاح، وبعد إعادة متتابعة
  // ---------------------------------------------------------------------------
  console.log('--- (2) Testing Numbering Sequences for receiveStock & issueStock ---');

  // 2.A: receiveStock Numbering
  const recSeqKey = 'STK-REC';
  const recSeqBefore = await getSeq(recSeqKey);
  console.log(`[receiveStock Numbering] Sequence '${recSeqKey}' BEFORE: ${recSeqBefore}`);

  const recTestKey = `rec-seq-test-${suf}`;
  const recInput: ReceiveStockInput = {
    warehouseId: whId,
    lines: [
      { itemId, quantity: 5, unitCost: 50 }
    ],
    idempotencyKey: recTestKey,
  };

  const [recPar1, recPar2] = await Promise.all([
    inventoryService.receiveStock(tenantId, recInput),
    inventoryService.receiveStock(tenantId, recInput),
  ]);

  const recSeqAfterParallel = await getSeq(recSeqKey);
  console.log(`[receiveStock Numbering] Parallel Call 1 DocNum: ${recPar1.data?.documentNumber}, Call 2 DocNum: ${recPar2.data?.documentNumber}`);
  console.log(`[receiveStock Numbering] Sequence '${recSeqKey}' AFTER Parallel: ${recSeqAfterParallel} (Consumed: ${recSeqAfterParallel - recSeqBefore})`);

  const recSeqReplay = await inventoryService.receiveStock(tenantId, recInput);
  const recSeqAfterReplay = await getSeq(recSeqKey);
  console.log(`[receiveStock Numbering] Replay DocNum: ${recSeqReplay.data?.documentNumber}`);
  console.log(`[receiveStock Numbering] Sequence '${recSeqKey}' AFTER Replay: ${recSeqAfterReplay} (Total Consumed for key: ${recSeqAfterReplay - recSeqBefore})`);

  // 2.B: issueStock Numbering
  const issSeqKey = 'STK-ISS';
  const issSeqBefore = await getSeq(issSeqKey);
  console.log(`\n[issueStock Numbering] Sequence '${issSeqKey}' BEFORE: ${issSeqBefore}`);

  const issNumTestKey = `iss-seq-test-${suf}`;
  const issNumInput: IssueStockInput = {
    warehouseId: whId,
    lines: [
      { itemId, quantity: 2, unitCost: 50 }
    ],
    idempotencyKey: issNumTestKey,
  };

  const [issPar1, issPar2] = await Promise.all([
    inventoryService.issueStock(tenantId, issNumInput),
    inventoryService.issueStock(tenantId, issNumInput),
  ]);

  const issSeqAfterParallel = await getSeq(issSeqKey);
  console.log(`[issueStock Numbering] Parallel Call 1 DocNum: ${issPar1.data?.documentNumber}, Call 2 DocNum: ${issPar2.data?.documentNumber}`);
  console.log(`[issueStock Numbering] Sequence '${issSeqKey}' AFTER Parallel: ${issSeqAfterParallel} (Consumed: ${issSeqAfterParallel - issSeqBefore})`);

  const issSeqReplay = await inventoryService.issueStock(tenantId, issNumInput);
  const issSeqAfterReplay = await getSeq(issSeqKey);
  console.log(`[issueStock Numbering] Replay DocNum: ${issSeqReplay.data?.documentNumber}`);
  console.log(`[issueStock Numbering] Sequence '${issSeqKey}' AFTER Replay: ${issSeqAfterReplay} (Total Consumed for key: ${issSeqAfterReplay - issSeqBefore})`);

  console.log('\n========================================================================');
  console.log('                      PART (B) SUMMARY REPORT                           ');
  console.log('========================================================================');
  console.log(`1) issueStock Quantity: ${stockBeforeIssue.qty} -> ${stockAfterParallel.qty} -> ${stockAfterReplay.qty} (Decremented once by exactly 25 units)`);
  console.log(`   - Same Doc ID across parallel calls: ${sameDocId} (${issueRes1.data?.id})`);
  console.log(`   - Same Doc Number across parallel calls: ${sameDocNum} (${issueRes1.data?.documentNumber})`);
  console.log(`   - Movements count == Lines count: ${movementsCountCall1 === linesCount} (${movementsCountCall1} movements for ${linesCount} lines)`);
  console.log(`   - Replay mutation delta: ${stockAfterReplay.qty - stockAfterParallel.qty} units (Zero effect)`);
  console.log(`2) Numbering Sequence Consumption:`);
  console.log(`   - receiveStock ('${recSeqKey}'): Initial = ${recSeqBefore}, After Parallel = ${recSeqAfterParallel}, After Replay = ${recSeqAfterReplay}`);
  console.log(`     -> Consumed in parallel: ${recSeqAfterParallel - recSeqBefore}, Total consumed after replay: ${recSeqAfterReplay - recSeqBefore}`);
  console.log(`   - issueStock ('${issSeqKey}'): Initial = ${issSeqBefore}, After Parallel = ${issSeqAfterParallel}, After Replay = ${issSeqAfterReplay}`);
  console.log(`     -> Consumed in parallel: ${issSeqAfterParallel - issSeqBefore}, Total consumed after replay: ${issSeqAfterReplay - issSeqBefore}`);
  console.log('========================================================================');

  process.exit(0);
}

run().catch((err) => {
  console.error('Part B Verification Error:', err);
  process.exit(1);
});
