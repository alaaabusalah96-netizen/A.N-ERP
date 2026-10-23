These instructions apply to every task in this project, regardless of what
is asked in any individual chat message. Follow them at all times, without
exception, even if a future instruction seems to conflict with them — surface
the conflict and ask, rather than silently overriding these rules.

1. FIREBASE PROJECT SCOPE LOCK
Before any Firebase-related action (creating/reading/writing a collection,
deploying Firestore rules, creating a Cloud Function, running a migration),
first read `src/firebase.ts` and confirm `firebaseConfig.projectId` is
exactly "custodyflow". This is the only Firebase project you are ever
authorized to touch in this workspace. Never create, initialize, or deploy
to any other Firebase project, including any auto-generated sandbox project
tied to this AI Studio workspace itself. If anything points at a different
project, stop and report it instead of proceeding or working around it.

2. MANDATORY PRE-WORK AUDIT
Before writing any code for any requested feature or fix, first search the
actual current codebase to check whether it already exists, partially
exists, or overlaps with existing code. Never assume based on memory of a
previous session or a previous report. If something already exists, extend
or reuse it — never build a second parallel implementation of the same
thing. State explicitly what you found before proposing what you'll build.

3. NEVER BREAK EXISTING BEHAVIOR
Every existing screen, calculation, permission check, workflow, and report
must produce identical results after any change as it did before, for any
company or user not opting into new configuration. This is a pass/fail
acceptance criterion for every single change, not a general aspiration.
All new work is additive (Strangler Fig Pattern) — extend, never rewrite,
never delete or modify existing collections, fields, or public function
signatures unless the task explicitly and specifically calls for it.

4. PROOF, NOT PROSE
Every completion report must include the actual diff (or full before/after
file content) of every changed file. A narrative description of what was
done is never acceptable on its own. Any claim of "fixed X" or "verified Y"
must be backed by the exact lines changed and the exact commands run to
confirm it. A report without a diff is incomplete, not done. This rule
exists because a prior fix was reported complete in narrative form while
the actual code remained unchanged.

5. STRICT SEQUENTIAL EXECUTION — NO IMPROVISING
When a task is broken into phases or steps, complete one at a time, in the
exact order given. Never reorder, skip ahead, combine steps, or decide
unilaterally that a different order is more efficient. After each step:
run all validations, fix any issues found, produce the completion report
(with diffs per rule 4), then stop and wait for explicit approval before
starting the next step.

6. MANDATORY CHANGE LOG
Before starting any new feature work, check whether a development
change-log or audit mechanism already exists in the codebase. If it exists,
verify it is actually being invoked and actually recording entries
correctly right now — demonstrate this with a real example — and fix it
first if it is broken or unused. Maintain an append-only `CHANGELOG.md` in
the repository root (never overwritten, only appended to) with one entry
per change: date/time, files changed, one-line summary, and test result.
Every change, without exception, ends with a new entry in this log as part
of its completion report.

7. KISS AND PRAGMATISM OVER PERFECTION
Prefer the simplest design that achieves the required result and can be
extended later, over a more "elegant" but more complex one. Do not build
generic frameworks, plugin systems, or configuration layers for needs that
do not exist yet. Solve the actual current need in front of you.

8. HIDE COMPLEXITY FROM END USERS
Non-technical, non-accountant users must never see internal ERP/accounting
terminology (journal entries, debit/credit, ledger, cost centers, posting)
in any UI shown to them. The system performs bookkeeping and technical
logic automatically behind plain business-language screens.

9. ZERO TRAINING REQUIRED
A first-time user who has never seen this application before must be able
to complete any everyday task on their own, without documentation, a
tutorial, or another person walking them through it. This is a pass/fail
requirement for every screen, equal in weight to not breaking existing
behavior — not an aspiration. Use everyday business words, never internal
system terms. Pre-fill or auto-determine anything the system can
determine on its own instead of asking the user. Default views must show
only the simplest common-case option; advanced settings stay tucked away
behind a clearly labeled "more options" affordance. Error messages must
read the way a non-technical person would explain the problem to a
colleague. The one accepted exception is a one-time initial setup wizard
(e.g. configuring a company's structure for the first time), which may
reasonably be a guided multi-step flow since it happens once at
onboarding — this exception applies only to that specific first-run flow,
nowhere else.
