/**
 * @file verifyRepairBatch1.ts
 * @description Repair batch 1 (DEF-P1-001 stock count, DEF-P1-002 stock return, DEF-P1-003 custody/expense reversal, DEF-P2-001 goods receipt race).
 * Service + InMemoryAdapter + failure injection on the PostingEngine. NO database needed.   Run:  npx tsx scripts/verifyRepairBatch1.ts
 * It proves the service logic and the InMemory contract only; the PostgreSQL row lock on the PO lines (DEF-P2-001) needs a real database to be proven.
 */
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { PurchasingService } from '../src/core/purchasing/PurchasingService';
import { CashCustodyService } from '../src/core/modules/custody/CashCustodyService';
import { ExpenseService } from '../src/core/modules/expenses/ExpenseService';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { ApprovalEngine } from '../src/core/engines/ApprovalEngine';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => { cond ? pass++ : fail++; console.log(`[${cond ? 'PASS' : 'FAIL'}] ${label}${!cond && extra ? ' | ' + extra : ''}`); };
const near = (a: number, b: number, e = 0.011) => Math.abs(Number(a) - Number(b)) <= e;
const now = () => new Date().toISOString();
async function scenario(name: string, fn: () => Promise<void>) {
  try { await fn(); } catch (e: any) { fail++; console.log(`[FAIL] ${name} crashed | ${e?.message || e}`); }
}

