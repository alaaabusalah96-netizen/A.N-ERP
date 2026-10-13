# A.N ERP — PROJECT STATE (v7.2.0)

**Last update**: 2026-10-13 — FULL-SYSTEM-AUDIT: orchestrated runner (build+battery+domain+optional PG/health) → evidence/full-system-audit/
**Verdict**: **CONDITIONAL GO** (rendered 2026-10-13)

## Gates
| Gate | Status | Passed | Failed | Expected |
|---|---|---|---|---|
| Sec1TwoFactor | PASS | 26 | 0 | 26 |
| Sec2Rls | PASS | 39 | 0 | 39 |
| Sec2bRls | PASS | 16 | 0 | 16 |
| Sec3Ids | PASS | 7 | 0 | 7 |
| Sec4ProdRole | PASS | 6 | 0 | 6 |
| SecProdRole | PASS | 13 | 0 | 13 |
| SecA | PASS | 27 | 0 | 27 |
| FixC | PASS | 14 | 0 | 14 |
| FixP1Custody | PASS | 9 | 0 | 9 |
| RepairBatch1 | PASS | 37 | 0 | 37 |
| P8aProcurement | PASS | 24 | 0 | 24 |
| P8cThreeWay | PASS | 14 | 0 | 14 |
| P8cFix | PASS | 22 | 0 | 22 |
| P15Purchasing | PASS | 25 | 0 | 25 |
| P10StockAtomicMem | PASS | 12 | 0 | 12 |
| P11TransfersMem | PASS | 12 | 0 | 12 |
| P12ApprovalsMem | PASS | 35 | 0 | 35 |
| P13Costing | PASS | 50 | 0 | 50 |
| P14AutoJournals | PASS | 24 | 0 | 24 |
| P16Recon | PASS | 14 | 0 | 14 |
| P17Attachments | PASS | 29 | 0 | 29 |
| P18WarehouseScope | PASS | 19 | 0 | 19 |
| P2002Migrations | PASS | 8 | 0 | 8 |
| F1Standards | PASS | 71 | 0 | 71 |
| F2Decisions | PASS | 51 | 0 | 51 |
| F3Acceptance | PASS | 19 | 0 | 19 |
| F4StockShadow | PASS | 14 | 0 | 14 |
| FixJ1Accounts | PASS | 24 | 0 | 24 |
| FixStockReturnCumulative | PASS | 18 | 0 | 18 |
| PgDateMapping | PASS | 14 | 0 | 14 |
| PgMovementLogic | PASS | 4 | 0 | 4 |
| P9Validation | PASS | 144 | 0 | — |

## Packages
- **PH0-7.6** — DONE — Core, accounting, inventory, approvals, atomic stock documents _(evidence: evidence/phase-0 .. phase-7.6)_
- **REPAIR-1** — DONE — DEF-P1-001/002/003, DEF-P2-001 (see defects for what remains) _(evidence: evidence/repair, scripts/verifyRepairBatch1.ts (37))_
- **PH8a-8c** — DONE — Purchase requests, RFQ, quotes, orders, goods receipt, supplier invoice + 3-way match (8c-FIX) _(evidence: evidence/phase-8a, 8b, 8c)_
- **P9-HARDENING** — DONE — Input-validation hardening package (NOT roadmap Phase 9 = Sales, which is not started) _(evidence: evidence/phase-9 (SUMMARY: PASS=144 FAIL=0 NOT_RUN=1))_
- **F1-F4** — DONE — Standards & accounting intelligence layer (registries, decision engines, shadow mode) _(evidence: evidence/standards-intelligence)_
- **SEC-1..SEC-4** — DONE — 2FA, RLS on all tenant tables, ids, production DB role guard _(evidence: evidence/security, scripts/verifySec*.ts)_
- **SEC-A** — DONE — Strict CSP by default in production, trust proxy, per-tenant login lockout, no raw internal errors to clients, bounded fuzz _(evidence: scripts/verifySecA.ts (27), scripts/verifySecAPg.ts)_
- **REPO-B** — DONE — Repository cleanup, npm test, engines, state register _(evidence: this file + scripts/runReconcileAuditB.ts)_
- **PH8-REMAINDER** — OPEN — Purchase returns, auto purchase request from reorder point, supplier-invoices tab in the purchasing UI _(evidence: not built)_
- **FIX-P1-CUSTODY** — DONE — DEF-CUSTODY-REVERSAL-DOUBLE-REFUND — single balance restore on reverse _(evidence: scripts/verifyFixP1Custody.ts)_
- **FIX-C** — DONE — npm test green: fuzz parser type-safe, stale RepairBatch1 assertion, custody test arity, DB-unreachable gates are SKIP not FAIL _(evidence: scripts/verifyFixC.ts)_
- **FIX-P1-P2P-AUTOPOST** — DONE — DEF-P2P-AUTOPOST-OFF — invoice journals inventory when auto-post off _(evidence: scripts/verifyFixP1P2pAutopost.ts)_
- **FIX-STOCK-RETURN-CUMULATIVE** — DONE — Cumulative stock return qty vs original + return type check _(evidence: scripts/verifyFixStockReturnCumulative.ts)_
- **FIX-STOCK-RETURN-GUARD** — DONE — Atomic cumulative return guard (service + adapters) _(evidence: scripts/verifyFixStockReturnCumulative.ts)_
- **FIX-STOCK-RETURN-GUARD-2** — DONE — POSTED-only original + concurrent test + full coverage _(evidence: scripts/verifyFixStockReturnCumulative.ts)_
- **FULL-SYSTEM-AUDIT** — DONE — Comprehensive audit orchestrator + evidence report _(evidence: scripts/runFullSystemAudit.ts; evidence/full-system-audit/REPORT.md)_

