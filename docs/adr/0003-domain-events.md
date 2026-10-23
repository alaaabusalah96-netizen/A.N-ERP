# ADR 0003: Domain Events as Communication Pattern
# قرار التصميم رقم 0003: أحداث النطاق كنمط تواصل وتتبع

## Status / الحالة
Accepted (Frozen) / مقبول ومثبت

---

## Context / السياق
The lifecycle of custody movements and expense settlements is highly transactional. Changes in state (e.g., an expense being submitted, a voucher being rejected) should seamlessly trigger downstream actions like alert dispatch, record logs, and ledger offsets.

---

## Decision / القرار المعماري
We utilize **Domain Events** in past tense (e.g., `ExpenseCreated`, `CashVoucherApproved`) as the formal communication contract between modules and auditing tables.

---

## Justification & Pros / المبررات والإيجابيات
1. **Decoupled Architecture / فصل التبعية**:
   - The module performing the action (e.g., creating an expense) does not need to know which reporting or notification listeners need to be run. It simply commits the state and dispatches the corresponding event.
2. **Unified Lifecycle Audit Trails / تتبع دورات العمل الموحد**:
   - The events are appended to `TransactionHistory` and `AuditLogs` collections, offering a human-scannable storyboard of how documents transitioned across states over time.
3. **Easier Integration of Future Modules / سهولة ربط الوحدات المستقبلية**:
   - When the Warehouses or Purchasing modules are built, they can easily subscribe to existing event channels to adjust inventory levels or trigger vendor payments.

---

## Cons & Mitigations / العيوب وكيفية التعامل معها
- **Eventual Consistency Latency / تأخر الاتساق التلقائي**:
  - *Con*: Event-driven flows can result in slight lag before all dependent dashboards refresh.
  - *Mitigation*: Firestore's real-time streaming ensures latency is within milliseconds, appearing virtually instantaneous to the end-user.
