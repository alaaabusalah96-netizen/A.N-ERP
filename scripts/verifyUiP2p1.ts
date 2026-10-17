/**
 * @file verifyUiP2p1.ts
 * UI-P2P-1 — static: invoice match/approve/reject wired in PurchasingWorkspaceView.
 * Run: npx tsx scripts/verifyUiP2p1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const ui = fs.readFileSync('src/components/PurchasingWorkspaceView.tsx', 'utf8');
const srv = fs.readFileSync('server.ts', 'utf8');
const doc = fs.readFileSync('docs/UI_P2P_1.md', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 handleInvoiceMatch', /handleInvoiceMatch/.test(ui));
check('S2 match path', /invoices\/\$\{.*\}\/match/.test(ui) || /\/match`/.test(ui));
check('S3 handleInvoiceApprove', /handleInvoiceApprove/.test(ui) && /\/approve`/.test(ui));
check('S4 handleInvoiceReject', /handleInvoiceReject/.test(ui) && /\/reject`/.test(ui));
check('S5 actions column', /إجراءات/.test(ui) && /مطابقة/.test(ui));
check('S6 server match route', /invoices\/:id\/match/.test(srv));
check('S7 server approve route', /invoices\/:id\/approve/.test(srv));
check('S8 server reject route', /invoices\/:id\/reject/.test(srv));
check('S9 doc', /UI-P2P-1/.test(doc));
check('P package DONE', byId['UI-P2P-1']?.status === 'DONE');
check('P lastChange', String(reg.lastChange || '').includes('UI-2FA-SETUP-1'));
check('R UI-OPS-1 DONE', byId['UI-OPS-1']?.status === 'DONE');
check('R UI-USERS-1 DONE', byId['UI-USERS-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
