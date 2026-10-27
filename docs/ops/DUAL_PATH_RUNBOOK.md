# Dual-path operator runbook (A.N × KEMIT)

## Current mode
- **Operational UI + login:** KEMIT / CustodyFlow + Firestore (/api/auth/verify-credentials)
- **A.N plane:** bind + probe + read-only module summaries
- cutoverApproved: false
- migrateAuthorized: false

## Daily checks
1. npm run verify:merge — structural M1–M5
2. npm run verify:an-plane — A1–D3 plane gate
3. GET /api/an/shadow/status — dualPath true
4. GET /api/an/migration/readiness — expect migrateAuthorized false
5. GET /api/an/data-plane/live-check — SQL live if DATABASE_URL set

## Safe actions
- Save company backend binding (env ref names only)
- Inspect modules overview / entity map / readiness gates
- Use KEMIT screens for real business operations

## Forbidden without a dedicated package
- Copying Firestore collections into PostgreSQL
- Pointing Inventory/Accounting/Purchasing pages at A.N adapters
- Enabling an-jwt as sole login
- Setting cutoverApproved or migrateAuthorized to true

## When ready for migration (future)
1. All readiness WAIT gates understood and accepted
2. Explicit user approval for dry-run migrate series
3. Backup Firestore + PostgreSQL
4. New packages only — not this runbook
