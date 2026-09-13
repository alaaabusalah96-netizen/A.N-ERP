/**
 * @file MongoDBSmokeAdapter.ts
 * @description MongoDB Storage Adapter for A.N ERP (Phase 0 Smoke Test)
 * Uses official 'mongodb' library (MongoClient).
 * Reads connection string from process.env.MONGO_URL.
 */

import { MongoClient } from 'mongodb';
import { SmokeTestResult } from './MySQLSmokeAdapter';

export class MongoDBSmokeAdapter {
  readonly adapterName = 'MongoDB Adapter';

  constructor(private readonly connectionUrl?: string) {}

  /**
   * Smoke Test Routine:
   * 1. Check MONGO_URL from environment.
   * 2. Attempt live connection via official mongodb driver.
   * 3. Write 1 sample document to an_smoke_test collection.
   * 4. Read document back and verify identity.
   * 5. Return explicit Pass/Fail with diagnostic summary.
   */
  public async runSmokeTest(): Promise<SmokeTestResult> {
    const envUrl = this.connectionUrl || process.env.MONGO_URL;
    if (!envUrl) {
      return {
        adapter: this.adapterName,
        passed: false,
        message: 'متغير البيئة MONGO_URL غير متوفر في بيئة التشغيل.',
        missingSecrets: ['MONGO_URL'],
      };
    }

    let client: MongoClient | null = null;
    try {
      client = new MongoClient(envUrl, { serverSelectionTimeoutMS: 5000 });
      await client.connect();

      const db = client.db('an_erp');
      const collection = db.collection('an_smoke_test');

      const testId = `smoke-mongo-${Date.now()}`;
      const payload = 'A.N ERP MongoDB Smoke Verification';

      // Write test document
      await collection.insertOne({
        _id: testId as any,
        payload,
        testedAt: new Date(),
      });

      // Read test document
      const doc = await collection.findOne({ _id: testId as any });

      if (doc && doc.payload === payload) {
        return {
          adapter: this.adapterName,
          passed: true,
          message: 'نجح اختبار Smoke Test لـ MongoDB بنجاح: تم الاتصال، إدراج المستند، وقراءته بدقة.',
          evidence: { testId, payloadReceived: doc.payload },
        };
      } else {
        return {
          adapter: this.adapterName,
          passed: false,
          message: 'فشل اختبار Smoke Test: المستند المسترجع من MongoDB لا يطابق القيمة.',
        };
      }
    } catch (err: any) {
      return {
        adapter: this.adapterName,
        passed: false,
        message: 'فشل الاتصال بقاعدة بيانات MongoDB عبر المكتبة الرسمية.',
        error: err.message,
      };
    } finally {
      if (client) {
        try {
          await client.close();
        } catch {
          // Ignored
        }
      }
    }
  }
}
