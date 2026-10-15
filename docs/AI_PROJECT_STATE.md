# A.N ERP — PROJECT STATE (v7.2.0)

**Last update**: 2026-10-14 — AUDIT-UNIFY-1: orphan audit-wire test replaced and wired; financial gates are CRITICAL; stale register claims corrected
**Verdict**: **CONDITIONAL GO** (rendered 2026-10-15)

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
| FixP1P2pAutopost | PASS | 8 | 0 | 8 |
| Ph8InvTab | PASS | 14 | 0 | 14 |
| Ph8Return | PASS | 18 | 0 | 18 |
| Ph8Reorder | PASS | 14 | 0 | 14 |
| InvItemCard | PASS | 13 | 0 | 13 |
| InvMovementsFilter | PASS | 14 | 0 | — |
| Db1 | PASS | 20 | 0 | — |
| Ops1 | PASS | 28 | 0 | 28 |
| DocSyncFull | PASS | 19 | 0 | 19 |
| BatteryCoverage | PASS | 19 | 0 | 19 |
| AuditWire | PASS | 27 | 0 | 27 |
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
- **PH8-REMAINDER** — DONE — Completed via PH8-INV-TAB + PH8-RETURN + PH8-REORDER _(evidence: verifyPh8InvTab, verifyPh8Return, verifyPh8Reorder)_
- **FIX-P1-CUSTODY** — DONE — DEF-CUSTODY-REVERSAL-DOUBLE-REFUND — single balance restore on reverse _(evidence: scripts/verifyFixP1Custody.ts)_
- **FIX-C** — DONE — npm test green: fuzz parser type-safe, stale RepairBatch1 assertion, custody test arity, DB-unreachable gates are SKIP not FAIL _(evidence: scripts/verifyFixC.ts)_
- **FIX-P1-P2P-AUTOPOST** — DONE — DEF-P2P-AUTOPOST-OFF — invoice journals inventory when auto-post off _(evidence: scripts/verifyFixP1P2pAutopost.ts)_
- **FIX-STOCK-RETURN-CUMULATIVE** — DONE — Cumulative stock return qty vs original + return type check _(evidence: scripts/verifyFixStockReturnCumulative.ts)_
- **FIX-STOCK-RETURN-GUARD** — DONE — Atomic cumulative return guard (service + adapters) _(evidence: scripts/verifyFixStockReturnCumulative.ts)_
- **FIX-STOCK-RETURN-GUARD-2** — DONE — POSTED-only original + concurrent test + full coverage _(evidence: scripts/verifyFixStockReturnCumulative.ts)_
- **FULL-SYSTEM-AUDIT** — DONE — Orchestrated full audit runner (build + battery + domain + optional PG/health) → evidence/full-system-audit/ _(evidence: scripts/runFullSystemAudit.ts; package.json test:full)_
- **DB-1** — DONE — Live schema an_audit_trail + an_custom_fields + RLS list; migration 20261014_001 (21 tenant-led indexes) _(evidence: scripts/verifyDb1.ts (20); scripts/verifyDb1Pg.ts (8); evidence/repair/db1/)_
- **OPS-1** — DONE — GET /api/health?ready=1 readiness; graceful SIGTERM/SIGINT; keep-alive timeouts; Dockerfile + .dockerignore _(evidence: scripts/verifyOps1.ts (28); evidence/repair/ops1/)_
- **SEC-PROD-ROLE** — DONE — pgAppRoleGuard + server boot refuse when AN_ENFORCE_PROD_ROLE=1 and role is SUPERUSER/BYPASSRLS; verifySecProdRole in battery _(evidence: src/core/security/pgAppRoleGuard.ts; server.ts SEC-PROD-ROLE; scripts/verifySecProdRole.ts)_
- **SEC-1c** — DONE — LoginScreen no longer sends fabricated clientGeo (e.g. Riyadh); server treats omitted geo as unknown for impossible-travel _(evidence: src/components/LoginScreen.tsx (no clientGeo in login body); server.ts SEC-1 comment on clientGeo)_
- **PH8-INV-TAB** — DONE — Purchasing UI tab for supplier invoices (list from GET /api/purchasing/invoices) _(evidence: scripts/verifyPh8InvTab.ts; PurchasingWorkspaceView invoices tab)_
- **PH8-RETURN** — DONE — Purchase return to vendor against approved goods receipt (stock RETURN_RECEIPT, PO receivedQty adjust, UI list tab) _(evidence: scripts/verifyPh8Return.ts; POST/GET /api/purchasing/returns)_
- **PH8-REORDER** — DONE — Scan stock vs reorderPoint; create PRs; UI generate button; publish REORDER_POINT_REACHED on issue _(evidence: scripts/verifyPh8Reorder.ts; POST /api/purchasing/reorder/generate)_
- **INV-ITEM-CARD** — DONE — Item 360 card UI: master data, per-warehouse stock, ledger, prices; open from stock grid; action shortcuts _(evidence: scripts/verifyInvItemCard.ts; src/components/ItemCardPanel.tsx)_
- **INV-MOVEMENTS-FILTER** — DONE — Filter stock movements by warehouse, item, type, fromDate, toDate (API + movements tab UI) _(evidence: scripts/verifyInvMovementsFilter.ts)_
- **PH8-CLOSE-1** — DONE — Wire the unwired gates into npm test (FixP1P2pAutopost, Ph8InvTab, Ph8Return, Ph8Reorder, InvItemCard, InvMovementsFilter, Db1, Ops1, DocSyncFull) with expected counts; replace the brittle DocSyncFull S7; add verifyBatteryCoverage + scripts/lib/batteryExemptions.json so a new verify script cannot stay outside the battery _(evidence: scripts/verifyBatteryCoverage.ts; scripts/runReconcileAuditB.ts BATTERIES; evidence/audit-wire/)_
- **AUDIT-UNIFY-1** — DONE — Remove audit contradictions: replace the orphan verifyAuditWire.ts (over-escaped regexes, asserted a register state that never existed) with correct invariants and wire it; make the financial/integrity gates CRITICAL; fix the stale DEF-P1-003 evidence text and the stale SEC-2c risk _(evidence: scripts/verifyAuditWire.ts; scripts/runReconcileAuditB.ts (BATTERIES, CRITICAL); evidence/audit-wire/)_

