# Domain Event Catalog (v1.0)
# دليل الأحداث الخاصة بنطاقات العمل

This document logs all system-wide domain events in **Past Tense** form. It represents the lifecycle of transactions, vouchers, and users.

---

## 1. Cash Custody Domain Events / أحداث نظام العهدة المالية

- `SignupRequestCreated`
- `SignupRequestApproved`
- `SignupRequestRejected`
- `UserLoggedIn`
- `UserLoggedOut`
- `ImpersonationStarted`
- `ImpersonationEnded`
- `UserPasswordReset`
- `CompanyCreated`
- `CompanyStatusToggled`
- `CompanySubscriptionUpdated`
- `RegionCreated`
- `RegionUpdated`
- `RegionDeleted`
- `StationCreated`
- `StationUpdated`
- `StationDeleted`
- `StationCustodyRecharged`
- `ExpenseCreated`
- `ExpenseApproved`
- `ExpenseRejected`
- `CashVoucherCreated`
- `CashVoucherApproved`
- `CashVoucherRejected`
- `CashVoucherSettled`
- `TransactionDeleted`
- `SystemMetaSeeded`

---

## 2. Inventory & Warehouse Domain Events / أحداث نظام المخازن والمستودعات (مستقبلي)

- `WarehouseCreated`
- `WarehouseUpdated`
- `StockReceived`
- `StockIssued`
- `StockTransferred`
- `InventoryCountAdjusted`
- `ItemCategoryAdded`

---

## 3. Purchasing Domain Events / أحداث نظام المشتريات (مستقبلي)

- `PurchaseRequestSubmitted`
- `PurchaseRequestApproved`
- `PurchaseRequestRejected`
- `PurchaseOrderIssued`
- `VendorRegistered`

---

## 4. Accounting Domain Events / أحداث نظام الحسابات (مستقبلي)

- `JournalEntryPosted`
- `ChartOfAccountsInitialized`
- `FiscalYearClosed`
- `LedgerAccountAdjusted`

---

## 5. Shared Platform & Enterprise Foundation Domain Events / أحداث الأساسيات والبنية التحتية المشتركة

- `PermissionGranted`
- `PermissionRevoked`
- `PermissionExpired`

