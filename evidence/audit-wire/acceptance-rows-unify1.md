# AUDIT-UNIFY-1 — acceptance rows (remove contradictions inside the audit itself)

Adapter: none (static checks on files). No production logic changes.

| # | Requirement | Evidence | Status |
|---|---|---|---|
| 1 | The orphan `scripts/verifyAuditWire.ts` (over-escaped regexes, assertions about a register state that never existed; it failed 14 of 16 checks and left `verifyBatteryCoverage` C2 red) is replaced by correct invariants and wired into `npm test` (expected 27) | `verifyAuditWire.ts` 27/0, `BATTERIES` | covered |
| 2 | Financial / integrity gates are CRITICAL: FixP1P2pAutopost, Ph8Return, FixJ1Accounts, FixStockReturnCumulative, plus the two audit guards (BatteryCoverage, AuditWire); no CRITICAL name is dangling | `CRITICAL` in `runReconcileAuditB.ts` + AuditWire K-checks | covered |
| 3 | Register no longer contradicts itself: `DEF-P1-003` evidence said "still OPEN" while `DEF-CUSTODY-REVERSAL-DOUBLE-REFUND` is FIXED; the SEC-2c "re-check an_company_profiles" risk is closed | `STATE_REGISTER.json`, AuditWire R-checks | covered |
| 4 | Every `tenant_id` table is covered by the RLS array or an explicit `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (static) | AuditWire S-checks | covered (static only) |

Not proven here: any live PostgreSQL isolation (needs a database role with NOSUPERUSER NOBYPASSRLS), and a full `npm test` run in this sandbox (the runner needs `npx tsx`; each gate was run individually and classified).
Behaviour change: a failure in the six gates above now gives NO_GO instead of a plain FAIL line.
