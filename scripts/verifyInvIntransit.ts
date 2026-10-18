/**
 * @file verifyInvIntransit.ts
 * INV-INTRANSIT-1 — in-transit transfer filter + session credentials on transfer APIs.
 * Run: npx tsx scripts/verifyInvIntransit.ts
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

check('S1 transferStatusFilter state', /transferStatusFilter/.test(ui));
check('S2 filteredTransfers derived', /filteredTransfers/.test(ui) && /filteredTransfers\.map/.test(ui));
check('S3 IN_TRANSIT filter option', /IN_TRANSIT/.test(ui) && /في الطريق/.test(ui));
check('S4 summary counts transferCountByStatus', /transferCountByStatus\.IN_TRANSIT/.test(ui));
check('S5 loadData uses credentials include', /fetch\('\/api\/inventory\/transfers',\s*cred\)/.test(ui) || /fetch\('\/api\/inventory\/transfers',\s*\{\s*credentials:\s*'include'/.test(ui));
check('S6 create transfer credentials', /fetch\('\/api\/inventory\/transfers',\s*\{[\s\S]{0,80}credentials:\s*'include'/.test(ui));
check('S7 dispatch credentials', /transfers\/\$\{transferId\}\/dispatch[\s\S]{0,120}credentials:\s*'include'/.test(ui));
check('S8 receive credentials', /transfers\/\$\{transferId\}\/receive[\s\S]{0,120}credentials:\s*'include'/.test(ui));
check('S9 dispatch + receive handlers remain', /handleDispatchTransfer/.test(ui) && /handleReceiveTransfer/.test(ui));
check('S10 server dispatch route', /app\.post\('\/api\/inventory\/transfers\/:id\/dispatch'/.test(server));
check('S11 server receive route', /app\.post\('\/api\/inventory\/transfers\/:id\/receive'/.test(server));
check('S12 server lists transfers with status filter', /app\.get\('\/api\/inventory\/transfers'[\s\S]{0,200}status/.test(server));
check('R1 INV-INTRANSIT-1 DONE', byId['INV-INTRANSIT-1']?.status === 'DONE');
check('R2 INV-ITEM-CREATE remains DONE', byId['INV-ITEM-CREATE']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
