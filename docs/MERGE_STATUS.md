# MERGE STATUS — A.N ERP × CustodyFlow (KEMIT)

**Freeze date:** MERGE-M6  
**Product root:** CustodyFlow / KEMIT UI + server  
**A.N role:** `src/an-core` library + `/api/an/*` bridge (not a second app shell)

## Phases

| Phase | ID | Status | Summary |
|-------|-----|--------|---------|
| M1 | Core inject | DONE | `src/an-core`, `anBridge`, `GET /api/an/storage-status` |
| M2 | Company backend | DONE | `db_backend` / `isolation_level` / `connection_ref` + panel |
| M3 | Auth policy | DONE | Single path: firebase-session default; `AN_ENABLE_AN_JWT` gated |
| M4 | API namespace | DONE | All A.N routes under `/api/an`; catalog `GET /api/an/routes` |
| M5 | Settings UI | DONE | `AnCoreStatusPanel` in Settings only (no dual nav) |
| M6 | Stabilize | DONE | `verifyMergeAll` + this freeze document |
| A1 | Data plane env probe | DONE | `anDataPlane` + `GET /api/an/data-plane/status` (no Firestore cutover) |
| A2 | Company-scoped plane probe | DONE | `GET /api/an/data-plane/company/:id` + probe on company-backend POST |
| A3 | Live SQL connectivity probe | DONE | `GET /api/an/data-plane/live-check` (pg SELECT 1; no schema migrate; Firestore unchanged) |
| A4 | Persist company backend binding | DONE | POST company-backend merges auth_driver/db_backend/isolation/connection_ref onto companies/{id} |
| B1 | Session/company plane context | DONE | `GET /api/an/session-plane?companyId=&live=` (auth policy + probe; login unchanged) |
| B2 | Settings panel session-plane feedback | DONE | CompanyBackendPanel shows persisted + session-plane probe after save |
| B3 | Status panel plane + live | DONE | AnCoreStatusPanel shows session-plane + live-check summary |
| C1 | Inventory read summary (A.N) | DONE | GET /api/an/inventory/summary — read-only; Inventory.tsx still CustodyDB |
| C2 | Inventory summary in status panel | DONE | AnCoreStatusPanel fetches /api/an/inventory/summary (Inventory.tsx unchanged) |
| C3 | Accounting read summary | DONE | GET /api/an/accounting/summary + status panel; Accounting.tsx unchanged |
| C4 | Purchasing read summary | DONE | GET /api/an/purchasing/summary + status panel; Purchasing.tsx unchanged |
| C5 | Modules overview aggregate | DONE | GET /api/an/modules/overview — wave C read-only surface complete; KEMIT pages unchanged |
| D1 | Dual-path shadow status | DONE | GET /api/an/shadow/status — KEMIT operational, A.N read-only, cutoverApproved=false |
| D2 | Entity mapping catalog | DONE | GET /api/an/map/entities — static KEMIT→A.N map; no data migration |
| D3 | Migration readiness gates | DONE | GET /api/an/migration/readiness — migrateAuthorized=false always in D3 |
| E1 | Plane structural gate A1–D3 | DONE | scripts/verifyAnPlaneAll.ts + npm run verify:an-plane |
| E2 | Dual-path operator runbook | DONE | docs/ops/DUAL_PATH_RUNBOOK.md + GET /api/an/ops/runbook |
| F1 | Inventory migrate dry-run | DONE | GET /api/an/migrate/inventory/dry-run — report only, writesPerformed=false |
| F2 | Warehouse write migrate (gated) | DONE | POST /api/an/migrate/inventory/warehouses requires AN_MIGRATE_WRITES=1; UI unchanged |
| F3 | Stock items write migrate (gated) | DONE | POST /api/an/migrate/inventory/items; balances+UI later |
| F4 | Opening balances write migrate (gated) | DONE | POST /api/an/migrate/inventory/balances via RECEIPT; UI unchanged |
| F5 | COA accounts write migrate (gated) | DONE | POST /api/an/migrate/accounting/accounts; journals+UI later |
| DEC1 | Approved decisions freeze | DONE | docs/MERGE_DECISIONS.md — INV=A.N engine, CUSTODY=KEMIT, AUTH=A.N target |
| G1 | A.N login target status | DONE | GET /api/an/auth/login-target — target=an-style; interim=firebase |
| G2 | A.N credential login API | DONE | POST /api/an/auth/login gated by AN_ENABLE_AN_LOGIN; Login.tsx still Firebase |
| G3 | Login UI dual path | DONE | Login.tsx uses A.N POST when anLoginFlag; Firebase path retained |
| G4 | Prefer A.N login UI | DONE | A.N-only UI when AN_ENABLE_AN_LOGIN; Firebase toggle needs AN_ALLOW_FIREBASE_LOGIN |
| INV-R1 | Inventory A.N read strip | DONE | AnInventoryReadStrip on Inventory.tsx; CustodyDB flows unchanged |
| G5 | Platform admin bootstrap on startup | DONE | runPlatformAdminBootstrapOnStart at boot; fixes empty A.N users for login |
| SEC-MIG1 | Migrate route AuthZ | DONE | requireAnMigrateOperator on migrate GET/POST; env flag still required for writes |
| ADP1 | Per-company migrate adapter | DONE | resolveCompanyStorageAdapter on migrate routes; primary fallback |
| INV-L1 | A.N inventory list APIs | DONE | GET warehouses/items via company adapter; session required; CustodyDB UI unchanged |
| INV-S1 | A.N stock balances read | DONE | GET /api/an/inventory/stock; company adapter; session required |
| SEC-SCOPE1 | Company scope on A.N inventory APIs | DONE | assertUserCanAccessCompany on inventory reads (+ migrate companyId) |
| ADP-FC1 | Adapter fail-closed on company load error | DONE | no silent primary when company config load fails |
| ADP-RT1 | Two-company adapter route proof | DONE | verifyAnAdapterRouteTest1 — shared vs dedicated routing |
| MIG-IDEM1 | Migrate batch idempotency | DONE | Idempotency-Key required on migrate POSTs; row keys stable for replay |
| ADP-FC2 | Fail-closed gaps: skipped + not_found on writes | DONE | skipped refused when fail-closed; migrate POST requires loaded company; dead throw removed |
| INV-PILOT1 | A.N inventory pilot movement (gated) | DONE | POST /api/an/inventory/pilot/movement; AN_INV_PILOT_WRITES=0 default; RECEIPT/ISSUE via company adapter; UI unchanged |
| FIX-STORE1 | StorageRouter hardening | DONE | no silent in-memory under STRICT_PROD_SECURITY; connectionRef allowlist; certification on Dedicated; no eviction of recently-used pools |
| FIX-SEC1 | A.N login + TokenService hardening | DONE | rate limits (IP + tenant:user), no user enumeration/timing leak, input caps, sanitized errors, audit lines, timing-safe JWT verify, refresh refuses missing/inactive users |
| AUTH-BRIDGE1 | A.N login → Firebase customToken + JWT accept | DONE | bridge customToken best-effort; authenticateSessionOrBearer accepts A.N access JWT |
| AUTH-COOKIES1 | A.N tokens in HttpOnly cookies | DONE | an_access/an_refresh HttpOnly; sessionStorage writes removed from Login A.N path |
| AUTH-REFRESH1 | A.N refresh/logout/me | DONE | POST refresh+logout, GET me; cookies rotated/cleared |
| AUTH-ROLEMAP1 | Explicit UI role map | DONE | no /admin/i elevation; no password.trim on A.N login; duplicate me route removed if any |

