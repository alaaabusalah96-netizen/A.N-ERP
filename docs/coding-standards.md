# KEMIT ERP Enterprise Coding Standards v1.0

## 1. Purpose
This document establishes the official architectural constraints, coding standards, and engineering practices for KEMIT ERP. It is a binding reference for all developers and AI coding assistants contributing to the codebase. The standards outlined herein are designed to ensure enterprise-grade stability, long-term maintainability, full backward compatibility, and strict compliance with the **Enterprise Foundation v1.0** specifications.

---

## 2. General Principles
All development in KEMIT ERP must align with the following foundational design principles:
* **Strangler Fig Pattern:** Implement enhancements or new features as additive, parallel layers rather than rewriting or modifying stable, underlying legacy systems.
* **Backward Compatibility:** Maintain absolute compatibility with existing database collections, contracts, user sessions, and APIs. Breaking changes are strictly forbidden.
* **KISS (Keep It Simple, Stupid):** Prioritize the simplest, most understandable solution over highly clever, theoretical, or complex engineering designs.
* **Pragmatism over Perfection:** Value functional, robust, and working production-ready solutions over pure academic elegance or architectural perfectionism.
* **Single Responsibility Principle (SRP):** Every component, class, utility, or module must have one—and only one—reason to change.

---

## 3. Project Architecture Rules
KEMIT ERP is structured as a modular, decoupled full-stack architecture with a React frontend, an Express-Vite backend, and a Firestore database layer. 
* **Layer Isolation:** UI rendering, business logic computation, validation, persistence, and state tracking must remain strictly decoupled.
* **Unidirectional Dependency:** Dependencies must flow from UI -> Facade (CustodyDB) -> Core Services / Engines -> Data Storage. Inner core engines (e.g., Sequence, Validation, Lifecycle) must never depend on the UI or presentation layers.
* **Shared Engines First:** All common infrastructure tasks (e.g., generating reference numbers, changing status lifecycles, auditing actions) must utilize the existing shared engines. Re-implementing common services inside feature modules is prohibited.

---

## 4. TypeScript Standards
* **Strict Type Safety:** The TypeScript compiler must be configured with `strict: true`. All variables, function parameters, return values, and custom types must be explicitly declared.
* **Avoid `any`:** The use of the `any` type is strictly forbidden, except in rare scenarios where interfacing with third-party libraries is unavoidable, and must be justified with an inline comment explaining why. Use `unknown` with type narrowing instead.
* **Consistent Enum Declarations:** Use standard TypeScript `enum` declarations for state sets or status categories. Do not use `const enum`.
* **No `import type` for Enums:** When importing enum values, use standard imports. Do not use `import type` for enums as they are compiled into runtime objects.
* **Declare Interfaces and Types Early:** Define application-wide or domain-specific interfaces within `/src/types.ts` or scoped module files before implementation.

---

## 5. React Standards
* **Functional Components and Hooks:** Write standard functional components using React hooks (`useState`, `useEffect`, `useMemo`, `useCallback`). Class components are restricted.
* **Decoupled Components:** Extract sub-components out of bloated files (e.g., `App.tsx` or `Login.tsx`) into modular files within `/src/components/`. 
* **No Business Logic in Views:** React pages and components are responsible only for rendering UI and dispatching user actions. Business logic, calculations, and data transactions must reside in separate services or utility files.
* **Safe `useEffect` Dependency Arrays:** Avoid infinite re-render loops. Never put objects, arrays, or inline functions directly in a dependency array unless they are strictly stabilized with `useMemo` or `useCallback`. Favor primitive types (strings, numbers, booleans) as dependencies.
* **No Inline CSS or Custom SVG imports:** Use Tailwind CSS utility classes exclusively. All icons must be imported from the `lucide-react` library.

---