## Defect register
| ID | Severity | Status | What | Evidence |
|---|---|---|---|---|
| SEC-1c | P1 | **FIXED** | LoginScreen sent fabricated clientGeo (fixed city) on every login, defeating impossible-travel honesty | LoginScreen login body has no clientGeo; server uses clientGeo only when provided |
| DEF-STOCK-RETURN-CUMULATIVE | P1 | **FIXED** | Stock returns did not accumulate prior returns or duplicate lines against the original qty | verifyFixStockReturnCumulative (posted + concurrent); assertOriginalPosted; PG/InMemory status |
| DEF-CUSTODY-REVERSAL-DOUBLE-REFUND | P1 | **FIXED** | Reversing a custody expense voucher restores the custody balance twice | scripts/verifyFixP1Custody.ts; single restore in reverseCustodyExpenseVoucher only |
| DEF-P2P-AUTOPOST-OFF | P1 | **FIXED** | Supplier invoice approval is wrong under the default stock-accounting config (autoPostEnabled=false) | scripts/verifyFixP1P2pAutopost.ts; approveSupplierInvoice Dr Inventory when autoPostEnabled=false, Dr GR/IR when true (code on tree) |
| PROD-ROLE-BYPASSRLS | P2 | **CONFIG** | The application database role may bypass RLS | docs/ops/PROD-PG-ROLE.md; server boot refuse under AN_ENFORCE_PROD_ROLE=1; scripts/verifySecProdRole.ts / verifySec4ProdRole.ts. Package SEC-PROD-ROLE is DONE in code; deploy still needs NOSUPERUSER NOBYPASSRLS role + AN_ENFORCE_PROD_ROLE=1. |
| DEF-P1-001 | P1 | **FIXED** | Stock count approval atomicity | scripts/verifyRepairBatch1.ts 37/37 (InMemory; PostgreSQL not re-run in this review) |
| DEF-P1-002 | P1 | **FIXED** | Stock return atomicity (PENDING_RETRY instead of silent success) | scripts/verifyRepairBatch1.ts 37/37 (InMemory; PostgreSQL not re-run in this review) |
| DEF-P1-003 | P1 | **FIXED** | Custody reversal posts the journal before changing balances | Ordering fixed (journal posts before balances change); the separate double-refund defect (DEF-CUSTODY-REVERSAL-DOUBLE-REFUND) is also FIXED in this register. |
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
- DOC-SYNC-FULL applied 2026-10-14: register aligned with DB-1, OPS-1, SEC-PROD-ROLE, SEC-1c present in tree.
- SEC-2c closed: every tenant_id table is covered by the RLS array or an explicit ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY (an_company_profiles uses the explicit statements); scripts/verifyAuditWire.ts enforces it statically. Live isolation still needs a PostgreSQL run with a NOBYPASSRLS role.
- A new scripts/verify*.ts must be wired into BATTERIES (runReconcileAuditB.ts) or listed in scripts/lib/batteryExemptions.json with a reason; scripts/verifyBatteryCoverage.ts enforces it. 28 older scripts are exempted at the PH8-CLOSE-1 baseline and still need triage.

## How to run
- Tests: npm test (runs scripts/runReconcileAuditB.ts: every non-PG gate with expected counts; refreshes these docs)
- PostgreSQL gates: verifySecAPg, verifyF1StandardsPg, verifyF2DecisionsPg, verifySec2Rls (print `PG_NOT_RUN` without `DATABASE_URL`; that proves nothing)
- Environment: `JWT_SECRET` (required, no default); `DATABASE_URL` (required when NODE_ENV=production); `CSP_PROFILE` (production|development; default follows NODE_ENV); `TRUST_PROXY` (hops or subnet list; K_SERVICE implies 1 hop); `AN_ENFORCE_PROD_ROLE` (1 = fail when the DB role bypasses RLS); `EXPOSE_ERROR_DETAILS` (1 = return raw error messages (local debugging only))

## Policy
Edit docs/STATE_REGISTER.json by hand. AI_CONTEXT.md and docs/AI_PROJECT_STATE.* are rendered from it by scripts/runReconcileAuditB.ts and must not be replaced by a template.
