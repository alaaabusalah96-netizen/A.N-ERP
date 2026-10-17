/**
 * @file verifyOrgMembership1.ts
 * ORG-MEMBERSHIP-1 — static checks for membership routes + UI + sync.
 * Run: npx tsx scripts/verifyOrgMembership1.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const srv = fs.readFileSync('server.ts', 'utf8');
const us = fs.readFileSync('src/components/UsersAndSodView.tsx', 'utf8');
const doc = fs.readFileSync('docs/ORG_MEMBERSHIP_1.md', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 GET membership route', /\/api\/users\/:id\/membership/.test(srv) && /app\.get\(\s*'\/api\/users\/:id\/membership'/.test(srv));
check('S2 PATCH membership route', /app\.patch\(\s*'\/api\/users\/:id\/membership'/.test(srv));
check('S3 setMembershipStatus on user INACTIVE', /setMembershipStatus\(tenantId,\s*targetId,\s*'SUSPENDED'\)/.test(srv));
check('S4 setMembershipStatus on user ACTIVE', /setMembershipStatus\(tenantId,\s*targetId,\s*'ACTIVE'\)/.test(srv));
check('S5 no self-suspend', /لا يمكنك تعليق أو إلغاء عضويتك/.test(srv));
check('S6 UI handler', /handleMembershipStatus/.test(us));
check('S7 UI button', /تعليق عضوية/.test(us));
check('S8 credentials on membership patch', /\/membership/.test(us) && /credentials:\s*'include'/.test(us));
check('S9 doc', /ORG-MEMBERSHIP-1/.test(doc));
check('P package DONE', byId['ORG-MEMBERSHIP-1']?.status === 'DONE');
check('P lastChange', String(reg.lastChange || '').includes('ORG-MEMBERSHIP-1'));
check('R ORG-COMPANY-1 DONE', byId['ORG-COMPANY-1']?.status === 'DONE');
check('R DEMO-LOGIN-ROLES-1 DONE', byId['DEMO-LOGIN-ROLES-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
