# A.N ERP — PROJECT STATE (v7.2.0)

**Last update**: 2026-10-18 — OPS-PROD-LAUNCH-1: an_erp_app role SQL + manual pre-launch backup + checklist
**Verdict**: **CONDITIONAL GO** (rendered 2026-10-19)

## Gates
_Gates were not run in this render. Run `npm test` to execute them and refresh this file._

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
- **INV-UI-TABS** — DONE — Inventory UI: items master tab always visible; open ItemCardPanel from list even with zero stock; default tab=items _(evidence: scripts/verifyInvUiTabs.ts; InventoryWorkspaceView items tab)_
- **BASELINE-MAP-1** — DONE — Baseline gap map + seven-wave roadmap; no production logic change _(evidence: docs/GAP_MAP_BASELINE.md; docs/ROADMAP_WAVES.md; scripts/verifyBaselineMap.ts)_
- **SEC-AUTH-MATRIX** — DONE — Wave-1: enforce requirePermission on previously auth-only API routes; document intentional public/internal exceptions _(evidence: docs/SEC_AUTH_MATRIX.md; scripts/verifySecAuthMatrix.ts)_
- **SEC-SESSION-PASSWORD** — DONE — Wave-1: requiresPasswordChange gate in requireAuth; POST change-password; list/revoke sessions _(evidence: docs/SEC_SESSION_PASSWORD.md; scripts/verifySecSessionPassword.ts)_
- **SEC-USER-ADMIN** — DONE — Wave-1: admin patch user, reset-password with temp secret once, revoke sessions; list exposes status _(evidence: docs/SEC_USER_ADMIN.md; scripts/verifySecUserAdmin.ts)_
- **ORG-COMPANY-1** — DONE — Wave-2: TenantCompany as legal entity; safe GET /api/company; CR/name validation; PATCH tenant status _(evidence: docs/ORG_COMPANY_MODEL.md; scripts/verifyOrgCompany1.ts)_
- **SEC-PASSWORD-UX-1** — DONE — Forced password UI gate; optional admin temporaryPassword; PASSWORD_CHANGE_SELF for non-forced self-change _(evidence: docs/SEC_PASSWORD_UX.md; scripts/verifySecPasswordUx.ts; src/components/ForcePasswordChangeScreen.tsx)_
- **SEC-PERM-OVERRIDE-1** — DONE — Additive user.permissions; internal admin role narrowed; PATCH grant with no self-escalation _(evidence: docs/SEC_PERM_OVERRIDE.md; scripts/verifySecPermOverride.ts)_
- **UI-USERS-1** — DONE — Wire user admin actions in UsersAndSodView to existing PATCH/reset/revoke APIs _(evidence: docs/UI_USERS_1.md; scripts/verifyUiUsers1.ts)_
- **UI-OPS-1** — DONE — Wire approvals inbox; fix TransactionModal/App save to transactions/post with lines _(evidence: docs/UI_OPS_1.md; scripts/verifyUiOps1.ts)_
- **UI-P2P-1** — DONE — Wire 3-way match and approve/reject buttons on purchasing invoices tab _(evidence: docs/UI_P2P_1.md; scripts/verifyUiP2p1.ts)_
- **UI-2FA-SETUP-1** — DONE — Wire 2FA setup/verify-setup in UserProfileView; fix self session list path _(evidence: docs/UI_2FA_SETUP_1.md; scripts/verifyUi2faSetup1.ts)_
- **UI-AUDIT-PRINT-1** — DONE — Wire audit-chain verify in AuditTrailView; official print from PrintVoucherModal _(evidence: docs/UI_AUDIT_PRINT_1.md; scripts/verifyUiAuditPrint1.ts)_
- **DEMO-LOGIN-ROLES-1** — DONE — Seed 8 operational roles for MAIN; replace 3 login buttons with full preset grid _(evidence: docs/DEMO_LOGIN_ROLES_1.md; scripts/verifyDemoLoginRoles1.ts)_
- **ORG-MEMBERSHIP-1** — DONE — Wave 2: membership GET/PATCH + status sync + UI suspend/activate _(evidence: docs/ORG_MEMBERSHIP_1.md; scripts/verifyOrgMembership1.ts)_
- **INV-ITEM-CREATE** — DONE — Create stock-item cards from the dedicated Items tab using existing authenticated API; no stock quantity is created by item setup _(evidence: scripts/verifyInvItemCreate.ts; docs/INV_ITEM_CREATE.md; src/components/InventoryWorkspaceView.tsx)_
- **INV-INTRANSIT-1** — DONE — UI filter/summary for IN_TRANSIT warehouse transfers; credentials on transfer fetches _(evidence: docs/INV_INTRANSIT_1.md; scripts/verifyInvIntransit.ts)_
- **INV-INTRANSIT-1b** — DONE — Fix verifyInvIntransit S12 regex window (200→500) to match server.ts layout _(evidence: scripts/verifyInvIntransit.ts)_
- **ORG-GROUP-1** — DONE — Platform CompanyGroup model + CRUD/membership APIs; pure validation helpers _(evidence: docs/ORG_GROUP_1.md; scripts/verifyOrgGroup1.ts; src/core/org/CompanyGroupService.ts)_
- **ORG-GROUP-1b** — DONE — Fix invalid import comma for CompanyGroup in InMemoryAdapter _(evidence: src/core/storage/adapters/InMemoryAdapter.ts)_
- **MASTER-ITEM-GROUP-1** — DONE — GroupMasterItem model + platform APIs + publish zero-qty StockItem to group members _(evidence: docs/MASTER_ITEM_GROUP_1.md; scripts/verifyMasterItemGroup1.ts)_
- **STK-XCOMPANY-1** — DONE — CrossCompanyTransfer model + platform create/dispatch/receive using per-tenant issue/receive _(evidence: docs/STK_XCOMPANY_1.md; scripts/verifyStkXcompany1.ts)_
- **ACC-ENTITY-CLOSE-1** — DONE — EntityBooksState + close/reopen APIs; xcompany dispatch/receive gated _(evidence: docs/ACC_ENTITY_CLOSE_1.md; scripts/verifyAccEntityClose1.ts)_
- **RPT-GROUP-1** — DONE — GET /api/groups/:id/report/summary platform KPI rollup _(evidence: docs/RPT_GROUP_1.md; scripts/verifyRptGroup1.ts)_
- **CONSOL-1** — DONE — GET /api/groups/:id/consol/trial-balance read-only account-code merge _(evidence: docs/CONSOL_1.md; scripts/verifyConsol1.ts)_
- **GATE-PROD-1** — DONE — Production readiness gate: required packages + P1 + platform checklist API _(evidence: docs/GATE_PROD_1.md; scripts/verifyGateProd1.ts; GET /api/platform/gate-prod)_
- **OPS-PROD-LAUNCH-1** — DONE — Operator scripts: create NOBYPASSRLS app role + pg_dump backup + pre-launch checklist _(evidence: scripts/ops/create_an_erp_app_role.sql; scripts/ops/backup_before_launch.sh; docs/ops/PRE_LAUNCH_CHECKLIST.md)_

