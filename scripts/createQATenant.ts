import { createTempTenant } from './lib/testTenant';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    console.log('Creating QA Audit Tenant...');
    const tt = await createTempTenant({ seedChart: true });
    console.log('Tenant Created:', tt.tenantId);
    // Print tenant config without exposing secrets
    console.log('Company ID:', tt.tenantId);
  } catch (e: any) {
    console.error('Failed to create tenant:', e.message);
  }
}
run();
