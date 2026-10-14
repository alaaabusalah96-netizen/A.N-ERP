/**
 * @file verifyPh8InvTab.ts
 * PH8-INV-TAB — supplier invoices tab wired in PurchasingWorkspaceView (static).
 * Run: npx tsx scripts/verifyPh8InvTab.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const ui = fs.readFileSync('src/components/PurchasingWorkspaceView.tsx', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('T1 TabId includes invoices', /type TabId = [^;]*'invoices'/.test(ui));
check('T2 invoices state', /useState.*invoices|setInvoices/.test(ui) && /const \[invoices, setInvoices\]/.test(ui));
check('T3 loadAll fetches /api/purchasing/invoices', /fetch\('\/api\/purchasing\/invoices'/.test(ui));
check('T4 setInvoices from response data', /setInvoices\(j\.data/.test(ui));
check('T5 tab label فواتير الموردين', /id:\s*'invoices'[\s\S]{0,80}فواتير الموردين/.test(ui) || /فواتير الموردين[\s\S]{0,80}id:\s*'invoices'/.test(ui) || /\{ id: 'invoices', label: 'فواتير الموردين'/.test(ui));
check('T6 invoices panel renders on activeTab', /activeTab === 'invoices'/.test(ui));
check('T7 empty state message', /لا توجد فواتير موردين/.test(ui));
check('T8 shows invoice number and status', /invoiceNumber/.test(ui) && /statusBadge\(inv\.status\)/.test(ui));
check('T9 Receipt icon imported', /Receipt/.test(ui) && /from 'lucide-react'/.test(ui));
check('T10 existing receipts tab still present', /activeTab === 'receipts'/.test(ui) && /إذونات الاستلام/.test(ui));
check('T11 requests\/orders tabs unchanged', /id: 'requests'/.test(ui) && /id: 'orders'/.test(ui));
check('T12 MATCH_PENDING badge color', /MATCH_PENDING:/.test(ui));
check('R1 package PH8-INV-TAB DONE', byId['PH8-INV-TAB']?.status === 'DONE');
check('R2 PH8-REMAINDER still OPEN', byId['PH8-REMAINDER']?.status === 'OPEN');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
