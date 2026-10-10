# A.N ERP AI Context

This repository contains the authoritative codebase for **A.N ERP (v7.2.0)**, an enterprise financial and inventory management platform (Egyptian market orientation).

Before performing any architectural modifications, audits, or feature extensions, engineers and AI agents MUST consult:

- [docs/AI_PROJECT_STATE.md](docs/AI_PROJECT_STATE.md) — Technical state, defect register, and scorecard.
- [docs/AI_PROJECT_STATE.json](docs/AI_PROJECT_STATE.json) — Machine-readable state and test metrics.

**Rule:** Code + `evidence/` supersede stale prose. Reconciled by **Audit B** on **${when}** (regression + F-07 probe).

---

## Core Operational Principles

1. **Evidence-Driven Reality** — batteries under `evidence/reconcile-audit-b/` are the latest run.
2. **PostgresPrimaryAdapter** — production engine (transactions, FOR UPDATE, RLS + GUC).
3. **InMemoryAdapter** — unit parity.
4. **Invariants** — atomic stock docs, PostingEngine paths for supplier invoices, idempotency keys, SEC-1 2FA, SEC-2 purchasing RLS.

---

## Current Verdict (Audit B)

| Field | Value |
|---|---|
| **Reconcile date** | 2026-10-10 |
| **package.json version** | 7.2.0 |
| **Authoritative verdict** | **CONDITIONAL GO** |
| **F-07** | PASS |
| **Open defect** | DEF-P2-002 (version-tracked migration engine) |
| **Critical gates** | PASS |

Representative results: Sec1TwoFactor: 26/26 (PASS); Sec2Rls: 39/39 (PASS); P8aProcurement: 24/24 (PASS); P8cThreeWay: 14/14 (PASS); F07StorageRouter: 8/8 (PASS).
