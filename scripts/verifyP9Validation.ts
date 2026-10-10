/**
 * @file scripts/verifyP9Validation.ts
 * @description Phase 9 (VAL-001) — input validation for inventory and journal entries.
 *
 * (أ) unit tests of src/core/utils/validation.ts          — pure, always runs
 * (ب) receiveStock / issueStock with invalid values         — rejected 400 and SQL counts unchanged  (needs DATABASE_URL)
 * (ج) valid values accepted and stored exactly              — 0.5, '12.25', unitCost 0               (needs DATABASE_URL)
 * (هـ) saveStockItem valuationMethod FOO rejected / valid ok (needs DATABASE_URL)
 * (د) HTTP on PORT=3101: receive -999999999, date not-a-date, debit+credit together, valid entry
 *      Writes to the real tenant MAIN when a value is wrongly accepted (and for the valid entry), so it is NOT RUN
 *      unless P9_ALLOW_MAIN_WRITES=1 (dev / throw-away database) and SEED_ADMIN_PASSWORD is set.
 *
 * (ب)(ج)(هـ) run on one throw-away tenant `int-<rand>` (scripts/lib/testTenant.ts) that is removed in `finally`.
 * Secrets are never printed. Run:  npx tsx scripts/verifyP9Validation.ts
 * Exit code: 1 if any check FAILED, otherwise 0. A `NOT RUN` is NOT a pass — read the summary line.
 */
import dotenv from 'dotenv';
dotenv.config();
import { spawn, ChildProcess } from 'node:child_process';
import {
  parsePositiveQuantity, parseNonNegativeQuantity, parseNonNegativeMoney, parseIsoDate,
  parseBoundedString, parseEnum, validationError, validateJournalInput,
} from '../src/core/utils/validation';
import { accessTokenFromResponse } from './lib/httpAuth';

