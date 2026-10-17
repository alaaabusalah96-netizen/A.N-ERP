/**
 * @file verifyUiAuditPrint1.ts
 * UI-AUDIT-PRINT-1 — static checks for chain verify + official print wiring.
 * Run: npx tsx scripts/verifyUiAuditPrint1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const at = fs.readFileSync('src/components/AuditTrailView.tsx', 'utf8');
const pm = fs.readFileSync('src/components/PrintVoucherModal.tsx', 'utf8');
const srv = fs.readFileSync('server.ts', 'utf8');
const doc = fs.readFileSync('docs/UI_AUDIT_PRINT_1.md', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 verifyAuditChain handler', /verifyAuditChain/.test(at));
check('S2 POST audit-chain/verify', /\/api\/audit-chain\/verify/.test(at));
check('S3 chain result UI', /chainResult/.test(at) && /فحص سلامة السلسلة/.test(at));
check('S4 audit-trail credentials', /audit-trail.*credentials:\s*'include'/.test(at) || /credentials:\s*'include'/.test(at));
check('S5 official print handler', /handleOfficialPrint/.test(pm));
check('S6 print journal-entry path', /\/api\/print\/.*journal-entry/.test(pm) || /journal-entry/.test(pm));
check('S7 format=raw or Accept html', /format=raw/.test(pm) || /Accept.*text\/html/.test(pm));
check('S8 local print retained', /window\.print/.test(pm));
check('S9 server routes exist', /audit-chain\/verify/.test(srv) && /\/api\/print\/:docType/.test(srv));
check('S10 doc', /UI-AUDIT-PRINT-1/.test(doc));
check('P package DONE', byId['UI-AUDIT-PRINT-1']?.status === 'DONE');
check('P lastChange', String(reg.lastChange || '').includes('DEMO-LOGIN-ROLES-1'));
check('R UI-2FA-SETUP-1 DONE', byId['UI-2FA-SETUP-1']?.status === 'DONE');
check('R UI-P2P-1 DONE', byId['UI-P2P-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
