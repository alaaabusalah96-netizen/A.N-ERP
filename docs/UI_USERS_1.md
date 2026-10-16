# UI-USERS-1 — إجراءات إدارة المستخدمين في الواجهة

## ما أُضيف في UsersAndSodView
- عمود **الحالة** (نشط/معطّل) وتنبيه «يلزم تغيير كلمة المرور».
- عمود **إجراءات**:
  - تعطيل/تفعيل → `PATCH /api/users/:id` `{ status }`
  - إعادة تعيين كلمة المرور → `POST /api/users/:id/reset-password` (كلمة اختيارية عبر prompt)
  - إنهاء الجلسات → `POST /api/users/:id/revoke-sessions`
- `credentials: 'include'` على جلب القائمة.
- إصلاح حقل `temporaryPassword` في حالة نموذج الإضافة إن كان مفقودًا من الـstate.

## خارج النطاق
- واجهة منح `permissions[]` (تُترك لحزمة لاحقة إن لزم).
- تغيير الدور من الجدول.
