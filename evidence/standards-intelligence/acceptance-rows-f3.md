# Standards Intelligence — F3 acceptance rows (Foundation §23)

Scope of F3: `RuleExplanationService`, `DecisionPostingBridge` (through the unchanged `PostingEngine`), three read-only `GET /api/standards/*` routes (F3a); the acceptance suite on InMemory and PostgreSQL (F3b); documentation (F3c).
**Every rule used in these tests is a `ZZ-F3B-*` test fixture with `sourceReference = F3B-FIXTURE-ONLY`. It is not accounting content.** Rows below therefore prove the **mechanism**, not coverage of any real standard. Real coverage is in `docs/STANDARDS_COVERAGE_MATRIX.md` (all 32 catalogue standards: NOT_IMPLEMENTED).

Evidence: `battery-output-f3b.txt` (InMemory, `Passed: 19 | Failed: 0`), `battery-output-f3b-pg.txt` (PostgreSQL, `Passed: 23 | Failed: 0`, no SKIP), `battery-output-f3a.txt`, `tsc-output-f3a.txt`, `tsc-output-f3b.txt`.

| # | §23 requirement | Evidence (`scripts/lib/f3AcceptanceSuite.ts` unless noted) | Result | What it does NOT prove |
|---|---|---|---|---|
| 1 | Inventory purchase selects inventory/accounting/tax path | F3-1 | Mechanism proven, InMemory + PostgreSQL | No real IAS 2 / EAS rule exists; the inventory module does not call the decision layer yet |
| 2 | Sales selects revenue/inventory/tax path | F3-2 | Mechanism proven, InMemory + PostgreSQL | No sales module in the application; test events only |
| 3 | Foreign currency uses effective-date FX rules | F3-3 | Mechanism proven (v1/v2 by transaction date; missing fact -> REVIEW) | The exchange rate is a caller-supplied fact; no FX module; IAS 21 / EAS 13 are NOT_IMPLEMENTED |
| 4 | Fixed-asset acquisition identifies capitalization/depreciation treatment | F3-4 | Mechanism proven (capitalize vs expense by a fact; depreciation as its own rule) | The capitalization threshold is not computed from a policy value; no fixed-asset module; IAS 16 NOT_IMPLEMENTED |
| 5 | Missing fact -> REVIEW_REQUIRED, no guess | F3-5, F3-3, F3-4 | Proven, InMemory + PostgreSQL | — |
| 6 | Jurisdiction change gives a different rule | F3-6 (IFRS pack vs EAS pack) | Mechanism proven | Fixture rules only; EAS vs IFRS differences are not asserted |
| 7 | Historical transaction resolves by effective-date rule | F3-7 (2024 -> v1, 2025 -> v2, stored explanation keeps v1) | Proven, InMemory + PostgreSQL | — |
| 8 | Each journal carries a durable ruleId/standard/version reference | F3-8 (12 journals found by journal id with rule, version, standard, framework, jurisdiction) | Proven for journals created through `DecisionPostingBridge` | Journals posted by existing modules (inventory, purchasing, ...) carry no decision |
| 9 | "Why was this entry posted?" returns a complete explanation | F3-9, F3-9b, F3-13, smoke 14/14; durability `PGD1` (fresh adapter instance, PostgreSQL only) | Proven | Legacy journals answer "no standards decision" by design |
| 10 | PostingEngine and StoragePort stay the posting/persistence paths | F3-10, static S1-S3, PostgreSQL `PGJ1` (6 parallel calls -> one journal, account moved once) | Proven | — |
| 11 | `tsc --noEmit` passes | `tsc-output-f3a.txt`, `tsc-output-f3b.txt`; Studio reports 0 errors before and after each phase | Reported by the executing tool | Not re-run independently by the author (no `@types/node` in the authoring sandbox) |
| 12 | Primary adapter integration tests pass | `battery-output-f3b-pg.txt` 23/23 (PGJ1 race, PGD1 durability, PGD2 raw rows, PGI1 isolation); earlier gates reported: seed `0 0 0`, phase 7.6 11/11, F1 PG 67, F2 PG 54 | Proven on PostgreSQL | RLS isolation here is adapter-level scoping; the DB role bypasses RLS (the F2 PGR2 probe-role check covers the decision table) |
| 13 | Evidence stored under `evidence/standards-intelligence/` | this folder | Done | — |

## Rows that stay OPEN (honest list)
1. **Real accounting content** — no real IFRS/EAS rule and no tax rate is registered; every catalogue standard is NOT_IMPLEMENTED. Closing it needs official source texts and effective dates, one rule at a time (see `docs/ACCOUNTING_RULE_AUTHORING_GUIDE.md`).
2. **Module wiring** — inventory, purchasing, stock accounting and the other modules still post through their own paths and do not emit events to the decision layer. Sales, FX and fixed-asset modules do not exist yet.
3. **Post-and-link atomicity** — `PostingEngine` is unchanged, so posting and linking are two writes; failure between them is reported and re-run is idempotent, but it is not one transaction.
4. **Link validation** — `linkDecisionToJournal` does not check that the journal exists (F2 storage design); the explanation reports it as `found=false`.
5. **Version control** — the executing workspace was not a git repository (`NO_GIT`), so no commit/push evidence exists for F3a-F3c; earlier reported commit ids cannot be tied to this tree.
