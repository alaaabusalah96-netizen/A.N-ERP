# Project Technical Handover Report
**Project Name:** KEMIT ERP
**Date:** July 11, 2026

---

## 1. Architecture Overview (البنية البرمجية)
KEMIT ERP is designed as an **Offline-First, Multi-Tenant SaaS, Single-Page Application (SPA)** that synchronizes in real-time with a remote **Google Cloud Firestore** database, utilizing local cache mirroring as the primary operational state.

### 1.1 Layers of the System
1. **Presentation Layer (React & Tailwind CSS):** Formed of reactive, modular pages (e.g., `SuperAdmin`, `Dashboard`, `Login`, `CashReconciliation`) and components (e.g., `AdminCredentialsForm`, `SMTPConfigModal`). Styling is strictly utility-driven (Tailwind CSS) paired with dynamic layout transitions managed by `motion/react` (Framer Motion).
2. **Global Controller / Database Proxy (`CustodyDB` in `src/db.ts`):** Serves as a single-entry proxy/facade routing all transaction, security, and metadata queries to dedicated domain-specific sub-modules. It encapsulates local caching mechanisms and guarantees uniform access constraints.
3. **Domain Modules (`src/db/*`):** Isolated logic components (e.g., `UsersModule`, `CompaniesModule`, `TransactionsModule`, `StationsModule`) which govern core state mutations, validation rules, and permission checks.
4. **Offline Storage Engine (`StorageEngine` in `src/db/storage.ts`):** A client-side state engine that manages an in-memory `cache` and persists data to `localStorage` under custom `custody_` prefixes. It emits custom window events (`custody_db_updated`) on state change to notify active frames.
5. **Dynamic Sync Layer (`src/firebase.ts`):** Listens to Firestore collections via `onSnapshot` queries (with strict company isolation filters). Whenever changes are recorded in the cloud, it triggers a quiet update to `localStorage` and publishes a `custody_db_updated` event to synchronise local caches instantly.
6. **Remote Database Layer (Firebase Firestore & Auth):** Implements serverless real-time data streaming and secure user profile authentication.

```
+-----------------------------------------------------------------+
|                  Presentation Layer (React)                    |
+-----------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|             Global Controller Facade (CustodyDB)                |
+-----------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|              Domain Modules (src/db/* Modules)                  |
+-----------------------------------------------------------------+
           /                                        \
          v                                          v
+------------------------+                  +---------------------+
| Offline Cache (Storage)|<--[Listen/Sync]--|   Firebase Sync     |
+------------------------+                  +---------------------+
                                                       ^
                                                       | [onSnapshot/SetDoc]
                                                       v
                                            +---------------------+
                                            |  Cloud Firestore    |
                                            +---------------------+
```

### 1.2 Data Life Cycle & Flows
* **Login Flow:**
  1. The user inputs their email and password into `Login.tsx`.
  2. The system checks if the email is registered in the offline cache (`CustodyDB.getUsers()`).
  3. It validates the password using a custom SHA-256-based hashing algorithm (`hashPassword` in `src/db/users.ts`).
  4. If a match is found, it attempts to authenticate with Firebase Auth (`signInWithEmailAndPassword`).
     - *Legacy Account Auto-Migration:* If the user existed in Firestore with a static non-Firebase UID, the system deletes their legacy record and migrates all metadata to a new record identified by the Firebase Auth UID (`firebaseUser.uid`).
     - *Password Auto-Migration:* Plain-text passwords are automatically migrated to SHA-256 hashes upon successful authentication.
  5. The authenticated user is stored in `localStorage` under `custody_active_user`.
  6. The `custody_db_updated` event is fired, triggering `setupFirebaseSync` to rebuild all `onSnapshot` listeners using the new `company_id` filter.
* **Voucher & Expense Lifecycle (FSM):**
  1. A `StationAdmin` records an Expense (State: `Pending`).
  2. Expenses are bundled into a `CashVoucher` (State: `Draft` -> `Pending_Approval`).
  3. A `CompanyAdmin` or `RegionalManager` approves the voucher (State: `Approved`), moving underlying expenses to `Approved`.
  4. The station reconciles the custody, marking the voucher and expenses as `Settled` or `Fully Settled`.
* **Multi-Tenant Scoping:**
  - Standard users (non-`SystemAdmin`) are strictly scoped to their `company_id` across both read snapshot queries (Firestore) and in-memory caches.
  - Multi-tenancy is reinforced in `firestore.rules` where documents must match `request.auth.uid` user document's `company_id` in Firestore.

---

## 2. Authentication Deep Audit (تدقيق نظام المصادقة)

### 2.1 Dual-Auth Architecture
The system utilizes a hybrid model:
1. **Firebase Authentication:** Handles the secure, network-level authentication session, token vending, and secure email/password credential management.
2. **Custom Document-Based Authentication:** Manages domain-specific user properties, roles, granular company association (`company_id`), regions, stations, and custom permission matrices in the `/users` Firestore collection.

### 2.2 Critical Sync & Timing Issues
* **Synchronization Trigger:** The system does not listen to Firebase Auth State changes (`onAuthStateChanged`) to dynamically build database listeners. Instead, listeners are rebuilt inside `setupFirebaseSync()` via `localStorage` change events (`custody_db_updated` or `storage`).
* **The UID Mapping Flow:**
  When a user registers or is added by a Company/Super Admin, their record is initially stored under a generic ID (e.g., `user-timestamp`). During their *very first login*, the `syncWithFirebaseAuth` routine is executed. If a Firebase Auth credential does not exist, the app programmatically registers them in Firebase Auth under their email and password. Upon successful login/creation, their Firestore document ID is deleted from its temporary path and rewritten under the Firebase Auth UID.
