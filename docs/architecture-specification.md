# Architecture Specification (v1.0)
# المواصفات الفنية والبنية المعمارية للنظام

This document details the multi-layered enterprise architecture of **KEMIT ERP**, describing how module layers interact and detailing the future shared enterprise engine structure.

---

## 1. System Topology & Layers / طبقات وهيكلية النظام

The enterprise architecture consists of four distinct operational layers to ensure separation of concerns, high maintainability, and clean state propagation.

```
+-------------------------------------------------------------+
|                     Presentation Layer                      |
| (React Modules: Custody, Warehouses, Purchasing, Accounting)|
+------------------------------+------------------------------+
                               | Event Emitters & State Sync
                               v
+-------------------------------------------------------------+
|                   Business Logic Layer                      |
|  (Central Enterprise Engines: Settle, Transfer, Inventory)  |
+------------------------------+------------------------------+
                               | Atomic Document Commit Contracts
                               v
+-------------------------------------------------------------+
|                     Persistence Layer                       |
|          (Multi-Tenant Firestore Collections)               |
+------------------------------+------------------------------+
                               | Direct Document Listeners / REST APIs
                               v
+-------------------------------------------------------------+
|                    Infrastructure Layer                     |
|           (GCP Cloud Run Backend Server (Express))          |
+-------------------------------------------------------------+
```

---

## 2. Shared Enterprise Engines Design Specification / مواصفات المحركات المشتركة

When implemented in subsequent phases, the shared engines will follow a strict stateless design. They accept inputs, fetch dependent data within transaction boundaries, validate state, and commit changes using atomic writes.

### A. Sequence Generator / منشئ الترقيم المتسلسل التلقائي
- **Purpose**: Generates gap-free, tenant-scoped document sequences (e.g., `WH-INV-2026-0001`).
- **Mechanism**: Reads from `company_sequences/{company_id}` inside a Firestore transaction, increments the value, and returns it.

### B. Accounting Journal Engine / محرك قيود اليومية المحاسبية
- **Purpose**: Automates double-entry transaction generation from any operational event.
- **Mechanism**: Formats credit/debit arrays based on the source document and appends them to ledger records.

### C. Unified Notification Engine / محرك الإشعارات والتحذيرات الموحد
- **Purpose**: Dispatches inside-app notifications and outgoing SMTP alerts.
- **Mechanism**: Reads template configuration, binds properties, and writes to `Notifications` and triggers mail transport.

---

## 3. Communication Patterns / بروتوكولات الاتصال بين الطبقات

1. **Client-to-Server REST APIs**:
   - Used for non-idempotent operations or operations requiring external servers (SMTP setup, password OTP verification).
   
2. **Direct Firestore Subscriptions**:
   - Client views bind directly to relevant queries in Firestore (scoped strictly to `company_id`). Real-time state replication allows the interface to update instantly without polling.

3. **Domain Event Broadcasting**:
   - High-integrity operations publish explicit events to `TransactionHistory` or `AuditLogs` to ensure reliable auditing and tracking of business workflow progression.
