# A.N ERP AI Context

This repository contains the authoritative codebase for **A.N ERP (v7.2.0)**, an enterprise financial and inventory management platform.

Before performing any architectural modifications, audits, or feature extensions, engineers and AI agents MUST consult:

- [docs/AI_PROJECT_STATE.md](docs/AI_PROJECT_STATE.md) — Comprehensive technical state, architectural contracts, defect register, and audit scorecard.
- [docs/AI_PROJECT_STATE.json](docs/AI_PROJECT_STATE.json) — Machine-readable repository state, contract verifications, and test metrics.

---

## Core Operational Principles

1. **Evidence-Driven Reality**:
   - Source code, database definitions, and reproducible test evidence supersede previous speculative audit reports.
2. **Authoritative Storage & Dual Adapter Architecture**:
   - `PostgresPrimaryAdapter.ts` is the authoritative production engine implementing row-level locking (`SELECT FOR UPDATE`), multi-table transactions, and financial invariants.
   - `InMemoryAdapter.ts` provides complete behavioral parity for isolated local unit testing.
3. **Core Subsystem Invariants**:
   - **Costing**: Weighted Average Cost (WAC), FIFO, and Specific Lot costing with atomic cost layer consumption (`an_stock_cost_layers`).
   - **Negative Stock**: Strict fail-closed negative stock prevention (HTTP 422 `insufficient-stock`).
   - **Atomic Transfers**: Two-phase atomic dispatch and receipt with exact cost preservation across warehouses.
   - **Accounting Integration**: Automated inventory journaling with `PENDING_RETRY` resiliency against orphaned entries.
   - **Idempotency**: All mutations mandate `(tenant_id, idempotency_key, operation)` tracking with replay caching and in-flight conflict detection.
   - **Attachment Security**: Safe URL validation, filename sanitization, MIME whitelisting, and strict document existence/ownership checks.

---

- **Audit Date**: 2026-10-06
- **Version**: v7.2.0
- **Authoritative Verdict**: **CONDITIONAL GO** (Audit Complete — P1 accounting atomicity hardening identified for Stock Count and Stock Return)
