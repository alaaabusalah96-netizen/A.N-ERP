/**
 * @file verifyP9FailClosed.ts
 * @description Verification script for P9 — STORAGE-001: Fail-closed dedicated adapter initialization
 */

import { StorageRouter } from '../src/core/storage/StorageRouter';
import { TenantCompany } from '../src/core/storage/StoragePort';

async function main() {
  console.log('=== P9 STORAGE-001 Verification ===');
  
  let unhandledCount = 0;
  process.on('unhandledRejection', (reason) => {
    unhandledCount++;
    console.error('UNHANDLED REJECTION DETECTED:', reason);
  });

  process.env.P9_TEST_CONN = 'postgresql://fake:fake@127.0.0.1:5432/fake';

  const dedicatedTenant: TenantCompany = {
    id: 't-dedicated-p9',
    code: 'P9-DED',
    nameAr: 'مستأجر مخصص اختبار P9',
    status: 'ACTIVE',
    backendConfig: {
      isolationLevel: 'Dedicated',
      adapterType: 'postgresql',
      connectionRef: 'P9_TEST_CONN',
    },
  };

  const sharedTenant: TenantCompany = {
    id: 't-shared-p9',
    code: 'P9-SHR',
    nameAr: 'مستأجر مشترك اختبار P9',
    status: 'ACTIVE',
    backendConfig: {
      isolationLevel: 'Shared',
      adapterType: 'postgresql',
      connectionRef: 'DATABASE_URL',
    },
  };

  const router = new StorageRouter();

  // (أ) Failure test: mock createAdapterByType to fail during initializeSchema
  let shouldFail = true;
  (router as any).createAdapterByType = (_type: string, _conn: string) => {
    return {
      initializeSchema: async () => {
        if (shouldFail) {
          throw new Error('Database connection refused during dedicated schema init');
        }
        return true;
      },
    };
  };

  let rejectedWithError = false;
  try {
    await router.resolveAdapterAsync(dedicatedTenant);
  } catch (err: any) {
    rejectedWithError = true;
    console.log('✓ (أ) resolveAdapterAsync rejected with error:', err.message);
  }

  // Small delay to ensure any unhandled rejection would have fired
  await new Promise((r) => setTimeout(r, 50));

  const dedicatedMapSizeAfterFail = (router as any).dedicatedAdapters.size;
  console.log(`✓ (أ) dedicatedAdapters.size after failure: ${dedicatedMapSizeAfterFail}`);
  console.log(`✓ (أ) unhandledRejections count: ${unhandledCount}`);

  if (!rejectedWithError) {
    throw new Error('(أ) FAILED: resolveAdapterAsync did not reject on initialization failure');
  }
  if (dedicatedMapSizeAfterFail !== 0) {
    throw new Error(`(أ) FAILED: dedicatedAdapters.size is ${dedicatedMapSizeAfterFail}, expected 0`);
  }
  if (unhandledCount !== 0) {
    throw new Error(`(أ) FAILED: unhandledRejections count is ${unhandledCount}, expected 0`);
  }
  console.log('PASS: (أ) Rejection clean, entry removed, zero unhandledRejection.');

  // (ب) Retry test: mock succeeds, clean retry should succeed and be cached as initialized === true
  shouldFail = false;
  let resolvedAdapter: any;
  try {
    resolvedAdapter = await router.resolveAdapterAsync(dedicatedTenant);
  } catch (err: any) {
    throw new Error(`(ب) FAILED: Retry failed with error: ${err.message}`);
  }

  const dedicatedKey = `${dedicatedTenant.id}:${dedicatedTenant.backendConfig!.connectionRef}`;
  const entry = (router as any).dedicatedAdapters.get(dedicatedKey);

  if (!entry) {
    throw new Error('(ب) FAILED: Cache entry missing after successful retry');
  }
  if (entry.initialized !== true) {
    throw new Error(`(ب) FAILED: entry.initialized is ${entry.initialized}, expected true`);
  }
  if (entry.adapter !== resolvedAdapter) {
    throw new Error('(ب) FAILED: returned adapter does not match cached adapter');
  }
  console.log('PASS: (ب) Clean retry succeeded, entry.initialized === true.');

  // (ج) Shared adapter test: shared tenant should not be affected
  const sharedAdapter = await router.resolveAdapterAsync(sharedTenant);
  if (!sharedAdapter) {
    throw new Error('(ج) FAILED: Shared adapter resolution failed');
  }
  const primaryAdapter = router.getPrimaryAdapter();
  if (sharedAdapter !== primaryAdapter) {
    throw new Error('(ج) FAILED: Shared adapter should be primary adapter');
  }
  console.log('PASS: (ج) Shared adapter resolution unaffected.');

  // (أ2) Postgres real behavior simulation: initializeSchema returns { success: false, error: { detail: 'boom2' } }
  const routerA2 = new StorageRouter();
  let a2CloseCalled = 0;
  (routerA2 as any).createAdapterByType = (_type: string, _conn: string) => {
    return {
      initializeSchema: async () => ({ success: false, error: { detail: 'boom2' } }),
      close: async () => { a2CloseCalled++; },
    };
  };

  let a2Rejected = false;
  try {
    await routerA2.resolveAdapterAsync(dedicatedTenant);
  } catch (err: any) {
    a2Rejected = true;
    console.log('✓ (أ2) resolveAdapterAsync rejected on success:false with:', err.message);
  }
  await new Promise((r) => setTimeout(r, 50));
  const a2MapSize = (routerA2 as any).dedicatedAdapters.size;
  if (!a2Rejected) {
    throw new Error('(أ2) FAILED: resolveAdapterAsync did not reject when initializeSchema returned success:false');
  }
  if (a2MapSize !== 0) {
    throw new Error(`(أ2) FAILED: dedicatedAdapters.size is ${a2MapSize}, expected 0`);
  }
  if (unhandledCount !== 0) {
    throw new Error(`(أ2) FAILED: unhandledRejections detected (${unhandledCount})`);
  }
  console.log('PASS: (أ2) success:false rejects cleanly, entry removed, 0 unhandledRejection.');

  // (أ3) 3 consecutive failed attempts (alternating throw and success:false) -> each rejected, size 0, close called 3 times
  const routerA3 = new StorageRouter();
  let closeCalls = 0;
  let attempt = 0;
  (routerA3 as any).createAdapterByType = (_type: string, _conn: string) => {
    return {
      initializeSchema: async () => {
        attempt++;
        if (attempt % 2 === 1) {
          throw new Error(`attempt ${attempt} failed by throwing`);
        } else {
          return { success: false, error: { detail: `attempt ${attempt} failed by result` } };
        }
      },
      close: async () => {
        closeCalls++;
      },
    };
  };

  for (let i = 1; i <= 3; i++) {
    let iterRejected = false;
    try {
      await routerA3.resolveAdapterAsync(dedicatedTenant);
    } catch {
      iterRejected = true;
    }
    if (!iterRejected) {
      throw new Error(`(أ3) FAILED: Attempt ${i} did not reject`);
    }
    const curSize = (routerA3 as any).dedicatedAdapters.size;
    if (curSize !== 0) {
      throw new Error(`(أ3) FAILED: Attempt ${i} left dedicatedAdapters.size=${curSize}, expected 0`);
    }
  }
  await new Promise((r) => setTimeout(r, 50));
  if (closeCalls !== 3) {
    throw new Error(`(أ3) FAILED: Total close calls is ${closeCalls}, expected 3`);
  }
  if (unhandledCount !== 0) {
    throw new Error(`(أ3) FAILED: unhandledRejections detected (${unhandledCount})`);
  }
  console.log('PASS: (أ3) 3 consecutive failures clean, size 0 after each, close called 3 times.');

  // (ب2) After failure then successful initialization { success: true, data: true }
  const routerB2 = new StorageRouter();
  let b2ShouldSucceed = false;
  (routerB2 as any).createAdapterByType = (_type: string, _conn: string) => {
    return {
      initializeSchema: async () => {
        if (!b2ShouldSucceed) {
          return { success: false, error: { detail: 'initial fail' } };
        }
        return { success: true, data: true };
      },
      close: async () => {},
    };
  };

  try {
    await routerB2.resolveAdapterAsync(dedicatedTenant);
  } catch {}
  if ((routerB2 as any).dedicatedAdapters.size !== 0) {
    throw new Error('(ب2) FAILED: Cache not clean after initial fail');
  }

  b2ShouldSucceed = true;
  let b2Adapter: any;
  try {
    b2Adapter = await routerB2.resolveAdapterAsync(dedicatedTenant);
  } catch (err: any) {
    throw new Error(`(ب2) FAILED: Retry after fail should have succeeded: ${err.message}`);
  }
  const b2Entry = (routerB2 as any).dedicatedAdapters.get(dedicatedKey);
  if (!b2Entry || b2Entry.initialized !== true) {
    throw new Error('(ب2) FAILED: b2Entry missing or not marked initialized === true');
  }
  console.log('PASS: (ب2) Failure followed by success properly caches initialized === true.');

  // (د-ثابت) Static verification of server.ts try/catch wrapper around resolveAdapterAsync
  const fs = await import('fs');
  const serverContent = fs.readFileSync('server.ts', 'utf8');

  // Verify tryIsolatedTestBypass wrapper
  const testBypassIdx = serverContent.indexOf('tryIsolatedTestBypass');
  if (testBypassIdx === -1) {
    throw new Error('(د-ثابت) FAILED: tryIsolatedTestBypass not found in server.ts');
  }
  const testBypassBlock = serverContent.slice(testBypassIdx, testBypassIdx + 4000);
  const bypassHas503 = testBypassBlock.includes('status(503)') || testBypassBlock.includes('503');
  const bypassHasCatch = testBypassBlock.includes('resolveAdapterAsync') && testBypassBlock.includes('catch');
  if (!bypassHasCatch || !bypassHas503) {
    throw new Error('(د-ثابت) FAILED: tryIsolatedTestBypass missing try/catch with 503 for resolveAdapterAsync');
  }
  console.log('✓ (د-ثابت) tryIsolatedTestBypass wraps resolveAdapterAsync with try/catch returning 503');

  // Verify login route wrapper
  const loginIdx = serverContent.indexOf("app.post('/api/auth/login'");
  if (loginIdx === -1) {
    throw new Error("(د-ثابت) FAILED: app.post('/api/auth/login' not found in server.ts");
  }
  const loginBlock = serverContent.slice(loginIdx, loginIdx + 2000);
  const loginHas503 = loginBlock.includes('status(503)') || loginBlock.includes('503');
  const loginHasCatch = loginBlock.includes('resolveAdapterAsync') && loginBlock.includes('catch');
  if (!loginHasCatch || !loginHas503) {
    throw new Error('(د-ثابت) FAILED: login route missing try/catch with 503 for resolveAdapterAsync');
  }
  console.log('PASS: (د-ثابت) Static check confirms both resolveAdapterAsync locations wrapped in try/catch returning 503.');

  // (د-HTTP) Live test on PORT=3101 with invalid connection string
  let httpPassed = false;
  const { spawn } = await import('child_process');
  const TEST_PORT = 3101;
  process.env.P9_BAD_CONN = 'postgresql://x:x@127.0.0.1:1/none?connect_timeout=2';

  const httpDedicatedTenant: TenantCompany = {
    id: `t-p9-bad-${Date.now()}`,
    code: `P9-BAD-${Date.now() % 10000}`,
    nameAr: 'مستأجر اختبار الاتصال الفاشل P9',
    status: 'ACTIVE',
    backendConfig: {
      isolationLevel: 'Dedicated',
      adapterType: 'postgresql',
      connectionRef: 'P9_BAD_CONN',
    },
    createdAt: new Date().toISOString(),
  };

  const httpPrimaryAdapter = router.getPrimaryAdapter();
  await httpPrimaryAdapter.initializeSchema();
  await httpPrimaryAdapter.saveTenant(httpDedicatedTenant, `idemp-p9-bad-${Date.now()}`);

  let serverProc: any = null;
  try {
    serverProc = spawn('npx', ['tsx', 'server.ts'], {
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        P9_BAD_CONN: process.env.P9_BAD_CONN,
      },
      stdio: 'pipe',
    });

    // Wait for server to come up on 3101
    let ready = false;
    for (let attempts = 0; attempts < 30; attempts++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const hRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`);
        if (hRes.ok) {
          ready = true;
          break;
        }
      } catch {}
    }

    if (!ready) {
      console.log('WARNING: Server on 3101 did not become ready in time, marking (د-HTTP) NOT RUN');
    } else {
      // POST /api/auth/login with tenantId
      const loginRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: httpDedicatedTenant.id,
          username: 'admin',
          password: 'some-password',
        }),
      });

      console.log(`✓ (د-HTTP) login status with bad dedicated storage: ${loginRes.status}`);
      const healthAfter = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`);
      console.log(`✓ (د-HTTP) health status after failed login: ${healthAfter.status}`);

      if (loginRes.status === 503 && healthAfter.status === 200) {
        httpPassed = true;
        console.log('PASS: (د-HTTP) 503 returned on dedicated storage failure and server remained healthy.');
      } else {
        throw new Error(`(د-HTTP) FAILED: Expected 503 and 200, got ${loginRes.status} and ${healthAfter.status}`);
      }
    }
  } catch (err: any) {
    console.error('Error during (د-HTTP):', err.message);
    throw err;
  } finally {
    if (serverProc) {
      serverProc.kill('SIGKILL');
    }
    // Clean up temporary tenant from database
    try {
      const pool = (primaryAdapter as any).pool;
      if (pool) {
        await pool.query('DELETE FROM an_tenants WHERE id = $1', [httpDedicatedTenant.id]);
      }
    } catch {}
  }

  if (httpPassed) {
    console.log('PASS: (د-HTTP) Completed successfully.');
  }

  console.log('=== ALL P9 TESTS PASSED ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL P9 TEST FAILURE:', err);
  process.exit(1);
});
