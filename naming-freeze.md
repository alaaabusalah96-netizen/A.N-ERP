# Project Freeze: Naming Freeze Specification (v1.0)
# وثيقة تثبيت الأسماء والمصطلحات (إصدار 1.0)

This document serves as the absolute frozen reference for existing names and collections in **KEMIT ERP**. 
All subsequent development modules (including Warehouses / Inventory, Purchasing, and Accounting) **MUST** adhere to this naming standard. 
No modifications to the existing names below are allowed.

---

## 1. Frozen Firestore Collections / أسماء مجموعات قاعدة البيانات المجمّدة

As of v1.0, the Firestore database schema is frozen with the following collections and case conventions. Notice the mixed casing which is historically preserved:

| Collection Name (Exact Case) | Description (English) | الوصف (بالعربية) | Schema / Type Ref | Casing Style |
| :--- | :--- | :--- | :--- | :--- |
| `companies` | Companies metadata and limits | بيانات ومستندات الشركات المشتركة | `Company` | camelCase / lowercase |
| `regions` | Geographic regional organization | المناطق الجغرافية للشركة | `Region` | camelCase / lowercase |
| `stations` | Branches or physical stations | المحطات أو الفروع | `Station` | camelCase / lowercase |
| `users` | User accounts and static settings | حسابات الموظفين والمستخدمين | `AppUser` | camelCase / lowercase |
| `transactions` | Expenses and custody balance changes | العمليات والمصروفات المسجلة | `Transaction` | camelCase / lowercase |
| `logs` | General activity logs (ActivityLog) | سجلات النشاط العام للنظام | `ActivityLog` | camelCase / lowercase |
| `config` | Primary global configuration (main doc) | الإعدادات العامة للمنظومة | `CustodyConfig` | camelCase / lowercase |
| `Expenses` | Historical expense transactions records | وثائق المصروفات المؤرشفة | `Expense` | PascalCase |
| `CashVouchers` | Payment and settlement vouchers | سندات الصرف وسندات التصفية | `CashVoucher` | PascalCase |
| `TransactionHistory` | Step-by-step state history of transactions | سجل الحالات التفصيلي للعمليات | `TransactionHistory` | PascalCase |
| `Notifications` | System notifications to users | الإشعارات والتنبيهات الموجهة للمستخدمين | `Notification` | PascalCase |
| `AuditLogs` | Detailed security and change tracking | سجلات الأمان والتدقيق التقني | `AuditLog` | PascalCase |
| `Permissions` | Available permissions registry | القاموس المرجعي للصلاحيات | `SystemPermission` | PascalCase |
| `Roles` | User roles permissions matrix | أدوار المستخدمين وصلاحياتها | `SystemRole` | PascalCase |
| `deleted_transactions` | Archived copy of deleted transactions | أرشيف العمليات المحذوفة | `DeletedTransaction` | snake_case |
| `company_sequences` | Numerical auto-increment sequences | عدادات الترقيم التلقائي للشركات | `{ id, last_voucher_no }` | snake_case |
| `signup_requests` | Sign-up requests pending admin approval | طلبات تسجيل الحسابات الجديدة المعلقة | `SignupRequest` | snake_case |
| `system_meta` | Database seeding states and metrics | البيانات التعريفية والتحقق من التهيئة | `{ seeded, timestamp }` | snake_case |

---

## 2. Frozen Domain Roles and Permissions / الأدوار والصلاحيات المجمّدة للعهدة

These roles and permissions are active for the cash custody system and must not be altered:

### Role Names (UserRole Type)
- `SystemAdmin`: Full global support and system super administration.
- `Admin`: Corporate-level administrator with authority over companies, settings, and full company data.
- `RegionalManager`: Manager responsible for stations/branches in a specific geographical region.
- `StationAdmin`: Station or branch custodian / branch manager.

### Permission Keys (UserPermissions interface fields)
- `create_expense`: Allows registering a new expense.
- `edit_expense`: Allows modifying an existing expense (optional/added in Sprint 2).
- `delete_expense`: Allows deleting an expense.
- `create_voucher`: Create new cash payment vouchers.
- `approve_voucher`: Executive approval of cash payment vouchers.
- `reject_voucher`: Executive rejection of cash payment vouchers.
- `create_custody`: Set up new physical custody structures.
- `edit_custody`: Modify custody attributes.
- `replace_custody`: Request custody fund replenishment / Recharge custody.
- `view_reports`: Access financial reports, PDF downloads, and statements.
- `manage_users`: Create/Modify user roles.
- `manage_companies`: Manage corporate accounts (SuperAdmin).
- `manage_regions`: Setup geographical company regions.
- `manage_stations`: Define physical stations.
- `manage_roles`: Define roles permissions matrix.
- `manage_settings`: Modify system parameters.
- `settle_voucher`: Backward-compatible permission key for settling cash vouchers.

---

## 3. Frozen Domain Events & Logging Strings / سجل الأحداث والمصطلحات المجمّدة

Events in KEMIT ERP are stored in two distinct structures depending on the level of reporting:

### A. General Activity Logs (`ActivityLog.action` field)
These strings are used for general activity reports:
- `Add Company`
- `Update Company`
- `Delete Company`
- `Switch Company`
- `Login Session`
- `Logout Session`
- `Impersonation Start`
- `Impersonation End`
- `Reset Password`
- `Toggle Company Status`
- `Update Subscription`
- `Add Region`
- `Update Region`
- `Delete Region`
- `Update Stations`
- `Add Station`
- `Update Station`
- `Delete Station`
- `Update Categories`
- `Update Users`
- `Update Custody`
- `Create Transaction`
- `Update Transaction`
- `Settle Transaction`
- `Custody Replenishment`
- `Access Rejected`

### B. Technical Audit Logs (`AuditLog.action_type` field)
These strings are utilized for developer auditing and security monitors:
- `USER_LOGIN`
- `USER_LOGOUT`
- `IMPERSONATION_START`
- `IMPERSONATION_END`
- `PASSWORD_RESET`
- `COMPANY_STATUS_TOGGLE`
- `COMPANY_SUBSCRIPTION_UPDATE`
- `CREATE_STATION`
- `UPDATE_STATION`
- `DELETE_STATION`
- `CREATE_TRANSACTION`
- `UPDATE_TRANSACTION`

---

## 4. Frozen Naming Conventions & Code Rules / القواعد البرمجية ومعايير التسمية

1. **Variables and Field Casing:**
   - Database model fields must use **`snake_case`** (e.g., `company_id`, `created_at`, `station_name`, `custody_amount`) to maintain uniform synchronization with Firebase.
   - React components and general TypeScript source code variables use standard **`camelCase`** (e.g., `selectedStationId`, `handlePageReplenishSubmit`).
   - React Component File Names must use **`PascalCase`** (e.g., `CashReconciliation.tsx`, `CompanyAdminDashboard.tsx`).

2. **Localization / RTL Support:**
   - Use `isRtl` boolean calculated from `language === 'ar'` for conditional layout direction.
   - Keep all static arabic labels paired with english fallbacks to sustain bilingual coverage.

3. **Database Security and Mutation Integrity:**
   - Write operations must preserve the active audit logging structures (`addLog` and `logAudit`).
   - Mutations of critical assets (e.g., Stations, Transactions) must propagate updates to related objects atomic-style (using transaction batches or atomic sequences).
