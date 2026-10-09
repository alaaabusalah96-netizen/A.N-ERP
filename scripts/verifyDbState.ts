import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  const T = 'int-e37f2141';
  console.log('Inspecting Tenant:', T);
  
  const tables = [
    'an_purchase_orders', 'an_purchase_order_lines', 
    'an_goods_receipts', 'an_goods_receipt_lines', 
    'an_supplier_invoices', 'an_supplier_invoice_lines'
  ];
  
  for (const t of tables) {
    const c = await client.query(`SELECT count(*) FROM ${t} WHERE tenant_id=$1`, [T]);
    console.log(`Table ${t}: ${c.rows[0].count} rows`);
  }
  
  // Verify RLS policy existence
  const p = await client.query("SELECT polname, polrelid::regclass FROM pg_policy WHERE polrelid::regclass::text = 'an_purchase_orders'");
  console.log('RLS Policies for an_purchase_orders:', p.rows);
  
  client.release();
  await pool.end();
}
run().catch(console.error);
