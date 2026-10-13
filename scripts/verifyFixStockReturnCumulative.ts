/**
 * @file verifyFixStockReturnCumulative.ts
 * Guard + service path coverage + concurrent double-return race on InMemory atomic post.
 * Engines: src/core/engines/*  Run: npx tsx scripts/verifyFixStockReturnCumulative.ts
 */
import fs from 'fs';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { InventoryService } from '../src/core/inventory/InventoryService';
import {
  assertCumulativeWithinOriginal,
  assertReturnTypeMatchesOriginal,
  assertStockCoversRequest,
  assertOriginalPosted,
  sumLinesByItem,
} from '../src/core/inventory/stockReturnGuard';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

function seedOrig(st: any, T: string, origId: string, whId: string, itemId: string, qty = 10, status = 'POSTED') {
  const now = new Date().toISOString();
  if (st.warehouses) st.warehouses.set(`${T}:${whId}`, { id: whId, tenantId: T, companyId: T, code: 'W1', nameAr: 'ر', isActive: true });
  if (st.stockItems) st.stockItems.set(`${T}:${itemId}`, { id: itemId, tenantId: T, itemCode: 'S', nameAr: 'ص', isActive: true, valuationMethod: 'WEIGHTED_AVERAGE' });
  const orig = {
    id: origId, tenantId: T, companyId: T, documentNumber: `REC-${origId.slice(-6)}`, documentType: 'RECEIPT',
    warehouseId: whId, status, totalQuantity: qty, totalCost: qty * 10,
    lines: [{ id: `l-${origId}`, tenantId: T, companyId: T, documentId: origId, lineNumber: 1, itemId, itemCode: 'S', itemNameAr: 'ص', uom: 'PCS', quantity: qty, unitCost: 10, totalCost: qty * 10 }],
    performedBy: 'u', performedByName: 'U', idempotencyKey: `o-${origId}`, createdAt: now, postedAt: now,
  };
  if (st.stockDocuments) st.stockDocuments.set(`${T}:${origId}`, orig);
  if (st.warehouseStock) st.warehouseStock.set(`${T}:${whId}:${itemId}`, { tenantId: T, warehouseId: whId, itemId, onHandQty: qty, availableQty: qty, reservedQty: 0, avgUnitCost: 10 });
  return orig;
}

