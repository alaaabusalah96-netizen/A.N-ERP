import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.unmock('firebase/app');
vi.unmock('firebase/firestore');

import { initializeTestEnvironment, RulesTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import { doc, setDoc, getDoc } from 'firebase/firestore';

describe('Phase 0: Firebase Emulator Verification', () => {
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

  it('proves emulator works with one trivial write/read test doc (unauthenticated or authenticated)', async () => {
    // Using withSecurityRulesDisabled or authenticated context to test Firestore Emulator read/write
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const testRef = doc(db, 'system_health', 'emulator_check');
      await setDoc(testRef, {
        status: 'online',
        timestamp: new Date().toISOString(),
        testedBy: 'phase0_baseline'
      });

      const snap = await getDoc(testRef);
      expect(snap.exists()).toBe(true);
      expect(snap.data()?.status).toBe('online');
      expect(snap.data()?.testedBy).toBe('phase0_baseline');
    });
  });
});