* **Offline Login Capability:**
  The system supports fully offline login if the user was logged in previously. The active user profile is recovered from `localStorage` (`custody_active_user`). However, if the local state has been cleared, login will fail offline because password hash comparisons rely on `CustodyDB.getUsers()` which would be empty, and Firebase Auth requires network connection.

---

## 3. Password Security Audit (أمان كلمات المرور)

### 3.1 Password Creation & Encryption
* **Hashing Algorithm:** The system implements a custom JavaScript SHA-256 cryptographic hashing function defined inside `src/db/users.ts` (`hashPassword`).
* **Hash Persistence:** Passwords are never stored in plain-text inside the `users` Firestore collection or local storage. All passwords in transit/storage within the Custom Auth system are SHA-256 hashes.
* **Firebase Auth Integration:** Credentials are synchronously sent to Firebase Auth via secure SSL endpoints, where they are protected by Firebase's native adaptive hashing mechanisms (scrypt).

### 3.2 Vulnerabilities & Business Readiness
* **Plain Text Transmission Risk:** During Admin password verification (`SMTPConfig` & password reset), plain passwords may temporarily pass through server route payloads.
* **Salt Absence:** The custom SHA-256 implementation inside `users.ts` is a simple unsalted hashing operation. It does not use salt or key-stretching parameters (such as bcrypt or Argon2).
* **Vulnerability of Client Hashing:** Because hashing occurs on the client and is stored as a hash, compromised database read access could allow an attacker to use the hash directly as a credential in custom validation routines.

---

## 4. Enterprise Foundation Audit (أساسيات المؤسسات)

The system defines 10 core Shared Engines specified by `BaseMetadata` and `EventEnvelope` models inside `src/types/enterprise.ts`.

### 4.1 Evaluation of Shared Engines
1. **Metadata Engine:** *Implemented.* Defines `BaseMetadata` tracking `tenantId`, `organizationId`, `version`, and audit timestamps.
2. **Sequence Engine:** *Partially Implemented.* Generates auto-incrementing sequential document numbers (like voucher numbers) per company through `/company_sequences` synchronization.
3. **Lifecycle Engine:** *Partially Implemented.* Defines a Finite State Machine (FSM) configuration interface (`FsmConfig`, `FsmTransition`) in types. Not dynamically driven by a core state machine class, but rather hardcoded in status transition controls.
4. **Permission Engine:** *Fully Implemented.* Employs `UsersModule.enrichUserPermissions()` to assign granular capabilities based on `UserRole` and override arrays.
5. **Audit Engine:** *Implemented.* Log entries are recorded inside `AuditLogs` and `logs` collections via `LogsModule.logAudit()` and `LogsModule.addLog()`.
6. **Configuration Engine:** *Implemented.* Configuration boundaries are managed via `CustodyConfig` and settings screens, isolated by `company_id`.
7. **Business Contracts / Module Manifest / Event Envelope / Root Domain Model:** *Partially Implemented.* Domain types exist in `src/types.ts` and `src/types/enterprise.ts`, but do not have fully decoupled event bus dispatchers.

### 4.2 Module Readiness (المخازن والمبيعات والمشتريات)
The enterprise architecture is **fully prepared** to receive additional modules such as Warehouse/Inventory (المخازن), Procurement (المشتريات), and Maintenance (الصيانة):
* **Tenant Isolation:** All tables/collections support `tenantId` and `organizationId` from `BaseMetadata`.
* **Access Scoping:** The `UsersModule` and `StationsModule` are already partitioned geographically (`region_id`, `station_id`), allowing warehouses or points of sale to map directly to existing branch hierarchies.

---

## 5. System Health & Critical Risks (صحة النظام والمخاطر)

| Attribute | Assessment |
| :--- | :--- |
| **Architecture** | **Solid.** Clean modularization between UI, DB controllers, and the offline cache proxy. |
| **Security** | **Moderate.** Strong multi-tenant checks in firestore rules, but vulnerable client-side password hashing. |
| **Scalability** | **High.** Snapshot queries are limited (e.g. `limit(150)`) preventing massive client-side load. |
| **SaaS Readiness** | **Ready.** Full support for subscription plans (`Basic`, `Professional`, `Enterprise`), subscription status, expiry, and tenant boundaries. |

### Top Critical Risks
1. **Unsalted Client-Side Hashing:** Passwords lack cryptographic salting in the custom SHA-256 routine.
2. **Dual-DB Authentication Timing Gap:** There is no standard auth provider state-change subscription. If a user is modified or deleted in Firebase Auth, the app might allow offline operation until a cache reload.
3. **Optimistic Locking Absent:** The `version` field in `BaseMetadata` is declared but not evaluated during concurrent database writes, leading to possible race conditions.

---

## 6. Naming Conventions & Project Glossary

### 6.1 Naming Rules (قواعد التسمية)
* **Collections (Firestore):** Plural lower_case (e.g., `companies`, `stations`, `users`) except for legacy uppercase entities (e.g., `Expenses`, `CashVouchers`, `TransactionHistory`).
* **Fields:** camelCase for custom typescript variables; snake_case for standard database properties (e.g., `company_id`, `created_at`).

### 6.2 Glossary
* **Station Admin:** The operator responsible for registering individual petty cash expenses.
* **Company Admin:** The administrator managing users, regions, and settings of a single company.
* **System Admin (Super Admin):** The platform operator with unlimited cross-company permissions.
* **Under Settlement:** The state of an expense transaction that has been locked in an approved voucher but not yet fully reconciled.
