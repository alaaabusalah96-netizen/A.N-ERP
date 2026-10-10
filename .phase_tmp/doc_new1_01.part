# A.N ERP AI Context

This repository contains the authoritative codebase for **A.N ERP (v7.2.0)**, an enterprise financial and inventory management platform (Egyptian market orientation).

Before performing any architectural modifications, audits, or feature extensions, engineers and AI agents MUST consult:

- [docs/AI_PROJECT_STATE.md](docs/AI_PROJECT_STATE.md) — Technical state, architectural contracts, defect register, and scorecard.
- [docs/AI_PROJECT_STATE.json](docs/AI_PROJECT_STATE.json) — Machine-readable repository state and test metrics.

**Rule (from AN-ERP-WORKFLOW-GUIDE):** `AI_CONTEXT.md` and `docs/AI_PROJECT_STATE.*` can lag the code. **The code and reproducible evidence are the source of truth.** This file was reconciled on **2026-10-10** against the post–Phase-8c-FIX + SEC-1 + SEC-2 tree.

---

## Core Operational Principles

1. **Evidence-Driven Reality**
   - Source code, schema, and battery outputs under `evidence/` supersede stale audit prose.
2. **Authoritative Storage & Dual Adapter**
   - `PostgresPrimaryAdapter.ts` — production engine (transactions, `SELECT FOR UPDATE`, RLS + `app.current_tenant_id`).
   - `InMemoryAdapter.ts` — behavioral parity for unit batteries.
3. **Core Subsystem Invariants**
   - **Costing**: WAC / FIFO / Specific Lot with atomic cost layers.
   - **Negative stock**: fail-closed (HTTP 422 `insufficient-stock`).
   - **Atomic stock documents**: `postStockDocumentAtomic` — no partial post on failure.
   - **Accounting**: PostingEngine-only paths for supplier invoice approval; GR/IR clearing; `PENDING_RETRY` where designed.
   - **Idempotency**: `(tenant_id, idempotency_key, operation)` with replay / in-flight conflict.
   - **Attachments**: URL/name/MIME/ownership checks.
   - **2FA (SEC-1)**: enrolled users never receive TOTP secret/QR at login; setup only on session user.
   - **RLS purchasing (SEC-2)**: twelve purchasing tables under tenant isolation policy + GUC on write/read paths.

---

## Current Verdict (reconciled)

| Field | Value |
|---|---|
| **Reconcile date** | 2026-10-10 |
| **package.json version** | 7.2.0 |
| **Authoritative verdict** | **CONDITIONAL GO** |
| **Blocking open defect** | DEF-P2-002 (version-tracked migration engine) — architectural gap, not an active P1 data-corruption defect |
| **Unproven** | F-07 StorageRouter deadlock — needs PostgreSQL concurrency re-test |

Do **not** treat older `NO-GO` text from pre-reconcile audit copies as current.
