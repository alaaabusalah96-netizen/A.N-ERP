# SEC-1 — acceptance rows (2FA secret disclosure / setup ownership / fabricated location)

Adapter: InMemory only (no database). The HTTP server is NOT started by the test; route behaviour is covered by static checks on `server.ts`.

| # | Requirement | Evidence | Status |
|---|---|---|---|
| T1 | Enrolled user, no code: challenge only, no secret / QR / token | `verifySec1TwoFactor.ts` T1/T7 | covered (service) |
| T2 | Correct TOTP authenticates | T2 (fake TOTP, not otplib) | covered (service) |
| T3 | Wrong TOTP fails | T3 | covered (service) |
| T4/T5 | Backup code works once, replay fails | T4, T5 | covered (service) |
| T6 | Repeated logins never create / change a secret | T6 | covered (service) |
| T8–T10 | Secret/QR only from explicit setup; wrong code keeps 2FA off; right code enables | T8, T9, T10 | covered (service) |
| T11 | Cross-tenant 2FA isolation | T11 | covered (InMemory tenant scoping) |
| T12 | Impossible travel + enrolled user: challenge only | T12 | covered (service) |
| — | Setup routes act only on the caller (no username from the body) | static checks + service API | covered (static) |
| — | Wrong 2FA codes count toward the progressive lockout | static check on `login` | covered (static, not executed) |
| — | No fabricated "Riyadh" location; unknown location never stored | static checks | covered (static) |

Not proven here (needs a running server / real PostgreSQL): a live HTTP login with a real otplib code; the lockout counter incrementing end to end; behaviour of `LoginScreen` for an enrolled user.

Behaviour changes: users without 2FA are no longer challenged on impossible travel (an alert and audit event are still raised); there is no UI yet to enrol in 2FA (the authenticated API `/api/auth/2fa/setup` + `/verify-setup` works on the caller's own account).