## Canonical rules (do not regress)

1. **Login (interim vs target):** Interim operational path remains `/api/auth/verify-credentials` (Firebase) so the app stays usable. **Target login is A.N-style auth** per `docs/MERGE_DECISIONS.md`. Do not remove Firebase until a dedicated G-series package passes.
2. **One API namespace for A.N:** only `/api/an/*`.
3. **Per-company backend contract** is stored and validated; live SQL adapter cutover is a **future** phase, not silent.
4. **No second product shell:** Settings panels only; no `AnLogin`, no competing sidebar tree for A.N modules.
5. **DATAPLANE-A1:** process-level BackendConfig/env probe only; KEMIT Firestore remains operational login/data path until a later approved cutover phase.
6. **DATAPLANE-A4:** backend binding fields may be stored on the company record (env ref names only). Operational KEMIT modules still use Firestore until a later cutover.
7. **Wave C:** A.N exposes read-only module summaries only. Operational KEMIT screens remain on Firestore/CustodyDB until an approved cutover package.
8. **SHADOW-D1:** System is dual-path until an explicit cutover package sets cutoverApproved and migrates data.
9. **READY-D3:** Readiness API never sets migrateAuthorized or cutoverApproved true. Migration requires a later dedicated package series.
10. **GATE-E1:** Run `npm run verify:an-plane` after plane packages. Does not authorize migration or cutover.
11. **MIGRATE-DRY-F1:** Full merge continues. F1 is report-only. Write migrate requires F2+ and AN_MIGRATE_WRITES=1.
12. **MIGRATE-WRITE-F2:** Warehouse SQL upsert only when AN_MIGRATE_WRITES=1. Stock balances and UI cutover are later packages.
13. **MIGRATE-WRITE-F4:** Opening stock only through atomic RECEIPT. Re-run is idempotent when qty already > 0.
14. **DECISIONS-1:** Inventory target engine = A.N; Custody stays KEMIT; **Login target = A.N-style auth** (Firebase is interim only until G-series cutover).
15. See `docs/MERGE_DECISIONS.md` for the binding decision matrix.
16. **AUTH-G1:** Target login is A.N-style per MERGE_DECISIONS. Interim path remains Firebase until G2+ cutover packages.
17. **AUTH-G2:** A.N login API exists behind AN_ENABLE_AN_LOGIN. Product UI login remains Firebase until G3+.
18. **AUTH-G3:** UI may call A.N login when AN_ENABLE_AN_LOGIN is on (login-target.anLoginFlag). Firebase path remains available.
19. **AUTH-G4:** With AN_ENABLE_AN_LOGIN, UI prefers A.N-only. Firebase login UI requires AN_ALLOW_FIREBASE_LOGIN=1. Server Firebase route remains.
20. **INV-UI-READ-1:** Inventory page shows A.N read summary only. Document posting remains KEMIT until INV write/cutover packages.
21. **AUTH-G5:** On startup, when PLATFORM_ADMIN_USERNAME/PASSWORD set, bootstrapPlatformAdmin runs on primary adapter (tenant default unless PLATFORM_ADMIN_TENANT_ID set).
22. **SEC-MIGRATE-1:** /api/an/migrate/* requires authenticated platform/system admin session before AN_MIGRATE_WRITES or dry-run.
23. **ADAPTER-COMPANY-1:** Migrate uses StorageRouter.resolveAdapter when company backend fields exist; otherwise process primary DATABASE_URL.
24. **INV-READ-LIST-1:** Authenticated read lists use per-company adapter resolution. Operational Inventory.tsx still CustodyDB.
25. **INV-STOCK-READ-1:** Stock balance read uses per-company adapter. No write. CustodyDB UI unchanged.
28. **SEC-COMPANY-SCOPE-1:** companyId on A.N inventory reads requires platform/admin elevation or membership match. 403 company_scope_denied otherwise.
29. **ADAPTER-FAIL-CLOSED-1:** Company config load errors do not fall back silently to process primary when AN_ADAPTER_FAIL_CLOSED is enabled (default).
30. **ADAPTER-ROUTE-TEST-1:** Automated proof that Shared vs Dedicated company backend settings do not collapse silently to the same resolve path.
31. **MIG-IDEM-1:** Write migrate routes require Idempotency-Key; per-row keys prevent duplicate stock/master on retry.
32. **ADAPTER-FAIL-CLOSED-2:** With fail-closed on, an unreadable company config (no admin db) never resolves to the process primary; migrate write routes require an existing company document unless an explicit backend is given. Read routes keep primary fallback for a missing company doc.
33. **INV-PILOT-1:** A.N inventory pilot writes (RECEIPT/ISSUE, single line) only when AN_INV_PILOT_WRITES=1, after operator auth + company scope + fail-closed adapter + Idempotency-Key. KEMIT Inventory.tsx and custody stay on CustodyDB/Firestore. cutoverApproved remains false.
34. **FIX-STORE-1:** `resolveAdapter` refuses the in-memory fallback when STRICT_PROD_SECURITY=true unless AN_ALLOW_INMEMORY_FALLBACK=1; connectionRef must match DATABASE_URL(_NAME); adapter certification enforced on Shared and Dedicated; recently used dedicated pools are never evicted (503-style error `dedicated_pool_cap_reached`).
35. **FIX-SEC-1:** `/api/an/auth/login` is limited per IP and per tenant:username; failures are uniform (`invalid_credentials`) and account state is revealed only after the password is verified; errors never echo internals; TokenService verifies HS256 only with timing-safe compare, checks token family inside the tenant scope, and refuses refresh for missing/inactive users. Durable lockout, 2FA and a persistent audit store are NOT part of this package.
36. **AUTH-BRIDGE-1:** Successful A.N login may attach firebaseCustomToken; APIs accept A.N Bearer access JWT. Cookies/refresh/me and full role map are out of scope.
37. **AUTH-COOKIES-1:** A.N access/refresh tokens set as HttpOnly cookies on login; authenticateSessionOrBearer reads an_access cookie; Login no longer stores A.N tokens in sessionStorage.
38. **AUTH-REFRESH-ME-1:** A.N plane exposes /api/an/auth/refresh, /logout, /me; refresh rotates tokens and re-sets HttpOnly cookies.
39. **AUTH-ROLE-MAP-1:** Login maps A.N roles via explicit table (Accountant/Auditor/WarehouseKeeper/…); unknown → StationAdmin; passwords are not trimmed.

## Verify

```bash
npx tsx scripts/verifyMergeAll.ts
```

Optional chain:

```bash
npx tsx scripts/verifyMergeM1.ts
npx tsx scripts/verifyMergeM2.ts
npx tsx scripts/verifyMergeM3.ts
npx tsx scripts/verifyMergeM4.ts
npx tsx scripts/verifyMergeM5.ts
```

## Next (post-merge, not part of M6)

- Operational PG role without BYPASSRLS on production `DATABASE_URL`
- Optional dedicated DB per company when `isolation_level=Dedicated`
- Gradual domain cutover (inventory/accounting) onto StorageRouter when ready
