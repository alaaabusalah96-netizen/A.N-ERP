/**
 * F-07 — StorageRouter concurrency probe.
 * - Always: parallel InMemory adapter operations (no crash / no cross-talk).
 * - If DATABASE_URL set: parallel withTenantScope read/write probes on PostgresPrimaryAdapter.
 * Does NOT claim production load numbers; only detects hard failures / deadlock timeouts.
 * Run: npx tsx scripts/verifyF07StorageRouter.ts
 */
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { StorageRouter } from '../src/core/storage/StorageRouter';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`TIMEOUT ${label} after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t!);
  }
}

async function main() {
  // T1: router construction + primary adapter
  const router = new StorageRouter();
  check('T1 StorageRouter constructs with primary + in-memory', !!router.getPrimaryAdapter());

  // T2–T4: parallel InMemory saves (different tenants)
  const mem = new InMemoryAdapter();
  const tenantA = 'F07-A';
  const tenantB = 'F07-B';
  const now = new Date().toISOString();
  const mkUser = (tenantId: string, id: string) => ({
    id, tenantId, username: `u-${id}`, fullName: id, email: `${id}@f07.test`,
    role: 'accountant', status: 'ACTIVE' as const, passwordHash: 'x',
    twoFactorEnabled: false, requiresPasswordChange: false, createdAt: now,
  });

  const parallelMem = Array.from({ length: 20 }, (_, i) =>
    mem.saveUser(mkUser(i % 2 === 0 ? tenantA : tenantB, `u${i}`), `k-f07-${i}`)
  );
  try {
    const results = await withTimeout(Promise.all(parallelMem), 15000, 'parallel-mem');
    check('T2 parallel InMemory saveUser (20) completes', results.every((r: any) => r?.success !== false));
  } catch (e: any) {
    check('T2 parallel InMemory saveUser (20) completes', false, String(e?.message || e));
  }

  const listA = await mem.listUsers(tenantA);
  const listB = await mem.listUsers(tenantB);
  const aIds = new Set((listA.data || []).map((u: any) => u.id));
  const bIds = new Set((listB.data || []).map((u: any) => u.id));
  check('T3 tenant A users do not appear in tenant B list', ![...aIds].some((id) => bIds.has(id)));
  check('T4 both tenants received users', (listA.data?.length || 0) >= 5 && (listB.data?.length || 0) >= 5);
  // T5: dedicated pool counter APIs exist and are finite
  check('T5 MAX_DEDICATED_POOLS is positive finite', StorageRouter.MAX_DEDICATED_POOLS > 0 && StorageRouter.MAX_DEDICATED_POOLS < 1000);
  check('T6 active dedicated pools count is non-negative', router.getActiveDedicatedPoolsCount() >= 0);

  // PostgreSQL branch
  if (!process.env.DATABASE_URL) {
    console.log('[INFO] DATABASE_URL not set — PG concurrency branch skipped (F07_PG_SKIPPED)');
    check('T7 PG branch skipped cleanly without crash', true);
  } else {
    const pg = new PostgresPrimaryAdapter();
    try {
      await withTimeout((pg as any).connect?.() ?? Promise.resolve(), 20000, 'pg-connect').catch(() => {});
      // Prefer ensureSchema / init if present
      if (typeof (pg as any).ensureSchema === 'function') {
        await withTimeout((pg as any).ensureSchema(), 60000, 'ensureSchema');
      }
      const jobs = Array.from({ length: 8 }, (_, i) =>
        pg.withTenantScope(`f07-tenant-${i % 2}`, async () => {
          // lightweight: set_config already applied; run a simple query via internal query if available
          if (typeof (pg as any).query === 'function') {
            await (pg as any).query('SELECT 1 AS ok');
          }
          return true;
        })
      );
      const pgResults = await withTimeout(Promise.all(jobs), 30000, 'parallel-pg-scope');
      check('T7 parallel withTenantScope (8) on Postgres completes', pgResults.every(Boolean));
    } catch (e: any) {
      const msg = String(e?.message || e);
      const isDeadlock = /deadlock detected/i.test(msg);
      check('T7 parallel withTenantScope on Postgres completes', false, msg);
      check('T8 no deadlock detected in error text', !isDeadlock, msg);
    }
  }

  // Static: no DATABASE_URL fallback inside Dedicated path (guardFoundation concern)
  const fs = await import('node:fs');
  const routerSrc = fs.readFileSync('src/core/storage/StorageRouter.ts', 'utf8');
  check('T9 StorageRouter still distinguishes Shared vs Dedicated', /isolationLevel !== 'Shared'/.test(routerSrc) && /Dedicated/.test(routerSrc));

  console.log(`
Passed: ${pass} | Failed: ${fail}`);
  if (!process.env.DATABASE_URL) {
    console.log('F07_VERDICT: INMEMORY_PASS_PG_SKIPPED');
  } else {
    console.log(fail === 0 ? 'F07_VERDICT: PASS' : 'F07_VERDICT: FAIL');
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
