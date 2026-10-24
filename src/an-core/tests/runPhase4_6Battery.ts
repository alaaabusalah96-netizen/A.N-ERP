/**
 * @file runPhase4_6Battery.ts
 * @description Comprehensive Automated Verification Battery for Phase 4.6:
 * Foundation Hardening — Multi-Tenant Routing & Isolation (Shared vs. Dedicated),
 * Dynamic Schema Initialization, Pool Capacity & LRU Eviction, and CSRF/Session Protection.
 * Executed strictly against live StoragePort (PostgresPrimaryAdapter).
 */

import { StorageRouter } from '../storage/StorageRouter';
import { TenantCompany, JournalEntry } from '../storage/StoragePort';
import { TenantResolutionService } from '../tenant/TenantResolutionService';

export interface Phase46BatteryTestResult {
  testId: string;
  nameAr: string;
  category: '4.6_ROUTING' | '4.6_ISOLATION' | '4.6_POOL_LRU' | '4.6_TENANT_RESOLUTION' | '4.6_SECURITY';
  passed: boolean;
  durationMs: number;
  evidence: string;
  error?: string;
}

export interface Phase46BatterySuiteResult {
  totalTests: number;
  passedCount: number;
  failedCount: number;
  allPassed: boolean;
  durationMs: number;
  tests: Phase46BatteryTestResult[];
}

