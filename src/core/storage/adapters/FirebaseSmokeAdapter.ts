/**
 * @file FirebaseSmokeAdapter.ts
 * @description Firebase / Firestore Storage Adapter for A.N ERP (Phase 0 Smoke Test)
 * Uses official 'firebase-admin' library on server side only.
 * Credentials read strictly from process.env.FIREBASE_SERVICE_ACCOUNT_JSON.
 */

import { initializeApp, cert, App, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { SmokeTestResult } from './MySQLSmokeAdapter';

export class FirebaseSmokeAdapter {
  readonly adapterName = 'Firebase / Firestore Adapter';
  private app: App | null = null;

  /**
   * Smoke Test Routine:
   * 1. Check FIREBASE_SERVICE_ACCOUNT_JSON from environment.
   * 2. Initialize official firebase-admin app lazily.
   * 3. Write 1 sample document to an_smoke_test collection in Firestore.
   * 4. Read document back and verify identity.
   * 5. Return explicit Pass/Fail with diagnostic summary.
   */
  public async runSmokeTest(): Promise<SmokeTestResult> {
    const credEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!credEnv) {
      return {
        adapter: this.adapterName,
        passed: false,
        message: 'متغير البيئة FIREBASE_SERVICE_ACCOUNT_JSON غير متوفر في بيئة التشغيل.',
        missingSecrets: ['FIREBASE_SERVICE_ACCOUNT_JSON'],
      };
    }

    try {
      let serviceAccount: any;
      try {
        serviceAccount = JSON.parse(credEnv);
      } catch (parseErr: any) {
        return {
          adapter: this.adapterName,
          passed: false,
          message: 'صيغة بيانات الاعتماد FIREBASE_SERVICE_ACCOUNT_JSON غير صالحة (ليست JSON سليم).',
          error: parseErr.message,
        };
      }

      const appName = `an-erp-smoke-${Date.now()}`;
      this.app = initializeApp(
        {
          credential: cert(serviceAccount),
        },
        appName
      );

      const db = getFirestore(this.app);
      const testId = `smoke-firebase-${Date.now()}`;
      const payload = 'A.N ERP Firestore Smoke Verification';

      const docRef = db.collection('an_smoke_test').doc(testId);

      // Write test document
      await docRef.set({
        id: testId,
        payload,
        testedAt: FieldValue.serverTimestamp(),
      });

      // Read test document
      const snapshot = await docRef.get();
      const data = snapshot.data();

      // Clean up test app instance
      await deleteApp(this.app);
      this.app = null;

      if (snapshot.exists && data && data.payload === payload) {
        return {
          adapter: this.adapterName,
          passed: true,
          message: 'نجح اختبار Smoke Test لـ Firebase / Firestore بنجاح: تم التوثيق والكتابة والقراءة بمطابقة تامة.',
          evidence: { testId, payloadReceived: data.payload },
        };
      } else {
        return {
          adapter: this.adapterName,
          passed: false,
          message: 'فشل اختبار Smoke Test: المستند المقروء من Firestore غير مطابق.',
        };
      }
    } catch (err: any) {
      if (this.app) {
        try {
          await deleteApp(this.app);
          this.app = null;
        } catch {
          // Ignored
        }
      }
      return {
        adapter: this.adapterName,
        passed: false,
        message: 'فشل الاتصال بـ Firebase / Firestore عبر firebase-admin.',
        error: err.message,
      };
    }
  }
}
