/**
 * @file verifyUiLedgerDepth1.ts
 * UI-LEDGER-DEPTH-1 — entity close, recon, docs, attachments UI.
 * Run: npx tsx scripts/verifyUiLedgerDepth1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const view = fs.readFileSync('src/components/LedgerDepthView.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const side = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 LedgerDepthView exists', fs.existsSync('src/components/LedgerDepthView.tsx'));
check('S2 entity-close-status + close + reopen', /entity-close-status/.test(view) && /entity-close'/.test(view) && /entity-reopen/.test(view));
check('S3 inventory reconciliation', /\/api\/inventory\/reconciliation/.test(view));
check('S4 inventory documents + post-journal', /\/api\/inventory\/documents/.test(view) && /post-journal/.test(view));
check('S5 attachments GET/POST', /\/api\/attachments/.test(view));
check('S6 credentials + Idempotency-Key', /credentials:\s*'include'/.test(view) && /Idempotency-Key/.test(view));
check('S7 Sidebar ledger_depth', /ledger_depth/.test(side) && /إقفال ومطابقة/.test(side));
check('S8 App wires LedgerDepthView', /LedgerDepthView/.test(app));
check('S9 App renders ledger_depth', /activeSection === 'ledger_depth'/.test(app));
check('S10 package UI-LEDGER-DEPTH-1 DONE', byId['UI-LEDGER-DEPTH-1']?.status === 'DONE');
check('S11 UI-GROUP-REPORTS-1 remains DONE', byId['UI-GROUP-REPORTS-1']?.status === 'DONE');
check('S12 UI-XCOMPANY-1 remains DONE', byId['UI-XCOMPANY-1']?.status === 'DONE');
check('S13 UI-ORG-GROUPS-1 remains DONE', byId['UI-ORG-GROUPS-1']?.status === 'DONE');
check('S14 lastChange mentions UI-LEDGER-DEPTH-1', String(reg.lastChange || '').includes('UI-LEDGER-DEPTH-1'));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