## 6. Firestore Standards
* **No Direct Firestore Reads/Writes in UI:** React pages and components are strictly prohibited from calling Firestore SDK functions directly (e.g., `collection()`, `getDocs()`, `setDoc()`). All persistent storage operations must pass through the `CustodyDB` facade.
* **Query Efficiency & Composite Indexes:**
  * Avoid full collection scans. Always use appropriate filtering (`where`) and pagination (`limit`).
  * For every new query involving multiple fields or sorting, define the necessary composite index in `firestore.rules` or a configuration script before deploying.
* **Safe Snapshot Listeners:** All real-time snapshot listeners (`onSnapshot`) must return a cleanup/unsubscribe function that must be called when the active React component unmounts (typically returned inside a `useEffect` cleanup block).
* **No Duplicate Reads/Writes:** Cache firestore data locally using the StorageEngine cache to avoid redundant network reads and reduce billing costs.

---

## 7. Storage Engine Standards
* **StorageEngine as Cache and Backup:** All client-side local cache read/write operations must go through `StorageEngine` (`/src/db/storage.ts`).
* **Cross-Tab Cache Consistency:** Ensure that caches are invalidated or refreshed across multiple tabs. Listening to the `storage` event or custom window updates must invalidate memory cache keys safely to prevent stale local data reads.
* **Safe JSON Parsing:** Always wrap `JSON.parse` and `JSON.stringify` operations in `try/catch` blocks inside storage methods to handle corrupted local data gracefully without crashing the app.
* **Key Namespacing:** All localStorage keys used by the application must follow the `custody_` prefix convention (e.g., `custody_active_user`, `custody_users`).

---

## 8. CustodyDB Facade Rules
* **Single Point of Contact:** `CustodyDB` (`/src/db.ts`) is the official facade for all database and session transactions within the React application. 
* **State Synchronization:** It must manage the synchronization between Firestore, the local cache memory, and the persistent local storage.
* **Admin Session Preservation:** The facade must ensure that administrative permissions or specific SystemAdmin data are never wiped or lost during company-scoped syncs.
* **Unified API:** Any new backend service or collection manager must expose its functions through `CustodyDB` static methods, maintaining consistent naming conventions.

---

## 9. Validation Rules
* **ValidationEngine Centralization:** All document, state-transition, and transaction validation rules must be defined inside `ValidationEngine` (`/src/db/validation.ts`).
* **Validation Contracts:** Methods must accept structured payloads and return standard validation result types (`{ isValid: boolean; errors: ValidationError[] }`).
* **No Bypassing:** UI elements and backend transactions must call validation checks before completing updates, saving documents, or transitioning states.

---

## 10. Business Logic Rules
* **Decoupled Calculations:** Calculations (such as custody balances, settlements, reconciliations, expense tallies, and cash drawers) must reside inside `CustodyService` (`/src/db/custodyService.ts`) or corresponding specialized modules.
* **Single Source of Truth:** Never hardcode mathematical logic or balance computations in React Views. If a calculation is displayed on screen, it must query a service method.
* **No Over-Generalization:** Build simple business rules supporting current requirements and immediate modules (e.g., Custody, Stations, and Warehouses). Do not build highly generic features based on speculative future modules.

---

