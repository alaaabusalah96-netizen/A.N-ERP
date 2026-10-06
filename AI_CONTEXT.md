# A.N ERP AI Context

This repository contains the authoritative codebase for **A.N ERP (v7.2.0)**, an enterprise-grade financial and inventory management platform.

Before performing any architectural modifications, audits, or feature extensions, AI agents and engineers MUST read the primary project-state documents:

- [docs/AI_PROJECT_STATE.md](docs/AI_PROJECT_STATE.md) — Comprehensive technical state, architectural contracts, defect resolution, and audit scorecard.
- [docs/AI_PROJECT_STATE.json](docs/AI_PROJECT_STATE.json) — Structured, machine-readable repository baseline and verification metrics.

---

## Core Operational Principles

1. **Current Code is the Sole Source of Truth**:
   - Previous audit reports, obsolete defect classifications, and legacy documentation do NOT override the actual source code and executed test evidence.
2. **PostgreSQL Authoritative Engine**:
   - `PostgresPrimaryAdapter.ts` is the authoritative production engine implementing row locking (`SELECT FOR UPDATE`), multi-table transactions, and strict accounting/inventory invariants.
   - `InMemoryAdapter.ts` is maintained in complete behavioral parity for isolated unit tests.
3. **Core Subsystem Contracts**:
   - **Costing**: Weighted Average Cost (WAC), FIFO, and Specific Lot costing with atomic cost layer consumption.
   - **Negative Stock**: Strict fail-closed negative stock prevention (HTTP 422 `insufficient-stock`).
   - **Transfers**: Two-phase atomic dispatch and receipt with exact cost preservation across warehouses.
   - **Accounting Integration**: Automated inventory journaling with `PENDING_RETRY` resiliency against orphaned entries.
   - **Idempotency**: All mutations mandate `(tenant_id, idempotency_key, operation)` tracking with replay caching and in-flight conflict detection.
   - **Attachment Security**: Safe URL validation, filename sanitization, MIME whitelisting, and strict document existence/ownership checks.

---

- **Audit Date**: 2026-10-06
- **Version**: v7.2.0
- **Authoritative Verdict**: **GO** (Production-Ready)
