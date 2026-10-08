# Standards Intelligence — F2 acceptance rows

Scope of F2: RuleEvaluationEngine + AccountingTreatmentEngine + durable AccountingDecision (storage on the 5 adapters).
Wiring into real modules (PostingEngine / inventory) and the explanation API/UI are F3 and are NOT claimed here.

| # | Row | Evidence (scripts/verifyF2Decisions.ts unless noted) | Status |
|---|-----|-----|-----|
| F2-1 | Deterministic rule selection by explicit precedence (tier, priority, id); a lower tier never overrides a mandatory rule | 5.1, 5.3, 7.2 | InMemory run |
| F2-2 | Conflicting rules of equal precedence, missing facts, unevaluable higher rule, malformed rule -> REVIEW_REQUIRED (never a guess) | 1.5, 1.7, 5.2, 5.6, 5.8, 5.9 | InMemory run |
| F2-3 | SI-6: SOURCE_REQUIRED / REFERENCE_ONLY / DRAFT rules never drive automatic posting | 5.4, 5.5, 6.4 | InMemory run |
| F2-4 | Treatment is structured: account ROLES -> codes only via configured map; unknown account, negative amount, unbalanced or malformed treatment -> REVIEW_REQUIRED | 1.1-1.3, 1.6, 1.8, 5.10 | InMemory run |
| F2-5 | Effective-date/version correctness for accounting rules, tax rules and policy choices | 2.1, 2.2, 4.2, 6.5 | InMemory run |
| F2-6 | Jurisdiction/framework difference changes the applicable rule | 3.1, 3.2 | InMemory run |
| F2-7 | Tax is a separate domain and is reconciled with the accounting treatment before posting | 6.1-6.5 | InMemory run |
| F2-8 | Durable decision record: replay-safe, immutable, linked once to a journal, tenant-isolated, bilingual explanation | 8.1-8.8 | logic: InMemory; persistence/RLS/concurrency: needs `battery-output-f2-pg.txt` |
| F2-9 | DB-level guards (APPLY needs a rule reference, link only on APPLY, unique decision key) and RLS on the decision table | PGD1-PGD5, PGR2 in `verifyF2DecisionsPg.ts` | needs PG run |
| F2-10 | The decision layer never posts (no PostingEngine/journal write in its code) | S6 | InMemory run (static) |

Rows of Foundation §23 that remain open for F3: real inventory/sales/FX/asset paths through PostingEngine, `ruleId` on posted journals,
"why was this posted?" API, historical re-evaluation on real documents. PostgreSQL rows are valid only if `battery-output-f2-pg.txt` shows no `PG_NOT_RUN`/`SKIP`.
