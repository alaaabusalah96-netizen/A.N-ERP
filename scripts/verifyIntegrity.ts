/**
 * @file scripts/verifyIntegrity.ts
 * @description Phase 8 (INT-001) — accounting & inventory integrity MEASUREMENT. Measures, never fixes.
 * Each item prints `[PASS|DEFECT|NOT RUN] <id> <description> :: <actual numbers>` and the run writes
 * evidence/integrity/baseline-report.md from the actual results. A DEFECT is not a failure of the phase.
 *
 * Needs .env: DATABASE_URL. Everything runs on one throw-away tenant (`int-<rand>`) that is removed in `finally`.
 * V2 (HTTP) is the only item that writes to a real tenant (MAIN); it is NOT RUN unless INTEGRITY_ALLOW_MAIN_WRITES=1
 * (use a dev/throw-away database) and SEED_ADMIN_PASSWORD is set.
 * Run:  npx tsx scripts/verifyIntegrity.ts   (twice; the RESULT-HASH line must be identical)
 */
import dotenv from 'dotenv';
dotenv.config();
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, ChildProcess } from 'node:child_process';
import { createTempTenant, makeWarehouse, makeItem, TempTenant } from './lib/testTenant';
import type { JournalEntry } from '../src/core/storage/StoragePort';
import { accessTokenFromResponse } from './lib/httpAuth';

type Status = 'PASS' | 'DEFECT' | 'NOT RUN';
interface Row { id: string; status: Status; desc: string; numbers: string }
const rows: Row[] = [];
const num = (v: any) => (v === undefined || v === null ? 'n/a' : String(Number(v)));
const close = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;
const BAD = (v: any) => (typeof v === 'string' ? JSON.stringify(v) : String(v));

