# PH8-CLOSE-1 — acceptance rows (wire unwired gates into `npm test`)

Adapter: none (static/file checks) for the new guard; the wired scripts run on InMemory (two of them have a PostgreSQL branch, see below).

| # | Requirement | Evidence | Status |
|---|---|---|---|
| 1 | The nine gates that were outside `npm test` are now batteries with expected counts (FixP1P2pAutopost 8, Ph8InvTab 14, Ph8Return 18, Ph8Reorder 14, InvItemCard 13, InvMovementsFilter 14, Db1 20, Ops1 28, DocSyncFull 19) | `BATTERIES` in `scripts/runReconcileAuditB.ts` + `verifyBatteryCoverage.ts` C10 | covered |
| 2 | `verifyDocSyncFull` S7 no longer pinned to `DOC-SYNC-FULL` (it now requires `lastChange` to name the register's most recent package) | `verifyDocSyncFull.ts` (19/0) | covered |
| 3 | A new `scripts/verify*.ts` cannot stay outside the battery unnoticed | `verifyBatteryCoverage.ts` C2 + `scripts/lib/batteryExemptions.json` | covered (static) |
| 4 | Register records the package | `docs/STATE_REGISTER.json` (`PH8-CLOSE-1`) | covered |

Not proven here: the full `npm test` run on a database (InvMovementsFilter and Db1 have a PostgreSQL branch; with `DATABASE_URL` set their expected count is not enforced, only their exit code). 28 older scripts remain exempted ("baseline") and are not triaged by this package. `verifyP9FailClosed` does not run to a summary in a no-database sandbox and is exempted with that reason.
