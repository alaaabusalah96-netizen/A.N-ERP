# SEC-PERM-OVERRIDE-1 — صلاحيات فردية + تضييق مدير النظام الداخلي

## 1) hasPermission / requirePermission

- المصدر: **دور المصفوفة** ∪ **`user.permissions[]`** (إضافة فقط، لا حذف من الدور).
- `requireAuth` يحمّل `permissions` إلى `authContext`.
- `requirePermission` يستخدم `authHasPermission`.

## 2) أدوار admin / system_admin (مدير نظام داخلي)

بدون عمليات مالية/مخزون افتراضيًا:

- USER_MANAGE, COMPANY_SETTINGS_MANAGE, AUDIT_LOG_VIEW, SYSTEM_HEALTH_VIEW
- APPROVAL_POLICY_MANAGE, PASSWORD_CHANGE_SELF, BREAK_GLASS_AUTHORIZE

`super_admin` يبقى كامل الصلاحيات التشغيلية + PLATFORM_ADMIN.

## 3) منح فردي عبر PATCH /api/users/:id

```json
{ "permissions": ["STOCK_VIEW", "PASSWORD_CHANGE_SELF"] }
```

قيود:

- لا تعديل صلاحيات **نفسك**
- كل مفتاح يجب أن يكون PermissionGroup معروف
- المانح لا يمنح ما لا يملكه (إلا super_admin)
- PLATFORM_ADMIN فقط إن كان المانح يملكها
- عزل tenant كما في باقي المسارات

## 4) خارج النطاق

- واجهة UI كاملة لمنح الصلاحيات (API جاهز)
- إعادة تصميم كل أدوار accountant/warehouse