async function item(id: string, desc: string, fn: () => Promise<{ status: Status; numbers: string }>) {
  let r: { status: Status; numbers: string };
  try { r = await fn(); }
  catch (e: any) { r = { status: 'NOT RUN', numbers: `exception: ${String(e?.message || e).slice(0, 300)}` }; }
  rows.push({ id, status: r.status, desc, numbers: r.numbers });
  console.log(`[${r.status}] ${id} ${desc} :: ${r.numbers}`);
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required'); process.exit(2); }
  const t: TempTenant = await createTempTenant({ seedChart: true });
  const { posting, inventory } = t.services;
  const tid = t.tenantId;
  const ACTOR = 'int-actor';
  let notes: string[] = [];

  const mkEntry = (tag: string, date: string, lines: [string, number, number][]): JournalEntry => {
    const id = t.uid(`JE-${tag}`);
    return {
      id, code: id, tenantId: tid, date, type: 'INTEGRITY', description: `integrity ${tag}`,
      lines: lines.map(([accountCode, debit, credit], i) => ({ id: `${id}-L${i}`, accountCode, debit, credit, description: `l${i}` })),
      totalAmount: lines.reduce((s, l) => s + l[1], 0), status: 'DRAFT', createdBy: ACTOR,
    };
  };
  const draftPost = async (tag: string, date: string, lines: [string, number, number][]) => {
    const e = mkEntry(tag, date, lines);
    const d = await posting.draftEntry(tid, e, t.uid('k-draft'));
    if (!d.success) return { entry: e, draft: d, post: null as any };
    const p = await posting.postEntry(tid, e.id, t.uid('k-post'));
    return { entry: e, draft: d, post: p };
  };
  const bal = async (code: string) => {
    const r = await t.storage.getAccountBalance(tid, code);
    return r.success && r.data ? Number(r.data.balance) : NaN;
  };
  const recv = (wh: string, lines: { itemId: string; quantity: any; unitCost?: any }[], key = t.uid('k-rcv')) =>
    inventory.receiveStock(tid, { header: { warehouseId: wh, performedBy: ACTOR, performedByName: 'Integrity', idempotencyKey: key }, lines } as any);
  const issue = (wh: string, lines: { itemId: string; quantity: any }[], key = t.uid('k-iss')) =>
    inventory.issueStock(tid, { header: { warehouseId: wh, performedBy: ACTOR, performedByName: 'Integrity', idempotencyKey: key }, lines } as any);
  const stockRow = async (wh: string, itemId: string) => {
    const r = await t.sql('SELECT current_qty, average_cost, total_value FROM an_warehouse_stock WHERE tenant_id=$1 AND warehouse_id=$2 AND item_id=$3', [tid, wh, itemId]);
    const x = r.rows[0];
    return x ? { qty: Number(x.current_qty), avg: Number(x.average_cost), val: Number(x.total_value) } : { qty: 0, avg: 0, val: 0 };
  };
  const movCount = async (where = '') => Number((await t.sql(`SELECT COUNT(*)::int AS n FROM an_stock_movements WHERE tenant_id=$1 ${where}`, [tid])).rows[0].n);

  try {
    const W1 = await makeWarehouse(t, 'W1');
    const W2 = await makeWarehouse(t, 'W2');

    // ============================== ACCOUNTING ==============================
    await item('A1', 'balanced entry posts; unbalanced (100/90) rejected at draft', async () => {
      const ok = await draftPost('A1ok', '2026-10-01', [['1101', 100, 0], ['4101', 0, 100]]);
      const bad = await posting.draftEntry(tid, mkEntry('A1bad', '2026-10-01', [['1101', 100, 0], ['4101', 0, 90]]), t.uid('k'));
      const good = ok.draft.success && ok.post?.success && ok.post.data?.status === 'POSTED';
      return { status: good && !bad.success ? 'PASS' : 'DEFECT', numbers: `balanced.draft=${ok.draft.success} balanced.post=${ok.post?.data?.status ?? 'n/a'} unbalanced.draft.success=${bad.success}` };
    });

    await item('A2', 'sum(debit) == sum(credit) over POSTED entries', async () => {
      await draftPost('A2a', '2026-10-02', [['1101', 250, 0], ['4101', 0, 250]]);
      await draftPost('A2b', '2026-10-03', [['5101', 75.5, 0], ['1101', 0, 75.5]]);
      await draftPost('A2c', '2026-10-04', [['1102', 40, 0], ['2101', 0, 40]]);
      const r = (await t.sql(
        `SELECT COALESCE(SUM(l.debit),0) AS d, COALESCE(SUM(l.credit),0) AS c, COUNT(DISTINCT e.id)::int AS n
           FROM an_journal_lines l JOIN an_journal_entries e ON e.id = l.entry_id
          WHERE e.tenant_id = $1 AND e.status = 'POSTED'`, [tid])).rows[0];
      return { status: close(Number(r.d), Number(r.c), 0.0001) ? 'PASS' : 'DEFECT', numbers: `entries=${r.n} debit=${num(r.d)} credit=${num(r.c)}` };
    });

    await item('A3', 'POSTED entry cannot be deleted; reverseEntry nets both accounts to zero', async () => {
      const b1 = await bal('1101'), b2 = await bal('4101');
      const { entry, post } = await draftPost('A3', '2026-10-05', [['1101', 60, 0], ['4101', 0, 60]]);
      if (!post?.success) return { status: 'NOT RUN', numbers: 'could not post the test entry: ' + JSON.stringify(post?.error ?? 'draft failed') };
      const mid1 = await bal('1101');
      const del = await posting.deleteEntry(tid, entry.id);
      const rev = await posting.reverseEntry(tid, entry.id, 'integrity A3', t.uid('k-rev'));
      const a1 = await bal('1101'), a2 = await bal('4101');
      const ok = !del.success && rev.success && close(a1, b1, 0.0001) && close(a2, b2, 0.0001);
      return { status: ok ? 'PASS' : 'DEFECT', numbers: `delete.success=${del.success} reverse.success=${rev.success} 1101: before=${num(b1)} afterPost=${num(mid1)} afterReverse=${num(a1)}; 4101: before=${num(b2)} afterReverse=${num(a2)}` };
    });

    await item('A4', 'posting into a CLOSED fiscal period is rejected', async () => {
      const pid = t.uid('PER');
      await t.sql(`INSERT INTO an_accounting_periods (id, tenant_id, code, start_date, end_date, status) VALUES ($1,$2,$3,'2019-01-01','2019-01-31','OPEN')`, [pid, tid, `INT-2019-01-${pid.slice(-4)}`]);
      const cl = await t.storage.setPeriodStatus(tid, pid, 'CLOSED', ACTOR, 'integrity A4');
      if (!cl.success) return { status: 'NOT RUN', numbers: 'setPeriodStatus failed: ' + JSON.stringify(cl.error) };
      const e = mkEntry('A4', '2019-01-15', [['1101', 10, 0], ['4101', 0, 10]]);
      const d = await posting.draftEntry(tid, e, t.uid('k'));
      if (!d.success) return { status: 'PASS', numbers: `rejected at draft status=${d.error?.status}` };
      const p = await posting.postEntry(tid, e.id, t.uid('k'));
      return { status: p.success ? 'DEFECT' : 'PASS', numbers: `post.success=${p.success} status=${p.error?.status ?? 'n/a'}` };
    });

    await item('A5', 'same idempotency key twice → one journal entry', async () => {
      const e = mkEntry('A5', '2026-10-06', [['1101', 5, 0], ['4101', 0, 5]]);
      const key = t.uid('k-idem');
      const r1 = await posting.draftEntry(tid, e, key);
      const r2 = await posting.draftEntry(tid, e, key);
      const n = Number((await t.sql('SELECT COUNT(*)::int AS n FROM an_journal_entries WHERE tenant_id=$1 AND id=$2', [tid, e.id])).rows[0].n);
      return { status: n === 1 && r1.success ? 'PASS' : 'DEFECT', numbers: `call1=${r1.success} call2=${r2.success} entries=${n}` };
    });

    // ============================== INVENTORY ==============================
    const S1 = await makeItem(t, { code: 'S1' });
    await item('S1', 'weighted average: 100@10 + 100@20, issue 50', async () => {
      const a = await recv(W1.id, [{ itemId: S1.id, quantity: 100, unitCost: 10 }]);
      const b = await recv(W1.id, [{ itemId: S1.id, quantity: 100, unitCost: 20 }]);
      const mid = await stockRow(W1.id, S1.id);
      const i = await issue(W1.id, [{ itemId: S1.id, quantity: 50 }]);
      const end = await stockRow(W1.id, S1.id);
      const cost = Number((i.data as any)?.totalCost);
      const ok = a.success && b.success && i.success && close(mid.qty, 200) && close(mid.avg, 15) && close(mid.val, 3000) && close(cost, 750) && close(end.qty, 150) && close(end.val, 2250);
      return { status: ok ? 'PASS' : 'DEFECT', numbers: `afterReceipts qty=${num(mid.qty)} avg=${num(mid.avg)} value=${num(mid.val)}; issueCost=${num(cost)}; end qty=${num(end.qty)} value=${num(end.val)}` };
    });

    await item('S3', 'issue more than available is rejected and records no movement', async () => {
      const it = await makeItem(t, { code: 'S3' });
      await recv(W1.id, [{ itemId: it.id, quantity: 10, unitCost: 5 }]);
      const before = await movCount();
      const r = await issue(W1.id, [{ itemId: it.id, quantity: 11 }]);
      const after = await movCount();
      const typ = r.error?.type?.split('/').pop();
      return { status: !r.success && typ === 'insufficient-stock' && before === after ? 'PASS' : 'DEFECT', numbers: `success=${r.success} error=${typ ?? 'n/a'} movements before=${before} after=${after}` };
    });

    await item('S4', 'concurrent issues 7 and 6 against balance 10 (5 runs)', async () => {
      let defectRuns = 0; const detail: string[] = [];
      for (let i = 0; i < 5; i++) {
        const it = await makeItem(t, { code: `S4-${i}` });
        await recv(W1.id, [{ itemId: it.id, quantity: 10, unitCost: 1 }]);
        const [a, b] = await Promise.all([issue(W1.id, [{ itemId: it.id, quantity: 7 }]), issue(W1.id, [{ itemId: it.id, quantity: 6 }])]);
        const s = await stockRow(W1.id, it.id);
        const wins = Number(a.success) + Number(b.success);
        const bad = wins !== 1 || s.qty < 0;
        if (bad) defectRuns++;
        detail.push(`run${i + 1}:wins=${wins},final=${num(s.qty)}`);
      }
      return { status: defectRuns === 0 ? 'PASS' : 'DEFECT', numbers: `defectRuns=${defectRuns}/5 ${detail.join(' ')}` };
    });

    await item('S5', 'same idempotency key on parallel receiveStock → one document, one movement', async () => {
      const it = await makeItem(t, { code: 'S5' });
      const key = t.uid('k-par');
      const [a, b] = await Promise.all([recv(W1.id, [{ itemId: it.id, quantity: 100, unitCost: 5 }], key), recv(W1.id, [{ itemId: it.id, quantity: 100, unitCost: 5 }], key)]);
      const docs = Number((await t.sql('SELECT COUNT(*)::int AS n FROM an_stock_documents WHERE tenant_id=$1 AND idempotency_key=$2', [tid, key])).rows[0].n);
      const mv = await movCount(`AND item_id = '${it.id}'`);
      const s = await stockRow(W1.id, it.id);
      return { status: docs === 1 && mv === 1 ? 'PASS' : 'DEFECT', numbers: `call1=${a.success} call2=${b.success} documents=${docs} movements=${mv} finalQty=${num(s.qty)}` };
    });

    await item('S6', 'two-line receipt with a non-existent item is rejected before any movement', async () => {
      const it = await makeItem(t, { code: 'S6' });
      const before = await movCount();
      const r = await recv(W1.id, [{ itemId: it.id, quantity: 5, unitCost: 1 }, { itemId: 'NO-SUCH-ITEM', quantity: 5, unitCost: 1 }]);
      const after = await movCount();
      return { status: !r.success && before === after ? 'PASS' : 'DEFECT', numbers: `success=${r.success} status=${r.error?.status ?? 'n/a'} movements before=${before} after=${after}` };
    });

    await item('S7', 'static: receiveStock/issueStock must not report success when the document save fails', async () => {
      const src: string = fs.readFileSync(path.resolve('src/core/inventory/InventoryService.ts'), 'utf8');
      const hits = src.split('\n').map((l: string, i: number) => ({ l, n: i + 1 })).filter((x: { l: string; n: number }) => x.l.includes('finalDoc = (saveRes.success && saveRes.data) ? saveRes.data : stockDoc'));
      return { status: hits.length > 0 ? 'DEFECT' : 'PASS', numbers: `pattern occurrences=${hits.length}${hits.length ? ' at lines ' + hits.map((h: { n: number }) => h.n).join(',') : ''}` };
    });

    await item('S8', 'transfer 30 W1→W2: source -30, target +30, total qty/value preserved', async () => {
      const it = await makeItem(t, { code: 'S8' });
      await recv(W1.id, [{ itemId: it.id, quantity: 100, unitCost: 10 }]);
      const before = await stockRow(W1.id, it.id);
      const tr = await inventory.createTransfer(tid, { sourceWarehouseId: W1.id, targetWarehouseId: W2.id, lines: [{ itemId: it.id, quantity: 30 }], requestedBy: 'int-requester', requestedByName: 'Integrity', idempotencyKey: t.uid('k-tr') });
      if (!tr.success || !tr.data) return { status: 'NOT RUN', numbers: 'createTransfer failed: ' + JSON.stringify(tr.error) };
      const rc = await inventory.receiveTransfer(tid, tr.data.id, 'int-receiver', 'Integrity', t.uid('k-trr'));
      const s = await stockRow(W1.id, it.id), d = await stockRow(W2.id, it.id);
      const ok = rc.success && close(s.qty, before.qty - 30) && close(d.qty, 30) && close(s.qty + d.qty, before.qty) && close(s.val + d.val, before.val);
      return { status: ok ? 'PASS' : 'DEFECT', numbers: `receive.success=${rc.success} source=${num(s.qty)}/${num(s.val)} target=${num(d.qty)}/${num(d.val)} totalQty=${num(s.qty + d.qty)} totalValue=${num(s.val + d.val)} (before ${num(before.qty)}/${num(before.val)})` };
    });

    await item('S9', 'stock return restores qty/value and produces a balanced journal entry', async () => {
      const it = await makeItem(t, { code: 'S9' });
      const rc = await recv(W1.id, [{ itemId: it.id, quantity: 20, unitCost: 10 }]);
      if (!rc.success || !rc.data) return { status: 'NOT RUN', numbers: 'receipt failed: ' + JSON.stringify(rc.error) };
      const rt = await inventory.returnStock(tid, { originalDocumentId: rc.data.id, returnType: 'RETURN_ISSUE', reason: 'integrity S9', lines: [{ itemId: it.id, quantity: 5 }], performedBy: ACTOR, performedByName: 'Integrity', idempotencyKey: t.uid('k-ret') });
      if (!rt.success || !rt.data) return { status: 'DEFECT', numbers: 'returnStock failed: ' + JSON.stringify(rt.error) };
      const s = await stockRow(W1.id, it.id);
      const je = (await t.sql(`SELECT DISTINCT journal_entry_id FROM an_stock_movements WHERE tenant_id=$1 AND source_document_id=$2 AND journal_entry_id IS NOT NULL`, [tid, rt.data.id])).rows[0]?.journal_entry_id;
      let jeText = 'journalEntry=none';
      let jeOk = false;
      if (je) {
        const sums = (await t.sql('SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS c FROM an_journal_lines WHERE tenant_id=$1 AND entry_id=$2', [tid, je])).rows[0];
        jeOk = close(Number(sums.d), Number(sums.c), 0.0001);
        jeText = `journalEntry=yes debit=${num(sums.d)} credit=${num(sums.c)}`;
      }
      const ok = close(s.qty, 15) && close(s.val, 150) && jeOk;
      return { status: ok ? 'PASS' : 'DEFECT', numbers: `qty=${num(s.qty)} value=${num(s.val)} ${jeText}` };
    });

    await item('S2', 'balance invariant: qty = ±movements and |value − qty×avg| ≤ 0.01 for every (warehouse,item)', async () => {
      const r = await t.sql(
        `SELECT ws.warehouse_id, ws.item_id, ws.current_qty, ws.average_cost, ws.total_value,
                COALESCE((SELECT SUM(CASE WHEN m.movement_type IN ('RECEIPT','TRANSFER_IN','COUNT_ADJUSTMENT_GAIN') THEN ABS(m.quantity) ELSE -ABS(m.quantity) END)
                            FROM an_stock_movements m
                           WHERE m.tenant_id = ws.tenant_id AND m.warehouse_id = ws.warehouse_id AND m.item_id = ws.item_id), 0) AS mv_qty
           FROM an_warehouse_stock ws WHERE ws.tenant_id = $1`, [tid]);
      let qtyBad = 0, valBad = 0;
      for (const x of r.rows) {
        if (!close(Number(x.current_qty), Number(x.mv_qty), 0.0001)) qtyBad++;
        if (Math.abs(Number(x.total_value) - Number(x.current_qty) * Number(x.average_cost)) > 0.01) valBad++;
      }
      return { status: qtyBad === 0 && valBad === 0 ? 'PASS' : 'DEFECT', numbers: `pairs=${r.rows.length} qtyMismatch=${qtyBad} valueMismatch=${valBad}` };
    });

    // ============================== RECONCILIATION & APPROVALS ==============================
    await item('R1', 'INFO: inventory value vs GL 1105 (difference recorded, not a defect)', async () => {
      const v = Number((await t.sql('SELECT COALESCE(SUM(total_value),0) AS v FROM an_warehouse_stock WHERE tenant_id=$1', [tid])).rows[0].v);
      const gl = await bal('1105');
      return { status: 'PASS', numbers: `INFO stockValue=${num(v)} gl1105=${num(gl)} difference=${num(v - gl)}` };
    });

    await item('R2', 'approving a stock count with a shortage posts its journal entry on the default chart', async () => {
      const it = await makeItem(t, { code: 'R2' });
      await recv(W1.id, [{ itemId: it.id, quantity: 10, unitCost: 10 }]);
      const sc = await inventory.createStockCount(tid, { countType: 'PERIODIC', warehouseId: W1.id, lines: [{ itemId: it.id, countedQty: 7 }], performedBy: 'int-counter', performedByName: 'Integrity', idempotencyKey: t.uid('k-sc') });
      if (!sc.success || !sc.data) return { status: 'NOT RUN', numbers: 'createStockCount failed: ' + JSON.stringify(sc.error) };
      const ap = await inventory.approveAndPostStockCount(tid, { countId: sc.data.id, approvedBy: 'int-approver', approvedByName: 'Integrity', idempotencyKey: t.uid('k-sca') });
      if (ap.success) return { status: 'PASS', numbers: `approve.success=true status=${(ap.data as any)?.status ?? 'n/a'}` };
      return { status: 'DEFECT', numbers: `approve.success=false http=${ap.error?.status} type=${ap.error?.type?.split('/').pop()} detail="${String(ap.error?.detail).slice(0, 200)}"` };
    });

    await item('AP1', 'two-step approval: one approveStep must not complete the whole request', async () => {
      const id = t.uid('APR');
      const created = await t.storage.createApprovalRequest(tid, {
        id, tenantId: tid, documentType: 'INTEGRITY', documentId: t.uid('DOC'), documentCode: 'INT-DOC', initiatorId: 'int-creator',
        currentStep: 1, status: 'PENDING', createdAt: new Date().toISOString(),
        steps: [{ stepNumber: 1, roleRequired: 'accountant', status: 'PENDING' }, { stepNumber: 2, roleRequired: 'financial_approver', status: 'PENDING' }],
      }, t.uid('k-apr'));
      if (!created.success) return { status: 'NOT RUN', numbers: 'createApprovalRequest failed: ' + JSON.stringify(created.error) };
      const ap = await t.storage.approveStep(tid, id, 'int-approver', t.uid('k-aps'));
      const row = (await t.sql('SELECT status, steps FROM an_approval_requests WHERE tenant_id=$1 AND id=$2', [tid, id])).rows[0];
      const steps: any[] = typeof row?.steps === 'string' ? JSON.parse(row.steps) : (row?.steps || []);
      const stepStatuses = steps.map(s => s.status).join(',');
      const defect = row?.status === 'APPROVED' && steps.some(s => s.status === 'PENDING');
      return { status: defect ? 'DEFECT' : 'PASS', numbers: `approveStep.success=${ap.success} requestStatus=${row?.status} steps=[${stepStatuses}]` };
    });

    // ============================== INPUT VALIDATION ==============================
    await item('V1', 'receiveStock/issueStock reject NaN, "abc", -999999999, Infinity, 1e30 and bad costs', async () => {
      const vw = await makeWarehouse(t, 'V1W');
      const it = await makeItem(t, { code: 'V1' });
      await recv(vw.id, [{ itemId: it.id, quantity: 100, unitCost: 10 }]);
      const accepted: string[] = [];
      const qtys = [NaN, 'abc', -999999999, Infinity, 1e30];
      for (const q of qtys) {
        const r = await recv(vw.id, [{ itemId: it.id, quantity: q, unitCost: 1 }]);
        if (r.success) accepted.push(`receive.quantity=${BAD(q)}`);
        const i = await issue(vw.id, [{ itemId: it.id, quantity: q }]);
        if (i.success) accepted.push(`issue.quantity=${BAD(q)}`);
      }
      for (const c of [-5, 'hello']) {
        const r = await recv(vw.id, [{ itemId: it.id, quantity: 1, unitCost: c }]);
        if (r.success) accepted.push(`receive.unitCost=${BAD(c)}`);
      }
      return { status: accepted.length === 0 ? 'PASS' : 'DEFECT', numbers: accepted.length ? `accepted: ${accepted.join('; ')}` : 'all 12 invalid inputs rejected' };
    });

    await item('V2', 'HTTP: invalid quantities / cost / date are rejected (PORT=3101)', async () => {
      if (process.env.INTEGRITY_ALLOW_MAIN_WRITES !== '1') return { status: 'NOT RUN', numbers: 'writes to tenant MAIN if the server accepts a value; set INTEGRITY_ALLOW_MAIN_WRITES=1 on a dev/throw-away database to run it' };
      const pw = process.env.SEED_ADMIN_PASSWORD;
      if (!pw) return { status: 'NOT RUN', numbers: 'SEED_ADMIN_PASSWORD missing' };
      const PORT = 3101; const BASE = `http://127.0.0.1:${PORT}`;
      const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
      const srv: ChildProcess = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'], detached: true, shell: process.platform === 'win32' });
      srv.stdout?.on('data', () => {}); srv.stderr?.on('data', () => {});
      try {
        let up = false;
        for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(`${BASE}/api/health`)).status === 200; } catch { /* not up */ } if (!up) await sleep(1000); }
        if (!up) return { status: 'NOT RUN', numbers: 'server did not start' };
        const lg = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-code': 'MAIN' }, body: JSON.stringify({ tenantCode: 'MAIN', username: 'admin', password: pw }) });
        const token = accessTokenFromResponse(lg);
        if (lg.status !== 200 || !token) return { status: 'NOT RUN', numbers: `admin login failed (${lg.status})` };
        const pool: any = (t.storage as any).pool;
        const mc = await pool.connect();
        let w: string | undefined, i: string | undefined;
        try {
          await mc.query('BEGIN');
          await mc.query("SELECT set_config('app.current_tenant_id', $1, true)", ['tenant-main']);
          const mr = await mc.query(`SELECT (SELECT id FROM an_warehouses WHERE tenant_id = 'tenant-main' LIMIT 1) AS w, (SELECT id FROM an_stock_items WHERE tenant_id = 'tenant-main' LIMIT 1) AS i`);
          await mc.query('COMMIT');
          w = mr.rows[0]?.w; i = mr.rows[0]?.i;
        } catch { try { await mc.query('ROLLBACK'); } catch { /* ignore */ } } finally { mc.release(); }
        if (!w || !i) return { status: 'NOT RUN', numbers: 'no warehouse/item in tenant MAIN to target' };
        const post = async (p: string, body: any) => {
          const r = await fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-code': 'MAIN', Authorization: `Bearer ${token}`, 'Idempotency-Key': t.uid('v2') }, body: JSON.stringify(body) });
          return r.status;
        };
        const out: string[] = []; let accepted = 0;
        for (const q of [null, 'abc', -999999999, 1e30]) { // JSON cannot carry NaN/Infinity; null is what they serialize to
          const s = await post('/api/inventory/receive', { warehouseId: w, lines: [{ itemId: i, quantity: q, unitCost: 1 }] });
          out.push(`receive.quantity=${BAD(q)}→${s}`); if (s >= 200 && s < 300) accepted++;
        }
        for (const c of [-5, 'hello']) {
          const s = await post('/api/inventory/receive', { warehouseId: w, lines: [{ itemId: i, quantity: 1, unitCost: c }] });
          out.push(`receive.unitCost=${BAD(c)}→${s}`); if (s >= 200 && s < 300) accepted++;
        }
        const sd = await post('/api/accounting/journal-entries', { id: t.uid('V2JE'), code: t.uid('V2JE'), date: 'not-a-date', description: 'integrity V2', lines: [{ accountCode: '1101', debit: 1, credit: 0 }, { accountCode: '4101', debit: 0, credit: 1 }] });
        out.push(`journal.date="not-a-date"→${sd}`); if (sd >= 200 && sd < 300) accepted++;
        return { status: accepted === 0 ? 'PASS' : 'DEFECT', numbers: out.join(' ') };
      } finally {
        if (srv.pid) { try { process.kill(-srv.pid, 'SIGTERM'); } catch { try { srv.kill('SIGTERM'); } catch { /* ignore */ } } }
      }
    });
  } finally {
    await t.cleanup();
    if (t.residue.length) {
      const n = t.residue.reduce((s, r) => s + r.rows, 0);
      notes.push(`TEMP-TENANT-RESIDUE: ${tid} ${n} rows (${t.residue.map(r => `${r.table}:${r.rows}`).join(', ')})`);
      console.log(notes[notes.length - 1]);
    }
  }

  // ============================== REPORT ==============================
  rows.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const count = (s: Status) => rows.filter(r => r.status === s).length;
  const table = rows.map(r => `| ${r.id} | ${r.status} | ${r.desc.replace(/\|/g, '/')} | ${r.numbers.replace(/\|/g, '/').replace(/int-[0-9a-f]{8}/g, 'int-<tmp>')} |`).join('\n');
  const hash = crypto.createHash('sha256').update(rows.map(r => `${r.id}|${r.status}|${r.numbers.replace(/int-[0-9a-f]{8}/g, 'int-<tmp>').replace(/-[0-9a-f]{8}(-[0-9a-f]{8})?/g, '-<r>')}`).join('\n')).digest('hex').slice(0, 16);
  const defects = rows.filter(r => r.status === 'DEFECT');
  const md = [
    '# Integrity baseline report (Phase 8)',
    '',
    'Generated by `scripts/verifyIntegrity.ts` from an actual run. Measurement only: nothing was fixed.',
    '',
    `PASS=${count('PASS')} DEFECT=${count('DEFECT')} NOT RUN=${count('NOT RUN')}  |  RESULT-HASH=${hash}`,
    '',
    '| id | result | description | actual numbers |',
    '|---|---|---|---|',
    table,
    '',
    '## FOLLOW-UP (DEFECT)',
    defects.length ? defects.map(d => `- **${d.id}** — ${d.desc} :: ${d.numbers}`).join('\n') : '- none',
    '',
    ...(notes.length ? ['## Notes', ...notes.map(n => `- ${n}`), ''] : []),
  ].join('\n');
  fs.mkdirSync('evidence/integrity', { recursive: true });
  fs.writeFileSync('evidence/integrity/baseline-report.md', md, 'utf8');

  console.log(`\nSUMMARY: PASS=${count('PASS')} DEFECT=${count('DEFECT')} NOT RUN=${count('NOT RUN')}`);
  console.log(`RESULT-HASH: ${hash}`);
  console.log('report: evidence/integrity/baseline-report.md');
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e?.message); process.exit(1); });
