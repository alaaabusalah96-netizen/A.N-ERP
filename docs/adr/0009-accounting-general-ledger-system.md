# ADR 0009: Enterprise Accounting & Chart of Accounts Ledger System
# قرار التصميم رقم 0009: النظام المحاسبي الموحد وشجرة الحسابات وقيود اليومية

## Status / الحالة
Accepted / مقبول

---

## Context / السياق
*English:*
In an enterprise ERP system, all operational activities that carry financial weight (e.g., cash payouts, stock receiving, expense settlements) must ultimately converge into the financial accounts. Creating separate isolated reporting databases for accounting results in data mismatch, auditing difficulty, and non-compliance with international financial standards (IFRS). A unified, double-entry general ledger system is required to automatically translate real-time operational events into secure Credit/Debit journal entries.

*العربية:*
في أنظمة إدارة موارد المؤسسات (ERP)، يجب أن تلتقي جميع الأنشطة التشغيلية ذات الأثر المالي (مثل صرف النقدية، استلام المخزون، تسوية المصروفات) في الحسابات المالية النهائية للمؤسسة. إن تصميم أنظمة تقارير منفصلة ومتباعدة للحسابات يؤدي إلى تباين الأرقام وصعوبة التدقيق المالي ومخالفة معايير التقارير المالية الدولية (IFRS). يتطلب الأمر نظام قيود يومية مزدوج موحد (Double-Entry Ledger) ليقوم آلياً بترجمة الحركات التشغيلية الفورية إلى قيود دائن/مدين محاسبية آمنة ومترابطة.

---

## Decision / القرار المعماري
*English:*
We implement an additive, fully backward-compatible double-entry General Ledger (GL) system structured as follows:
1. **Chart of Accounts ( شجرة الحسابات )**: Stored with strict company isolation. Standard accounts include:
   - Assets: Cash in Hand (الخزينة النقدية), Inventory Stock (مخزون المستودعات).
   - Liabilities: Accounts Payable (موردين وأوراق دفع).
   - Expenses: Site Operational Expenses (مصروفات تشغيل المواقع), Fuel Expenses (مصروفات الوقود), Administrative Expenses (مصروفات عمومية).
2. **Double-Entry Journal Engine ( محرك قيود اليومية المحاسبية )**:
   - Accepts event envelopes and dynamically creates balanced Journal Entries (`debits` sum must EXACTLY match `credits` sum).
   - **Automated Rules**:
     - *Expense Payout*: Debits Expense Account, Credits Cash Account.
     - *Stock Receipt (Purchase Order received)*: Debits Inventory Stock Account, Credits Accounts Payable (Supplier Account).
3. **General Ledger Ledger / JournalEntries collection**: Secure, append-only historical financial tracking.

*العربية:*
ننفذ نظاماً إضافياً متوافقاً تماماً لإدارة قيود اليومية المزدوجة والحسابات العامة العامة كالتالي:
1. **شجرة الحسابات**: شجرة حسابات قياسية معزولة لكل شركة تشمل:
   - الأصول: النقدية بالصندوق والخزائن، ومخزون السلع والمستودعات.
   - الالتزامات: الموردين والحسابات الدائنة.
   - المصروفات: مصروفات التشغيل الموقعية، ومصروفات الوقود، والمصروفات الإدارية والعمومية.
2. **محرك القيود المزدوجة**:
   - يستقبل أحداث النظام ويصيغ قيود يومية متوازنة تلقائياً (حيث يجب أن يتساوى مجموع حركات المدين تماماً مع مجموع حركات الدائن).
   - **قواعد القيود الآلية**:
     - *عند صرف مصروف*: مدين [حساب المصروف] إلى دائن [حساب النقدية بالخزينة].
     - *عند استلام بضاعة للمستودع*: مدين [حساب مخزون المستودعات] إلى دائن [حساب الموردين/الدائنين].
3. **دفتر الأستاذ والقيود المحاسبية**: سجل غير قابل للتعديل ومستمر لتعقب الحركة المالية والتدقيق والمطابقة.

---

## Impact / التأثير والتبعات
*English:*
- **Real-time Financial Closeness**: No batch-processing required. The moment stock is received or cash is settled, the company's financial status is immediately up-to-date.
- **Strict Integrity Enforcement**: Erroneous or unbalanced transactions are blocked at module level before committing.
- **Consolidated Reporting**: Provides the foundation for Trial Balance, Balance Sheet, and Income Statement analytics in subsequent reporting stages.

*العربية:*
- **التحديث المالي الفوري**: لا حاجة لتجميع القيود يدوياً. بمجرد استلام البضائع أو تصفية العهد النقدية، يتحدث الوضع المالي للشركة والميزانية في نفس اللحظة.
- **فرض توازن حاسم**: يتم منع وحظر أي حركة أو قيد غير متزن بشكل كلي على مستوى محرك المعالجة قبل الحفظ.
- **تحليلات مجمعة متقدمة**: يضع حجر الأساس لإصدار ميزان المراجعة، قائمة الدخل، والميزانية العمومية بشكل لحظي ومستمر.
