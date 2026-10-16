# SEC-PASSWORD-UX-1 — شاشة إجبار تغيير كلمة المرور + كلمة مؤقتة من المسؤول

## السلوك

1. **واجهة**
   - بعد login أو `/api/auth/me` إذا `requiresPasswordChange` → شاشة `ForcePasswordChangeScreen` فقط (لا Sidebar ولا باقي التطبيق).
   - بعد نجاح `POST /api/auth/change-password` يُرفع العلم محليًا ويُفتح التطبيق.

2. **خادم**
   - تغيير كلمة المرور **الإجباري** (العلم true): مسموح بدون `PASSWORD_CHANGE_SELF`.
   - التغيير **الذاتي لاحقًا**: يتطلب صلاحية `PASSWORD_CHANGE_SELF` (غير ممنوحة افتراضيًا لأي دور تشغيلي).
   - إنشاء/إعادة تعيين مستخدم: حقل اختياري `temporaryPassword` من المسؤول (≥12) وإلا توليد تلقائي.

3. **صلاحية جديدة**
   - `PASSWORD_CHANGE_SELF` في `PermissionGroup` — **لا تُضاف تلقائيًا** لمصفوفة الأدوار التشغيلية في هذه الحزمة (المنح الفردي في الدفعة B).
