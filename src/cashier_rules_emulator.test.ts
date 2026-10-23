import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

vi.unmock('firebase/app');
vi.unmock('firebase/firestore');

import { initializeTestEnvironment, RulesTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';

describe('Phase 2 (P0): Real Firestore Rules Tests for Cashier / POS & Expenses & Vouchers', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'custodyflow',
      firestore: {
        rules: fs.readFileSync('firestore.rules', 'utf8'),
        host: '127.0.0.1',
        port: 8085,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();

    // Seed users with different roles across tenants
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // Comp 1 Cashier / User
      await setDoc(doc(db, 'users', 'user-comp1-cashier'), {
        id: 'user-comp1-cashier',
        name: 'Comp1 Cashier',
        role: 'Cashier',
        company_id: 'comp-1',
        org_unit_id: 'branch-comp1-1',
        station_id: 'st-comp1-1',
        email: 'cashier@comp1.com'
      });

      // Comp 1 Accountant
      await setDoc(doc(db, 'users', 'user-comp1-accountant'), {
        id: 'user-comp1-accountant',
        name: 'Comp1 Accountant',
        role: 'Accountant',
        company_id: 'comp-1',
        email: 'accountant@comp1.com'
      });

      // Comp 1 Admin
      await setDoc(doc(db, 'users', 'user-comp1-admin'), {
        id: 'user-comp1-admin',
        name: 'Comp1 Admin',
        role: 'Admin',
        company_id: 'comp-1',
        email: 'admin@comp1.com'
      });

      // Comp 2 Cashier
      await setDoc(doc(db, 'users', 'user-comp2-cashier'), {
        id: 'user-comp2-cashier',
        name: 'Comp2 Cashier',
        role: 'Cashier',
        company_id: 'comp-2',
        email: 'cashier@comp2.com'
      });
    });
  });

  describe('1. POS Transactions (/pos_transactions/{id})', () => {
    it('same-company cashier write and read pos_transactions SUCCEEDS', async () => {
      const cashierCtx = testEnv.authenticatedContext('user-comp1-cashier');
      const db = cashierCtx.firestore();
      const posDocRef = doc(db, 'pos_transactions', 'pos-tx-1');

      await assertSucceeds(
        setDoc(posDocRef, {
          company_id: 'comp-1',
          org_unit_id: 'branch-comp1-1',
          receiptNo: 'REC-001',
          grandTotal: 500,
          cashier: 'user-comp1-cashier',
          timestamp: new Date().toISOString()
        })
      );

      const snap = await assertSucceeds(getDoc(posDocRef));
      expect(snap.exists()).toBe(true);
      expect(snap.data()?.grandTotal).toBe(500);
    });

    it('cross-tenant cashier write and read pos_transactions FAILS', async () => {
      const comp2Ctx = testEnv.authenticatedContext('user-comp2-cashier');
      const db = comp2Ctx.firestore();
      const posDocRef = doc(db, 'pos_transactions', 'pos-tx-1');

      // Attempt cross-tenant write
      await assertFails(
        setDoc(posDocRef, {
          company_id: 'comp-1',
          receiptNo: 'REC-EVIL',
          grandTotal: 999
        })
      );

      // Seed valid doc
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'pos_transactions', 'pos-tx-valid'), {
          company_id: 'comp-1',
          grandTotal: 250
        });
      });

      // Attempt cross-tenant read
      await assertFails(getDoc(doc(db, 'pos_transactions', 'pos-tx-valid')));
    });
  });

  describe('2. Cash Vouchers (/CashVouchers/{id})', () => {
    it('same-company user can create and read CashVouchers in their org unit', async () => {
      const cashierCtx = testEnv.authenticatedContext('user-comp1-cashier');
      const db = cashierCtx.firestore();
      const voucherRef = doc(db, 'CashVouchers', 'cv-001');

      await assertSucceeds(
        setDoc(voucherRef, {
          company_id: 'comp-1',
          org_unit_id: 'branch-comp1-1',
          station_id: 'st-comp1-1',
          voucher_no: 'V-001',
          amount: 1500,
          createdAt: new Date().toISOString()
        })
      );

      const snap = await assertSucceeds(getDoc(voucherRef));
      expect(snap.data()?.amount).toBe(1500);
    });

    it('cross-tenant user cannot read or write CashVouchers', async () => {
      const comp2Ctx = testEnv.authenticatedContext('user-comp2-cashier');
      const db = comp2Ctx.firestore();

      await assertFails(
        setDoc(doc(db, 'CashVouchers', 'cv-cross'), {
          company_id: 'comp-1',
          amount: 500
        })
      );
    });
  });

  describe('3. Expenses (/Expenses/{id})', () => {
    it('same-company accountant can create and update Expenses', async () => {
      const accountantCtx = testEnv.authenticatedContext('user-comp1-accountant');
      const db = accountantCtx.firestore();
      const expRef = doc(db, 'Expenses', 'exp-001');

      await assertSucceeds(
        setDoc(expRef, {
          company_id: 'comp-1',
          amount: 350,
          category: 'fuel',
          createdAt: new Date().toISOString()
        })
      );

      await assertSucceeds(
        updateDoc(expRef, {
          amount: 400
        })
      );
    });

    it('same-company admin can delete Expenses, while regular non-admin cannot', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'Expenses', 'exp-del-1'), {
          company_id: 'comp-1',
          amount: 100
        });
      });

      const cashierCtx = testEnv.authenticatedContext('user-comp1-cashier');
      const cashierDb = cashierCtx.firestore();
      await assertFails(deleteDoc(doc(cashierDb, 'Expenses', 'exp-del-1')));

      const adminCtx = testEnv.authenticatedContext('user-comp1-admin');
      const adminDb = adminCtx.firestore();
      await assertSucceeds(deleteDoc(doc(adminDb, 'Expenses', 'exp-del-1')));
    });

    it('cross-tenant user cannot read or write Expenses', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'Expenses', 'exp-comp1'), {
          company_id: 'comp-1',
          amount: 200
        });
      });

      const comp2Ctx = testEnv.authenticatedContext('user-comp2-cashier');
      const db = comp2Ctx.firestore();

      await assertFails(getDoc(doc(db, 'Expenses', 'exp-comp1')));
      await assertFails(
        setDoc(doc(db, 'Expenses', 'exp-cross'), {
          company_id: 'comp-1',
          amount: 999
        })
      );
    });
  });
});
