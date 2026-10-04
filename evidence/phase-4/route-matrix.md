# Phase 3 (AUTHZ-002) Route Authorization Matrix

| Method | Path | Guard | Permission | Sensitivity | Action | Phase |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| GET | /api/health | None | None | Public | OK (Public مقصود) | 1 |
| GET | /api/calendar | None | None | Public | PUBLIC_BY_DESIGN | 4 |
| POST | /api/auth/login | None | None | Public | OK (Public مقصود) | 1 |
| POST | /api/auth/refresh | None | None | Public | OK (Public مقصود) | 1 |
| POST | /api/auth/logout | None | None | Public | OK (Public مقصود) | 1 |
| GET | /api/auth/me | requireAuth | None | Low | OK (مقصود) | 1 |
| POST | /api/auth/2fa/setup | requireAuth | None | Low | OK (مقصود) | 1 |
| POST | /api/auth/2fa/verify-setup | requireAuth | None | Low | OK (مقصود) | 1 |
| GET | /api/company | requireAuth | None | Low | OK (مقصود) | 1 |
| PUT | /api/company | requireAuth | COMPANY_SETTINGS_MANAGE | High | OK | 2 |
| GET | /api/users | requireAuth | USER_MANAGE | High | OK | 1 |
| POST | /api/users | requireAuth | USER_MANAGE | High | OK | 1 |
| POST | /api/invitations | requireAuth | USER_MANAGE | High | OK | 1 |
| GET | /api/sessions | requireAuth | USER_MANAGE | High | OK | 1 |
| DELETE | /api/sessions/:sessionId | requireAuth | USER_MANAGE | High | OK | 1 |
| GET | /api/custom-fields | requireAuth | None | Low | OK (مقصود) | 1 |
| POST | /api/custom-fields | requireAuth | COMPANY_SETTINGS_MANAGE | High | OK | 2 |
| GET | /api/audit-trail | requireAuth | AUDIT_LOG_VIEW | Medium | OK | 2 |
| GET | /api/domain-events | requireAuth | AUDIT_LOG_VIEW | Medium | OK | 2 |
| GET | /api/transactions | requireAuth | ENTRY_VIEW | Medium | OK | 1 |
| POST | /api/transactions/post | requireAuth | ENTRY_POST | High | OK | 1 |
| POST | /api/transactions/approve | requireAuth | ENTRY_APPROVE | High | OK | 1 |
| POST | /api/transactions/:id/approve | requireAuth | ENTRY_APPROVE | High | OK | 1 |
| POST | /api/transactions/:id/post | requireAuth | ENTRY_POST | High | OK | 1 |
| GET | /api/wizard/tax-rules | None | None | Public | PUBLIC_BY_DESIGN | 4 |
| GET | /api/wizard/activity-templates | None | None | Public | PUBLIC_BY_DESIGN | 4 |
| POST | /api/wizard/create-company | requirePlatformAdmin | None | High | OK | 1 |
| GET | /api/tenants | requirePlatformAdmin | None | High | OK | 1 |
| POST | /api/storage/propose-migration | requirePlatformAdmin | None | High | OK | 1 |
| POST | /api/numbering/override | requireAuth | COMPANY_SETTINGS_MANAGE | High | OK | 2 |
| GET | /api/reports/balance-as-of | requireAuth | FINANCIAL_REPORTS | Medium | OK | 1 |
| GET | /api/reports/statement-as-of | requireAuth | FINANCIAL_REPORTS | Medium | OK | 1 |
| POST | /api/master-data/items | requireAuth | ENTRY_CREATE | Medium | OK | 1 |
| POST | /api/master-data/items/:id/approve | requireAuth | ENTRY_APPROVE | High | OK | 1 |
| POST | /api/master-data/partners | requireAuth | ENTRY_CREATE | Medium | OK | 1 |
| POST | /api/master-data/partners/:id/approve | requireAuth | ENTRY_APPROVE | High | OK | 1 |
| GET | /api/audit-chain | requireAuth | AUDIT_LOG_VIEW | Medium | OK | 2 |
| POST | /api/audit-chain/verify | requireAuth | AUDIT_LOG_VIEW | Medium | OK | 2 |
| GET | /api/tenant-modules | requireAuth | None | Low | OK (مقصود) | 1 |
| GET | /api/internal/phase2-battery | requireDeveloperOrAuditor | None | High | OK | 1 |
| GET | /api/internal/phase3-battery | requireDeveloperOrAuditor | None | High | OK | 1 |
| GET | /api/internal/build-status | requireDeveloperOrAuditor | None | High | OK | 1 |
| GET | /api/internal/health | requireDeveloperOrAuditor | None | High | OK | 1 |
| GET | /api/internal/primary-battery | requireDeveloperOrAuditor | None | High | OK | 1 |
| GET | /api/internal/phase1-battery | requireDeveloperOrAuditor | None | High | OK | 1 |
| GET | /api/internal/phase4_6-battery | requireDeveloperOrAuditor | None | High | OK | 1 |
| GET | /api/accounting/accounts | requireAuth | ENTRY_VIEW | Medium | ALREADY_APPLIED_V38 | 4 |
| POST | /api/accounting/accounts | requireAuth | ENTRY_CREATE | Medium | OK | 1 |
| PATCH | /api/accounting/accounts/:code/status | requireAuth | ENTRY_CREATE | Medium | OK | 1 |
| GET | /api/accounting/periods | requireAuth | ENTRY_VIEW | Medium | ALREADY_APPLIED_V38 | 4 |
| POST | /api/accounting/periods/close | requireAuth | PERIOD_CLOSE | Medium | OK | 1 |
| POST | /api/accounting/periods/reopen | requireAuth | PERIOD_CLOSE | Medium | OK | 1 |
| GET | /api/accounting/journal-entries | requireAuth | ENTRY_VIEW | Medium | OK | 2 |
| POST | /api/accounting/journal-entries | requireAuth | ENTRY_POST | High | OK | 1 |
| GET | /api/accounting/dimensions | requireAuth | ENTRY_VIEW | Medium | ALREADY_APPLIED_V38 | 4 |
| POST | /api/accounting/dimensions | requireAuth | ENTRY_CREATE | Medium | OK | 2 |
| GET | /api/accounting/dimensions/analytics | requireAuth | FINANCIAL_REPORTS | Medium | OK | 2 |
| GET | /api/accounting/units | requireAuth | None | Low | OK (مقصود) | 1 |
| GET | /api/accounting/items | requireAuth | ENTRY_VIEW | Medium | ALREADY_APPLIED_V38 | 4 |
| POST | /api/accounting/items | requireAuth | ENTRY_CREATE | Medium | OK | 2 |
| POST | /api/accounting/opening-balances | requireAuth | ENTRY_POST | High | OK | 1 |
| GET | /api/accounting/reports/trial-balance | requireAuth | FINANCIAL_REPORTS | Medium | OK | 1 |
| GET | /api/accounting/reports/income-statement | requireAuth | FINANCIAL_REPORTS | Medium | OK | 1 |
| GET | /api/accounting/reports/balance-sheet | requireAuth | FINANCIAL_REPORTS | Medium | OK | 1 |
| GET | /api/accounting/reports/cash-flow | requireAuth | FINANCIAL_REPORTS | Medium | OK | 1 |
| POST | /api/accounting/import/validate | requireAuth | ENTRY_CREATE | Medium | OK | 2 |
| POST | /api/accounting/import/execute | requireAuth | ENTRY_CREATE | Medium | OK | 2 |
| GET | /api/accounting/budgets | requireAuth | FINANCIAL_REPORTS | Medium | OK | 2 |
| POST | /api/accounting/budgets | requireAuth | ENTRY_CREATE | Medium | OK | 2 |
| GET | /api/accounting/recurring | requireAuth | ENTRY_VIEW | Medium | OK | 2 |
| POST | /api/accounting/recurring/:id/run | requireAuth | ENTRY_CREATE | Medium | OK | 2 |
| GET | /api/accounting/migration/templates | requireAuth | None | Low | OK (مقصود) | 1 |
| GET | /api/accounting/balance-checker/run | requireAuth | FINANCIAL_REPORTS | Medium | OK | 2 |
| GET | /api/accounting/balance-checker/history | requireAuth | FINANCIAL_REPORTS | Medium | OK | 2 |
| POST | /api/accounting/fuzz-test | requireDeveloperOrAuditor | None | High | OK | 2 |
| GET | /api/internal/phase5-battery | requireDeveloperOrAuditor | None | High | OK | 1 |
| GET | /api/custody/custodies | requireAuth | CUSTODY_VIEW | Medium | ALREADY_APPLIED_V38 | 4 |
| GET | /api/custody/custodies/:id | requireAuth | CUSTODY_VIEW | Medium | ALREADY_APPLIED_V38 | 4 |
| POST | /api/custody/custodies | requireAuth | CUSTODY_OPEN | Medium | OK | 1 |
| POST | /api/custody/expenses | requireAuth | CUSTODY_EXPENSE_RECORD | Medium | OK | 1 |
| GET | /api/custody/expenses | requireAuth | CUSTODY_VIEW | Medium | ALREADY_APPLIED_V38 | 4 |
| POST | /api/custody/settlements | requireAuth | CUSTODY_SETTLE | High | OK | 1 |
| GET | /api/custody/settlements | requireAuth | CUSTODY_VIEW | Medium | ALREADY_APPLIED_V38 | 4 |
| GET | /api/custody/hr-clearance/:employeeId | requireAuth | CUSTODY_VIEW | Medium | ALREADY_APPLIED_V38 | 4 |
| POST | /api/custody/custodies/:id/liquidate | requireAuth | CUSTODY_SETTLE | High | OK | 1 |
| POST | /api/custody/custodies/:id/transfer | requireAuth | CUSTODY_OPEN | Medium | OK | 1 |
| GET | /api/internal/phase6-battery | requireDeveloperOrAuditor | None | High | OK | 1 |
| GET | /api/expenses/categories | requireAuth | None | Low | OK (مقصود) | 1 |
| POST | /api/expenses/categories | requireAuth | EXPENSE_SUBMIT | Medium | OK | 1 |
| GET | /api/expenses/requests | requireAuth | INLINE: EXPENSE_APPROVE or FINANCIAL_REPORTS (all) / EXPENSE_SUBMIT (own) | Medium | CLOSED_P4 | 4 |
| GET | /api/expenses/requests/:id | requireAuth | INLINE: EXPENSE_APPROVE or FINANCIAL_REPORTS (all) / EXPENSE_SUBMIT (own) | Medium | CLOSED_P4 | 4 |
| POST | /api/expenses/requests | requireAuth | EXPENSE_SUBMIT | Medium | OK | 1 |
| POST | /api/expenses/requests/:id/approve-l1 | requireAuth | EXPENSE_APPROVE | High | OK | 1 |
| POST | /api/expenses/requests/:id/approve-l2 | requireAuth | EXPENSE_APPROVE | High | OK | 1 |
| POST | /api/expenses/requests/:id/reject | requireAuth | EXPENSE_APPROVE | High | OK | 1 |
| GET | /api/internal/phase7-battery | requireDeveloperOrAuditor | None | High | OK | 1 |
| GET | /api/inventory/warehouses | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| POST | /api/inventory/warehouses | requireAuth | STOCK_RECEIVE | Medium | OK | 1 |
| GET | /api/inventory/warehouses/:id/bins | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| POST | /api/inventory/warehouses/:id/bins | requireAuth | STOCK_RECEIVE | Medium | OK | 1 |
| GET | /api/inventory/items | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| POST | /api/inventory/items | requireAuth | STOCK_RECEIVE | Medium | OK | 1 |
| GET | /api/inventory/stock | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| GET | /api/inventory/movements | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| POST | /api/inventory/receive,/api/inventory/movements/receive | requireAuth | STOCK_RECEIVE | Medium | OK | 1 |
| POST | /api/inventory/issue,/api/inventory/movements/issue | requireAuth | STOCK_ISSUE | Medium | OK | 1 |
| GET | /api/inventory/transfers | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| POST | /api/inventory/transfers | requireAuth | STOCK_TRANSFER | Medium | OK | 1 |
| GET | /api/inventory/transfers/:id | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| POST | /api/inventory/transfers/:id/dispatch | requireAuth | STOCK_TRANSFER | Medium | OK | 1 |
| POST | /api/inventory/transfers/:id/receive | requireAuth | STOCK_TRANSFER | Medium | OK | 1 |
| GET | /api/inventory/counts | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| POST | /api/inventory/counts | requireAuth | STOCK_COUNT_APPROVE | High | OK | 1 |
| GET | /api/inventory/counts/:id | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| POST | /api/inventory/counts/:id/approve | requireAuth | STOCK_COUNT_APPROVE | High | OK | 1 |
| GET | /api/inventory/documents | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| GET | /api/inventory/documents/:id | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| POST | /api/inventory/returns | requireAuth | STOCK_RETURN | Medium | OK | 1 |
| GET | /api/inventory/items/:id/ledger | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| GET | /api/inventory/items/:id/prices | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| POST | /api/inventory/items/:id/prices | requireAuth | STOCK_RECEIVE | Medium | OK | 1 |
| GET | /api/inventory/items/search/barcode | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| GET | /api/inventory/items/:id/barcode-svg | requireAuth | STOCK_VIEW | Medium | OK | 2 |
| GET | /api/attachments | requireAuth | INLINE: by documentType | Medium | CLOSED_P4 | 4 |
| POST | /api/attachments | requireAuth | INLINE: by documentType | Medium | CLOSED_P4 | 4 |
| GET | /api/custody/vouchers | requireAuth | CUSTODY_VIEW | Medium | CLOSED_P4 | 4 |
| GET | /api/custody/vouchers/:id | requireAuth | CUSTODY_VIEW | Medium | CLOSED_P4 | 4 |
| POST | /api/custody/vouchers/:id/return | requireAuth | CUSTODY_SETTLE | High | OK | 1 |
| POST | /api/expenses/requests/:id/reverse | requireAuth | EXPENSE_APPROVE | High | OK | 1 |
| GET | /api/print/:docType/:docId | requireAuth | INLINE: by docType | Medium | CLOSED_P4 | 4 |
| GET | * | None | None | Public | OK (Public مقصود) | 1 |

