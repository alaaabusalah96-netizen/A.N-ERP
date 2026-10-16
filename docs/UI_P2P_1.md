# UI-P2P-1 — مطابقة واعتماد فواتير الموردين

## في تبويب فواتير المشتريات
| زر | API | صلاحية الخادم |
|---|---|---|
| مطابقة | POST /api/purchasing/invoices/:id/match | PURCHASE_MANAGE |
| اعتماد | POST /api/purchasing/invoices/:id/approve | SUPPLIER_INVOICE_APPROVE |
| رفض | POST /api/purchasing/invoices/:id/reject | (نفس مسار الرفض على الخادم) |

يستخدم `postJson` + Idempotency-Key الموجودين في الشاشة. لا منطق خادم جديد.