## Defect register
| ID | Severity | Status | What | Evidence |
|---|---|---|---|---|
| SEC-1c | P1 | **FIXED** | LoginScreen sent fabricated clientGeo (fixed city) on every login, defeating impossible-travel honesty | LoginScreen login body has no clientGeo; server uses clientGeo only when provided |
| DEF-STOCK-RETURN-CUMULATIVE | P1 | **FIXED** | Stock returns did not accumulate prior returns or duplicate lines against the original qty | verifyFixStockReturnCumulative (posted + concurrent); assertOriginalPosted; PG/InMemory status |
| DEF-CUSTODY-REVERSAL-DOUBLE-REFUND | P1 | **FIXED** | Reversing a custody expense voucher restores the custody balance twice | scripts/verifyFixP1Custody.ts; single restore in reverseCustodyExpenseVoucher only |
| DEF-P2P-AUTOPOST-OFF | P1 | **FIXED** | Supplier invoice approval is wrong under the default stock-accounting config (autoPostEnabled=false) | scripts/verifyFixP1P2pAutopost.ts; approveSupplierInvoice Dr Inventory when autoPostEnabled=false, Dr GR/IR when true (code on tree) |
| PROD-ROLE-BYPASSRLS | P2 | **CONFIG** | The application database role may bypass RLS | docs/ops/PROD-PG-ROLE.md; docs/ops/PRE_LAUNCH_CHECKLIST.md; scripts/ops/create_an_erp_app_role.sql; scripts/ops/backup_before_launch.sh; server boot refuse under AN_ENFORCE_PROD_ROLE=1. Package OPS-PROD-LAUNCH-1 delivers operator scripts; defect remains CONFIG until production DATABASE_URL uses an_erp_app. |
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
- BASELINE-MAP-1 (2026-10-15): see docs/GAP_MAP_BASELINE.md and docs/ROADMAP_WAVES.md for phased multi-company plan; CONFIG PROD-ROLE-BYPASSRLS remains.

## How to run
- Tests: npm test (runs scripts/runReconcileAuditB.ts: every non-PG gate with expected counts; refreshes these docs)
- PostgreSQL gates: verifySecAPg, verifyF1StandardsPg, verifyF2DecisionsPg, verifySec2Rls (print `PG_NOT_RUN` without `DATABASE_URL`; that proves nothing)
- Environment: `JWT_SECRET` (required, no default); `DATABASE_URL` (required when NODE_ENV=production); `CSP_PROFILE` (production|development; default follows NODE_ENV); `TRUST_PROXY` (hops or subnet list; K_SERVICE implies 1 hop); `AN_ENFORCE_PROD_ROLE` (1 = fail when the DB role bypasses RLS); `EXPOSE_ERROR_DETAILS` (1 = return raw error messages (local debugging only))

## Policy
Edit docs/STATE_REGISTER.json by hand. AI_CONTEXT.md and docs/AI_PROJECT_STATE.* are rendered from it by scripts/runReconcileAuditB.ts and must not be replaced by a template.
