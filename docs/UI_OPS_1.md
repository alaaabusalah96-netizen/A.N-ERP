# UI-OPS-1 — صندوق الاعتمادات + إصلاح المعاملة السريعة

## 1) المعاملة السريعة (P23)
- `TransactionModal` يمرّر أسطر القيد مع الحفظ.
- `App.handleSaveTransaction` يستدعي **`POST /api/transactions/post`** مع `{ entry, idempotencyKey }` بدل المسار غير الموجود `POST /api/transactions`.
- يتطلب صلاحية `ENTRY_POST` (سلوك الخادم الحالي: مسودة ثم ترحيل).

## 2) مركز الاعتمادات (P13)
- عند `activeSection === 'approvals'`: جلب **`GET /api/approvals/inbox`**.
- أزرار اعتماد/رفض → `POST /api/approvals/:id/approve|reject` مع Idempotency-Key.

## خارج النطاق
- سياسات الاعتماد UI، طباعة موحدة، مطابقة المشتريات.