## Defect register
| ID | Severity | Status | What | Evidence |
|---|---|---|---|---|
| DEF-STOCK-RETURN-CUMULATIVE | P1 | **FIXED** | Stock returns did not accumulate prior returns or duplicate lines against the original qty | verifyFixStockReturnCumulative (posted + concurrent); assertOriginalPosted; PG/InMemory status |
| DEF-CUSTODY-REVERSAL-DOUBLE-REFUND | P1 | **FIXED** | Reversing a custody expense voucher restores the custody balance twice | scripts/verifyFixP1Custody.ts; single restore in reverseCustodyExpenseVoucher only |
| DEF-P2P-AUTOPOST-OFF | P1 | **FIXED** | Supplier invoice approval is wrong under the default stock-accounting config (autoPostEnabled=false) | scripts/verifyFixP1P2pAutopost.ts; approveSupplierInvoice Dr Inventory when autoPostEnabled=false, Dr GR/IR when true (code on tree) |
| PROD-ROLE-BYPASSRLS | P2 | **CONFIG** | The application database role may bypass RLS | INFO: DB role bypasses RLS = true in evidence/standards-intelligence/battery-output-f2-pg.txt. Guide: docs/ops/PROD-PG-ROLE.md; probe: scripts/verifySec4ProdRole.ts. |
| DEF-P1-001 | P1 | **FIXED** | Stock count approval atomicity | scripts/verifyRepairBatch1.ts 37/37 (InMemory; PostgreSQL not re-run in this review) |
| DEF-P1-002 | P1 | **FIXED** | Stock return atomicity (PENDING_RETRY instead of silent success) | scripts/verifyRepairBatch1.ts 37/37 (InMemory; PostgreSQL not re-run in this review) |
| DEF-P1-003 | P1 | **FIXED** | Custody reversal posts the journal before changing balances | Ordering fixed; the separate double-refund defect above is still OPEN. |
| DEF-P2-001 | P2 | **FIXED** | Goods receipt over-receipt race (TOCTOU) | PostgreSQL saveGoodsReceipt locks PO lines (FOR UPDATE) and re-checks inside the transaction (code inspection; InMemory tests) |
| DEF-P2-002 | P2 | **FIXED** | Version-tracked schema migrations | scripts/verifyP2002Migrations.ts (8) |
| SEC-A-CSP | P2 | **FIXED** | CSP defaulted to development (unsafe-inline/unsafe-eval) | runtimeSecurity.resolveCspProfile; verifySecA C1-C5 |
| SEC-A-LOCKOUT | P2 | **FIXED** | Login lockout counter shared by username across tenants and never reset by a successful login | loginLockKey(tenant, username); verifySecA L1-L5; verifySecAPg |
| SEC-A-PROXY | P2 | **FIXED** | No trust proxy behind Cloud Run: rate limits keyed on the proxy IP | runtimeSecurity.resolveTrustProxy; verifySecA P1-P4. Verify the real client IP in the deployed environment. |
| SEC-A-ERRORS | P3 | **FIXED** | Raw error.message returned to clients (123 places) | publicErrorMessage; verifySecA E1-E6, S1-S2 |
| SEC-A-FUZZ | P3 | **FIXED** | Unbounded fuzz iterations | parseFuzzIterations (max 5000); verifySecA F1-F2 |
| REPAIRBATCH1-TEST-DRIFT | P3 | **FIXED** | verifyRepairBatch1 seeded legacy account codes after FIX-J1 | 13 failures before, 37/37 after |
| FIXC-TYPECHECK | P3 | **FIXED** | npm run lint failed: parseFuzzIterations union did not narrow without strict (server.ts TS2339) | flat result shape; verifyFixC |
| FIXC-STALE-ASSERTION | P3 | **FIXED** | verifyRepairBatch1 asserted the old double-refund behaviour (updateCashCustody === 1) | assertion now expects the service not to touch the balance; verifyFixP1Custody proves the exact balance |
| FIXC-PG-GATES | P3 | **FIXED** | PG-dependent gates reported FAIL when DATABASE_URL had a wrong password | classifyGate: DB-unreachable-only failures are SKIP (a skipped critical gate caps the verdict at CONDITIONAL_GO) |

## Known risks
- PostgreSQL gates (verify*Pg.ts) need DATABASE_URL; they print PG_NOT_RUN without it and prove nothing then.
- Behind a proxy, confirm the real client IP reaches the app (set TRUST_PROXY, or rely on K_SERVICE on Cloud Run).
- Internal battery endpoints (/api/internal/*) are limited to developer/auditor roles; keep them off public production roles.
- Maintainability: server.ts is about 5,150 lines, PostgresPrimaryAdapter about 9,400 lines, roughly 1,800 uses of `any`.

## How to run
- Tests: npm test (runs scripts/runReconcileAuditB.ts: every non-PG gate with expected counts; refreshes these docs)
- PostgreSQL gates: verifySecAPg, verifyF1StandardsPg, verifyF2DecisionsPg, verifySec2Rls (print `PG_NOT_RUN` without `DATABASE_URL`; that proves nothing)
- Environment: `JWT_SECRET` (required, no default); `DATABASE_URL` (required when NODE_ENV=production); `CSP_PROFILE` (production|development; default follows NODE_ENV); `TRUST_PROXY` (hops or subnet list; K_SERVICE implies 1 hop); `AN_ENFORCE_PROD_ROLE` (1 = fail when the DB role bypasses RLS); `EXPOSE_ERROR_DETAILS` (1 = return raw error messages (local debugging only))

## Policy
Edit docs/STATE_REGISTER.json by hand. AI_CONTEXT.md and docs/AI_PROJECT_STATE.* are rendered from it by scripts/runReconcileAuditB.ts and must not be replaced by a template.
