/** AUDIT-WIRE invariant test: existing critical non-PG gates must be part of the main battery. */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const batterySource = fs.readFileSync('scripts/runReconcileAuditB.ts', 'utf8');
const required: Array<[string, string, number]> = [
  ['FixP1P2pAutopost', 'scripts/verifyFixP1P2pAutopost.ts', 8],
  ['Ph8InvTab', 'scripts/verifyPh8InvTab.ts', 14],
  ['Ph8Return', 'scripts/verifyPh8Return.ts', 18],
  ['Ph8Reorder', 'scripts/verifyPh8Reorder.ts', 14],
  ['InvItemCard', 'scripts/verifyInvItemCard.ts', 13],
  ['InvMovementsFilter', 'scripts/verifyInvMovementsFilter.ts', 14],
  ['Db1', 'scripts/verifyDb1.ts', 20],
  ['Ops1', 'scripts/verifyOps1.ts', 28],
  ['AuditWire', 'scripts/verifyAuditWire.ts', 16],
];
for (const [name, script, expected] of required) {
  const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`name: ['"]${name}['"],\s*script: ['"]${escaped}['"],\s*expected: ${expected}`);
  check(`BATTERY ${name} registered with expected=${expected}`, re.test(batterySource));
}
const scripts = [...batterySource.matchAll(/script:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
check('BATTERY script paths unique', new Set(scripts).size === scripts.length);
const criticalSource = batterySource.match(/const CRITICAL = \[([\s\S]*?)\];/)?.[1] || '';
check('P1 autopost and audit-wire are critical verdict gates', /'FixP1P2pAutopost'/.test(criticalSource) && /'AuditWire'/.test(criticalSource));
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
check('STATE_REGISTER lastChange names this audit bundle', /AUDIT-WIRE \/ PH8-CLOSE-1/.test(String(reg.lastChange || '')));
const d = (reg.defects || []).find((x: any) => x.id === 'DEF-P1-003');
check('DEF-P1-003 evidence does not contradict FIXED status', d?.status === 'FIXED' && !/still OPEN/i.test(String(d?.evidence || '')));
check('STATE_REGISTER has no stale claim DB-1/OPS-1 are unregistered', !(reg.knownRisks || []).some((x: string) => /verifyDb1 \/ verifyOps1 are not yet entries/i.test(x)));
const auditPackage = (reg.packages || []).find((x: any) => x.id === 'AUDIT-WIRE');
check('STATE_REGISTER records AUDIT-WIRE as DONE', auditPackage?.status === 'DONE');
check('STATE_REGISTER transparently tracks legacy DocSyncFull S7 assertion', (reg.knownRisks || []).some((x: string) => /verifyDocSyncFull.*S7 assertion/i.test(x)));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
