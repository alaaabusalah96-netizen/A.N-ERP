# Standards Coverage Matrix

Generated from `src/core/standards/seedCatalogue.ts` (F1 catalogue) at the close of F3. It states what the system **actually** covers, not what it intends to cover (SI-6, SI-10).

## Reading this table
- **NOT_IMPLEMENTED** = the standard is only a catalogue entry. No rule exists, no effective date is asserted, no source is attached. A transaction that would need it ends in `REVIEW_REQUIRED` or stays on the module's existing path; **nothing is posted automatically on the strength of this standard**.
- A standard may be moved to `PARTIAL` or `IMPLEMENTED` only with a `coverageEvidenceRef` and a verified authoritative source, and an `ACTIVE` rule may only be registered against a standard that is `PARTIAL`/`IMPLEMENTED` (`standard-not-covered` otherwise). The database also rejects an `ACTIVE` rule without a source.
- Mapping EAS to IFRS (column in the seed) is a **topic correspondence with relation `UNVERIFIED`**. Mapping is not equivalence (SI-3).
- `EAS-REVENUE-PLACEHOLDER` and `EAS-LEASES-PLACEHOLDER` are placeholders: the EAS numbers for revenue and leases are not in the specification and must be confirmed from an official source before use. They are not invented numbers.

## Totals
- IFRS catalogue entries: 26 — all NOT_IMPLEMENTED
- EAS catalogue entries: 6 — all NOT_IMPLEMENTED
- Tax: jurisdiction `EG-TAX` exists as a **separate** domain (SI-8); **zero** tax rules are registered.
- Gulf: jurisdiction `GULF-PACK` is a placeholder (status PLACEHOLDER); no country pack exists yet.

| Standard | Title | Framework | Coverage | Source verified | Rules registered |
|---|---|---|---|---|---|
| IAS 2 | Inventories | IFRS | NOT_IMPLEMENTED | no | none |
| IAS 7 | Statement of Cash Flows | IFRS | NOT_IMPLEMENTED | no | none |
| IAS 8 | Basis of Preparation / Accounting Policies, Changes in Accounting Estimates and Errors | IFRS | NOT_IMPLEMENTED | no | none |
| IAS 10 | Events after Reporting Period | IFRS | NOT_IMPLEMENTED | no | none |
| IAS 12 | Income Taxes | IFRS | NOT_IMPLEMENTED | no | none |
| IAS 16 | Property, Plant and Equipment | IFRS | NOT_IMPLEMENTED | no | none |
| IAS 19 | Employee Benefits | IFRS | NOT_IMPLEMENTED | no | none |
| IAS 21 | The Effects of Changes in Foreign Exchange Rates | IFRS | NOT_IMPLEMENTED | no | none |
| IAS 23 | Borrowing Costs | IFRS | NOT_IMPLEMENTED | no | none |
| IAS 24 | Related Party Disclosures | IFRS | NOT_IMPLEMENTED | no | none |
| IAS 36 | Impairment of Assets | IFRS | NOT_IMPLEMENTED | no | none |
| IAS 37 | Provisions, Contingent Liabilities and Contingent Assets | IFRS | NOT_IMPLEMENTED | no | none |
| IAS 38 | Intangible Assets | IFRS | NOT_IMPLEMENTED | no | none |
| IAS 40 | Investment Property | IFRS | NOT_IMPLEMENTED | no | none |
| IAS 41 | Agriculture | IFRS | NOT_IMPLEMENTED | no | none |
| IFRS 5 | Non-current Assets Held for Sale and Discontinued Operations | IFRS | NOT_IMPLEMENTED | no | none |
| IFRS 7 | Financial Instruments: Disclosures | IFRS | NOT_IMPLEMENTED | no | none |
| IFRS 9 | Financial Instruments | IFRS | NOT_IMPLEMENTED | no | none |
| IFRS 10 | Consolidated Financial Statements | IFRS | NOT_IMPLEMENTED | no | none |
| IFRS 11 | Joint Arrangements | IFRS | NOT_IMPLEMENTED | no | none |
| IFRS 12 | Disclosure of Interests in Other Entities | IFRS | NOT_IMPLEMENTED | no | none |
| IFRS 13 | Fair Value Measurement | IFRS | NOT_IMPLEMENTED | no | none |
| IFRS 15 | Revenue from Contracts with Customers | IFRS | NOT_IMPLEMENTED | no | none |
| IFRS 16 | Leases | IFRS | NOT_IMPLEMENTED | no | none |
| IFRS 18 | Presentation and Disclosure in Financial Statements | IFRS | NOT_IMPLEMENTED | no | none |
| IFRS 19 | Subsidiaries without Public Accountability: Disclosures (where applicable) | IFRS | NOT_IMPLEMENTED | no | none |
| EAS 13 | Foreign exchange | EAS | NOT_IMPLEMENTED | no | none |
| EAS 17 | Separate financial statements | EAS | NOT_IMPLEMENTED | no | none |
| EAS 34 | Investment property | EAS | NOT_IMPLEMENTED | no | none |
| EAS 47 | Financial instruments | EAS | NOT_IMPLEMENTED | no | none |
| EAS-REVENUE-PLACEHOLDER | Revenue (EAS number to be confirmed from an official source) | EAS | NOT_IMPLEMENTED | no | none |
| EAS-LEASES-PLACEHOLDER | Leases (EAS number to be confirmed from an official source) | EAS | NOT_IMPLEMENTED | no | none |

## What the acceptance tests use instead
Test fixtures named `ZZ-F3B-*` / `ZZ-TEST-*` register their own `PARTIAL` standard with `sourceReference = F3B-FIXTURE-ONLY`. They prove the **mechanism**; they are not accounting content and must never be copied into production rules.
