# A.N ERP — FINAL MASTER AUDIT & PROJECT STATE (v7.2.0)

**Audit Date**: 2026-10-05  
**Overall Verdict**: **CONDITIONAL GO** (Blocked by Critical Schema Drift)

---

## 1. PROJECT IDENTITY & ARCHITECTURE

- **Application**: A.N ERP (Integrated Enterprise Resource Planning)
- **Version**: 7.2.0
- **Backend**: Node.js 22, Express 4, TypeScript
- **Database**: PostgreSQL (Authoritative), InMemory (Development/Testing)
- **Architecture**: Port/Adapter pattern. Business logic and transaction management are centralized in the PostgreSQL Adapter (`PostgresPrimaryAdapter.ts`) to ensure atomic enforcement of rules.

### Canonical Architecture Map
```text
Frontend (React 19)
   ↓
API / Routes (server.ts)
   ↓
Services / Domain (src/core/inventory/InventoryService.ts, etc.)
   ↓
StoragePort / Interfaces (src/core/storage/StoragePort.ts)
   ↓
PostgresPrimaryAdapter (src/core/storage/adapters/PostgresPrimaryAdapter.ts)
   ↓
PostgreSQL Database
```

---

## 2. PART 0 — FINAL RECONCILIATION SUMMARY

### 2.1 Transfer Dispatch Failure (Phase 11 Regression)
- **Symptom**: `createTransfer` returns `success:false`. Phase 7.6 Test #4 fails with `Cannot read properties of undefined (reading 'id')`.
- **Root Cause**: **PROVEN**. `insertStockTransferInTx` (Line 6388) attempts to insert into columns `line_number`, `uom`, and `notes` in `an_stock_transfer_lines`. These columns are missing in the authoritative schema definition (Lines 921-934).
- **Impact**: All Stock Transfers are broken in the PostgreSQL environment.

### 2.2 Schema Drift Reconciliation
| Table | Column | Application Usage | Database Status | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| `an_stock_transfer_lines` | `line_number` | **WRITE/INSERT** | **MISSING** | **CRITICAL DEFECT** |
| `an_stock_transfer_lines` | `uom` | **WRITE/INSERT** | **MISSING** | **CRITICAL DEFECT** |
| `an_stock_transfer_lines` | `notes` | **WRITE/INSERT** | **MISSING** | **CRITICAL DEFECT** |
| `an_active_sessions` | `tenant_id` | **EXPECTED** | **MISSING** | **HIGH RISK** |
| `an_custom_fields` | `options` | **EXPECTED** | **MISSING** | **MEDIUM RISK** |

### 2.3 "getStockTransfer" Mapping
- **Status**: **INCOMPLETE READ MODEL**.
- **Evidence**: `getStockTransfer` (Line 6492) maps a subset of columns. It fails to map `line_number`, `uom`, and `notes` back to the `StockTransferLine` object, even though they are written during dispatch.

---

## 3. CANONICAL BUSINESS CONTRACTS

### 3.1 Inventory Movement Contract
- **Authority**: `an_warehouse_stock` table represents the authoritative balance.
- **Rules**:
  1. **Locking**: Must perform `SELECT ... FOR UPDATE` on the balance row before mutation.
  2. **Atomicity**: Document creation, movement logging, and balance update must happen in ONE transaction.
  3. **Negative Stock**: If `rejectNegative` is true, the transaction MUST rollback if balance becomes < 0.
  4. **Costing**: Uses **Weighted Average Cost**.

### 3.2 Weighted Average Cost Contract
- **Calculation**: `(ExistingValue + IncomingValue) / (ExistingQty + IncomingQty)`.
- **Locking**: The cost is "locked" at the moment of **Dispatch** for transfers and stored on the transfer line.
- **Receive**: The receiving warehouse uses the **locked cost** from the dispatch as its incoming value basis.

### 3.3 Idempotency Contract
- **Identification**: `(tenant_id, idempotency_key, operation)` identifies a unique request.
- **Enforcement**: Managed by `an_idempotency_keys` table with `IN_PROGRESS` and `COMPLETED` states.
- **Retries**: Retrying a completed operation returns the cached payload. Retrying an in-progress operation returns 409 Conflict.

---

## 4. SECURITY & ISOLATION FINAL STATE

| Control | Status | Evidence | Risk |
| :--- | :--- | :--- | :--- |
| **Tenant Isolation** | **VERIFIED** | Enforced via `tenant_id` on all queries. | Low |
| **RLS** | **PARTIALLY VERIFIED** | RLS is enabled on tables. | Medium (BYPASSRLS reported) |
| **IDOR** | **PASS** | Tests verify tenant context is never client-controlled. | Low |
| **RBAC / SoD** | **PASS** | `InventoryService` enforces maker-checker on counts. | Low |

---

## 5. CURRENT KNOWN DEFECTS (REGISTER)

| ID | Defect | Severity | Status | Fix Required |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-001** | Missing columns in `an_stock_transfer_lines` | **CRITICAL** | OPEN | Add line_number, uom, notes |
| **DEF-002** | Missing `tenant_id` in `an_active_sessions` | **HIGH** | OPEN | Add column to session table |
| **DEF-003** | Missing `options` in `an_custom_fields` | **MEDIUM** | OPEN | Add column to custom fields |
| **DEF-004** | Incomplete mapping in `getStockTransfer` | **LOW** | OPEN | Map uom/notes from result |

---

## 6. PRODUCTION READINESS ASSESSMENT

**Verdict**: **NO-GO** (Until DEF-001 is fixed).

### Critical Blockers
1. **Broken Stock Transfers**: Transfers cannot be dispatched or received in PostgreSQL due to schema mismatch.
2. **Phase 7.6 Battery Failures**: Tests #4 and #5 remain failing in the target environment.

### Recommended Roadmap
- **P0**: Apply schema migration for `an_stock_transfer_lines`.
- **P1**: Fix mapping in `PostgresPrimaryAdapter.ts`.
- **P2**: Verify Phase 7.6 battery pass with PostgreSQL backend.

---

## 7. AI HANDOFF SUMMARY

- **Current State**: Phase 11 implemented high-integrity atomic operations but exposed critical schema drift in the PostgreSQL adapter.
- **Verified Strengths**: Transactional integrity, cost locking logic, and deadlock-free locking strategy.
- **Critical Failure**: The SQL in the adapter expects columns that do not exist in the database initialization scripts.
- **Next Action**: Run migrations to sync database schema with the adapter's expected SQL.

**FILES TO READ FIRST**:
1. `docs/AI_PROJECT_STATE.md` (This file)
2. `src/core/storage/adapters/PostgresPrimaryAdapter.ts` (Lines 890-950 for schema, 5936 for math)
3. `src/core/inventory/InventoryService.ts` (Lines 1400-1550 for transfer lifecycle)

---
**Audit Environment**: Node 22 / Postgres 15 Simulation  
**Audit Metadata**: Consolidated from 11 phases of investigation.
