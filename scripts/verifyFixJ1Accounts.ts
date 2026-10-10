/**
 * FIX-J1 — stock count / return journals use StockAccountingConfig + STANDARD_CHART codes.
 * Run: npx tsx scripts/verifyFixJ1Accounts.ts
 */
import fs from 'fs';
import { defaultStockAccountingConfig } from '../src/core/storage/StoragePort';
import { STANDARD_CHART_OF_ACCOUNTS } from '../src/core/accounting/defaultChartOfAccounts';
import { StockAccountingService } from '../src/core/inventory/StockAccountingService';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const coa = new Set(STANDARD_CHART_OF_ACCOUNTS.map((a) => a.code));
const cfg = defaultStockAccountingConfig('t1');

check('D1 default inventory is 1105 and in COA', cfg.defaultInventoryAccountCode === '1105' && coa.has('1105'));
check('D2 default COGS is 5101 and in COA', cfg.defaultCogsAccountCode === '5101' && coa.has('5101'));
check('D3 adjustment expense 5209 in COA', cfg.adjustmentExpenseAccountCode === '5209' && coa.has('5209'));
check('D4 adjustment gain 4203 in COA', cfg.adjustmentGainAccountCode === '4203' && coa.has('4203'));
check('D5 purchase return clearing 2101 in COA', cfg.purchaseReturnClearingAccountCode === '2101' && coa.has('2101'));
check('D6 GR/IR 2106 in COA', coa.has(cfg.grirAccountCode));

const inv = fs.readFileSync('src/core/inventory/InventoryService.ts', 'utf8');
const sas = fs.readFileSync('src/core/inventory/StockAccountingService.ts', 'utf8');
const sp = fs.readFileSync('src/core/storage/StoragePort.ts', 'utf8');

for (const code of ['520101', '110301', '410101', '210101', '510101']) {
  check(`S1 no hard-coded ${code} in InventoryService`, !inv.includes(`'${code}'`));
  check(`S2 no hard-coded ${code} in StockAccountingService`, !sas.includes(`'${code}'`));
}

check('S3 InventoryService loads getStockAccountingConfig for count', /getStockAccountingConfig\(tenantId\)/.test(inv));
check('S5 buildReturnEntry accepts cfg', /buildReturnEntry\(doc:\s*StockDocument,\s*cfg/.test(sas));
check('S6 postReturnJournal loads config before buildReturnEntry', /getStockAccountingConfig\(tenantId\)[\s\S]{0,250}buildReturnEntry\(doc,\s*cfg\)/.test(sas));
check('S7 StoragePort defaults include new fields', /adjustmentExpenseAccountCode:\s*'5209'/.test(sp) && /purchaseReturnClearingAccountCode:\s*'2101'/.test(sp));
check('S8 item create defaults use 1105/5101/5209/4203', /inventoryAccountCode: itemData\.inventoryAccountCode \|\| '1105'/.test(inv) && /'5209'/.test(inv) && /'4203'/.test(inv));
check('S9 ensureDefaultAccounts seeds adjustment accounts', /'5209'/.test(sas) && /'4203'/.test(sas));

const svc = new StockAccountingService({} as any, null as any);
const doc: any = {
  id: 'd1', tenantId: 't1', documentNumber: 'RET-1', referenceNumber: 'RCV-1',
  documentType: 'RETURN_RECEIPT', totalCost: 100, performedBy: 'u1',
};
const entry = svc.buildReturnEntry(doc, cfg);
check('B1 return entry uses clearing 2101 and inv 1105', !!entry && entry.lines.some((l: any) => l.accountCode === '2101') && entry.lines.some((l: any) => l.accountCode === '1105'));
const entry2 = svc.buildReturnEntry({ ...doc, documentType: 'RETURN_ISSUE' }, cfg);
check('B2 issue-return uses inv 1105 and cogs 5101', !!entry2 && entry2.lines.some((l: any) => l.accountCode === '1105') && entry2.lines.some((l: any) => l.accountCode === '5101'));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
