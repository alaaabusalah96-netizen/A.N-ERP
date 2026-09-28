/**
 * @file testIdempotencySuite.ts
 * @description Comprehensive automated test suite for INV-001 Idempotency
 * Tests:
 *  - Test A: Sequential Replay (Replay Identity, Business Effect = 1, Persistence)
 *  - Test B: Concurrent Replay (Promise.all race condition test, single mutation)
 *  - Test C: Same Key / Different Payload (No duplicate mutation, deterministic rejection/handling)
 *  - Test D: Same Key / Different Tenant (Tenant isolation, no cross-tenant collisions)
 *  - Test E: Failure Recovery (Rollback on failure, no partial mutation, retry with same key succeeds)
 */

import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  evidence?: any;
}

async function runSuite() {
  console.log('================================================================');
  console.log('A.N ERP — Running Comprehensive Idempotency Suite (INV-001)');
  console.log('================================================================');

  const primary = new PostgresPrimaryAdapter();
  await primary.initializeSchema();
  const postingEngine = new PostingEngine(primary);
  const numberingEngine = new NumberingEngine(primary);
  const inventoryService = new InventoryService(primary, postingEngine, numberingEngine);

  const results: TestResult[] = [];
  const suffix = Date.now().toString().slice(-6);

  // Setup Base Data
  const tenantA = `t-idemp-a-${suffix}`;
  const tenantB = `t-idemp-b-${suffix}`;

  await primary.saveTenant({
    id: tenantA,
    code: `TA${suffix}`,
    nameAr: 'شركة التجربة الأولى',
    backendConfig: { adapterType: 'postgres' },
    status: 'ACTIVE',
  } as any, `k-tenant-a-${suffix}`);

  await primary.saveTenant({
    id: tenantB,
    code: `TB${suffix}`,
    nameAr: 'شركة التجربة الثانية',
    backendConfig: { adapterType: 'postgres' },
    status: 'ACTIVE',
  } as any, `k-tenant-b-${suffix}`);

  const whA = await primary.saveWarehouse(tenantA, {
    id: `wh-a-${suffix}`,
    code: `WHA-${suffix}`,
    nameAr: 'مستودع أ',
    valuationMethod: 'WEIGHTED_AVERAGE',
    isActive: true,
  } as any, `k-wha-${suffix}`);

  const whB = await primary.saveWarehouse(tenantB, {
    id: `wh-b-${suffix}`,
    code: `WHB-${suffix}`,
    nameAr: 'مستودع ب',
    valuationMethod: 'WEIGHTED_AVERAGE',
    isActive: true,
  } as any, `k-whb-${suffix}`);

  const itemA = await primary.saveStockItem(tenantA, {
    id: `it-a-${suffix}`,
    itemCode: `SKU-A-${suffix}`,
    nameAr: 'صنف أ',
    valuationMethod: 'WEIGHTED_AVERAGE',
    inventoryAccountCode: '110301',
    cogsAccountCode: '510101',
    adjustmentExpenseAccountCode: '520101',
    adjustmentGainAccountCode: '410101',
    isActive: true,
  } as any, `k-ita-${suffix}`);

  const itemB = await primary.saveStockItem(tenantB, {
    id: `it-b-${suffix}`,
    itemCode: `SKU-B-${suffix}`,
    nameAr: 'صنف ب',
    valuationMethod: 'WEIGHTED_AVERAGE',
    inventoryAccountCode: '110301',
    cogsAccountCode: '510101',
    adjustmentExpenseAccountCode: '520101',
    adjustmentGainAccountCode: '410101',
    isActive: true,
  } as any, `k-itb-${suffix}`);

  // --------------------------------------------------------------------------
  // Test A — Sequential replay
  // --------------------------------------------------------------------------
  try {
    const keyA = `seq-test-key-${suffix}`;
    const call1 = await inventoryService.receiveStock(tenantA, {
      warehouseId: `wh-a-${suffix}`,
      itemId: `it-a-${suffix}`,
      quantity: 5,
      unitCost: 200,
      performedBy: 'usr-1',
      performedByName: 'المستلم 1',
      idempotencyKey: keyA,
    });

    const call2 = await inventoryService.receiveStock(tenantA, {
      warehouseId: `wh-a-${suffix}`,
      itemId: `it-a-${suffix}`,
      quantity: 5,
      unitCost: 200,
      performedBy: 'usr-1',
      performedByName: 'المستلم 1',
      idempotencyKey: keyA,
    });

    const stockRes = await inventoryService.getWarehouseStock(tenantA, `wh-a-${suffix}`, `it-a-${suffix}`);
    const passed = Boolean(
      call1.success &&
      call2.success &&
      call1.data?.id === call2.data?.id &&
      stockRes.data?.currentQty === 5 // NOT 10!
    );

    results.push({
      name: 'Test A — Sequential replay',
      passed,
      details: passed
        ? `Replay identity verified (${call1.data?.id} == ${call2.data?.id}) with single mutation effect (qty=5).`
        : `Sequential replay failed: call1.id=${call1.data?.id}, call2.id=${call2.data?.id}, qty=${stockRes.data?.currentQty}`,
      evidence: { call1Id: call1.data?.id, call2Id: call2.data?.id, qty: stockRes.data?.currentQty },
    });
  } catch (err: any) {
    results.push({ name: 'Test A — Sequential replay', passed: false, details: err.message });
  }

  // --------------------------------------------------------------------------
  // Test B — Concurrent replay
  // --------------------------------------------------------------------------
  try {
    const baseStockB = (await inventoryService.getWarehouseStock(tenantA, `wh-a-${suffix}`, `it-a-${suffix}`)).data?.currentQty || 0;
    const keyB = `concurrent-key-${suffix}`;
    const [conc1, conc2] = await Promise.all([
      inventoryService.receiveStock(tenantA, {
        warehouseId: `wh-a-${suffix}`,
        itemId: `it-a-${suffix}`,
        quantity: 3,
        unitCost: 200,
        performedBy: 'usr-1',
        performedByName: 'المستلم 1',
        idempotencyKey: keyB,
      }),
      inventoryService.receiveStock(tenantA, {
        warehouseId: `wh-a-${suffix}`,
        itemId: `it-a-${suffix}`,
        quantity: 3,
        unitCost: 200,
        performedBy: 'usr-1',
        performedByName: 'المستلم 1',
        idempotencyKey: keyB,
      }),
    ]);

    const stockRes = await inventoryService.getWarehouseStock(tenantA, `wh-a-${suffix}`, `it-a-${suffix}`);
    const passed = Boolean(
      conc1.success &&
      conc2.success &&
      conc1.data?.id === conc2.data?.id &&
      stockRes.data?.currentQty === baseStockB + 3
    );

    results.push({
      name: 'Test B — Concurrent replay',
      passed,
      details: passed
        ? `Concurrent race resolved cleanly: single mutation effect (qty=${baseStockB + 3}) and identical document id (${conc1.data?.id}).`
        : `Concurrent replay failed: conc1=${conc1.data?.id}, conc2=${conc2.data?.id}, qty=${stockRes.data?.currentQty}, expected=${baseStockB + 3}`,
      evidence: { conc1Id: conc1.data?.id, conc2Id: conc2.data?.id, qty: stockRes.data?.currentQty },
    });
  } catch (err: any) {
    results.push({ name: 'Test B — Concurrent replay', passed: false, details: err.message });
  }

  // --------------------------------------------------------------------------
  // Test C — Same key / different payload
  // --------------------------------------------------------------------------
  try {
    const baseStockC = (await inventoryService.getWarehouseStock(tenantA, `wh-a-${suffix}`, `it-a-${suffix}`)).data?.currentQty || 0;
    const keyC = `payload-mismatch-${suffix}`;
    const firstCall = await inventoryService.receiveStock(tenantA, {
      warehouseId: `wh-a-${suffix}`,
      itemId: `it-a-${suffix}`,
      quantity: 2,
      unitCost: 100,
      performedBy: 'usr-1',
      performedByName: 'المستلم 1',
      idempotencyKey: keyC,
    });

    // Attempt second call with same key but DIFFERENT quantity (10 instead of 2)
    const secondCall = await inventoryService.receiveStock(tenantA, {
      warehouseId: `wh-a-${suffix}`,
      itemId: `it-a-${suffix}`,
      quantity: 10,
      unitCost: 100,
      performedBy: 'usr-1',
      performedByName: 'المستلم 1',
      idempotencyKey: keyC,
    });

    const stockRes = await inventoryService.getWarehouseStock(tenantA, `wh-a-${suffix}`, `it-a-${suffix}`);
    // Stock should have increased by 2 (firstCall). The secondCall MUST NOT execute mutation.
    const passed = Boolean(
      firstCall.success &&
      stockRes.data?.currentQty === baseStockC + 2 &&
      secondCall.data?.id === firstCall.data?.id // returns original cached result
    );

    results.push({
      name: 'Test C — Same key / different payload',
      passed,
      details: passed
        ? `No secondary mutation executed: stock remained ${baseStockC + 2}, original document id returned without duplicating effect.`
        : `Failed: stock=${stockRes.data?.currentQty}, expected=${baseStockC + 2}, secondId=${secondCall.data?.id}`,
      evidence: { originalId: firstCall.data?.id, secondId: secondCall.data?.id, stock: stockRes.data?.currentQty },
    });
  } catch (err: any) {
    results.push({ name: 'Test C — Same key / different payload', passed: false, details: err.message });
  }

  // --------------------------------------------------------------------------
  // Test D — Same key / different tenant
  // --------------------------------------------------------------------------
  try {
    const baseStockDA = (await inventoryService.getWarehouseStock(tenantA, `wh-a-${suffix}`, `it-a-${suffix}`)).data?.currentQty || 0;
    const baseStockDB = (await inventoryService.getWarehouseStock(tenantB, `wh-b-${suffix}`, `it-b-${suffix}`)).data?.currentQty || 0;

    const sharedKey = `shared-cross-tenant-key-${suffix}`;
    const callTenantA = await inventoryService.receiveStock(tenantA, {
      warehouseId: `wh-a-${suffix}`,
      itemId: `it-a-${suffix}`,
      quantity: 4,
      unitCost: 150,
      performedBy: 'usr-1',
      performedByName: 'المستلم 1',
      idempotencyKey: sharedKey,
    });

    const callTenantB = await inventoryService.receiveStock(tenantB, {
      warehouseId: `wh-b-${suffix}`,
      itemId: `it-b-${suffix}`,
      quantity: 7,
      unitCost: 300,
      performedBy: 'usr-2',
      performedByName: 'المستلم 2',
      idempotencyKey: sharedKey,
    });

    const stockA = await inventoryService.getWarehouseStock(tenantA, `wh-a-${suffix}`, `it-a-${suffix}`);
    const stockB = await inventoryService.getWarehouseStock(tenantB, `wh-b-${suffix}`, `it-b-${suffix}`);

    const passed = Boolean(
      callTenantA.success &&
      callTenantB.success &&
      callTenantA.data?.id !== callTenantB.data?.id &&
      stockA.data?.currentQty === baseStockDA + 4 &&
      stockB.data?.currentQty === baseStockDB + 7
    );

    results.push({
      name: 'Test D — Same key / different tenant',
      passed,
      details: passed
        ? `Tenant isolation maintained: both tenants processed independently with the same idempotency key without collision.`
        : `Tenant collision detected: callTenantA=${callTenantA.data?.id}, callTenantB=${callTenantB.data?.id}`,
      evidence: { tenantAId: callTenantA.data?.id, tenantBId: callTenantB.data?.id, stockA: stockA.data?.currentQty, stockB: stockB.data?.currentQty },
    });
  } catch (err: any) {
    results.push({ name: 'Test D — Same key / different tenant', passed: false, details: err.message });
  }

  // --------------------------------------------------------------------------
  // Test E — Failure recovery
  // --------------------------------------------------------------------------
  try {
    const baseStockE = (await inventoryService.getWarehouseStock(tenantA, `wh-a-${suffix}`, `it-a-${suffix}`)).data?.currentQty || 0;
    const failKey = `fail-recovery-key-${suffix}`;
    // Attempt with an invalid warehouse ID (fails validation/transaction)
    const failCall = await inventoryService.receiveStock(tenantA, {
      warehouseId: `non-existent-wh-${suffix}`,
      itemId: `it-a-${suffix}`,
      quantity: 6,
      unitCost: 100,
      performedBy: 'usr-1',
      performedByName: 'المستلم 1',
      idempotencyKey: failKey,
    });

    const isFailureHandled = !failCall.success;

    // Retry with the same key with valid warehouse
    const retryCall = await inventoryService.receiveStock(tenantA, {
      warehouseId: `wh-a-${suffix}`,
      itemId: `it-a-${suffix}`,
      quantity: 6,
      unitCost: 100,
      performedBy: 'usr-1',
      performedByName: 'المستلم 1',
      idempotencyKey: failKey,
    });

    const stockA = await inventoryService.getWarehouseStock(tenantA, `wh-a-${suffix}`, `it-a-${suffix}`);
    const passed = Boolean(
      isFailureHandled &&
      retryCall.success &&
      stockA.data?.currentQty === baseStockE + 6
    );

    results.push({
      name: 'Test E — Failure recovery',
      passed,
      details: passed
        ? `Clean failure rollback: failed attempt left no poisoned idempotency record, retry with same key succeeded (stock=${baseStockE + 6}).`
        : `Failure recovery failed: isFailureHandled=${isFailureHandled}, retrySuccess=${retryCall.success}, stock=${stockA.data?.currentQty}`,
      evidence: { failError: failCall.error, retryDocId: retryCall.data?.id, stockA: stockA.data?.currentQty },
    });
  } catch (err: any) {
    results.push({ name: 'Test E — Failure recovery', passed: false, details: err.message });
  }

  console.log('\n--- Idempotency Test Suite Results ---');
  let allPassed = true;
  for (const r of results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.name}`);
    console.log(`       ${r.details}`);
    if (!r.passed) allPassed = false;
  }

  console.log('--------------------------------------');
  console.log(`Total: ${results.length} | Passed: ${results.filter(r => r.passed).length} | Failed: ${results.filter(r => !r.passed).length}`);

  process.exit(allPassed ? 0 : 1);
}

runSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
