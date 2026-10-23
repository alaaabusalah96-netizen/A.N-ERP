# Staging & Development Environment Specification (v1.0)
# وثيقة توثيق وإعداد بيئة التطوير والاختبار (Staging)

This document is part of **Phase 0: Baseline Freeze** for **KEMIT ERP**. It outlines the setup of development, staging, and preview environments, assuring complete visual, layout, and database parity before deploying any foundational changes.

---

## 1. Environment Topology / هيكلية وتوزيع بيئات العمل

KEMIT ERP operates on a two-tier sandboxed cloud container architecture:

1. **Development Environment (Development App)**:
   - **Internal URL**: [https://ais-dev-7x5pikth4oictjequidq24-925777775579.europe-west2.run.app](https://ais-dev-7x5pikth4oictjequidq24-925777775579.europe-west2.run.app)
   - **Purpose**: Used for real-time iterative coding, feature validation, and direct workspace compilation checks.
   - **HMR State**: Hot Module Replacement is disabled (`DISABLE_HMR=true`) to avoid layout flickering during progressive code updates. The dev server compiles changes incrementally and reloads upon turn completion.

2. **Staging / Preview Environment (Shared App)**:
   - **Internal URL**: [https://ais-pre-7x5pikth4oictjequidq24-925777775579.europe-west2.run.app](https://ais-pre-7x5pikth4oictjequidq24-925777775579.europe-west2.run.app)
   - **Purpose**: Serves as the pre-deployment mirror. Any candidate change must be fully compiled and visually verified in the shared app iframe or tab before being signed off as completed.

---

## 2. Shared Database Configuration / تهيئة قاعدة البيانات المشتركة

Both development and staging environments target the dedicated Firestore database container:
- **Database ID**: `ai-studio-custodyflow-b2f42bf6-7a6a-43a4-9986-3d46405d5ebe`
- **Project ID**: `refined-garage-5nzsc`

### Seeding Guard / آلية حماية التهيئة التلقائية
To prevent different developers or test runs from constantly overwriting each other's sandbox data, `src/firebase.ts` incorporates a version-controlled seeding guard (`seedDatabaseIfEmpty` function):
- Seeding only runs once when the document `system_meta/seed_status_v7` is absent.
- It force-clears and re-seeds active structural models (including regions, stations, corporate parameters, default users) to establish a clean test state.
- Upon completion, the status is committed, preventing subsequent app visits from overwriting operational test logs or client entries.

---

## 3. Environment Parity Verification Checklist / قائمة التحقق للتطابق التام

To confirm that the staging app replicates production behavior 100%, the following elements are verified in both views:

- [x] **Network Port Bindings**: The development server strictly binds to Host `0.0.0.0` and Port `3000` to comply with ingress rules.
- [x] **Security Rules Parity**: Security configurations in `firestore.rules` are tested to verify that unauthorized roles cannot modify protected cash logs or company configurations.
- [x] **Email Dispatch System**: Nodemailer SMTP handles OTP dispatch on both development and staging, reading from the `system_config/smtp` Firestore document.
- [x] **Bilingual Support (Arabic/English)**: Direct local translation maps verify that directionality is handled properly (`rtl` for Arabic, `ltr` for English).
