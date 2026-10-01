import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import dotenv from 'dotenv';
dotenv.config();

async function cleanup() {
  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const pool = (adapter as any).pool;

  console.log('--- CLEANUP: an_idempotency_keys (operation = LOGIN) ---');
  
  // 1. Count before
  const beforeRes = await pool.query("SELECT count(*)::int as count FROM an_idempotency_keys WHERE operation = 'LOGIN'");
  const countBefore = beforeRes.rows[0].count;
  console.log(`Count BEFORE delete: ${countBefore}`);

  // 2. Delete
  const deleteRes = await pool.query("DELETE FROM an_idempotency_keys WHERE operation = 'LOGIN'");
  console.log(`Deleted rows: ${deleteRes.rowCount}`);

  // 3. Count after
  const afterRes = await pool.query("SELECT count(*)::int as count FROM an_idempotency_keys WHERE operation = 'LOGIN'");
  const countAfter = afterRes.rows[0].count;
  console.log(`Count AFTER delete: ${countAfter}`);

  process.exit(0);
}

cleanup().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
