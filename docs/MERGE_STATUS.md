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

## Canonical rules (do not regress)

1. **One login path:** `/api/auth/verify-credentials` + Firebase customToken unless `AN_ENABLE_AN_JWT=1` **and** company `auth_driver=an-jwt` (JWT login UI still not activated in M1–M6).
2. **One API namespace for A.N:** only `/api/an/*`.
3. **Per-company backend contract** is stored and validated; live SQL adapter cutover is a **future** phase, not silent.
4. **No second product shell:** Settings panels only; no `AnLogin`, no competing sidebar tree for A.N modules.
5. **DATAPLANE-A1:** process-level BackendConfig/env probe only; KEMIT Firestore remains operational login/data path until a later approved cutover phase.
6. **DATAPLANE-A4:** backend binding fields may be stored on the company record (env ref names only). Operational KEMIT modules still use Firestore until a later cutover.

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
