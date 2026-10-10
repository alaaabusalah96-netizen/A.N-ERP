# A.N ERP AI Context

This repository contains the authoritative codebase for **A.N ERP (v7.2.0)**, an enterprise financial and inventory management platform (Egyptian market orientation).

Before performing any architectural modifications, audits, or feature extensions, engineers and AI agents MUST consult:

- [docs/AI_PROJECT_STATE.md](docs/AI_PROJECT_STATE.md) — Technical state, defect register, and scorecard.
- [docs/AI_PROJECT_STATE.json](docs/AI_PROJECT_STATE.json) — Machine-readable state and test metrics.

**Rule:** Code + `evidence/` supersede stale prose. Last reconcile: **F2-S1-FIX** on **2026-10-10** (after Audit B + SEC-1/2).

---

## Core Operational Principles

1. **Evidence-Driven Reality** — batteries under `evidence/reconcile-audit-b/` are authoritative for the last full run; F2 post-fix log: `F2Decisions-after-s1-fix.txt`.
2. **PostgresPrimaryAdapter** — production engine (transactions, FOR UPDATE, RLS + GUC).
3. **InMemoryAdapter** — unit parity.
4. **Invariants** — atomic stock docs, PostingEngine paths for supplier invoices, idempotency keys, SEC-1 2FA, SEC-2 purchasing RLS.

---

## Current Verdict

| Field | Value |
|---|---|
| **Reconcile date** | 2026-10-10 |
| **package.json version** | 7.2.0 |
| **Authoritative verdict** | **CONDITIONAL GO** |
| **F-07** | PASS (8/0, DATABASE_URL set) |
| **F2Decisions** | **PASS 51/0** (after F2-S1-FIX) |
| **Open defect** | DEF-P2-002 (version-tracked migration engine) |

Representative gates: Sec1 26/26 · Sec2 39/39 · P8a 24/24 · P8c 14/14 · F2 **51/51** · F07 8/8.
