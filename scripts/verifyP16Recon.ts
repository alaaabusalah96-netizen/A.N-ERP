/** Phase 16 REC-001 — InMemory reconciliation suite (read-only). */
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};
const near = (a: number, b: number, e = 0.05) => Math.abs(Number(a) - Number(b)) <= e;

async function setup(autoPost: boolean) {
  const st = new InMemoryAdapter();
  const pe = new PostingEngine(st);
  const ne = new NumberingEngine(st);
  const svc = new InventoryService(st, pe, ne);
  const T = `t16-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  for (const c of [
    { code: '1105', type: 'ASSET' }, { code: '1109', type: 'ASSET' },
    { code: '2106', type: 'LIABILITY' }, { code: '5101', type: 'EXPENSE' },
  ] as const) {
    await st.saveAccount(T, { code: c.code, tenantId: T, nameAr: c.code, type: c.type as any, isActive: true, debitBalance: 0, creditBalance: 0, balance: 0 }, `a-${c.code}-${T}`);
  }
  await svc.saveStockAccountingConfig(T, { autoPostEnabled: autoPost }, 'u', `cfg-${T}`);
  const w1 = (await st.saveWarehouse(T, { id: `W1-${T}`.slice(0, 60), tenantId: T, companyId: T, code: 'W1', nameAr: 'رئيسي', isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString() } as any, `w1-${T}`)).data!;
  const w2 = (await st.saveWarehouse(T, { id: `W2-${T}`.slice(0, 60), tenantId: T, companyId: T, code: 'W2', nameAr: 'فرعي', isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString() } as any, `w2-${T}`)).data!;
  const item = (await svc.saveStockItem(T, {
    id: `IT-${T}`.slice(0, 60), itemCode: `SKU-${T}`.slice(0, 20), nameAr: 'صنف', category: 'X',
    valuationMethod: 'WEIGHTED_AVERAGE', inventoryAccountCode: '1105', cogsAccountCode: '5101',
  } as any, `it-${T}`)).data!;
  return { st, svc, T, w1: w1.id, w2: w2.id, item };
}

async function main() {
  // (أ) auto-post ON: receive 100@10, issue 40, transfer 30 received → stock value 600, MATCHED
  {
    const { st, svc, T, w1, w2, item } = await setup(true);
    await svc.receiveStock(T, { warehouseId: w1, idempotencyKey: `r-${T}`, lines: [{ itemId: item.id, quantity: 100, unitCost: 10 }] } as any);
    await svc.issueStock(T, { warehouseId: w1, idempotencyKey: `i-${T}`, lines: [{ itemId: item.id, quantity: 40 }] } as any);
    const tr = await svc.createTransfer(T, {
      sourceWarehouseId: w1, targetWarehouseId: w2, requestedBy: 'u', requestedByName: 'U',
      idempotencyKey: `t-${T}`, lines: [{ itemId: item.id, quantity: 30 }],
    } as any);
    await svc.receiveTransfer(T, tr.data!.id, 'u2', 'U2', `tr-${T}`);
    const rep = await svc.getInventoryReconciliation(T);
    check('(أ) report ok', rep.success, rep.error?.detail || '');
    const a1105 = (rep.data?.accounts || []).find((a: any) => a.accountCode === '1105');
    check('(أ) stockValue 600', a1105 && near(a1105.stockValue, 600), `v=${a1105?.stockValue}`);
    check('(أ) ledger MATCHED', a1105 && a1105.status === 'MATCHED' && near(a1105.ledgerBalance, 600), `led=${a1105?.ledgerBalance} st=${a1105?.status}`);
    check('(أ) inTransit MATCHED', rep.data?.inTransit?.status === 'MATCHED');
    check('(أ) qtyMismatches 0', rep.data?.integrity?.qtyMismatches === 0, `n=${rep.data?.integrity?.qtyMismatches}`);
  }

  // (ب) auto-post OFF → DIFFERENT + note
  {
    const { svc, T, w1, item } = await setup(false);
    await svc.receiveStock(T, { warehouseId: w1, idempotencyKey: `r2-${T}`, lines: [{ itemId: item.id, quantity: 100, unitCost: 10 }] } as any);
    await svc.issueStock(T, { warehouseId: w1, idempotencyKey: `i2-${T}`, lines: [{ itemId: item.id, quantity: 40 }] } as any);
    const rep = await svc.getInventoryReconciliation(T);
    const a1105 = (rep.data?.accounts || []).find((a: any) => a.accountCode === '1105');
    check('(ب) DIFFERENT when auto off', a1105 && a1105.status === 'DIFFERENT', `st=${a1105?.status}`);
    check('(ب) note explains', (rep.data?.notes || []).some((n: string) => n.includes('غير مفعّلة')));
    check('(ب) inTransit NOT_APPLICABLE', rep.data?.inTransit?.status === 'NOT_APPLICABLE');
  }

  // (ج) intentional qty corruption → qtyMismatches
  {
    const { st, svc, T, w1, item } = await setup(true);
    await svc.receiveStock(T, { warehouseId: w1, idempotencyKey: `r3-${T}`, lines: [{ itemId: item.id, quantity: 50, unitCost: 10 }] } as any);
    // corrupt warehouse stock qty
    const key = `${T}:${w1}:${item.id}`;
    const stockMap = (st as any).warehouseStock as Map<string, any>;
    for (const [k, v] of stockMap.entries()) {
      if (v.tenantId === T && v.itemId === item.id && v.warehouseId === w1) {
        v.currentQty = Number(v.currentQty) + 5;
        stockMap.set(k, v);
      }
    }
    const rep = await svc.getInventoryReconciliation(T);
    check('(ج) qtyMismatches >= 1', (rep.data?.integrity?.qtyMismatches || 0) >= 1, `n=${rep.data?.integrity?.qtyMismatches}`);
  }

  // (د) PENDING_RETRY
  {
    const { st, svc, T, w1, item } = await setup(true);
    const r = await svc.receiveStock(T, { warehouseId: w1, idempotencyKey: `r4-${T}`, lines: [{ itemId: item.id, quantity: 10, unitCost: 5 }] } as any);
    if (r.success && r.data) {
      await st.setStockDocumentJournal(T, r.data.id, null, 'PENDING_RETRY');
    }
    const rep = await svc.getInventoryReconciliation(T);
    check('(د) pendingJournals >= 1', (rep.data?.pendingJournals || 0) >= 1, `n=${rep.data?.pendingJournals}`);
  }

  // (و) read-only: three calls identical structure
  {
    const { svc, T, w1, item } = await setup(true);
    await svc.receiveStock(T, { warehouseId: w1, idempotencyKey: `r5-${T}`, lines: [{ itemId: item.id, quantity: 20, unitCost: 3 }] } as any);
    const a = await svc.getInventoryReconciliation(T);
    const b = await svc.getInventoryReconciliation(T);
    const c = await svc.getInventoryReconciliation(T);
    check('(و) read-only stable accounts', JSON.stringify(a.data?.accounts) === JSON.stringify(b.data?.accounts) && JSON.stringify(b.data?.accounts) === JSON.stringify(c.data?.accounts));
  }

  // (ح) integrity aggregates parity
  {
    const { st, svc, T, w1, item } = await setup(false);
    await svc.receiveStock(T, { warehouseId: w1, idempotencyKey: `r6-${T}`, lines: [{ itemId: item.id, quantity: 15, unitCost: 4 }] } as any);
    const agg = await st.getInventoryIntegrityAggregates(T);
    check('(ح) aggregates ok', agg.success && (agg.data || []).length >= 1);
    const row = (agg.data || []).find((r: any) => r.itemId === item.id);
    check('(ح) stockQty = movementsQty', row && near(row.stockQty, row.movementsQty, 0.0001), `s=${row?.stockQty} m=${row?.movementsQty}`);
  }

  // (ز) tenant isolation
  {
    const a = await setup(true);
    const b = await setup(true);
    await a.svc.receiveStock(a.T, { warehouseId: a.w1, idempotencyKey: `rz-${a.T}`, lines: [{ itemId: a.item.id, quantity: 99, unitCost: 1 }] } as any);
    const repB = await b.svc.getInventoryReconciliation(b.T);
    const val = (repB.data?.accounts || []).reduce((s: number, x: any) => s + x.stockValue, 0);
    check('(ز) other tenant sees no foreign stock', near(val, 0), `val=${val}`);
  }

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
