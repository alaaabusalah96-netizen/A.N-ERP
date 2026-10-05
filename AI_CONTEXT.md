# A.N ERP AI Context

This repository contains the A.N ERP system (v7.2.0), a high-integrity financial and inventory management platform.

Before performing any modifications, audits, or repairs, read the following project-state documentation:

- [docs/AI_PROJECT_STATE.md](docs/AI_PROJECT_STATE.md) — Comprehensive human-readable project status, architecture, and contracts.
- [docs/AI_PROJECT_STATE.json](docs/AI_PROJECT_STATE.json) — Structured, machine-readable repository state.

## Core Principles
1. **Source Code is Authoritative**: If documentation conflicts with the actual repository content, the source code represents the current reality.
2. **PostgreSQL over InMemory**: The application uses a strict StoragePort abstraction. InMemory tests do NOT guarantee PostgreSQL correctness or schema compatibility.
3. **Canonical Contracts**: Major subsystems (Accounting, Inventory, Tenancy) follow strict architectural contracts. Do not break these without an explicit contract-review phase.
4. **Idempotency**: All mutations must be idempotent and failure-closed.

Audit Date: 2026-10-05
Status: Consolidated Master Audit Completed.
