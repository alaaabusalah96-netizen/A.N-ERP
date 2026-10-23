# ADR 0004: Multi-Tenant Architecture from Day One
# قرار التصميم رقم 0004: هيكلية تعدد المستأجرين منذ اليوم الأول

## Status / الحالة
Accepted (Frozen) / مقبول ومثبت

---

## Context / السياق
KEMIT ERP is designed as an enterprise software platform. Converting a single-tenant platform into a secure multi-tenant SaaS later in the product life cycle requires complex, expensive refactoring of all databases, queries, and security rules.

---

## Decision / القرار المعماري
We enforce a strict **Multi-Tenant Logical Isolation Architecture** from day one. Every single data model (except global templates) must carry a `company_id` field.

---

## Justification & Pros / المبررات والإيجابيات
1. **Absolute Data Isolation / الأمان والخصوصية التامة للشركات**:
   - Security rules evaluate requests at the Firestore level, guaranteeing that a user from Company A can never view or edit documents belonging to Company B.
2. **Simplified Scaling & Subscription Models / مرونة الاشتراك التجاري**:
   - A single deployment serves multiple companies. Plans, expiration limits, and active states can be toggled per tenant under `companies` metadata seamlessly.
3. **Seamless Impersonation Support / تيسير الدعم الفني الفوري**:
   - Allows platform global super administrators (`SystemAdmin`) to impersonate local admins or station custodians for technical support within secure transaction logs.

---

## Cons & Mitigations / العيوب وكيفية التعامل معها
- **Higher Query Filters overhead / تعقيد شروط الاستعلامات**:
  - *Con*: Every read, write, and collection index must strictly carry the `company_id` filter.
  - *Mitigation*: We encapsulate this inside the centralized data hooks and Firestore context layers to automate tenant scope filtering on the client and server.
