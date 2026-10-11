/**
 * @file verifySecAPg.ts
 * @description SEC-A PostgreSQL gate: the tenant-scoped login-lock key works against the real an_failed_login_attempts table
 * (VARCHAR(64) key), the counter is isolated per tenant, and clearing it works. Needs DATABASE_URL, otherwise PG_NOT_RUN (exit 3).
 * Run:  npx tsx scripts/verifySecAPg.ts | tee evidence/security-a/battery-output-pg.txt
 */
import dotenv from 'dotenv';
dotenv.config();
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { AnomalyDetector, loginLockKey } from '../src/core/auth/AnomalyDetector';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => { if (cond) { pass++; console.log(`[PASS] ${label}`); } else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); } };

async function main() {
  const pg: any = new PostgresPrimaryAdapter();
  const health = await pg.checkHealth();
  if (!health.connected) { console.log('PG_NOT_RUN: no PostgreSQL connection (DATABASE_URL missing/invalid). SEC-A is NOT closed.'); process.exit(3); }
  check('PG0 initializeSchema succeeds', (await pg.initializeSchema()).success === true);
  const run = Date.now().toString(36);
  const kA = loginLockKey(`zz-seca-a-${run}`, 'admin'), kB = loginLockKey(`zz-seca-b-${run}`, 'admin');
  const det = new AnomalyDetector(pg);
  try {
    check('PG1 the key fits the real column (64 chars) and is stored without error', kA.length <= 64 && (await pg.recordFailedLoginAttempt(kA, 1)).success === true);
    for (let i = 1; i < 5; i++) await det.recordFailedAttempt(kA);   // 1 (above) + 4 = 5 failures
    const a = await det.checkLockout(kA), b = await det.checkLockout(kB);
    check('PG2 5 failures for admin@A lock A in the database; admin@B (same username) is NOT locked', a.isLocked === true && a.failedAttempts === 5 && b.isLocked === false && b.failedAttempts === 0, JSON.stringify({ a, b }));
    check('PG3 clearing the counter removes the lock', (await pg.clearFailedLoginAttempts(kA)).success === true && (await det.checkLockout(kA)).isLocked === false && (await det.checkLockout(kA)).failedAttempts === 0);
    await det.recordFailedAttempt(kB);
    const bb = await det.checkLockout(kB);
    check('PG4 the other tenant keeps its own independent counter (1 failure, not locked)', bb.failedAttempts === 1 && bb.isLocked === false);
  } finally {
    await pg.clearFailedLoginAttempts(kA); await pg.clearFailedLoginAttempts(kB);
  }
  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
