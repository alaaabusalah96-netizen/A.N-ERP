# Reconcile Audit B — 2026-10-17
Verdict: NO_GO
F07: PASS
DATABASE_URL: set

| Gate | Status | Passed | Failed | Expected |
|---|---|---|---|---|
| Sec1TwoFactor | PASS | 26 | 0 | 26 |
| Sec2Rls | PASS | 39 | 0 | 39 |
| Sec2bRls | PASS | 16 | 0 | 16 |
| Sec3Ids | PASS | 7 | 0 | 7 |
| Sec4ProdRole | PASS | 6 | 0 | 6 |
| SecProdRole | PASS | 13 | 0 | 13 |
| SecA | PASS | 27 | 0 | 27 |
| FixC | PASS | 14 | 0 | 14 |
| FixP1Custody | PASS | 9 | 0 | 9 |
| RepairBatch1 | PASS | 37 | 0 | 37 |
| P8aProcurement | PASS | 24 | 0 | 24 |
| P8cThreeWay | PASS | 14 | 0 | 14 |
| P8cFix | FAIL | 21 | 1 | 22 |
| P15Purchasing | PASS | 25 | 0 | 25 |
| P10StockAtomicMem | PASS | 12 | 0 | 12 |
| P11TransfersMem | PASS | 12 | 0 | 12 |
| P12ApprovalsMem | PASS | 35 | 0 | 35 |
| P13Costing | PASS | 50 | 0 | 50 |
| P14AutoJournals | PASS | 24 | 0 | 24 |
| P16Recon | PASS | 14 | 0 | 14 |
| P17Attachments | PASS | 29 | 0 | 29 |
| P18WarehouseScope | PASS | 19 | 0 | 19 |
| P2002Migrations | PASS | 8 | 0 | 8 |
| F1Standards | PASS | 71 | 0 | 71 |
| F2Decisions | PASS | 51 | 0 | 51 |
| F3Acceptance | PASS | 19 | 0 | 19 |
| F4StockShadow | PASS | 14 | 0 | 14 |
| FixJ1Accounts | PASS | 24 | 0 | 24 |
| FixStockReturnCumulative | PASS | 18 | 0 | 18 |
| PgDateMapping | PASS | 14 | 0 | 14 |
| PgMovementLogic | PASS | 4 | 0 | 4 |
| FixP1P2pAutopost | PASS | 8 | 0 | 8 |
| Ph8InvTab | PASS | 14 | 0 | 14 |
| Ph8Return | PASS | 18 | 0 | 18 |
| Ph8Reorder | PASS | 14 | 0 | 14 |
| InvItemCard | PASS | 13 | 0 | 13 |
| InvUiTabs | PASS | 12 | 0 | 12 |
| InvMovementsFilter | PASS | 14 | 0 | — |
| Db1 | PASS | 20 | 0 | — |
| Ops1 | PASS | 28 | 0 | 28 |
| DocSyncFull | PASS | 19 | 0 | 19 |
| BatteryCoverage | PASS | 19 | 0 | 19 |
| AuditWire | FAIL | 26 | 2 | 28 |
| SecRoleCeiling | ERROR | — | — | 24 |
| BaselineMap | FAIL | 11 | 1 | 12 |
| SecAuthMatrix | FAIL | 18 | 1 | 18 |
| SecSessionPassword | FAIL | 14 | 1 | 15 |
| SecUserAdmin | FAIL | 14 | 1 | 15 |
| OrgCompany1 | FAIL | 13 | 1 | 14 |
| SecPasswordUx | FAIL | 14 | 1 | 15 |
| SecPermOverride | FAIL | 15 | 1 | 16 |
| UiUsers1 | FAIL | 14 | 1 | 15 |
| UiOps1 | FAIL | 13 | 1 | 14 |
| UiP2p1 | FAIL | 12 | 1 | 13 |
| Ui2faSetup1 | FAIL | 12 | 1 | 13 |
| UiAuditPrint1 | PASS | 14 | 0 | 14 |
| DemoLoginRoles1 | FAIL | 16 | 1 | 16 |
| OrgMembership1 | PASS | 13 | 0 | 13 |
| P9Validation | PASS | 144 | 0 | — |

F07: PASS (passed=8 failed=0)

> Live snapshot of this run. Canonical state: AI_CONTEXT.md + docs/AI_PROJECT_STATE.* (rendered from docs/STATE_REGISTER.json).
