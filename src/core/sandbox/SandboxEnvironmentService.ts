/**
 * @file SandboxEnvironmentService.ts
 * @description Phase 3D: Isolated Training Sandbox Environment Service
 * Provides a completely isolated training environment using InMemoryAdapter.
 * Allows one-click reset/wipe of training ledger without affecting production PostgreSQL.
 */

import { InMemoryAdapter } from '../storage/adapters/InMemoryAdapter';
import { StorageResult, Account, JournalEntry, TenantCompany } from '../storage/StoragePort';

export interface SandboxStatus {
  tenantId: string;
  isSandbox: true;
  adapterType: 'inmemory';
  accountCount: number;
  transactionCount: number;
  totalDebitVolume: number;
  lastResetAt: string;
  isolatedFromProduction: true;
}

export class SandboxEnvironmentService {
  private sandboxAdapter: InMemoryAdapter;
  private readonly sandboxTenantId = 'tenant_sandbox_isolated';
  private lastResetTimestamp: string;

  constructor() {
    this.sandboxAdapter = new InMemoryAdapter();
    this.lastResetTimestamp = new Date().toISOString();
  }

  public getAdapter(): InMemoryAdapter {
    return this.sandboxAdapter;
  }

  public getSandboxTenantId(): string {
    return this.sandboxTenantId;
  }

  /**
   * Initializes training accounts and default trial data in the isolated sandbox.
   */
  public async initializeSandbox(): Promise<StorageResult<SandboxStatus>> {
    const sandboxCompany: TenantCompany = {
      id: this.sandboxTenantId,
      code: 'SANDBOX-001',
      nameAr: 'بيئة التدريب والمحاكاة المعزولة',
      nameEn: 'Isolated Training Sandbox',
      taxNumber: '399999999900003',
      backendConfig: {
        adapterType: 'inmemory',
        connectionRef: 'IN_MEMORY_SANDBOX',
        isolationLevel: 'Dedicated',
      },
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    await this.sandboxAdapter.saveTenant(sandboxCompany, `sbx-init-${Date.now()}`);

    // Seed clean training accounts
    const initialAccounts: Account[] = [
      {
        code: '10101',
        tenantId: this.sandboxTenantId,
        nameAr: 'الصندوق التدريبي التجريبي',
        type: 'ASSET',
        currency: 'SAR',
        debitBalance: 100000,
        creditBalance: 0,
        balance: 100000,
        status: 'ACTIVE',
      },
      {
        code: '10201',
        tenantId: this.sandboxTenantId,
        nameAr: 'البنك التدريبي - الحساب الافتراضي',
        type: 'ASSET',
        currency: 'SAR',
        debitBalance: 250000,
        creditBalance: 0,
        balance: 250000,
        status: 'ACTIVE',
      },
      {
        code: '30101',
        tenantId: this.sandboxTenantId,
        nameAr: 'رأس المال التدريبي للمحاكاة',
        type: 'EQUITY',
        currency: 'SAR',
        debitBalance: 0,
        creditBalance: 350000,
        balance: 350000,
        status: 'ACTIVE',
      },
      {
        code: '50101',
        tenantId: this.sandboxTenantId,
        nameAr: 'مصروفات تدريبية تجريبية',
        type: 'EXPENSE',
        currency: 'SAR',
        debitBalance: 0,
        creditBalance: 0,
        balance: 0,
        status: 'ACTIVE',
      },
    ];

    for (const acc of initialAccounts) {
      await this.sandboxAdapter.saveAccount(this.sandboxTenantId, acc, `sbx-acc-${acc.code}-${Date.now()}`);
    }

    return this.getStatus();
  }

  /**
   * Resets the entire sandbox environment with a single click.
   * Flushes training transactions and restores initial baseline.
   * Guarantees zero writes or calls to production storage.
   */
  public async resetSandbox(): Promise<StorageResult<{ resetCompleted: boolean; messageAr: string; status: SandboxStatus }>> {
    // Re-instantiate in-memory state to ensure zero lingering transactions
    this.sandboxAdapter = new InMemoryAdapter();
    this.lastResetTimestamp = new Date().toISOString();
    await this.initializeSandbox();

    const statusRes = await this.getStatus();

    return {
      success: true,
      data: {
        resetCompleted: true,
        messageAr: 'تم تصفير بيئة التدريب وإعادة ضبط جميع الأرصدة والعمليات الافتراضية بنجاح دون أي مساس بالإنتاج.',
        status: statusRes.data!,
      },
    };
  }

  /**
   * Returns current statistics of the training environment.
   */
  public async getStatus(): Promise<StorageResult<SandboxStatus>> {
    const entriesRes = await this.sandboxAdapter.listJournalEntries(this.sandboxTenantId);
    const entries = entriesRes.data || [];

    const totalDebit = entries.reduce((sum, e) => sum + Number(e.totalAmount || 0), 0);

    return {
      success: true,
      data: {
        tenantId: this.sandboxTenantId,
        isSandbox: true,
        adapterType: 'inmemory',
        accountCount: 4,
        transactionCount: entries.length,
        totalDebitVolume: totalDebit,
        lastResetAt: this.lastResetTimestamp,
        isolatedFromProduction: true,
      },
    };
  }
}
