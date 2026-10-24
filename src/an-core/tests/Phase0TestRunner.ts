/**
 * @file Phase0TestRunner.ts
 * @description Comprehensive Battery & Smoke Test Execution Engine for Phase 0
 * Runs Full Battery on Primary (PostgreSQL/Supabase)
 * Runs Smoke Tests on MySQL, MongoDB, Firebase
 * Logs official Phase 0 closure entry into SystemChangeLog
 */

import { PostgresPrimaryAdapter } from '../storage/adapters/PostgresPrimaryAdapter';
import { MySQLSmokeAdapter, SmokeTestResult } from '../storage/adapters/MySQLSmokeAdapter';
import { MongoDBSmokeAdapter } from '../storage/adapters/MongoDBSmokeAdapter';
import { FirebaseSmokeAdapter } from '../storage/adapters/FirebaseSmokeAdapter';
import { InMemoryAdapter } from '../storage/adapters/InMemoryAdapter';
import { PostingEngine } from '../engines/PostingEngine';
import { NumberingEngine } from '../engines/NumberingEngine';
import { ApprovalEngine } from '../engines/ApprovalEngine';
import { JournalEntry, TenantCompany, Account } from '../storage/StoragePort';

export interface BatteryTestStep {
  name: string;
  passed: boolean;
  details: string;
  evidence?: any;
}

export interface Phase0Report {
  timestamp: string;
  primaryAdapter: {
    name: string;
    connected: boolean;
    batteryPassed: boolean;
    steps: BatteryTestStep[];
    persistenceVerified: boolean;
  };
  smokeResults: {
    mysql: SmokeTestResult;
    mongodb: SmokeTestResult;
    firebase: SmokeTestResult;
  };
  inMemoryDeclared: boolean;
  secretsSummary: {
    defined: string[];
    missing: string[];
  };
  systemChangeLogged: boolean;
  verdict: string;
}

export class Phase0TestRunner {
  private postgres = new PostgresPrimaryAdapter();
  private mysql = new MySQLSmokeAdapter();
  private mongodb = new MongoDBSmokeAdapter();
  private firebase = new FirebaseSmokeAdapter();
  private inMemory = new InMemoryAdapter();

