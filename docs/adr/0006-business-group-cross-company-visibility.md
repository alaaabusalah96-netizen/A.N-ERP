# ADR 0006: Business Group Cross-Company Visibility
# قرار التصميم رقم 0006: الرؤية عابرة الشركات عبر مجموعات الأعمال

## Status / الحالة
Accepted / مقبول

---

## Context / السياق
*English:*
ADR-0004 enforced strict, absolute logical data isolation between companies. However, real-world enterprise operations (supported by proven industry cases from other ERP implementations) require connected legal entities to collaborate within a parent "Business Group". For instance, a group inventory manager or auditor needs explicit, authorized read-only visibility into multiple companies inside their group, rather than being restricted to a single workspace. 

*العربية:*
فرض القرار رقم ADR-0004 عزلاً منطقياً صارماً ومطلقاً للبيانات بين الشركات. ومع ذلك، تتطلب العمليات التشغيلية للمؤسسات الكبرى (وهو ما تدعمه تجارب عملية مثبتة في أنظمة ERP عالمية أخرى) السماح للكيانات القانونية المترابطة بالتعاون تحت مظلة "مجموعة أعمال" (Business Group). على سبيل المثال، يحتاج مدير المخازن الإقليمي أو مراجع الحسابات لمجموعة الشركات إلى صلاحية قراءة صريحة ومصرح بها لعرض الأرصدة والمستندات عبر شركات متعددة داخل المجموعة، بدلاً من تقييده ببيئة عمل شركة واحدة.

---

## Decision / القرار المعماري
*English:*
We introduce a voluntary, higher-level architectural wrapper called "Business Group" (`group_id`) above individual companies.
1. **Retention of Strict Tenant Isolation**: Tenant isolation remains the absolute security baseline and default behavior.
2. **Explicit Permission Grant (Read-Only Cross-Company)**: We support explicit read-only visibility across multiple companies in the same Business Group for specifically authorized users (`assignedOrganizationIds` or `allowed_company_ids`).
3. **Strict Single-Company Writing Bound**: All write transactions (creating/updating documents, custody, expenses, vouchers) must remain strictly constrained within the user's primary/active single company workspace. There is no cross-company writing capability.

*العربية:*
نقوم بتقديم مستوى هيكلي أعلى واختياري يسمى "مجموعة الشركات" (`group_id`) فوق الكيانات الفردية للشركات.
1. **الاحتفاظ بالعزل الصارم للمستأجرين**: يظل عزل البيانات هو الأساس الأمني المطلق والسلوك الافتراضي للنظام.
2. **منح صلاحيات صريحة (للقراءة فقط عابرة الشركات)**: ندعم إمكانية الرؤية والقراءة فقط للمستندات والأرصدة عبر شركات متعددة في نفس مجموعة الأعمال للمستخدمين المصرح لهم صراحة (`assignedOrganizationIds` أو `allowed_company_ids`).
3. **تقييد صارم للكتابة على شركة واحدة**: جميع عمليات وحركات الكتابة (إنشاء/تعديل مستندات، عهدة، مصروفات، سندات) تظل مقيدة بشكل صارم داخل نطاق الشركة الأساسية/النشطة الحالية للمستخدم فقط، ولا يُسمح بالكتابة العابرة للشركات نهائياً.

---

## Alternatives Rejected / الحلول البديلة المرفوضة
*English:*
1. **Physical Database Merging**: Rejected due to high architectural risk, loss of compliance for separate legal entities, and being irreversible.
2. **Abolishing ADR-0004 completely**: Rejected because removing general tenant isolation breaks the core security guarantee for unassociated independent clients on the platform.

*العربية:*
1. **الدمج الفعلي لقواعد البيانات**: مرفوض نظراً للمخاطر المعمارية العالية، وفقدان الامتثال القانوني للكيانات المستقلة، واستحالة التراجع عنه.
2. **إلغاء قرار ADR-0004 بالكامل**: مرفوض لأن إزالة العزل العام يكسر الضمان الأمني الأساسي لعملاء المنصة المستقلين وغير المرتبطين بمجموعات أعمال.

---

## Impact / التأثير والتبعات
*English:*
- **Zero Regression**: No existing customer databases, rules, or features are affected. The feature is 100% opt-in via a nullable `group_id` field.
- **Enhanced Enterprise Capabilities**: Prepares KEMIT ERP ERP for multi-company holding structures, cross-company searches, and consolidated reporting while keeping codebase simplicity.

*العربية:*
- **عدم التأثير على النظام القائم**: لن تتأثر أي قاعدة بيانات أو قواعد حماية أو مميزات حالية. الميزة اختيارية بالكامل عن طريق حقل قابل للمسح أو القيمة الفارغة (`group_id`).
- **تحسين القدرات المؤسسية**: تجهيز النظام لدعم الشركات القابضة، والبحث عابر الشركات، والتقارير المجمعة، مع الحفاظ على بساطة الكود البرمجي.
