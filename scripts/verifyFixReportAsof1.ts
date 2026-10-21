/**
 * @file verifyFixReportAsof1.ts
 * FIX-REPORT-ASOF-1 — trial balance uses as-of posted journal balances.
 * Run: npx tsx scripts/verifyFixReportAsof1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean) => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}`); }
};

const acc = fs.readFileSync('src/core/accounting/AccountingService.ts', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));
const tb = (() => {
  const i = acc.indexOf('getTrialBalance');
  return acc.slice(i, i + 2200);
})();

check('S1 getTrialBalance calls getAccountBalanceAsOf', /getAccountBalanceAsOf/.test(tb));
check('S2 uses debitTotal from as-of result', /debitTotal/.test(tb));
check('S3 uses creditTotal from as-of result', /creditTotal/.test(tb));
check('S4 does not use acc.debitBalance for row amounts', !/debitBalance: acc\.debitBalance/.test(tb));
check('S5 does not use acc.creditBalance for row amounts', !/creditBalance: acc\.creditBalance/.test(tb));
check('S6 hard-coded company name removed', !/شركة أ\.ن للحلول المتقدمة/.test(tb));
check('S7 hard-coded fiscal year 2026 label removed', !/السنة المالية 2026/.test(tb));
check('S8 period label uses asOf date', /حتى تاريخ/.test(tb));
check('S9 getTenant for name/currency', /getTenant\(tenantId\)/.test(tb));
check('S10 package DONE', byId['FIX-REPORT-ASOF-1']?.status === 'DONE');
check('S11 lastChange mentions package', String(reg.lastChange || '').includes('FIX-REPORT-ASOF-1'));
check('S12 port still has getAccountBalanceAsOf', /getAccountBalanceAsOf/.test(fs.readFileSync('src/core/storage/StoragePort.ts', 'utf8')));
check('S13 PG adapter sums POSTED lines by date', /e\.status = 'POSTED'/.test(fs.readFileSync('src/core/storage/adapters/PostgresPrimaryAdapter.ts', 'utf8')) && /e\.date <=/.test(fs.readFileSync('src/core/storage/adapters/PostgresPrimaryAdapter.ts', 'utf8')));
check('S14 prior entity-close persist DONE', byId['PG-ENTITY-CLOSE-PERSIST-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
