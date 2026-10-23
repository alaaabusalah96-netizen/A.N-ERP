# Baseline Firestore Collections Documentation (v1.0)
# وثيقة تجميد وتوثيق مجموعات قاعدة البيانات الحالية

This document is part of **Phase 0: Baseline Freeze** for **KEMIT ERP**. It details all currently existing Firestore collections, document structures, exact field names, and TypeScript data types. No schema changes are introduced in this phase.

---

## Index of Active Collections / فهرس المجموعات النشطة

The system uses a combination of lowercase, PascalCase, and snake_case names for collections:

1. [`companies`](#1-companies)
2. [`regions`](#2-regions)
3. [`stations`](#3-stations)
4. [`users`](#4-users)
5. [`transactions`](#5-transactions)
6. [`logs`](#6-logs)
7. [`config`](#7-config)
8. [`Expenses`](#8-expenses)
9. [`CashVouchers`](#9-cashvouchers)
10. [`TransactionHistory`](#10-transactionhistory)
11. [`Notifications`](#11-notifications)
12. [`AuditLogs`](#12-auditlogs)
13. [`Permissions`](#13-permissions)
14. [`Roles`](#14-roles)
15. [`deleted_transactions`](#15-deleted_transactions)
16. [`company_sequences`](#16-company_sequences)
17. [`signup_requests`](#17-signup_requests)
18. [`system_meta`](#18-system_meta)
19. [`password_reset_otps` (Server-Only)](#19-password_reset_otps-server-only)
20. [`admin_login_otps` (Server-Only)](#20-admin_login_otps-server-only)
21. [`system_config` (Server-Only)](#21-system_config-server-only)

---

## Detailed Collections Schema / تفاصيل هيكل المجموعات

### 1. `companies`
- **Purpose**: Metadata of corporations registered under the multi-tenant architecture.
- **Arabic Description**: بيانات ومستندات الشركات المشتركة في النظام.
- **Fields**:
  - `id` (string): Unique identifier.
  - `name` (string): Arabic/English corporate name.
  - `custody_value` (optional number): Total allocated custody pool value for the company.
  - `is_active` (optional boolean): Tenant activation status.
  - `subscription_status` (optional string): `'active' | 'suspended' | 'trial' | 'expired'`.
  - `subscription_expiry` (optional string): ISO-8601 timestamp.
  - `subscription_plan` (optional string): `'Basic' | 'Professional' | 'Enterprise'`.

---

### 2. `regions`
- **Purpose**: Hierarchical grouping of branches/stations under geographical sectors.
- **Arabic Description**: المناطق الجغرافية التابعة لكل شركة لتنظيم إدارة الفروع والمحطات.
- **Fields**:
  - `id` (string): Unique identifier.
  - `name` (string): Name of the region.
  - `code` (optional string): Unique code identifying the region.
  - `company_id` (optional string): Associated company's ID.

---

### 3. `stations`
- **Purpose**: Physical branches, stations, or warehouses handling localized custody cash.
- **Arabic Description**: الفروع أو المحطات الفعلية التي لديها عهود مالية مستقلة.
- **Fields**:
  - `id` (string): Unique identifier.
  - `region_id` (optional string): Associated geographical region ID.
  - `station_name` (string): Name of the branch/station.
  - `station_code` (string): Unique sequence code of the station.
  - `custody_amount` (number): Current actual or nominal cash custody balance.
  - `is_active` (boolean): Activation status of the branch.
  - `company_id` (optional string): Associated company's ID.

---

### 4. `users`
- **Purpose**: App users, credentials, roles, and localized access properties.
- **Arabic Description**: حسابات وبيانات الموظفين ومستويات الصلاحيات الخاصة بهم.
- **Fields**:
  - `id` (string): Unique identifier (or auth UID).
  - `email` (string): User's primary email.
  - `full_name` (string): User's display name.
  - `role` (string): `'SystemAdmin' | 'Admin' | 'RegionalManager' | 'StationAdmin'`.
  - `permissions` (map/object): Detailed boolean privileges (matches `UserPermissions` interface).
  - `station_id` (optional string): Linked station/branch ID.
  - `region_id` (optional string): Linked region ID.
  - `company_id` (optional string): Linked company ID.
  - `is_active` (optional boolean): Login authorization flag.
  - `password` (optional string): Saved password (for server verification).
  - `security_pin` (optional string): Saved safety PIN.

---

### 5. `transactions`
- **Purpose**: Legacy primary register of custody balances, cash movements, and actions.
- **Arabic Description**: السجل الموحد القديم لحركات العهد والمصاريف.
- **Fields**:
  - `id` (string): Unique identifier.
  - `transaction_no` (string): Unique auto-increment sequence format code.
  - `date` (string): Document date in YYYY-MM-DD.
  - `description` (string): Summary of transaction.
  - `category_id` (optional string): Connected expense category ID.
  - `amount` (number): Cash value in EGP.
  - `status` (string): `'Draft' | 'Pending' | 'Under Settlement' | 'Settled' | 'Rejected' | 'Deleted'`.
  - `items` (optional array of maps): Description and amount of separate transaction line items.
  - `amount_in_words` (optional map): `{ ar: string, en: string }`.
  - `notes` (optional string): Auxiliary details.
  - `voucher_no` (optional string): Connected settlement voucher ID.
  - `voucher_date` (optional string): Linked voucher creation date.
  - `created_by` (string): User ID of the creator.
  - `created_at` (string): ISO-8601 timestamp.
  - `updated_at` (string): ISO-8601 timestamp.
  - `station_id` (optional string): Associated station ID.
  - `company_id` (optional string): Tenant company ID.
  - `attachments` (optional array of maps): Base64 and metadata references of files.

---

### 6. `logs`
- **Purpose**: Simple general activity tracking.
- **Arabic Description**: سجلات العمليات والنشاط العام للمستخدمين داخل التطبيق.
- **Fields**:
  - `id` (string): Unique identifier.
  - `user_id` (string): Actor's user ID.
  - `user_name` (string): Display name of the user.
  - `action` (string): Category label (e.g., `'Add Region'`).
  - `details` (string): Descriptive details of the action.
  - `timestamp` (string): ISO-8601 timestamp.
  - `station_id` (optional string): Associated station/branch ID.
  - `company_id` (optional string): Tenant company ID.
  - `amount` (optional number): Associated cash volume.
  - `notes` (optional string): Notes.

---

### 7. `config`
- **Purpose**: Global core configurations.
- **Arabic Description**: الإعدادات والبيانات الأساسية الافتراضية للشركة (مستند main).
- **Fields**:
  - Document ID `main`:
    - `company_name` (string): Default installation title.
    - `custody_value` (number): Corporate-wide fallback custody pool.

---

### 8. `Expenses`
- **Purpose**: Sprint 2 localized expense records linked directly to specific stations/companies.
- **Arabic Description**: سجلات المصروفات التفصيلية الخاصة بكل محطة وشركة.
- **Fields**:
  - `id` (string): Unique identifier.
  - `station_id` (string): Associated station ID.
  - `company_id` (string): Associated company ID.
  - `category_id` (string): Selected expense category ID.
  - `amount` (number): Local currency value (EGP).
  - `description` (string): Description.
  - `date` (string): Document date.
  - `status` (string): `'Pending' | 'Approved' | 'Rejected' | 'Settled'`.
  - `created_by` (string): Creator's user ID.
  - `created_at` (string): ISO-8601 timestamp.
  - `updated_at` (string): ISO-8601 timestamp.
  - `receipt_url` (optional string): Receipt reference.
  - `invoice_no` (optional string): Commercial receipt number.

---

### 9. `CashVouchers`
- **Purpose**: Cash payment and liquidation vouchers for settling accrued expenses.
- **Arabic Description**: سندات الصرف والتحصيل والتصفية للعهد والمصاريف.
- **Fields**:
  - `id` (string): Unique identifier.
  - `voucher_no` (string): Sequential alphanumeric number.
  - `date` (string): Document date.
  - `station_id` (string): Branch ID.
  - `company_id` (string): Tenant company ID.
  - `amount` (number): Numeric cash value.
  - `amount_in_words` (map): `{ ar: string, en: string }`.
  - `recipient_name` (string): Name of individual collecting cash.
  - `received_by` (optional string): User verifying cash collection.
  - `approved_by` (optional string): Manager authorizing the settlement.
  - `status` (string): `'Draft' | 'Pending_Approval' | 'Approved' | 'Rejected' | 'Settled'`.
  - `expense_ids` (array of strings): IDs of linked `Expenses`.
  - `created_at` (string): ISO-8601 creation time.
  - `updated_at` (string): ISO-8601 modification time.

---

### 10. `TransactionHistory`
- **Purpose**: Audit trails tracking lifecycle stage transitions of vouchers/transactions.
- **Arabic Description**: سجل تتبع حالة حركة المستندات والمصادقات خطوة بخطوة.
- **Fields**:
  - `id` (string): Unique identifier.
  - `transaction_id` (string): Associated document/transaction ID.
  - `action` (string): Descriptive action (e.g. `'Created'`).
  - `performed_by` (string): Actor's user ID.
  - `performed_by_name` (string): Actor's display name.
  - `timestamp` (string): ISO-8601 timestamp.
  - `previous_status` (optional string): Prior status.
  - `new_status` (optional string): Outcome status.
  - `notes` (optional string): Justification or comments.

---

### 11. `Notifications`
- **Purpose**: Targeted alerts and task assignments sent to system operators.
- **Arabic Description**: الإشعارات الموجهة للمستخدمين بناءً على الحركات المالية الجديدة والاعتمادات.
- **Fields**:
  - `id` (string): Unique identifier.
  - `user_id` (string): Target user recipient ID.
  - `title_ar` (string): Arabic title.
  - `title_en` (string): English title.
  - `message_ar` (string): Arabic message body.
  - `message_en` (string): English message body.
  - `is_read` (boolean): Flag indicating read state.
  - `type` (string): `'info' | 'warning' | 'success' | 'error'`.
  - `related_id` (optional string): Linked document ID context.
  - `created_at` (string): ISO-8601 timestamp.

---

### 12. `AuditLogs`
- **Purpose**: Complete immutable log for security audits, login histories, and sensitive operations.
- **Arabic Description**: سجل التدقيق الأمني للعمليات الحساسة ومحاولات الدخول وحالة الأجهزة.
- **Fields**:
  - `id` (string): Unique identifier.
  - `user_id` (string): Actor ID.
  - `user_name` (string): Display name.
  - `user_role` (string): Role at the time of operation.
  - `ip_address` (optional string): IP address.
  - `device` (optional string): User-agent details.
  - `action_type` (string): Security identifier (e.g. `'CREATE_STATION'`).
  - `description` (string): Semantic audit statement.
  - `timestamp` (string): ISO-8601 timestamp.
  - `details` (optional map): Parameter mapping of payload changes.

---

### 13. `Permissions`
- **Purpose**: Registry defining global permission scopes available inside the platform.
- **Arabic Description**: القاموس والتعريف المركزي للصلاحيات المتاحة في النظام.
- **Fields**:
  - `id` (string): Key identifier (e.g. `'create_expense'`).
  - `name_en` (string): English label.
  - `name_ar` (string): Arabic label.
  - `description_en` (string): English purpose statement.
  - `description_ar` (string): Arabic purpose statement.
  - `category` (string): `'expenses' | 'vouchers' | 'custody' | 'admin' | 'reports'`.

---

### 14. `Roles`
- **Purpose**: Centralized definition of corporate-defined roles and custom permission sets.
- **Arabic Description**: إعداد مصفوفة الصلاحيات الخاصة بالأدوار المختلفة.
- **Fields**:
  - `id` (string): Key identifier (e.g. `'Admin'`).
  - `name_en` (string): English label.
  - `name_ar` (string): Arabic label.
  - `permissions` (map of string to boolean): Mapping of permissions toggles.
  - `created_at` (optional string): ISO-8601 timestamp.
  - `updated_at` (optional string): ISO-8601 timestamp.

---

### 15. `deleted_transactions`
- **Purpose**: Safely stores removed transactions to ensure financial non-repudiation.
- **Arabic Description**: الأرشيف الوقائي للعمليات المحذوفة لمنع التلاعب وتسهيل التدقيق.
- **Fields**:
  - `id` (string): Unique identifier.
  - `transaction_id` (string): Original transaction ID.
  - `transaction_no` (string): Original unique sequential number.
  - `transaction_data` (map): Exact replica copy of the deleted `Transaction` object.
  - `transaction_type` (string): `'Expense' | 'CashVoucher' | 'Transaction'`.
  - `amount` (number): Numeric cash value.
  - `created_by_name` (string): Name of original creator.
  - `deleted_by_name` (string): Name of deleting operator.
  - `deleted_by_role` (string): Role of deleting operator.
  - `deleted_at` (string): ISO-8601 timestamp.
  - `delete_reason` (string): Explanatory statement of delete request.
  - `station_name` (string): Station name.
  - `region_name` (string): Region name.
  - `branch` (optional string): Station branch label.
  - `company_id` (string): Tenant company ID.
  - `description` (optional string): Description.
  - `original_status` (optional string): Status of document before removal.

---

### 16. `company_sequences`
- **Purpose**: Holds the numerical values for transaction serial sequences per tenant.
- **Arabic Description**: عداد الترقيم التلقائي المتسلسل لدفاتر الشركات.
- **Fields**:
  - `id` (string): Company ID.
  - `company_id` (string): Identical to ID.
  - `last_voucher_no` (number): The last issued sequential number.

---

### 17. `signup_requests`
- **Purpose**: Log of signup proposals awaiting Super Admin confirmation.
- **Arabic Description**: طلبات التسجيل الجديدة المعلقة بانتظار مصادقة المدير العام للمنصة.
- **Fields**:
  - `id` (string): Unique identifier.
  - `email` (string): Requesting email.
  - `full_name` (string): Display name.
  - `role` (string): User role requested.
  - `company_id` (string): Linked corporate tenant ID.
  - `region_id` (optional string): Regional association if relevant.
  - `station_id` (optional string): local branch link if relevant.
  - `password` (optional string): Password hash.
  - `created_at` (string): ISO-8601 timestamp.
  - `status` (string): `'Pending' | 'Approved' | 'Rejected'`.
  - `rejection_reason` (optional string): Description of why request was declined.

---

### 18. `system_meta`
- **Purpose**: System-wide configuration checks, migration tracking, and seeding verification.
- **Arabic Description**: التحقق من تهيئة وإعداد النظام الأساسي وإصدارات قواعد البيانات.
- **Fields**:
  - Document ID `seed_status_v7`:
    - `seeded` (boolean): `true`.
    - `timestamp` (string): ISO-8601 timestamp of execution.

---

### 19. `password_reset_otps` (Server-Only)
- **Purpose**: Secure server-side storage of One-Time Passwords for password reset flow.
- **Arabic Description**: سجل مؤقت ومحمي على الخادم للأكواد السرية الخاصة بإعادة تعيين كلمة المرور.
- **Fields**:
  - `email` (string): Admin's email address.
  - `code` (string): 6-digit OTP code.
  - `expiresAt` (number): Milliseconds epoch timestamp for expiration.

---

### 20. `admin_login_otps` (Server-Only)
- **Purpose**: Secure server-side storage of OTP credentials for the primary platform admin login flow.
- **Arabic Description**: سجل مؤقت ومحمي على الخادم للأكواد السرية لتأكيد تسجيل الدخول للأدمن.
- **Fields**:
  - `email` (string): Admin's email address.
  - `code` (string): 6-digit OTP code.
  - `expiresAt` (number): Milliseconds epoch timestamp for expiration.

---

### 21. `system_config` (Server-Only)
- **Purpose**: Global developer parameters and integrations.
- **Arabic Description**: إعدادات النظام الحساسة لخوادم الإرسال SMTP والربط الخارجي.
- **Fields**:
  - Document ID `smtp`:
    - `host` (string): SMTP server address.
    - `port` (number): Connection port (e.g., 587 or 465).
    - `user` (string): Outgoing mail client username.
    - `pass` (string): Outgoing mail secret app password.
    - `from` (string): Formatted source display tag.
    - `updatedAt` (number): Last change timestamp.
