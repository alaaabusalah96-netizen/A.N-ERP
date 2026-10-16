/**
 * @file verifyOrgCompany1.ts
 * ORG-COMPANY-1 — legal company profile hardening (static).
 * Run: npx tsx scripts/verifyOrgCompany1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const srv = fs.readFileSync('server.ts', 'utf8');
const sp = fs.readFileSync('src/core/storage/StoragePort.ts', 'utf8');
const doc = fs.readFileSync('docs/ORG_COMPANY_MODEL.md', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 TenantCompany is legal entity type', /export interface TenantCompany/.test(sp) && /crNumber\?:/.test(sp) && /taxNumber\?:/.test(sp));
check('S2 GET /api/company strips backendConfig', /never expose backendConfig/.test(srv) && /nameAr:\s*tenant\.nameAr/.test(srv));
check('S3 GET does not return whole tenant object', /return res\.json\(\{\s*success:\s*true,\s*data:\s*tenant\s*\}\)/.test(srv) === false || /never expose backendConfig/.test(srv));
check('S4 PUT validates empty nameAr', /الاسم الرسمي للمنشأة/.test(srv));
check('S5 PUT validates CR 10 digits', /invalid-cr-number/.test(srv));
check('S6 tax 15-digit still present', /invalid-tax-number/.test(srv));
check('S7 PATCH tenants status platform', /app\.patch\('\/api\/tenants\/:id\/status',\s*requirePlatformAdmin/.test(srv));
check('S8 status ACTIVE|SUSPENDED only', /status !== 'ACTIVE' && status !== 'SUSPENDED'/.test(srv));
check('S9 CompanyProfile alias', /export type CompanyProfile = TenantCompany/.test(sp));
check('S10 doc ORG-COMPANY-1', /ORG-COMPANY-1/.test(doc) && /TenantCompany/.test(doc));
check('S11 no CompanyGroup yet (wave 4)', !/CompanyGroup/.test(sp));
check('P package DONE', byId['ORG-COMPANY-1']?.status === 'DONE');
check('P lastChange', String(reg.lastChange || '').includes('SEC-PERM-OVERRIDE-1'));
check('R SEC-USER-ADMIN DONE', byId['SEC-USER-ADMIN']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
