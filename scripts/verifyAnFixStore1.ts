import fs from 'fs';
import path from 'path';
import { StorageRouter, isSafeConnectionRef } from '../src/an-core/storage/StorageRouter';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}`); }
}
function thrownCode(fn: () => unknown): string | null {
  try { fn(); return null; } catch (e: any) { return String(e?.code || e?.message || 'error'); }
}

const ENV_KEYS = ['DATABASE_URL', 'STRICT_PROD_SECURITY', 'AN_ALLOW_INMEMORY_FALLBACK', 'AN_STORE1_PROBE'];
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
function setEnv(k: string, v?: string): void {
  if (v === undefined) delete process.env[k]; else process.env[k] = v;
}
function restoreEnv(): void {
  for (const k of ENV_KEYS) setEnv(k, saved[k]);
}

async function main(): Promise<void> {
  const router = new StorageRouter();
  const src = fs.readFileSync(path.join(process.cwd(), 'src/an-core/storage/StorageRouter.ts'), 'utf8');

  check('01 isSafeConnectionRef accepts DATABASE_URL', isSafeConnectionRef('DATABASE_URL'));
  check('02 isSafeConnectionRef accepts DATABASE_URL_ACME1', isSafeConnectionRef('DATABASE_URL_ACME1'));
  check('03 isSafeConnectionRef rejects JWT_SECRET', !isSafeConnectionRef('JWT_SECRET'));
  check('04 isSafeConnectionRef rejects FIREBASE_SERVICE_ACCOUNT', !isSafeConnectionRef('FIREBASE_SERVICE_ACCOUNT'));
  check('05 isSafeConnectionRef rejects lowercase', !isSafeConnectionRef('database_url'));

  const badCfg: any = { adapterType: 'postgresql', connectionRef: 'JWT_SECRET', isolationLevel: 'Dedicated' };
  const goodCfg: any = { adapterType: 'postgresql', connectionRef: 'DATABASE_URL_X1', isolationLevel: 'Dedicated' };
  check('06 validateBackendConfig rejects non-allowlisted connectionRef', router.validateBackendConfig(badCfg).valid === false);
  check('07 validateBackendConfig accepts DATABASE_URL_X1', router.validateBackendConfig(goodCfg).valid === true);

  setEnv('DATABASE_URL', undefined);
  setEnv('STRICT_PROD_SECURITY', 'true');
  setEnv('AN_ALLOW_INMEMORY_FALLBACK', undefined);
  check('08 strict + no DATABASE_URL -> resolveAdapter throws an_storage_not_configured',
    (thrownCode(() => router.resolveAdapter(undefined)) || '').includes('an_storage_not_configured'));

  setEnv('AN_ALLOW_INMEMORY_FALLBACK', '1');
  check('09 explicit allow -> in-memory returned', router.resolveAdapter(undefined) === router.getDevInMemoryAdapter());

  setEnv('STRICT_PROD_SECURITY', undefined);
  setEnv('AN_ALLOW_INMEMORY_FALLBACK', undefined);
  check('10 non-strict legacy behaviour kept (in-memory)', router.resolveAdapter(undefined) === router.getDevInMemoryAdapter());

  const mysqlDedicated: any = { id: 't1', backendConfig: { adapterType: 'mysql', connectionRef: 'DATABASE_URL_M', isolationLevel: 'Dedicated' } };
  check('11 uncertified adapter on Dedicated path is refused', thrownCode(() => router.resolveAdapter(mysqlDedicated)) !== null);

  setEnv('AN_STORE1_PROBE', 'postgres://probe');
  const probeTenant: any = { id: 't2', backendConfig: { adapterType: 'postgresql', connectionRef: 'AN_STORE1_PROBE', isolationLevel: 'Dedicated' } };
  check('12 Dedicated with non-allowlisted env name is refused even if env var exists', thrownCode(() => router.resolveAdapter(probeTenant)) !== null);
  setEnv('AN_STORE1_PROBE', undefined);

  check('13 createAdapterByType throws for unknown type', thrownCode(() => router.createAdapterByType('nope')) !== null);
  check('14 source has recent-use guard + cap error code',
    src.includes('MIN_IDLE_BEFORE_EVICT_MS') && src.includes('dedicated_pool_cap_reached'));

  try { await router.closeAll(); } catch { /* ignore */ }
  restoreEnv();
  console.log(`\nPassed: ${passed} | Failed: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('verifyAnFixStore1 crashed:', e?.message || e); process.exit(1); });
