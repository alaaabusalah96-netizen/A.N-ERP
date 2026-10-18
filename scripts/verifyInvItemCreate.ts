/**
 * @file verifyInvItemCreate.ts
 * INV-ITEM-CREATE — create stock-item cards from the dedicated Items tab.
 * Run: npx tsx scripts/verifyInvItemCreate.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const ui = fs.readFileSync('src/components/InventoryWorkspaceView.tsx', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 create-item modal state exists', /isCreateItemModalOpen/.test(ui));
check('S2 create button exists in Items tab', /إنشاء صنف جديد/.test(ui) && /setIsCreateItemModalOpen\(true\)/.test(ui));
check('S3 required item code validation exists', /newItemCode\.trim\(\)/.test(ui));
check('S4 required Arabic name validation exists', /newItemNameAr\.trim\(\)/.test(ui));
check('S5 required category validation exists', /newItemCategory\.trim\(\)/.test(ui));
check('S6 form calls existing item API', /fetch\('\/api\/inventory\/items'/.test(ui));
check('S7 protected API request includes credentials', /fetch\('\/api\/inventory\/items',\s*\{[\s\S]{0,120}credentials:\s*'include'/.test(ui));
check('S8 idempotency header is sent', /'Idempotency-Key': idemKey/.test(ui));
check('S9 supported valuation methods only', /WEIGHTED_AVERAGE/.test(ui) && /SPECIFIC_LOT/.test(ui) && /value="FIFO"/.test(ui) && !/value="STANDARD_COST"/.test(ui));
check('S10 success reloads data and closes modal', /setIsCreateItemModalOpen\(false\);[\s\S]{0,600}await loadData\(\)/.test(ui));
check('S11 item creation does not create stock quantity', /لا يضيف رصيدًا للمخزون/.test(ui));
check('S12 server route remains authenticated and permission-checked', /app\.post\('\/api\/inventory\/items',\s*requireAuth,\s*requirePermission\('STOCK_RECEIVE'\)/.test(server));
check('S13 server requires idempotency key', /app\.post\('\/api\/inventory\/items'[\s\S]{0,350}requireIdempotencyKey/.test(server));
check('R1 package INV-ITEM-CREATE marked DONE', byId['INV-ITEM-CREATE']?.status === 'DONE');
check('R2 previous INV-UI-TABS remains DONE', byId['INV-UI-TABS']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
