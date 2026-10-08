# Accounting Rule Authoring Guide

Audience: an accountant or developer adding a rule **from an authoritative source**. Do not write a rule from memory. If you cannot cite the source text and the effective date, the rule stays `SOURCE_REQUIRED` and posts nothing.

## 1. Before you start (all mandatory)
1. The **standard** exists in the catalogue (`StandardsRegistry`) and its coverage is `PARTIAL` or `IMPLEMENTED` with a `coverageEvidenceRef` and a verified source. Otherwise registration of an `ACTIVE` rule fails with `standard-not-covered`.
2. The **jurisdiction** exists and its framework equals the rule framework (`framework-mismatch`). Accounting rules go to a reporting jurisdiction; tax rules go to a `TAX` jurisdiction through `TaxRuleRegistry` (`tax-separation`, SI-8).
3. You have: the official reference (`sourceReference`), the effective date, and any end date.

## 2. Rule fields
| Field | Meaning |
|---|---|
| `ruleId`, `version` | Id stays the same across versions; a new version never edits an old one. Windows of two versions may not overlap. |
| `standardId`, `framework`, `jurisdictionId`, `eventType` | Where and for which event the rule applies. |
| `tier` (1-5) and `priority` | Precedence: 1 law, 2 accounting standard, 3 official local override, 4 company policy, 5 operational. A lower tier never overrides a mandatory higher one; equal tier and priority with different treatments is a conflict -> `REVIEW_REQUIRED`. |
| `conditions` | Facts that must hold. Grammar: `{ fact: literal \| { eq, ne, in, notIn, gt, gte, lt, lte, exists } }`. A needed fact that is absent is reported missing. |
| `treatment` | `lines[]` of `{ side: DEBIT\|CREDIT, role, amount }`, plus optional `measurementBasis`, `recognitionTiming`, `reversal`, `inventoryEffect`. **Account ROLES only, never account numbers** (`account-number-forbidden`). Roles map to codes through the tenant's configured map. |
| amount expressions | `{ const: n }`, `{ fact: name }`, `{ add\|sub\|mul: [..] }`, `{ div: [a, b] }`, `{ taxOn: expr }`. |
| `requiredData` | Facts that must be present or the decision is `REVIEW_REQUIRED`. |
| `exceptions` | Evaluated in array order: `NOT_APPLICABLE` or `REVIEW_REQUIRED` actions. |
| `policyOption` | `policyKey=value`, so the rule applies only when the company's effective-dated policy has that value (e.g. `inventory_valuation_method=FIFO`). |
| `effectiveFrom` / `effectiveTo` | Transaction-date window (inclusive). |
| `sourceReference`, `sourceVerified`, `status` | `ACTIVE` requires a verified source. Only `ACTIVE` can drive automatic posting; `SOURCE_REQUIRED`, `REFERENCE_ONLY`, `DRAFT`, `SUPERSEDED` and `RETIRED` never do (SI-6). The database enforces it too: an `ACTIVE` row without a verified source, a source reference and a real effective date is rejected by a CHECK constraint. |

## 3. Tax rules
Separate registry and domain. A rate (`0..1`) requires a verified source (`unverified-rate`); no default rates. The accounting rule references tax only through `taxOn` and a `VAT_*` style role; the tax rule decides the rate by transaction date.

## 4. Process
1. Draft the rule as `DRAFT` or `SOURCE_REQUIRED` and review the text against the official source.
2. Register it; fix any registration error (they are specific).
3. Test with at least: a normal case, a boundary date (last day of the old version, first day of the new), a missing fact, and a case where the policy alternative changes the result.
4. Promote to `ACTIVE` by registering the new version with the verified source and effective date. Never edit a published version.
5. Update `STANDARDS_COVERAGE_MATRIX.md` only after steps 1-4, with evidence.

## 5. Prohibitions
- No invented rules, rates, dates or EAS numbers to make the coverage matrix look complete.
- No account numbers inside a rule.
- No rule for a standard that is still `NOT_IMPLEMENTED`.
- Never copy a `ZZ-*` test fixture into production data.
