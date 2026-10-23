# ADR 0012: Company Industry-Based Module Filtering — Gap & Current Architecture
# قرار التصميم رقم 0012: فلترة الوحدات البرمجية حسب نشاط الشركة (Industry) — توثيق الفجوة والمعمارية الحالية

## Status / الحالة
Documented / Gap Deferred (موثق / فجوة مؤجلة)

---

## Context / السياق
*English:*
KEMIT ERP supports multi-tenant operations with diverse organizational profiles across industries (e.g., General Commerce, Food & Beverage / Restaurants, Poultry, Construction & Contracting, Transportation & Fleet).
Each company document in the system (`src/types.ts`) includes an optional `industry` property (`'poultry' | 'restaurant' | 'general' | string`) alongside dynamic `modules` settings (`Record<string, CompanyModuleSettings>`).

*العربية:*
يدعم نظام KEMIT ERP تشغيل شركات متعددة الأنشطة والصناعات (مثل التجارة العامة، المطاعم والأغذية، مزارع الدواجن، المقاولات والإنشاءات، النقل وإدارة الأسطول).
يحتوي نموذج بيانات الشركة (`src/types.ts`) على حقل اختياري للنشاط `industry` (`'poultry' | 'restaurant' | 'general' | string`) بالإضافة إلى إعدادات تفعيل الوحدات الديناميكية `modules` (`Record<string, CompanyModuleSettings>`).

---

## Current Architecture Audit / نتائج التدقيق المعماري
*English:*
1. **Existing Module Registry & Settings Flag**:
   - `src/db/modules.ts` defines `ERP_MODULES_REGISTRY` and provides `ModulesModule.isScreenEnabledForCompany(companyId, screenId)` and `ModulesModule.isModuleEnabledForCompany(companyId, moduleId)`.
   - `src/components/Layout.tsx` already integrates module-level visibility filtering via `ModulesModule.isScreenEnabledForCompany(activeUser.company_id, item.id)`.
2. **Absence of Industry-Based Automated Filtering**:
   - There is no automated mapping or enforcement engine that automatically restricts, derives, or filters accessible ERP modules based on `company.industry`.
   - Currently, module enablement is governed purely through the manual subscription plan and explicit module toggles configured via the SaaS Super Admin and Company Settings centers.

*العربية:*
1. **سجل الوحدات البرمجية القائم (Module Registry & Settings)**:
   - يحدد ملف `src/db/modules.ts` سجل الوحدات `ERP_MODULES_REGISTRY` ويوفر دوال التحقق `ModulesModule.isScreenEnabledForCompany` و`isModuleEnabledForCompany`.
   - يقوم المكون `src/components/Layout.tsx` بالفعل بفلترة عناصر القائمة بناءً على تفعيل الوحدة عبر `ModulesModule.isScreenEnabledForCompany(activeUser.company_id, item.id)`.
2. **غياب الفلترة التلقائية المبنية على النشاط (Industry-Based)**:
   - لا يوجد محرك ربط تلقائي أو قواعد إجبارية تقوم بتحديد أو حظر وحدات النظام بناءً على قيمة حقل `company.industry`.
   - تفعيل الوحدات حالياً يعتمد كلياً على باقة الاشتراك والتفعيل اليدوي للوحدات عبر لوحة تحكم الساس وإعدادات الشركة.

---

## Decision & Future Recommendations / القرار والتوصيات
*English:*
- **Preserve Additive Safety (Rule 3 & 11)**: Do not inject implicit industry restrictions into the runtime navigation pipeline during remediation, as doing so could inadvertently hide valid modules from active companies with custom configurations.
- **Future Milestone**: When formal industry presets are introduced, implement an industry-to-module template recommender within the onboarding / company-provisioning flow without breaking existing company-level module overrides.

*العربية:*
- **الحفاظ على استقرار النظام (Rule 3 & 11)**: عدم فرض قيود تلقائية على التنقل بناءً على النشاط أثناء مرحلة المعالجة الحالية، لتجنب حجب أي شاشات أو وحدات مفعلة حالياً للشركات القائمة.
- **التوصيات المستقبلية**: عند اعتماد قوالب الأنشطة المتقدمة، يتم تطبيق معالج اقتراح الوحدات التلقائي أثناء معالج إنشاء الشركة مع الاحتفاظ بإمكانية التخصيص اليدوي.
