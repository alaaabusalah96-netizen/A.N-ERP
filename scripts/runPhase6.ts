import { runPhase6Battery } from '../src/core/tests/runPhase6Battery';

async function main() {
  console.log('\n========================================================================');
  console.log('         A.N ERP v7.2 — PHASE 6: EXPENSES ACCEPTANCE BATTERY           ');
  console.log('         (موديول المصروفات العامة والتشغيلية - موديول 2 من 15)         ');
  console.log('========================================================================\n');

  try {
    const report = await runPhase6Battery();
    for (const t of report.tests) {
      const status = t.passed ? '✓ PASS' : '✗ FAIL';
      console.log(`[${t.testId}] [${t.category}] ${t.nameAr}`);
      console.log(`      الحالة:  ${status} (${t.durationMs}ms)`);
      console.log(`      الدليل:  ${t.evidence}`);
      if (t.error) {
        console.log(`      الخطأ:   ${t.error}`);
      }
      console.log('');
    }

    console.log('------------------------------------------------------------------------');
    console.log(`إجمالي الاختبارات: ${report.totalTests} | نجح: ${report.passedCount} | فشل: ${report.failedCount} | الزمن: ${report.durationMs}ms`);
    console.log(`النتيجة النهائية: ${report.allPassed ? '✓ جميع الاختبارات مجتازة بنجاح (ALL PASSED)' : '✗ يوجد اختبارات فاشلة'}`);
    console.log('========================================================================\n');

    if (!report.allPassed) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err: any) {
    console.error('فشل غير متوقع أثناء تنفيذ البطارية:', err);
    process.exit(1);
  }
}

main();
