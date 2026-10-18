# ORG-GROUP-1 — مجموعة الشركات

## المشكلة
لا يوجد كيان يربط عدة شركات قانونية (tenants) تحت مجموعة واحدة — مطلوب قبل الأصناف الموحّدة والتحويل بين الشركات.

## النموذج
`CompanyGroup`: id, code, nameAr, nameEn?, status, memberTenantIds[], createdAt/updatedAt  
الأعضاء = `tenant.id` لشركات مسجّلة فقط.

## API (منصة فقط — `requirePlatformAdmin`)
| مسار | الوظيفة |
|---|---|
| GET `/api/groups` | قائمة المجموعات |
| POST `/api/groups` | إنشاء (code + nameAr) |
| GET `/api/groups/:id` | تفاصيل |
| POST `/api/groups/:id/members` | إضافة شركة `{ tenantId }` |
| DELETE `/api/groups/:id/members/:tenantId` | إزالة عضو |

## التخزين
`listCompanyGroups` / `getCompanyGroup` / `saveCompanyGroup` على StoragePort؛ تنفيذ كامل في InMemory؛ بقية المحولات تُرجع قائمة فارغة/حفظ شكلي حتى موجات لاحقة.

## خارج النطاق
صنف موحّد للمجموعة، تحويل مخزون بين شركات، واجهة مستخدم كاملة للمجموعات.