## الإحصائيات والمطابقة
- عدد تسجيلات المسارات في server.ts (نصّ أو مصفوفة مسارات): 131
- منها مطابقة للـregex الصارم (مسار نصّي واحد): 129 (+ 2 تسجيل بمصفوفة مسارات)
- عدد صفوف المصفوفة: 131
- DEFER_P4 المتبقي: 0
- CLOSED_P4: 7 | ALREADY_APPLIED_V38: 9 | PUBLIC_BY_DESIGN: 3
- Unclassified (لا يوجد صف سابق في phase-2): 0
- مسارات High بلا Permission لكنها محمية بـguard دوري مخصص (14): POST /api/wizard/create-company, GET /api/tenants, POST /api/storage/propose-migration, GET /api/internal/phase2-battery, GET /api/internal/phase3-battery, GET /api/internal/build-status, GET /api/internal/health, GET /api/internal/primary-battery, GET /api/internal/phase1-battery, GET /api/internal/phase4_6-battery, POST /api/accounting/fuzz-test, GET /api/internal/phase5-battery, GET /api/internal/phase6-battery, GET /api/internal/phase7-battery
- مسارات High بلا أي حماية: 0

## الفحوصات المطلوبة
- PASS: Matrix contains zero DEFER_P4
- PASS: No High-sensitivity route lacks a Permission / inline check / dedicated role guard
- PASS: Route registrations == matrix rows
- PASS: 7 routes CLOSED_P4
- PASS: 9 routes ALREADY_APPLIED_V38
- PASS: 3 routes PUBLIC_BY_DESIGN
- PASS: All CLOSED_P4 / ALREADY_APPLIED_V38 routes carry a Permission or inline check
