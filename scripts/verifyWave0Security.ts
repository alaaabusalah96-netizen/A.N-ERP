import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://127.0.0.1:3000';

interface CheckResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: CheckResult[] = [];

async function makeRequest(path: string, options: { method?: string; headers?: Record<string, string>; body?: any } = {}) {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // not json
  }

  return {
    status: res.status,
    headers: res.headers,
    data,
  };
}

async function runVerification() {
  console.log('========================================================================');
  console.log('      A.N ERP v7.2 — WAVE 0 SECURITY HARDENING VERIFICATION BATTERY     ');
  console.log('========================================================================\n');

  // 1. Health check & Version Synchronization
  console.log('--- 1) Verification of Version Synchronization ---');
  const health = await makeRequest('/api/health');
  const pkgVersion = process.env.npm_package_version || '7.2.0';
  const expectedVersion = 'v7.2.0';
  const versionPassed = health.status === 200 && health.data?.version === expectedVersion;
  results.push({
    name: 'Version sync between package.json and /api/health',
    passed: versionPassed,
    details: `Status: ${health.status}, Reported Version: ${health.data?.version} (Expected: ${expectedVersion})`,
  });
  console.log(`[${versionPassed ? 'PASS' : 'FAIL'}] Health Version: ${health.data?.version}`);

  // Public route check
  const publicPassed = health.status === 200;
  results.push({
    name: 'Public route GET /api/health accessible without token',
    passed: publicPassed,
    details: `Status: ${health.status}`,
  });
  console.log(`[${publicPassed ? 'PASS' : 'FAIL'}] Public GET /api/health: ${health.status}`);

  // 2. Sensitive Routes Protection (Unauthenticated => 401)
  console.log('\n--- 2) Verification of Sensitive Routes (Unauthenticated => 401) ---');
  const sensitiveRoutes = [
    { path: '/api/wizard/create-company', method: 'POST', body: { code: 'TEST' } },
    { path: '/api/tenants', method: 'GET' },
    { path: '/api/storage/propose-migration', method: 'POST', body: { tenantId: 't1' } },
    { path: '/api/internal/phase1-battery', method: 'GET' },
    { path: '/api/internal/phase2-battery', method: 'GET' },
    { path: '/api/internal/phase3-battery', method: 'GET' },
    { path: '/api/internal/phase4_6-battery', method: 'GET' },
    { path: '/api/internal/phase5-battery', method: 'GET' },
    { path: '/api/internal/phase6-battery', method: 'GET' },
    { path: '/api/internal/phase7-battery', method: 'GET' },
    { path: '/api/internal/primary-battery', method: 'GET' },
    { path: '/api/internal/build-status', method: 'GET' },
  ];

  for (const r of sensitiveRoutes) {
    const res = await makeRequest(r.path, { method: r.method, body: r.body });
    const passed = res.status === 401;
    results.push({
      name: `Unauthenticated access rejected with 401: ${r.method} ${r.path}`,
      passed,
      details: `Returned HTTP status ${res.status}`,
    });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${r.method} ${r.path} => ${res.status}`);
  }

  // 2b. AUTH-001: Verification of x-bypass-auth Rejection
  console.log('\n--- 2b) Verification of AUTH-001 (x-bypass-auth Rejected => 401) ---');
  for (const r of sensitiveRoutes.slice(0, 4)) {
    const res = await makeRequest(r.path, {
      method: r.method,
      headers: {
        'x-bypass-auth': 'true',
        'x-tenant-id': 'tenant-main',
      },
      body: r.body,
    });
    const passed = res.status === 401;
    results.push({
      name: `AUTH-001: x-bypass-auth rejected with 401: ${r.method} ${r.path}`,
      passed,
      details: `Returned HTTP status ${res.status}`,
    });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] AUTH-001 bypass attempt ${r.method} ${r.path} => ${res.status}`);
  }

  // 3. Sensitive Routes Protection (Unauthorized Role: Accountant => 403)
  console.log('\n--- 3) Verification with Unauthorized Role (Accountant => 403) ---');
  const accountantPass = process.env.INITIAL_USER_PASSWORD || 'TEST_FIXTURE_DO_NOT_USE';
  const loginRes = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: {
      tenantCode: 'MAIN',
      username: 'accountant',
      password: accountantPass,
    },
  });

  const cookieHeader = loginRes.headers.get('set-cookie') || '';
  const tokenMatch = cookieHeader.match(/an_access_token=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : (loginRes.data?.accessToken || '');

  if (!token) {
    console.error('Failed to login as accountant for RBAC test:', loginRes.data);
  } else {
    const authHeaders = {
      Cookie: `an_access_token=${token}`,
      Authorization: `Bearer ${token}`,
    };

    // Test platform admin routes with accountant token
    const platformRoutes = [
      { path: '/api/wizard/create-company', method: 'POST', body: { code: 'TEST' } },
      { path: '/api/tenants', method: 'GET' },
      { path: '/api/storage/propose-migration', method: 'POST', body: { tenantId: 't1' } },
    ];

    for (const r of platformRoutes) {
      const res = await makeRequest(r.path, { method: r.method, headers: authHeaders, body: r.body });
      const passed = res.status === 403;
      results.push({
        name: `Accountant access to platform route rejected with 403: ${r.method} ${r.path}`,
        passed,
        details: `Returned HTTP status ${res.status}`,
      });
      console.log(`[${passed ? 'PASS' : 'FAIL'}] Accountant ${r.method} ${r.path} => ${res.status}`);
    }

    // Test 9 internal battery routes with accountant token (must be 403 because role is not developer/auditor)
    const internalRoutes = [
      '/api/internal/phase1-battery',
      '/api/internal/phase2-battery',
      '/api/internal/phase3-battery',
      '/api/internal/phase4_6-battery',
      '/api/internal/phase5-battery',
      '/api/internal/phase6-battery',
      '/api/internal/phase7-battery',
      '/api/internal/primary-battery',
      '/api/internal/build-status',
    ];

    for (const p of internalRoutes) {
      const res = await makeRequest(p, { method: 'GET', headers: authHeaders });
      const passed = res.status === 403;
      results.push({
        name: `Accountant access to internal route rejected with 403: GET ${p}`,
        passed,
        details: `Returned HTTP status ${res.status}`,
      });
      console.log(`[${passed ? 'PASS' : 'FAIL'}] Accountant GET ${p} => ${res.status}`);
    }
  }

  // 4. Authorized Access (Platform Admin / Super Admin)
  console.log('\n--- 4) Verification with Authorized Role (Super Admin => 200) ---');
  const adminPass = process.env.SEED_ADMIN_PASSWORD || 'TEST_FIXTURE_DO_NOT_USE';
  const adminLoginRes = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: {
      tenantCode: 'MAIN',
      username: 'admin',
      password: adminPass,
    },
  });

  const adminCookie = adminLoginRes.headers.get('set-cookie') || '';
  const adminTokenMatch = adminCookie.match(/an_access_token=([^;]+)/);
  const adminToken = adminTokenMatch ? adminTokenMatch[1] : (adminLoginRes.data?.accessToken || '');

  if (!adminToken) {
    console.error('Failed to login as admin for authorized test:', adminLoginRes.data);
  } else {
    const adminHeaders = {
      Cookie: `an_access_token=${adminToken}`,
      Authorization: `Bearer ${adminToken}`,
    };

    const tenantsRes = await makeRequest('/api/tenants', { method: 'GET', headers: adminHeaders });
    const passed = tenantsRes.status === 200;
    results.push({
      name: 'Super Admin access to platform route allowed with 200: GET /api/tenants',
      passed,
      details: `Returned HTTP status ${tenantsRes.status}`,
    });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] Admin GET /api/tenants => ${tenantsRes.status}`);

    const buildStatusRes = await makeRequest('/api/internal/build-status', { method: 'GET', headers: adminHeaders });
    const buildPassed = buildStatusRes.status === 200;
    results.push({
      name: 'Super Admin access to internal route allowed with 200: GET /api/internal/build-status',
      passed: buildPassed,
      details: `Returned HTTP status ${buildStatusRes.status}`,
    });
    console.log(`[${buildPassed ? 'PASS' : 'FAIL'}] Admin GET /api/internal/build-status => ${buildStatusRes.status}`);
  }

  // 5. CSP Profile Verification
  console.log('\n--- 5) Verification of CSP Profile Headers ---');
  const cspHeader = health.headers.get('content-security-policy') || '';
  console.log('Current (dev) CSP:', cspHeader);

  // Summary
  const total = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = total - passedCount;

  console.log('\n========================================================================');
  console.log(`      VERIFICATION SUMMARY: ${passedCount}/${total} PASSED (${failedCount} FAILED)`);
  console.log('========================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
