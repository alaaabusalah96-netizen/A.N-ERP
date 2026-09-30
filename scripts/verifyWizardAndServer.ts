import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { CompanyWizardService } from '../src/core/wizard/CompanyWizardService';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  console.log('========================================================================');
  console.log('       A.N ERP v7.2 — COMPANY WIZARD & SERVER STARTUP VERIFICATION       ');
  console.log('========================================================================\n');

  const primary = new PostgresPrimaryAdapter();
  await primary.initializeSchema();

  console.log('--- 1. COMPANY WIZARD EXECUTION VIA REAL PostgresPrimaryAdapter ---');
  const wizard = new CompanyWizardService(primary);
  const now = Date.now();
  const idempotencyKey = `wiz-live-${now}`;
  
  const res = await wizard.createCompany({
    countryCode: 'SA',
    companyNameAr: 'شركة الابتكار والتطوير السعودية',
    companyNameEn: 'Saudi Innovation & Development Co.',
    taxNumber: '300128472900003',
    activityTemplateId: 'tmpl-05',
    backendConfig: {
      adapterType: 'postgresql',
      connectionRef: 'DATABASE_URL',
      isolationLevel: 'Shared',
    },
    firstAdmin: {
      username: `sa_admin_${now}`,
      fullName: 'سعد العتيبي',
      email: `sa_${now}@company.sa`,
      password: 'SecurePassword123!',
    },
    idempotencyKey,
  });

  if (!res.success || !res.data) {
    console.error('CompanyWizard creation failed:', res.error);
    process.exit(1);
  }

  const d = res.data;
  console.log('CompanyWizard Result:');
  console.log(`- Tenant ID: ${d.tenant.id}`);
  console.log(`- Tenant Code: ${d.tenant.code}`);
  console.log(`- Company Name (AR): ${d.tenant.nameAr}`);
  console.log(`- Standard VAT Rate: ${d.taxRule.standardVatRate * 100}%`);
  console.log(`- Currency: ${d.taxRule.currencyCode}`);
  console.log(`- Seeded Accounts Count: ${d.seededAccountsCount}`);
  console.log(`- Enabled Modules Count: ${d.enabledModules.length}`);
  console.log(`- First Admin User ID: ${d.firstAdmin.id}`);
  console.log(`- First Admin Username: ${d.firstAdmin.username}`);

  // Verify in PostgreSQL table
  const checkTenant = await (primary as any).pool.query(
    'SELECT id, code, name_ar, status FROM an_tenants WHERE id = $1',
    [d.tenant.id]
  );
  console.log('Database an_tenants row:', checkTenant.rows[0]);

  if (checkTenant.rows.length === 1 && d.seededAccountsCount >= 5) {
    console.log('[PASS] Company creation via CompanyWizard succeeded with verified DB persistence.\n');
  } else {
    console.error('[FAIL] Tenant was not persisted properly in DB');
    process.exit(1);
  }

  await primary.close();

  // Test Server health endpoint
  console.log('--- 2. SERVER STARTUP & HEALTH CHECK ---');
  const healthRes = await fetch('http://127.0.0.1:3000/api/health');
  console.log(`GET /api/health HTTP Status: ${healthRes.status}`);
  const healthData = await healthRes.json();
  console.log('Health Response:', healthData);

  if (healthRes.status === 200 && healthData.status === 'ok') {
    console.log('[PASS] Live Server running and healthy on port 3000.\n');
  } else {
    console.error('[FAIL] Health check failed');
    process.exit(1);
  }

  console.log('========================================================================');
  console.log('              WIZARD & STARTUP VERIFICATION COMPLETE                     ');
  console.log('========================================================================');
}

run().catch((err) => {
  console.error('Wizard test error:', err);
  process.exit(1);
});
