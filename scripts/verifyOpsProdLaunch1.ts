/**
 * @file verifyOpsProdLaunch1.ts
 * OPS-PROD-LAUNCH-1 — prod role SQL + manual backup script + checklist.
 * Run: npx tsx scripts/verifyOpsProdLaunch1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const sql = fs.readFileSync('scripts/ops/create_an_erp_app_role.sql', 'utf8');
const sh = fs.readFileSync('scripts/ops/backup_before_launch.sh', 'utf8');
const checklist = fs.readFileSync('docs/ops/PRE_LAUNCH_CHECKLIST.md', 'utf8');
const guard = fs.readFileSync('src/core/security/pgAppRoleGuard.ts', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));
const defect = (reg.defects || []).find((d: any) => d.id === 'PROD-ROLE-BYPASSRLS');

check('S1 role SQL exists', fs.existsSync('scripts/ops/create_an_erp_app_role.sql'));
check('S2 SQL has NOSUPERUSER', /NOSUPERUSER/.test(sql));
check('S3 SQL has NOBYPASSRLS', /NOBYPASSRLS/.test(sql));
check('S4 SQL targets an_erp_app', /an_erp_app/.test(sql));
check('S5 backup script exists', fs.existsSync('scripts/ops/backup_before_launch.sh'));
check('S6 backup uses pg_dump -Fc', /pg_dump/.test(sh) && /-Fc/.test(sh));
check('S7 backup requires DATABASE_URL', /DATABASE_URL/.test(sh));
check('S8 backup does not drop database', !/--clean/.test(sh) && !/DROP DATABASE/i.test(sh));
check('S9 checklist exists', fs.existsSync('docs/ops/PRE_LAUNCH_CHECKLIST.md'));
check('S10 checklist mentions enforce + backup', /AN_ENFORCE_PROD_ROLE/.test(checklist) && /backup_before_launch/.test(checklist));
check('S11 guard still present', /assertPgAppRoleSafe/.test(guard) && /subjectToRls/.test(guard));
check('S12 boot enforce still present', /AN_ENFORCE_PROD_ROLE/.test(server));
check('R1 OPS-PROD-LAUNCH-1 DONE', byId['OPS-PROD-LAUNCH-1']?.status === 'DONE');
check('R2 PROD-ROLE-BYPASSRLS still tracked until env applied', !!defect && (defect.status === 'CONFIG' || defect.status === 'OPEN'));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
