# MASTER-ITEM-GROUP-1 — صنف موحّد للمجموعة

## المشكلة
بعد وجود `CompanyGroup` يلزم كود صنف واحد على مستوى المجموعة مع بقاء الرصيد والتكلفة لكل شركة.

## النموذج
`GroupMasterItem`: groupId, itemCode (فريد داخل المجموعة), nameAr, category, uom, status  
لا يخزّن كمية.

## API (منصة)
| مسار | الوظيفة |
|---|---|
| GET `/api/groups/:id/items` | قائمة أصناف المجموعة |
| POST `/api/groups/:id/items` | إنشاء صنف مجموعة |
| POST `/api/groups/:id/items/:itemId/publish` | إنشاء بطاقة `StockItem` صفرية لكل عضو لا يملك نفس الكود |

## حدود
لا تحويل بين شركات، لا مزامنة تكلفة، لا واجهة مستخدم كاملة.
