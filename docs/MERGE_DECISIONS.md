# MERGE DECISIONS — Approved (AN-DOC-DECISIONS-1)

**Status:** APPROVED  
**Date:** 2026-10-28  
**Scope:** Product direction for A.N ERP × KEMIT unified merge

## Decision matrix (binding)

| ID | Domain | Decision | Source of truth (target) | Notes |
|----|--------|----------|--------------------------|-------|
| D-INV | Inventory | A.N engine + re-wire KEMIT UI gradually | A.N StoragePort / InventoryService / stock atomic APIs | KEMIT screens remain until INV-UI cutover packages |
| D-CUSTODY | Custody / cash / stations | Keep KEMIT operational implementation | KEMIT CustodyDB flows | Do not force early SQL migrate of custody |
| D-AUTH | Login / session | **Target = A.N-style auth** (not Firebase as final) | A.N user/password/session (TokenService path) | Current firebase-session remains interim until G-series auth packages |

## Explicit non-goals of this document package
- Does not activate A.N login UI yet
- Does not disable Firebase login yet
- Does not switch Inventory.tsx off CustodyDB yet

## Implementation order (after this freeze)
1. **G-series:** introduce A.N login path behind flag; dual-run; then cut Firebase login
2. **INV-UI series:** read then write inventory via A.N; then drop CustodyDB for stock
3. Custody stays KEMIT unless a later explicit decision reverses D-CUSTODY

## Canonical statements
1. Inventory business rules and stock posting target the A.N engine.
2. Custody remains KEMIT-first.
3. Final login experience must match A.N ERP (server-side session/password model), not remain Firebase-only permanently.
