# ORG-COMPANY-1 — الشركة القانونية (TenantCompany)

## النموذج المعتمد في الشجرة

| المفهوم | في الكود |
|---|---|
| الشركة القانونية | `TenantCompany` / `CompanyProfile` |
| المعرف | `tenant.id` = سياق الجلسة `authContext.tenantId` |
| الحالة | `ACTIVE` \| `SUSPENDED` |
| الحقول القانونية | `nameAr`, `nameEn`, `code`, `crNumber`, `taxNumber`, `baseCurrency`, `country` |
| البنية التحتية | `backendConfig` — **لا تُعاد لواجهات المستخدم** |

**لا يوجد بعد** كيان `CompanyGroup` — المجموعة موجة 4.

## واجهات هذه الحزمة

| المسار | من | الوظيفة |
|---|---|---|
| GET `/api/company` | جلسة | ملف قانوني **بدون** `backendConfig` |
| PUT `/api/company` | `COMPANY_SETTINGS_MANAGE` | تحديث الاسم/السجل/الضريبة… + تحقق CR (10 أرقام) وضريبة (15) |
| GET `/api/tenants` | منصة | قائمة الشركات |
| POST `/api/wizard/create-company` | منصة | إنشاء شركة |
| PATCH `/api/tenants/:id/status` | منصة | ACTIVE / SUSPENDED |

## بوابة الموجة 2 (لاحقاً MEMBERSHIP)

المستخدم يرى بيانات شركته فقط عبر `tenantId` في التوكن؛ العضوية `getMembershipContext` تفرض ACTIVE.
