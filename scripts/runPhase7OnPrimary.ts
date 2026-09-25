/**
 * @file runPhase7OnPrimary.ts
 * @description Executes the full Phase 7 Acceptance Battery directly on PostgreSQL (Supabase Primary)
 * and generates signed evidence adhering to Rule 3.1, Rule 16, and Rule v7.4.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { runPhase7Battery } from '../src/core/inventory/Phase7Battery';

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function writeSignedEvidence(filePath: string, command: string, stdout: string, exitCode: number) {
  const timestamp = new Date().toISOString();
  const rawBody = `COMMAND: ${command}\nEXIT_CODE: ${exitCode}\nTIMESTAMP: ${timestamp}\n\nSTDOUT:\n${stdout}\n`;
  const fileHash = sha256(rawBody);
  const fullContent = `${rawBody}\nSHA256: ${fileHash}\n`;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, fullContent, 'utf8');
  console.log(`[Evidence] Saved -> ${filePath} (SHA256: ${fileHash.slice(0, 16)}...)`);
}

async function main() {
  console.log('================================================================');
  console.log('A.N ERP — Running Phase 7 Battery on Live PostgreSQL Primary');
  console.log('================================================================');

  const primary = new PostgresPrimaryAdapter();
  const health = await primary.checkHealth();
  if (!health.connected) {
    const errorMsg = 'البيئة لا تدعم Primary — لا إغلاق حتى يتوفر Connection';
    console.error(errorMsg);
    const evidenceDir = path.join(process.cwd(), 'evidence', 'phase-7');
    fs.writeFileSync(path.join(evidenceDir, 'battery-output.txt'), errorMsg, 'utf8');
    process.exit(1);
  }

  await primary.initializeSchema();
  console.log('✓ Connected to PostgreSQL Primary. Executing Phase 7 battery...');

  const report = await runPhase7Battery(primary);

  console.log(`Phase 7 Execution Completed:`);
  console.log(`  Adapter: ${report.adapterType}`);
  console.log(`  Total Scenarios: ${report.totalScenarios}`);
  console.log(`  Passed Scenarios: ${report.passedScenarios}`);
  console.log(`  Failed Scenarios: ${report.failedScenarios}`);
  console.log(`  isClosed: ${report.isClosed}`);

  if (report.adapterType.includes('InMemory')) {
    console.error('FATAL: Phase 7 report still ran on InMemoryAdapter!');
    process.exit(1);
  }

  const evidenceDir = path.join(process.cwd(), 'evidence', 'phase-7');
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  const rawJson = JSON.stringify(report, null, 2);
  fs.writeFileSync(path.join(evidenceDir, 'battery-output.txt'), rawJson, 'utf8');
  console.log(`✓ Updated evidence/phase-7/battery-output.txt with PostgreSQL Primary results.`);

  // Write signed evidence log
  await writeSignedEvidence(
    path.join(evidenceDir, 'battery-execution-signed.txt'),
    'npx tsx scripts/runPhase7OnPrimary.ts',
    rawJson,
    report.failedScenarios === 0 ? 0 : 1
  );

  if (report.failedScenarios > 0) {
    console.error('One or more scenarios failed!');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error running Phase 7 battery on Primary:', err);
  process.exit(1);
});
