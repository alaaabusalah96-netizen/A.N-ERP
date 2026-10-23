# Cash Custody Management System - Deployment & ERP Architecture Guide

This enterprise ERP Cash Custody Management System is built using a secure full-stack architecture powered by Express, React (Vite), and Google Firebase (Firestore & Authentication).

To deploy and run this application in development or production with the live **Firebase / Firestore** backend (`custodyflow`), follow this guide.

---

## 📁 1. Project Folder Structure

The application separates models, backend API routes, database helpers, layout frameworks, and view components:

```text
├── /firestore.rules         # Security rules for Firestore collections
├── /firebase-applet-config.json # Firebase project configuration & rules deployment metadata
├── /DEPLOYMENT.md           # This comprehensive guide
├── /metadata.json           # Application title, permissions, and major capabilities
├── /package.json            # NPM scripts (dev, build, start), dependencies
├── /server.ts               # Express full-stack server & Firebase Admin / Auth API proxy
├── /vite.config.ts          # Vite bundler options
├── /src
│   ├── main.tsx             # DOM entry point
│   ├── firebase.ts          # Client Firebase initialization & Firestore SDK listeners
│   ├── index.css            # Global stylesheet with Tailwind CSS definitions
│   ├── types.ts             # Global TypeScript interfaces and bilingual dictionaries
│   ├── App.tsx              # Main controller state, authentication gates, and sub-view dispatcher
│   ├── components
│   │   ├── Layout.tsx       # Master layout frame (bilinguality, dark mode, responsive sidebar)
│   │   └── OfflineSyncIndicator.tsx # Network state banner (alerts user if offline)
│   └── db
│       ├── offlineQueue.ts  # Online-only sync engine (rejects offline writes)
│       ├── transactions.create.ts # Expense creation engine
│       ├── transactions.update.ts # Expense update engine
│       └── users.ts         # User management engine
```

---

## 🗄️ 2. Firebase & Firestore Backend Architecture

The application uses Google Cloud Firestore for persistent storage and Firebase Authentication for identity management.

### 2.1 Firebase Configuration & Project Scope
All database operations across client and server strictly target the dedicated Firebase project:
- **Project ID**: `custodyflow`
- **Auth Domain**: `custodyflow.firebaseapp.com`
- **Storage Bucket**: `custodyflow.firebasestorage.app`
- **Sandbox Database ID**: `ai-studio-custodyflow-b2f42bf6-7a6a-43a4-9986-3d46405d5ebe`

### 2.2 Client-Side Initialization (`src/firebase.ts`)
Client components initialize Firebase using standard SDK bindings:
```typescript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "<القيمة الفعلية موجودة في src/firebase.ts — لا تُكتب هنا>",
  authDomain: "custodyflow.firebaseapp.com",
  projectId: "custodyflow",
  storageBucket: "custodyflow.firebasestorage.app",
  messagingSenderId: "88602135716",
  appId: "1:88602135716:web:b77559202f5e9f233d6a31",
  measurementId: "G-4W5S4CETH1"
};

const app = initializeApp(firebaseConfig);
const DATABASE_ID = "ai-studio-custodyflow-b2f42bf6-7a6a-43a4-9986-3d46405d5ebe";
export const db = initializeFirestore(app, { experimentalForceLongPolling: true }, DATABASE_ID);
export const auth = getAuth(app);
```

### 2.3 Server-Side Express API & Admin Proxy (`server.ts`)
Backend API routes run via Express on port `3000` (binding to `0.0.0.0`). The server uses `firebase-admin` to manage credentials securely in the `user_credentials` vault and proxies authentication logic.

---

## 🛡️ 3. Deploying Firestore Security Rules

Collection access control is strictly enforced in `firestore.rules`.

### 3.1 Role-Based Access Control
System Administration access in `firestore.rules` is strictly role-based:
```cel
function isSystemAdmin() {
  return isLoggedIn() && (
    exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'SystemAdmin'
  );
}
```

### 3.2 Deploying Security Rules
Deploy updated `firestore.rules` using the Firebase CLI or workspace deployment tool:
```bash
firebase deploy --only firestore:rules --project custodyflow
```

---

## 🚀 4. Production Build & Execution Flow

The system uses `tsx` for local development and `esbuild` for bundling `server.ts` into a CommonJS production file (`dist/server.cjs`).

### 4.1 Development
To start the development server on port 3000:
```bash
npm run dev
```

### 4.2 Production Build & Launch
To compile the static frontend assets and bundle the backend server:
```bash
# Build Vite frontend and bundle server.ts with esbuild
npm run build

# Start production server
npm start
```

---

## 🌐 5. Strict Online Requirement & Data Integrity

1. **Strict Online Writes**: All document creates, updates, deletes, and voucher number generation require an active internet connection. Offline writes are strictly blocked to prevent document numbering collisions or unverified transactions.
2. **Audit & Traceability**: Every transaction update logs an append-only entry in `transaction_history` and `audit_logs`.
3. **Bilingual & Multi-Tenant Support**: Full Arabic / English support with tenant isolation enforced per company/branch.

