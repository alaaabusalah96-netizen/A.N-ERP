# Data Dictionary (v1.0)
# قاموس مصطلحات وبيانات النظام الموحد

This dictionary serves as the single source of truth for technical field mappings and business definitions inside **KEMIT ERP**.

---

## 1. Core Corporate Metrics / المعايير والبيانات الأساسية للشركات

### Tenant Company / الشركة المستأجرة
- **Technical Field Name**: `company_id` / `company_name`
- **Definition**: The specific enterprise account or subscription profile containing isolated organizational metadata and data logs.
- **التعريف بالعربية**: الحساب المؤسسي الفريد للشركة المستأجرة للنظام والذي يحتوي على بيانات مستخدميها وعملياتها المعزولة.

### Custody Base / رصيد العهدة الأساسي للشركة
- **Technical Field Name**: `custody_value`
- **Definition**: The fixed nominal threshold representing the total allocated operating fund of a company or branch custody pool.
- **التعريف بالعربية**: القيمة الاسمية المحددة التي تمثل الحد الأقصى لصندوق العهدة الإجمالي المخصص للشركة أو الفرع.

---

## 2. Geographical and Structural Models / الهيكل الإداري والجغرافي

### Region / المنطقة الجغرافية
- **Technical Field Name**: `region_id` / `region_name`
- **Definition**: Geographical groupings to categorize branches (stations) for simplified managerial oversight and localized reports.
- **التعريف بالعربية**: التقسيم الجغرافي الذي تتبعه مجموعة من الفروع لتسهيل إسناد الصلاحيات الإشرافية والتقارير الإقليمية.

### Custody Station / محطة العهدة (الفرع)
- **Technical Field Name**: `station_id` / `station_name` / `station_code`
- **Definition**: A physical or virtual branch of a company containing its own local cash custody balance.
- **التعريف بالعربية**: فرع مالي أو موقع فعلي تابع للشركة يملك رصيد عهدة مالية خاص به تحت إشراف أمين عهدة.

### Custody Balance / رصيد عهدة المحطة الحالي
- **Technical Field Name**: `custody_amount`
- **Definition**: The current active liquid cash balance physically remaining in the custody of a branch/station.
- **التعريف بالعربية**: الرصيد المالي السائل الفعلي المتبقي في صندوق الفرع عهدة الموظف المسؤول في اللحظة الحالية.

---

## 3. Operations & Financial Models / العمليات والحركات المالية

### Expense / المصروف الفعلي
- **Technical Field Name**: `amount` / `description` / `category_id`
- **Definition**: A detailed business expenditure recorded locally by a station administrator, pending approval.
- **التعريف بالعربية**: مستند إثبات دفع أو صرف نقدي يسجله أمين العهدة بالفرع لغرض تجاري وبانتظار الموافقة والتصفية.

### Cash Voucher / سند الصرف والتحصيل والتصفية
- **Technical Field Name**: `voucher_no` / `recipient_name` / `expense_ids`
- **Definition**: A formal financial transaction document containing multiple aggregated expenses used to verify cash settlements or custody fund replenishment.
- **التعريف بالعربية**: سند مالي رسمي يجمع مجموعة مصروفات معتمدة لإثبات تصفية العهدة وإعادة تغذيتها بالصندوق.

---

## 4. Users and Privileges / المستخدمين ومستويات الأمان

### User Role / دور الموظف بالنظام
- **Technical Field Name**: `role`
- **Definition**: System administration levels defining base views and menus accessible to the user (`SystemAdmin`, `Admin`, `RegionalManager`, `StationAdmin`).
- **التعريف بالعربية**: الرتبة والمسؤولية الإدارية المسندة للمستخدم في النظام والتي تحدد القوائم والصفحات المتاحة له.

### System Permissions / الصلاحيات الدقيقة
- **Technical Field Name**: `permissions`
- **Definition**: Specific boolean toggles determining fine-grained document actions like creating/deleting expenses or approving payment vouchers.
- **التعريف بالعربية**: حقول تحديد الصلاحيات الفرعية والدقيقة لكل دور أو حساب (مثل إضافة مصروف أو الموافقة على مستند).
