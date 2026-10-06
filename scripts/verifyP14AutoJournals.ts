/** Phase 14 ACC-AUTO-001 — InMemory suite (no DB required). */
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { StockAccountingService } from '../src/core/inventory/StockAccountingService';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};
const near = (a: number, b: number, eps = 0.05) => Math.abs(Number(a) - Number(b)) <= eps;

async function seed(st: InMemoryAdapter, T: string) {
  for (const c of [
    { code: '1105', type: 'ASSET', nameAr: 'مخزون' },
    { code: '1109', type: 'ASSET', nameAr: 'طريق' },
    { code: '2106', type: 'LIABILITY', nameAr: 'GRIR' },
    { code: '5101', type: 'EXPENSE', nameAr: 'COGS' },
    { code: '1105-ALT', type: 'ASSET', nameAr: 'مخزون2' },
  ] as const) {
    await st.saveAccount(T, { code: c.code, tenantId: T, nameAr: c.nameAr, type: c.type as any, isActive: true, debitBalance: 0, creditBalance: 0, balance: 0 }, `s-${c.code}-${T}`);
  }
}

async function setup() {
  const st = new InMemoryAdapter();
  const pe = new PostingEngine(st);
  const ne = new NumberingEngine(st);
  const svc = new InventoryService(st, pe, ne);
  const T = `t14-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await seed(st, T);
  const w1 = (await st.saveWarehouse(T, { id: `W1-${T}`.slice(0, 60), tenantId: T, companyId: T, code: 'W1', nameAr: 'رئيسي', isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString() } as any, `w1-${T}`)).data!;
  const w2 = (await st.saveWarehouse(T, { id: `W2-${T}`.slice(0, 60), tenantId: T, companyId: T, code: 'W2', nameAr: 'فرعي', isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString() } as any, `w2-${T}`)).data!;
  const item = async (code: string, inv = '1105') => {
    const r = await svc.saveStockItem(T, { id: `IT-${code}-${T}`.slice(0, 60), itemCode: code.slice(0, 20), nameAr: code, category: 'X', valuationMethod: 'WEIGHTED_AVERAGE', inventoryAccountCode: inv, cogsAccountCode: '5101' } as any, `it-${code}-${T}`);
    if (!r.success) throw new Error(r.error?.detail || 'item');
    return r.data!;
  };
  return { st, pe, svc, T, w1: w1.id, w2: w2.id, item };
}

async function posted(st: InMemoryAdapter, T: string) {
  return ((await st.listJournalEntries(T)).data || []).filter((e) => e.status === 'POSTED');
}

async function main() {
  // هـ
  {
    const { st, svc, T, w1, item } = await setup();
    const it = await item('A');
    const n0 = (await posted(st, T)).length;
    const r = await svc.receiveStock(T, { warehouseId: w1, idempotencyKey: `e-${T}`, lines: [{ itemId: it.id, quantity: 100, unitCost: 10 }] } as any);
    check('(هـ) settings off receive ok', r.success);
    check('(هـ) journal NONE', !(r.data as any)?.journalStatus || (r.data as any)?.journalStatus === 'NONE');
    check('(هـ) no JE', (await posted(st, T)).length === n0);
  }
  // أ
  {
    const { st, svc, T, w1, item } = await setup();
    const it = await item('A');
    await svc.saveStockAccountingConfig(T, { autoPostEnabled: true }, 'u', `cfg-a-${T}`);
    const r = await svc.receiveStock(T, { warehouseId: w1, idempotencyKey: `a-${T}`, lines: [{ itemId: it.id, quantity: 100, unitCost: 10 }] } as any);
    check('(أ) receive ok', r.success, r.error?.detail || '');
    check('(أ) POSTED', (r.data as any)?.journalStatus === 'POSTED');
    const jes = await posted(st, T);
    check('(أ) one JE', jes.length >= 1);
    const je = jes[jes.length - 1];
    const dr = je.lines.filter((l) => l.accountCode === '1105').reduce((s, l) => s + l.debit, 0);
    const cr = je.lines.filter((l) => l.accountCode === '2106').reduce((s, l) => s + l.credit, 0);
    check('(أ) Dr1105=1000', near(dr, 1000), `dr=${dr}`);
    check('(أ) Cr2106=1000', near(cr, 1000), `cr=${cr}`);
  }
  // ب
  {
    const { st, svc, T, w1, item } = await setup();
    const it = await item('B');
    await svc.saveStockAccountingConfig(T, { autoPostEnabled: true }, 'u', `cfg-b-${T}`);
    await svc.receiveStock(T, { warehouseId: w1, idempotencyKey: `b0-${T}`, lines: [{ itemId: it.id, quantity: 100, unitCost: 10 }] } as any);
    const r = await svc.issueStock(T, { warehouseId: w1, idempotencyKey: `b1-${T}`, lines: [{ itemId: it.id, quantity: 40 }] } as any);
    check('(ب) issue ok', r.success, r.error?.detail || '');
    const jes = await posted(st, T);
    const issueJe = jes.find((e) => e.type.includes('صرف') || e.code.includes('ISS')) || jes[jes.length - 1];
    const dr = issueJe.lines.filter((l) => l.accountCode === '5101').reduce((s, l) => s + l.debit, 0);
    const cr = issueJe.lines.filter((l) => l.accountCode === '1105').reduce((s, l) => s + l.credit, 0);
    check('(ب) Dr5101=400', near(dr, 400), `dr=${dr}`);
    check('(ب) Cr1105=400', near(cr, 400), `cr=${cr}`);
  }
  // ج
  {
    const { st, svc, T, w1, w2, item } = await setup();
    const it = await item('C');
    await svc.saveStockAccountingConfig(T, { autoPostEnabled: true }, 'u', `cfg-c-${T}`);
    await svc.receiveStock(T, { warehouseId: w1, idempotencyKey: `c0-${T}`, lines: [{ itemId: it.id, quantity: 100, unitCost: 10 }] } as any);
    const tr = await svc.createTransfer(T, { sourceWarehouseId: w1, targetWarehouseId: w2, requestedBy: 'u', requestedByName: 'U', idempotencyKey: `ct-${T}`, lines: [{ itemId: it.id, quantity: 30 }] } as any);
    check('(ج) dispatch ok', tr.success, tr.error?.detail || '');
    const rc = await svc.receiveTransfer(T, tr.data!.id, 'u2', 'U2', `cr-${T}`);
    check('(ج) receive ok', rc.success, rc.error?.detail || '');
    let net = 0;
    for (const e of await posted(st, T)) for (const l of e.lines) if (l.accountCode === '1109') net += l.debit - l.credit;
    check('(ج) net 1109 = 0', near(net, 0), `net=${net}`);
  }
  // د
  {
    const { st, svc, T, w1, item } = await setup();
    const a = await item('D1', '1105');
    const b = await item('D2', '1105-ALT');
    await svc.saveStockAccountingConfig(T, { autoPostEnabled: true }, 'u', `cfg-d-${T}`);
    const r = await svc.receiveStock(T, { warehouseId: w1, idempotencyKey: `d-${T}`, lines: [{ itemId: a.id, quantity: 10, unitCost: 5 }, { itemId: b.id, quantity: 20, unitCost: 3 }] } as any);
    check('(د) multi-account ok', r.success);
    const je = (await posted(st, T)).slice(-1)[0];
    check('(د) balanced', !!je && near(je.lines.reduce((s, l) => s + l.debit, 0), je.lines.reduce((s, l) => s + l.credit, 0)));
  }
  // و closed period
  {
    const { st, svc, T, w1, item } = await setup();
    const it = await item('F');
    await svc.saveStockAccountingConfig(T, { autoPostEnabled: true }, 'u', `cfg-f-${T}`);
    (st as any).getPeriodForDate = async () => ({ success: true, data: { id: 'p', tenantId: T, code: 'Y', startDate: '2026-01-01', endDate: '2026-12-31', status: 'CLOSED' } });
    const n0 = ((await st.listStockMovements(T)).data || []).length;
    const r = await svc.receiveStock(T, { warehouseId: w1, idempotencyKey: `f-${T}`, lines: [{ itemId: it.id, quantity: 5, unitCost: 10 }] } as any);
    check('(و) closed → 422', !r.success && r.error?.status === 422);
    check('(و) no movement', ((await st.listStockMovements(T)).data || []).length === n0);
  }
  // ز
  {
    const { svc, T } = await setup();
    const bad = await svc.saveStockAccountingConfig(T, { autoPostEnabled: true, grirAccountCode: 'NOPE' }, 'u', `cfg-z-${T}`);
    check('(ز) bad account rejected', !bad.success);
  }
  // ح retry
  {
    const { st, svc, pe, T, w1, item } = await setup();
    const it = await item('H');
    await svc.saveStockAccountingConfig(T, { autoPostEnabled: true }, 'u', `cfg-h-${T}`);
    const orig = pe.postEntry.bind(pe);
    let once = true;
    (pe as any).postEntry = async (...a: any[]) => {
      if (once) { once = false; return { success: false, error: { type: 'x', title: 'x', status: 500, detail: 'forced' } }; }
      return orig(...a);
    };
    const r = await svc.receiveStock(T, { warehouseId: w1, idempotencyKey: `h-${T}`, lines: [{ itemId: it.id, quantity: 10, unitCost: 10 }] } as any);
    check('(ح) stock ok + PENDING_RETRY', r.success && (r.data as any)?.journalStatus === 'PENDING_RETRY');
    const retry = await svc.retryStockDocumentJournal(T, r.data!.id, `hr-${T}`);
    check('(ح) retry POSTED', retry.success && (retry.data as any)?.journalStatus === 'POSTED');
    (pe as any).postEntry = orig;
  }
  // ط + ي
  {
    const { st, svc, T, w1, item } = await setup();
    const it = await item('I');
    await svc.saveStockAccountingConfig(T, { autoPostEnabled: true }, 'u', `cfg-i-${T}`);
    await svc.receiveStock(T, { warehouseId: w1, idempotencyKey: `i1-${T}`, lines: [{ itemId: it.id, quantity: 50, unitCost: 8 }] } as any);
    let ok = true;
    for (const e of await posted(st, T)) {
      if (!near(e.lines.reduce((s, l) => s + l.debit, 0), e.lines.reduce((s, l) => s + l.credit, 0))) ok = false;
    }
    check('(ط) all balanced', ok);
    const { svc: svc2, T: T2 } = await setup();
    const cfg = await svc2.getStockAccountingConfig(T2);
    check('(ي) default auto off', cfg.success && cfg.data?.autoPostEnabled === false);
  }
  // builder unit
  {
    const { st, pe, T, item } = await setup();
    const sa = new StockAccountingService(st, pe);
    const it = await item('U');
    const entry = sa.buildReceiptEntry({ id: 'd', tenantId: T, documentNumber: 'R1', performedBy: 'u', postedAt: new Date().toISOString(), lines: [{ itemId: it.id, quantity: 2, unitCost: 5, totalCost: 10 }] } as any, new Map([[it.id, it]]), { tenantId: T, autoPostEnabled: true, grirAccountCode: '2106', inTransitAccountCode: '1109', defaultInventoryAccountCode: '1105', defaultCogsAccountCode: '5101' });
    check('builder receipt', !!entry && near(entry!.totalAmount, 10));
  }

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
