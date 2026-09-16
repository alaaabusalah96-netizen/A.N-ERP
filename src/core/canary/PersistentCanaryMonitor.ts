/**
 * @file PersistentCanaryMonitor.ts
 * @description Phase 3G: Persistent Canary Sentinel Tenant & Intrusion Detector
 * Maintains a live sentinel tenant in production with synthetic tripwire balances.
 * Executes simulated cross-tenant boundary probes and triggers CRITICAL alerts upon breach.
 */

import { StoragePort, StorageResult, TenantCompany, Account, JournalEntry } from '../storage/StoragePort';

export interface CanaryProbeReport {
  timestamp: string;
  canaryTenantId: string;
  allProbesBlocked: boolean;
  probesExecutedCount: number;
  breachDetected: boolean;
  securityStatus: 'SECURE_ISOLATED' | 'CRITICAL_BREACH_DETECTED';
  probeDetails: Array<{
    probeId: string;
    descriptionAr: string;
    attemptedAction: string;
    blocked: boolean;
    evidence: string;
  }>;
}

export class PersistentCanaryMonitor {
  private readonly port: StoragePort;
  public static readonly CANARY_TENANT_ID = 'tenant_canary_sentinel';
  public static readonly CANARY_SECRET_ACCOUNT = '999901';

  constructor(port: StoragePort) {
    this.port = port;
  }