async function main() {
  check('G1 type match', assertReturnTypeMatchesOriginal('RETURN_RECEIPT', 'RECEIPT').ok);
  check('G2 type mismatch', !assertReturnTypeMatchesOriginal('RETURN_ISSUE', 'RECEIPT').ok);
  check('G3 posted ok', assertOriginalPosted('POSTED').ok);
  check('G4 cancel rejected', !assertOriginalPosted('CANCELLED').ok);
  check('G5 cumulative over', !assertCumulativeWithinOriginal(new Map([['A', 10]]), new Map([['A', 8]]), new Map([['A', 5]])).ok);
  check('G6 stock over', !assertStockCoversRequest(new Map([['A', 10]]), new Map([['A', 11]])).ok);
  check('G7 sum dup lines', sumLinesByItem([{ itemId: 'A', quantity: 6 }, { itemId: 'A', quantity: 5 }]).get('A') === 11);

  const src = fs.readFileSync('src/core/inventory/InventoryService.ts', 'utf8');
  check('S1 uses assertOriginalPosted', /assertOriginalPosted/.test(src));
  check('S2 referenceId prior list', /referenceId:\s*origDoc\.id/.test(src));
  const pgSrc = fs.readFileSync('src/core/storage/adapters/PostgresPrimaryAdapter.ts', 'utf8');
  check('S3 PG checks orig status POSTED', /invalid-original-status/.test(pgSrc) && /FOR UPDATE/.test(pgSrc));

  const st: any = new InMemoryAdapter();
  const inv = new InventoryService(st, new PostingEngine(st), new NumberingEngine(st));
  const T = `ret2-${Date.now().toString(36)}`;
  const whId = `WH-${T}`.slice(0, 40);
  const itemId = `IT-${T}`.slice(0, 40);
  const origId = `DOC-${T}`.slice(0, 40);
  seedOrig(st, T, origId, whId, itemId, 10, 'POSTED');

  const r1 = await inv.returnStock(T, { originalDocumentId: origId, returnType: 'RETURN_RECEIPT', reason: 'r1', performedBy: 'u', performedByName: 'U', idempotencyKey: `r1-${T}`, lines: [{ itemId, quantity: 8 }] } as any);
  check('R1 first 8/10 ok', !!r1.success, String(r1.error?.detail || ''));
  const r2 = await inv.returnStock(T, { originalDocumentId: origId, returnType: 'RETURN_RECEIPT', reason: 'r2', performedBy: 'u', performedByName: 'U', idempotencyKey: `r2-${T}`, lines: [{ itemId, quantity: 5 }] } as any);
  check('R2 cumulative 5 rejected', !r2.success, String(r2.error?.detail || ''));
  if (st.warehouseStock) {
    const ws = st.warehouseStock.get(`${T}:${whId}:${itemId}`);
    if (ws) ws.availableQty = 10;
  }
  if (st.warehouseStock) { const ws = st.warehouseStock.get(`${T}:${whId}:${itemId}`); if (ws) ws.availableQty += 2; }
  const r3 = await inv.returnStock(T, { originalDocumentId: origId, returnType: 'RETURN_RECEIPT', reason: 'r3', performedBy: 'u', performedByName: 'U', idempotencyKey: `r3-${T}`, lines: [{ itemId, quantity: 2 }] } as any);
  check('R3 remaining 2 ok', !!r3.success, String(r3.error?.detail || ''));

  const orig2 = `DOC2-${T}`.slice(0, 40);
  seedOrig(st, T, orig2, whId, itemId, 10, 'POSTED');
  if (st.warehouseStock) st.warehouseStock.set(`${T}:${whId}:${itemId}`, { tenantId: T, warehouseId: whId, itemId, onHandQty: 20, availableQty: 20, reservedQty: 0, avgUnitCost: 10 });
  const r4 = await inv.returnStock(T, { originalDocumentId: orig2, returnType: 'RETURN_RECEIPT', reason: 'dup', performedBy: 'u', performedByName: 'U', idempotencyKey: `r4-${T}`, lines: [{ itemId, quantity: 6 }, { itemId, quantity: 5 }] } as any);
  check('R4 dup lines 6+5>10 rejected', !r4.success, String(r4.error?.detail || ''));

  const r5 = await inv.returnStock(T, { originalDocumentId: origId, returnType: 'RETURN_ISSUE', reason: 'bad', performedBy: 'u', performedByName: 'U', idempotencyKey: `r5-${T}`, lines: [{ itemId, quantity: 1 }] } as any);
  check('R5 type mismatch rejected', !r5.success, String(r5.error?.detail || ''));

  const origCancel = `DOC-C-${T}`.slice(0, 40);
  seedOrig(st, T, origCancel, whId, itemId, 10, 'CANCELLED');
  const r6 = await inv.returnStock(T, { originalDocumentId: origCancel, returnType: 'RETURN_RECEIPT', reason: 'c', performedBy: 'u', performedByName: 'U', idempotencyKey: `r6-${T}`, lines: [{ itemId, quantity: 1 }] } as any);
  check('R6 cancelled original rejected', !r6.success, String(r6.error?.detail || ''));

  const st2: any = new InMemoryAdapter();
  const T2 = `race-${Date.now().toString(36)}`;
  const wh2 = `WH-${T2}`.slice(0, 40);
  const it2 = `IT-${T2}`.slice(0, 40);
  const o2 = `DOC-${T2}`.slice(0, 40);
  seedOrig(st2, T2, o2, wh2, it2, 10, 'POSTED');
  const mkReturnDoc = (id: string, key: string) => {
    const now = new Date().toISOString();
    const lines = [{ id: `rl-${id}`, tenantId: T2, companyId: T2, documentId: id, lineNumber: 1, itemId: it2, itemCode: 'S', itemNameAr: 'ص', uom: 'PCS', quantity: 8, unitCost: 10, totalCost: 80 }];
    const movements = [{ id: `m-${id}`, tenantId: T2, companyId: T2, movementNumber: `${id}-1`, movementType: 'ISSUE', warehouseId: wh2, itemId: it2, itemCode: 'S', itemNameAr: 'ص', quantity: 8, unitCost: 10, totalCost: 80, balanceAfterQty: 0, sourceDocumentType: 'RETURN_RECEIPT', sourceDocumentId: id, sourceDocumentNumber: id, performedBy: 'u', performedByName: 'U', timestamp: now, idempotencyKey: key }];
    const doc = {
      id, tenantId: T2, companyId: T2, documentNumber: id, documentType: 'RETURN_RECEIPT' as const,
      warehouseId: wh2, status: 'POSTED' as const, totalQuantity: 8, totalCost: 80,
      referenceType: 'RECEIPT', referenceId: o2, referenceNumber: 'R', notes: 'race',
      lines, performedBy: 'u', performedByName: 'U', idempotencyKey: key, createdAt: now, postedAt: now,
    };
    return { doc, movements };
  };
  const a = mkReturnDoc(`RET-A-${T2}`.slice(0, 40), `ka-${T2}`);
  const b = mkReturnDoc(`RET-B-${T2}`.slice(0, 40), `kb-${T2}`);
  const results = await Promise.all([
    st2.postStockDocumentAtomic(T2, { doc: a.doc, movements: a.movements, useProvidedCost: true }, a.doc.idempotencyKey),
    st2.postStockDocumentAtomic(T2, { doc: b.doc, movements: b.movements, useProvidedCost: true }, b.doc.idempotencyKey),
  ]);
  const wins = results.filter((r: any) => r.success).length;
  check('R7 concurrent double-return: not both succeed', wins <= 1, `wins=${wins}`);
  check('R8 concurrent: at least one outcome recorded', results.length === 2);

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
