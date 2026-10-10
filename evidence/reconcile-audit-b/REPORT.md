# Reconcile Audit B — 2026-10-10
Verdict: CONDITIONAL_GO
F07: PASS
DATABASE_URL: set

| Gate | Status | Passed | Failed | Expected |
|---|---|---|---|---|
| Sec1TwoFactor | PASS | 26 | 0 | 26 |
| Sec2Rls | PASS | 39 | 0 | 39 |
| P8aProcurement | PASS | 24 | 0 | 24 |
| P8cThreeWay | PASS | 14 | 0 | 14 |
| P8cFix | PASS | 22 | 0 | 19 |
| P15Purchasing | PASS | 25 | 0 | 25 |
| F3Acceptance | PASS | 19 | 0 | 19 |
| F2Decisions | FAIL | 50 | 1 | 51 |
| F4StockShadow | PASS | 14 | 0 | 14 |
| P13Costing | PASS | 50 | 0 | 50 |
| F07StorageRouter | PASS | 8 | 0 | - |

Hard failures: F2Decisions
