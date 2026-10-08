# Usability — F3

No screens were added. F3 exposes three read-only API routes for auditors and accountants; there are no click paths, no UI measurements and no screenshots to report.

| Route | Permission | Use |
|---|---|---|
| `GET /api/standards/explain/journal/:entryId` | `ENTRY_VIEW` | "Why was this entry posted?" — structured sections plus Arabic and English text |
| `GET /api/standards/explain/decision/:id` | `AUDIT_LOG_VIEW` | Same explanation starting from a stored decision |
| `GET /api/standards/decisions?eventType=&eventId=&journalEntryId=&status=&limit=` | `AUDIT_LOG_VIEW` | Find decisions (limit capped at 200) |

Proven by the acceptance suite at logic level: all three are GET-only and behind `requireAuth` + `requirePermission` (static check S4); an unauthenticated call to the explain route returns 401 (Studio HTTP check, F3a). Permission behaviour for each role was **not** exercised end to end over HTTP.
User-visible screens for the explanation (an "Explain" action next to a journal entry) are a future UI phase.
