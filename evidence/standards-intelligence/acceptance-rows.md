# Standards Intelligence — F1 acceptance rows

Scope of F1: storage + registries + versioning/effective dates + policy settings. The decision engines (F2) and the
explanation service / pilot wiring / docs (F3) are NOT part of this package, so most of Foundation §23 is intentionally open.

## F1 rows (what this package claims)
| # | Row | Evidence | Status |
|---|-----|----------|--------|
| F1-1 | 5 registries exist behind StoragePort (Standards, Jurisdiction, AccountingRule, TaxRule, AccountingPolicy) | `scripts/verifyF1Standards.ts` | InMemory logic: see battery-output |
| F1-2 | All 11 new StoragePort methods exist on Postgres, InMemory and the 3 Smoke adapters | check S5 | InMemory run |
| F1-3 | SI-6/SI-10: a rule/standard/tax rate cannot be ACTIVE/IMPLEMENTED/PARTIAL without a verified source, evidence and a real date | checks C1-C3, D2-D3, E2 (service) and PGC1-PGC4 (database CHECKs) | service: InMemory; DB: needs PG run |
| F1-4 | Treatments hold account ROLES only (account numbers rejected) | check D4 | InMemory run |
| F1-5 | History is immutable: duplicate (id, version) and overlapping windows rejected | C5, C6, D9, E4, PGC5 | service: InMemory; DB: needs PG run |
| F1-6 | Effective-date resolution (inclusive bounds, early adoption opt-in, conflict -> no guess) | A1-A12, D11, D14, E5, F4 | InMemory run (pure logic) |
| F1-7 | EAS vs IFRS vs Tax are separate jurisdictions; EAS->IFRS mapping is UNVERIFIED by default | B6, D6, D13, E1, E6 | InMemory run |
| F1-8 | Tenant policies: new effective-dated version, previous window closed, backdating rejected, idempotent replay, tenant isolation, concurrent appends serialize | F1-F8, P1-P4 (statement order on real PG code), PGR1 (RLS) | logic: InMemory; locking/RLS: needs PG run |
| F1-9 | Catalogue seed is idempotent and asserts nothing: every standard NOT_IMPLEMENTED, unverified, no invented dates/rates/EAS numbers | B3-B8 | InMemory run |

## Foundation §23 rows owned by later packages
Inventory purchase path, sales path, FX path, fixed-asset path, missing-fact REVIEW_REQUIRED, jurisdiction-change on a real
transaction, historical transaction decision, ruleId on journals, "why was this posted?", PostingEngine remains the posting
path -> **F2/F3, not claimed here.** Evidence for PostgreSQL rows is only valid once `battery-output-f1-pg.txt` shows no `PG_NOT_RUN`.
