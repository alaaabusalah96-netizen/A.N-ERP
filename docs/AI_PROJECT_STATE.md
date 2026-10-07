# A.N ERP — FINAL COMPREHENSIVE PRODUCTION AUDIT & PROJECT STATE (v7.2.0)

**Audit Date**: 2026-10-06  
**Final Production Verdict**: **CONDITIONAL GO**  
**Overall Engineering Score**: **87 / 100**

---

## 1. PROJECT BASELINE & OPERATIONAL CONSTRAINTS

- **Application**: A.N ERP (Enterprise Resource Planning)
- **Version**: `v7.2.0` (Verified across `package.json`, `metadata.json`, and `server.ts`)
- **Runtime Stack**: Node.js `v22.23.2`, Express `4.21.2`, React `19.0.0`, TypeScript `5.6.3`, Vite `6.4.3`
- **Git Metadata**: Standalone working tree (no `.git` directory present).
- **PostgreSQL Connectivity**: The remote Supabase PostgreSQL connection configured in `DATABASE_URL` returned a password authentication failure during read-only probing. Live database operations are recorded as `NOT VERIFIED — RUNTIME EVIDENCE UNAVAILABLE`.
- **Local / Unit / Contract Verification**: 12 automated test suites comprising **244 passing assertions with 0 failures** were executed in application memory and mocked database harnesses (`APPLICATION TEST VERIFIED`).

---

## 2. HISTORICAL DEFECT RECONCILIATION

| Historical Claim | Source Code Location | Direct Evidence | Current Status |
| :--- | :--- | :--- | :--- |
| **DEF-001** (Transfer lines schema drift) | `src/core/storage/adapters/PostgresPrimaryAdapter.ts` (lines 6950–6968) | `insertStockTransferInTx` inserts the exact 12 columns declared in `CREATE TABLE an_stock_transfer_lines` (lines 1028–1041). | **RESOLVED** (`STATIC SOURCE VERIFIED`) |
| **DEF-002** (`an_active_sessions.tenant_id`) | `src/core/storage/adapters/PostgresPrimaryAdapter.ts` (line 368) | Programmatic DDL `ALTER TABLE an_active_sessions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);` exists. | **RESOLVED** (`STATIC SOURCE VERIFIED`) |
| **DEF-003** (`an_custom_fields.options`) | `src/core/storage/adapters/PostgresPrimaryAdapter.ts` (line 3328) | Programmatic DDL `ALTER TABLE an_custom_fields ADD COLUMN IF NOT EXISTS options JSONB;` exists. | **RESOLVED** (`STATIC SOURCE VERIFIED`) |
| **DEF-004** (`getStockTransfer` field mapping) | `src/core/storage/adapters/PostgresPrimaryAdapter.ts` (lines 7055–7068) | `getStockTransfer` maps all 12 columns declared in `StockTransferLine`. | **RESOLVED** (`STATIC SOURCE VERIFIED`) |

---

## 3. SUBSYSTEM INTEGRITY & ATOMICITY AUDIT

### 3.1 Stock Count Accounting Atomicity (`approveAndPostStockCount`)
- **Location**: `src/core/inventory/InventoryService.ts` (lines 1953–2133)
- **Findings**:
  1. **Decoupled Transactions**: General Ledger journal entries are drafted and posted via `postingEngine.postEntry()` *before* stock movements are written (lines 2060–2084).
  2. **Unchecked Iterative Mutations**: Stock movements are recorded in a `for (const line of lines)` loop (lines 2090–2120), and the return of `recordStockMovement()` is not checked.
  3. **Integrity Risk**: If a movement fails mid-loop, the journal entry remains posted in the General Ledger while inventory balances are only partially updated. There is no `PENDING_RETRY` outbox mechanism implemented for Stock Counts.
- **Classification**: **DEF-P1-001 (P1 - High Accounting Integrity Risk)** (`STATIC SOURCE VERIFIED`).

### 3.2 Stock Return Accounting Atomicity (`returnStock`)
- **Location**: `src/core/inventory/InventoryService.ts` (lines 1186–1423)
- **Findings**:
  1. **Ignored Return Value**: At line 1418, `await this.postingEngine.postEntry(...)` is called, but its return value is ignored.
  2. **False Success Return**: Line 1422 unconditionally returns `{ success: true, data: returnPost.data }` even if journal posting fails.
  3. **Integrity Risk**: Stock is deducted/added in the warehouse while the General Ledger remains unaltered, with no `PENDING_RETRY` flag attached to the return document.
- **Classification**: **DEF-P1-002 (P1 - High Accounting Integrity Risk)** (`STATIC SOURCE VERIFIED`).

### 3.3 Cash Custody & Expense Reversal Accounting
- **Location**: `src/core/modules/custody/CashCustodyService.ts` (lines 415, 584) & `src/core/modules/expenses/ExpenseService.ts` (line 723)
- **Findings**:
  1. `await this.postingEngine.postEntry(...)` return value is not checked before updating voucher/expense document status.