  /**
   * Initializes the persistent canary tenant with tripwire financial records.
   */
  public async ensureCanaryTenantInitialized(): Promise<StorageResult<TenantCompany>> {
    const canaryTenant: TenantCompany = {
      id: PersistentCanaryMonitor.CANARY_TENANT_ID,
      code: 'CANARY-SENTINEL-99',
      nameAr: 'مستأجر الرصد الأمني الدائم (Canary Sentinel)',
      nameEn: 'Permanent Security Canary Sentinel',
      taxNumber: '399999999999993',
      backendConfig: {
        adapterType: 'postgresql',
        connectionRef: 'DATABASE_URL',
        isolationLevel: 'Shared',
      },
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    await this.port.saveTenant(canaryTenant, `canary-tenant-init-${Date.now()}`);

    // Seed tripwire account
    const tripwireAccount: Account = {
      code: PersistentCanaryMonitor.CANARY_SECRET_ACCOUNT,
      tenantId: PersistentCanaryMonitor.CANARY_TENANT_ID,
      nameAr: 'حساب الرصد المشفر - مصيدة الاختراق',
      type: 'ASSET',
      currency: 'SAR',
      debitBalance: 999999,
      creditBalance: 0,
      balance: 999999,
      status: 'ACTIVE',
    };

    await this.port.saveAccount(
      PersistentCanaryMonitor.CANARY_TENANT_ID,
      tripwireAccount,
      `canary-acc-init-${Date.now()}`
    );

    return { success: true, data: canaryTenant };
  }

  /**
   * Runs automated cross-tenant intrusion probes simulating malicious IDOR attacks.
   */
  public async executeIntrusionProbes(foreignTenantId: string): Promise<CanaryProbeReport> {
    await this.ensureCanaryTenantInitialized();

    const details: CanaryProbeReport['probeDetails'] = [];
    let breachDetected = false;

    // Probe 1: Foreign tenant attempts to read Canary's confidential account
    const probe1Res = await this.port.getAccount(
      foreignTenantId,
      PersistentCanaryMonitor.CANARY_SECRET_ACCOUNT
    );

    const probe1Blocked = !probe1Res.success || !probe1Res.data;
    if (!probe1Blocked) {
      breachDetected = true;
    }
    details.push({
      probeId: 'CANARY-P1-ACCOUNT-IDOR',
      descriptionAr: 'محاولة مستأجر أجنبي قراءة حساب المصيدة السري الخاص بمستأجر الكناري',
      attemptedAction: `getAccount(${foreignTenantId}, '${PersistentCanaryMonitor.CANARY_SECRET_ACCOUNT}')`,
      blocked: probe1Blocked,
      evidence: probe1Blocked
        ? 'تم الحجب بنجاح: الحساب غير موجود في نطاق المستأجر الطالب (404 Not Found)'
        : 'اختراق أمني حرج: تم تسريب بيانات حساب الكناري لمستأجر آخر!',
    });

    // Probe 2: Foreign tenant attempts to read Canary's journal entries
    const probe2Res = await this.port.listJournalEntries(foreignTenantId);
    const foreignEntries = probe2Res.data || [];
    const leakedCanaryEntries = foreignEntries.filter(
      (e) => e.tenantId === PersistentCanaryMonitor.CANARY_TENANT_ID
    );

    const probe2Blocked = leakedCanaryEntries.length === 0;
    if (!probe2Blocked) {
      breachDetected = true;
    }
    details.push({
      probeId: 'CANARY-P2-JOURNAL-LEAK',
      descriptionAr: 'محاولة فحص تسريب قيود مستأجر الكناري في قائمة قيود المستأجر الطالب',
      attemptedAction: `listJournalEntries(${foreignTenantId}) filtering for canary entries`,
      blocked: probe2Blocked,
      evidence: probe2Blocked
        ? 'تم الحجب بنجاح: صفر قيود متسربة من مستأجر الكناري'
        : `اختراق أمني حرج: تم تسريب ${leakedCanaryEntries.length} قيد لمستأجر الكناري!`,
    });

    // Probe 3: Cross-tenant ledger posting injection
    const maliciousEntry: JournalEntry = {
      id: `jv-malicious-cross-${Date.now()}`,
      code: 'JV-ATTACK-001',
      tenantId: PersistentCanaryMonitor.CANARY_TENANT_ID, // Maliciously forged tenant ID
      date: new Date().toISOString().split('T')[0],
      type: 'DAILY_VOUCHER',
      description: 'محاولة حقن قيد غير مصرح به في دفتر الكناري',
      totalAmount: 5000,
      status: 'DRAFT',
      createdBy: 'malicious_user',
      lines: [
        { id: '1', accountCode: PersistentCanaryMonitor.CANARY_SECRET_ACCOUNT, debit: 5000, credit: 0, description: 'دبت' },
        { id: '2', accountCode: '110101', debit: 0, credit: 5000, description: 'كريدت' },
      ],
    };

    // Attempt writing with foreign tenant context
    const probe3Res = await this.port.withTenantScope(foreignTenantId, async () => {
      return this.port.createJournalEntry(foreignTenantId, maliciousEntry, `atk-${Date.now()}`);
    });

    // It must either fail or be scoped strictly to foreignTenantId without polluting canary
    const canaryEntriesAfter = (await this.port.listJournalEntries(PersistentCanaryMonitor.CANARY_TENANT_ID)).data || [];
    const injected = canaryEntriesAfter.some((e) => e.id === maliciousEntry.id);
    const probe3Blocked = !injected;

    if (!probe3Blocked) {
      breachDetected = true;
    }
    details.push({
      probeId: 'CANARY-P3-POSTING-TAMPERING',
      descriptionAr: 'محاولة حقن وتعديل قيود مستأجر الكناري عبر اتصال مستأجر آخر',
      attemptedAction: `createJournalEntry into canary tenant from foreign context`,
      blocked: probe3Blocked,
      evidence: probe3Blocked
        ? 'تم الحجب بنجاح: دفتر مستأجر الكناري محمي تماماً من التعديل عبر حدود المستأجرين'
        : 'اختراق أمني حرج: تمكن المستأجر من تعديل بيانات دفتر الكناري!',
    });

    if (breachDetected) {
      await this.port.appendSystemChangeLog({
        id: `SCL-CANARY-ALERT-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: 'PersistentCanaryMonitor',
        changeType: 'CANARY_ALERT',
        module: 'SECURITY_CANARY',
        entitiesAffected: [PersistentCanaryMonitor.CANARY_TENANT_ID, foreignTenantId],
        summaryAr: 'إنذار أمني حرج (CRITICAL): اكتشاف محاولة اختراق أو تسريب لحدود المستأجرين!',
        beforeState: { status: 'SECURE' },
        afterState: { status: 'BREACH_DETECTED', details },
        evidenceRef: 'CANARY-SENTINEL-TRIPWIRE',
        version: 'v7.2',
      });
    }

    return {
      timestamp: new Date().toISOString(),
      canaryTenantId: PersistentCanaryMonitor.CANARY_TENANT_ID,
      allProbesBlocked: !breachDetected,
      probesExecutedCount: details.length,
      breachDetected,
      securityStatus: breachDetected ? 'CRITICAL_BREACH_DETECTED' : 'SECURE_ISOLATED',
      probeDetails: details,
    };
  }
}