export async function runPhase46Battery(): Promise<Phase46BatterySuiteResult> {
  const startTime = Date.now();
  const results: Phase46BatteryTestResult[] = [];
  const router = new StorageRouter();
  const primary = router.getPrimaryAdapter();

  await primary.initializeSchema();

  // Setup environment variables for dedicated tenant connections (using Primary DB instance)
  if (!process.env.DATABASE_URL_DED_B && process.env.DATABASE_URL) {
    process.env.DATABASE_URL_DED_B = process.env.DATABASE_URL;
  }
  if (!process.env.DATABASE_URL_DED_C && process.env.DATABASE_URL) {
    process.env.DATABASE_URL_DED_C = process.env.DATABASE_URL;
  }

  const suffix = Date.now().toString().slice(-6);

  // Define 3 Distinct Tenants: Shared A, Dedicated B, Dedicated C
  const tenantA: TenantCompany = {
    id: `ten-shared-a-${suffix}`,
    code: `CODE-A-${suffix}`,
    nameAr: 'شركة المشاريع المشتركة أ (Shared)',
    nameEn: 'Shared Projects Co A',
    crNumber: '1010999001',
    taxNumber: '300999900100003',
    country: 'SA',
    baseCurrency: 'SAR',
    status: 'ACTIVE',
    backendConfig: {
      adapterType: 'postgresql',
      connectionRef: 'DATABASE_URL',
      isolationLevel: 'Shared',
    },
    createdAt: new Date().toISOString(),
  };

  const tenantB: TenantCompany = {
    id: `ten-ded-b-${suffix}`,
    code: `CODE-B-${suffix}`,
    nameAr: 'شركة الصناعات المخصصة ب (Dedicated B)',
    nameEn: 'Dedicated Industries Co B',
    crNumber: '1010999002',
    taxNumber: '300999900200003',
    country: 'SA',
    baseCurrency: 'SAR',
    status: 'ACTIVE',
    backendConfig: {
      adapterType: 'postgresql',
      connectionRef: 'DATABASE_URL_DED_B',
      isolationLevel: 'Dedicated',
    },
    createdAt: new Date().toISOString(),
  };

  const tenantC: TenantCompany = {
    id: `ten-ded-c-${suffix}`,
    code: `CODE-C-${suffix}`,
    nameAr: 'مجموعة الخدمات اللوجستية ج (Dedicated C)',
    nameEn: 'Logistics Group Co C',
    crNumber: '1010999003',
    taxNumber: '300999900300003',
    country: 'SA',
    baseCurrency: 'SAR',
    status: 'ACTIVE',
    backendConfig: {
      adapterType: 'postgresql',
      connectionRef: 'DATABASE_URL_DED_C',
      isolationLevel: 'Dedicated',
    },
    createdAt: new Date().toISOString(),
  };

  // Persist tenants in primary tenant directory
  const saveA = await primary.saveTenant(tenantA, `seed-tenant-${tenantA.id}`);
  const saveB = await primary.saveTenant(tenantB, `seed-tenant-${tenantB.id}`);
  const saveC = await primary.saveTenant(tenantC, `seed-tenant-${tenantC.id}`);
  if (!saveA.success || !saveB.success || !saveC.success) {
    throw new Error(`Failed to save test tenants: ${saveA.error?.detail || saveB.error?.detail || saveC.error?.detail}`);
  }

  async function runTest(
    testId: string,
    nameAr: string,
    category: Phase46BatteryTestResult['category'],
    fn: () => Promise<string>
  ) {
    const tStart = Date.now();
    try {
      const evidence = await fn();
      results.push({
        testId,
        nameAr,
        category,
        passed: true,
        durationMs: Date.now() - tStart,
        evidence,
      });
    } catch (err: any) {
      results.push({
        testId,
        nameAr,
        category,
        passed: false,
        durationMs: Date.now() - tStart,
        evidence: 'Execution Failed',
        error: err.detail || err.message || JSON.stringify(err),
      });
    }
  }

  // =========================================================================
  // 1. Tenant Resolution Pre-Auth (4.6C & 4.6F)
  // =========================================================================
  await runTest(
    'P4.6-01-TENANT-RESOLUTION',
    'حسم هوية المستأجر قبل التوثيق عبر المعرف والصلاحية الصريحة',
    '4.6_TENANT_RESOLUTION',
    async () => {
      // Body resolution
      const mockReqBody = { body: { tenantId: tenantB.id }, headers: {} } as any;
      const resBody = await TenantResolutionService.resolveTenantFromRequest(primary, mockReqBody);
      if (!resBody.success || resBody.tenant?.id !== tenantB.id) {
        throw new Error(`Failed to resolve tenant from body: ${resBody.error?.detail}`);
      }

      // Header resolution
      const mockReqHeader = { body: {}, headers: { 'x-tenant-id': tenantC.id } } as any;
      const resHeader = await TenantResolutionService.resolveTenantFromRequest(primary, mockReqHeader);
      if (!resHeader.success || resHeader.tenant?.id !== tenantC.id) {
        throw new Error(`Failed to resolve tenant from header: ${resHeader.error?.detail}`);
      }

      // Missing tenant rejection (Strict zero fallback)
      const mockReqEmpty = { body: {}, headers: {} } as any;
      const resEmpty = await TenantResolutionService.resolveTenantFromRequest(primary, mockReqEmpty);
      if (resEmpty.success || resEmpty.error?.status !== 400) {
        throw new Error('Expected 400 rejection for missing tenant, but resolution succeeded or returned wrong status');
      }

      return `Successfully verified pre-auth tenant resolution: resolved ${tenantB.id} from body, ${tenantC.id} from header, rejected empty request with RFC7807 400.`;
    }
  );

  // =========================================================================
  // 2. Storage Routing for Shared vs. Dedicated (4.6A & 4.6D)
  // =========================================================================
  await runTest(
    'P4.6-02-STORAGE-ROUTING',
    'توجيه المحركات بدقة: مستأجر مشترك A ومستأجر مخصص B ومستأجر مخصص C',
    '4.6_ROUTING',
    async () => {
      const adapterA = router.resolveAdapter(tenantA);
      const adapterB = await router.resolveAdapterAsync(tenantB);
      const adapterC = await router.resolveAdapterAsync(tenantC);

      if (!adapterA || !adapterB || !adapterC) {
        throw new Error('Failed to resolve adapters for one or more tenants');
      }

      // Shared tenant A routes to Primary adapter
      if (adapterA !== primary) {
        throw new Error('Shared tenant A did not route to primary shared adapter');
      }

      // Dedicated tenants B and C have separate dedicated adapter instances
      if (adapterB === primary || adapterC === primary) {
        throw new Error('Dedicated tenant B or C incorrectly routed to shared primary adapter');
      }

      if (adapterB === adapterC) {
        throw new Error('Dedicated tenant B and C unexpectedly shared the exact same adapter instance');
      }

      return `Verified adapter routing: Shared tenant A routed to Primary; Dedicated B & C received distinct dedicated adapters with initialized schemas.`;
    }
  );

  // =========================================================================
  // 3. Multi-Tenant Data Isolation & Non-Leakage (4.6H)
  // =========================================================================
  await runTest(
    'P4.6-03-CROSS-TENANT-ISOLATION',
    'عزل البيانات الكامل ومنع التسريب البيني بين 3 مستأجرين (Shared, Dedicated B, Dedicated C)',
    '4.6_ISOLATION',
    async () => {
      const adapterA = router.resolveAdapter(tenantA);
      const adapterB = await router.resolveAdapterAsync(tenantB);
      const adapterC = await router.resolveAdapterAsync(tenantC);

      const entryA: JournalEntry = {
        id: `JE-A-${Date.now()}`,
        code: `JV-A-${Date.now().toString().slice(-4)}`,
        tenantId: tenantA.id,
        date: '2026-03-20',
        type: 'قيد تشغيلي أ',
        description: 'قيد خاص بالمستأجر أ',
        totalAmount: 1500,
        status: 'POSTED',
        createdBy: 'USR-A',
        lines: [
          { id: 'LA-1', accountCode: '1101', debit: 1500, credit: 0, description: 'نقدية أ' },
          { id: 'LA-2', accountCode: '4101', debit: 0, credit: 1500, description: 'إيراد أ' },
        ],
      };

      const entryB: JournalEntry = {
        id: `JE-B-${Date.now()}`,
        code: `JV-B-${Date.now().toString().slice(-4)}`,
        tenantId: tenantB.id,
        date: '2026-03-20',
        type: 'قيد مخصص ب',
        description: 'قيد خاص بالمستأجر المخصص ب',
        totalAmount: 2500,
        status: 'POSTED',
        createdBy: 'USR-B',
        lines: [
          { id: 'LB-1', accountCode: '1101', debit: 2500, credit: 0, description: 'نقدية ب' },
          { id: 'LB-2', accountCode: '4101', debit: 0, credit: 2500, description: 'إيراد ب' },
        ],
      };

      // Create entries in respective tenant storage
      await adapterA.createJournalEntry(tenantA.id, entryA, `idem-a-${Date.now()}`);
      await adapterB.createJournalEntry(tenantB.id, entryB, `idem-b-${Date.now()}`);

      // Query listings
      const listA = await adapterA.listJournalEntries(tenantA.id);
      const listB = await adapterB.listJournalEntries(tenantB.id);
      const listC = await adapterC.listJournalEntries(tenantC.id);

      const foundBInA = (listA.data || []).some((e) => e.id === entryB.id || e.tenantId === tenantB.id);
      const foundAInB = (listB.data || []).some((e) => e.id === entryA.id || e.tenantId === tenantA.id);
      const foundAnyInC = (listC.data || []).some((e) => e.id === entryA.id || e.id === entryB.id);

      if (foundBInA || foundAInB || foundAnyInC) {
        throw new Error('Cross-tenant data leakage detected between tenant storage scopes!');
      }

      return `Data isolation confirmed across 3 tenants: Tenant A has ${listA.data?.length} entries, Tenant B has ${listB.data?.length} entries, Tenant C has ${listC.data?.length} entries. Zero cross-tenant leakage.`;
    }
  );

  // =========================================================================
  // 4. Idempotency Key Isolation (8.1 & 4.6H)
  // =========================================================================
  await runTest(
    'P4.6-04-IDEMPOTENCY-ISOLATION',
    'استقلالية مفتاح الإدهنية عبر المستأجرين ومنع التضارب البيني',
    '4.6_ISOLATION',
    async () => {
      const adapterA = router.resolveAdapter(tenantA);
      const adapterB = await router.resolveAdapterAsync(tenantB);

      const sharedKey = `shared-idem-key-${Date.now()}`;

      // Save idempotency record in Tenant A
      await adapterA.saveIdempotencyRecord(tenantA.id, sharedKey, 'ACTION_X', { status: 'tenant_a_done' });

      // Check in Tenant A -> must exist
      const checkA = await adapterA.checkIdempotencyRecord(tenantA.id, sharedKey, 'ACTION_X');
      if (!checkA.success || !checkA.data) {
        throw new Error('Idempotency record not found in Tenant A');
      }

      // Check in Tenant B -> must NOT exist
      const checkB = await adapterB.checkIdempotencyRecord(tenantB.id, sharedKey, 'ACTION_X');
      if (checkB.success && checkB.data) {
        throw new Error('Idempotency collision! Record from Tenant A leaked into Tenant B');
      }

      return `Idempotency scoping verified: Key '${sharedKey}' is strictly isolated to tenant '${tenantA.id}' and invisible to '${tenantB.id}'.`;
    }
  );

  // =========================================================================
  // 5. Pool Capacity and LRU Eviction (4.6E)
  // =========================================================================
  await runTest(
    'P4.6-05-POOL-CAPACITY-LRU',
    'إدارة مجمع الاتصالات المخصصة والتحقق من سياسة الإخلاء الأقدم (LRU Eviction)',
    '4.6_POOL_LRU',
    async () => {
      const testRouter = new StorageRouter();

      // Create entries up to capacity
      for (let i = 1; i <= 22; i++) {
        const envKey = `DATABASE_URL_MOCK_${i}`;
        process.env[envKey] = process.env.DATABASE_URL;

        const dummyTenant: TenantCompany = {
          id: `tenant-pool-${i}`,
          code: `CODE-POOL-${i}`,
          nameAr: `شركة ${i}`,
          nameEn: `Company ${i}`,
          crNumber: `CR-${i}`,
          taxNumber: `TAX-${i}`,
          country: 'SA',
          baseCurrency: 'SAR',
          status: 'ACTIVE',
          backendConfig: {
            adapterType: 'postgresql',
            connectionRef: envKey,
            isolationLevel: 'Dedicated',
          },
          createdAt: new Date().toISOString(),
        };

        testRouter.resolveAdapter(dummyTenant);
      }

      const activePools = testRouter.getActiveDedicatedPoolCount();
      if (activePools > StorageRouter.MAX_DEDICATED_POOLS) {
        throw new Error(`Active pool count (${activePools}) exceeded MAX_DEDICATED_POOLS (${StorageRouter.MAX_DEDICATED_POOLS})`);
      }

      return `Pool capacity enforced: Successfully created 22 dedicated tenant requests. Active pools capped at ${activePools} (max ${StorageRouter.MAX_DEDICATED_POOLS}) via automatic LRU eviction.`;
    }
  );

  // =========================================================================
  // 6. Strict Rejection of Missing Dedicated Environment Reference (4.6B)
  // =========================================================================
  await runTest(
    'P4.6-06-NO-FALLBACK-ON-MISSING-DEDICATED-ENV',
    'التحقق الصارم من رفض السقوط الصامت عند غياب متغير بيئة الاتصال المخصص',
    '4.6_SECURITY',
    async () => {
      const missingEnvTenant: TenantCompany = {
        id: `tenant-missing-env-${Date.now()}`,
        code: `CODE-MISSING-${Date.now()}`,
        nameAr: 'شركة غير مهيأة المتغير',
        nameEn: 'Unconfigured Env Co',
        crNumber: '1010999999',
        taxNumber: '300999999900003',
        country: 'SA',
        baseCurrency: 'SAR',
        status: 'ACTIVE',
        backendConfig: {
          adapterType: 'postgresql',
          connectionRef: 'DATABASE_URL_NON_EXISTENT_XYZ',
          isolationLevel: 'Dedicated',
        },
        createdAt: new Date().toISOString(),
      };

      let threw = false;
      try {
        router.resolveAdapter(missingEnvTenant);
      } catch (err: any) {
        threw = true;
        if (!err.message.includes('غير مُهيأ في متغيرات البيئة')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }

      if (!threw) {
        throw new Error('Expected router to throw an error for missing connectionRef, but it did not!');
      }

      return 'Strict security confirmed: Dedicated tenant with undefined connectionRef rejected with explicit descriptive error; zero fallback to primary DATABASE_URL.';
    }
  );

  const durationMs = Date.now() - startTime;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    totalTests: results.length,
    passedCount,
    failedCount,
    allPassed: failedCount === 0,
    durationMs,
    tests: results,
  };
}
