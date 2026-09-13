# كتالوج أحداث المجال — A.N ERP (Domain Events Catalog)

وثيقة معيارية تصف أحداث النطاق (Domain Events) لنظام **A.N ERP v7.1** وفق متطلبات المرحلة الأولى (Phase 1) والتوثيق الحي (بند 12).

---

## 1. المبادئ العامة للأحداث

1. **الذرية والاستمرارية:** كل حدث ينبثق عن عملية معتمدة أو إجراء أمني ويحمل `tenantId`، `actorId`، و`timestamp` دقيق.
2. **منع التكرار (Idempotency):** الأحداث الحساسة تحمل `idempotencyKey` لمنع المعالجة المزدوجة لدى المشتركين.
3. **التكامل مع ناقل الأحداث (EventBus):** يتم بث الحدث فور حدوثه محلياً وعلى سجل التدقيق التشغيلي.

---

## 2. قائمة الأحداث المعيارية

### 2.1 `USER_LOGGED_IN`
* **المشغل (Trigger):** تسجيل دخول ناجح لأحد مستخدمي المنشأة.
* **الحمولة (Payload):**
  ```json
  {
    "userId": "USR-001",
    "role": "accountant",
    "ipAddress": "192.168.1.10",
    "deviceType": "Desktop Chrome",
    "location": { "city": "Riyadh", "country": "SA", "lat": 24.7136, "lon": 46.6753 },
    "is2FAUsed": true
  }
  ```

### 2.2 `SECURITY_ALERT_TRIGGERED`
* **المشغل (Trigger):** رصد قفزة جغرافية مستحيلة (Impossible Travel)، أو 5 محاولات دخول فاشلة متتالية، أو محاولة استخدام غير مصرح به.
* **الحمولة (Payload):**
  ```json
  {
    "alertType": "IMPOSSIBLE_TRAVEL",
    "severity": "CRITICAL",
    "details": {
      "distanceKm": 1400,
      "hoursElapsed": 0.2,
      "velocityKmH": 7000,
      "sourceCity": "Riyadh",
      "targetCity": "Cairo"
    }
  }
  ```

### 2.3 `DOCUMENT_POSTED`
* **المشغل (Trigger):** اعتماد وترحيل قيد محاسبي أو سند صرف/قبض نهائياً عبر `PostingEngine`.
* **الحمولة (Payload):**
  ```json
  {
    "documentId": "TX-101",
    "code": "JV-2026-0842",
    "type": "JOURNAL_VOUCHER",
    "totalAmount": 84500.00,
    "currency": "SAR",
    "approvedBy": "USR-002",
    "postedAt": "2026-09-13T10:00:00Z"
  }
  ```

### 2.4 `SOD_CONFLICT_DETECTED`
* **المشغل (Trigger):** محاولة إسناد دورين متضاربين لنفس المستخدم أو محاولة اعتماد المستخدم لسند أنشأه بنفسه.
* **الحمولة (Payload):**
  ```json
  {
    "targetUserId": "USR-001",
    "roleAttempted": "financial_approver",
    "existingRoles": ["accountant"],
    "conflictRule": "POST_AND_APPROVE",
    "rejectionStatus": 409
  }
  ```

### 2.5 `SESSION_REVOKED`
* **المشغل (Trigger):** إنهاء جلسة عن بُعد بواسطة المستخدم أو مسؤول النظام، أو إبطال سلسلة Refresh Token عند رصد إعادة استخدام.
* **الحمولة (Payload):**
  ```json
  {
    "sessionId": "ses-98124",
    "familyId": "fam-4128",
    "revocationReason": "REMOTE_TERMINATION_OR_TOKEN_REUSE"
  }
  ```

### 2.6 `USER_INVITED`
* **المشغل (Trigger):** إنشاء رابط دعوة موقّع لمستخدم جديد.
* **الحمولة (Payload):**
  ```json
  {
    "invitedEmail": "user@company.com",
    "assignedRole": "warehouse_keeper",
    "tokenExpiresAt": "2026-09-15T12:00:00Z"
  }
  ```

### 2.7 `MODULE_ACTIVATED_FOR_TENANT`
* **المشغل (Trigger):** تفعيل وحدة تشغيلية جديدة لشركة المستأجر.
* **الحمولة (Payload):**
  ```json
  {
    "moduleCode": "MOD_WAREHOUSE",
    "moduleTitleAr": "إدارة المخازن والمستودعات",
    "activatedAt": "2026-09-13T12:00:00Z"
  }
  ```
