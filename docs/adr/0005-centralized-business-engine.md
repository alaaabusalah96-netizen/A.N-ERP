# ADR 0005: Centralized Business Engine Logic
# قرار التصميم رقم 0005: مركزية منطق العمل التجاري والمحركات المشتركة

## Status / الحالة
Accepted (Frozen) / مقبول ومثبت

---

## Context / السياق
As the application expands to cover additional functional modules (Warehouses, Purchasing, Accounting), many operations (e.g., updating a sequence number, settling cash, generating double-entry accounting records) will be triggered from different views. Localizing these operations within specific React components leads to logic duplication and consistency errors.

---

## Decision / القرار المعماري
We enforce the use of **Centralized Business Engines** (e.g. Settle Engine, Sequence Engine) that expose formal interface contracts. Individual modules and UI forms must interact through these central interfaces.

---

## Justification & Pros / المبررات والإيجابيات
1. **Single Source of Truth / مصدر واحد للمنطق والحسابات**:
   - Centralizing the logic ensures that whether a voucher is approved via the main dashboard or via an automated integration, the exact same validation rules, sequence counts, and log steps are applied.
2. **Simplified Refactoring / سهولة الصيانة والتحديث الفني**:
   - If an accounting or settlement rule changes, it is modified once inside the central engine, immediately propagating to all dependent views.
3. **Decoupled Presentation Layer / واجهات مستخدم نظيفة وخفيفة**:
   - UI views remain humble and stateless, focusing strictly on visuals, layout, and localized inputs rather than computing business outcomes.

---

## Cons & Mitigations / العيوب وكيفية التعامل معها
- **Higher Initial Planning Overhead / وقت تخطيط أطول**:
  - *Con*: Requires drafting precise shared interfaces and data schemas before coding UI features.
  - *Mitigation*: We resolve this by running comprehensive documentation steps (like Phase 1 Architectural Specs) to freeze design boundaries ahead of implementation.
