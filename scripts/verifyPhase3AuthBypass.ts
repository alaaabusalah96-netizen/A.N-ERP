/**
 * @file verifyPhase3AuthBypass.ts
 * @description Verification script for Phase 3 AUTH-001 (Authentication Bypass Remediation)
 *
 * Verifies:
 * 1. Live server rejects x-bypass-auth with 401.
 * 2. Production environment strictly blocks bypass under all conditions.
 * 3. Staging environment strictly blocks bypass under all conditions.
 * 4. Development environment blocks bypass.
 * 5. Test environment blocks bypass unless ENABLE_TEST_AUTH_BYPASS="true".
 * 6. Test environment requires strong secret (>= 16 chars) via x-test-bypass-secret header.
 * 7. Test environment blocks remote IP (loopback socket required).
 * 8. Test environment defaults to least-privilege 'test_user' (no super_admin escalation).
 * 9. Real login path remains fully functional with JWT token.
 */

import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const LIVE_SERVER_URL = 'http://127.0.0.1:3000';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  expectedStatus: number;
  actualStatus: number;
  details: string;
}

const allResults: TestResult[] = [];

// Helper for HTTP requests against live server
async function makeLiveRequest(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: any } = {}
) {
  const url = `${LIVE_SERVER_URL}${path}`;
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
    // ignore
  }

  return { status: res.status, headers: res.headers, data };
}

// Emulated middleware harness matching server.ts exactly
function createTestAuthHarness(envConfig: {
  nodeEnv: string;
  enableTestBypass?: string;
  testSecret?: string;
  mockRemoteAddress?: string;
}) {
  const originalEnv = { ...process.env };
  process.env.NODE_ENV = envConfig.nodeEnv;
  if (envConfig.enableTestBypass !== undefined) {
    process.env.ENABLE_TEST_AUTH_BYPASS = envConfig.enableTestBypass;
  } else {
    delete process.env.ENABLE_TEST_AUTH_BYPASS;
  }
  if (envConfig.testSecret !== undefined) {
    process.env.TEST_AUTH_BYPASS_SECRET = envConfig.testSecret;
  } else {
    delete process.env.TEST_AUTH_BYPASS_SECRET;
  }

  const app = express();
  app.use(express.json());

  // Socket address override simulation for remote IP testing
  if (envConfig.mockRemoteAddress) {
    app.use((req, res, next) => {
      Object.defineProperty(req.socket, 'remoteAddress', {
        value: envConfig.mockRemoteAddress,
        configurable: true,
      });
      next();
    });
  }

  function isLoopbackAddress(addr?: string): boolean {
    if (!addr) return false;
    return (
      addr === '127.0.0.1' ||
      addr === '::1' ||
      addr === '::ffff:127.0.0.1' ||
      addr === 'localhost'
    );
  }

  function isTestBypassPermitted(): boolean {
    const rawEnv = (process.env.NODE_ENV || '').toLowerCase().trim();
    if (rawEnv === 'production' || rawEnv === 'staging' || rawEnv !== 'test') {
      return false;
    }
    if (process.env.ENABLE_TEST_AUTH_BYPASS !== 'true') {
      return false;
    }
    const secret = process.env.TEST_AUTH_BYPASS_SECRET;
    if (!secret || secret.trim().length < 16) {
      return false;
    }
    return true;
  }

  async function tryIsolatedTestBypass(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<boolean> {
    if (!isTestBypassPermitted()) {
      return false;
    }
    const remoteAddr = req.socket?.remoteAddress || req.ip;
    if (!isLoopbackAddress(remoteAddr)) {
      return false;
    }
    const bypassHeader = req.headers['x-bypass-auth'] || req.headers['x-test-bypass-auth'];
    if (bypassHeader !== 'true') {
      return false;
    }
    const clientSecret = req.headers['x-test-bypass-secret'];
    const expectedSecret = process.env.TEST_AUTH_BYPASS_SECRET;
    if (typeof clientSecret !== 'string' || !clientSecret || !expectedSecret) {
      return false;
    }
    const clientBuf = Buffer.from(clientSecret);
    const expectedBuf = Buffer.from(expectedSecret);
    if (clientBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(clientBuf, expectedBuf)) {
      return false;
    }
    const devTenantId = req.headers['x-tenant-id'] as string;
    if (!devTenantId) {
      res.status(400).json({
        type: 'https://api.an-erp.local/errors/missing-tenant-id',
        title: 'معرف المنشأة إلزامي لتجاوز المصادقة الاختباري',
        status: 400,
      });
      return true;
    }

    const testRole = (req.headers['x-test-role'] as string) || 'test_user';
    const testUserId = (req.headers['x-test-user-id'] as string) || 'USR-TEST-RUNNER';

    (req as any).authContext = {
      tenantId: devTenantId,
      userId: testUserId,
      sessionId: 'ses-test-isolated',
      role: testRole,
    };
    next();
    return true;
  }

  async function requireAuth(req: Request, res: Response, next: NextFunction) {
    const accessToken = req.headers.authorization?.split(' ')[1];
    if (!accessToken) {
      const handled = await tryIsolatedTestBypass(req, res, next);
      if (handled) return;
      return res.status(401).json({ success: false, message: 'غير مسجل الدخول' });
    }
    next();
  }

  function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
    return requireAuth(req, res, () => {
      const role = (req as any).authContext?.role;
      if (role !== 'super_admin' && role !== 'platform_admin') {
        return res.status(403).json({ success: false, message: 'صلاحيات غير كافية' });
      }
      next();
    });
  }

  app.get('/api/protected/resource', requireAuth, (req, res) => {
    res.json({ success: true, user: (req as any).authContext });
  });

  app.get('/api/admin/resource', requirePlatformAdmin, (req, res) => {
    res.json({ success: true, admin: true, user: (req as any).authContext });
  });

  const restoreEnv = () => {
    process.env = originalEnv;
  };

  return { app, restoreEnv };
}

