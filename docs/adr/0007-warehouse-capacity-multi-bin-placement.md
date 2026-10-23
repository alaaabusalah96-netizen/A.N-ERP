# ADR 0007: Warehouse Capacity & Multi-Bin Placement System
# قرار التصميم رقم 0007: نظام سعة المستودعات وتخصيص البضائع بالحاويات المتعددة

## Status / الحالة
Accepted / مقبول

---

## Context / السياق
*English:*
As the inventory system grows, large warehouses (such as fuel, battery, tire, and spare parts depots) need fine-grained control over internal storage structures (bins, racks, shelving). Uncontrolled storage can lead to overfilling, safety hazards, and difficulty locating items. A robust Warehouse Capacity & Multi-Bin Placement System is required to track individual warehouse and bin-level capacities, enforce bounds to prevent overfills, and facilitate precise internal relocations.

*العربية:*
مع توسع النظام المخزني، تحتاج المستودعات الكبيرة (مثل مستودعات الوقود والبطاريات والإطارات وقطع الغيار) إلى تحكم دقيق في هياكل التخزين الداخلية (الحاويات، الرفوف، الخلايا). يمكن أن يؤدي التخزين العشوائي إلى تجاوز السعة، ومخاطر السلامة، وصعوبة تحديد مواقع السلع. يتطلب الأمر نظاماً قوياً لإدارة سعة المستودعات وتخصيص البضائع بالحاويات المتعددة لتعقب السعات على مستوى المستودع والحاويات الفردية، وفرض قيود لمنع تجاوز السعات المحددة وتسهيل المناقلات الداخلية بدقة.

---

## Decision / القرار المعماري
*English:*
We implement an additive, fully backward-compatible Warehouse Capacity and Multi-Bin Placement system:
1. **Warehouse Capacity Enforcement**: Warehouses support optional capacity limits (`is_capacity_enforced` and `max_capacity_qty`). Standard stock receipts and transfer receipt validations enforce these limits.
2. **Multi-Bin Allocation**: Items within an inventory document can optionally allocate specific quantities to specific warehouse bins (`WarehouseBin`). 
3. **Internal Bin Relocation**: A dedicated backend and frontend interface allows internal bin-to-bin stock transfer within the same warehouse.
4. **Preservation of Core Flow**: If a warehouse has no bins or has capacity enforcement disabled, it continues to function exactly as before with 100% backward compatibility.

*العربية:*
نقوم بتنفيذ نظام إضافي متوافق تماماً مع الإصدارات السابقة لإدارة سعة المستودعات والحاويات المتعددة:
1. **فرض سعة المستودعات**: تدعم المستودعات حدود سعة اختيارية (`is_capacity_enforced` و `max_capacity_qty`). تفرض عمليات الإضافة والتحويل هذه القيود عند التفعيل.
2. **تخصيص الحاويات المتعددة**: يمكن للأصناف داخل مستند الحركة تخصيص كميات معينة اختيارياً لحاويات أو رفوف محددة (`WarehouseBin`).
3. **المناقلة الداخلية بين الحاويات**: نوفر واجهة برمجية وواجهة مستخدم مخصصة لإجراء حركات النقل والمناقلة الداخلية للمخزون بين الحاويات داخل نفس المستودع.
4. **الحفاظ على التدفق الأساسي**: إذا كان المستودع لا يحتوي على حاويات أو تم إلغاء تفعيل رقابة السعة، فإنه يستمر في العمل تماماً كما كان في السابق بتوافقية بنسبة 100%.

---

## Alternatives Rejected / الحلول البديلة المرفوضة
*English:*
1. **Mandatory Bin Assignment for All Transactions**: Rejected because it forces small warehouses or non-bin environments to define unnecessary bins, breaking backward compatibility and increasing administrative overhead.
2. **Dynamic Auto-Allocation without User Choice**: Rejected because warehouse staff need physical control over which rack or cell they place items in based on safety and physical constraints.

*العربية:*
1. **إلزامية تحديد الحاوية لجميع المعاملات**: مرفوض لأن هذا الحل يجبر المستودعات الصغيرة على تعريف حاويات غير ضرورية، مما يكسر التوافقية الرجعية ويزيد من الأعباء الإدارية.
2. **التخصيص التلقائي الديناميكي دون خيار المستخدم**: مرفوض لأن موظفي المخازن يحتاجون إلى تحكم ملموس في تحديد الرف أو الخلية المادية التي يتم وضع السلع فيها بناءً على اعتبارات السلامة والقيود المادية الفردية.

---

## Impact / التأثير والتبعات
*English:*
- **Backward Compatibility**: 100% preserved. Existing warehouse records, historical documents, and standard transactions continue functioning without modification.
- **Durable Control**: Integrates seamlessly with the append-only ledger and stock movement tables.
- **Enhanced Visual Tracking**: Warehouse and bin utilization cards in the UI dynamically reflect capacity utilization through real-time indicator progress bars.

*العربية:*
- **التوافقية الرجعية**: محفوظة بنسبة 100%. تستمر السجلات الحالية، والمستندات التاريخية، والمعاملات القياسية في العمل دون الحاجة لأي تعديلات.
- **رقابة مستدامة**: يتكامل بسلاسة مع سجل الحركة التراكمي وجداول حركات المخزون.
- **متابعة مرئية محسنة**: تعكس بطاقات المستودعات والحاويات في واجهة المستخدم معدلات الاستهلاك الفعلي ديناميكياً من خلال مؤشرات تقدم ملونة وبسيطة.
