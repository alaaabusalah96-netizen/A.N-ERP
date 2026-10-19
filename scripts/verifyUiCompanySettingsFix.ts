/**
 * @file verifyUiCompanySettingsFix.ts
 * UI-COMPANY-SETTINGS-FIX — company settings session + idempotency + validation.
 * Run: npx tsx scripts/verifyUiCompanySettingsFix.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const view = fs.readFileSync('src/components/CompanySettingsView.tsx', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 GET /api/company uses credentials include', /fetch\('\/api\/company',\s*\{\s*credentials:\s*'include'\s*\}\)/.test(view));
check('S2 PUT /api/company uses credentials include', /method:\s*'PUT'[\s\S]{0,200}credentials:\s*'include'/.test(view));
check('S3 PUT sends Idempotency-Key header', /'Idempotency-Key'/.test(view));
check('S4 client validates CR as 10 digits', /\d{10}/.test(view) && /السجل التجاري/.test(view));
check('S5 client validates tax as 15 digits', /\d{15}/.test(view));
check('S6 PUT body does not send backendConfig', /payload\s*=\s*\{[\s\S]*?nameAr[\s\S]*?\}/.test(view) && !/JSON\.stringify\(formData\)/.test(view));
check('S7 load merges fields without wiping form defaults blindly', /setFormData\(\(prev\)\s*=>/.test(view));
check('S8 non-OK responses surface detail', /data\.detail/.test(view));
check('S9 package UI-COMPANY-SETTINGS-FIX DONE', byId['UI-COMPANY-SETTINGS-FIX']?.status === 'DONE');
check('S10 previous OPS-PROD-LAUNCH-1 remains DONE', byId['OPS-PROD-LAUNCH-1']?.status === 'DONE');
check('S11 lastChange mentions UI-COMPANY-SETTINGS-FIX', String(reg.lastChange || '').includes('UI-COMPANY-SETTINGS-FIX'));
check('S12 CompanySettingsView still the settings screen title', /إعدادات المنشأة والنظام/.test(view));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
