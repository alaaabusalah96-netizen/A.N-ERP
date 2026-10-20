/**
 * @file verifyUiWarehouseCreate1.ts
 * UI-WAREHOUSE-CREATE-1 — warehouse create UI + system_admin STOCK_RECEIVE.
 * Run: npx tsx scripts/verifyUiWarehouseCreate1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const view = fs.readFileSync('src/components/InventoryWorkspaceView.tsx', 'utf8');
const matrix = fs.readFileSync('src/core/auth/PermissionMatrix.ts', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

// extract system_admin block roughly
const sysBlock = matrix.match(/system_admin:\s*new Set<PermissionGroup>\(\[([\s\S]*?)\]\)/)?.[1] || '';
const whMgrBlock = matrix.match(/warehouse_manager:\s*new Set<PermissionGroup>\(\[([\s\S]*?)\]\)/)?.[1] || '';

check('S1 create warehouse posts /api/inventory/warehouses', /\/api\/inventory\/warehouses/.test(view) && /method:\s*'POST'/.test(view));
check('S2 Idempotency-Key + credentials', /Idempotency-Key/.test(view) && /credentials:\s*'include'/.test(view));
check('S3 create warehouse modal/handler', /handleCreateWarehouse/.test(view) && /isCreateWhModalOpen/.test(view));
check('S4 UI button إنشاء مستودع', /إنشاء مستودع/.test(view));
check('S5 requires code and nameAr client-side', /newWhCode/.test(view) && /newWhNameAr/.test(view));
check('S6 server still STOCK_RECEIVE on POST warehouses', /app\.post\('\/api\/inventory\/warehouses'[\s\S]{0,120}STOCK_RECEIVE/.test(server));
check('S7 system_admin has STOCK_RECEIVE', /STOCK_RECEIVE/.test(sysBlock));
check('S8 system_admin has STOCK_VIEW', /STOCK_VIEW/.test(sysBlock));
check('S9 warehouse_manager still has STOCK_RECEIVE', /STOCK_RECEIVE/.test(whMgrBlock));
check('S10 system_admin still lacks PLATFORM_ADMIN', !/PLATFORM_ADMIN/.test(sysBlock));
check('S11 package UI-WAREHOUSE-CREATE-1 DONE', byId['UI-WAREHOUSE-CREATE-1']?.status === 'DONE');
check('S12 UI-LEDGER-DEPTH-1 remains DONE', byId['UI-LEDGER-DEPTH-1']?.status === 'DONE');
check('S13 lastChange mentions UI-WAREHOUSE-CREATE-1', String(reg.lastChange || '').includes('UI-WAREHOUSE-CREATE-1'));
check('S14 valuationMethod sent on create', /valuationMethod:\s*newWhValuation/.test(view));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
