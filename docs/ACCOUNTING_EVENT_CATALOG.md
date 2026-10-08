# Accounting Event Catalog

The canonical event taxonomy (`ACCOUNTING_EVENTS` in `src/core/standards/standardsTypes.ts`). A rule can only be registered for a known event (`unknown-event` otherwise). New events are added by later phases in `UPPER_SNAKE_CASE` through the registration function; modules must not invent ad-hoc names.

A **business event** passed to `StandardsDecisionService.decide()` carries: `tenantId`, `eventType`, `eventId`, `sourceModule`, `date` (`YYYY-MM-DD`, the transaction date used for rule/policy versions), `currency`, `reportingJurisdictionId`, optional `taxJurisdictionId`, and `facts` (a plain object). Missing required facts produce `REVIEW_REQUIRED`, never a default.

| Group | Events |
|---|---|
| Purchasing | PURCHASE_ORDER, GOODS_RECEIPT, SUPPLIER_INVOICE, SUPPLIER_PAYMENT, PURCHASE_RETURN |
| Sales | SALES_ORDER, DELIVERY, SALES_INVOICE, CUSTOMER_RECEIPT, SALES_RETURN, CREDIT_NOTE |
| Inventory | INVENTORY_TRANSFER, INVENTORY_COUNT, INVENTORY_WRITE_DOWN, INVENTORY_WRITE_DOWN_REVERSAL, INVENTORY_LOSS, INVENTORY_GAIN, PRODUCTION_ISSUE, PRODUCTION_RECEIPT |
| Fixed assets | ASSET_ACQUISITION, ASSET_CAPITALIZATION, DEPRECIATION_RUN, ASSET_DISPOSAL, ASSET_IMPAIRMENT, ASSET_REVALUATION |
| Payroll | PAYROLL_RUN |
| Foreign currency | FOREIGN_CURRENCY_SETTLEMENT, FOREIGN_CURRENCY_REVALUATION |
| Leases | LEASE_COMMENCEMENT, LEASE_PAYMENT, LEASE_REMEASUREMENT |
| Financing and credit | INTEREST_ACCRUAL, LOAN_DRAW, LOAN_REPAYMENT, EXPECTED_CREDIT_LOSS |
| Provisions | PROVISION_RECOGNITION, PROVISION_REASSESSMENT |
| Tax | TAX_ACCRUAL, TAX_PAYMENT |
| Period and group | PERIOD_CLOSE, CONSOLIDATION, INTERCOMPANY_ELIMINATION |

## Status of each event today
- **Exercised end to end in tests (fixtures only):** GOODS_RECEIPT, DELIVERY, SALES_INVOICE, INVENTORY_WRITE_DOWN, INVENTORY_LOSS, INVENTORY_GAIN, ASSET_ACQUISITION, DEPRECIATION_RUN, FOREIGN_CURRENCY_SETTLEMENT.
- **Cataloged only:** all the others. They have no rule, so a decision for them is `NOT_APPLICABLE` (no covered rule) and the originating module stays on its current path.
- **Emitted by real modules today:** none. Wiring a module means building the event from its document and calling the decision service plus the bridge; that is a separate, per-module phase.
