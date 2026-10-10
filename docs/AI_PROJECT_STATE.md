# A.N ERP — PROJECT STATE (v7.2.0)

**Last update**: 2026-10-10 (SEC-4)  
**Verdict**: **CONDITIONAL GO**

## SEC-4
- Guide: `docs/ops/PROD-PG-ROLE.md` (NOSUPERUSER + NOBYPASSRLS app role)
- Probe: `scripts/verifySec4ProdRole.ts`
- Default: WARN if role bypasses; strict fail with `AN_ENFORCE_PROD_ROLE=1`

## Defects
| ID | Status |
|---|---|
| DEF-P2-002 | FIXED |
| PROD-ROLE-BYPASSRLS | **DOCUMENTED + PROBE** (enforce on prod with AN_ENFORCE_PROD_ROLE=1) |
