# ADR 0008: Enterprise Purchasing & Procurement Module
# قرار التصميم رقم 0008: نظام المشتريات والتموين للمؤسسات

## Status / الحالة
Accepted / مقبول

---

## Context / السياق
*English:*
To complete the enterprise resource planning (ERP) scope of KEMIT ERP, we need to introduce a secure, robust Purchasing & Procurement module. This module enables companies to manage reliable supplier relations (Vendors), initiate formal requests for items or materials (Purchase Requests), and issue official binding orders to suppliers (Purchase Orders). These purchasing documents must have structured lifecycles (FSM states) and integrate with the centralized Permission, Audit, and Sequence engines defined under the Enterprise Foundation.

*العربية:*
لاستكمال نطاق تخطيط موارد المؤسسات (ERP) في KEMIT ERP، يجب إدخال موديول المشتريات والتموين لتمكين الشركات من إدارة العلاقات مع الموردين المعتمدين (Vendors)، وتوليد طلبات شراء داخلية صريحة (Purchase Requests)، وإصدار أوامر شراء رسمية ملزمة للموردين (Purchase Orders). يجب أن تتبع مستندات الشراء هذه دورات حياة محددة عبر آلة الحالات (FSM) وتتكامل مع محركات الصلاحيات والترقيم المتسلسل والتدقيق المشتركة تحت الأساس المعرفي للمؤسسات.

---

## Decision / القرار المعماري
*English:*
We implement an additive, fully isolated Purchasing and Procurement system following these core specifications:
1. **Vendor Registry**: Establish a suppliers directory scoped by company.
2. **Purchase Request (PR) Lifecycle FSM**:
   - States: `DRAFT` -> `PENDING_APPROVAL` -> `APPROVED` / `REJECTED`.
   - PR to PO link: Approved PRs can be transitioned into active Purchase Orders.
3. **Purchase Order (PO) Lifecycle FSM**:
   - States: `DRAFT` -> `ISSUED` -> `RECEIVED` (integrated with Inventory receipts).
4. **Integration with Enterprise Foundation**: All document generation utilizes the gap-free Sequence Engine, mutations trigger FSM transitions, and all state changes append secure audit envelopes to `AuditLogs`.

*العربية:*
ننفذ نظاماً إضافياً متكاملاً لإدارة المشتريات والتموين بناءً على المواصفات التالية:
1. **دليل الموردين**: إنشاء قائمة موردين مستقلة ومعزولة لكل شركة.
2. **دورة حياة طلبات الشراء (PR)**:
   - الحالات: `DRAFT` (مسودة) -> `PENDING_APPROVAL` (معلق للاعتماد) -> `APPROVED` (معتمد) / `REJECTED` (مرفوض).
   - التحويل المباشر: طلبات الشراء المعتمدة يمكن تحويلها مباشرة إلى أمر شراء رسمي.
3. **دورة حياة أوامر الشراء (PO)**:
   - الحالات: `DRAFT` (مسودة) -> `ISSUED` (صادر للمورد) -> `RECEIVED` (تم الاستلام والربط بالمخازن).
4. **التكامل مع محركات المؤسسة**: تعتمد جميع المستندات على محرك الترقيم المتسلسل، وتخضع الحركات لآلة الحالات الفيدرالية، ويتم تسجيل جميع التغيرات كأحداث غلاف في سجل التدقيق.

---

## Impact / التأثير والتبعات
*English:*
- **Zero Regression**: Fits cleanly alongside the existing Cash Custody and Warehouse modules with no disruption.
- **Traceable Sourcing**: Full transparency from initial purchase request down to warehouse stock receiving.
- **Enterprise-ready RBAC**: Purchasing-specific permissions govern who can submit requests vs who can approve or issue orders.

*العربية:*
- **حماية النظام الحالي**: يعمل الموديول الجديد بشكل إضافي مستقل دون التأثير على إدارة العهد النقدية أو الأرصدة الحالية.
- **التتبع المتكامل**: رؤية كاملة للحركة من بداية طلب الشراء وحتى الاستلام الفعلي في المخازن وتحديث الكميات.
- **صلاحيات صارمة**: تخصيص امتيازات منفصلة لمن يملك صلاحية تقديم الطلب ومن يملك صلاحية الاعتماد المالي أو إصدار الأمر للمورد.
