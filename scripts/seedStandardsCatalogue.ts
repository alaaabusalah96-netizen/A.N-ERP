/**
 * @file seedStandardsCatalogue.ts
 * @description Manual/idempotent seed of the Standards catalogue (reference entries only, never overwrites).
 * Default: InMemory (smoke). `--pg` uses the PostgreSQL primary (needs DATABASE_URL).
 * Prints a single machine-readable line:  SEED <jurisdictions added> <standards added> <errors>
 */
import { seedStandardsCatalogue } from '../src/core/standards/seedCatalogue';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';

async function main() {
  const usePg = process.argv.includes('--pg');
  if (usePg) (await import('dotenv')).default.config();
  const st: any = usePg ? new PostgresPrimaryAdapter() : new InMemoryAdapter();
  if (usePg) {
    const h = await st.checkHealth();
    if (!h.connected) { console.log('PG_NOT_RUN'); process.exit(3); }
    await st.initializeSchema();
  }
  const r = await seedStandardsCatalogue(st, 'seed-script');
  for (const e of r.errors) console.log('ERR', e);
  console.log(`SEED ${r.jurisdictions} ${r.standards} ${r.errors.length}`);
  process.exit(r.errors.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