const flags = { failDraft: false, failPost: false };
async function setup() {
  const st = new InMemoryAdapter();
  const pe: any = new PostingEngine(st);
  const od = pe.draftEntry.bind(pe), op = pe.postEntry.bind(pe);
  pe.draftEntry = async (...a: any[]) => (flags.failDraft ? { success: false, error: { type: 'x', title: 'x', status: 500, detail: 'draft down' } } : od(...a));
  pe.postEntry = async (...a: any[]) => (flags.failPost ? { success: false, error: { type: 'x', title: 'x', status: 500, detail: 'post down' } } : op(...a));
  const ne = new NumberingEngine(st);
  const inv = new InventoryService(st, pe, ne);
  const T = `rb1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  for (const [code, type] of [['5209', 'EXPENSE'], ['1105', 'ASSET'], ['4203', 'REVENUE'], ['2101', 'LIABILITY'], ['5101', 'EXPENSE']] as const) {
    await st.saveAccount(T, { code, tenantId: T, nameAr: code, type, isActive: true, debitBalance: 0, creditBalance: 0, balance: 0 } as any, `acc-${code}-${T}`);
  }
  const wh = (await st.saveWarehouse(T, { id: `W-${T}`.slice(0, 60), tenantId: T, companyId: T, code: 'W1', nameAr: 'رئيسي', isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: now() } as any, `wh-${T}`)).data!;
  const mk = async (code: string) => (await inv.saveStockItem(T, { id: `${code}-${T}`.slice(0, 60), itemCode: `${code}-${T}`.slice(0, 30), nameAr: `صنف ${code}`, category: 'X', valuationMethod: 'WEIGHTED_AVERAGE' } as any, `it-${code}-${T}`)).data!;
  const A = await mk('A'), B = await mk('B');
  const recv = (key: string, item: any, qty: number, cost: number) => inv.receiveStock(T, { warehouseId: wh.id, idempotencyKey: `${key}-${T}`, lines: [{ itemId: item.id, quantity: qty, unitCost: cost }] } as any);
  const bal = async (item: any) => (await st.getWarehouseStock(T, wh.id, item.id)).data?.currentQty;
  const jeCount = async (codePrefix: string) => ((await st.listJournalEntries(T)).data || []).filter((e: any) => String(e.code).startsWith(codePrefix));
  return { st, pe, inv, T, wh, A, B, recv, bal, jeCount };
}


// ---------- DEF-P2-001: PostgreSQL JavaScript logic with a scripted fake client (no database) ----------
// Proves the ORDER of the statements (lock the PO lines BEFORE any insert) and the fail-closed branches of the REAL saveGoodsReceipt;
// it does NOT prove SQL syntax or that a second transaction really waits on the row lock (that needs a real PostgreSQL).
async function pgGuardChecks() {
  const mod: any = await import('../src/core/storage/adapters/PostgresPrimaryAdapter');
  const run = async (openQty: number, want: number, tol: number) => {
    const log: string[] = [];
    const client: any = {
      release() {},
      query: async (sql: string) => {
        const q = String(sql).replace(/\s+/g, ' ').trim();
        log.push(/^(BEGIN|COMMIT|ROLLBACK)/i.test(q) ? q.split(' ')[0].toUpperCase() : /set_config/i.test(q) ? 'SET_TENANT' : /FROM an_purchase_order_lines.*FOR UPDATE/i.test(q) ? 'LOCK_PO_LINE' : /FROM an_goods_receipt_lines gl/i.test(q) ? 'SUM_OPEN' : /^INSERT/i.test(q) ? 'INSERT' : q.slice(0, 30));
        if (/FROM an_purchase_order_lines.*FOR UPDATE/i.test(q)) return { rows: [{ ordered_qty: 100, received_qty: 0 }] };
        if (/FROM an_goods_receipt_lines gl/i.test(q)) return { rows: [{ s: openQty }] };
        return { rows: [], rowCount: 1 };
      },
    };
    const adapter: any = new mod.PostgresPrimaryAdapter();
    adapter.pool = { connect: async () => client };
    const r = await adapter.saveGoodsReceipt('t', { id: 'gr-1', receiptNumber: 'G', poId: 'po', poNumber: 'PO', warehouseId: 'w', status: 'APPROVED', createdBy: 'u' }, [{ id: 'l1', receiptId: 'gr-1', poLineId: 'pl1', itemId: 'i', receivedQty: want }], 'k', { tolerancePct: tol });
    return { r, log };
  };
  const a = await run(0, 60, 0);
  check('(gr-pg-fake) allowed receipt: the PO line is locked BEFORE the first insert, then COMMIT', a.r.success && a.log.indexOf('LOCK_PO_LINE') >= 0 && a.log.indexOf('LOCK_PO_LINE') < a.log.indexOf('INSERT') && a.log[a.log.length - 1] === 'COMMIT', a.log.join(','));
  const b = await run(60, 60, 0);
  check('(gr-pg-fake) over-receipt (60 already open of 100, asking 60) => 422, ROLLBACK, no insert', !b.r.success && b.r.error?.status === 422 && !b.log.includes('INSERT') && b.log[b.log.length - 1] === 'ROLLBACK', b.log.join(','));
  const c = await run(60, 44, 10);
  const d = await run(60, 45, 10);
  check('(gr-pg-fake) tolerance 10% on a remaining of 40: 44 allowed, 45 rejected', c.r.success && !d.r.success, `${c.r.success}/${d.r.success}`);
}

async function main() {
  flags.failDraft = false; flags.failPost = false;

  // ---------- DEF-P1-001: stock count approval ----------
  await scenario('count', async () => {
    const { st, inv, T, wh, A, B, recv, bal, jeCount } = await setup();
    await recv('r1', A, 100, 10); await recv('r2', B, 50, 20);
    const mkCount = (key: string, lines: Array<[any, number]>) => inv.createStockCount(T, { countType: 'PERIODIC', warehouseId: wh.id, performedBy: 'u1', performedByName: 'U1', idempotencyKey: `${key}-${T}`, lines: lines.map(([i, q]) => ({ itemId: i.id, countedQty: q })) } as any);
    const approve = (id: string, key: string) => inv.approveAndPostStockCount(T, { countId: id, approvedBy: 'u2', approvedByName: 'U2', idempotencyKey: `${key}-${T}` });
    // (1) happy path: A 100 -> 80 (loss 200), B 50 -> 55 (gain 100); net -100
    const c1 = await mkCount('c1', [[A, 80], [B, 55]]);
    check('(count) create count 1', c1.success, c1.error?.detail || '');
    const a1 = await approve(c1.data!.id, 'a1');
    check('(count) approve ok, count POSTED with a journal id', a1.success && a1.data?.status === 'POSTED' && !!a1.data?.journalEntryId, a1.error?.detail || '');
    check('(count) stock adjusted: A=80, B=55', (await bal(A)) === 80 && (await bal(B)) === 55, `A=${await bal(A)} B=${await bal(B)}`);
    const je1 = a1.data?.journalEntryId ? (await st.getJournalEntry(T, a1.data.journalEntryId)).data : null;
    check('(count) journal POSTED: Dr 5209 = 100, Cr 1105 = 100', !!je1 && je1.status === 'POSTED' && near(je1.lines.find((l: any) => l.accountCode === '5209')?.debit, 100) && near(je1.lines.find((l: any) => l.accountCode === '1105')?.credit, 100));

    // (2) atomic failure: stock moved after the count, so one line can no longer be adjusted -> NOTHING changes
    const c2 = await mkCount('c2', [[A, 0], [B, 60]]);
    await inv.issueStock(T, { warehouseId: wh.id, idempotencyKey: `iss-${T}`, lines: [{ itemId: A.id, quantity: 70 }] } as any);
    const jeBefore = (await jeCount('JE-ADJ')).length;
    const a2 = await approve(c2.data!.id, 'a2');
    const cnt2 = (await st.getStockCount(T, c2.data!.id)).data?.count;
    check('(count) a line that cannot be adjusted => the whole approval is rejected (422)', !a2.success && a2.error?.status === 422, `status=${a2.error?.status} ${a2.error?.detail || ''}`);
    check('(count) rejected approval changed NO balance (A=10, B=55)', (await bal(A)) === 10 && (await bal(B)) === 55, `A=${await bal(A)} B=${await bal(B)}`);
    check('(count) rejected approval posted NO journal and the count is NOT POSTED', (await jeCount('JE-ADJ')).length === jeBefore && cnt2?.status !== 'POSTED', `status=${cnt2?.status}`);

    // (3) journal pre-check: an inactive account stops everything BEFORE any stock change
    await st.saveAccount(T, { code: '5209', tenantId: T, nameAr: 'x', type: 'EXPENSE', isActive: false, status: 'INACTIVE', debitBalance: 0, creditBalance: 0, balance: 0 } as any, `acc-off-${T}`);
    const c3 = await mkCount('c3', [[A, 5]]);
    const a3 = await approve(c3.data!.id, 'a3');
    check('(count) inactive journal account => 422 and no stock change', !a3.success && a3.error?.status === 422 && (await bal(A)) === 10, `status=${a3.error?.status} A=${await bal(A)}`);
    await st.saveAccount(T, { code: '5209', tenantId: T, nameAr: 'x', type: 'EXPENSE', isActive: true, status: 'ACTIVE', debitBalance: 0, creditBalance: 0, balance: 0 } as any, `acc-on-${T}`);

    // (4) the journal fails AFTER the stock step: count stays un-POSTED; a retry (even with a NEW key) never adjusts twice and completes the journal
    flags.failPost = true;
    const a4 = await approve(c3.data!.id, 'a4');
    check('(count) journal post failure is reported (not hidden) and the count is NOT POSTED', !a4.success && (await st.getStockCount(T, c3.data!.id)).data?.count.status !== 'POSTED', `${a4.error?.detail || ''}`);
    check('(count) stock was adjusted exactly once so far (A=5)', (await bal(A)) === 5, `A=${await bal(A)}`);
    flags.failPost = false;
    const a5 = await approve(c3.data!.id, 'a5-new-key');
    check('(count) retry with a new key completes: POSTED + journal id', a5.success && a5.data?.status === 'POSTED' && !!a5.data?.journalEntryId, a5.error?.detail || '');
    check('(count) retry did NOT adjust the stock again (A still 5)', (await bal(A)) === 5, `A=${await bal(A)}`);
    const cn3 = (await st.getStockCount(T, c3.data!.id)).data?.count;
    check('(count) exactly one journal entry for that count', (await jeCount(`JE-ADJ-${cn3?.countNumber}`)).length === 1);
  });

  // ---------- DEF-P1-002: stock return ----------
  await scenario('return', async () => {
    const { st, inv, T, A, recv, bal, jeCount } = await setup();
    const rec = await recv('rr1', A, 100, 10);
    const docId = rec.data!.id;
    const ret = (type: 'RETURN_RECEIPT' | 'RETURN_ISSUE', origId: string, qty: number, key: string) =>
      inv.returnStock(T, { originalDocumentId: origId, returnType: type, reason: 'اختبار', performedBy: 'u1', performedByName: 'U1', idempotencyKey: `${key}-${T}`, lines: [{ itemId: A.id, quantity: qty }] } as any);

    const ok = await ret('RETURN_RECEIPT', docId, 5, 'ok');
    check('(return) normal return: journalStatus POSTED with a journal id', ok.success && ok.data?.journalStatus === 'POSTED' && !!ok.data?.journalEntryId, JSON.stringify(ok.data?.journalStatus));

    flags.failPost = true;
    const r1 = await ret('RETURN_RECEIPT', docId, 10, 'f1');
    flags.failPost = false;
    check('(return) journal post fails => stock moved but document is PENDING_RETRY (not silently OK)', r1.success && r1.data?.journalStatus === 'PENDING_RETRY' && (await bal(A)) === 85, `status=${r1.data?.journalStatus} A=${await bal(A)}`);
    const rt = await inv.retryStockDocumentJournal(T, r1.data!.id, 'retry-1');
    check('(return) retry route posts the return journal', rt.success && rt.data?.journalStatus === 'POSTED', rt.error?.detail || JSON.stringify(rt.data));
    const je = (await jeCount(`JE-${r1.data!.documentNumber}`));
    check('(return) exactly one entry: Dr 2101 = 100, Cr 1105 = 100', je.length === 1 && near(je[0].lines.find((l: any) => l.accountCode === '2101')?.debit, 100) && near(je[0].lines.find((l: any) => l.accountCode === '1105')?.credit, 100));
    const rt2 = await inv.retryStockDocumentJournal(T, r1.data!.id, 'retry-2');
    check('(return) a second retry is harmless (still one entry)', rt2.success && (await jeCount(`JE-${r1.data!.documentNumber}`)).length === 1);

    const iss = await inv.issueStock(T, { warehouseId: (await st.getWarehouseStock(T, rec.data!.warehouseId, A.id)).data!.warehouseId, idempotencyKey: `is-${T}`, lines: [{ itemId: A.id, quantity: 20 }] } as any);
    flags.failDraft = true;
    const r2 = await ret('RETURN_ISSUE', iss.data!.id, 5, 'f2');
    flags.failDraft = false;
    check('(return) journal DRAFT fails => PENDING_RETRY with no journal id', r2.success && r2.data?.journalStatus === 'PENDING_RETRY' && !r2.data?.journalEntryId, `status=${r2.data?.journalStatus}`);
    const rt3 = await inv.retryStockDocumentJournal(T, r2.data!.id, 'retry-3');
    const je2 = await jeCount(`JE-${r2.data!.documentNumber}`);
    check('(return) retry after a draft failure posts: Dr 1105, Cr 5101', rt3.success && rt3.data?.journalStatus === 'POSTED' && je2.length === 1 && !!je2[0].lines.find((l: any) => l.accountCode === '5101' && l.credit > 0), rt3.error?.detail || '');
  });

  // ---------- DEF-P1-003: custody voucher / custody return / expense reversal ----------
  const spyPort = (over: Record<string, any>) => {
    const calls: Record<string, number> = {};
    const port: any = new Proxy({}, { get: (_t, p: string) => over[p] ? (...a: any[]) => { calls[p] = (calls[p] || 0) + 1; return over[p](...a); } : async () => ({ success: true, data: null }) });
    return { port, calls };
  };
  const fakePosting = (f: { draft: boolean; post: boolean }) => ({
    draftEntry: async (_t: string, e: any) => (f.draft ? { success: false, error: { type: 'x', title: 'x', status: 500, detail: 'draft down' } } : { success: true, data: { id: e.id } }),
    postEntry: async (_t: string, id: string) => (f.post ? { success: false, error: { type: 'x', title: 'x', status: 500, detail: 'post down' } } : { success: true, data: { id } }),
  }) as any;

  await scenario('custody-record', async () => {
    for (const mode of ['draft', 'post'] as const) {
      const saved: any[] = [];
      const { port, calls } = spyPort({
        getCashCustody: async () => ({ success: true, data: { id: 'C1', status: 'OPEN', currentBalance: 1000, costCenterId: 'cc', costCenterName: 'cc', employeeName: 'E', companyId: 'T' } }),
        saveCustodyExpenseVoucher: async (_t: string, v: any) => { saved.push(v); return { success: true, data: v }; },
      });
      const svc = new CashCustodyService(port, fakePosting({ draft: mode === 'draft', post: mode === 'post' }));
      const r = await svc.recordExpense('T', { custodyId: 'C1', recordedBy: 'u', recordedByName: 'U', idempotencyKey: `k-${mode}`, lines: [{ expenseCategory: 'x', expenseAccountCode: '5040', description: 'd', amount: 100, receiptNumber: 'R1', attachmentUrl: '/a.pdf' }] } as any);
      check(`(custody) journal ${mode} fails => error returned, voucher NOT saved, balance NOT touched`, !r.success && saved.length === 0 && !calls['recordCustodyExpense'], `success=${r.success} saved=${saved.length}`);
    }
    const saved: any[] = [];
    const { port } = spyPort({
      getCashCustody: async () => ({ success: true, data: { id: 'C1', status: 'OPEN', currentBalance: 1000, costCenterId: 'cc', costCenterName: 'cc', employeeName: 'E', companyId: 'T' } }),
      saveCustodyExpenseVoucher: async (_t: string, v: any) => { saved.push(v); return { success: true, data: v }; },
    });
    try { await new CashCustodyService(port, fakePosting({ draft: false, post: false })).recordExpense('T', { custodyId: 'C1', recordedBy: 'u', recordedByName: 'U', idempotencyKey: 'k-ok', lines: [{ expenseCategory: 'x', expenseAccountCode: '5040', description: 'd', amount: 100, receiptNumber: 'R1', attachmentUrl: '/a.pdf' }] } as any); } catch { /* the rest of the flow is not under test */ }
    check('(custody) journal ok => voucher saved WITH its journalEntryId', saved.length === 1 && !!saved[0].journalEntryId);
  });

  await scenario('custody-return', async () => {
    const mkSvc = (f: { draft: boolean; post: boolean }) => {
      const { port, calls } = spyPort({
        getCustodyExpenseVoucher: async () => ({ success: true, data: { id: 'V1', custodyId: 'C1', status: 'POSTED', totalAmount: 100, voucherNumber: 'VCH-1', journalEntryId: 'JE', lines: [{ expenseAccountCode: '5040', amount: 100, description: 'd' }] } }),
        getCashCustody: async () => ({ success: true, data: { id: 'C1', currentBalance: 500 } }),
        updateCashCustody: async () => ({ success: true, data: {} }),
        reverseCustodyExpenseVoucher: async () => ({ success: true, data: { id: 'V1', status: 'REVERSED' } }),
      });
      return { svc: new CashCustodyService(port, fakePosting(f)), calls };
    };
    for (const mode of ['draft', 'post'] as const) {
      const { svc, calls } = mkSvc({ draft: mode === 'draft', post: mode === 'post' });
      const r = await svc.returnCustodyExpense('T', { voucherId: 'V1', performedBy: 'u', performedByName: 'U', idempotencyKey: `kr-${mode}` });
      check(`(custody-return) reversal ${mode} fails => error, voucher NOT reversed, custody balance NOT restored`, !r.success && !calls['reverseCustodyExpenseVoucher'] && !calls['updateCashCustody'], `success=${r.success} upd=${calls['updateCashCustody']}`);
    }
    const { svc, calls } = mkSvc({ draft: false, post: false });
    const r = await svc.returnCustodyExpense('T', { voucherId: 'V1', performedBy: 'u', performedByName: 'U', idempotencyKey: 'kr-ok' });
    check('(custody-return) reversal ok => balance restored once and voucher reversed', r.success && calls['updateCashCustody'] === 1 && calls['reverseCustodyExpenseVoucher'] === 1);
  });

  await scenario('expense-reverse', async () => {
    const mkSvc = (f: { draft: boolean; post: boolean }) => {
      const { port, calls } = spyPort({
        getExpenseRequest: async () => ({ success: true, data: { request: { id: 'E1', status: 'POSTED', journalEntryId: 'JE1', totalAmount: 100, requestCode: 'EX-1', disbursementAccountCode: '1010', notes: '' }, lines: [{ amount: 100, expenseAccountCode: '5040', description: 'd' }] } }),
        updateExpenseRequestStatus: async () => ({ success: true, data: { id: 'E1', status: 'REJECTED' } }),
      });
      return { svc: new ExpenseService(port, fakePosting(f), {} as any, {} as any), calls };
    };
    for (const mode of ['draft', 'post'] as const) {
      const { svc, calls } = mkSvc({ draft: mode === 'draft', post: mode === 'post' });
      const r = await svc.reverseExpense('T', { requestId: 'E1', reason: 'x', reversedBy: 'u', reversedByName: 'U', idempotencyKey: `ke-${mode}` });
      check(`(expense) reversal ${mode} fails => error and the request is NOT marked cancelled`, !r.success && !calls['updateExpenseRequestStatus'], `success=${r.success}`);
    }
    const { svc, calls } = mkSvc({ draft: false, post: false });
    const r = await svc.reverseExpense('T', { requestId: 'E1', reason: 'x', reversedBy: 'u', reversedByName: 'U', idempotencyKey: 'ke-ok' });
    check('(expense) reversal ok => request marked cancelled', r.success && calls['updateExpenseRequestStatus'] === 1);
  });

  // ---------- DEF-P2-001: goods receipt race ----------
  await scenario('gr-race', async () => {
    const st = new InMemoryAdapter();
    const pe = new PostingEngine(st), ne = new NumberingEngine(st);
    const inv = new InventoryService(st, pe, ne);
    const svc = new PurchasingService(st, new ApprovalEngine(st), ne, inv);
    const T = `rb1gr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    for (const [code, type] of [['1105', 'ASSET'], ['2101', 'LIABILITY'], ['5101', 'EXPENSE'], ['1109', 'ASSET']] as const) {
      await st.saveAccount(T, { code, tenantId: T, nameAr: code, type, isActive: true, debitBalance: 0, creditBalance: 0, balance: 0 } as any, `a-${code}-${T}`);
    }
    await inv.saveStockAccountingConfig(T, { autoPostEnabled: true }, 'u', `cfg-${T}`);
    const vendor = (await st.saveMasterPartner(T, { id: `V-${T}`.slice(0, 60), tenantId: T, type: 'VENDOR', nameAr: 'مورد', code: `VN-${T}`.slice(0, 20), isActive: true, createdAt: now() } as any, `vend-${T}`)).data!;
    const wh = (await st.saveWarehouse(T, { id: `W-${T}`.slice(0, 60), tenantId: T, companyId: T, code: 'W1', nameAr: 'رئيسي', isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: now() } as any, `wh-${T}`)).data!;
    const item = (await inv.saveStockItem(T, { id: `IT-${T}`.slice(0, 60), itemCode: `SKU-${T}`.slice(0, 20), nameAr: 'صنف', category: 'X', valuationMethod: 'WEIGHTED_AVERAGE', inventoryAccountCode: '1105', cogsAccountCode: '5101' } as any, `it-${T}`)).data!;
    const po = await svc.createPurchaseOrder(T, { vendorId: vendor.id, createdBy: 'buyer', idempotencyKey: `po-${T}`, lines: [{ itemId: item.id, orderedQty: 100, unitCost: 10 }] });
    await svc.openPurchaseOrder(T, po.data!.po.id, 'buyer');
    const lineId = po.data!.lines[0].id;
    const gr = (key: string, qty: number) => svc.createGoodsReceipt(T, { poId: po.data!.po.id, warehouseId: wh.id, createdBy: 'keeper', idempotencyKey: `${key}-${T}`, lines: [{ poLineId: lineId, receivedQty: qty }] });
    const [x, y] = await Promise.all([gr('g1', 60), gr('g2', 60)]);
    const wins = [x, y].filter((r: any) => r.success);
    const loser: any = [x, y].find((r: any) => !r.success);
    check('(gr-race) two concurrent receipts of 60 on a 100 line: exactly one succeeds', wins.length === 1, `wins=${wins.length}`);
    check('(gr-race) the other is rejected as over-receipt (422)', !!loser && loser.error?.status === 422, `status=${loser?.error?.status}`);
    const stock = (await st.getWarehouseStock(T, wh.id, item.id)).data?.currentQty || 0;
    check('(gr-race) stock never exceeds the ordered quantity (60 in stock)', near(stock, 60), `stock=${stock}`);
    const g3 = await gr('g3', 40);
    check('(gr-race) the remaining 40 can still be received', g3.success, g3.error?.detail || '');
    const g4 = await gr('g4', 1);
    check('(gr-race) one more unit is rejected after the line is complete', !g4.success, `status=${g4.error?.status}`);
  });

  await scenario('gr-pg-fake', pgGuardChecks);

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
