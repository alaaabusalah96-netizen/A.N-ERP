/**
 * @file runPrimaryBattery.ts
 * @description Executes Primary Battery only (PostgreSQL/Supabase)
 * Tests:
 * 1. Health check & DB connection
 * 2. Schema initialization (Code-First DDL)
 * 3. Atomic posting of balanced journal entry via PostingEngine
 * 4. Idempotency verification (preventing double posting / duplicate balance impact)
 * 5. Persistence verification after connection re-initialization (close pool + open new pool)
 * 6. SystemChangeLog recording on Postgres upon success
 * CRITICAL: Zero secret leakage in all logs and outputs.
 */

import dotenv from 'dotenv';
dotenv.config();

import { PostgresPrimaryAdapter } from '../storage/adapters/PostgresPrimaryAdapter';
import { PostingEngine } from '../engines/PostingEngine';
import { NumberingEngine } from '../engines/NumberingEngine';
import { TenantCompany, Account, JournalEntry } from '../storage/StoragePort';

export interface BatteryRunOutput {
  databaseUrlDefined: boolean;
  overallPassed: boolean;
  steps: {
    name: string;
    passed: boolean;
    details: string;
  }[];
  errorMessage?: string;
  systemChangeLogRecorded: boolean;
  timestamp: string;
}

