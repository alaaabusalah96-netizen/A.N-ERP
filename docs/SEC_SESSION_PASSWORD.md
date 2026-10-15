# SEC-SESSION-PASSWORD — كلمات السر والجلسات (الموجة 1 / حزمة 2)

## السلوك

1. **`requiresPasswordChange` على المستخدم**
   - يظهر في استجابة login و `/api/auth/me`.
   - عند تفعيله: `requireAuth` يسمح فقط بـ:
     - `/api/auth/me`
     - `/api/auth/change-password`
     - `/api/auth/logout`
     - `/api/auth/sessions`
     - `/api/auth/sessions/revoke-others`
     - `/api/auth/refresh`
   - أي مسار آخر → **403** `PASSWORD_CHANGE_REQUIRED`.

2. **POST `/api/auth/change-password`**
   - يتطلب جلسة.
   - `currentPassword` + `newPassword` (الحد الأدنى 12 حرفًا، مختلفة عن الحالية).
   - تحقق argon2id من الحالية، ثم hash الجديدة و`requiresPasswordChange: false`.

3. **GET `/api/auth/sessions`**
   - جلسات المستخدم النشطة مع علامة `isCurrent`.

4. **POST `/api/auth/sessions/revoke-others`**
   - إنهاء كل الجلسات عدا الجلسة الحالية.

## خارج النطاق (لاحقًا USER-ADMIN)

- إعادة تعيين كلمة مرور بواسطة المسؤول.
- سياسات تعقيد أقوى من الطول 12.
- واجهة مستخدم لشاشة الإجبار (API جاهز للربط).
