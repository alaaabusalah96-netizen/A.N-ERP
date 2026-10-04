/**
 * @file verifyP4Authorization.ts
 * @description Verification of Phase 4 (AUTHZ-002) Route Authorization & Closed Rows
 */

import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { ROLE_PERMISSION_MATRIX, hasPermission, PermissionGroup } from '../src/core/auth/PermissionMatrix';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'http://localhost:3000';
const ALL_ROLES = Object.keys(ROLE_PERMISSION_MATRIX);

interface Persona {
  role: string;
  username: string;
  token: string;
}

async function main() {
  console.log('========================================================================');
  console.log('    A.N ERP v7.2 — PHASE 4 (AUTHZ-002) AUTHORIZATION VERIFICATION       ');
  console.log('========================================================================\n');

  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const pool = (adapter as any).pool;
  if (!pool) throw new Error('Database pool not available');

  const rand = Math.floor(Math.random() * 900000 + 100000);
  const tempUsernames: string[] = [];
  const createdExpenseIds: string[] = [];

  // Get valid password hash from warehouse user
  const wRes = await pool.query(
    "SELECT password_hash FROM an_users WHERE tenant_id = 'tenant-main' AND username = 'warehouse'"
  );
  if (wRes.rows.length === 0 || !wRes.rows[0].password_hash) {
    throw new Error('Base user "warehouse" not found with password_hash');
  }
  const validHash = wRes.rows[0].password_hash;
  const rawPassword = process.env.INITIAL_USER_PASSWORD;
  if (!rawPassword) throw new Error('INITIAL_USER_PASSWORD is not set');

  const personasByRole = new Map<string, Persona>();

  async function getOrCreatePersona(role: string, suffix = ''): Promise<Persona> {
    const key = role + (suffix ? `_${suffix}` : '');
    if (personasByRole.has(key)) {
      return personasByRole.get(key)!;
    }

    const username = `u_${role.substring(0, 10)}_${rand}${suffix ? '_' + suffix : ''}`;
    const userId = `usr-p4-${rand}-${suffix || role}`;

    await pool.query(
      `INSERT INTO an_users (
        id, tenant_id, username, full_name, email, role, status,
        password_hash, two_factor_enabled, requires_password_change, created_at
      ) VALUES ($1, 'tenant-main', $2, $3, $4, $5, 'ACTIVE', $6, false, false, NOW())`,
      [userId, username, `مستخدم فحص ${role}`, `${username}@test.local`, role, validHash]
    );
    tempUsernames.push(username);

    // Login
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-code': 'MAIN',
      },
      body: JSON.stringify({
        tenantCode: 'MAIN',
        username,
        password: rawPassword,
      }),
    });

    const data = await res.json();
    if (res.status !== 200 || !data.accessToken) {
      throw new Error(`Login failed for ${username} (${role}): status ${res.status} ${JSON.stringify(data)}`);
    }

    const p: Persona = {
      role,
      username,
      token: data.accessToken,
    };
    personasByRole.set(key, p);
    return p;
  }

  function findRoleWith(perm: PermissionGroup): string {
    const r = ALL_ROLES.find((role) => hasPermission(role, perm));
    if (!r) throw new Error(`No role found with permission ${perm}`);
    return r;
  }

  function findRoleWithout(perm: PermissionGroup): string {
    const r = ALL_ROLES.find((role) => !hasPermission(role, perm));
    if (!r) throw new Error(`No role found without permission ${perm}`);
    return r;
  }

  let totalTests = 0;
  let passedTests = 0;

  function assertPass(name: string, ok: boolean, detail: string) {
    totalTests++;
    if (ok) {
      passedTests++;
      console.log(`[PASS] ${name} -> ${detail}`);
    } else {
      console.error(`[FAIL] ${name} -> ${detail}`);
      throw new Error(`Test failed: ${name} -> ${detail}`);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Direct Permission-Guarded Routes (ENTRY_VIEW & CUSTODY_VIEW)
    // -------------------------------------------------------------------------
    console.log('--- 1) Verifying Direct Permission Routes (ENTRY_VIEW & CUSTODY_VIEW) ---');

    const permRoutes: Array<{ path: string; perm: PermissionGroup }> = [
      { path: '/api/accounting/accounts', perm: 'ENTRY_VIEW' },
      { path: '/api/accounting/periods', perm: 'ENTRY_VIEW' },
      { path: '/api/accounting/dimensions', perm: 'ENTRY_VIEW' },
      { path: '/api/accounting/items', perm: 'ENTRY_VIEW' },
      { path: '/api/custody/custodies', perm: 'CUSTODY_VIEW' },
      { path: '/api/custody/custodies/cst-test-01', perm: 'CUSTODY_VIEW' },
      { path: '/api/custody/expenses', perm: 'CUSTODY_VIEW' },
      { path: '/api/custody/settlements', perm: 'CUSTODY_VIEW' },
      { path: '/api/custody/hr-clearance/EMP-01', perm: 'CUSTODY_VIEW' },
      { path: '/api/custody/vouchers', perm: 'CUSTODY_VIEW' },
      { path: '/api/custody/vouchers/vch-test-01', perm: 'CUSTODY_VIEW' },
    ];

    for (const r of permRoutes) {
      const allowedRole = findRoleWith(r.perm);
      const deniedRole = findRoleWithout(r.perm);

      const allowedP = await getOrCreatePersona(allowedRole);
      const deniedP = await getOrCreatePersona(deniedRole);

      // Check denied
      const deniedRes = await fetch(`${BASE_URL}${r.path}`, {
        headers: { Cookie: `an_access_token=${deniedP.token}` },
      });

      // Check allowed
      const allowedRes = await fetch(`${BASE_URL}${r.path}`, {
        headers: { Cookie: `an_access_token=${allowedP.token}` },
      });

      const deniedOk = deniedRes.status === 403;
      const allowedOk = allowedRes.status !== 401 && allowedRes.status !== 403;

      assertPass(
        `GET ${r.path} [${r.perm}]`,
        deniedOk && allowedOk,
        `Denied(${deniedRole}): ${deniedRes.status} | Allowed(${allowedRole}): ${allowedRes.status}`
      );
    }

    // -------------------------------------------------------------------------
    // 2. R-EXP Routes: GET /api/expenses/requests and /:id
    // -------------------------------------------------------------------------
    console.log('\n--- 2) Verifying R-EXP Scoped Expense Requests ---');

    // Find submitter role (has EXPENSE_SUBMIT but neither EXPENSE_APPROVE nor FINANCIAL_REPORTS)
    const submitterRole = ALL_ROLES.find(
      (r) =>
        hasPermission(r, 'EXPENSE_SUBMIT') &&
        !hasPermission(r, 'EXPENSE_APPROVE') &&
        !hasPermission(r, 'FINANCIAL_REPORTS')
    );
    if (!submitterRole) throw new Error('No pure submitter role found');

    const canViewAllRole = ALL_ROLES.find(
      (r) => hasPermission(r, 'EXPENSE_APPROVE') || hasPermission(r, 'FINANCIAL_REPORTS')
    );
    if (!canViewAllRole) throw new Error('No canViewAll role found');

    const deniedExpRole = ALL_ROLES.find(
      (r) =>
        !hasPermission(r, 'EXPENSE_SUBMIT') &&
        !hasPermission(r, 'EXPENSE_APPROVE') &&
        !hasPermission(r, 'FINANCIAL_REPORTS')
    );
    if (!deniedExpRole) throw new Error('No denied expense role found');

    const subA = await getOrCreatePersona(submitterRole, 'a');
    const subB = await getOrCreatePersona(submitterRole, 'b');
    const approverP = await getOrCreatePersona(canViewAllRole);
    const deniedP = await getOrCreatePersona(deniedExpRole);

    // Create expense request A by subA
    const createResA = await fetch(`${BASE_URL}/api/expenses/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `idemp-exp-a-${Date.now()}`,
        Cookie: `an_access_token=${subA.token}`,
      },
      body: JSON.stringify({
        titleAr: `طلب مصروف أ ${rand}`,
        employeeId: `emp-a-${rand}`,
        employeeName: `موظف أ ${rand}`,
        totalAmount: 150,
        currency: 'SAR',
        paymentMethod: 'CASH',
        lines: [
          {
            categoryId: 'cat-gen-01',
            categoryName: 'مصاريف عامة',
            description: 'بند أ',
            amount: 150,
          },
        ],
      }),
    });
    const createDataA = await createResA.json();
    if (createResA.status !== 201 && createResA.status !== 200) {
      throw new Error(`Failed to create expense request A: ${createResA.status} ${JSON.stringify(createDataA)}`);
    }
    const reqAId = createDataA.data?.id || createDataA.data?.request?.id;
    createdExpenseIds.push(reqAId);

    // Create expense request B by subB
    const createResB = await fetch(`${BASE_URL}/api/expenses/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `idemp-exp-b-${Date.now()}`,
        Cookie: `an_access_token=${subB.token}`,
      },
      body: JSON.stringify({
        titleAr: `طلب مصروف ب ${rand}`,
        employeeId: `emp-b-${rand}`,
        employeeName: `موظف ب ${rand}`,
        totalAmount: 200,
        currency: 'SAR',
        paymentMethod: 'CASH',
        lines: [
          {
            categoryId: 'cat-gen-01',
            categoryName: 'مصاريف عامة',
            description: 'بند ب',
            amount: 200,
          },
        ],
      }),
    });
    const createDataB = await createResB.json();
    if (createResB.status !== 201 && createResB.status !== 200) {
      throw new Error(`Failed to create expense request B: ${createResB.status} ${JSON.stringify(createDataB)}`);
    }
    const reqBId = createDataB.data?.id || createDataB.data?.request?.id;
    createdExpenseIds.push(reqBId);

    // subA lists requests -> sees reqA, does NOT see reqB
    const listResA = await fetch(`${BASE_URL}/api/expenses/requests`, {
      headers: { Cookie: `an_access_token=${subA.token}` },
    });
    const listDataA = await listResA.json();
    const idsA = (listDataA.data || []).map((x: any) => x.id);
    const subAIsolation = idsA.includes(reqAId) && !idsA.includes(reqBId);
    assertPass(
      'GET /api/expenses/requests (Submitter A isolation)',
      subAIsolation,
      `Sees reqA: ${idsA.includes(reqAId)}, Sees reqB: ${idsA.includes(reqBId)}`
    );

    // subA accesses reqB/:id -> MUST return 404
    const detailBByA = await fetch(`${BASE_URL}/api/expenses/requests/${reqBId}`, {
      headers: { Cookie: `an_access_token=${subA.token}` },
    });
    assertPass(
      `GET /api/expenses/requests/${reqBId} (Submitter A accessing B's request)`,
      detailBByA.status === 404,
      `Status: ${detailBByA.status} (Expected 404)`
    );

    // subA accesses own reqA/:id -> MUST return 200
    const detailAByA = await fetch(`${BASE_URL}/api/expenses/requests/${reqAId}`, {
      headers: { Cookie: `an_access_token=${subA.token}` },
    });
    assertPass(
      `GET /api/expenses/requests/${reqAId} (Submitter A accessing own request)`,
      detailAByA.status === 200,
      `Status: ${detailAByA.status} (Expected 200)`
    );

    // Approver lists requests -> sees BOTH reqA and reqB
    const listResApprover = await fetch(`${BASE_URL}/api/expenses/requests`, {
      headers: { Cookie: `an_access_token=${approverP.token}` },
    });
    const listDataApprover = await listResApprover.json();
    const idsApprover = (listDataApprover.data || []).map((x: any) => x.id);
    assertPass(
      'GET /api/expenses/requests (canViewAll sees both)',
      idsApprover.includes(reqAId) && idsApprover.includes(reqBId),
      `Approver sees reqA: ${idsApprover.includes(reqAId)}, sees reqB: ${idsApprover.includes(reqBId)}`
    );

    // Denied user calls GET /api/expenses/requests -> MUST return 403
    const listDenied = await fetch(`${BASE_URL}/api/expenses/requests`, {
      headers: { Cookie: `an_access_token=${deniedP.token}` },
    });
    assertPass(
      'GET /api/expenses/requests (Denied role)',
      listDenied.status === 403,
      `Denied(${deniedExpRole}) Status: ${listDenied.status}`
    );

    // -------------------------------------------------------------------------
    // 3. Attachments Routes (GET & POST /api/attachments)
    // -------------------------------------------------------------------------
    console.log('\n--- 3) Verifying Attachments Permissions (GET & POST) ---');

    // Unknown documentType -> 400
    const getAttUnknown = await fetch(
      `${BASE_URL}/api/attachments?documentType=UNKNOWN_TYPE&documentId=1`,
      {
        headers: { Cookie: `an_access_token=${approverP.token}` },
      }
    );
    assertPass(
      'GET /api/attachments (unknown docType -> 400)',
      getAttUnknown.status === 400,
      `Status: ${getAttUnknown.status}`
    );

    const postAttUnknown = await fetch(`${BASE_URL}/api/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `idemp-att-unk-${Date.now()}`,
        Cookie: `an_access_token=${approverP.token}`,
      },
      body: JSON.stringify({
        documentType: 'UNKNOWN_TYPE',
        documentId: '1',
      }),
    });
    assertPass(
      'POST /api/attachments (unknown docType -> 400)',
      postAttUnknown.status === 400,
      `Status: ${postAttUnknown.status}`
    );

    // GET /api/attachments for RECEIPT with role lacking STOCK_VIEW (e.g. deniedExpRole) -> 403
    const getAttReceiptDenied = await fetch(
      `${BASE_URL}/api/attachments?documentType=RECEIPT&documentId=1`,
      {
        headers: { Cookie: `an_access_token=${deniedP.token}` },
      }
    );
    assertPass(
      'GET /api/attachments?documentType=RECEIPT (Denied STOCK_VIEW -> 403)',
      getAttReceiptDenied.status === 403,
      `Status: ${getAttReceiptDenied.status}`
    );

    // POST /api/attachments for RECEIPT with role lacking STOCK_RECEIVE -> 403
    const postAttReceiptDenied = await fetch(`${BASE_URL}/api/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `idemp-att-rec-denied-${Date.now()}`,
        Cookie: `an_access_token=${deniedP.token}`,
      },
      body: JSON.stringify({
        documentType: 'RECEIPT',
        documentId: '1',
      }),
    });
    assertPass(
      'POST /api/attachments documentType=RECEIPT (Denied STOCK_RECEIVE -> 403)',
      postAttReceiptDenied.status === 403,
      `Status: ${postAttReceiptDenied.status}`
    );

    // -------------------------------------------------------------------------
    // 4. Print Route (GET /api/print/:docType/:docId)
    // -------------------------------------------------------------------------
    console.log('\n--- 4) Verifying Print Permissions ---');

    // Role without ENTRY_VIEW (e.g. deniedExpRole) -> 403 for journal-entry
    const printDenied = await fetch(`${BASE_URL}/api/print/journal-entry/je-1`, {
      headers: { Cookie: `an_access_token=${deniedP.token}` },
    });
    assertPass(
      'GET /api/print/journal-entry/:id (Denied ENTRY_VIEW -> 403)',
      printDenied.status === 403,
      `Status: ${printDenied.status}`
    );

    // Role with ENTRY_VIEW -> not 401/403 (expected 404 or 200)
    const printAllowed = await fetch(`${BASE_URL}/api/print/journal-entry/je-1`, {
      headers: { Cookie: `an_access_token=${approverP.token}` },
    });
    assertPass(
      'GET /api/print/journal-entry/:id (Allowed ENTRY_VIEW -> not 401/403)',
      printAllowed.status !== 401 && printAllowed.status !== 403,
      `Status: ${printAllowed.status}`
    );

    // Unknown print docType -> 400
    const printUnknown = await fetch(`${BASE_URL}/api/print/unknown-type/1`, {
      headers: { Cookie: `an_access_token=${approverP.token}` },
    });
    assertPass(
      'GET /api/print/unknown-type/:id (Unknown type -> 400)',
      printUnknown.status === 400,
      `Status: ${printUnknown.status}`
    );

    console.log('\n========================================================================');
    console.log(`    ALL PHASE 4 AUTHORIZATION TESTS PASSED (${passedTests}/${totalTests})`);
    console.log('========================================================================');
  } finally {
    // Cleanup temporary test users and expenses
    try {
      if (tempUsernames.length > 0) {
        await pool.query('DELETE FROM an_users WHERE username = ANY($1::text[])', [tempUsernames]);
      }
      if (createdExpenseIds.length > 0) {
        await pool.query('DELETE FROM an_expense_requests WHERE id = ANY($1::text[])', [createdExpenseIds]);
      }
      console.log('✓ Cleaned up temporary test users and expense records.');
    } catch (cleanErr: any) {
      console.error('Error during cleanup:', cleanErr.message);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\nFATAL ERROR in verifyP4Authorization:', err.message);
  process.exit(1);
});
