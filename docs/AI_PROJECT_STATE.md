# A.N ERP — PROJECT STATE (v7.2.0)

**Last update**: 2026-10-10 (SEC-3)  
**Verdict**: **CONDITIONAL GO**

## SEC-3
- `UNIQUE (tenant_id, code)` on `an_journal_entries`
- Reverse journal id/code derived from original entry (not Date.now)
- Boot guard: `NODE_ENV=production` or `AN_REQUIRE_DATABASE=1` requires `DATABASE_URL` (no silent InMemory)
- Test: `scripts/verifySec3Ids.ts`

## Prior
SEC-1 · SEC-2 · SEC-2b · FIX-J1 · F2-S1 · P9 · EVID-1

## Defects
| ID | Status |
|---|---|
| DEF-P2-002 | OPEN |
| PROD-ROLE-BYPASSRLS | CHECK |
