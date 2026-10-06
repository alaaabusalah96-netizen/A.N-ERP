# A.N ERP — AUTHORITATIVE MASTER AUDIT & PROJECT STATE (v7.2.0)

**Audit Date**: 2026-10-06  
**Final Production Verdict**: **GO** (All Core Contracts & Invariants Verified)  
**Overall Engineering Score**: **94 / 100**

---

## 1. EXECUTIVE SUMMARY & RECONCILIATION

This master audit supersedes all historical reports, obsolete defect classifications, and unverified assumptions. The current codebase represents an enterprise-grade ERP architecture with comprehensive guarantees across inventory atomicity, cost preservation, multi-layer valuation (WAC, FIFO, Specific Lot), automated financial journaling, policy-based approvals, purchasing workflows, and attachment security.

### Old Claim vs Current Reality Reconciliation Matrix
| Old Claim | Current Code Evidence | Authoritative Status |
| :--- | :--- | :--- |
| **DEF-001** (Transfer lines schema drift) | `PostgresPrimaryAdapter.ts` lines 6950–6968 inserts the exact 12 columns declared in `CREATE TABLE an_stock_transfer_lines` (lines 1028–1041). | **FIXED / OBSOLETE** |
| **DEF-002** (`an_active_sessions` missing `tenant_id`) | Programmatic DDL `ALTER TABLE an_active_sessions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64)` present at line 368. | **FIXED** |
| **DEF-003** (`an_custom_fields` missing `options`) | Programmatic DDL `ALTER TABLE an_custom_fields ADD COLUMN IF NOT EXISTS options JSONB` present at line 3328. | **FIXED** |
| **DEF-004** (`getStockTransfer` mapping dropped fields) | `getStockTransfer` (lines 7055–7068) maps all 12 columns conforming strictly to `StockTransferLine`. | **FIXED** |
| **Phase 7.6 Test #4 Crash** (`Cannot read properties of undefined (reading 'id')`) | Caused by unhandled `createTransfer()` failure under old schema mismatch. Resolved with atomic transfer contract. | **FIXED** |
| **Negative Stock Protection** | `applyMovementInTx()` enforces row-level `FOR UPDATE` lock and rejects `newQty < -0.00005` with RFC7807 status 422 before any mutation. | **PROVEN** |
| **Weighted Average Cost Locking** | `createTransfer()` locks source balance row, records exact outgoing average cost, and `receiveTransfer()` credits receiving warehouse at the locked cost. | **PROVEN** |
| **PostgreSQL BYPASSRLS Risk** | PostgreSQL superuser role in hosted instances bypasses RLS; mitigated by application-level mandatory `tenant_id` query constraints and auth context scoping. | **ARCHITECTURAL NOTE** |

---

## 2. CANONICAL SUBSYSTEM CONTRACTS

### 2.1 Inventory & Costing (COST-001, STK-ATOMIC-001)
- **Authority**: `an_warehouse_stock` is the authoritative balance table.
- **Valuation Methods**:
  - `WEIGHTED_AVERAGE`: Computed as `(ExistingValue + IncomingValue) / (ExistingQty + IncomingQty)`.
  - `FIFO`: Pure first-in-first-out cost layer consumption via `an_stock_cost_layers`.
  - `SPECIFIC_LOT`: Lot-specific layer consumption referencing purchase order / document numbers.
- **Fail-Closed Behavior**: If stock or cost layers cannot satisfy an issue or transfer, the transaction fails immediately with HTTP 422 (`insufficient-stock` or `insufficient-lot-stock`) without partial writes.

### 2.2 Atomic Transfers (STK-ATOMIC-002)
- Two distinct atomic phases:
  1. `DISPATCH`: Source warehouse row locked, stock deducted, `an_stock_transfers` row created in `IN_TRANSIT` status, transfer lines inserted with locked cost.
  2. `RECEIVE`: Target warehouse row locked, stock incremented with exact transferred value, transfer status updated to `RECEIVED`.

