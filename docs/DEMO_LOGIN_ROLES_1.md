# DEMO-LOGIN-ROLES-1 — أدوار الدخول السريع الموسّعة

## المستأجر
- كما هو: **MAIN** / `tenant-main`
- لا باسورد ثابت في الكود

## كلمة المرور
- كل مستخدمي القائمة السريعة: **`INITIAL_USER_PASSWORD`** (سر البيئة)
- `admin` (SEED) يبقى على **`SEED_ADMIN_PASSWORD`** وليس ضمن الأزرار السريعة

## مستخدمون تشغيليون (بذرة)
| username | role | العربية |
|---|---|---|
| accountant | accountant | محاسب عام |
| approver | financial_approver | معتمد مالي |
| warehouse | warehouse_keeper | أمين مستودع |
| whmanager | warehouse_manager | مدير مستودعات |
| auditor | auditor | مراجع داخلي |
| branch | branch_manager | مدير فرع |
| sales | sales_officer | مسؤول مبيعات |
| sysadmin | system_admin | مدير نظام داخلي |

## واجهة الدخول
- استبدال شبكة الـ3 أزرار بشبكة من الـ8 أدوار أعلاه.
