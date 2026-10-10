# A.N ERP — RECONCILED MASTER PROJECT STATE (v7.2.0)

**Reconcile date**: 2026-10-10  
**package.json version**: `7.2.0`  
**Authoritative verdict**: **CONDITIONAL GO**  
**Overall engineering score (reconciled)**: **78 / 100**  
**Mode**: Documentation-only reconcile — **no application source changes** in this package.

> Prior copies of this file showed **NO-GO** while `AI_CONTEXT.md` said **CONDITIONAL GO**. Both were stale relative to Repair Batch 1, R10–R15, Standards F1–F4, Phase 8a–8c-FIX, SEC-1, and SEC-2. **Code + `evidence/` win.**

---

## 1. Stack (verified)

| Layer | Value |
|---|---|
| Runtime | Node 22 |
| API | Express 4 |
| Language | TypeScript 5.8.x |
| DB | PostgreSQL (primary) |
| UI | React 19 + Vite + Tailwind |

---

## 2. Delivered capability (high level)

| Area | State |
|---|---|
| Phases 0 → 7.6 + repair cycle | Delivered |
| Standards Intelligence F1–F4 | Delivered (`src/core/standards/`) |
| Inventory atomic post / costing / transfers | Delivered |
| Purchasing 8a (PR/RFQ/PO) + 8b UI + 8c three-way + 8c-FIX | Delivered |
| SEC-1 2FA secret leak / setup ownership / no fabricated Riyadh | Delivered |
| SEC-2 RLS on 12 purchasing tables + tenant GUC on purchase paths | Delivered |
| Evidence batteries under `evidence/` | Present (phase-8a/b/c, standards, security, repair, …) |
| Verify scripts under `scripts/verify*.ts` | ~50+ scripts |

---

## 3. Defect register (reconciled)

| ID | Severity | Status | Notes |
|---|---|---|---|
| DEF-P1-001 | P1 | **FIXED** | Stock document post uses `postStockDocumentAtomic`; failure leaves no partial commit |
| DEF-P1-002 | P1 | **FIXED** | Return path checks `postEntry` / return journal result; pending retry on failure |
| DEF-P1-003 | P1 | **FIXED** | Cash custody: draft + post both checked; voucher saved only after successful post |
| DEF-P2-001 | P2 | **FIXED** | PO line qty: `SELECT … FOR UPDATE` + DB CHECK on remaining qty |
| DEF-P2-002 | P2 | **OPEN** | No dedicated **version-tracked migration engine** (MigrationLinterService is a linter only) |
| F-07 | — | **UNPROVEN** | StorageRouter deadlock claim — re-run concurrency battery on real PostgreSQL |

---

## 4. Scorecard (reconciled — indicative)

| Dimension | Old audit | Reconciled |
|---|---|---|
| architecture | 60 | 75 |
| security | 70 | 82 |
| authentication | 80 | 88 |
| authorization_sod | 50 | 78 |
| tenant_isolation | 80 | 86 |
| inventory_integrity | 50 | 85 |
| accounting_integrity | 40 | 82 |
| transaction_atomicity | 40 | 84 |
| concurrency | 50 | 70 |
| costing | 70 | 82 |
| idempotency | 80 | 85 |
| schema_management | 50 | 55 |
| testing_quality | 60 | 80 |
| **overall** | **65** | **78** |
Schema management stays lower until DEF-P2-002 is closed. Concurrency stays provisional until F-07 is re-tested.

---

## 5. Test execution metrics (reconciled)

Stale audit claimed `0/0 PENDING_VERIFICATION`. That is **false** for the current tree.

Representative batteries (from prior Studio runs / evidence layout — re-run to refresh numbers):

| Battery | Typical gate |
|---|---|
| verifyP8aProcurement | 24/24 |
| verifyP8cThreeWay | 14/14 |
| verifyP8cFix | 19/19 (when present) |
| verifyF3Acceptance | 19/19 (+ PG variant when run) |
| verifySec1TwoFactor | 26/26 |
| verifySec2Rls | 39/39 |

Exact counts must be taken from the latest `npx tsx scripts/…` raw `Passed:` line; do not invent totals.

---

## 6. Release decision

**VERDICT: CONDITIONAL GO**

- Allowed: continue module roadmap (e.g. Phase 9 sales) and targeted hardening.
- Required before calling the system “migration-complete”: plan/implement DEF-P2-002.
- Recommended: PG concurrency package to confirm or close F-07.
- **Forbidden**: treating this markdown as authority over failing batteries or contradictory code.

---

## 7. Out of scope for this documentation package

No TypeScript/SQL changes. No schema migration. No commit of application behavior — docs only.
