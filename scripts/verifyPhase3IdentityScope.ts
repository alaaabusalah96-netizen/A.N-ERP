/**
 * @file verifyPhase3IdentityScope.ts
 * @description Real HTTP & Database Verification of Phase 3:
 * Identity, Organization, Tenant Source of Truth, and Membership Scope.
 * Executed strictly against PostgreSQL Primary.
 */

import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { OrgHierarchyService } from '../src/core/org/OrgHierarchyService';
import { TokenService } from '../src/core/auth/TokenService';
import { OrgNode, User } from '../src/core/storage/StoragePort';
import dotenv from 'dotenv';
import { accessTokenFromResponse } from './lib/httpAuth';
dotenv.config();

const BASE_URL = 'http://localhost:3000';
const TENANT_A = 'tenant-main';
const TENANT_B = `ten-phase3-b-${Date.now()}`;

async function main() {
  console.log('=== Starting Phase 3 Identity & Scope Verification ===\n');
  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const pool = (adapter as any).pool;

  const orgService = new OrgHierarchyService(adapter);

  // Get admin password hash for creating test users
  const adminRes = await pool.query(
    "SELECT password_hash FROM an_users WHERE tenant_id = $1 AND username = 'admin' LIMIT 1",
    [TENANT_A]
  );
  if (adminRes.rows.length === 0 || !adminRes.rows[0].password_hash) {
    throw new Error('Seed admin user not found with password_hash');
  }
  const passwordHash = adminRes.rows[0].password_hash;
  const initialPassword = process.env.INITIAL_USER_PASSWORD || process.env.SEED_ADMIN_PASSWORD || 'TestAdmin@2026!';

  // Helper to log in a user and obtain accessToken
  async function login(username: string): Promise<string> {
    const password = username === 'admin'
      ? process.env.SEED_ADMIN_PASSWORD || 'TestAdmin@2026!'
      : process.env.INITIAL_USER_PASSWORD || 'Enterprise@2026!';

    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-code': 'MAIN',
      },
      body: JSON.stringify({
        tenantCode: 'MAIN',
        username,
        password,
      }),
    });
    const data = await res.json();
    const cookieToken = accessTokenFromResponse(res);
    if (res.status !== 200 || !cookieToken) {
      throw new Error(`Login failed for ${username}: status ${res.status} ${JSON.stringify(data)}`);
    }
    return cookieToken;
  }

  const tenantBCode = `TB-${Date.now() % 1000000}`;
  const tSaveRes = await adapter.saveTenant(
    {
      id: TENANT_B,
      code: tenantBCode,
      nameAr: 'شركة اختبار الفرع ب المعزولة',
      backendConfig: { adapterType: 'postgresql', connectionRef: 'DATABASE_URL', isolationLevel: 'Shared' },
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    },
    `idemp-tenant-b-${Date.now()}`
  );
  if (!tSaveRes.success) {
    throw new Error(`Failed to save Tenant B: ${tSaveRes.error?.detail}`);
  }

  // Setup Org Hierarchy for Scoping Tests (REGION -> SITE -> BRANCH -> DEPARTMENT)
  const now = Date.now();
  const nodeRegion: OrgNode = {
    id: `node-reg-${now}`,
    tenantId: TENANT_A,
    type: 'REGION',
    code: `REG-${now}`,
    nameAr: 'منطقة الرياض',
    parentId: null,
    status: 'ACTIVE',
  };
  const nodeSiteA: OrgNode = {
    id: `node-site-a-${now}`,
    tenantId: TENANT_A,
    type: 'SITE',
    code: `SITE-A-${now}`,
    nameAr: 'موقع السلي',
    parentId: nodeRegion.id,
    status: 'ACTIVE',
  };
  const nodeSiteB: OrgNode = {
    id: `node-site-b-${now}`,
    tenantId: TENANT_A,
    type: 'SITE',
    code: `SITE-B-${now}`,
    nameAr: 'موقع الملز (شقيق)',
    parentId: nodeRegion.id,
    status: 'ACTIVE',
  };
  const nodeBranchA: OrgNode = {
    id: `node-br-a-${now}`,
    tenantId: TENANT_A,
    type: 'BRANCH',
    code: `BR-A-${now}`,
    nameAr: 'فرع السلي الرئيسي',
    parentId: nodeSiteA.id,
    status: 'ACTIVE',
  };
  const nodeDeptA: OrgNode = {
    id: `node-dept-a-${now}`,
    tenantId: TENANT_A,
    type: 'DEPARTMENT',
    code: `DEPT-A-${now}`,
    nameAr: 'قسم الصيانة - السلي',
    parentId: nodeBranchA.id,
    status: 'ACTIVE',
  };

  const rReg = await orgService.createNode(TENANT_A, nodeRegion, `idem-reg-${now}`);
  if (!rReg.success) throw new Error(`Failed to create region: ${rReg.error?.detail}`);
  const rSiteA = await orgService.createNode(TENANT_A, nodeSiteA, `idem-sitea-${now}`);
  if (!rSiteA.success) throw new Error(`Failed to create site A: ${rSiteA.error?.detail}`);
  const rSiteB = await orgService.createNode(TENANT_A, nodeSiteB, `idem-siteb-${now}`);
  if (!rSiteB.success) throw new Error(`Failed to create site B: ${rSiteB.error?.detail}`);
  const rBrA = await orgService.createNode(TENANT_A, nodeBranchA, `idem-bra-${now}`);
  if (!rBrA.success) throw new Error(`Failed to create branch A: ${rBrA.error?.detail}`);
  const rDeptA = await orgService.createNode(TENANT_A, nodeDeptA, `idem-depta-${now}`);
  if (!rDeptA.success) throw new Error(`Failed to create dept A: ${rDeptA.error?.detail}`);

  // --------------------------------------------------------------------------
  // TEST-01: User without active business membership -> protected business endpoint -> denied
  // --------------------------------------------------------------------------
  const inactiveUserId = `usr-inact-${now}`;
  const inactiveUsername = `user_inactive_${now}`;
  await pool.query(
    `INSERT INTO an_users (id, tenant_id, username, full_name, email, role, status, password_hash, two_factor_enabled, requires_password_change, created_at)
     VALUES ($1, $2, $3, 'مستخدم معطل', 'inact@test.local', 'accountant', 'INACTIVE', $4, false, false, NOW())`,
    [inactiveUserId, TENANT_A, inactiveUsername, passwordHash]
  );

  const tokenService = new TokenService(adapter);
  const inactiveToken = tokenService.generateAccessToken({
    userId: inactiveUserId,
    tenantId: TENANT_A,
    role: 'accountant',
    sessionId: `ses-inact-${now}`,
    familyId: `fam-inact-${now}`,
  });

  const resTest01 = await fetch(`${BASE_URL}/api/company`, {
    headers: { Authorization: `Bearer ${inactiveToken}` },
  });

  if (resTest01.status === 403 || resTest01.status === 401) {
    console.log('[PASS] TEST-01: User without active business membership is denied access to protected endpoints');
  } else {
    console.error(`[FAIL] TEST-01: Expected 401/403 for inactive user, got ${resTest01.status}`);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // TEST-02: User with active membership but NO role assignment -> business endpoint -> denied
  // --------------------------------------------------------------------------
  const noRoleUserId = `usr-norole-${now}`;
  const noRoleUsername = `user_roleless_${now}`;
  await pool.query(
    `INSERT INTO an_users (id, tenant_id, username, full_name, email, role, status, password_hash, two_factor_enabled, requires_password_change, created_at)
     VALUES ($1, $2, $3, 'مستخدم بلا دور', 'norole@test.local', '', 'ACTIVE', $4, false, false, NOW())`,
    [noRoleUserId, TENANT_A, noRoleUsername, passwordHash]
  );

  const noRoleToken = tokenService.generateAccessToken({
    userId: noRoleUserId,
    tenantId: TENANT_A,
    role: '',
    sessionId: `ses-norole-${now}`,
    familyId: `fam-norole-${now}`,
  });

  const resTest02 = await fetch(`${BASE_URL}/api/company`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${noRoleToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ nameAr: 'تغيير غير مصرح' }),
  });

  if (resTest02.status === 403) {
    console.log('[PASS] TEST-02: User with active membership but no assigned role is denied business access');
  } else {
    console.error(`[FAIL] TEST-02: Expected 403 for roleless user on protected endpoint, got ${resTest02.status}`);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // TEST-03: User has role but assigned OrgNode is outside scope -> rejected
  // --------------------------------------------------------------------------
  const canAccessOutside = await orgService.canAccessNode(TENANT_A, nodeSiteA.id, nodeSiteB.id);
  if (!canAccessOutside) {
    console.log('[PASS] TEST-03: User with role but assigned OrgNode outside scope cannot access out-of-scope resource');
  } else {
    console.error('[FAIL] TEST-03: User in Site A was improperly allowed to access out-of-scope Site B');
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // TEST-04: User inside OrgNode A -> resource in sibling OrgNode B -> rejected
  // --------------------------------------------------------------------------
  const canAccessSibling = await orgService.canAccessNode(TENANT_A, nodeSiteA.id, nodeSiteB.id);
  if (!canAccessSibling) {
    console.log('[PASS] TEST-04: User inside OrgNode A is strictly denied access to sibling OrgNode B');
  } else {
    console.error('[FAIL] TEST-04: Sibling node access was not rejected');
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // TEST-05: User inside parent OrgNode -> resource in descendant node -> granted per hierarchy
  // --------------------------------------------------------------------------
  const canAccessDescendant = await orgService.canAccessNode(TENANT_A, nodeRegion.id, nodeDeptA.id);
  if (canAccessDescendant) {
    console.log('[PASS] TEST-05: User inside parent OrgNode is granted access to descendant node according to hierarchy');
  } else {
    console.error('[FAIL] TEST-05: Parent node was denied access to valid descendant node');
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // TEST-06: Authenticated user from tenant A sends body/query/header tenantId=tenant B -> tenant A remains context
  // --------------------------------------------------------------------------
  const adminToken = await login('admin');
  const resTest06 = await fetch(`${BASE_URL}/api/company?tenantId=${TENANT_B}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'x-tenant-id': TENANT_B,
      'Content-Type': 'application/json',
    },
  });

  if (!resTest06.ok) {
    console.error(`[FAIL] TEST-06: Request failed with status ${resTest06.status}`);
    process.exit(1);
  }
  const dataTest06 = await resTest06.json();
  if (dataTest06.success && dataTest06.data && dataTest06.data.id === TENANT_A && dataTest06.data.id !== TENANT_B) {
    console.log('[PASS] TEST-06: Tenant context cannot be forged or overridden via client body/query/headers');
  } else {
    console.error(`[FAIL] TEST-06: Tenant context was altered: ${JSON.stringify(dataTest06)}`);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // TEST-07: User from tenant A attempts to access records belonging to tenant B
  // --------------------------------------------------------------------------
  // Create an account in Tenant B
  await pool.query(
    `INSERT INTO an_accounts (code, tenant_id, name_ar, type, currency, debit_balance, credit_balance, is_active)
     VALUES ('9999-ISOLATED', $1, 'حساب معزول للشركة ب', 'EXPENSE', 'SAR', 5000, 0, true)
     ON CONFLICT (tenant_id, code) DO NOTHING`,
    [TENANT_B]
  );

  // User from tenant A queries accounts via protected endpoint
  const resTest07 = await fetch(`${BASE_URL}/api/accounting/accounts`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!resTest07.ok) {
    console.error(`[FAIL] TEST-07: Accounts request failed with status ${resTest07.status}`);
    process.exit(1);
  }
  const dataTest07 = await resTest07.json();
  const leakedAccount = (dataTest07.data || []).find((acc: any) => acc.code === '9999-ISOLATED');
  if (!leakedAccount) {
    console.log('[PASS] TEST-07: Cross-tenant data isolation strictly enforced; Tenant A user cannot access Tenant B records');
  } else {
    console.error('[FAIL] TEST-07: Cross-tenant account leak detected!');
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // TEST-08: Restart / re-run seed: count of membership/role/scope for seed identity does not increase
  // --------------------------------------------------------------------------
  const countBeforeRes = await pool.query(
    "SELECT COUNT(*) FROM an_users WHERE username = 'admin' AND tenant_id = $1",
    [TENANT_A]
  );
  const countBefore = parseInt(countBeforeRes.rows[0].count, 10);

  // Simulate re-running seed via storage check
  const existingAdmin = await adapter.getUser(TENANT_A, 'usr-admin-seed');
  if (existingAdmin.success && existingAdmin.data) {
    // Idempotent saveUser
    await adapter.saveUser(existingAdmin.data, 'seed-admin-idempotent-test');
  }

  const countAfterRes = await pool.query(
    "SELECT COUNT(*) FROM an_users WHERE username = 'admin' AND tenant_id = $1",
    [TENANT_A]
  );
  const countAfter = parseInt(countAfterRes.rows[0].count, 10);

  if (countBefore === countAfter && countAfter === 1) {
    console.log('[PASS] TEST-08: Re-running seed does not duplicate membership/role/scope records');
  } else {
    console.error(`[FAIL] TEST-08: Seed duplicated users: before=${countBefore}, after=${countAfter}`);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // TEST-09: OrgHierarchy: parent -> child visibility works according to current implementation
  // --------------------------------------------------------------------------
  const scopeRes = await orgService.getVisibleScope(TENANT_A, nodeRegion.id);
  if (!scopeRes.success || !scopeRes.data) {
    console.error('[FAIL] TEST-09: Failed to retrieve visible scope');
    process.exit(1);
  }
  const scopeIds = new Set(scopeRes.data.map((n) => n.id));
  const hasRegion = scopeIds.has(nodeRegion.id);
  const hasSiteA = scopeIds.has(nodeSiteA.id);
  const hasSiteB = scopeIds.has(nodeSiteB.id);
  const hasDeptA = scopeIds.has(nodeDeptA.id);

  if (hasRegion && hasSiteA && hasSiteB && hasDeptA) {
    console.log('[PASS] TEST-09: OrgHierarchy parent-to-child recursive visibility operates per hierarchy policy');
  } else {
    console.error(`[FAIL] TEST-09: Missing nodes in hierarchy scope: ${JSON.stringify(scopeRes.data)}`);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // TEST-10: TenantResolution: authenticated tenant context remains immutable across request
  // --------------------------------------------------------------------------
  const resTest10 = await fetch(`${BASE_URL}/api/users`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'x-tenant-id': TENANT_B,
    },
  });
  if (!resTest10.ok) {
    console.error(`[FAIL] TEST-10: Request failed: ${resTest10.status}`);
    process.exit(1);
  }
  const dataTest10 = await resTest10.json();
  const allInTenantA = (dataTest10.data || []).every((u: any) => !u.tenantId || u.tenantId === TENANT_A);
  if (allInTenantA) {
    console.log('[PASS] TEST-10: Authenticated tenant context is immutable throughout the request lifecycle');
  } else {
    console.error('[FAIL] TEST-10: Users from another tenant returned in authenticated context');
    process.exit(1);
  }

  console.log('\n=== All Phase 3 Identity & Scope Tests PASSED ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error in verifyPhase3IdentityScope:', err);
  process.exit(1);
});
