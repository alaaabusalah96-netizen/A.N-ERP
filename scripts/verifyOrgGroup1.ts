/**
 * @file verifyOrgGroup1.ts
 * ORG-GROUP-1 — company groups at platform level.
 * Run: npx tsx scripts/verifyOrgGroup1.ts
 */
import fs from 'fs';
import {
  validateNewGroupInput,
  assertTenantCanJoin,
  buildCompanyGroup,
} from '../src/core/org/CompanyGroupService';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const port = fs.readFileSync('src/core/storage/StoragePort.ts', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');
const mem = fs.readFileSync('src/core/storage/adapters/InMemoryAdapter.ts', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 CompanyGroup interface in StoragePort', /interface CompanyGroup/.test(port));
check('S2 StoragePort lists group methods', /listCompanyGroups\(/.test(port) && /getCompanyGroup\(/.test(port) && /saveCompanyGroup\(/.test(port));
check('S3 InMemory implements list/get/save', /listCompanyGroups/.test(mem) && /companyGroups/.test(mem));
check('S4 validate rejects empty code', !validateNewGroupInput({ code: '', nameAr: 'مجموعة' }).ok);
check('S5 validate accepts valid input', validateNewGroupInput({ code: 'HOLD', nameAr: 'القابضة' }).ok);
check('S6 buildCompanyGroup sets ACTIVE and id prefix', (() => {
  const g = buildCompanyGroup({ code: 'HOLD', nameAr: 'القابضة' });
  return g.status === 'ACTIVE' && g.id.startsWith('GRP-') && g.memberTenantIds.length === 0;
})());
check('S7 assertTenantCanJoin rejects unknown tenant', !assertTenantCanJoin('T-X', [], buildCompanyGroup({ code: 'G', nameAr: 'ج' })).ok);
check('S8 assertTenantCanJoin accepts known tenant', assertTenantCanJoin('T1', [{ id: 'T1' } as any], buildCompanyGroup({ code: 'G', nameAr: 'ج' })).ok);
check('S9 assertTenantCanJoin rejects duplicate member', !assertTenantCanJoin(
  'T1',
  [{ id: 'T1' } as any],
  { ...buildCompanyGroup({ code: 'G', nameAr: 'ج' }), memberTenantIds: ['T1'] },
).ok);
check('S10 GET /api/groups is platform-admin', /app\.get\('\/api\/groups',\s*requirePlatformAdmin/.test(server));
check('S11 POST /api/groups is platform-admin', /app\.post\('\/api\/groups',\s*requirePlatformAdmin/.test(server));
check('S12 members routes exist', /app\.post\('\/api\/groups\/:id\/members'/.test(server) && /app\.delete\('\/api\/groups\/:id\/members\/:tenantId'/.test(server));
check('R1 ORG-GROUP-1 DONE', byId['ORG-GROUP-1']?.status === 'DONE');
check('R2 ORG-COMPANY-1 remains DONE', byId['ORG-COMPANY-1']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
