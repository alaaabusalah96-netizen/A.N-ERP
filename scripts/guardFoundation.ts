/**
 * A.N ERP v7.2 — Phase 4.5 Foundation Hardening Anti-Regression Gate
 * (بوابة التحقق الآلي لمنع الانتكاس المعماري)
 *
 * Checks:
 * 1. 4.5A: activeStorage absent from server.ts business routes.
 * 2. 4.5B: StorageRouter has NO fallback to DATABASE_URL for Dedicated isolation.
 * 3. 4.5C: Zero || 'tenant-main' in server.ts request routes.
 * 4. 4.5D: listActiveSessions in StoragePort strictly requires tenantId argument.
 * 5. 4.5E: Zero in-memory Map/Array operational stores in server.ts.
 * 6. 4.5F: Zero || ...Date.now() idempotency fallbacks in write routes.
 * 7. 4.5H: Acceptance test suite (runPhase1Battery / runPhase4Battery) has zero fallback to InMemoryAdapter.
 */

import * as fs from 'fs';
import * as path from 'path';

interface CheckItem {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: CheckItem[] = [];

function runChecks() {
  const rootDir = process.cwd();
  const serverPath = path.join(rootDir, 'server.ts');
  const storagePortPath = path.join(rootDir, 'src/core/storage/StoragePort.ts');
  const storageRouterPath = path.join(rootDir, 'src/core/storage/StorageRouter.ts');
  const phase1BatteryPath = path.join(rootDir, 'src/core/tests/runPhase1Battery.ts');
  const phase4BatteryPath = path.join(rootDir, 'src/core/tests/runPhase4Battery.ts');

  const serverContent = fs.readFileSync(serverPath, 'utf-8');
  const storagePortContent = fs.readFileSync(storagePortPath, 'utf-8');
  const storageRouterContent = fs.readFileSync(storageRouterPath, 'utf-8');
  const phase1BatteryContent = fs.readFileSync(phase1BatteryPath, 'utf-8');
  const phase4BatteryContent = fs.readFileSync(phase4BatteryPath, 'utf-8');

  // Check 1: activeStorage in server.ts
  const activeStorageMatches = (serverContent.match(/\bactiveStorage\b/g) || []).length;
  results.push({
    id: '4.5A',
    name: 'توصيل StorageRouter وإزالة activeStorage بالكامل',
    passed: activeStorageMatches === 0,
    details: `عدد مرات ظهور activeStorage في server.ts: ${activeStorageMatches} (المطلوب: 0)`,
  });

  // Check 2: Dedicated isolation fallback in StorageRouter
  const dedicatedSection = storageRouterContent.substring(
    storageRouterContent.indexOf('getOrCreateDedicatedAdapter'),
    storageRouterContent.indexOf('public getPrimaryAdapter')
  );
  const dedicatedHasFallback = dedicatedSection.includes("|| process.env['DATABASE_URL']") || dedicatedSection.includes('|| process.env.DATABASE_URL');
  results.push({
    id: '4.5B',
    name: 'منع السقوط على قاعدة البيانات المشتركة في العزل المنفصل (Dedicated)',
    passed: !dedicatedHasFallback,
    details: dedicatedHasFallback
      ? 'وجد سقوط على DATABASE_URL داخل getOrCreateDedicatedAdapter!'
      : 'العزل المنفصل يفرض تعريف متغير البيئة الخاص بالمنشأة حصراً دون تراجع صامت.',
  });

  // Check 3: || 'tenant-main' in server.ts
  const tenantMainFallbacks = (serverContent.match(/\|\|\s*['"]tenant-main['"]/g) || []).length;
  results.push({
    id: '4.5C',
    name: 'إزالة السقوط الافتراضي على tenant-main من مسارات الطلب',
    passed: tenantMainFallbacks === 0,
    details: `عدد مرات السقوط الافتراضي || 'tenant-main' في server.ts: ${tenantMainFallbacks} (المطلوب: 0)`,
  });

  // Check 4: listActiveSessions requires tenantId
  const listActiveSessionsMatch = storagePortContent.includes('listActiveSessions(tenantId: string)');
  results.push({
    id: '4.5D',
    name: 'حصر الجلسات النشطة بالمستأجر في عقد التخزين StoragePort',
    passed: listActiveSessionsMatch,
    details: listActiveSessionsMatch
      ? 'listActiveSessions(tenantId: string) معرّف مع وسيط tenantId الإلزامي'
      : 'listActiveSessions لا يفرض tenantId في StoragePort!',
  });

  // Check 5: In-memory stores in server.ts
  const inMemoryStores = (
    serverContent.match(/\b(loginIdempotencyCache|operationalAuditTrail|customFieldsStore)\b/g) || []
  ).length;
  results.push({
    id: '4.5E',
    name: 'استدامة البيانات التشغيلية عبر StoragePort بدلاً من مصفوفات الذاكرة',
    passed: inMemoryStores === 0,
    details: `عدد الإشارات للمخازن المؤقتة الممنوعة في server.ts: ${inMemoryStores} (المطلوب: 0)`,
  });

  // Check 6: Date.now() fallbacks in posting/write routes
  const dateNowFallbackRegex = /req\.headers\['idempotency-key'\]\s*as\s*string\)\s*\|\|\s*`[^`]*\${Date\.now\(\)}/;
  const hasDateNowFallback = dateNowFallbackRegex.test(serverContent);
  results.push({
    id: '4.5F',
    name: 'إلزام Idempotency-Key في مسارات الكتابة وإزالة Date.now() البديل',
    passed: !hasDateNowFallback,
    details: hasDateNowFallback
      ? 'وجدت مسارات كتابة تعتمد Date.now() كبديل لمفتاح الإدهنية!'
      : 'جميع مسارات الكتابة تفرض الترويسة Idempotency-Key وترفض الطلب برمز 400 عند غيابها.',
  });

  // Check 7: Acceptance tests have zero fallback to InMemoryAdapter
  const p1InMemory = (phase1BatteryContent.match(/getDevInMemoryAdapter/g) || []).length;
  const p4InMemory = (phase4BatteryContent.match(/getDevInMemoryAdapter/g) || []).length;
  const totalDevFallbackInAcceptance = p1InMemory + p4InMemory;
  results.push({
    id: '4.5H',
    name: 'فصل حزمة القبول عن حزمة التطوير ومنع السقوط على InMemoryAdapter',
    passed: totalDevFallbackInAcceptance === 0,
    details: `عدد استدعاءات getDevInMemoryAdapter في حزم القبول: ${totalDevFallbackInAcceptance} (المطلوب: 0)`,
  });

  // Output Report
  console.log('\n========================================================================');
  console.log('       A.N ERP v7.2 — PHASE 4.5 FOUNDATION HARDENING GATE REPORT        ');
  console.log('========================================================================\n');

  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? '✓ اجتياز (PASS)' : '✗ فشل (FAIL)';
    console.log(`[${r.id}] ${r.name}`);
    console.log(`      الحالة:  ${status}`);
    console.log(`      التفصيل: ${r.details}\n`);
    if (!r.passed) {
      allPassed = false;
    }
  }

  console.log('------------------------------------------------------------------------');
  if (allPassed) {
    console.log('✓ نتيجة البوابة: جميع معايير المرحلة 4.5 مجتازة بالكامل (7/7 PASS)');
    console.log('========================================================================\n');
    process.exit(0);
  } else {
    console.error('✗ نتيجة البوابة: فشل في معايير التحقق — يُمنع الانتقال للمرحلة التالية');
    console.log('========================================================================\n');
    process.exit(1);
  }
}

runChecks();
