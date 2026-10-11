# A.N ERP — PROJECT STATE (v7.2.0)

**Last update**: 2026-10-12 — FIX-P1-CUSTODY: expense voucher reversal restores custody balance exactly once
**Verdict**: **NO GO** (rendered 2026-10-11)

## Gates
_Gates were not run in this render. Run `npm test` to execute them and refresh this file._

## Packages
- **PH0-7.6** — DONE — Core, accounting, inventory, approvals, atomic stock documents _(evidence: evidence/phase-0 .. phase-7.6)_
- **REPAIR-1** — DONE — DEF-P1-001/002/003, DEF-P2-001 (see defects for what remains) _(evidence: evidence/repair, scripts/verifyRepairBatch1.ts (37))_
- **PH8a-8c** — DONE — Purchase requests, RFQ, quotes, orders, goods receipt, supplier invoice + 3-way match (8c-FIX) _(evidence: evidence/phase-8a, 8b, 8c)_
- **PH9** — DONE — Validation phase _(evidence: evidence/phase-9 (SUMMARY: PASS=144 FAIL=0 NOT_RUN=1))_
- **F1-F4** — DONE — Standards & accounting intelligence layer (registries, decision engines, shadow mode) _(evidence: evidence/standards-intelligence)_
- **SEC-1..SEC-4** — DONE — 2FA, RLS on all tenant tables, ids, production DB role guard _(evidence: evidence/security, scripts/verifySec*.ts)_
- **SEC-A** — DONE — Strict CSP by default in production, trust proxy, per-tenant login lockout, no raw internal errors to clients, bounded fuzz _(evidence: scripts/verifySecA.ts (27), scripts/verifySecAPg.ts)_
- **REPO-B** — DONE — Repository cleanup, npm test, engines, state register _(evidence: this file + scripts/runReconcileAuditB.ts)_
- **PH8-REMAINDER** — OPEN — Purchase returns, auto purchase request from reorder point, supplier-invoices tab in the purchasing UI _(evidence: not built)_
- **FIX-P1-CUSTODY** — DONE — DEF-CUSTODY-REVERSAL-DOUBLE-REFUND — single balance restore on reverse _(evidence: scripts/verifyFixP1Custody.ts)_

## Defect register
| ID | Severity | Status | What | Evidence |
|---|---|---|---|---|
| DEF-CUSTODY-REVERSAL-DOUBLE-REFUND | P1 | **FIXED** | Reversing a custody expense voucher restores the custody balance twice | scripts/verifyFixP1Custody.ts; single restore in reverseCustodyExpenseVoucher only |
| DEF-P2P-AUTOPOST-OFF | P1 | **OPEN** | Supplier invoice approval is wrong under the default stock-accounting config (autoPostEnabled=false) | Reproduced on v73 (InMemory): receive 10 x 8 then approve the invoice => AP -80, GR/IR +80, inventory asset 0 (correct only when autoPostEnabled=true: inventory +80, AP -80, GR/IR 0). approveSupplierInvoice debits GR/IR regardless of autoPostEnabled. — Fix: When autoPostEnabled=false debit the inventory accounts instead of GR/IR (or refuse approval), plus a two-mode regression test. |
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
