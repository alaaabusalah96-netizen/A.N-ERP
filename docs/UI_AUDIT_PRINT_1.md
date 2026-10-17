# UI-AUDIT-PRINT-1 — فحص سلسلة التدقيق + طباعة رسمية

## 1) AuditTrailView
- زر **فحص سلامة السلسلة** → `POST /api/audit-chain/verify`
- عرض نتيجة isValid / messageAr / عدد السجلات
- `credentials: 'include'` على `GET /api/audit-trail`

## 2) PrintVoucherModal
- زر **طباعة رسمية (خادم)** → `GET /api/print/journal-entry/:id?format=raw` ثم نافذة وطباعة
- الإبقاء على **طباعة معاينة محلية** (`window.print`) كاحتياطي

## خارج النطاق
- طباعة كل أنواع المستندات من كل الشاشات
- تعطيل 2FA
