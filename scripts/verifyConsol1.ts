/**
 * @file verifyConsol1.ts
 * CONSOL-1 — consolidated trial balance merge.
 * Run: npx tsx scripts/verifyConsol1.ts
 */
import fs from 'fs';
import { mergeTrialBalances } from '../src/core/org/ConsolidationService';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const server = fs.readFileSync('server.ts', 'utf8');
const svc = fs.readFileSync('src/core/org/ConsolidationService.ts', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

const report = mergeTrialBalances({
  groupId: 'G1',
  asOfDate: '2026-10-18',
  memberTenantIds: ['T1', 'T2'],
  byTenant: {
    T1: [{ code: '1105', nameAr: 'مخزون', debitBalance: 100, creditBalance: 0, netBalance: 100 }],
    T2: [
      { code: '1105', nameAr: 'مخزون', debitBalance: 40, creditBalance: 0, netBalance: 40 },
      { code: '5101', nameAr: 'تكلفة', debitBalance: 10, creditBalance: 0, netBalance: 10 },
    ],
  },
  openXcompanyCount: 2,
});

check('S1 mergeTrialBalances exported', /export function mergeTrialBalances/.test(svc));
check('S2 merges same account code', report.lines.find((l) => l.accountCode === '1105')?.debitBalance === 140);
check('S3 keeps distinct codes', report.lines.some((l) => l.accountCode === '5101'));
check('S4 byTenant breakdown', report.lines.find((l) => l.accountCode === '1105')?.byTenant?.T1?.debitBalance === 100);
check('S5 totals debit', report.totals.debitBalance === 150);
check('S6 elimination notes mention open xcompany', report.eliminationNotes.some((n) => n.includes('2')));
check('S7 memberTenantIds preserved', report.memberTenantIds.length === 2);
check('S8 route platform', /app\.get\('\/api\/groups\/:id\/consol\/trial-balance',\s*requirePlatformAdmin/.test(server));
check('S9 route uses mergeTrialBalances', /consol\/trial-balance[\s\S]{0,1500}mergeTrialBalances/.test(server));
check('S10 route uses AccountingService getTrialBalance', /getTrialBalance\(tenantId/.test(server));
check('S11 ConsolidationService file exists', fs.existsSync('src/core/org/ConsolidationService.ts'));
check('S12 docs exist', fs.existsSync('docs/CONSOL_1.md'));
check('R1 CONSOL-1 DONE', byId['CONSOL-1']?.status === 'DONE');
check('R2 RPT-GROUP-1 remains DONE', byId['RPT-GROUP-1']?.status === 'DONE');

console.log(`
Passed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
