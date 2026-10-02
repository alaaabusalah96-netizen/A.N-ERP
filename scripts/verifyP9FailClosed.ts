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

  console.log('=== ALL P9 TESTS PASSED ===');
}

main().catch((err) => {
  console.error('FATAL P9 TEST FAILURE:', err);
  process.exit(1);
});