## 11. Transaction Rules
* **Idempotent State Updates:** Transactions modifying financial balances or custody totals must be completely idempotent.
* **All-or-Nothing Firestore Transactions:** Updates involving multiple related documents (e.g., moving an expense from pending to settled while updating a station's remaining balance) must utilize Firestore atomic transactions or batch writes to avoid partial, corrupted states.
* **Sequence Generation:** Generating unique sequential numbers (e.g., Voucher Numbers or Transaction Reference Numbers) must use the centralized transactional `SequenceEngine` to guarantee no duplicates or missing sequence gaps.

---

## 12. Error Handling Standards
* **Unified Error Schema:** Errors thrown or returned must follow a consistent structure containing code, English message, Arabic message, and optional details.
* **Graceful Degradation:** When an operation fails (e.g., offline state, database exception, or permission error), the application must display a clear, localized, user-friendly notification message and fall back to a safe state instead of crashing.
* **No Silent Swallowing:** Never use empty `catch` blocks. All exceptions must be caught, processed, and at minimum logged to the system logger or debug log before throwing or degrading.

---

## 13. Logging Standards
* **Unified Logger Utility:** All logging must use a standardized logging tool rather than scattering direct `console.log`, `console.error`, or `console.warn` calls across files.
* **Audit Logs vs System Logs:** 
  * Financial updates, critical administrative actions, and authorization changes must generate structured, append-only entries in the audit trail via `AuditEngine`.
  * Debug and system operational logs are for diagnostics and must be automatically omitted or cleaned in production builds.

---

## 14. Performance Standards
* **Memoization of Calculations:** Wrap expensive array filtering, statistics generation, or structural transformations in React components using `useMemo`.
* **Dynamic Imports / Lazy Loading:** Heavy dashboard components, analytical charts, and peripheral pages must be loaded lazily using `React.lazy` and `Suspense` to optimize bundle sizes and speed up first-input-delay.
* **Batch Firestore Writes:** Group bulk operations (e.g., importing default users or bulk reconciliations) using Firestore batched writes to minimize roundtrip latency and database operational costs.

---

## 15. Security Standards
* **Role-Based Access Control (RBAC):** Every route, view, component, and database operation must enforce the user's role-based permissions via the `PermissionEngine`.
* **Prevention of Privilege Escalation:** Role-change, permission assignments, and tenant configuration updates must verify that the requesting user possesses equal or higher authority (e.g., SystemAdmin or Company Admin constraints).
* **Tenant Isolation:** Enforce tenant-level boundaries logic-side and rules-side. A user from Company A must never read, write, or list documents belonging to Company B under any circumstances.
* **Local Security Constraints:** Sensitive parameters, credentials, or private keys must never be saved directly in clear-text localStorage.

---

## 16. Offline Rules
* **Offline-First Resilience:** Users must be able to view their cached transactions, draft new expenses, and verify access parameters while completely disconnected from the network.
* **Safe Queue Synchronization:** Offline transactions must be logged in a local storage-backed synchronized queue, which will be safely dispatched to Firestore once connection status changes to online.
* **Offline Login Support:** The login flow must allow restoring verified cached sessions locally when the device is completely offline, ensuring continuous branch operation.

---

## 17. Multi-Tenant Rules
* **Mandatory Tenant Keys:** Every persistent entity (Users, Transactions, Stations, Companies, Settings) must contain a `tenantId` (or `organizationId`) representing the logical boundary of the organizational account.
* **Scoped Queries:** All database lookups and snapshot subscriptions must scope their queries using `where('tenantId', '==', activeUser.tenantId)` to prevent cross-contamination.
* **Tenant Defaulting:** New users and records must fall back to the active user's current tenant unless explicitly overridden by a SystemAdmin configuring platform structures.

---

## 18. Naming Conventions
To keep codebases highly readable and prevent naming conflicts, all variables, files, and classes must respect the official Naming Freeze rules:
* **Collections:** Lowercase plural or snake_case (e.g., `users`, `transactions`, `signup_requests`).
* **Database Fields:** Snake-case exclusively (e.g., `full_name`, `organization_id`, `created_at`, `voucher_no`).
* **Files & Directories:**
  * Components and Page files must use PascalCase (e.g., `Login.tsx`, `CashPaymentVoucher.tsx`).
  * Services, utilities, and helper scripts must use camelCase (e.g., `custodyService.ts`, `storage.ts`).
* **React State & Hooks:** Camel-case (e.g., `const [isActive, setIsActive] = useState(false)`).

---

## 19. Folder Structure Rules
The folder tree must strictly respect the modular hierarchy of the project:
* `/docs/` - Architectural specs, ADR documents, schemas, and catalogs.
* `/src/components/` - Extracted shared React UI components.
* `/src/db/` - Storage engine, services, validation rules, and transaction sub-modules.
* `/src/pages/` - Full screen Views representing separate navigation routes.
* `/src/types/` or `/src/types.ts` - Central interface and type definitions.

---

## 20. Imports Rules
* **Relative Imports:** All source modules must use clean relative path imports (e.g., `import { CustodyDB } from '../db';`).
* **No Absolute Path Ambiguity:** Never mix absolute workspace container paths (e.g., starting with `/`) inside React source files.
* **No Unused Imports:** Always run linters and code cleaners to prune dangling or unused imports, preventing bundle bloat.
* **Group and Order:** Arrange imports at the top of the file in the following clean structure:
  1. React core and standard hooks.
  2. Third-party packages (e.g., Framer Motion, Lucide icons, Firebase).
  3. Internal facade and storage managers (`CustodyDB`, `StorageEngine`).
  4. Local components, pages, or helper functions.
  5. Styling or types.

---

## 21. Dependency Rules
* **No Unsolicited Libraries:** Before installing any new npm package, verify that no existing, pre-installed package can perform the same action.
* **Package installation procedure:** Always run `install_applet_package` or declare variables inside `.env.example` when third-party packages are required.
* **No Mock Infrastructures:** Never install simulated database mocks or custom backend virtualization systems if actual Firebase or persistent storage mechanisms are available.

---

## 22. Code Review Checklist
Before submitting any code changes, developers must check:
* [ ] Does the new code compile successfully and pass all linter checks?
* [ ] Are there zero occurrences of direct Firestore calls in React Views?
* [ ] Is the code completely backward-compatible with the active database documents?
* [ ] Have you tested the offline capabilities of the modified screen or feature?
* [ ] Are there memory leak sources (unsubscribed Firestore snapshot listeners or dangling window event listeners)?
* [ ] Is tenant isolation fully respected in every query and database look-up?

---

## 23. Definition of Done
A feature or task is officially marked as **Done** if and only if:
1. **Compilation Success:** The applet builds successfully without errors (`npm run build`).
2. **Linter Validation:** The codebase has zero critical warnings or syntax errors (`npm run lint`).
3. **Database Rules Verified:** Security rules permit authenticated operations and block unauthenticated access.
4. **Offline and Multi-Tab Tested:** The app handles sudden network disconnects and operates consistently across multiple open browser tabs.
5. **No Visual Regressions:** The UI layout is responsive, legible, clean, and styled strictly with Tailwind CSS.

---

## 24. Forbidden Practices
❌ **NO Direct Database Mutations in Views:** Modifying collections or documents inside UI components without passing through the database facade is strictly forbidden.
❌ **NO Breaking Database Schema Changes:** Deleting or renaming existing fields or collections is completely blocked.
❌ **NO Platform-Wide Code Rewrites:** Rewriting large modules or restructuring files for cosmetic style preferences is prohibited.
❌ **NO Unsecured Role Escalations:** Granting or changing permissions without verifying user authorization or tenancy boundary is blocked.
❌ **NO Direct Mock Data Populating:** Do not write artificial mock arrays in pages if actual persistent storage exists.

---

## 25. AI Development Rules
All AI Coding Agents or Assistants working on this project must strictly comply with the following instructions:
* **Respect Architectural Decisions:** Read the `/docs/` specifications, ADRs, and Design Principles before proposing code edits.
* **Do NOT Propose Framework Rewrites:** Never try to replace Vite, Express, Tailwind, or React with other libraries.
* **Strict Code Scope Limits:** Implement only what was explicitly requested. Do not add unrequested pages, sidebars, settings menus, or complex extra features.
* **Read-Modify-Write Rule:** Always call `view_file` on any target file before editing or modifying its contents. Do not assume any code structure.
* **No Destructive Deletions:** Never delete or wipe files unless you are 100% certain they are completely unused. Verify across the entire workspace directory before taking any action.
* **Ask When Unsure:** If there is any ambiguity in a user request, always stop and ask for clarification instead of guessing or implementing potentially breaking changes.