  public async runAll(): Promise<Phase0Report> {
    const definedSecrets: string[] = [];
    const missingSecrets: string[] = [];

    const secretKeys = ['DATABASE_URL', 'MYSQL_URL', 'MONGO_URL', 'FIREBASE_SERVICE_ACCOUNT_JSON'];
    for (const key of secretKeys) {
      if (process.env[key] && process.env[key]?.trim() !== '') {
        definedSecrets.push(key);
      } else {
        missingSecrets.push(key);
      }
    }

    // 1. Primary Health & Battery
    const pgHealth = await this.postgres.checkHealth();
    const batterySteps: BatteryTestStep[] = [];
    let batteryPassed = false;
    let persistenceVerified = false;

    if (pgHealth.connected) {
      try {
        // Step A: DDL Schema Init
        const initRes = await this.postgres.initializeSchema();
        batterySteps.push({
          name: 'تهيئة مخطط الجداول Code-First',
          passed: initRes.success,
          details: initRes.success ? 'تم إنشاء كافة الجداول بنجاح' : initRes.error?.detail || 'فشل التهيئة',
        });

        // Step B: Tenant Isolation Test
        const runSuffix = Date.now().toString().slice(-6);
        const tenantA: TenantCompany = {
          id: `ten-p0-a-${runSuffix}`,
          code: `TEST-A-${runSuffix}`,
          nameAr: 'شركة الاختبار الأولى',
          backendConfig: { adapterType: 'postgresql', connectionRef: 'DATABASE_URL', isolationLevel: 'Shared' },
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
        };
        const tenantB: TenantCompany = {
          id: `ten-p0-b-${runSuffix}`,
          code: `TEST-B-${runSuffix}`,
          nameAr: 'شركة الاختبار الثانية',
          backendConfig: { adapterType: 'postgresql', connectionRef: 'DATABASE_URL', isolationLevel: 'Shared' },
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
        };
        await this.postgres.saveTenant(tenantA, `idemp-tenant-a-${runSuffix}`);
        await this.postgres.saveTenant(tenantB, `idemp-tenant-b-${runSuffix}`);

        // Check account isolation
        const accA: Account = {
          code: '101001',
          tenantId: tenantA.id,
          nameAr: 'صندوق شركة أ',
          type: 'ASSET',
          currency: 'SAR',
          debitBalance: 10000,
          creditBalance: 0,
          isActive: true,
        };
        await this.postgres.saveAccount(tenantA.id, accA, 'idemp-acc-a');

        const isolatedQuery = await this.postgres.getAccount(tenantB.id, accA.code);
        const isolationSucceeded = !isolatedQuery.success; // Tenant B cannot see Tenant A's account!
        batterySteps.push({
          name: 'عزل المستأجرين (Tenant Isolation & Boundary Check)',
          passed: isolationSucceeded,
          details: isolationSucceeded
            ? 'نجح العزل: تعذر على المستأجر ب الوصول لحسابات المستأجر أ'
            : 'فشل العزل: المستأجر ب تمكن من قراءة سجلات المستأجر أ',
        });

        // Step C: Posting Engine Atomic Post & Balance Mutation
        const postingEngine = new PostingEngine(this.postgres);
        const numberingEngine = new NumberingEngine(this.postgres);
        const seqRes = await numberingEngine.generateNumber(tenantA.id, 'JV_SEQ', 'JV-2026', 'idemp-seq-1');

        // Create balancing account
        const accExpense: Account = {
          code: '501001',
          tenantId: tenantA.id,
          nameAr: 'مصروفات صيانة تشغيلية',
          type: 'EXPENSE',
          currency: 'SAR',
          debitBalance: 0,
          creditBalance: 0,
          isActive: true,
        };
        await this.postgres.saveAccount(tenantA.id, accExpense, 'idemp-acc-exp');

        const entryId = `ENTRY-${Date.now()}`;
        const testEntry: JournalEntry = {
          id: entryId,
          code: seqRes.data?.formattedCode || `JV-${Date.now()}`,
          tenantId: tenantA.id,
          date: new Date().toISOString().split('T')[0],
          type: 'قيد يومية اختباري',
          description: 'اختبار البطارية الكاملة للترحيل الذري وتوازن الدفاتر',
          lines: [
            {
              id: `${entryId}-L1`,
              accountCode: accExpense.code,
              debit: 5000,
              credit: 0,
              description: 'إثبات مصروف تجريبي',
            },
            {
              id: `${entryId}-L2`,
              accountCode: accA.code,
              debit: 0,
              credit: 5000,
              description: 'صرف من الصندوق',
            },
          ],
          totalAmount: 5000,
          status: 'APPROVED',
          createdBy: 'SYS_TESTER',
        };

        const postKey = `idemp-post-${entryId}`;
        const draftRes = await postingEngine.draftEntry(tenantA.id, testEntry, `idemp-draft-${entryId}`);
        const postRes = await postingEngine.postEntry(tenantA.id, testEntry.id, postKey);

        const postPassed = postRes.success && postRes.data?.status === 'POSTED';
        batterySteps.push({
          name: 'الترحيل الذري عبر PostingEngine وتحديث الأرصدة',
          passed: postPassed,
          details: postPassed ? 'تم ترحيل القيد وتحديث الأرصدة بنجاح' : postRes.error?.detail || 'فشل الترحيل',
        });

        // Step D: Idempotency (same key twice -> no double balance change)
        const rePostRes = await postingEngine.postEntry(tenantA.id, testEntry.id, postKey);
        const accAAfter = await this.postgres.getAccount(tenantA.id, accA.code);
        // Credit should be 5000, not 10000
        const idempotencyPassed = rePostRes.success && accAAfter.data?.creditBalance === 5000;
        batterySteps.push({
          name: 'اختبار منع التكرار (Idempotency Key & Double Spend Protection)',
          passed: idempotencyPassed,
          details: idempotencyPassed
            ? 'نجح التحقق: إعادة نفس المفتاح لم يكرر الأثر المالي على الحساب'
            : 'فشل منع التكرار: تضاعف الأثر المالي',
        });

        // Step E: Persistence Check
        const directVerify = await this.postgres.getJournalEntry(tenantA.id, testEntry.id);
        persistenceVerified = directVerify.success && directVerify.data?.id === testEntry.id;
        batterySteps.push({
          name: 'استمرارية البيانات وبقاؤها المباشر في القاعدة (Persistence)',
          passed: persistenceVerified,
          details: persistenceVerified ? 'تم استرجاع القيد مباشرة ومطابقته' : 'فشل استرجاع السجل من المخزن',
        });

        batteryPassed = batterySteps.every((s) => s.passed);
      } catch (err: any) {
        batterySteps.push({
          name: 'خطأ غير متوقع أثناء تنفيذ البطارية',
          passed: false,
          details: err.message,
        });
      }
    } else {
      batterySteps.push({
        name: 'اتصال PostgreSQL / Supabase',
        passed: false,
        details: pgHealth.message + (pgHealth.error ? ` (${pgHealth.error})` : ''),
      });
    }

    // 2. Smoke Tests
    const mysqlSmoke = await this.mysql.runSmokeTest();
    const mongoSmoke = await this.mongodb.runSmokeTest();
    const firebaseSmoke = await this.firebase.runSmokeTest();

    // 3. SystemChangeLog entry
    let systemChangeLogged = false;
    const changeLogEntry = {
      id: `CHG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'System Architect / Phase 0 Runner',
      changeType: 'PHASE_CLOSURE' as const,
      module: 'STORAGE_CORE',
      entitiesAffected: ['StoragePort', 'PostgreSQL', 'MySQL', 'MongoDB', 'Firebase', 'Engines'],
      summaryAr: 'إغلاق المرحلة 0: اعتماد StoragePort والأدابتورز الأربعة مع بطارية كاملة للـ Primary واختبارات Smoke للأدابتورز الأخرى.',
      evidenceRef: `PG_CONN:${pgHealth.connected} | BATTERY:${batteryPassed} | MYSQL:${mysqlSmoke.passed} | MONGO:${mongoSmoke.passed} | FB:${firebaseSmoke.passed}`,
      version: 'v7.1',
    };

    if (pgHealth.connected && batteryPassed) {
      const logRes = await this.postgres.appendSystemChangeLog(changeLogEntry);
      systemChangeLogged = logRes.success;
    } else {
      // Record in in-memory change log for audit tracking during local dev
      await this.inMemory.appendSystemChangeLog(changeLogEntry);
      systemChangeLogged = true;
    }

    const verdict = pgHealth.connected && batteryPassed
      ? 'Phase 0 مغلقة: Primary = PostgreSQL/Supabase ببطارية كاملة؛ MySQL/Mongo/Firebase = Smoke فقط؛ البطارية الكاملة لكل منها قبل تفعيل شركة على ذلك النوع.'
      : `تعذر الاتصال بـ PostgreSQL / Supabase الأساسي (${pgHealth.error || pgHealth.message}). لا يمكن إغلاق Phase 0 إنتاجياً على InMemory.`;

    return {
      timestamp: new Date().toISOString(),
      primaryAdapter: {
        name: this.postgres.adapterName,
        connected: pgHealth.connected,
        batteryPassed,
        steps: batterySteps,
        persistenceVerified,
      },
      smokeResults: {
        mysql: mysqlSmoke,
        mongodb: mongoSmoke,
        firebase: firebaseSmoke,
      },
      inMemoryDeclared: true,
      secretsSummary: {
        defined: definedSecrets,
        missing: missingSecrets,
      },
      systemChangeLogged,
      verdict,
    };
  }
}
