/**
 * @file verifyBaselineMap.ts
 * BASELINE-MAP-1 — static: roadmap + gap map exist and match tree invariants.
 * Run: npx tsx scripts/verifyBaselineMap.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const gap = fs.readFileSync('docs/GAP_MAP_BASELINE.md', 'utf8');
const road = fs.readFileSync('docs/ROADMAP_WAVES.md', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));
const ui = fs.readFileSync('src/components/InventoryWorkspaceView.tsx', 'utf8');
const sp = fs.readFileSync('src/core/storage/StoragePort.ts', 'utf8');
const srv = fs.readFileSync('server.ts', 'utf8');

check('S1 GAP_MAP_BASELINE.md exists and names BASELINE-MAP-1', /BASELINE-MAP-1/.test(gap) && fs.existsSync('docs/GAP_MAP_BASELINE.md'));
check('S2 ROADMAP_WAVES.md has 7 waves table', /AN-BASELINE-MAP-1/.test(road) && /AN-GATE-PROD-1/.test(road));
check('S3 package BASELINE-MAP-1 DONE', byId['BASELINE-MAP-1']?.status === 'DONE');
check('S4 lastChange mentions SEC-SESSION-PASSWORD', String(reg.lastChange || '').includes('SEC-SESSION-PASSWORD'));
check('S5 gap map records Open P1 = 0', /Open P1\|\s*\*\*0\*\*/.test(gap) || /Open P1\s*\|\s*\*\*0\*\*/.test(gap) || /Open P1.*\*\*0\*\*/.test(gap));
check('S6 gap map records CONFIG PROD-ROLE-BYPASSRLS', /PROD-ROLE-BYPASSRLS/.test(gap));
check('S7 tree: INV-UI-TABS items tab present', /activeTab === 'items'/.test(ui));
check('S8 tree: no CompanyGroup in StoragePort (gap still valid)', !/CompanyGroup/.test(sp));
check('S9 tree: requirePermission present on server', /requirePermission/.test(srv));
check('S10 tree: AUDIT-UNIFY-1 still DONE', byId['AUDIT-UNIFY-1']?.status === 'DONE');
check('S11 roadmap defers AI self-heal', /إصلاح تلقائي بالAI|مؤجّل صراحة/.test(road));
check('S12 no OPEN defects in register (CONFIG allowed)', !(reg.defects || []).some((d: any) => d.status === 'OPEN'));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