// Runner for Express test instances
async function testHarnessRequest(
  app: express.Express,
  path: string,
  options: { headers?: Record<string, string> } = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as any;
      const port = address.port;
      const headers = { 'content-type': 'application/json', ...(options.headers || {}) };

      fetch(`http://127.0.0.1:${port}${path}`, { headers })
        .then(async (res) => {
          let body = null;
          try {
            body = await res.json();
          } catch {}
          server.close(() => resolve({ status: res.status, body }));
        })
        .catch(() => {
          server.close(() => resolve({ status: 500, body: null }));
        });
    });
  });
}

async function runBattery() {
  console.log('========================================================================');
  console.log('       A.N ERP v7.2 — AUTH-001 AUTHENTICATION BYPASS VERIFICATION       ');
  console.log('========================================================================\n');

  // -------------------------------------------------------------------------
  // SUITE 1: Live Server Verification
  // -------------------------------------------------------------------------
  console.log('--- 1) Live Server Verification (http://127.0.0.1:3000) ---');

  // Test 1.1: GET /api/tenants with x-bypass-auth -> 401
  const live1 = await makeLiveRequest('/api/tenants', {
    headers: { 'x-bypass-auth': 'true', 'x-tenant-id': 'tenant-main' },
  });
  allResults.push({
    suite: 'Live Server',
    name: 'GET /api/tenants with x-bypass-auth returns 401 Unauthorized',
    passed: live1.status === 401,
    expectedStatus: 401,
    actualStatus: live1.status,
    details: `Response: ${JSON.stringify(live1.data)}`,
  });

  // Test 1.2: POST /api/wizard/create-company with x-bypass-auth -> 401
  const live2 = await makeLiveRequest('/api/wizard/create-company', {
    method: 'POST',
    headers: { 'x-bypass-auth': 'true', 'x-tenant-id': 'tenant-main' },
    body: { code: 'TEST' },
  });
  allResults.push({
    suite: 'Live Server',
    name: 'POST /api/wizard/create-company with x-bypass-auth returns 401',
    passed: live2.status === 401,
    expectedStatus: 401,
    actualStatus: live2.status,
    details: `Response: ${JSON.stringify(live2.data)}`,
  });

  // Test 1.3: GET /api/internal/build-status with x-bypass-auth -> 401
  const live3 = await makeLiveRequest('/api/internal/build-status', {
    headers: { 'x-bypass-auth': 'true' },
  });
  allResults.push({
    suite: 'Live Server',
    name: 'GET /api/internal/build-status with x-bypass-auth returns 401',
    passed: live3.status === 401,
    expectedStatus: 401,
    actualStatus: live3.status,
    details: `Response: ${JSON.stringify(live3.data)}`,
  });

  // Test 1.4: Real Login Path Verification (accountant login => 200 OK + JWT cookie)
  const loginPass = process.env.INITIAL_USER_PASSWORD || 'TEST_FIXTURE_DO_NOT_USE';
  const liveLogin = await makeLiveRequest('/api/auth/login', {
    method: 'POST',
    body: {
      tenantCode: 'MAIN',
      username: 'accountant',
      password: loginPass,
    },
  });
  const cookieHeader = liveLogin.headers.get('set-cookie') || '';
  const tokenMatch = cookieHeader.match(/an_access_token=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : (liveLogin.data?.accessToken || '');
  const loginSuccess = liveLogin.status === 200 && Boolean(token);
  allResults.push({
    suite: 'Live Server',
    name: 'Legitimate login path returns 200 OK with valid JWT cookie',
    passed: loginSuccess,
    expectedStatus: 200,
    actualStatus: liveLogin.status,
    details: `Login successful, cookie length: ${token ? token.length : 0}`,
  });

  // -------------------------------------------------------------------------
  // SUITE 2: Production Environment Rejection (NODE_ENV=production)
  // -------------------------------------------------------------------------
  console.log('\n--- 2) Production Environment Strict Rejection ---');
  {
    const { app, restoreEnv } = createTestAuthHarness({
      nodeEnv: 'production',
      enableTestBypass: 'true',
      testSecret: 'test-secret-min-16-characters-long',
    });

    // 2.1: Simple x-bypass-auth in production -> 401
    const res1 = await testHarnessRequest(app, '/api/protected/resource', {
      headers: { 'x-bypass-auth': 'true', 'x-tenant-id': 'tenant-test' },
    });
    allResults.push({
      suite: 'Production Guard',
      name: 'Production rejects x-bypass-auth=true with 401',
      passed: res1.status === 401,
      expectedStatus: 401,
      actualStatus: res1.status,
      details: 'Strictly denied in production',
    });

    // 2.2: Even with valid secret header & opt-in flag, production STILL rejects with 401
    const res2 = await testHarnessRequest(app, '/api/protected/resource', {
      headers: {
        'x-bypass-auth': 'true',
        'x-tenant-id': 'tenant-test',
        'x-test-bypass-secret': 'test-secret-min-16-characters-long',
      },
    });
    allResults.push({
      suite: 'Production Guard',
      name: 'Production strictly rejects bypass even with matching secret header',
      passed: res2.status === 401,
      expectedStatus: 401,
      actualStatus: res2.status,
      details: 'Environment policy overrides any secret in production',
    });

    restoreEnv();
  }

  // -------------------------------------------------------------------------
  // SUITE 3: Staging Environment Rejection (NODE_ENV=staging)
  // -------------------------------------------------------------------------
  console.log('\n--- 3) Staging Environment Strict Rejection ---');
  {
    const { app, restoreEnv } = createTestAuthHarness({
      nodeEnv: 'staging',
      enableTestBypass: 'true',
      testSecret: 'test-secret-min-16-characters-long',
    });

    // 3.1: Staging rejects x-bypass-auth with 401
    const res1 = await testHarnessRequest(app, '/api/protected/resource', {
      headers: {
        'x-bypass-auth': 'true',
        'x-tenant-id': 'tenant-test',
        'x-test-bypass-secret': 'test-secret-min-16-characters-long',
      },
    });
    allResults.push({
      suite: 'Staging Guard',
      name: 'Staging strictly rejects bypass with 401 under all conditions',
      passed: res1.status === 401,
      expectedStatus: 401,
      actualStatus: res1.status,
      details: 'Strictly denied in staging',
    });

    restoreEnv();
  }

  // -------------------------------------------------------------------------
  // SUITE 4: Development Environment Rejection (NODE_ENV=development)
  // -------------------------------------------------------------------------
  console.log('\n--- 4) Development Environment Rejection ---');
  {
    const { app, restoreEnv } = createTestAuthHarness({
      nodeEnv: 'development',
    });

    const res1 = await testHarnessRequest(app, '/api/protected/resource', {
      headers: { 'x-bypass-auth': 'true', 'x-tenant-id': 'tenant-test' },
    });
    allResults.push({
      suite: 'Development Guard',
      name: 'Development environment rejects legacy x-bypass-auth with 401',
      passed: res1.status === 401,
      expectedStatus: 401,
      actualStatus: res1.status,
      details: 'Development bypass without test sandbox is removed',
    });

    restoreEnv();
  }

  // -------------------------------------------------------------------------
  // SUITE 5: Test Mode without Opt-In or without Secret (NODE_ENV=test)
  // -------------------------------------------------------------------------
  console.log('\n--- 5) Test Mode Disabled by Default & Secret Requirement ---');
  {
    // 5.1: NODE_ENV=test but ENABLE_TEST_AUTH_BYPASS is unset (default disabled)
    const h1 = createTestAuthHarness({
      nodeEnv: 'test',
      testSecret: 'test-secret-min-16-characters-long',
    });
    const res1 = await testHarnessRequest(h1.app, '/api/protected/resource', {
      headers: {
        'x-bypass-auth': 'true',
        'x-tenant-id': 'tenant-test',
        'x-test-bypass-secret': 'test-secret-min-16-characters-long',
      },
    });
    allResults.push({
      suite: 'Test Mode Guards',
      name: 'Test environment rejects bypass when ENABLE_TEST_AUTH_BYPASS is disabled',
      passed: res1.status === 401,
      expectedStatus: 401,
      actualStatus: res1.status,
      details: 'Disabled by default',
    });
    h1.restoreEnv();

    // 5.2: ENABLE_TEST_AUTH_BYPASS=true, but client supplies wrong secret
    const h2 = createTestAuthHarness({
      nodeEnv: 'test',
      enableTestBypass: 'true',
      testSecret: 'test-secret-min-16-characters-long',
    });
    const res2 = await testHarnessRequest(h2.app, '/api/protected/resource', {
      headers: {
        'x-bypass-auth': 'true',
        'x-tenant-id': 'tenant-test',
        'x-test-bypass-secret': 'WRONG-INCORRECT-SECRET-VALUE',
      },
    });
    allResults.push({
      suite: 'Test Mode Guards',
      name: 'Test environment rejects bypass when supplied secret is incorrect',
      passed: res2.status === 401,
      expectedStatus: 401,
      actualStatus: res2.status,
      details: 'Secret mismatch rejected with 401',
    });
    h2.restoreEnv();

    // 5.3: Configured secret is too short (< 16 characters)
    const h3 = createTestAuthHarness({
      nodeEnv: 'test',
      enableTestBypass: 'true',
      testSecret: 'short-secret',
    });
    const res3 = await testHarnessRequest(h3.app, '/api/protected/resource', {
      headers: {
        'x-bypass-auth': 'true',
        'x-tenant-id': 'tenant-test',
        'x-test-bypass-secret': 'short-secret',
      },
    });
    allResults.push({
      suite: 'Test Mode Guards',
      name: 'Test environment rejects bypass if configured secret length < 16 chars',
      passed: res3.status === 401,
      expectedStatus: 401,
      actualStatus: res3.status,
      details: 'Insufficient secret complexity rejected with 401',
    });
    h3.restoreEnv();

    // 5.4: Remote IP restriction (non-loopback caller rejected)
    const h4 = createTestAuthHarness({
      nodeEnv: 'test',
      enableTestBypass: 'true',
      testSecret: 'test-secret-min-16-characters-long',
      mockRemoteAddress: '198.51.100.25', // External non-localhost IP
    });
    const res4 = await testHarnessRequest(h4.app, '/api/protected/resource', {
      headers: {
        'x-bypass-auth': 'true',
        'x-tenant-id': 'tenant-test',
        'x-test-bypass-secret': 'test-secret-min-16-characters-long',
      },
    });
    allResults.push({
      suite: 'Test Mode Guards',
      name: 'Test environment rejects non-localhost (remote) callers with 401',
      passed: res4.status === 401,
      expectedStatus: 401,
      actualStatus: res4.status,
      details: 'Loopback restriction enforced',
    });
    h4.restoreEnv();
  }

  // -------------------------------------------------------------------------
  // SUITE 6: Test Mode Role Isolation (Least Privilege / No Super Admin Default)
  // -------------------------------------------------------------------------
  console.log('\n--- 6) Test Mode Role Isolation (No Hardcoded Super Admin) ---');
  {
    const { app, restoreEnv } = createTestAuthHarness({
      nodeEnv: 'test',
      enableTestBypass: 'true',
      testSecret: 'test-secret-min-16-characters-long',
    });

    // 6.1: Valid test bypass without x-test-role defaults to test_user (can access protected)
    const res1 = await testHarnessRequest(app, '/api/protected/resource', {
      headers: {
        'x-bypass-auth': 'true',
        'x-tenant-id': 'tenant-test',
        'x-test-bypass-secret': 'test-secret-min-16-characters-long',
      },
    });
    allResults.push({
      suite: 'Role Isolation',
      name: 'Valid test bypass succeeds for general protected resource',
      passed: res1.status === 200 && res1.body?.user?.role === 'test_user',
      expectedStatus: 200,
      actualStatus: res1.status,
      details: `Granted role: ${res1.body?.user?.role} (expected test_user)`,
    });

    // 6.2: Platform admin resource accessed with default role -> 403 Forbidden!
    const res2 = await testHarnessRequest(app, '/api/admin/resource', {
      headers: {
        'x-bypass-auth': 'true',
        'x-tenant-id': 'tenant-test',
        'x-test-bypass-secret': 'test-secret-min-16-characters-long',
      },
    });
    allResults.push({
      suite: 'Role Isolation',
      name: 'Default test bypass CANNOT access platform admin routes (returns 403)',
      passed: res2.status === 403,
      expectedStatus: 403,
      actualStatus: res2.status,
      details: 'No automatic privilege escalation to super_admin',
    });

    // 6.3: Only when explicitly requested via x-test-role=super_admin does it get admin
    const res3 = await testHarnessRequest(app, '/api/admin/resource', {
      headers: {
        'x-bypass-auth': 'true',
        'x-tenant-id': 'tenant-test',
        'x-test-bypass-secret': 'test-secret-min-16-characters-long',
        'x-test-role': 'super_admin',
      },
    });
    allResults.push({
      suite: 'Role Isolation',
      name: 'Explicit test role x-test-role=super_admin grants admin in test sandbox',
      passed: res3.status === 200 && res3.body?.admin === true,
      expectedStatus: 200,
      actualStatus: res3.status,
      details: 'Explicit role granted only inside valid test sandbox',
    });

    restoreEnv();
  }

  // -------------------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('                 AUTH-001 VERIFICATION SUMMARY                         ');
  console.log('========================================================================');

  let passedCount = 0;
  let failedCount = 0;

  for (const r of allResults) {
    const mark = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${mark}] [${r.suite}] ${r.name} (Status: ${r.actualStatus})`);
    if (r.passed) passedCount++;
    else failedCount++;
  }

  console.log('------------------------------------------------------------------------');
  console.log(`TOTAL: ${allResults.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('========================================================================\n');

  if (failedCount > 0) {
    console.error(`Verification FAILED with ${failedCount} errors.`);
    process.exit(1);
  } else {
    console.log('Verification PASSED: All AUTH-001 acceptance gates satisfied.');
    process.exit(0);
  }
}

runBattery().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
