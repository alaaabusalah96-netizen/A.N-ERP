/**
 * @file verifySecPermOverride.ts
 * SEC-PERM-OVERRIDE-1 — static checks for individual permissions + narrowed admin roles.
 * Run: npx tsx scripts/verifySecPermOverride.ts
 */
import fs from 'fs';
import {
  hasPermission,
  ROLE_PERMISSION_MATRIX,
  ALL_PERMISSION_GROUPS,
} from '../src/core/auth/PermissionMatrix';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const srv = fs.readFileSync('server.ts', 'utf8');
const pm = fs.readFileSync('src/core/auth/PermissionMatrix.ts', 'utf8');
const doc = fs.readFileSync('docs/SEC_PERM_OVERRIDE.md', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 hasPermission accepts overrides', /overrides\?:/.test(pm) && /overrides\.includes/.test(pm));
check('S2 requirePermission uses authHasPermission', /authHasPermission\(authContext, permission\)/.test(pm));
check('S3 authContext loads user.permissions', /permissions: individualPerms/.test(srv));
check('S4 admin role lacks STOCK_ISSUE', !ROLE_PERMISSION_MATRIX.admin.has('STOCK_ISSUE' as any));
check('S5 admin role has USER_MANAGE', ROLE_PERMISSION_MATRIX.admin.has('USER_MANAGE' as any));
check('S6 system_admin lacks ENTRY_POST', !ROLE_PERMISSION_MATRIX.system_admin.has('ENTRY_POST' as any));
check('S7 super_admin still has STOCK_ISSUE', ROLE_PERMISSION_MATRIX.super_admin.has('STOCK_ISSUE' as any));
check('S8 override grants STOCK_VIEW to admin-shaped role', hasPermission('admin', 'STOCK_VIEW' as any, ['STOCK_VIEW']));
check('S9 without override admin lacks STOCK_VIEW', !hasPermission('admin', 'STOCK_VIEW' as any));
check('S10 cannot self-edit permissions message', /لا يمكنك تعديل صلاحياتك الفردية/.test(srv));
check('S11 grant validation isPermissionGroup', /isPermissionGroup/.test(srv));
check('S12 ALL_PERMISSION_GROUPS non-empty', ALL_PERMISSION_GROUPS.length >= 20);
check('S13 doc present', /SEC-PERM-OVERRIDE-1/.test(doc));
check('P package DONE', byId['SEC-PERM-OVERRIDE-1']?.status === 'DONE');
check('P lastChange', String(reg.lastChange || '').includes('SEC-PERM-OVERRIDE-1'));
check('R SEC-PASSWORD-UX-1 DONE', byId['SEC-PASSWORD-UX-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
