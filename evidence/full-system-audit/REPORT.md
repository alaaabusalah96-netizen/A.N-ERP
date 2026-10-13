# Full System Audit Report

- Date: 2026-10-13T09:28:10.317Z
- Verdict: **GO_AUDIT**
- Required failures: 0
- Optional failures: 0
- DATABASE_URL: set
- AN_ENFORCE_PROD_ROLE: 0

| Group | Id | OK | Required | Detail |
|---|---|---|---|---|
| A-BUILD | tsc | yes | yes | 0 errors |
| A-BUILD | build | yes | yes | vite+server bundle ok |
| B-BATTERY | reconcile-audit-b | yes | yes | exit=0 Passed=null Failed=null Verdict=CONDITIONAL_GO |
| C-DOMAIN | FixP1Custody | yes | yes | exit=0 Passed=9 Failed=0 |
| C-DOMAIN | FixP1P2pAutopost | yes | yes | exit=0 Passed=8 Failed=0 |
| C-DOMAIN | FixStockReturnCumulative | yes | yes | exit=0 Passed=18 Failed=0 |
| C-DOMAIN | SecA | yes | yes | exit=0 Passed=27 Failed=0 |
| C-DOMAIN | P15Purchasing | yes | yes | exit=0 Passed=25 Failed=0 |
| C-DOMAIN | P13Costing | yes |  | exit=0 Passed=50 Failed=0 |
| C-DOMAIN | P14AutoJournals | yes |  | exit=0 Passed=24 Failed=0 |
| C-DOMAIN | P16Recon | yes |  | exit=0 Passed=14 Failed=0 |
| C-DOMAIN | SecProdRole | yes | yes | exit=0 Passed=13 Failed=0 |
| D-PG | Sec4ProdRole | yes |  | exit=0 Passed=6 Failed=0 |
| D-PG | Sec2bRls | yes |  | exit=0 Passed=16 Failed=0 |
| D-PG | SecAPg | yes |  | exit=0 Passed=5 Failed=0 |

## Notes
- Main battery = `scripts/runReconcileAuditB.ts` (same as `npm test`).
- PG isolation is only proven when DATABASE_URL uses NOSUPERUSER NOBYPASSRLS and optionally AN_ENFORCE_PROD_ROLE=1.
- This report does not replace STATE_REGISTER; run `npx tsx scripts/runReconcileAuditB.ts --docs-only` after fixing failures.
