import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

vi.unmock('firebase/app');
vi.unmock('firebase/firestore');

import { initializeTestEnvironment, RulesTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';

describe('Phase 1 (P0): Real Firestore Rules Tests for Inventory Balances', () => {
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

    // Seed users into /users collection with bypass rules for auth context
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      
      // User 1: Storekeeper in comp-1
      await setDoc(doc(db, 'users', 'user-comp1-storekeeper'), {
        id: 'user-comp1-storekeeper',
        name: 'Comp1 Storekeeper',
        role: 'Storekeeper',
        company_id: 'comp-1',
        email: 'storekeeper@comp1.com'
      });

      // User 2: Admin in comp-1
      await setDoc(doc(db, 'users', 'user-comp1-admin'), {
        id: 'user-comp1-admin',
        name: 'Comp1 Admin',
        role: 'Admin',
        company_id: 'comp-1',
        email: 'admin@comp1.com'
      });

      // User 3: Admin in comp-2
      await setDoc(doc(db, 'users', 'user-comp2-admin'), {
        id: 'user-comp2-admin',
        name: 'Comp2 Admin',
        role: 'Admin',
        company_id: 'comp-2',
        email: 'admin@comp2.com'
      });
    });
  });

  it('(a) same-company storekeeper write to inventory balances SUCCEEDS', async () => {
    const comp1Ctx = testEnv.authenticatedContext('user-comp1-storekeeper');
    const db = comp1Ctx.firestore();

    const balanceDocRef = doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1');

    await assertSucceeds(
      setDoc(balanceDocRef, {
        balance: 100,
        productId: 'prod-1',
        warehouseId: 'wh-1',
        binId: 'bin-1',
        company_id: 'comp-1',
        updatedAt: new Date().toISOString()
      })
    );
  });

  it('(b) other-company (comp-2) write to comp-1 inventory balances FAILS (cross-tenant write denied)', async () => {
    const comp2Ctx = testEnv.authenticatedContext('user-comp2-admin');
    const db = comp2Ctx.firestore();

    const balanceDocRef = doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1');

    await assertFails(
      setDoc(balanceDocRef, {
        balance: 999,
        productId: 'prod-1',
        warehouseId: 'wh-1',
        binId: 'bin-1',
        company_id: 'comp-1',
        updatedAt: new Date().toISOString()
      })
    );
  });

  it('(c) same-company user read from comp-1 inventory balances SUCCEEDS', async () => {
    // Seed existing balance
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1'), {
        balance: 50,
        productId: 'prod-1',
        warehouseId: 'wh-1',
        binId: 'bin-1',
        company_id: 'comp-1'
      });
    });

    const comp1Ctx = testEnv.authenticatedContext('user-comp1-storekeeper');
    const db = comp1Ctx.firestore();

    const balanceDocRef = doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1');
    const snap = await assertSucceeds(getDoc(balanceDocRef));
    expect(snap.data()?.balance).toBe(50);
  });

  it('(d) other-company (comp-2) read from comp-1 inventory balances FAILS (cross-tenant read denied)', async () => {
    // Seed existing balance
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1'), {
        balance: 50,
        productId: 'prod-1',
        warehouseId: 'wh-1',
        binId: 'bin-1',
        company_id: 'comp-1'
      });
    });

    const comp2Ctx = testEnv.authenticatedContext('user-comp2-admin');
    const db = comp2Ctx.firestore();

    const balanceDocRef = doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1');
    await assertFails(getDoc(balanceDocRef));
  });

  it('(e) unauthenticated read/write to inventory balances FAILS', async () => {
    const unauthCtx = testEnv.unauthenticatedContext();
    const db = unauthCtx.firestore();

    const balanceDocRef = doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1');

    await assertFails(
      setDoc(balanceDocRef, {
        balance: 10,
        productId: 'prod-1',
        warehouseId: 'wh-1',
        company_id: 'comp-1'
      })
    );

    await assertFails(getDoc(balanceDocRef));
  });

  it('(f) same-company storekeeper update existing inventory balance SUCCEEDS', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1'), {
        balance: 50,
        productId: 'prod-1',
        warehouseId: 'wh-1',
        binId: 'bin-1',
        company_id: 'comp-1'
      });
    });

    const comp1Ctx = testEnv.authenticatedContext('user-comp1-storekeeper');
    const db = comp1Ctx.firestore();
    const balanceDocRef = doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1');

    await assertSucceeds(
      updateDoc(balanceDocRef, {
        balance: 75,
        updatedAt: new Date().toISOString()
      })
    );
  });

  it('(g) other-company admin update to comp-1 inventory balance FAILS', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1'), {
        balance: 50,
        productId: 'prod-1',
        warehouseId: 'wh-1',
        binId: 'bin-1',
        company_id: 'comp-1'
      });
    });

    const comp2Ctx = testEnv.authenticatedContext('user-comp2-admin');
    const db = comp2Ctx.firestore();
    const balanceDocRef = doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1');

    await assertFails(
      updateDoc(balanceDocRef, {
        balance: 999
      })
    );
  });

  it('(h) same-company admin delete inventory balance SUCCEEDS', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1'), {
        balance: 50,
        productId: 'prod-1',
        warehouseId: 'wh-1',
        binId: 'bin-1',
        company_id: 'comp-1'
      });
    });

    const comp1AdminCtx = testEnv.authenticatedContext('user-comp1-admin');
    const db = comp1AdminCtx.firestore();
    const balanceDocRef = doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1');

    await assertSucceeds(deleteDoc(balanceDocRef));
  });

  it('(i) other-company admin delete comp-1 inventory balance FAILS', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1'), {
        balance: 50,
        productId: 'prod-1',
        warehouseId: 'wh-1',
        binId: 'bin-1',
        company_id: 'comp-1'
      });
    });

    const comp2Ctx = testEnv.authenticatedContext('user-comp2-admin');
    const db = comp2Ctx.firestore();
    const balanceDocRef = doc(db, 'inventory_balances', 'comp-1', 'items', 'prod-1___wh-1___bin-1');

    await assertFails(deleteDoc(balanceDocRef));
  });
});
