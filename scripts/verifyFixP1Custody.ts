/**
 * @file verifyFixP1Custody.ts
 * DEF-CUSTODY-REVERSAL-DOUBLE-REFUND: reverse restores custody balance exactly once.
 * Run: npx tsx scripts/verifyFixP1Custody.ts
 */
import fs from 'fs';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { CashCustodyService } from '../src/core/modules/custody/CashCustodyService';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function main() {
  const src = fs.readFileSync('src/core/modules/custody/CashCustodyService.ts', 'utf8');
  const im = fs.readFileSync('src/core/storage/adapters/InMemoryAdapter.ts', 'utf8');
  const pg = fs.readFileSync('src/core/storage/adapters/PostgresPrimaryAdapter.ts', 'utf8');
  check('S1 service does not credit balance before reverse', !/currentBalance:\s*custody\.currentBalance\s*\+\s*voucher\.totalAmount/.test(src));
  check('S2 service calls reverseCustodyExpenseVoucher', /reverseCustodyExpenseVoucher\(tenantId,\s*voucher\.id/.test(src));
  check('S3 InMemory reverse credits balance once', /custody\.currentBalance\s*\+=\s*voucher\.totalAmount/.test(im));
  check('S4 Postgres reverse credits balance once', /current_balance = current_balance \+/.test(pg));

  const st: any = new InMemoryAdapter();
  const pe = new PostingEngine(st);
  const ne = new NumberingEngine(st);
  const svc = new CashCustodyService(st, pe);
  const T = `cfix-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  for (const [code, type] of [['1101','ASSET'],['110202','ASSET'],['5101','EXPENSE']] as const) {
    await st.saveAccount(T, { code, tenantId: T, nameAr: code, type, isActive: true, debitBalance: 0, creditBalance: 0, balance: 0 } as any, `a-${code}`);
  }
  const custodyId = `cst-${T}`;
  const voucherId = `vch-${T}`;
  st.cashCustodies.set(`${T}:${custodyId}`, {
    id: custodyId, tenantId: T, companyId: T, custodianId: 'u1', custodianName: 'u1',
    allocatedAmount: 700, currentBalance: 400, status: 'ACTIVE', currency: 'SAR',
    createdAt: now, updatedAt: now, createdBy: 'admin',
  });
  st.custodyExpenseVouchers.set(`${T}:${voucherId}`, {
    id: voucherId, tenantId: T, custodyId, voucherNumber: 'CV-1', status: 'POSTED',
    totalAmount: 300,
    lines: [{ id: 'l1', expenseAccountCode: '5101', amount: 300, description: 'x' }],
    createdAt: now, createdBy: 'admin',
  });

  const rev = await svc.returnCustodyExpense(T, {
    voucherId, performedBy: 'admin', performedByName: 'admin', idempotencyKey: `idem-${T}`, reason: 'test',
  });
  const after = st.cashCustodies.get(`${T}:${custodyId}`)?.currentBalance;
  const stv = st.custodyExpenseVouchers.get(`${T}:${voucherId}`)?.status;
  check('R1 reverse ok', !!rev.success, String(rev.error?.detail || rev.error || ''));
  check('R2 status REVERSED', stv === 'REVERSED', `status=${stv}`);
  check('R3 balance 400+300=700 once', after === 700, `after=${after}`);
  check('R4 not 1000 (double)', after !== 1000);

  const rev2 = await svc.returnCustodyExpense(T, {
    voucherId, performedBy: 'admin', performedByName: 'admin', idempotencyKey: `idem2-${T}`, reason: 'again',
  });
  const after2 = st.cashCustodies.get(`${T}:${custodyId}`)?.currentBalance;
  check('R5 no second credit', after2 === 700, `after2=${after2} ok=${rev2.success}`);

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
