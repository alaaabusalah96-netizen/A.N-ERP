/**
 * @file verifyFixStockReturnCumulative.ts
 * Cumulative stock returns must not exceed the original document (prior returns + this request + duplicate lines).
 * Run: npx tsx scripts/verifyFixStockReturnCumulative.ts
 */
import fs from 'fs';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { PostingEngine } from '../src/core/accounting/PostingEngine';
import { NumberingEngine } from '../src/core/numbering/NumberingEngine';
import { InventoryService } from '../src/core/inventory/InventoryService';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function main() {
  const src = fs.readFileSync('src/core/inventory/InventoryService.ts', 'utf8');
  const fn = src.slice(src.indexOf('async returnStock'), src.indexOf('// 7.6E: Item Ledger'));
  check('S1 aggregates prior returns by referenceId', /priorQtyByItem/.test(fn) && /referenceId/.test(fn));
  check('S2 aggregates request lines per itemId', /reqQtyByItem/.test(fn));
  check('S3 aggregates original lines per itemId', /origQtyByItem/.test(fn));
  check('S4 validates return type vs original document type', /return-type-mismatch/.test(fn) || /expectOrigType/.test(fn));

  const st: any = new InMemoryAdapter();
  const pe = new PostingEngine(st);
  const ne = new NumberingEngine(st);
  const inv = new InventoryService(st, pe, ne);
  const T = `ret-${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  // Seed warehouse + item + stock
  const whId = `WH-${T}`.slice(0, 40);
  const itemId = `IT-${T}`.slice(0, 40);
  await st.saveWarehouse?.(T, { id: whId, tenantId: T, companyId: T, code: 'W1', nameAr: 'رئيسي', isActive: true } as any, `wh-${T}`).catch?.(() => null);
  if (st.warehouses) st.warehouses.set(`${T}:${whId}`, { id: whId, tenantId: T, companyId: T, code: 'W1', nameAr: 'رئيسي', isActive: true });
  if (st.stockItems) {
    st.stockItems.set(`${T}:${itemId}`, {
      id: itemId, tenantId: T, itemCode: 'SKU1', nameAr: 'صنف', isActive: true,
      valuationMethod: 'WEIGHTED_AVERAGE', inventoryAccountCode: '1105', cogsAccountCode: '5101',
    });
  }
  // Original RECEIPT qty 10
  const origId = `DOC-${T}`.slice(0, 40);
  const origDoc = {
    id: origId, tenantId: T, companyId: T, documentNumber: 'REC-1', documentType: 'RECEIPT',
    warehouseId: whId, status: 'POSTED', totalQuantity: 10, totalCost: 100,
    lines: [{ id: 'ol1', tenantId: T, companyId: T, documentId: origId, lineNumber: 1, itemId, itemCode: 'SKU1', itemNameAr: 'صنف', uom: 'PCS', quantity: 10, unitCost: 10, totalCost: 100 }],
    performedBy: 'u', performedByName: 'U', idempotencyKey: `orig-${T}`, createdAt: now, postedAt: now,
  };
  if (st.stockDocuments) st.stockDocuments.set(`${T}:${origId}`, origDoc);
  // Available stock for RETURN_RECEIPT
  if (st.warehouseStock) {
    st.warehouseStock.set(`${T}:${whId}:${itemId}`, { tenantId: T, warehouseId: whId, itemId, onHandQty: 10, availableQty: 10, reservedQty: 0, avgUnitCost: 10 });
  }

  // 1) First return 8 — ok
  const r1 = await inv.returnStock(T, {
    originalDocumentId: origId, returnType: 'RETURN_RECEIPT', reason: 'r1',
    performedBy: 'u', performedByName: 'U', idempotencyKey: `r1-${T}`,
    lines: [{ itemId, quantity: 8 }],
  } as any);
  check('R1 first return 8 of 10 succeeds', !!r1.success, String(r1.error?.detail || r1.error || ''));

  // 2) Second return 5 — must fail (8+5>10)
  const r2 = await inv.returnStock(T, {
    originalDocumentId: origId, returnType: 'RETURN_RECEIPT', reason: 'r2',
    performedBy: 'u', performedByName: 'U', idempotencyKey: `r2-${T}`,
    lines: [{ itemId, quantity: 5 }],
  } as any);
  check('R2 second return 5 rejected (cumulative)', !r2.success && (r2.error?.status === 400), String(r2.error?.detail || ''));

  // 3) Second return 2 — ok (8+2=10)
  const r3 = await inv.returnStock(T, {
    originalDocumentId: origId, returnType: 'RETURN_RECEIPT', reason: 'r3',
    performedBy: 'u', performedByName: 'U', idempotencyKey: `r3-${T}`,
    lines: [{ itemId, quantity: 2 }],
  } as any);
  check('R3 return remaining 2 succeeds', !!r3.success, String(r3.error?.detail || ''));

  // 4) Duplicate lines in one request 6+5 on fresh original
  const orig2 = `DOC2-${T}`.slice(0, 40);
  const o2 = { ...origDoc, id: orig2, documentNumber: 'REC-2', idempotencyKey: `orig2-${T}`,
    lines: [{ ...origDoc.lines[0], id: 'ol2', documentId: orig2, quantity: 10, totalCost: 100 }] };
  if (st.stockDocuments) st.stockDocuments.set(`${T}:${orig2}`, o2);
  if (st.warehouseStock) {
    st.warehouseStock.set(`${T}:${whId}:${itemId}`, { tenantId: T, warehouseId: whId, itemId, onHandQty: 20, availableQty: 20, reservedQty: 0, avgUnitCost: 10 });
  }
  const r4 = await inv.returnStock(T, {
    originalDocumentId: orig2, returnType: 'RETURN_RECEIPT', reason: 'dup',
    performedBy: 'u', performedByName: 'U', idempotencyKey: `r4-${T}`,
    lines: [{ itemId, quantity: 6 }, { itemId, quantity: 5 }],
  } as any);
  check('R4 duplicate lines 6+5>10 rejected', !r4.success, String(r4.error?.detail || ''));

  // 5) Type mismatch
  const r5 = await inv.returnStock(T, {
    originalDocumentId: origId, returnType: 'RETURN_ISSUE', reason: 'bad',
    performedBy: 'u', performedByName: 'U', idempotencyKey: `r5-${T}`,
    lines: [{ itemId, quantity: 1 }],
  } as any);
  check('R5 RETURN_ISSUE against RECEIPT rejected', !r5.success, String(r5.error?.detail || ''));

  console.log(`
Passed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
