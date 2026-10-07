/**
 * @file verifyPhase2Authorization.ts
 * @description Real HTTP & Database Verification of Phase 2 Authorization & Route Guards
 */

import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import dotenv from 'dotenv';
import { accessTokenFromResponse } from './lib/httpAuth';
dotenv.config();

const BASE_URL = 'http://localhost:3000';

interface UserRoleSpec {
  username: string;
  role: string;
  fullName: string;
  email: string;
}

const TEST_USERS: UserRoleSpec[] = [
  { username: 'admin', role: 'super_admin', fullName: 'مدير النظام', email: 'admin@an-erp.local' },
  { username: 'accountant', role: 'accountant', fullName: 'المحاسب', email: 'accountant@an-erp.local' },
  { username: 'auditor', role: 'auditor', fullName: 'المراجع الداخلي', email: 'auditor@an-erp.local' },
  { username: 'warehouse_keeper', role: 'warehouse_keeper', fullName: 'أمين المستودع', email: 'warehouse_keeper@an-erp.local' },
  { username: 'developer', role: 'developer', fullName: 'المطور', email: 'developer@an-erp.local' },
];

async function ensureUsers(adapter: PostgresPrimaryAdapter): Promise<void> {
  const pool = (adapter as any).pool;
  const wRes = await pool.query("SELECT password_hash FROM an_users WHERE tenant_id = 'tenant-main' AND username = 'warehouse'");
  if (wRes.rows.length === 0 || !wRes.rows[0].password_hash) {
    throw new Error('Base user "warehouse" not found with password_hash');
  }
  const validHash = wRes.rows[0].password_hash;

  for (const u of TEST_USERS) {
    const existing = await pool.query(
      "SELECT id FROM an_users WHERE tenant_id = 'tenant-main' AND username = $1",
      [u.username]
    );
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO an_users (
          id, tenant_id, username, full_name, email, role, status,
          password_hash, two_factor_enabled, requires_password_change, created_at
        ) VALUES ($1, 'tenant-main', $2, $3, $4, $5, 'ACTIVE', $6, false, false, NOW())`,
        ['usr-' + u.username, u.username, u.fullName, u.email, u.role, validHash]
      );
    } else {
      await pool.query(
        "UPDATE an_users SET password_hash = $1, role = $2 WHERE tenant_id = 'tenant-main' AND username = $3",
        [validHash, u.role, u.username]
      );
    }
  }
}

async function loginUser(username: string): Promise<string> {
  const password = process.env.INITIAL_USER_PASSWORD;
  if (!password) throw new Error('INITIAL_USER_PASSWORD is not set');

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
      forceTerminateOldest: true,
    }),
  });

  const data = await res.json();
  const cookieToken = accessTokenFromResponse(res);
  if (res.status !== 200 || !cookieToken) {
    throw new Error(`Login failed for ${username}: status ${res.status} ${JSON.stringify(data)}`);
  }
  return cookieToken;
}

interface TestRouteDef {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  perm: string;
  deniedUser: string;
  allowedUser: string;
  body?: any;
}

const TEST_ROUTES: TestRouteDef[] = [
  // COMPANY_SETTINGS_MANAGE: محروم accountant / مخوَّل admin
  { method: 'PUT', path: '/api/company', perm: 'COMPANY_SETTINGS_MANAGE', deniedUser: 'accountant', allowedUser: 'admin', body: { nameAr: 'شركة الاختبار' } },
  { method: 'POST', path: '/api/custom-fields', perm: 'COMPANY_SETTINGS_MANAGE', deniedUser: 'accountant', allowedUser: 'admin', body: { module: 'general', key: 'test', labelAr: 'حقل' } },
  { method: 'POST', path: '/api/numbering/override', perm: 'COMPANY_SETTINGS_MANAGE', deniedUser: 'accountant', allowedUser: 'admin', body: { sequenceKey: 'DOC', manualNumber: 1, reason: 'اختبار تجاوز الترقيم التوثيقي المعتمد', authorizedBy: 'admin' } },

  // AUDIT_LOG_VIEW: محروم accountant / مخوَّل auditor
  { method: 'GET', path: '/api/audit-trail', perm: 'AUDIT_LOG_VIEW', deniedUser: 'accountant', allowedUser: 'auditor' },
  { method: 'GET', path: '/api/domain-events', perm: 'AUDIT_LOG_VIEW', deniedUser: 'accountant', allowedUser: 'auditor' },
  { method: 'GET', path: '/api/audit-chain', perm: 'AUDIT_LOG_VIEW', deniedUser: 'accountant', allowedUser: 'auditor' },
  { method: 'POST', path: '/api/audit-chain/verify', perm: 'AUDIT_LOG_VIEW', deniedUser: 'accountant', allowedUser: 'auditor', body: {} },

  // ENTRY_VIEW و ENTRY_CREATE و FINANCIAL_REPORTS: محروم warehouse_keeper / مخوَّل accountant
  { method: 'GET', path: '/api/accounting/journal-entries', perm: 'ENTRY_VIEW', deniedUser: 'warehouse_keeper', allowedUser: 'accountant' },
  { method: 'POST', path: '/api/accounting/dimensions', perm: 'ENTRY_CREATE', deniedUser: 'warehouse_keeper', allowedUser: 'accountant', body: { code: 'DIM-T1', nameAr: 'مركز تجريبي' } },
  { method: 'GET', path: '/api/accounting/dimensions/analytics', perm: 'FINANCIAL_REPORTS', deniedUser: 'warehouse_keeper', allowedUser: 'accountant' },
  { method: 'POST', path: '/api/accounting/items', perm: 'ENTRY_CREATE', deniedUser: 'warehouse_keeper', allowedUser: 'accountant', body: { code: 'ITM-ACC-1', nameAr: 'صنف مالي' } },
  { method: 'POST', path: '/api/accounting/import/validate', perm: 'ENTRY_CREATE', deniedUser: 'warehouse_keeper', allowedUser: 'accountant', body: { rows: [] } },
  { method: 'POST', path: '/api/accounting/import/execute', perm: 'ENTRY_CREATE', deniedUser: 'warehouse_keeper', allowedUser: 'accountant', body: { rows: [] } },
  { method: 'GET', path: '/api/accounting/budgets', perm: 'FINANCIAL_REPORTS', deniedUser: 'warehouse_keeper', allowedUser: 'accountant' },
  { method: 'POST', path: '/api/accounting/budgets', perm: 'ENTRY_CREATE', deniedUser: 'warehouse_keeper', allowedUser: 'accountant', body: { nameAr: 'ميزانية' } },
  { method: 'GET', path: '/api/accounting/recurring', perm: 'ENTRY_VIEW', deniedUser: 'warehouse_keeper', allowedUser: 'accountant' },
  { method: 'POST', path: '/api/accounting/recurring/rec-test-01/run', perm: 'ENTRY_CREATE', deniedUser: 'warehouse_keeper', allowedUser: 'accountant', body: {} },
  { method: 'GET', path: '/api/accounting/balance-checker/run', perm: 'FINANCIAL_REPORTS', deniedUser: 'warehouse_keeper', allowedUser: 'accountant' },
  { method: 'GET', path: '/api/accounting/balance-checker/history', perm: 'FINANCIAL_REPORTS', deniedUser: 'warehouse_keeper', allowedUser: 'accountant' },

  // STOCK_VIEW: محروم developer / مخوَّل warehouse_keeper
  { method: 'GET', path: '/api/inventory/warehouses', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },
  { method: 'GET', path: '/api/inventory/warehouses/wh-test-01/bins', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },
  { method: 'GET', path: '/api/inventory/items', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },
  { method: 'GET', path: '/api/inventory/stock', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },
  { method: 'GET', path: '/api/inventory/movements', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },
  { method: 'GET', path: '/api/inventory/transfers', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },
  { method: 'GET', path: '/api/inventory/transfers/tr-test-01', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },
  { method: 'GET', path: '/api/inventory/counts', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },
  { method: 'GET', path: '/api/inventory/counts/cnt-test-01', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },
  { method: 'GET', path: '/api/inventory/documents', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },
  { method: 'GET', path: '/api/inventory/documents/sdoc-test-01', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },
  { method: 'GET', path: '/api/inventory/items/itm-test-01/ledger', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },
  { method: 'GET', path: '/api/inventory/items/itm-test-01/prices', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },
  { method: 'GET', path: '/api/inventory/items/search/barcode?q=123', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },
  { method: 'GET', path: '/api/inventory/items/itm-test-01/barcode-svg', perm: 'STOCK_VIEW', deniedUser: 'developer', allowedUser: 'warehouse_keeper' },

  // ADD_GUARD (fuzz-test): محروم accountant / مخوَّل super_admin (admin)
  { method: 'POST', path: '/api/accounting/fuzz-test', perm: 'requireDeveloperOrAuditor', deniedUser: 'accountant', allowedUser: 'admin', body: { iterations: 1 } },
];

async function main() {
  console.log('========================================================================');
  console.log('    A.N ERP v7.2 — PHASE 2 AUTHORIZATION & ROUTE GUARD VERIFICATION     ');
  console.log('========================================================================\n');

  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  await ensureUsers(adapter);

  console.log('Authenticating test role personas...');
  const tokens: Record<string, string> = {};
  for (const u of TEST_USERS) {
    tokens[u.username] = await loginUser(u.username);
    console.log(`✓ Logged in [${u.username}] as role [${u.role}]`);
  }
  console.log('');

  let passCount = 0;
  let failCount = 0;

  for (const t of TEST_ROUTES) {
    const deniedToken = tokens[t.deniedUser];
    const allowedToken = tokens[t.allowedUser];

    // 1. Test Denied User -> must return exactly 403
    const deniedRes = await fetch(`${BASE_URL}${t.path}`, {
      method: t.method,
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-code': 'MAIN',
        Authorization: `Bearer ${deniedToken}`,
      },
      body: t.method !== 'GET' ? JSON.stringify(t.body || {}) : undefined,
    });

    const isDenied403 = deniedRes.status === 403;

    // 2. Test Allowed User -> must NOT return 401 or 403
    const allowedRes = await fetch(`${BASE_URL}${t.path}`, {
      method: t.method,
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-code': 'MAIN',
        Authorization: `Bearer ${allowedToken}`,
      },
      body: t.method !== 'GET' ? JSON.stringify(t.body || {}) : undefined,
    });

    const isAllowedAuthorized = allowedRes.status !== 401 && allowedRes.status !== 403;

    if (isDenied403 && isAllowedAuthorized) {
      passCount++;
      console.log(`[PASS] ${t.method} ${t.path} -> Denied(${t.deniedUser}): 403 | Allowed(${t.allowedUser}): ${allowedRes.status} (Not 401/403)`);
    } else {
      failCount++;
      console.error(`[FAIL] ${t.method} ${t.path} -> Denied status: ${deniedRes.status} (expected 403) | Allowed status: ${allowedRes.status} (expected != 401/403)`);
    }
  }

  // Explicit Mandatory Test:
  // GET /api/accounting/journal-entries يرجع 403 لـwarehouse_keeper و200 لـaccountant.
  console.log('\n--- EXPLICIT MANDATORY VERIFICATION ---');
  const resJeDenied = await fetch(`${BASE_URL}/api/accounting/journal-entries`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-code': 'MAIN',
      Authorization: `Bearer ${tokens['warehouse_keeper']}`,
    },
  });
  const resJeAllowed = await fetch(`${BASE_URL}/api/accounting/journal-entries`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-code': 'MAIN',
      Authorization: `Bearer ${tokens['accountant']}`,
    },
  });

  const jeDeniedMatch = resJeDenied.status === 403;
  const jeAllowedMatch = resJeAllowed.status === 200;

  console.log(`GET /api/accounting/journal-entries [warehouse_keeper]: Status ${resJeDenied.status} (Expected 403) -> ${jeDeniedMatch ? 'PASS' : 'FAIL'}`);
  console.log(`GET /api/accounting/journal-entries [accountant]: Status ${resJeAllowed.status} (Expected 200) -> ${jeAllowedMatch ? 'PASS' : 'FAIL'}`);

  if (!jeDeniedMatch || !jeAllowedMatch) {
    failCount++;
  }

  console.log('\n------------------------------------------------------------------------');
  console.log(`Tests Checked: ${TEST_ROUTES.length} routes + 1 explicit assertion`);
  console.log(`Passed: ${passCount} | Failed: ${failCount}`);
  console.log('------------------------------------------------------------------------');

  if (failCount > 0) {
    console.error('VERIFICATION FAILED WITH ' + failCount + ' ERRORS.');
    process.exit(1);
  }

  console.log('========================================================================');
  console.log('    ALL PHASE 2 AUTHORIZATION & ROUTE GUARD TESTS PASSED (100%)         ');
  console.log('========================================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