### 2.3 Automated Accounting & Journal Resiliency (ACC-AUTO-001, REC-001)
- **Decoupled Resiliency**: If stock movement commits but automated journal posting encounters an error, document status is flagged as `PENDING_RETRY`.
- **Reconciliation Engine**: `getInventoryReconciliation()` computes live aggregate parity between warehouse stock valuation and general ledger balances (accounts 1105, 1109, etc.).

### 2.4 Purchasing & Goods Receipts (PO-001)
- Purchase Orders progress through `DRAFT` → `OPEN` → `PARTIALLY_RECEIVED` → `RECEIVED`.
- Goods Receipts support policy-based multi-step approval workflows (`IN_APPROVAL` → `APPROVED`) before stock movements post.

### 2.5 Document Attachment Security (ATT-001)
- **URL Whitelisting**: Strict public HTTPS validation; credentials, localhost, and RFC1918 private IPv4/IPv6 ranges strictly rejected.
- **File & MIME Sanitization**: Path traversal removed; allowed extensions constrained to safe document/image formats; file size capped at 20MB; max 50 attachments per document.
- **Ownership & Existence**: Document existence and user tenancy/ownership validated prior to viewing or attaching files.

---

## 3. AUDIT SCORECARD

| Dimension | Score | Assessment |
| :--- | :---: | :--- |
| **Architecture** | 96/100 | Clean Port/Adapter structure; clear domain boundaries. |
| **Security & Auth** | 95/100 | Role-Permission Matrix, HttpOnly JWT cookies, strict secret enforcement. |
| **Tenant Isolation** | 92/100 | Enforced on every SQL query and authContext; RLS enabled. |
| **Inventory Integrity** | 98/100 | Atomic transactions, row locks, locked costing, layer management. |
| **Accounting Integrity** | 96/100 | Balanced double-entry posting, PostingEngine authority, journal retry resiliency. |
| **Idempotency** | 98/100 | Robust idempotency keys with collision prevention and replay caching. |
| **Testing Coverage** | 95/100 | 225 automated unit/integration/contract test assertions passing with 0 failures. |
| **Production Readiness** | 94/100 | Fully compiled and verified on Node 22 / Express 4 / React 19. |

---

## 4. VERIFICATION EVIDENCE SUMMARY

- **TypeScript Compilation**: `npx tsc --noEmit` → **0 errors**.
- **Production Build**: `npm run build` → **Succeeded in 4.8s**.
- **Automated Test Battery**:
  - `verifyPgMovementLogic.ts`: **4 / 4 PASS** (Negative stock 422, WAC lock, cost layers).
  - `verifyP10StockAtomicMem.ts`: **12 / 12 PASS** (Atomic document posting & concurrency).
  - `verifyP11TransfersMem.ts`: **12 / 12 PASS** (Atomic two-phase transfers & cost preservation).
  - `verifyP12ApprovalsMem.ts`: **35 / 35 PASS** (Maker-checker & multi-step approval policies).
  - `verifyP13Costing.ts`: **50 / 50 PASS** (WAC, FIFO, Specific Lot costing invariants).
  - `verifyP14AutoJournals.ts`: **24 / 24 PASS** (Automated stock accounting & retry).
  - `verifyP15Purchasing.ts`: **25 / 25 PASS** (Purchase orders & goods receipts lifecycle).
  - `verifyP16Recon.ts`: **14 / 14 PASS** (Stock vs ledger reconciliation).
  - `verifyP17Attachments.ts`: **29 / 29 PASS** (Attachment security, URLs, MIME, ownership).
  - `testIdempotencySuite.ts`: **5 / 5 PASS** (Sequential, concurrent, cross-tenant idempotency).
  - `verifyPhase3AuthBypass.ts`: **15 / 15 PASS** (Strict rejection of auth bypasses).

---

## 5. FINAL PRODUCTION GATE: GO

The codebase satisfies all operational, architectural, and financial integrity gates.
