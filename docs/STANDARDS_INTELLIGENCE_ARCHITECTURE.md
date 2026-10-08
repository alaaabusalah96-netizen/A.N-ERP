# Standards Intelligence — Architecture (as built at the close of F3)

Principle: **the standards layer decides, `PostingEngine` posts, `StoragePort` persists.** Nothing in the decision path writes a journal.

```
 business event (module, date, facts, jurisdictions)
        |
        v
 StandardsDecisionService.decide()  ── RuleEvaluationEngine ── registries (rules, tax rules, policies; effective-dated)
        |                         └─ AccountingTreatmentEngine (account ROLES -> codes via configured map only)
        v
 AccountingDecision  (immutable, replay-safe, tenant-isolated, stored via StoragePort)
   status: APPLY | REVIEW_REQUIRED | NOT_APPLICABLE | REJECT
        |  (APPLY + DETERMINISTIC only)
        v
 DecisionPostingBridge.postDecision()  ──►  existing PostingEngine.draftEntry / postEntry  ──►  StoragePort journal
        |                                                                                         |
        └── linkDecisionToJournal (one-way, once) ◄──────────────────────────────────────────────┘
        v
 RuleExplanationService  ──►  GET /api/standards/explain/journal/:entryId | /decision/:id | /decisions
```

## Layers and files (`src/core/standards/`)
| Layer | Files | Responsibility |
|---|---|---|
| Reference data (global, append-only) | `standardsTypes.ts`, `registries.ts`, `seedCatalogue.ts` | Standards, jurisdictions, accounting rules, tax rules (separate registry, SI-8). Versioned and effective-dated; a published version is never edited. |
| Company choices (per tenant, RLS) | `AccountingPolicyRegistry` in `registries.ts` | Policy options (e.g. inventory valuation method) as versioned, effective-dated facts. |
| Date logic | `EffectiveDateResolver.ts` | Pure, deterministic version selection by transaction date; early adoption only when configured. |
| Evaluation | `RuleEvaluationEngine.ts`, `conditions.ts` | Precedence tiers (law, standard, local override, policy, operational), conflicts, missing facts, SI-6 gate. No I/O, no eval. |
| Treatment | `AccountingTreatmentEngine.ts` | Turns a rule into balanced posting instructions with account roles; unknown role/negative/unbalanced -> `REVIEW_REQUIRED`. |
| Decision record | `StandardsDecisionService.ts`, `decisionTypes.ts` | Stores the decision with facts, framework, jurisdiction, standard, rule+version, policy, tax treatment, bilingual explanation. |
| Posting bridge (F3a) | `DecisionPostingBridge.ts` | The only place that turns a decision into a journal, through the unchanged `PostingEngine`. |
| Explanation (F3a) | `RuleExplanationService.ts` | Read-only "why was this posted?"; compares the posted journal with the stored treatment line by line. |

## Guarantees that are tested
- Fail closed: missing fact, conflicting rules, non-automatable status (`SOURCE_REQUIRED`/`REFERENCE_ONLY`/`DRAFT`), unmapped account role, tax review -> `REVIEW_REQUIRED`; the bridge refuses to post anything else than `APPLY` + `DETERMINISTIC`.
- One decision -> at most one journal, also under 6 parallel callers (PostgreSQL gate `PGJ1`).
- Tenant isolation on decisions and explanations (RLS on `an_accounting_decisions` and `an_accounting_policies`; adapters scope by `tenantId`).
- Explanations survive a restart: a fresh adapter instance explains the journal from PostgreSQL alone (`PGD1`).
- Routes: three `GET` routes under `/api/standards`, behind `requireAuth` + `requirePermission` (`ENTRY_VIEW` for journal explanation, `AUDIT_LOG_VIEW` for decisions).

## Known limits (stated, not hidden)
1. **Not wired into existing modules.** Inventory, purchasing, stock accounting and other modules still post through their own paths. Only journals created by `DecisionPostingBridge` carry a decision (and therefore a durable `ruleId`/version/standard). Asking "why was this posted?" about a legacy journal returns an explicit "no standards decision" answer.
2. **Post then link is not one transaction.** `PostingEngine` is unchanged and owns its own persistence, so if a journal posts and the link write fails, the error is returned and the pair must be re-linked; re-running `postDecision` is idempotent by design (same journal id and idempotency keys).
3. **The link does not verify the journal exists** (F2 storage design). `RuleExplanationService` reports a missing linked journal as `found=false` instead of hiding it.
4. **No official content yet.** See `STANDARDS_COVERAGE_MATRIX.md`: every real standard is `NOT_IMPLEMENTED` and no real rule or tax rate is registered.
5. **Sales, foreign-currency and fixed-asset modules do not exist in the application yet.** Their acceptance scenarios run on test events and test rules only.
