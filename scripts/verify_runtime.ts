import { globalStorageRouter } from '../src/core/storage/StorageRouter';

async function main() {
  console.log('--- Environment Check ---');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('APP_VERSION: 7.2.0');
  
  const adapter = globalStorageRouter.getPrimaryAdapter();
  // Using the adapter to get DB info
  const result = await (adapter as any).query('SELECT version(), current_database(), current_user, current_setting(\'search_path\'), current_setting(\'is_superuser\', true)');
  
  if (result && result.rows && result.rows.length > 0) {
    const row = result.rows[0];
    console.log('PostgreSQL Version:', row.version);
    console.log('Database Name:', row.current_database);
    console.log('Connected User:', row.current_user);
    console.log('Search Path:', row.current_setting);
  }

  // Check role privileges
  const roleRes = await (adapter as any).query('SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user');
  if (roleRes && roleRes.rows && roleRes.rows.length > 0) {
    console.log('--- DB Role Privileges ---');
    console.table(roleRes.rows);
  }

  // Check audit table count (READ-ONLY)
  try {
    const countRes = await (adapter as any).query('SELECT count(*) FROM an_system_changelog');
    console.log('--- Audit Log Stats ---');
    console.log('Row count:', countRes.rows[0].count);
  } catch (e) {
    console.log('Audit log table inaccessible');
  }

  // Check schema for transfer lines (READ-ONLY)
  const schemaRes = await (adapter as any).query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'an_stock_transfer_lines'
  `);
  console.log('--- Transfer Line Schema ---');
  console.table(schemaRes.rows);
}

main().catch(console.error);
