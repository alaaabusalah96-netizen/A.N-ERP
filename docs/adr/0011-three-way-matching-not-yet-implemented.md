# ADR 0011: Three-Way Matching — Not Yet Implemented
# قرار التصميم رقم 0011: المطابقة الثلاثية للمشتريات (Three-Way Matching) — غير منفذة حالياً

## Status / الحالة
Deferred / Gap Documented (مؤجل / فجوة موثقة)

---

## Context / السياق
*English:*
In mature enterprise resource planning (ERP) purchasing and accounts payable workflows, **Three-Way Matching** is a critical internal control mechanism. It verifies that:
1. The **Purchase Order (PO)** issued to the supplier (quantities, agreed unit prices, terms),
2. The **Goods Receipt Note (GRN / Receipt Document)** recorded by the warehouse upon physical intake (quantities received, accepted, rejected), and
3. The **Vendor Invoice / Bill (AP Invoice)** submitted by the supplier for payment (billed quantities, unit prices, taxes, total amount),
all match within acceptable enterprise tolerance thresholds before payment disbursement is authorized.

*العربية:*
في أنظمة تخطيط موارد المؤسسات (ERP) المتقدمة ودورات الحسابات الدائنة والمشتريات، تعد **المطابقة الثلاثية (Three-Way Matching)** أداة رقابة داخلية جوهرية. تهدف المطابقة إلى التحقق من تطابق:
1. **أمر الشراء (Purchase Order - PO)** الصادر للمورد (الكميات والأسعار والشروط المتفق عليها).
2. **سند استلام البضاعة (Goods Receipt Note - GRN)** المسجل بالمستودع عند الاستلام الفعلي (الكميات المستلمة والمقبولة).
3. **فاتورة المورد (Vendor Invoice / AP Bill)** المقدمة للمطالبة بالسداد (الكميات المفوترة، الأسعار، الضرائب، الإجمالي).
وذلك للتأكد من تطابقها ضمن نسب التفاوت المسموح بها قبل اعتماد وصرف الدفعات النقدية.

---

## Current Architecture Gap / الفجوة المعمارية الحالية
*English:*
A comprehensive architectural audit of the current KEMIT ERP codebase (`src/types/purchasing.ts`, `src/types/inventory.ts`, `src/lib/enterprise/purchasing_engine.ts`, `src/pages/Purchasing.tsx`) confirms that:
- **Missing Linking Entities & Fields**: There are no formal schema entities or foreign keys linking `po_id`, `invoice_id`, and `receipt_id` across purchasing and warehouse receipt boundaries.
- **Missing Vendor Invoice Entity**: The current purchasing module manages Purchase Requests (PR), Purchase Orders (PO), RFQs, and Vendor Quotes, but does not currently define or persist standalone Vendor AP Invoices.
- **Direct Receipt Transition**: The current `receivePurchaseOrder` operation directly creates an inventory movement document and updates the PO status to `RECEIVED`, generating general ledger postings without an intermediate reconciliation / matching stage.

*العربية:*
أكد الفحص المعماري الشامل لكود KEMIT ERP الحالي (`src/types/purchasing.ts`، `src/types/inventory.ts`، `src/lib/enterprise/purchasing_engine.ts`، `src/pages/Purchasing.tsx`) ما يلي:
- **غياب حقول وكيانات الربط**: لا توجد حقول ارتباط أو مفاتيح خارجية (`po_id`، `invoice_id`، `receipt_id`) تربط بين مستندات الشراء وسندات الاستلام وفواتير الموردين.
- **غياب كيان فاتورة المورد (Vendor Invoice)**: يدير نظام المشتريات حالياً طلبات الشراء وأوامر الشراء وعروض الأسعار، ولكنه لا يحتوي على كيان مستقل لفواتير الموردين المستحقة الدفع.
- **الاستلام المباشر**: إجراء استلام أمر الشراء `receivePurchaseOrder` يقوم مباشرة بإنشاء سند مستودعي وتحديث حالة أمر الشراء إلى `RECEIVED` وإجراء القيد المحاسبي دون مرحلة وسيطة للمطابقة والتسوية.

---

## Why Deferred From Remediation / أسباب التأجيل عن مرحلة المعالجة الحالية
*English:*
Implementing Three-Way Matching is a major feature expansion rather than a defect remediation:
1. **Scope Constraint**: Implementing three-way matching requires new data schemas (`VendorInvoice`, `MatchingToleranceRule`, `MatchDiscrepancyLog`), new state machines, new approval sub-workflows, and complex UI screens.
2. **Additive Safety (Rule 3 & 11)**: Building an incomplete or simplified matching layer within stabilization phases risks breaking existing purchasing and inventory workflows.
3. **Recommendation**: Three-Way Matching should be designed and implemented as a dedicated enterprise procurement milestone following the completion of baseline remediation.

*العربية:*
تعد المطابقة الثلاثية توسعة وظيفية رئيسية وليست مجرد إصلاح لخلل، وتأجيلها مبني على:
1. **انضباط النطاق (Scope Discipline)**: تتطلب المطابقة الثلاثية نماذج بيانات جديدة كلياً (`VendorInvoice`، قواعد التفاوت المالي، سجلات الفروقات)، وآلات حالات جديدة وشاشات متخصصة.
2. **الحفاظ على استقرار النظام (Rule 3 & 11)**: بناء مطابقة جزئية أو غير مكتملة أثناء مراحل التثبيت الحالية قد يسبب تعارضاً مع تدفقات أوامر الشراء والمستودعات القائمة.
3. **التوصية**: تصميم وتنفيذ ميزة المطابقة الثلاثية في مرحلة تطوير مستقلة ومخصصة بعد إتمام مراحل التثبيت والاستقرار الأساسية.
