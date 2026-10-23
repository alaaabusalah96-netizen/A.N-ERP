# Baseline Server API & Triggers Documentation (v1.0)
# وثيقة توثيق الخادم والواجهات البرمجية الحالية

This document is part of **Phase 0: Baseline Freeze** for **KEMIT ERP**. It details the back-end API architecture, security parameters, server-side OTP routes, and explains how server triggers are deployed.

---

## 1. Cloud Run Backend Architecture Overview / هيكلية الخادم والخدمات السحابية

Rather than utilizing individual, disconnected Firebase Cloud Functions, KEMIT ERP runs a robust, unified full-stack **custom Node/Express server (`server.ts`)** inside the **Cloud Run** container.

This provides:
- **Centralized Security Enforcement**: Critical password resets, administration logins, SMTP verification, and token checks are evaluated strictly on the secure server side, hiding any API credentials and connection configurations from client browsers.
- **Vite SPA Middleware Support**: The server serves as both the API proxy and the static file provider, serving the Vite production build seamlessly in production environment.
- **Reduced Cold Starts**: Avoids the latency overhead of spawning separate cold functions, handling concurrent operations inside a single, efficient running instance.

---

## 2. Detailed API Endpoints Specification / تفاصيل المسارات البرمجية للخادم

The active API routes are prefixed under `/api/*` and return JSON payloads. No modifications are made to these routes in this phase.

### A. Password Reset Request Route
- **Route**: `POST /api/auth/reset-password/request`
- **Purpose**: Initiates the reset sequence for the official platform admin.
- **Payload**:
  ```json
  {
    "email": "string",
    "securityPin": "string"
  }
  ```
- **Rules & Security**:
  - The email is lowercased and verified strictly to match authorized administrative emails (`alaaabusalah96@gmail.com` or `alaabusalah96@gmail.com`).
  - Verifies the user's secret `security_pin` in Firestore on the server before issuing any OTP.
  - Generates a 6-digit random code and saves it to Firestore collection `password_reset_otps` with a 15-minute expiration time.
  - Returns a standard success response without exposing the generated OTP.

---

### B. Password Reset OTP Verification Route
- **Route**: `POST /api/auth/reset-password/verify`
- **Purpose**: Validates the received verification code.
- **Payload**:
  ```json
  {
    "email": "string",
    "code": "string"
  }
  ```
- **Rules & Security**:
  - Checks if a valid code matches the registered record for the admin's email in `password_reset_otps`.
  - Verifies that the code is within the 15-minute active window.

---

### C. Password Reset Confirmation Route
- **Route**: `POST /api/auth/reset-password/confirm`
- **Purpose**: Applies the new password following verified authentication.
- **Payload**:
  ```json
  {
    "email": "string",
    "code": "string",
    "newPassword": "string"
  }
  ```
- **Rules & Security**:
  - Double-checks the OTP code validity and expiration one more time.
  - Updates all associated profiles under the given email in the Firestore `users` collection with the new password.
  - Automatically deletes the OTP document from `password_reset_otps` upon success to prevent replay attacks.

---

### D. Admin Login OTP Request Route
- **Route**: `POST /api/auth/admin-login/request`
- **Purpose**: Triggers 2-Factor Authentication OTP code when the platform admin logs in.
- **Payload**:
  ```json
  {
    "email": "string",
    "password": "string"
  }
  ```
- **Rules & Security**:
  - Validates the provided credentials against the stored records in Firestore `users`.
  - Generates a 6-digit verification code, stores it in `admin_login_otps` with a 15-minute TTL, and dispatches it via SMTP.

---

### E. Admin Login OTP Verification Route
- **Route**: `POST /api/auth/admin-login/verify`
- **Purpose**: Completes the multi-factor validation for admin dashboard ingress.
- **Payload**:
  ```json
  {
    "email": "string",
    "code": "string"
  }
  ```
- **Rules & Security**:
  - Validates the input code against `admin_login_otps`.
  - Deletes the session OTP record on successful verification.

---

### F. SMTP Integration Status Route
- **Route**: `GET /api/auth/smtp-config`
- **Purpose**: Checks if an active custom outgoing mail system is configured.
- **Response**:
  ```json
  {
    "success": true,
    "configured": true,
    "host": "smtp.gmail.com",
    "user": "ala***@gmail.com"
  }
  ```
- **Rules & Security**:
  - Securely masks the mail username and completely hides the sensitive password.

---

### G. Save SMTP Configurations Route
- **Route**: `POST /api/auth/smtp-config`
- **Purpose**: Saves new SMTP details into the server-side configuration.
- **Payload**:
  ```json
  {
    "adminEmail": "string",
    "adminPassword": "string",
    "securityPin": "string",
    "smtpHost": "string",
    "smtpPort": "string",
    "smtpUser": "string",
    "smtpPass": "string"
  }
  ```
- **Rules & Security**:
  - Verifies the administrator's password and PIN in Firestore.
  - Trims unnecessary whitespace and saves parameters to the `system_config/smtp` Firestore document.

---

### H. Test SMTP Integration Route
- **Route**: `POST /api/auth/smtp-config/test`
- **Purpose**: Tests connection and sends a test email using transient/input configurations.
- **Payload**:
  ```json
  {
    "smtpHost": "string",
    "smtpPort": "string",
    "smtpUser": "string",
    "smtpPass": "string"
  }
  ```
- **Rules & Security**:
  - Attempts to authenticate and send a test HTML/text layout directly to the configured sender.
  - Returns detailed error categorization to help admins debug SMTP credentials, TLS ports, or app passwords.

---

## 3. Passive Firestore Triggers & Client Sync Hooks / مزامنة وتحديث البيانات
Since we are using direct Client-Side Firestore synchronization (implemented in `src/firebase.ts` via `setupFirebaseSync`), any database changes are streamed in real time to the browser's localStorage. 

- **State Propagation**: Changes made on one screen (e.g., Regional Manager approving a voucher) immediately stream to other connected clients in real time, triggering a local `custody_db_updated` event to update the user interface dynamically.
- **Write Actions**: Directly written via the `dbSetDoc` and `dbDeleteDoc` interfaces in `src/firebase.ts` which catch write/delete failures and categorize security rules blocks correctly.
