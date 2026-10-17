# ORG-MEMBERSHIP-1 — عضوية المستخدم في الشركة

## الهدف (موجة 2)
ربط حالة **العضوية** بحساب المستخدم داخل نفس المستأجر (`tenantId`)، مع واجهة إدارة.

## API
| مسار | صلاحية | الوظيفة |
|---|---|---|
| GET `/api/users/:id/membership` | USER_MANAGE | قراءة سياق العضوية |
| PATCH `/api/users/:id/membership` | USER_MANAGE | ACTIVE \| SUSPENDED \| REVOKED |
| PATCH `/api/users/:id` (status) | USER_MANAGE | يزامن العضوية: INACTIVE→SUSPENDED، ACTIVE→ACTIVE |

## قواعد
- لا يعلّق المستخدم عضويته بنفسه.
- تعليق العضوية ينهي الجلسات عند SUSPENDED.
- الدخول ما زال يفرض `getMembershipContext` بحالة ACTIVE.

## واجهة
UsersAndSodView: زر «تعليق عضوية / تفعيل عضوية».