let pass = 0, fail = 0, notRun = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ' | ' + detail : ''}`); }
  else { fail++; console.error(`[FAIL] ${name}${detail ? ' | ' + detail : ''}`); }
};
const skip = (name: string, why: string) => { notRun++; console.log(`[NOT RUN] ${name} | ${why}`); };
const show = (v: unknown) => (typeof v === 'string' ? JSON.stringify(v) : Object.is(v, -0) ? '-0' : String(v));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ============================== (أ) unit tests ==============================
function unitTests() {
  const BAD_NUM: unknown[] = [NaN, Infinity, -Infinity, 'abc', '', null, undefined, -1, 0, 1e30, 0.00001, '1e3', ' 5', '5 ', '1,000', '-1', '+1', {}, [], true];
  for (const v of BAD_NUM) check(`(أ) parsePositiveQuantity rejects ${show(v)}`, !parsePositiveQuantity(v, 'q').ok);
  const GOOD_QTY: Array<[unknown, number]> = [[0.5, 0.5], ['12.25', 12.25], [1234.5678, 1234.5678], [1, 1], ['3', 3], [1_000_000_000, 1_000_000_000]];
  for (const [v, exp] of GOOD_QTY) {
    const r = parsePositiveQuantity(v, 'q');
    check(`(أ) parsePositiveQuantity accepts ${show(v)}`, r.ok && r.value === exp, r.ok ? `value=${r.value}` : r.detail);
  }
  check('(أ) parsePositiveQuantity rejects 1_000_000_001', !parsePositiveQuantity(1_000_000_001, 'q').ok);
  check('(أ) parsePositiveQuantity rejects 5 decimals (1.12345)', !parsePositiveQuantity(1.12345, 'q').ok);
  const dq = parsePositiveQuantity('abc', 'الكمية (quantity)');
  check('(أ) failure detail is Arabic and names the field', !dq.ok && dq.detail.includes('الكمية (quantity)') && /[\u0600-\u06FF]/.test(dq.detail), dq.ok ? '' : dq.detail);

  check('(أ) parseNonNegativeQuantity accepts 0', parseNonNegativeQuantity(0, 'c').ok);
  check('(أ) parseNonNegativeQuantity rejects -1', !parseNonNegativeQuantity(-1, 'c').ok);
  check('(أ) parseNonNegativeQuantity rejects NaN', !parseNonNegativeQuantity(NaN, 'c').ok);

  for (const v of [NaN, Infinity, 'abc', '', null, undefined, -1, -0.0001, 1e30, 1_000_000_000_001, '1e3', 0.00001, {}]) {
    check(`(أ) parseNonNegativeMoney rejects ${show(v)}`, !parseNonNegativeMoney(v, 'm').ok);
  }
  for (const [v, exp] of [[0, 0], ['0', 0], [12.5, 12.5], ['1234.5678', 1234.5678], [1_000_000_000_000, 1_000_000_000_000]] as Array<[unknown, number]>) {
    const r = parseNonNegativeMoney(v, 'm');
    check(`(أ) parseNonNegativeMoney accepts ${show(v)}`, r.ok && r.value === exp, r.ok ? `value=${r.value}` : r.detail);
  }

  for (const v of ['2026-02-31', '2026-13-01', '2026-00-10', 'not-a-date', '', null, undefined, 20260101, '1999-12-31', '2101-01-01', '2026-1-1', '2026-02-30T10:00:00Z', '2026-01-01T25:00:00Z']) {
    check(`(أ) parseIsoDate rejects ${show(v)}`, !parseIsoDate(v, 'd').ok);
  }
  for (const v of ['2026-10-10', '2000-01-01', '2100-12-31', '2024-02-29', '2026-10-10T12:30:00Z', '2026-10-10T12:30:00.123+03:00']) {
    check(`(أ) parseIsoDate accepts ${show(v)}`, parseIsoDate(v, 'd').ok);
  }
  check('(أ) parseIsoDate rejects 2025-02-29 (not a leap year)', !parseIsoDate('2025-02-29', 'd').ok);

  check('(أ) parseBoundedString trims', (() => { const r = parseBoundedString('  ab  ', 's', { max: 10 }); return r.ok && r.value === 'ab'; })());
  check('(أ) parseBoundedString rejects control char', !parseBoundedString('a\u0001b', 's', { max: 10 }).ok);
  check('(أ) parseBoundedString rejects NUL', !parseBoundedString('a\u0000b', 's', { max: 10 }).ok);
  check('(أ) parseBoundedString rejects too long', !parseBoundedString('x'.repeat(65), 's', { max: 64 }).ok);
  check('(أ) parseBoundedString accepts exactly max', parseBoundedString('x'.repeat(64), 's', { max: 64 }).ok);
  check('(أ) parseBoundedString rejects empty when min=1', !parseBoundedString('   ', 's', { min: 1, max: 5 }).ok);
  check('(أ) parseBoundedString rejects non-string', !parseBoundedString(123, 's', { max: 5 }).ok);

  const E = ['WEIGHTED_AVERAGE', 'FIFO'] as const;
  check('(أ) parseEnum accepts a listed value', parseEnum('FIFO', 'v', E).ok);
  for (const v of ['FOO', '', null, undefined, 1, 'fifo']) check(`(أ) parseEnum rejects ${show(v)}`, !parseEnum(v, 'v', E).ok);

  const ve = validationError('x');
  check('(أ) validationError is RFC7807 400', ve.status === 400 && ve.type === 'https://api.an-erp.local/errors/validation-failed' && ve.title === 'بيانات غير صالحة' && ve.detail === 'x');

  const J = (date: unknown, lines: unknown) => validateJournalInput(date, lines);
  const L = (debit: unknown, credit: unknown) => ({ accountCode: '1101', debit, credit });
  check('(أ) validateJournalInput accepts a valid entry', J('2026-10-10', [L(10, 0), L(0, 10)]).ok);
  check('(أ) validateJournalInput accepts a missing date', J(undefined, [L(10, 0), L(0, 10)]).ok);
  check('(أ) validateJournalInput rejects date not-a-date', !J('not-a-date', [L(10, 0), L(0, 10)]).ok);
  check('(أ) validateJournalInput rejects debit+credit on one line', !J('2026-10-10', [L(10, 10)]).ok);
  check('(أ) validateJournalInput rejects negative debit', !J('2026-10-10', [L(-5, 0)]).ok);
  check('(أ) validateJournalInput rejects debit "abc"', !J('2026-10-10', [L('abc', 0)]).ok);
  check('(أ) validateJournalInput rejects debit Infinity', !J('2026-10-10', [L(Infinity, 0)]).ok);
  check('(أ) validateJournalInput rejects empty / non-array lines', !J('2026-10-10', []).ok && !J('2026-10-10', 'x').ok && !J('2026-10-10', undefined).ok);
  check('(أ) validateJournalInput rejects a null line', !J('2026-10-10', [null]).ok);
}

// ============================== DB part (ب)(ج)(هـ) ==============================
async function dbTests() {
  if (!process.env.DATABASE_URL) {
    for (const n of ['(ب) receiveStock/issueStock invalid values', '(ج) valid values stored', '(هـ) saveStockItem valuationMethod']) skip(n, 'DATABASE_URL missing');
    return;
  }
  const { createTempTenant, makeWarehouse, makeItem } = await import('./lib/testTenant');
  const t = await createTempTenant({ seedChart: true });
  const { inventory } = t.services;
  const tid = t.tenantId;
  const ACTOR = 'p9-actor';
  try {
    const W = await makeWarehouse(t, 'P9W');
    const it = await makeItem(t, { code: 'P9-ITEM' });
    const counts = async () => {
      const q = async (tbl: string) => Number((await t.sql(`SELECT COUNT(*)::int AS n FROM ${tbl} WHERE tenant_id=$1`, [tid])).rows[0].n);
      return { mov: await q('an_stock_movements'), docs: await q('an_stock_documents') };
    };
    const recv = (lines: any[], extra: any = {}) =>
      inventory.receiveStock(tid, { header: { warehouseId: W.id, performedBy: ACTOR, performedByName: 'P9', idempotencyKey: t.uid('k-rcv'), ...extra }, lines } as any);
    const issue = (lines: any[]) =>
      inventory.issueStock(tid, { header: { warehouseId: W.id, performedBy: ACTOR, performedByName: 'P9', idempotencyKey: t.uid('k-iss') }, lines } as any);

    // seed stock so that an accepted bad issue would be visible
    const seed = await recv([{ itemId: it.id, quantity: 100, unitCost: 10 }]);
    check('(ب) seed receipt succeeds', seed.success, seed.success ? '' : JSON.stringify(seed.error));

    const rejected = async (name: string, fn: () => Promise<any>) => {
      const before = await counts();
      const r = await fn();
      const after = await counts();
      const ok = r.success === false && r.error?.status === 400 && before.mov === after.mov && before.docs === after.docs;
      check(name, ok, `success=${r.success} status=${r.error?.status ?? 'n/a'} movements ${before.mov}→${after.mov} documents ${before.docs}→${after.docs}`);
    };
    for (const q of [NaN, 'abc', -999999999, Infinity, 1e30, 0, '', null, '1e3', 0.00001]) {
      await rejected(`(ب) receiveStock quantity=${show(q)}`, () => recv([{ itemId: it.id, quantity: q, unitCost: 1 }]));
      await rejected(`(ب) issueStock quantity=${show(q)}`, () => issue([{ itemId: it.id, quantity: q }]));
    }
    for (const c of [-5, 'hello', NaN, Infinity, 1e30, '1e3']) {
      await rejected(`(ب) receiveStock unitCost=${show(c)}`, () => recv([{ itemId: it.id, quantity: 1, unitCost: c }]));
    }
    await rejected('(ب) receiveStock expiryDate=2026-02-31', () => recv([{ itemId: it.id, quantity: 1, unitCost: 1, expiryDate: '2026-02-31' }]));
    await rejected('(ب) receiveStock batchNumber 65 chars', () => recv([{ itemId: it.id, quantity: 1, unitCost: 1, batchNumber: 'b'.repeat(65) }]));
    await rejected('(ب) receiveStock serialNumber 129 chars', () => recv([{ itemId: it.id, quantity: 1, unitCost: 1, serialNumber: 's'.repeat(129) }]));
    await rejected('(ب) receiveStock notes 2001 chars', () => recv([{ itemId: it.id, quantity: 1, unitCost: 1, notes: 'n'.repeat(2001) }]));
    await rejected('(ب) receiveStock notes with control char', () => recv([{ itemId: it.id, quantity: 1, unitCost: 1, notes: 'a\u0001b' }]));
    await rejected('(ب) receiveStock: second line invalid → nothing saved', () => recv([{ itemId: it.id, quantity: 1, unitCost: 1 }, { itemId: it.id, quantity: 'abc', unitCost: 1 }]));
    await rejected('(ب) issueStock: second line invalid → nothing saved', () => issue([{ itemId: it.id, quantity: 1 }, { itemId: it.id, quantity: NaN }]));

    // transfer / count lines
    const W2 = await makeWarehouse(t, 'P9W2');
    const beforeTr = Number((await t.sql('SELECT COUNT(*)::int AS n FROM an_stock_transfers WHERE tenant_id=$1', [tid])).rows[0].n);
    const tr = await inventory.createTransfer(tid, { sourceWarehouseId: W.id, targetWarehouseId: W2.id, lines: [{ itemId: it.id, quantity: 'abc' as any }], requestedBy: ACTOR, requestedByName: 'P9', idempotencyKey: t.uid('k-tr') });
    const afterTr = Number((await t.sql('SELECT COUNT(*)::int AS n FROM an_stock_transfers WHERE tenant_id=$1', [tid])).rows[0].n);
    check('(ب) createTransfer quantity="abc" rejected 400, no transfer row', !tr.success && tr.error?.status === 400 && beforeTr === afterTr, `status=${tr.error?.status ?? 'n/a'} transfers ${beforeTr}→${afterTr}`);
    const sc = await inventory.createStockCount(tid, { countType: 'PERIODIC', warehouseId: W.id, lines: [{ itemId: it.id, countedQty: -3 }], performedBy: ACTOR, performedByName: 'P9', idempotencyKey: t.uid('k-sc') } as any);
    check('(ب) createStockCount countedQty=-3 rejected 400', !sc.success && sc.error?.status === 400, `status=${sc.error?.status ?? 'n/a'}`);

    // (ج) valid values
    const stockQty = async (itemId: string) => Number((await t.sql('SELECT current_qty FROM an_warehouse_stock WHERE tenant_id=$1 AND warehouse_id=$2 AND item_id=$3', [tid, W.id, itemId])).rows[0]?.current_qty ?? 0);
    const itV = await makeItem(t, { code: 'P9-VALID' });
    const r1 = await recv([{ itemId: itV.id, quantity: 0.5, unitCost: 0 }]);
    check('(ج) receive quantity 0.5 / unitCost 0 accepted', r1.success, r1.success ? '' : JSON.stringify(r1.error));
    check('(ج) stored qty = 0.5', Math.abs((await stockQty(itV.id)) - 0.5) < 1e-9, `qty=${await stockQty(itV.id)}`);
    const r2 = await recv([{ itemId: itV.id, quantity: '12.25', unitCost: '3.5' }]);
    check('(ج) receive quantity "12.25" (numeric text) accepted', r2.success, r2.success ? '' : JSON.stringify(r2.error));
    check('(ج) stored qty = 12.75 (text parsed to a number)', Math.abs((await stockQty(itV.id)) - 12.75) < 1e-9, `qty=${await stockQty(itV.id)}`);
    const r3 = await recv([{ itemId: itV.id, quantity: 1234.5678, unitCost: 1 }]);
    check('(ج) receive quantity 1234.5678 accepted', r3.success, r3.success ? '' : JSON.stringify(r3.error));
    check('(ج) stored qty = 1247.3178', Math.abs((await stockQty(itV.id)) - 1247.3178) < 1e-6, `qty=${await stockQty(itV.id)}`);
    const i1 = await issue([{ itemId: itV.id, quantity: '0.5' }]);
    check('(ج) issue quantity "0.5" accepted', i1.success, i1.success ? '' : JSON.stringify(i1.error));
    check('(ج) stored qty after issue = 1246.8178', Math.abs((await stockQty(itV.id)) - 1246.8178) < 1e-6, `qty=${await stockQty(itV.id)}`);
    const r4 = await recv([{ itemId: itV.id, quantity: 1, unitCost: 1, expiryDate: '2030-12-31', batchNumber: 'B-1', notes: 'ok' }]);
    check('(ج) valid expiryDate / batchNumber / notes accepted', r4.success, r4.success ? '' : JSON.stringify(r4.error));

    // (هـ) saveStockItem
    const base = { nameAr: 'صنف اختبار', category: 'INT', uom: 'PCS', inventoryAccountCode: '1105', cogsAccountCode: '5101', adjustmentExpenseAccountCode: '5101', adjustmentGainAccountCode: '4202', isActive: true };
    const bad = await inventory.saveStockItem(tid, { ...base, itemCode: 'P9-FOO', valuationMethod: 'FOO' as any }, t.uid('k-it'));
    check('(هـ) saveStockItem valuationMethod "FOO" rejected 400', !bad.success && bad.error?.status === 400, `status=${bad.error?.status ?? 'n/a'}`);
    const ok = await inventory.saveStockItem(tid, { ...base, itemCode: 'P9-FIFO', valuationMethod: 'FIFO' }, t.uid('k-it'));
    check('(هـ) saveStockItem valuationMethod "FIFO" accepted', ok.success, ok.success ? '' : JSON.stringify(ok.error));
    const badCost = await inventory.saveStockItem(tid, { ...base, itemCode: 'P9-NEG', valuationMethod: 'FIFO', standardCost: -5 }, t.uid('k-it'));
    check('(هـ) saveStockItem standardCost -5 rejected 400', !badCost.success && badCost.error?.status === 400, `status=${badCost.error?.status ?? 'n/a'}`);
    const badName = await inventory.saveStockItem(tid, { ...base, itemCode: 'x'.repeat(65), valuationMethod: 'FIFO' }, t.uid('k-it'));
    check('(هـ) saveStockItem itemCode 65 chars rejected 400', !badName.success && badName.error?.status === 400, `status=${badName.error?.status ?? 'n/a'}`);
    const noCode = await inventory.saveStockItem(tid, { ...base, itemCode: '   ', valuationMethod: 'FIFO' }, t.uid('k-it'));
    check('(هـ) saveStockItem blank itemCode rejected 400', !noCode.success && noCode.error?.status === 400, `status=${noCode.error?.status ?? 'n/a'}`);
  } finally {
    await t.cleanup();
    if (t.residue.length) console.log(`TEMP-TENANT-RESIDUE: ${tid} ${t.residue.reduce((s, r) => s + r.rows, 0)} rows (posted ledger rows are immutable; tenant is isolated)`);
  }
}

// ============================== (د) HTTP ==============================
async function httpTests() {
  const NAME = '(د) HTTP validation (receive, journal-entries, transactions/post)';
  if (process.env.P9_ALLOW_MAIN_WRITES !== '1') return skip(NAME, 'writes to tenant MAIN if a value is wrongly accepted (and for the valid entry); set P9_ALLOW_MAIN_WRITES=1 on a dev/throw-away database');
  const pw = process.env.SEED_ADMIN_PASSWORD;
  if (!pw || !process.env.DATABASE_URL) return skip(NAME, 'SEED_ADMIN_PASSWORD / DATABASE_URL missing');
  const PORT = 3101, BASE = `http://127.0.0.1:${PORT}`;
  const srv: ChildProcess = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'], detached: true, shell: process.platform === 'win32' });
  srv.stdout?.on('data', () => {}); srv.stderr?.on('data', () => {});
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(`${BASE}/api/health`)).status === 200; } catch { /* not up */ } if (!up) await sleep(1000); }
    if (!up) return skip(NAME, 'server did not start on 3101');
    const lg = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-code': 'MAIN' }, body: JSON.stringify({ tenantCode: 'MAIN', username: 'admin', password: pw }) });
    const token = accessTokenFromResponse(lg);
    if (lg.status !== 200 || !token) return skip(NAME, `admin login failed (${lg.status})`);

    const c = await pool.connect();
    let w: string | undefined, itemId: string | undefined, accts: string[] = [];
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.current_tenant_id', $1, true)", ['tenant-main']);
      const a = await c.query(`SELECT (SELECT id FROM an_warehouses WHERE tenant_id='tenant-main' LIMIT 1) AS w, (SELECT id FROM an_stock_items WHERE tenant_id='tenant-main' LIMIT 1) AS i`);
      w = a.rows[0]?.w; itemId = a.rows[0]?.i;
      accts = (await c.query(`SELECT code FROM an_chart_of_accounts WHERE tenant_id='tenant-main' AND code IN ('1101','4101') ORDER BY code`)).rows.map((r: any) => r.code);
      await c.query('COMMIT');
    } catch { try { await c.query('ROLLBACK'); } catch { /* ignore */ } } finally { c.release(); }
    if (!w || !itemId) return skip(NAME, 'no warehouse / item in tenant MAIN to target');

    const post = async (p: string, body: any) => {
      const r = await fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-code': 'MAIN', Authorization: `Bearer ${token}`, 'Idempotency-Key': `p9-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }, body: JSON.stringify(body) });
      let j: any = null; try { j = await r.json(); } catch { /* empty */ }
      return { status: r.status, body: j };
    };
    const isValidationRejection = (r: { status: number; body: any }) => r.status === 400 && String(r.body?.type || '').endsWith('/validation-failed');
    const jl = (debit: number, credit: number, code = '1101') => ({ accountCode: code, debit, credit, description: 'p9' });
    const jid = () => `P9-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const rc = await post('/api/inventory/receive', { warehouseId: w, lines: [{ itemId, quantity: -999999999, unitCost: 1 }] });
    check('(د) POST /api/inventory/receive quantity -999999999 ⇒ 400', rc.status === 400, `status=${rc.status}`);
    const rc2 = await post('/api/inventory/receive', { warehouseId: w, lines: [{ itemId, quantity: 'abc', unitCost: 1 }] });
    check('(د) POST /api/inventory/receive quantity "abc" ⇒ 400', rc2.status === 400, `status=${rc2.status}`);

    const id1 = jid();
    const d1 = await post('/api/accounting/journal-entries', { id: id1, code: id1, date: 'not-a-date', description: 'p9', lines: [jl(1, 0), jl(0, 1, '4101')] });
    check('(د) journal-entries date "not-a-date" ⇒ 400 validation-failed', isValidationRejection(d1), `status=${d1.status}`);
    const id2 = jid();
    const d2 = await post('/api/accounting/journal-entries', { id: id2, code: id2, date: '2026-10-10', description: 'p9', lines: [jl(5, 5), jl(0, 0, '4101')] });
    check('(د) journal-entries line with debit AND credit ⇒ 400 validation-failed', isValidationRejection(d2), `status=${d2.status}`);
    const id3 = jid();
    const d3 = await post('/api/accounting/journal-entries', { id: id3, code: id3, date: '2026-10-10', description: 'p9', lines: [jl(-5, 0), jl(0, 5, '4101')] });
    check('(د) journal-entries negative debit ⇒ 400 validation-failed', isValidationRejection(d3), `status=${d3.status}`);

    const t1 = await post('/api/transactions/post', { idempotencyKey: `p9-${jid()}`, entry: { id: jid(), date: 'not-a-date', type: 'P9', description: 'p9', lines: [jl(1, 0), jl(0, 1, '4101')] } });
    check('(د) transactions/post date "not-a-date" ⇒ 400 validation-failed', isValidationRejection(t1), `status=${t1.status}`);
    const t2 = await post('/api/transactions/post', { idempotencyKey: `p9-${jid()}`, entry: { id: jid(), date: '2026-10-10', type: 'P9', description: 'p9', lines: [jl(5, 5), jl(0, 0, '4101')] } });
    check('(د) transactions/post line with debit AND credit ⇒ 400 validation-failed', isValidationRejection(t2), `status=${t2.status}`);

    if (accts.length < 2) {
      skip('(د) valid journal entry unchanged', 'MAIN has no 1101/4101 accounts to post a valid entry');
    } else {
      const id4 = jid();
      const ok = await post('/api/accounting/journal-entries', { id: id4, code: id4, date: '2026-10-10', description: 'p9 valid', lines: [jl(1, 0), jl(0, 1, '4101')] });
      check('(د) valid journal entry is NOT rejected by validation', !isValidationRejection(ok), `status=${ok.status}${ok.status >= 400 ? ' type=' + String(ok.body?.type || '').split('/').pop() : ''}`);
    }
  } finally {
    try { await pool.end(); } catch { /* ignore */ }
    if (srv.pid) { try { process.kill(-srv.pid, 'SIGTERM'); } catch { try { srv.kill('SIGTERM'); } catch { /* ignore */ } } }
  }
}

async function main() {
  unitTests();
  await dbTests().catch(e => { fail++; console.error('[FAIL] DB section crashed |', String(e?.message || e).slice(0, 300)); });
  await httpTests().catch(e => { fail++; console.error('[FAIL] HTTP section crashed |', String(e?.message || e).slice(0, 300)); });
  console.log(`\nSUMMARY: PASS=${pass} FAIL=${fail} NOT_RUN=${notRun}`);
  if (notRun > 0) console.log('NOTE: NOT RUN items are not passes — run them in an environment that has what they need.');
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e?.message); process.exit(1); });
