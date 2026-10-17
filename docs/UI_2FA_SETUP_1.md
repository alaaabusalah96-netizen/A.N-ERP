# UI-2FA-SETUP-1 — تفعيل التحقق الثنائي من الملف الشخصي

## السلوك
- إن لم يكن 2FA مفعّلاً: زر «تفعيل التحقق الثنائي» → `POST /api/auth/2fa/setup` (QR + secret).
- إدخال الرمز → `POST /api/auth/2fa/verify-setup` `{ token }`.
- إن كان مفعّلاً: عرض حالة «مفعّل» فقط (لا تعطيل في هذه الحزمة).

## جلسات الملف الشخصي
- جلب الجلسات من **`GET /api/auth/sessions`** (جلسة المستخدم) بدل `/api/sessions` الذي يتطلب USER_MANAGE.
- زر إنهاء الجلسات الأخرى → `POST /api/auth/sessions/revoke-others`.
