# SEC-AUTH-MATRIX — جرد فرض الصلاحيات على الخادم (الموجة 1 / حزمة 1)

تاريخ: 2026-10-15  
النطاق: إضافة `requirePermission` لمسارات كانت `requireAuth` فقط بدون مجموعة صلاحية، وتوثيق المسارات العامة عمدًا.

## مبدأ

- إخفاء زر في الواجهة لا يكفي. المسار يجب أن يفشل 403 بدون الصلاحية.
- المسارات العامة (تسجيل شركة، login، تجديد جلسة) تبقى عامة مقصودة وتُدرج أدناه.

## ما أُغلق في هذه الحزمة (requireAuth + requirePermission)

| المسار | الصلاحية |
|---|---|
| GET /api/approvals/policies | APPROVAL_POLICY_MANAGE |
| GET /api/approvals/inbox | ENTRY_APPROVE |
| POST /api/approvals/:id/approve | ENTRY_APPROVE |
| POST /api/approvals/:id/reject | ENTRY_APPROVE |
| GET /api/accounting/units | ENTRY_VIEW |
| GET /api/accounting/migration/templates | COMPANY_SETTINGS_MANAGE |
| GET /api/expenses/categories | EXPENSE_SUBMIT |
| GET /api/expenses/requests | EXPENSE_SUBMIT |
| GET /api/expenses/requests/:id | EXPENSE_SUBMIT |
| GET /api/attachments | ENTRY_VIEW |
| POST /api/attachments | ENTRY_CREATE |
| GET /api/master-data/partners | PURCHASE_VIEW |
| GET /api/tenant-modules | COMPANY_SETTINGS_MANAGE |
| GET /api/custom-fields | COMPANY_SETTINGS_MANAGE |
| GET /api/print/:docType/:docId | ENTRY_VIEW |

## مسارات عامة أو خاصة مقصودة (لم تُقفل بهذه الحزمة)

| المسار | السبب |
|---|---|
| POST /api/auth/login · refresh · logout | دورة المصادقة |
| GET /api/auth/me · 2FA setup | بعد الجلسة |
| POST /api/wizard/create-company · tax-rules · activity-templates | تمهيد منصة / معالج |
| GET /api/tenants | قائمة مستأجرين للتمهيد (يُراجع في ORG لاحقًا) |
| GET /api/internal/* | بطاريات تطوير |
| POST /api/accounting/fuzz-test | أداة تطوير |
| GET /api/calendar | مرشّح لـ ENTRY_VIEW لاحقًا |
| POST /api/invitations/accept | قبول دعوة برمز |

## متابعة موجة 1

- AN-SEC-SESSION-PASSWORD — كلمات السر والجلسات
- AN-SEC-USER-ADMIN — إدارة المستخدمين والتفويض
- مراجعة /api/tenants و wizard تحت PLATFORM_ADMIN في الإنتاج
