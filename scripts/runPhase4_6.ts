import { runPhase46Battery } from '../src/core/tests/runPhase4_6Battery';

async function main() {
  console.log('\n========================================================================');
  console.log('       A.N ERP v7.2 — PHASE 4.6 FOUNDATION ACCEPTANCE BATTERY           ');
  console.log('========================================================================\n');

  try {
    const report = await runPhase46Battery();
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
