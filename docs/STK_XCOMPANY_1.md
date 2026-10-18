# STK-XCOMPANY-1 — تحويل مخزون بين شركات المجموعة

## القاعدة
- المصدر والوجهة عضوان في نفس `CompanyGroup`.
- كود الصنف موجود كـ `StockItem` في كل شركة (عبر نشر المجموعة).
- الحالات: REQUESTED → IN_TRANSIT (صرف من المصدر) → RECEIVED (توريد للوجهة).
- دفاتر منفصلة: صرف في tenant المصدر وتوريد في tenant الوجهة.

## API (منصة)
| مسار | الوظيفة |
|---|---|
| GET `/api/xcompany/transfers` | قائمة |
| POST `/api/xcompany/transfers` | إنشاء REQUESTED |
| POST `/api/xcompany/transfers/:id/dispatch` | صرف + IN_TRANSIT |
| POST `/api/xcompany/transfers/:id/receive` | توريد + RECEIVED |

## حدود
لا موافقة مسبقة، لا إقفال محاسبي للكيان، لا واجهة مستخدم كاملة.
