# SEC-USER-ADMIN — إدارة المستخدمين من المسؤول (الموجة 1 / حزمة 3)

## الموجود سابقًا
- `GET/POST /api/users` مع `USER_MANAGE`
- إنشاء مستخدم بكلمة مؤقتة + `requiresPasswordChange: true`

## ما أُضيف

| المسار | الوظيفة |
|---|---|
| `PATCH /api/users/:id` | تحديث `status` (ACTIVE/INACTIVE) أو `role` / `fullName` / `branchName` — **منع تعطيل النفس** — عند INACTIVE تُنهى كل الجلسات |
| `POST /api/users/:id/reset-password` | كلمة مؤقتة تُعرض مرة واحدة + `requiresPasswordChange` + إنهاء الجلسات |
| `POST /api/users/:id/revoke-sessions` | إنهاء كل جلسات المستخدم |
| `GET /api/users` | يعرض أيضًا `status` و `requiresPasswordChange` |

كل المسارات: `requireAuth` + `requirePermission('USER_MANAGE')` + عزل `tenantId`.

## خارج النطاق
- واجهة مستخدم كاملة (API جاهز)
- PLATFORM_ADMIN عبر الشركات
- سياسات تعقيد كلمة مرور أبعد من 12 حرفًا (في SESSION-PASSWORD)
