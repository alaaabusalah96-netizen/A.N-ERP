import { describe, it, expect, beforeEach } from 'vitest';
import { TransactionsUpdateModule } from './db/transactions.update';
import { TransactionsVoucherModule } from './db/transactions.voucher';
import { InventoryModule } from './db/inventory';
import { AccountingBusinessEngine } from './lib/enterprise/accounting_engine';
import { StorageEngine } from './db/storage';
import { DEFAULT_USERS } from './db/defaults';
import { CashVoucher } from './types';
import { InventoryDocument } from './types/inventory';
import { JournalEntry } from './types/accounting';

/**
 * [Architectural & Testing Scope Note - Phase 3.2 Test Hardening]
 * Note on Concurrency Testing Boundary:
 * This test suite validates optimistic locking and version increment logic at the local
 * StorageEngine level (in-memory/localStorage). It simulates race conditions and stale
 * version rejections according to the application's domain logic.
 * 
 * IMPORTANT: This does NOT test real Firestore `runTransaction` atomic isolation or
 * cloud network-level contention. When deploying to production Firestore, actual concurrency
 * guarantees depend on Firestore security rules and atomic server-side/client SDK transactions.
 */
describe('Phase 6: Optimistic Locking Enforcement Unit Tests', () => {
  beforeEach(() => {
    (navigator as any).onLine = true;
    const sysAdminUser = { ...DEFAULT_USERS[0], company_id: 'comp-1' };
    StorageEngine.setStored('active_user', sysAdminUser);
    StorageEngine.setStored('categories', [{ id: 'cat-6', name_ar: 'عام', name_en: 'General' }]);
    StorageEngine.setStored('stations', [{ id: 'stn-1', name: 'Station 1', company_id: 'comp-1', custody_amount: 10000 }]);
    StorageEngine.setStored('companies', [{ id: 'comp-1', name: 'Company 1', name_ar: 'الشركة', name_en: 'Company' }]);
    StorageEngine.setStored('selected_company_id', 'comp-1');
  });

  describe('1. Custody & Voucher Concurrency Control', () => {
    it('should allow normal sequential updates and increment version', async () => {
      const initialTx = {
        id: 'tx-occ-1',
        transaction_no: 'TX-2026-9001',
        date: new Date().toISOString().split('T')[0],
        description: 'Test expense',
        category_id: 'cat-6',
        station_id: 'stn-1',
        company_id: 'comp-1',
        amount: 500,
        status: 'Pending' as const,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: { version: 1, tenantId: 'comp-1', organizationId: 'comp-1', created_at: '', created_by: '' }
      };

      StorageEngine.setStored('transactions', [initialTx]);

      // Update 1: version 1 -> version 2
      const res1 = await TransactionsUpdateModule.updateTransaction('tx-occ-1', {
        amount: 600,
        metadata: { version: 1 } as any
      });
      expect(res1.success).toBe(true);

      const txsAfter1 = StorageEngine.getStored<any[]>('transactions', []);
      const updatedTx1 = txsAfter1.find(t => t.id === 'tx-occ-1');
      expect(updatedTx1.amount).toBe(600);
      expect(updatedTx1.metadata.version).toBe(2);
    });

    it('should reject a second update based on stale version with business conflict error', async () => {
      const initialTx = {
        id: 'tx-occ-2',
        transaction_no: 'TX-2026-9002',
        date: new Date().toISOString().split('T')[0],
        description: 'Stale expense test',
        category_id: 'cat-6',
        station_id: 'stn-1',
        company_id: 'comp-1',
        amount: 1000,
        status: 'Pending' as const,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: { version: 1, tenantId: 'comp-1', organizationId: 'comp-1', created_at: '', created_by: '' }
      };

      StorageEngine.setStored('transactions', [initialTx]);

      // User A reads version 1
      const userARead = { ...initialTx };
      // User B reads version 1
      const userBRead = { ...initialTx };

      // User A submits update first (version 1 -> version 2)
      const resA = await TransactionsUpdateModule.updateTransaction(userARead.id, {
        amount: 1200,
        metadata: { version: userARead.metadata.version } as any
      });
      expect(resA.success).toBe(true);

      // User B attempts to submit update based on stale version 1
      const resB = await TransactionsUpdateModule.updateTransaction(userBRead.id, {
        amount: 1500,
        metadata: { version: userBRead.metadata.version } as any
      });

      expect(resB.success).toBe(false);
      expect(resB.errors?.[0]).toContain('This transaction has been modified by another user');

      // Verify transaction preserved User A's update and version remains 2
      const txsFinal = StorageEngine.getStored<any[]>('transactions', []);
      const finalTx = txsFinal.find(t => t.id === 'tx-occ-2');
      expect(finalTx.amount).toBe(1200);
      expect(finalTx.metadata.version).toBe(2);
    });

    it('should reject CashVoucher updates if expected version is stale', async () => {
      const voucher: CashVoucher = {
        id: 'cv-occ-1',
        voucher_no: 'VOUCH-2026-001',
        date: '2026-07-29',
        station_id: 'stn-1',
        company_id: 'comp-1',
        amount: 250,
        amount_in_words: { ar: 'مائتان وخمسون جنيه', en: 'Two hundred fifty EGP' },
        recipient_name: 'Ahmed',
        status: 'Draft',
        expense_ids: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await TransactionsVoucherModule.saveCashVoucher(voucher); // version = 1

      const created = TransactionsVoucherModule.getCashVouchers().find(v => v.id === 'cv-occ-1');
      expect((created as any).version).toBe(1);

      // Save update with matching version (1)
      await TransactionsVoucherModule.saveCashVoucher({ ...created!, amount: 300 }, 1);
      const updated = TransactionsVoucherModule.getCashVouchers().find(v => v.id === 'cv-occ-1');
      expect((updated as any).version).toBe(2);

      // Attempt save with stale expected version (1 instead of 2)
      await expect(
        TransactionsVoucherModule.saveCashVoucher({ ...updated!, amount: 400 }, 1)
      ).rejects.toThrow('modified by another user');
    });
  });

  describe('2. Inventory Document Concurrency Control', () => {
    it('should reject updateInventoryDocument if expected version does not match', async () => {
      const doc: InventoryDocument = {
        id: 'inv-doc-occ-1',
        company_id: 'comp-1',
        doc_no: 'REC-2026-9001',
        doc_type: 'Receipt',
        status: 'Draft',
        source_warehouse_id: 'wh-1',
        dest_entity_id: 'wh-1',
        date: '2026-07-29',
        items: [],
        tenantId: 'comp-1',
        organizationId: 'comp-1',
        created_at: new Date().toISOString(),
        created_by: 'user-1',
        version: 1
      };

      StorageEngine.setStored('inventory_documents', [doc]);

      // Normal update with expectedVersion 1
      await InventoryModule.updateInventoryDocument('inv-doc-occ-1', { notes: 'Updated notes' }, 1);
      const docsAfter = StorageEngine.getStored<InventoryDocument[]>('inventory_documents', []);
      expect(docsAfter[0].version).toBe(2);

      // Stale update attempt with version 1 (now current version is 2)
      await expect(async () => {
        await InventoryModule.updateInventoryDocument('inv-doc-occ-1', { notes: 'Stale update' }, 1);
      }).rejects.toThrow('modified by another user');
    });

    it('should reject triggerLifecycleTransition if expected version is stale', async () => {
      const doc: InventoryDocument = {
        id: 'inv-doc-occ-2',
        company_id: 'comp-1',
        doc_no: 'REC-2026-9002',
        doc_type: 'Receipt',
        status: 'Draft',
        source_warehouse_id: 'wh-1',
        dest_entity_id: 'wh-1',
        date: '2026-07-29',
        items: [],
        tenantId: 'comp-1',
        organizationId: 'comp-1',
        created_at: new Date().toISOString(),
        created_by: 'user-1',
        version: 3
      };

      StorageEngine.setStored('inventory_documents', [doc]);

      // Attempt transition with stale expected version 2
      const res = await InventoryModule.triggerLifecycleTransition('inv-doc-occ-2', 'Submit', 2);
      expect(res.success).toBe(false);
      expect(res.messageEn).toContain('modified by another user');
    });
  });

  describe('3. Accounting Journal Entry Concurrency Control', () => {
    it('should reject saveJournalEntries when updating with stale version', async () => {
      const je: JournalEntry = {
        id: 'je-occ-1',
        company_id: 'comp-1',
        entryNumber: 'JE-2026-9001',
        date: '2026-07-29',
        sourceType: 'MANUAL',
        statementAr: 'قيد تجريبي',
        statementEn: 'Test Journal Entry',
        lines: [],
        totalDebit: 100,
        totalCredit: 100,
        metadata: {
          tenantId: 'comp-1',
          organizationId: 'comp-1',
          created_at: new Date().toISOString(),
          created_by: 'user-1',
          version: 1
        }
      };

      // Save initial entry
      await AccountingBusinessEngine.saveJournalEntries([je]);
      const entries1 = StorageEngine.getStored<JournalEntry[]>('journal_entries', []);
      expect(entries1[0].metadata.version).toBe(1);

      // Save update with version 1 (bumps to 2)
      await AccountingBusinessEngine.saveJournalEntries([je], { 'je-occ-1': 1 });
      const entries2 = StorageEngine.getStored<JournalEntry[]>('journal_entries', []);
      expect(entries2[0].metadata.version).toBe(2);

      // Save update with stale version 1
      await expect(
        AccountingBusinessEngine.saveJournalEntries([je], { 'je-occ-1': 1 })
      ).rejects.toThrow('modified by another user');
    });
  });
});