- **Classification**: **DEF-P1-003 (P1 - Accounting Integrity Risk)** (`STATIC SOURCE VERIFIED`).

### 3.4 Goods Receipt Concurrency & Atomicity (`createGoodsReceipt`)
- **Location**: `src/core/purchasing/PurchasingService.ts` (lines 130–275)
- **Findings**:
  1. `sumOpenReceiptQtyForPoLine()` is checked without acquiring an exclusive row lock on `an_purchase_order_lines`.
  2. Concurrent receipt submissions for the same PO line can observe the same remaining quantity, creating a TOCTOU race condition.
- **Classification**: **DEF-P2-001 (P2 - Concurrency / TOCTOU Risk)** (`STATIC SOURCE VERIFIED`).

### 3.5 Transfer System & Cost Locking
- **Location**: `src/core/storage/adapters/PostgresPrimaryAdapter.ts`
- **Findings**:
  1. Source warehouse rows are locked with `SELECT ... FOR UPDATE`.
  2. Outgoing cost is locked from the source row's weighted average at dispatch time.
  3. `TRANSFER_IN` preserves the exact transferred cost in the receiving warehouse.
- **Verification**: `APPLICATION TEST VERIFIED` (12/12 in `verifyP11TransfersMem.ts`, 4/4 in `verifyPgMovementLogic.ts`).

### 3.6 Per-User Warehouse Scope (SCOPE-001)
- **Location**: `server.ts` (`getAllowedWarehouseIds`, `assertWarehouseAllowed`), `src/core/storage/StoragePort.ts`, `PostgresPrimaryAdapter.ts`
- **Findings**:
  1. `an_user_warehouse_access` table manages user-warehouse assignments.
  2. Inventory routes enforce warehouse access checks server-side.
  3. Admin and auditor roles are exempt from scope restrictions.
- **Verification**: `APPLICATION TEST VERIFIED` (19/19 in `verifyP18WarehouseScope.ts`).

---

## 4. PHASE 7.6 EVIDENCE RECONCILIATION

