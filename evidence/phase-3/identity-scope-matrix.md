# Phase 3 Identity / Organization / Tenant Source of Truth / Membership Scope Matrix

| Invariant | Evidence Source | Current State | Test | Result | Phase |
| :--- | :--- | :--- | :--- | :--- | :--- |
| I1 — Tenant Source of Truth | server.ts (requireAuth authContext extraction & immutable tenant context) | ALREADY_APPLIED | TEST-06, TEST-10 | PASS | 3 |
| I2 — Membership | server.ts (active membership verification in requireAuth & login) | PATCHED | TEST-01 | PASS | 3 |
| I3 — Role Assignment | src/core/auth/PermissionMatrix.ts (requirePermission RBAC matrix enforcement) | ALREADY_APPLIED | TEST-02 | PASS | 3 |
| I4 — Org Scope | src/core/org/OrgHierarchyService.ts (canAccessNode, getVisibleScope) | ALREADY_APPLIED | TEST-03, TEST-04, TEST-05 | PASS | 3 |
| I5 — OrgNode Authority | src/core/storage/adapters/PostgresPrimaryAdapter.ts (an_org_nodes & recursive CTE) | ALREADY_APPLIED | TEST-09 | PASS | 3 |
| I6 — Tenant Isolation | server.ts (strictly tenant-scoped handlers) & PostgresPrimaryAdapter.ts | ALREADY_APPLIED | TEST-07 | PASS | 3 |
| I7 — Zero Access | server.ts (requireAuth + requirePermission deny by default without active role/membership) | PATCHED | TEST-01, TEST-02 | PASS | 3 |
| I8 — Seed | server.ts (initSeedUsers idempotency checks) & PostgresPrimaryAdapter.ts | ALREADY_APPLIED | TEST-08 | PASS | 3 |

TOTAL_INVARIANTS=8
PASS=8
FAIL=0
NOT_RUN=0
PATCHED=2
ALREADY_APPLIED=6
