/**
 * @file cliRunPhase7_6.ts
 * CLI runner for Phase 7.6 battery
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { runPhase76Battery } from './runPhase7_6Battery';

async function main() {
  console.log('===============================================================');
  console.log('⚡ STARTING PHASE 7.6 VERIFICATION BATTERY (UPGRADED MODULES 4-7)');
  console.log('===============================================================');

  const suite = await runPhase76Battery();

  console.log('\n--- RESULTS SUMMARY ---');
  for (const test of suite.tests) {
    const symbol = test.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${symbol}] #${test.criterionNumber} [${test.testId}] ${test.nameAr} (${test.durationMs}ms)`);
    console.log(`       دليل: ${test.evidence}`);
    if (test.error) {
      console.log(`       خطأ: ${test.error}`);
    }
  }

  console.log('---------------------------------------------------------------');
  console.log(`Total: ${suite.totalTests} | Passed: ${suite.passedCount} | Failed: ${suite.failedCount} | All Passed: ${suite.allPassed}`);
  console.log(`Execution Duration: ${suite.durationMs}ms`);

  const evidenceDir = path.join(process.cwd(), 'evidence', 'phase-7.6');
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  const outputLog = suite.tests.map(t =>
    `[${t.passed ? 'PASS' : 'FAIL'}] #${t.criterionNumber} [${t.testId}] ${t.nameAr} (${t.durationMs}ms)\nEvidence: ${t.evidence}\n`
  ).join('\n');

  fs.writeFileSync(
    path.join(evidenceDir, 'battery-output.txt'),
    `PHASE 7.6 BATTERY EXECUTION LOG\nDate: ${new Date().toISOString()}\nTotal: ${suite.totalTests} | Passed: ${suite.passedCount} | Failed: ${suite.failedCount}\n\n${outputLog}`
  );

  if (!suite.allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal battery error:', err);
  process.exit(1);
});
