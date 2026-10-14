# PG-PROOF & SEC-2c Audit Evidence Summary
Date: 2026-10-14
Environment: STAGING / TEST DB (PostgreSQL via DATABASE_URL)

## Findings Summary
- an_audit_trail: tenant_id = YES, ENABLE_RLS = YES, FORCE_RLS = YES, POLICY = an_audit_trail_tenant_isolation_policy, CENTRAL_ARRAY = YES, LIVE_VERIFIED = YES.
- an_company_profiles: tenant_id = YES, ENABLE_RLS = YES, FORCE_RLS = YES, POLICY = an_company_profiles_tenant_isolation_policy, CENTRAL_ARRAY = YES, LIVE_VERIFIED = YES.
- an_custom_fields: tenant_id = YES, ENABLE_RLS = YES, FORCE_RLS = YES, POLICY = an_custom_fields_tenant_isolation_policy, CENTRAL_ARRAY = YES, LIVE_VERIFIED = YES.

## Decision
SEC-2c static alert regarding the three tables was a static false positive. Code inspection and live tests confirm all three tables are included in the central RLS array (`tables text[]`) in `PostgresPrimaryAdapter.ts` and have explicit `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and tenant isolation policies enforced.

## PG-PROOF
Role: postgres
rolsuper: false
rolbypassrls: true (Warning logged correctly under strict prod check)
rolcanlogin: true
