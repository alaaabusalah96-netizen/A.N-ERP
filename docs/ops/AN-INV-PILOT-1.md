# AN-INV-PILOT-1 — A.N inventory pilot movement (gated)

**Endpoint:** `POST /api/an/inventory/pilot/movement`
**Flag:** `AN_INV_PILOT_WRITES` (default `0`; writes allowed only when `1`/`true`)
**Scope:** single-line `RECEIPT` or `ISSUE` through the per-company adapter. No UI change, no custody, no accounting journal, no Firestore write.

## Request
Headers: session/bearer auth (platform or system admin) + `Idempotency-Key`.
Body: `{ companyId, warehouseId, itemId, movementType: "RECEIPT"|"ISSUE", quantity, unitCost?, notes? }`
`backend` override in the body is rejected (400): pilot uses company config only.

## Guards (order)
operator auth -> company scope -> flag gate (403 `pilot_writes_disabled`) -> fail-closed company adapter (`requireLoaded`) -> Idempotency-Key -> validation -> atomic post (`allowNegative=false`).
Same key = same document (replay returns `idempotent_replay`, no second posting).

## MERGE_STATUS (add when package is DONE)
Table row: `| INV-PILOT1 | A.N inventory pilot movement (gated) | DONE | POST /api/an/inventory/pilot/movement; AN_INV_PILOT_WRITES=0 default; RECEIPT/ISSUE via company adapter; UI unchanged |`
Rule: `33. **INV-PILOT-1:** A.N inventory pilot writes (RECEIPT/ISSUE, single line) only when AN_INV_PILOT_WRITES=1, after operator auth + company scope + fail-closed adapter + Idempotency-Key. KEMIT Inventory.tsx and custody stay on CustodyDB/Firestore. cutoverApproved remains false.`
