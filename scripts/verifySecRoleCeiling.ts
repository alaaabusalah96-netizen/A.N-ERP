/**
 * @file verifySecRoleCeiling.ts
 * @description SEC-ROLE-CEILING-1: USER_MANAGE must not be a way to become (or take over) a platform-level account.
 * Pure guard functions + STATIC checks that the routes in server.ts use them before they change anything.
 * It does NOT start the HTTP server (no live request is made).   Run: npx tsx scripts/verifySecRoleCeiling.ts
 */
import fs from 'fs';
import { ROLE_PERMISSION_MATRIX, hasPermission } from '../src/core/auth/PermissionMatrix';
import { checkRoleAssignment, checkTargetAccess, checkSelfRoleChange, isPlatformPrivilegedRole, isPlatformPrivilegedUser } from '../src/core/auth/UserAdminGuards';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => { ok ? pass++ : fail++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${!ok && extra ? ' | ' + extra : ''}`); };

const admin = { userId: 'a1', role: 'admin' };
const sysAdmin = { userId: 's1', role: 'system_admin' };
const sup = { userId: 'p1', role: 'super_admin' };
const withGrant = { userId: 'g1', role: 'admin', permissions: ['PLATFORM_ADMIN'] };

// --- who is platform-privileged (derived from the matrix, plus explicit expectations)
const matrixPlatform = Object.keys(ROLE_PERMISSION_MATRIX).filter(r => ROLE_PERMISSION_MATRIX[r].has('PLATFORM_ADMIN'));
check('G1 the roles that hold PLATFORM_ADMIN in the matrix are exactly the platform-privileged ones', matrixPlatform.every(r => isPlatformPrivilegedRole(r)) && Object.keys(ROLE_PERMISSION_MATRIX).filter(r => !matrixPlatform.includes(r)).every(r => !isPlatformPrivilegedRole(r)), matrixPlatform.join(','));
check('G2 super_admin is platform-privileged (any letter case); admin, system_admin, accountant, unknown names are not', isPlatformPrivilegedRole('super_admin') && isPlatformPrivilegedRole('SUPER_ADMIN') && !isPlatformPrivilegedRole('admin') && !isPlatformPrivilegedRole('system_admin') && !isPlatformPrivilegedRole('accountant') && !isPlatformPrivilegedRole('no_such_role') && !isPlatformPrivilegedRole(undefined));
check('G3 regression guard: the narrowed internal admin roles do NOT hold PLATFORM_ADMIN, super_admin does', !hasPermission('admin', 'PLATFORM_ADMIN') && !hasPermission('system_admin', 'PLATFORM_ADMIN') && hasPermission('super_admin', 'PLATFORM_ADMIN'));
check('G4 a user is platform-privileged by an individual PLATFORM_ADMIN grant even with an ordinary role', isPlatformPrivilegedUser({ role: 'accountant', permissions: ['PLATFORM_ADMIN'] }) && !isPlatformPrivilegedUser({ role: 'accountant', permissions: ['STOCK_VIEW'] }));

// --- assigning a role
const denyRole = (a: any, r?: string) => { const x = checkRoleAssignment(a, r); return !x.ok && x.status === 403 && x.type.endsWith('/role-assignment-forbidden'); };
check('A1 admin cannot assign super_admin', denyRole(admin, 'super_admin'));
check('A2 admin cannot assign SUPER_ADMIN (case) or platform_admin', denyRole(admin, 'SUPER_ADMIN') && denyRole(admin, 'platform_admin'));
check('A3 system_admin (narrowed) cannot assign super_admin either', denyRole(sysAdmin, 'super_admin'));
check('A4 admin CAN assign ordinary roles (accountant, warehouse_keeper, admin, system_admin)', ['accountant', 'warehouse_keeper', 'admin', 'system_admin'].every(r => checkRoleAssignment(admin, r).ok));
check('A5 super_admin can assign any role, including super_admin', ['super_admin', 'platform_admin', 'admin', 'accountant'].every(r => checkRoleAssignment(sup, r).ok));
check('A6 an admin who was individually GRANTED PLATFORM_ADMIN may assign platform roles (effective permission)', checkRoleAssignment(withGrant, 'super_admin').ok);
check('A7 unknown role names and a missing role are not judged by this guard', checkRoleAssignment(admin, 'no_such_role').ok && checkRoleAssignment(admin, undefined).ok);

// --- acting on an existing account
const denyTarget = (a: any, t: any) => { const x = checkTargetAccess(a, t); return !x.ok && x.status === 403 && x.type.endsWith('/target-user-protected'); };
check('T1 admin cannot touch a super_admin account (patch / reset password / revoke sessions share this guard)', denyTarget(admin, { role: 'super_admin' }));
check('T2 admin cannot touch an ordinary account that holds an individual PLATFORM_ADMIN grant', denyTarget(admin, { role: 'accountant', permissions: ['PLATFORM_ADMIN'] }));
check('T3 admin can touch ordinary accounts', checkTargetAccess(admin, { role: 'accountant' }).ok && checkTargetAccess(admin, { role: 'warehouse_keeper', permissions: ['STOCK_VIEW'] }).ok);
check('T4 super_admin can touch a super_admin account', checkTargetAccess(sup, { role: 'super_admin' }).ok);

// --- self role change
const self = checkSelfRoleChange('a1', 'a1');
check('S1 nobody changes their own role (403)', !self.ok && self.status === 403 && self.type.endsWith('/self-role-change-forbidden'));
check('S2 changing another user's role is not blocked by this guard; a missing actor id is not a self change', checkSelfRoleChange('a1', 'u2').ok && checkSelfRoleChange(undefined, 'u2').ok);

// --- static: the routes use the guards BEFORE they change anything
const src = fs.readFileSync('server.ts', 'utf8');
const region = (startMarker: string, endMarker: string) => { const a = src.indexOf(startMarker); const b = src.indexOf(endMarker, a + 10); return a >= 0 && b > a ? src.slice(a, b) : ''; };
const post = region("app.post('/api/users', requireAuth", "app.patch('/api/users/:id'");
const patch = region("app.patch('/api/users/:id', requireAuth", "app.post('/api/users/:id/reset-password'");
const reset = region("app.post('/api/users/:id/reset-password'", "app.post('/api/users/:id/revoke-sessions'");
const revokeRegion = (() => { const a = src.indexOf("app.post('/api/users/:id/revoke-sessions'"); return a >= 0 ? src.slice(a, a + 2600) : ''; })();
check('R1 the guards are imported in server.ts', /import \{[^}]*checkRoleAssignment[^}]*checkTargetAccess[^}]*checkSelfRoleChange[^}]*\} from '\.\/src\/core\/auth\/UserAdminGuards'/.test(src));
check('R2 POST /api/users checks the role ceiling before the user is created', post.length > 0 && post.indexOf('checkRoleAssignment(') > 0 && post.indexOf('checkRoleAssignment(') < post.indexOf('saveUser('), `post region=${post.length}`);
check('R3 PATCH /api/users/:id protects platform-level targets before any update', patch.length > 0 && patch.indexOf('checkTargetAccess(') > 0 && patch.indexOf('checkTargetAccess(') < patch.indexOf('updateUser(targetId'));
check('R4 PATCH blocks a self role change and enforces the role ceiling before the role is written', patch.indexOf('checkSelfRoleChange(') > 0 && patch.indexOf('checkRoleAssignment(') > 0 && patch.indexOf('checkRoleAssignment(') < patch.indexOf('updates.role = body.role.trim()'));
check('R5 reset-password protects platform-level targets before the password is changed', reset.indexOf('checkTargetAccess(') > 0 && reset.indexOf('checkTargetAccess(') < reset.indexOf('argon2.hash('));
check('R6 revoke-sessions protects platform-level targets before sessions are deleted', revokeRegion.indexOf('checkTargetAccess(') > 0 && revokeRegion.indexOf('checkTargetAccess(') < revokeRegion.indexOf('listActiveSessionsByUser('));
check('R7 all four routes still require USER_MANAGE', [post, patch, reset, revokeRegion].every(r => /requirePermission\('USER_MANAGE'\)/.test(r.slice(0, 200))));

console.log(`
Passed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
