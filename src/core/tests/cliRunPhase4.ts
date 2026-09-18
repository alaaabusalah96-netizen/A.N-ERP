import { runPhase4Battery } from './runPhase4Battery';

async function main() {
  console.log('=====================================================');
  console.log('🚀 RUNNING A.N ERP PHASE 4 FULL BATTERY VERIFICATION');
  console.log('=====================================================');
  try {
    const suite = await runPhase4Battery();
    console.log(`\nAdapter Tested: ${suite.adapterName}`);
    console.log(`Total Tests: ${suite.totalTests}`);
    console.log(`Passed: ${suite.passedCount}`);
    console.log(`Failed: ${suite.failedCount}`);
    console.log(`Duration: ${suite.durationMs}ms\n`);

    suite.tests.forEach((t, i) => {
      const mark = t.passed ? '✅ [PASS]' : '❌ [FAIL]';
      console.log(`${mark} ${t.testId} - ${t.nameAr} (${t.durationMs}ms)`);
      if (t.evidence) {
        console.log(`     Evidence: ${t.evidence}`);
      }
      if (t.error) {
        console.log(`     Error: ${t.error}`);
      }
    });

    console.log('=====================================================');
    if (suite.allPassed) {
      console.log('🏆 ALL PHASE 4 TESTS PASSED ACCORDING TO CLAUSE 3.4 & 16');
    } else {
      console.log('⚠️ SOME TESTS FAILED');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal battery failure:', err);
    process.exit(1);
  }
}

main();
