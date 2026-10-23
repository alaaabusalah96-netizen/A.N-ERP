# ADR 0002: Append-Only Ledger for Balances
# قرار التصميم رقم 0002: الدفاتر غير القابلة للتعديل للحسابات والعهد

## Status / الحالة
Accepted (Frozen) / مقبول ومثبت

---

## Context / السياق
Operating financial custody pools across distributed retail and service stations requires absolute accountability. Mutating or physically deleting transaction rows breaks historical financial alignment and creates compliance and security risks.

---

## Decision / القرار المعماري
We enforce an **Append-Only Ledger architecture** for all operational balances, financial movements, and cash replenishments. All actions are logged as unique, sequential entries.

---

## Justification & Pros / المبررات والإيجابيات
1. **Financial Integrity / النزاهة والتدقيق المالي**:
   - Ensures an immutable audit trail. Previous states can never be silently overwritten or modified.
2. **Preventing Deletion Fraud / منع تلاعب الحذف**:
   - Deletion of transactions is implemented strictly as a non-destructive archive state. The transaction data is duplicated into `deleted_transactions` with detailed audit fields (like `deleted_by` and `delete_reason`), and the original state is flagged or offset.
3. **Accurate Historical Replay / إمكانية مراجعة الأثر الرجعي**:
   - Allows accountants to recalculate any historical balance at any given minute by rolling the log forward.

---

## Cons & Mitigations / العيوب وكيفية التعامل معها
- **Higher Storage Requirements / حجم تخزين أكبر**:
  - *Con*: Append-only records consume more document storage over time due to repeated logs instead of simple updates.
  - *Mitigation*: Firestore's low-cost document storage handles large logs gracefully, and older settled archives can be periodically compacted into optimized snapshot summaries.