export async function executePrimaryBattery(): Promise<BatteryRunOutput> {
  const isDefined = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
  const steps: { name: string; passed: boolean; details: string }[] = [];
  let adapter = new PostgresPrimaryAdapter();
  let overallPassed = false;
  let systemChangeLogRecorded = false;
  let errorMessage: string | undefined;

  // 1. Connection Health
  const health = await adapter.checkHealth();
  steps.push({
    name: 'الاتصال بقاعدة بيانات PostgreSQL / Supabase',
    passed: health.connected,
    details: health.connected ? 'تم الاتصال بنجاح بقاعدة البيانات' : (health.error || health.message),
  });

  if (!health.connected) {
    errorMessage = health.error || health.message;
    await adapter.close();
    return {
      databaseUrlDefined: isDefined,
      overallPassed: false,
      steps,
      errorMessage,
      systemChangeLogRecorded: false,
      timestamp: new Date().toISOString(),
    };
  }

  try {
    // 2. Init Schema
    const initRes = await adapter.initializeSchema();
    steps.push({
      name: 'تهيئة مخطط الجداول Code-First (Init Schema)',
      passed: initRes.success,
      details: initRes.success ? 'تم تطبيق واستقرار كافة الجداول والفهارس بنجاح' : (initRes.error?.detail || 'فشل تهيئة المخطط'),
    });

    if (!initRes.success) {
      throw new Error(initRes.error?.detail || 'فشل إنشاء المخطط');
    }

    // 3. Setup Test Tenant & Accounts
    const tenantId = `tenant-battery-${Date.now()}`;
    const testTenant: TenantCompany = {
      id: tenantId,
      code: `CMP-${Date.now().toString().slice(-4)}`,
      nameAr: 'شركة الاختبار التشغيلي المالي',
      nameEn: 'Operational Financial Test Co.',
      taxNumber: '300999999900003',
      backendConfig: {
        adapterType: 'postgresql',
        connectionRef: 'DATABASE_URL',
        isolationLevel: 'Shared',
      },
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    await adapter.saveTenant(testTenant, `idemp-tenant-${tenantId}`);

    const accCash: Account = {
      code: '101001',
      tenantId,
      nameAr: 'الصندوق المالي العام',
      type: 'ASSET',
      currency: 'SAR',
      debitBalance: 100000,
      creditBalance: 0,
      isActive: true,
    };
    const accExpense: Account = {
      code: '501001',
      tenantId,
      nameAr: 'مصروفات تشغيلية معتمدة',
      type: 'EXPENSE',
      currency: 'SAR',
      debitBalance: 0,
      creditBalance: 0,
      isActive: true,
    };
    await adapter.saveAccount(tenantId, accCash, `idemp-acc-c-${tenantId}`);
    await adapter.saveAccount(tenantId, accExpense, `idemp-acc-e-${tenantId}`);

    // 4. Posting Engine Balanced Journal Entry
    const postingEngine = new PostingEngine(adapter);
    const numberingEngine = new NumberingEngine(adapter);

    const seqRes = await numberingEngine.generateNumber(tenantId, 'JV_BATTERY', 'JV-BAT', `seq-${tenantId}`);
    const voucherCode = seqRes.data?.formattedCode || `JV-BAT-${Date.now()}`;

    const journalEntry: JournalEntry = {
      id: `ENTRY-${Date.now()}`,
      code: voucherCode,
      tenantId,
      date: new Date().toISOString().split('T')[0],
      type: 'قيد يومية تسوية',
      description: 'سند تسوية واختبار بطارية ترحيل وتوازن النواة',
      lines: [
        {
          id: `L1-${Date.now()}`,
          accountCode: accExpense.code,
          debit: 15000,
          credit: 0,
          description: 'إثبات مصروف صيانة تشغيلية',
        },
        {
          id: `L2-${Date.now()}`,
          accountCode: accCash.code,
          debit: 0,
          credit: 15000,
          description: 'صرف مقابل المصروف من الصندوق',
        },
      ],
      totalAmount: 15000,
      status: 'APPROVED',
      createdBy: 'SYS_BATTERY_RUNNER',
    };

    const draftRes = await postingEngine.draftEntry(tenantId, journalEntry, `draft-${journalEntry.id}`);
    const postIdempotencyKey = `post-idemp-${journalEntry.id}`;
    const postRes = await postingEngine.postEntry(tenantId, journalEntry.id, postIdempotencyKey);

    const postPassed = postRes.success && postRes.data?.status === 'POSTED';
    steps.push({
      name: 'ترحيل قيد يومية متوازن وتحديث الأرصدة عبر PostingEngine',
      passed: postPassed,
      details: postPassed ? `تم الترحيل الذري بنجاح للسند ${voucherCode} وتحديث الدفاتر` : (postRes.error?.detail || 'فشل الترحيل'),
    });

    if (!postPassed) {
      throw new Error(postRes.error?.detail || 'فشل الترحيل المحاسبي');
    }

    // 5. Idempotency Check: Re-send with identical key
    const duplicatePostRes = await postingEngine.postEntry(tenantId, journalEntry.id, postIdempotencyKey);
    const cashAccAfter = await adapter.getAccount(tenantId, accCash.code);

    // Credit balance must remain exactly 15000, not double to 30000!
    const idempotencyPassed = duplicatePostRes.success && cashAccAfter.data?.creditBalance === 15000;
    steps.push({
      name: 'منع التكرار وحماية الأرصدة (Idempotency Key Check)',
      passed: idempotencyPassed,
      details: idempotencyPassed
        ? 'تم التحقق بنجاح: إعادة إرسال نفس المفتاح أرجع النتيجة السابقة دون تكرار الأثر المحاسبي'
        : 'فشل اختبار Idempotency: تضاعف الأثر أو تغيّرت نتيجة الطلب',
    });

    if (!idempotencyPassed) {
      throw new Error('فشل التحقق من Idempotency');
    }

    // 6. Persistence & Re-connection Check (Close pool, instantiate fresh adapter, query DB)
    await adapter.close();

    // Re-instantiate adapter to ensure clean network connection and test database persistence
    const reconnectedAdapter = new PostgresPrimaryAdapter();
    const persistedEntry = await reconnectedAdapter.getJournalEntry(tenantId, journalEntry.id);
    const persistedAcc = await reconnectedAdapter.getAccount(tenantId, accCash.code);

    const persistencePassed =
      persistedEntry.success &&
      persistedEntry.data?.id === journalEntry.id &&
      persistedEntry.data?.status === 'POSTED' &&
      persistedAcc.success &&
      persistedAcc.data?.creditBalance === 15000;

    steps.push({
      name: 'استمرارية البيانات بعد إعادة تهيئة الاتصال (Persistence Check)',
      passed: persistencePassed,
      details: persistencePassed
        ? 'تم إغلاق مجمع الاتصالات بالكامل ثم إعادة فتحه وقراءة القيد والأرصدة بنجاح وتطابق تام'
        : 'فشل استرجاع السجلات بعد إعادة الاتصال',
    });

    if (!persistencePassed) {
      throw new Error('فشل التحقق من بقاء واستمرارية البيانات');
    }

    // 7. SystemChangeLog Recording on Postgres
    const changeLog = {
      id: `CHG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'System Architect / Primary Battery Runner',
      changeType: 'PHASE_CLOSURE' as const,
      module: 'POSTGRES_PRIMARY',
      entitiesAffected: ['an_tenants', 'an_accounts', 'an_journal_entries', 'an_idempotency_keys', 'PostingEngine'],
      summaryAr: 'اجتياز بطارية اعتماد PostgreSQL الأساسية بنجاح تام: تهيئة المخطط، ترحيل قيد متوازن، منع التكرار، واستمرارية البيانات بعد إعادة تهيئة الاتصال.',
      evidenceRef: `VOUCHER:${voucherCode} | IDEMP:${postIdempotencyKey} | TENANT:${tenantId}`,
      version: 'v7.1',
    };

    const logRes = await reconnectedAdapter.appendSystemChangeLog(changeLog);
    systemChangeLogRecorded = logRes.success;

    steps.push({
      name: 'تسجيل قيد الاعتماد في سجل التغييرات غير القابل للتعديل (SystemChangeLog)',
      passed: systemChangeLogRecorded,
      details: systemChangeLogRecorded ? `تم التوثيق في جدول an_system_changelog برقم ${changeLog.id}` : 'فشل التسجيل في سجل التغييرات',
    });

    await reconnectedAdapter.close();
    overallPassed = steps.every((s) => s.passed);
  } catch (err: any) {
    overallPassed = false;
    errorMessage = err.message || 'حدث خطأ أثناء تشغيل البطارية';
  }

  return {
    databaseUrlDefined: isDefined,
    overallPassed,
    steps,
    errorMessage,
    systemChangeLogRecorded,
    timestamp: new Date().toISOString(),
  };
}
