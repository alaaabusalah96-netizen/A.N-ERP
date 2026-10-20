/**
 * @file verifyUiTransfersHub1.ts
 * UI-TRANSFERS-HUB-1 — unified transfers UI, separate backends.
 * Run: npx tsx scripts/verifyUiTransfersHub1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const view = fs.readFileSync('src/components/InventoryWorkspaceView.tsx', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));
const server = fs.readFileSync('server.ts', 'utf8');

check('S1 transferScope INTERNAL|XCOMPANY state', /transferScope/.test(view) && /INTERNAL/.test(view) && /XCOMPANY/.test(view));
check('S2 internal API still /api/inventory/transfers', /\/api\/inventory\/transfers/.test(view));
check('S3 xcompany API used in hub', /\/api\/xcompany\/transfers/.test(view));
check('S4 platform role gate for xcompany UI', /isPlatformTransferRole/.test(view) && /platform_admin/.test(view));
check('S5 create xcompany handler', /handleCreateXcompanyTransfer/.test(view));
check('S6 xcompany dispatch\/receive', /handleXcompanyAct/.test(view));
check('S7 UI label داخل الشركة', /داخل الشركة/.test(view));
check('S8 UI label بين شركات', /بين شركات المجموعة/.test(view));
check('S9 loadXcompanyHub', /loadXcompanyHub/.test(view));
check('S10 server xcompany route still platform-admin', /xcompany\/transfers',\s*requirePlatformAdmin/.test(server));
check('S11 package UI-TRANSFERS-HUB-1 DONE', byId['UI-TRANSFERS-HUB-1']?.status === 'DONE');
check('S12 UI-WAREHOUSE-CREATE-1 remains DONE', byId['UI-WAREHOUSE-CREATE-1']?.status === 'DONE');
check('S13 lastChange mentions UI-TRANSFERS-HUB-1', String(reg.lastChange || '').includes('UI-TRANSFERS-HUB-1'));
check('S14 note backends separate in UI', /المسارات الخلفية منفصلة/.test(view));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
