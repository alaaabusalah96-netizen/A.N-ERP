import { globalStorageRouter } from '../src/core/storage/StorageRouter';

async function main() {
  console.log('--- Environment Proof ---');
  const adapter = globalStorageRouter.getPrimaryAdapter();
  const result = await (adapter as any).query(`
    SELECT version(), current_database(), current_user, current_setting('search_path');
  `);
  console.log('PostgreSQL Version:', result.rows[0].version);
  console.log('Database Name:', result.rows[0].current_database);
  console.log('Connected User:', result.rows[0].current_user);
  
  console.log('--- Schema Verification ---');
  // Check an_stock_transfer_lines
  const linesRes = await (adapter as any).query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'an_stock_transfer_lines'
  `);
  console.log('an_stock_transfer_lines columns:', linesRes.rows.map((r: any) => r.column_name));
  
  // Check an_active_sessions
  const sessionRes = await (adapter as any).query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'an_active_sessions'
  `);
  console.log('an_active_sessions columns:', sessionRes.rows.map((r: any) => r.column_name));

  // Check an_custom_fields
  const customRes = await (adapter as any).query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'an_custom_fields'
  `);
  console.log('an_custom_fields columns:', customRes.rows.map((r: any) => r.column_name));
}

main().catch(console.error);
