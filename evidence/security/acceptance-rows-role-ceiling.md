# SEC-ROLE-CEILING-1 — acceptance rows

Adapter: none (pure guard functions + static checks on `server.ts`). The HTTP server is not started.

| # | Requirement | Evidence | Status |
|---|---|---|---|
| 1 | A platform-level role (holds PLATFORM_ADMIN) is assignable only by a PLATFORM_ADMIN holder (POST and PATCH users) | `verifySecRoleCeiling.ts` A1–A7, R2, R4 | covered (guards + static) |
| 2 | A platform-level account cannot be modified, password-reset or session-revoked by a lower admin | T1–T4, R3, R5, R6 | covered (guards + static) |
| 3 | Nobody changes their own role | S1, S2, R4 | covered |
| 4 | The narrowing of admin/system_admin (no PLATFORM_ADMIN) is guarded against regression | G3 | covered |
| 5 | `verifyAuditWire` no longer pinned to a past package | `verifyAuditWire.ts` R-checks (28/0) | covered |

Not proven here: a live HTTP request against the routes (no server is started), PostgreSQL behaviour, unknown-role-name validation.
Behaviour change: an `admin` can no longer create/promote a `super_admin`/`platform_admin`, touch such an account, or change their own role.