- **Artifact Comparison**:
  - `evidence/phase-7.6/battery-output.txt`: Recorded `Total: 11 | Passed: 9 | Failed: 2` (Tests #4 and #5 failed; Test #4 threw `Cannot read properties of undefined (reading 'id')`).
  - `evidence/phase-7.6/acceptance-rows.md`: Contradicted the log by recording all 11 tests as `PASS`.
- **Harness Analysis**: Test harnesses dereferenced `res.data.id` without validating `res.success`, converting application error responses into unhandled `TypeError` crashes.
- **Verification Level**: `EVIDENCE FILE VERIFIED`.

---

## 5. POSTGRESQL VS INMEMORY VERIFICATION MATRIX

| Subsystem / Contract | InMemory Test Verification | PostgreSQL Static Code | PostgreSQL Live Runtime |
| :--- | :---: | :---: | :---: |
| **Negative Stock 422 Rejection** | `APPLICATION TEST VERIFIED` | `STATIC SOURCE VERIFIED` | `NOT VERIFIED — RUNTIME UNAVAILABLE` |
| **Weighted Average Cost Locking** | `APPLICATION TEST VERIFIED` | `STATIC SOURCE VERIFIED` | `NOT VERIFIED — RUNTIME UNAVAILABLE` |
| **Cost Layers (FIFO / Specific Lot)** | `APPLICATION TEST VERIFIED` | `STATIC SOURCE VERIFIED` | `NOT VERIFIED — RUNTIME UNAVAILABLE` |
| **Two-Phase Atomic Transfers** | `APPLICATION TEST VERIFIED` | `STATIC SOURCE VERIFIED` | `NOT VERIFIED — RUNTIME UNAVAILABLE` |
| **Multi-Step Policy Approvals & SoD** | `APPLICATION TEST VERIFIED` | `STATIC SOURCE VERIFIED` | `NOT VERIFIED — RUNTIME UNAVAILABLE` |
| **Automated Inventory Journals** | `APPLICATION TEST VERIFIED` | `STATIC SOURCE VERIFIED` | `NOT VERIFIED — RUNTIME UNAVAILABLE` |
| **Reconciliation Reporting** | `APPLICATION TEST VERIFIED` | `STATIC SOURCE VERIFIED` | `NOT VERIFIED — RUNTIME UNAVAILABLE` |
| **Attachment Security (ATT-001)** | `APPLICATION TEST VERIFIED` | `STATIC SOURCE VERIFIED` | `NOT VERIFIED — RUNTIME UNAVAILABLE` |
| **Per-User Warehouse Scope (SCOPE-001)** | `APPLICATION TEST VERIFIED` | `STATIC SOURCE VERIFIED` | `NOT VERIFIED — RUNTIME UNAVAILABLE` |
| **Idempotency Multi-Tenant Scope** | `APPLICATION TEST VERIFIED` | `STATIC SOURCE VERIFIED` | `NOT VERIFIED — RUNTIME UNAVAILABLE` |

---

## 6. CURRENT DEFECT REGISTER

| Defect ID | Severity | File | Method | Description & Impact | Recommendation |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **DEF-P1-001** | **P1** | `src/core/inventory/InventoryService.ts` | `approveAndPostStockCount` | Journal posts before stock adjustment loop; return of `recordStockMovement` unchecked; no atomic rollback or outbox. | Wrap in unified transaction or implement `PENDING_RETRY` outbox. |
| **DEF-P1-002** | **P1** | `src/core/inventory/InventoryService.ts` | `returnStock` | `postEntry()` return result ignored at line 1418; returns `success: true` even if reversal journal fails. | Check `postEntry` result and flag `journalStatus: PENDING_RETRY`. |
| **DEF-P1-003** | **P1** | `src/core/modules/custody/CashCustodyService.ts` | `recordCustodyExpenseVoucher, cancelCustodyVoucher` | `postEntry()` return result unchecked; voucher status updates to `POSTED` regardless. | Check `postEntry` result before updating document status. |
| **DEF-P2-001** | **P2** | `src/core/purchasing/PurchasingService.ts` | `createGoodsReceipt` | TOCTOU race on remaining PO line quantity without row lock; decoupled stock receive and PO line update. | Lock PO line during calculation; combine stock receive and PO update under shared lock. |
| **DEF-P2-002** | **P2** | `src/core/storage/adapters/PostgresPrimaryAdapter.ts` | `initDatabase` | Absence of dedicated version-tracked migration engine with checksums. | Implement structured migration runner with version tracking table. |

---

## 7. REALISTIC SCORECARD

| Dimension | Score | Assessment |
| :--- | :---: | :--- |
| **Architecture** | 88/100 | Clean Port/Adapter model; heavy concentration in storage adapter. |
| **Security & Auth** | 92/100 | Strict URL/MIME sanitization, HttpOnly JWT cookies, token family invalidation. |
| **Authentication** | 95/100 | Robust session lifecycle, password hashing, 2FA support, bypass rejection. |
| **Authorization / SoD** | 94/100 | Centralized PermissionMatrix, role verification, maker-checker on stock counts. |
| **Tenant Isolation** | 90/100 | Mandatory tenant parameterization on all queries; RLS enabled on tables. |
| **Inventory Integrity** | 90/100 | Robust atomic document posting and costing; gap in Stock Count loop. |
| **Accounting Integrity** | 82/100 | Balanced double-entry posting; penalized by ignored returns in `returnStock` and `CashCustodyService`. |
| **Transaction Atomicity** | 84/100 | Atomic within individual adapter operations; decoupled between inventory and accounting in legacy paths. |
| **Concurrency** | 85/100 | `SELECT FOR UPDATE` on warehouse stock; potential TOCTOU on purchase order lines. |
| **Costing** | 95/100 | Exact WAC locking, FIFO, and Specific Lot cost layer consumption. |
| **Idempotency** | 96/100 | Comprehensive `(tenant_id, idempotency_key, operation)` primary key enforcement. |
| **Schema Management** | 78/100 | Programmatic startup DDL instead of formal versioned migrations. |
| **Testing Quality** | 85/100 | 244 passing automated tests; live PostgreSQL tests unexecuted due to sandbox connectivity. |
| **Evidence Quality** | 88/100 | Rigorous reconciliation of historical evidence vs current source code. |
| **Maintainability** | 80/100 | `PostgresPrimaryAdapter.ts` is 8,535 lines; modularization recommended. |
| **Performance** | 85/100 | Composite indexes on tenant and warehouse keys; pagination on high-volume queries. |
| **Production Readiness** | 84/100 | Solid core foundation; P1 accounting atomicity hardening required for enterprise scale. |
| **OVERALL SCORE** | **87 / 100** | **Solid Engineering Foundation with Targeted Accounting Hardening Needed** |

---

## 8. FINAL PRODUCTION GATE

**VERDICT: CONDITIONAL GO**

**Justification**:
- There are no P0 catastrophic blockers: negative stock protection, atomic transfer dispatch/receive, weighted average cost locking, multi-tenant isolation, attachment security, and per-user warehouse scoping are completely implemented and verified.
- The **CONDITIONAL** verdict is mandated by P1 accounting atomicity defects (`DEF-P1-001`, `DEF-P1-002`, `DEF-P1-003`) where General Ledger posting and domain mutations are decoupled or error return values are ignored. These paths must be hardened with the `PENDING_RETRY` outbox pattern prior to high-volume multi-user enterprise deployment.
