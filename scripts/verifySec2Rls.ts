/**
 * SEC-2 — RLS coverage for purchasing tables + tenant GUC on write paths.
 * Static checks on PostgresPrimaryAdapter.ts (no DB required for core suite).
 * Run: npx tsx scripts/verifySec2Rls.ts
 */
import * as fs from 'node:fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const src = fs.readFileSync('src/core/storage/adapters/PostgresPrimaryAdapter.ts', 'utf8');

const REQUIRED = [
  'an_purchase_requests',
  'an_purchase_request_lines',
  'an_rfqs',
  'an_rfq_lines',
  'an_supplier_quotes',
  'an_supplier_quote_lines',
  'an_purchase_orders',
  'an_purchase_order_lines',
  'an_goods_receipts',
  'an_goods_receipt_lines',
  'an_supplier_invoices',
  'an_supplier_invoice_lines',
];

// Extract RLS array block
const arrM = src.match(/tables text\[\] := ARRAY\[([\s\S]*?)\]/);
const arrBody = arrM ? arrM[1] : '';
check('S1 RLS tables array exists', !!arrM);

for (const t of REQUIRED) {
  check(`S2 RLS array includes ${t}`, arrBody.includes(`'${t}'`));
}

// ENABLE/FORCE still applied via loop
check('S3 ENABLE ROW LEVEL SECURITY in loop', /ALTER TABLE %I ENABLE ROW LEVEL SECURITY/.test(src));
check('S4 FORCE ROW LEVEL SECURITY in loop', /ALTER TABLE %I FORCE ROW LEVEL SECURITY/.test(src));
check('S5 policy uses app.current_tenant_id', /current_setting\('app\.current_tenant_id'/.test(src));

// Write paths set GUC after BEGIN for purchasing saves
for (const name of ['savePurchaseRequest', 'saveRfq', 'saveSupplierQuote', 'saveSupplierInvoice', 'savePurchaseOrder', 'saveGoodsReceipt', 'completeGoodsReceiptAtomic']) {
  const i = src.indexOf(`async ${name}`);
  const chunk = i >= 0 ? src.slice(i, i + 900) : '';
  check(`S6 ${name} sets app.current_tenant_id after BEGIN`, /set_config\('app\.current_tenant_id'/.test(chunk), chunk.slice(0, 80));
}

// Read/list paths use withTenantScope
for (const name of ['getPurchaseRequest', 'listPurchaseRequests', 'getSupplierInvoice', 'listSupplierInvoices', 'getPurchaseOrder', 'listGoodsReceipts', 'sumOpenReceiptQtyForPoLine']) {
  const i = src.indexOf(`async ${name}`);
  const chunk = i >= 0 ? src.slice(i, i + 800) : '';
  check(`S7 ${name} uses withTenantScope`, /withTenantScope\(\s*tenantId/.test(chunk));
  check(`S8 ${name} uses this.query (not bare pool) inside scope`, /this\.query\(/.test(chunk) && !/this\.pool\.query\(/.test(chunk.split('withTenantScope')[1]?.slice(0, 700) || ''));
}

// Schema still intact
check('S9 accounting_decisions table DDL still present once', (src.match(/CREATE TABLE IF NOT EXISTS an_accounting_decisions/g) || []).length === 1);
check('S10 recordStockMovement still a top-level method', /\n  public async recordStockMovement\(/.test(src));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
