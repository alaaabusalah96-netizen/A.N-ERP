# Project File Index (فهرس ملفات المشروع)

This index documents the critical files, paths, structural dependencies, and architecture classifications of the KEMIT ERP project.

---

## 1. Core Architecture Files

### 1.1 Types Manifest
* **File Name:** `types.ts`
* **Full Path:** `/src/types.ts`
* **Function:** Serves as the central data contract for the entire application. Defines all interfaces (including `AppUser`, `Company`, `Transaction`, `CashVoucher`, `DeletedTransaction`, and `SignupRequest`), role types, permission structures, and the global bilingual translation dictionary (`translations`).
* **Who depends on it:** Almost every single UI Page, component, and database module in the system.
* **What files it depends on:** `/src/types/enterprise.ts`
* **Classification:** Core

### 1.2 Global Database Proxy
* **File Name:** `db.ts`
* **Full Path:** `/src/db.ts`
* **Function:** Establishes the central Database Proxy / Facade pattern. Collects and exposes all state management, queries, mutations, logging, and security functions to the React components. It shields presentation screens from the underlying modular storage mechanics.
* **Who depends on it:** Almost all pages (e.g., `Dashboard`, `Settings`, `Login`, `NewExpense`, `CashReconciliation`) and custom components.
* **What files it depends on:** `/src/types.ts`, `/src/firebase.ts`, `/src/db/storage.ts`, `/src/db/defaults.ts`, `/src/db/logs.ts`, `/src/db/users.ts`, `/src/db/companies.ts`, `/src/db/stations.ts`, `/src/db/notifications.ts`, `/src/db/transactions.ts`
* **Classification:** Core

### 1.3 Local Cache Engine
* **File Name:** `storage.ts`
* **Full Path:** `/src/db/storage.ts`
* **Function:** Orchestrates in-memory caching and client-side database preservation inside the browser's `localStorage` (with prefix segregation). Dispatches custom `custody_db_updated` events on every state change to trigger instant frame reconciliation.
* **Who depends on it:** `/src/db.ts`, `/src/db/users.ts`, `/src/db/companies.ts`, `/src/db/stations.ts`, `/src/db/notifications.ts`, `/src/db/transactions.ts`
* **What files it depends on:** None
* **Classification:** Core

---

## 2. Shared Utilities & Configuration Files

### 2.1 Firebase Controller
* **File Name:** `firebase.ts`
* **Full Path:** `/src/firebase.ts`
* **Function:** Initiates Firebase Application connection and Firebase Authentication. Registers real-time Firestore database synchronization snapshot queries (`onSnapshot`) filtered by company/station IDs, manages listeners dynamically, and provides an idempotent system seed routine (`seedDatabaseIfEmpty`).
* **Who depends on it:** `/src/db.ts`, `/src/db/users.ts`, `/src/db/companies.ts`, `/src/db/stations.ts`, `/src/db/notifications.ts`, `/src/db/transactions.ts`, `/src/pages/Login.tsx`
* **What files it depends on:** `/src/types.ts`
* **Classification:** Shared

### 2.2 Security Rules Manifest
* **File Name:** `firestore.rules`
* **Full Path:** `/firestore.rules`
* **Function:** Configures granular, server-side security, multi-tenant validation, and read/write authorizations on Google Firestore documents. Restricts access based on the operator's verified `company_id` and role profile.
* **Who depends on it:** Google Firebase Firestore Engine
* **What files it depends on:** None
* **Classification:** Shared

---

## 3. Domain Modules (Business Logic)

### 3.1 Users Management
* **File Name:** `users.ts`
* **Full Path:** `/src/db/users.ts`
* **Function:** Dictates user session management, administrator promotion constraints, security PIN generation, technical support user impersonation, and password hashing logic (SHA-256).
* **Who depends on it:** `/src/db.ts`, `/src/db/companies.ts`, `/src/db/stations.ts`, `/src/db/transactions.ts`
* **What files it depends on:** `/src/types.ts`, `/src/firebase.ts`, `/src/db/storage.ts`, `/src/db/defaults.ts`, `/src/db/logs.ts`
* **Classification:** Core

### 3.2 Companies & Multi-Tenancy Module
* **File Name:** `companies.ts`
* **Full Path:** `/src/db/companies.ts`
* **Function:** Controls corporate tenant status, registration, multi-tenant subscription configurations, and focus-switching logic.
* **Who depends on it:** `/src/db.ts`, `/src/db/stations.ts`, `/src/db/transactions.ts`
* **What files it depends on:** `/src/types.ts`, `/src/firebase.ts`, `/src/db/storage.ts`, `/src/db/defaults.ts`, `/src/db/users.ts`, `/src/db/logs.ts`
* **Classification:** Core

### 3.3 Geographic Branches (Stations) Module
* **File Name:** `stations.ts`
* **Full Path:** `/src/db/stations.ts`
* **Function:** Operates geographic entities such as regional management sectors and petty cash stations. Enforces station-level custody allocations.
* **Who depends on it:** `/src/db.ts`, `/src/db/transactions.ts`
* **What files it depends on:** `/src/types.ts`, `/src/firebase.ts`, `/src/db/storage.ts`, `/src/db/defaults.ts`, `/src/db/users.ts`, `/src/db/logs.ts`, `/src/db/companies.ts`
* **Classification:** Core

### 3.4 Voucher & Petty Cash (Transactions) Module
* **File Name:** `transactions.ts`
* **Full Path:** `/src/db/transactions.ts`
* **Function:** Oversees the core transaction lifecycle: cash expenses, cash vouchers, auto-incrementing serial sequences, rejected or deleted transaction states, and cash reconciliation metrics.
* **Who depends on it:** `/src/db.ts`
* **What files it depends on:** `/src/types.ts`, `/src/firebase.ts`, `/src/db/storage.ts`, `/src/db/defaults.ts`, `/src/db/users.ts`, `/src/db/logs.ts`, `/src/db/companies.ts`, `/src/db/stations.ts`
* **Classification:** Feature

---

## 4. Enterprise Foundation Files

### 4.1 Enterprise Specification Manifest
* **File Name:** `enterprise.ts`
* **Full Path:** `/src/types/enterprise.ts`
* **Function:** Declares the blueprint specifications for multi-company enterprise applications. Establishes the exact structures of `BaseMetadata` (audit and version keys), `EventEnvelope` (domain event logging), Finite State Machine (`FsmConfig` / `FsmTransition`), permission structures, and tenant-scoped dynamic configurations.
* **Who depends on it:** `/src/types.ts`
* **What files it depends on:** `/src/types.ts`
* **Classification:** Enterprise
